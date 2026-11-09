// r0k1 sweep 用例改新契约：无停止证据不腾槽
const fs = require("fs");
const p = "src/app/api/__tests__/r0k1-fixes.test.ts";
let s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";

// 1) 双回收者：新契约 = CAS 只隔离一次，计数不动
const old1 = [
  '  it("双回收者回收同一过期行：只归还一次（CAS），平台 active 不归零、不超发", async () => {',
  '    seed(2, 2);',
  '    let arrivals = 0;',
  '    const both = Promise.withResolvers();',
  '    const allowA = Promise.withResolvers();',
  '    const allowB = Promise.withResolvers();',
  '    prismaMock.setBeforeLeaseUpdate(async () => {',
  '      arrivals++;',
  '      if (arrivals === 1) { both.resolve(undefined); await allowA.promise; }',
  '      if (arrivals === 2) { allowB.resolve(undefined); }',
  '    });',
  '    const a = sweepParseLeases(h.now);',
  '    const b = sweepParseLeases(h.now);',
  '    await both.promise; // 两回收者都到达过期行更新',
  '    allowA.resolve(undefined);',
  '    await Promise.all([a, b]);',
  '    prismaMock.setBeforeLeaseUpdate(null);',
  "    // 'healthy' 仍活跃 → 平台 active 应为 1（仅 'old' 被回收一次）；绝不归零",
  '    expect(h.counters.get("platform").active).toBe(1);',
  '    expect([...h.leases.values()].filter((l) => l.status === "ACTIVE").length).toBe(1);',
  '  });',
].join(nl);
const new1 = [
  '  it("双回收者竞争同一过期行：仅隔离一次（CAS）；无停止证据不腾槽，计数守恒", async () => {',
  '    seed(2, 2);',
  '    let arrivals = 0;',
  '    const both = Promise.withResolvers();',
  '    const allowA = Promise.withResolvers();',
  '    const allowB = Promise.withResolvers();',
  '    prismaMock.setBeforeLeaseUpdate(async () => {',
  '      arrivals++;',
  '      if (arrivals === 1) { both.resolve(undefined); await allowA.promise; }',
  '      if (arrivals === 2) { allowB.resolve(undefined); }',
  '    });',
  '    const a = sweepParseLeases(h.now);',
  '    const b = sweepParseLeases(h.now);',
  '    await both.promise; // 两回收者都到达过期行更新',
  '    allowA.resolve(undefined);',
  '    await Promise.all([a, b]);',
  '    prismaMock.setBeforeLeaseUpdate(null);',
  '    // [F14 §7.1] 过期 ACTIVE 仅转 QUARANTINED（诊断保留，计数不动）：',
  '    // 平台 active 仍为 2（old+healthy 都不腾槽）；恰好一次隔离（CAS）',
  '    expect(h.counters.get("platform").active).toBe(2);',
  '    expect(h.counters.get("platform").workUnits).toBe(2);',
  '    expect(h.leases.get("old").status).toBe("QUARANTINED");',
  '    expect([...h.leases.values()].filter((l) => l.status === "ACTIVE").length).toBe(1);',
  '  });',
].join(nl);
if (!s.includes(old1)) { console.log("t1 miss"); process.exit(1); }
s = s.replace(old1, new1, 1);

// 2) 部分提交可恢复：新契约 = 隔离路径不触计数；EXPIRED 半完成用例改为隔离 CAS 幂等
const old2 = [
  '  it("sweep 部分提交可恢复：计数更新失败则整行回滚，过期行保持 ACTIVE 可重试", async () => {',
  '    seed(2, 2);',
  '    prismaMock.setFailCounterDecrement(true);',
  '    await sweepParseLeases(h.now);',
  '    prismaMock.setFailCounterDecrement(false);',
  "    // 计数失败 → 事务回滚 → 'old' 仍为 ACTIVE（不出现「终态 EXPIRED 但计数没改」半完成）",
  '    expect(h.leases.get("old").status).toBe("ACTIVE");',
  '    // 可重试：下一轮成功回收',
  '    await sweepParseLeases(h.now);',
  '    expect(h.leases.get("old").status).toBe("EXPIRED");',
  '    expect(h.counters.get("platform").active).toBe(1);',
  '  });',
].join(nl);
const new2 = [
  '  it("sweep 隔离幂等可重试：无证据不腾槽（计数不动），重复 sweep 不二次改变状态", async () => {',
  '    seed(2, 2);',
  '    await sweepParseLeases(h.now);',
  "    // [F14 §7.1] 过期 ACTIVE → QUARANTINED（诊断保留，计数完全不动）",
  '    expect(h.leases.get("old").status).toBe("QUARANTINED");',
  '    expect(h.counters.get("platform").active).toBe(2);',
  '    expect(h.counters.get("platform").workUnits).toBe(2);',
  '    // 重复 sweep：状态条件不再命中，不二次改变、不重复计数',
  '    await sweepParseLeases(h.now);',
  '    expect(h.leases.get("old").status).toBe("QUARANTINED");',
  '    expect(h.counters.get("platform").active).toBe(2);',
  '  });',
].join(nl);
if (!s.includes(old2)) { console.log("t2 miss"); process.exit(1); }
s = s.replace(old2, new2, 1);

fs.writeFileSync(p, s);
console.log("r0k1 sweep tests updated");
