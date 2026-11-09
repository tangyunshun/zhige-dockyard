// 临时脚本：r0b 收尾契约更新
const fs = require("fs");
const p = "src/app/api/__tests__/r0b-seat-addon.test.ts";
let s = fs.readFileSync(p, "utf8");

// 1) 三次重复确认 seed 显式 ALIPAY 渠道
const anchor1 = 'seedFixture({ seats: 2, amount: 2600 });';
const idx1 = s.indexOf(anchor1);
const after1 = s.slice(idx1, idx1 + 200);
if (after1.includes('paymentMethod: "ALIPAY"')) {
  s = s.slice(0, idx1) + 'seedFixture({ seats: 2, amount: 2600, channel: "ALIPAY" });' + s.slice(idx1 + anchor1.length);
  console.log("three-repeat seed fixed");
} else console.log("three-repeat anchor not applicable at", idx1);

// 2) ROOT escape 断言（第二处，正则宽松匹配）
s = s.replace(
  /(const rootWrites = writeLog\.filter\(\(w\) => w\.startsWith\("ROOT"\)\);\s*\n\s*)expect\(rootWrites\)\.toEqual\(\[\]\);/,
  '$1// [U04/原5] ROOT 写仅允许唯一认领行\n$1expect(rootWrites).toEqual(["ROOT billingrecord.create"]);'
);

// 3) 正常超时关闭用例改新契约
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
].join("\n");
const newT = [
  '  it("正常超时关闭先胜出（确实过期的 PENDING）：已验收款 → 留证 + 关单；重放幂等且零席位", async () => {',
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
].join("\n");
if (!s.includes(oldT)) { console.log("timeout anchor miss"); process.exit(1); }
s = s.replace(oldT, newT, 1);

fs.writeFileSync(p, s);
console.log("r0b updated");
