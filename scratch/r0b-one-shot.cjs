// R0-B 测试一次性契约升级：U04 唯一认领覆盖席位后的新契约
const fs = require("fs");
const p = "src/app/api/__tests__/r0b-seat-addon.test.ts";
let src = fs.readFileSync(p, "utf8");
const nl = src.includes("\r\n") ? "\r\n" : "\n";
let lines = src.split(nl);

/** 括号匹配收集一个 fulfillPaidOrder({...}) 调用块（含跨行） */
function collectBlock(lines, startIdx) {
  const block = [lines[startIdx]];
  let depth = (lines[startIdx].match(/{/g) || []).length - (lines[startIdx].match(/}/g) || []).length;
  let j = startIdx + 1;
  while (depth > 0 && j < lines.length) {
    block.push(lines[j]);
    depth += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
    j++;
  }
  return { block, end: j - 1 };
}

// ── 第 1 步：给期望履约的 REAL 调用补交易号（豁免：null/2601 金额、status:st、expired:true 上下文） ──
const out = [];
let i = 0;
const exemptLines = new Set();
// 预先标记豁免用例的行范围（it 块内含特征 → 该 it 内的调用豁免）
let curExempt = false;
for (let k = 0; k < lines.length; k++) {
  const l = lines[k];
  if (/^describe\(|^\s*it\(/.test(l.trim())) {
    curExempt = /status: st|expired: true|状态 \$\{st\}/.test(l);
  }
  if (curExempt) exemptLines.add(k);
  if (l.trim().startsWith("});")) curExempt = false;
}
while (i < lines.length) {
  const l = lines[i];
  if (l.includes("fulfillPaidOrder(") && l.includes("{")) {
    const { block, end } = collectBlock(lines, i);
    const text = block.join("\n");
    const inExempt = block.some((_, k) => exemptLines.has(i + k));
    if (
      text.includes('paymentMode: "REAL"') &&
      !text.includes("gatewayTransactionId") &&
      !inExempt
    ) {
      const m = text.match(/orderNo:\s*"([^"]+)"/);
      const orderNo = m ? m[1] : "x";
      // 单行块：行内插入；多行块：在 gatewayAmountCents 行前插入
      if (block.length === 1) {
        block[0] = block[0].replace(/gatewayAmountCents:/, `gatewayTransactionId: "tx_${orderNo}", gatewayAmountCents:`);
      } else {
        const at = block.findIndex((x) => /gatewayAmountCents:/.test(x));
        if (at >= 0) {
          const indent = (block[at].match(/^\s*/) || [""])[0];
          block.splice(at, 0, `${indent}gatewayTransactionId: "tx_${orderNo}",`);
        }
      }
    }
    out.push(...block);
    i = end + 1;
    continue;
  }
  out.push(l);
  i++;
}
lines = out;
let s = lines.join(nl);

// ── 第 2 步：ALIPAY 用例的 seedFixture 显式渠道 ──
s = s.replace(
  /seedFixture\(\{ seats: 2, amount: 2600 \}\);(\r?\n\s*const mk = \(\) =>\s*\r?\n\s*fulfillPaidOrder\(\{ orderNo: "SA_test_1", paymentMethod: "ALIPAY")/,
  'seedFixture({ seats: 2, amount: 2600, channel: "ALIPAY" });$1'
);
s = s.replace(
  'seedFixture({ orderId: "SA_b", seats: 3, amount: 3900 });',
  'seedFixture({ orderId: "SA_b", seats: 3, amount: 3900, channel: "ALIPAY" });'
);

// ── 第 3 步：ROOT 写断言（两处）→ 仅允许唯一认领行 ──
s = s.replace(
  /expect\(writeLog\.filter\(\(w\) => w\.startsWith\("ROOT"\)\)\)\.toEqual\(\[\]\);/,
  'expect(writeLog.filter((w) => w.startsWith("ROOT"))).toEqual(["ROOT billingrecord.create"]); // [U04] 唯一认领行'
);
s = s.replace(
  /(const rootWrites = writeLog\.filter\(\(w\) => w\.startsWith\("ROOT"\)\);\s*\r?\n\s*)expect\(rootWrites\)\.toEqual\(\[\]\);/,
  '$1expect(rootWrites).toEqual(["ROOT billingrecord.create"]); // [U04] 唯一认领行'
);

// ── 第 4 步：超时关闭用例改新契约（已验收款 → 留证 + 条件关单 + 幂等重放） ──
const oldT = [
  '  it("正常超时关闭先胜出（确实过期的 PENDING）→ 条件置 EXPIRED；后续请求不得再发席位", async () => {',
  '    seedFixture({ seats: 2, amount: 2600, expired: true });',
  '    const r1 = await mkFulfill();',
  '    expect(r1.ok).toBe(false);',
  '    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");',
  '    expect(store.workspace["w1"].extraSeats).toBe(0);',
  '    // 后续（含旧读）请求：状态已 EXPIRED，不覆盖其他终态、不发席位',
  '    staleBillingRead = { row: JSON.parse(JSON.stringify(store.billingrecord["SA_test_1"])), remaining: 1 };',
  '    const r2 = await mkFulfill();',
  '    expect(r2.ok).toBe(false);',
  '    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");',
  '    expect(store.workspace["w1"].extraSeats).toBe(0);',
  '  });',
].join(nl);
const newT = [
  '  it("正常超时关闭先胜出（确实过期的 PENDING）：已验收款 → 留证 + 条件关单；重放幂等且零席位", async () => {',
  '    seedFixture({ seats: 2, amount: 2600, expired: true });',
  '    // [U04/原5] 已超时但收到已验收款：持久收款事实 + 条件关单（不发放、不丢钱）',
  '    const r1 = await mkFulfill();',
  '    expect(r1.ok).toBe(true);',
  '    expect(r1.status).toBe("RECEIPT_PENDING_RECOVERY");',
  '    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED"); // 已条件关单',
  '    expect(store.workspace["w1"].extraSeats).toBe(0);',
  '    expect(store.billingrecord["SA_test_1"].metadata.pendingReceipt).toBeTruthy();',
  '    // 重放（含旧读）：同笔交易幂等 ACK，不重复发放、不覆盖终态',
  '    staleBillingRead = { row: JSON.parse(JSON.stringify(store.billingrecord["SA_test_1"])), remaining: 1 };',
  '    const r2 = await mkFulfill();',
  '    expect(r2.ok).toBe(true);',
  '    expect(r2.status).toBe("RECEIPT_PENDING_RECOVERY");',
  '    expect(store.billingrecord["SA_test_1"].status).toBe("EXPIRED");',
  '    expect(store.workspace["w1"].extraSeats).toBe(0);',
  '  });',
].join(nl);
if (!s.includes(oldT)) { console.log("timeout anchor miss"); process.exit(1); }
s = s.replace(oldT, newT, 1);

// ── 第 5 步：夹具 billingrecord.create 主键唯一约束（忠实 P2002） ──
const oldCreate = [
  '      async create({ data }: any) {',
  '        record("billingrecord", "create");',
  '        guardRootWrite();',
  '        checkFail("billingrecord", "create");',
  '        store.billingrecord[data.id] = { ...data };',
].join(nl);
const newCreate = [
  '      async create({ data }: any) {',
  '        record("billingrecord", "create");',
  '        guardRootWrite();',
  '        checkFail("billingrecord", "create");',
  '        // [U04/§13] 忠实唯一约束：主键冲突抛 P2002（收款认领/事实行依赖它裁决并发）',
  '        if (store.billingrecord[data.id]) {',
  '          const e = new Error("unique constraint");',
  '          (e as any).code = "P2002";',
  '          throw e;',
  '        }',
  '        store.billingrecord[data.id] = { ...data };',
].join(nl);
if (!s.includes(oldCreate)) { console.log("create anchor miss"); process.exit(1); }
s = s.replace(oldCreate, newCreate, 1);

fs.writeFileSync(p, s);
console.log("r0b one-shot contract upgrade done");
