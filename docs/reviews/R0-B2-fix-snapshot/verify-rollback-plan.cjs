/**
 * R0-B2 / B2-4 回滚方案「隔离副本」验证脚本（只读审计，不回退工作区）
 *
 * 目的：
 *  1. 核对 B / B1 / B2 真实开始快照里前批文件的存在性，纠正 R0-B1 报告的错误回滚结论；
 *  2. 在系统临时目录构造一棵「模拟回退后的源码树」，验证前批服务仍存在、
 *     导入方引用可解析、展示契约配套；
 *  3. 识别本批差量与「后续/他人改动」需要人工确认的文件；
 *  4. 全程不修改工作区任何文件、不连数据库、不调用支付/模型。
 *
 * 运行：node docs/reviews/R0-B2-fix-snapshot/verify-rollback-plan.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const REVIEWS = path.join(ROOT, "docs", "reviews");
const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

// ── 1. 快照存在性核对 ────────────────────────────────────────────────
const bManifest = readJson(path.join(REVIEWS, "R0-B-fix-snapshot", "manifest.json"));
const b1Manifest = readJson(path.join(REVIEWS, "R0-B1-fix-snapshot", "manifest.json"));
const verification = readJson(path.join(REVIEWS, "R0-B1-independent-review", "verification.json"));
const fileNames = (m) => {
  const f = m.files || {};
  if (Array.isArray(f)) return f.map((x) => (typeof x === "string" ? x : x.path || x.file));
  return Object.keys(f); // 快照 manifest 的 files 为 { 路径: 元数据 } 字典
};

const SERVICE = "src/lib/payment/seat-addon-fulfill.ts";
const DISPLAY = "src/lib/payment-cashier-display.ts";
const bFiles = fileNames(bManifest);
const b1Files = fileNames(b1Manifest);

check("B 开始快照不含 seat-addon-fulfill.ts（该文件是 B 批产生）", !bFiles.includes(SERVICE), `B 快照 ${bFiles.length} 个文件`);
check("B1 开始快照已含 seat-addon-fulfill.ts（前批有效服务）", b1Files.includes(SERVICE), `B1 快照 ${b1Files.length} 个文件`);
check("B 快照中不存在 seat-addon-fulfill.ts 副本（旧报告『可从 B 快照恢复』不成立）",
  !fs.existsSync(path.join(REVIEWS, "R0-B-fix-snapshot", "frozen-source",
    "src__lib__payment__seat-addon-fulfill.ts")));

const b1FrozenService = path.join(REVIEWS, "R0-B1-fix-snapshot", "frozen-source",
  "src__lib__payment__seat-addon-fulfill.ts");
const baselineService = (verification.baseline || []).find((b) => b.file === SERVICE);
check("B1 快照服务副本哈希 = B1 复核基线 expectedSha256",
  fs.existsSync(b1FrozenService) && baselineService && sha256(b1FrozenService) === baselineService.expectedSha256,
  `${sha256(b1FrozenService).slice(0, 12)}…`);

check("payment-cashier-display.ts 在 B1 复核哈希表中已存在（非 B2 新增，不可删）",
  !!verification.sha256 && !!verification.sha256[DISPLAY], verification.sha256 && verification.sha256[DISPLAY]);

// 未改动文件当前哈希 == B1 复核基线：证明 B2 开始态未被其它人改过（基线可信）
const untouched = ["src/lib/payment/fulfill.ts", "src/app/api/payments/mock/confirm/route.ts",
  "src/app/user/pay/qr/page.tsx", "src/lib/order-expiry.ts"];
for (const f of untouched) {
  const cur = sha256(path.join(ROOT, f));
  check(`未改动文件哈希与 B1 复核基线一致: ${f}`, verification.sha256[f] === cur, cur.slice(0, 12) + "…");
}

// ── 2. 隔离副本：构造「模拟回退后的树」，验证前批服务与导入闭环 ──────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "r0b2-rollback-"));
try {
  const simSrc = path.join(tmp, "src");
  // 用 B1 开始快照的服务副本代表「回退后仍须保留的前批服务」
  fs.mkdirSync(path.join(simSrc, "lib", "payment"), { recursive: true });
  fs.copyFileSync(b1FrozenService, path.join(simSrc, "lib", "payment", "seat-addon-fulfill.ts"));

  // 把当前工作区的 4 个调用方/依赖复制到隔离树（只读复制，工作区不变）
  const importers = [
    "src/lib/payment/fulfill.ts",
    "src/app/api/payments/mock/confirm/route.ts",
    "src/app/api/__tests__/r0b-seat-addon.test.ts",
    "src/lib/payment-cashier-display.ts",
    "src/app/user/pay/mock/page.tsx",
  ];
  for (const f of importers) {
    const dest = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), dest);
  }

  const simService = path.join(simSrc, "lib", "payment", "seat-addon-fulfill.ts");
  const simServiceSrc = fs.readFileSync(simService, "utf8");
  check("隔离副本：前批服务仍存在且导出 fulfillSeatAddonOrder",
    /export\s+async\s+function\s+fulfillSeatAddonOrder/.test(simServiceSrc));

  // B1 开始快照是「B1 修复前」的版本：F1/F2 的条件超时关闭、资格条件写入是 B1 批内新增的。
  // 因此回退 B2 的目标是「B2 开始态（B1 复核后，哈希 fe865098…）」，绝不是整文件覆盖 B1 开始快照，
  // 否则会丢掉前批有效修复。当前工作区服务是 B1 有效修复 + B2 叠加，用差量反向应用才是正确回退。
  const currentServiceSrc = fs.readFileSync(path.join(ROOT, SERVICE), "utf8");
  check("B1 开始快照不含 F1/F2 修复（证明不能整文件覆盖回该快照）",
    !/SEAT_QUALIFICATION_LOST/.test(simServiceSrc), "B1 开始快照为修复前版本");
  check("B2 当前服务保留了 B1 有效修复（条件超时关闭 / 资格条件写入）",
    /SEAT_CLAIM_LOST/.test(currentServiceSrc) && /SEAT_QUALIFICATION_LOST/.test(currentServiceSrc) &&
    /isOrderExpired/.test(currentServiceSrc));

  // 导入解析：逐个调用方检查其 import 路径能否解析到隔离树中的真实文件
  const importSpec = "@/lib/payment/seat-addon-fulfill";
  for (const f of importers.slice(0, 3)) {
    const src = fs.readFileSync(path.join(tmp, f), "utf8");
    const resolved = path.join(simSrc, "lib", "payment", "seat-addon-fulfill.ts");
    check(`隔离副本：导入可解析 ${f} → ${importSpec}`,
      src.includes(importSpec) && fs.existsSync(resolved));
  }

  // 展示契约配套：页面依赖的函数在隔离树中确实导出
  const displaySrc = fs.readFileSync(path.join(tmp, DISPLAY), "utf8");
  check("隔离副本：展示契约导出 resolveCashierStatusView / resolveCashierSuccessView",
    /export\s+function\s+resolveCashierStatusView/.test(displaySrc) &&
    /export\s+function\s+resolveCashierSuccessView/.test(displaySrc));

  // ── 3. 差量与后续改动识别 ─────────────────────────────────────────
  const b2Touched = [SERVICE, "src/app/api/workspace/seat-addon/route.ts", DISPLAY,
    "src/app/user/pay/mock/page.tsx", "src/app/api/__tests__/r0b-seat-addon.test.ts"];
  console.log("\n=== 本批差量（当前哈希 vs B1 复核基线；回退前须人工确认后续/他人改动）===");
  for (const f of b2Touched) {
    const cur = sha256(path.join(ROOT, f));
    const base = verification.sha256[f] || "(无基线)";
    console.log(`  ${f}\n    B1基线: ${base}\n    当前  : ${cur}\n    ${cur !== base ? "差量存在 → 逐项反向应用，不整文件覆盖" : "无差量"}`);
  }
  check("本批改动文件均能与 B1 复核基线形成可识别差量",
    b2Touched.every((f) => verification.sha256[f] && sha256(path.join(ROOT, f)) !== verification.sha256[f]));

  console.log("\n=== 隔离副本结论 ===");
  console.log("  前批服务 seat-addon-fulfill.ts：保留（B1 开始快照已含，B 快照无副本）");
  console.log("  payment-cashier-display.ts：保留（B1 复核时已存在）");
  console.log("  回退方式：逐项反向应用 B2 差量；执行前重新核对当前哈希与他人改动");
  console.log("  工作区：未做任何写入；模拟树位于临时目录，退出即删");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\nRESULT: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
