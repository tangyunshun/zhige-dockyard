# R0-A2 同批补修交付报告

- 项目：`zhige-dockyard-web`（知阁·舟坊）
- 日期：2026-11-05
- 依据：`docs/reviews/R0-A1-independent-review/REVIEW.md`、`verification.json`、`IDE-R0-A2-PROMPT.md`、原 R0-A / R0-A1 报告与测试
- 上一批状态：R0-A1 独立审核仍未通过 → 本批为同批补修，**不进入下一批**
- 最终状态：**R0-A2 待独立复核**

---

## 0. 本批与上一批的差量关系（保护现场）

工作区在 `master` 分支，已有大量他人未提交修改。本批**仅**在 R0-A/R0-A1 已改文件上做最小增量，未 `reset`/`clean`、未覆盖他人修改、未格式化无关代码、未新写价格/赠点/名额。

本批实际改动文件（相对 R0-A1 基线的最小差量）：

| 文件 | 本批改动 | 对应审核点 |
|---|---|---|
| `src/lib/workspace-plan-service.ts` | B2：`getWorkspacePlanStrict` 重写为结构化结果，先核验原始数据库行 | B2 |
| `src/app/api/workspace/upgrade/route.ts` | B1/B3：单一规范目标贯穿写入；统一免费条件（月年都 0）；缺失目标拒绝；0 价非基础档/混合价拒绝 | B1,B3 |
| `src/lib/workspace-upgrade-service.ts` | B4：自助来源写边界用严格读取重验目标，缺目标拒绝，不回退/重选 | B4 |
| `src/app/workspace/upgrade/page.tsx` | B6：传显式 `targetPlan:"STANDARD"`；区分 payUrl/免费/失败三类 | B6 |
| `src/components/studio/UpgradeModal.tsx` | B5：错误优先展示可理解 `message` | B5 |
| `src/components/workspace-hub/modals/UpgradeModal.tsx` | B5：错误优先展示 `message` | B5 |
| `src/components/pricing/WorkspacePlanSection.tsx` | B5：错误优先展示 `message` | B5 |
| `src/hooks/useEnterpriseWorkspace.ts` | B5：错误优先展示 `message` | B5 |
| `src/app/workspace-hub/create/page.tsx` | B5：错误优先展示 `message` | B5 |
| `src/app/api/__tests__/r0a-business-boundary.test.ts` | B5：修正“零价 PRO 应下 0 元订单”错误断言；补缺失目标/混合价用例 | B5 |
| `src/app/api/__tests__/r0a2-real-combo.test.ts` | B5/B：**新增**真实服务组合回归（真实 route+严格读取+真实开通服务，内存 Prisma） | B5,B |

R0-A/R0-A1 已改但本批**未再改动**的文件（保持有效，不回退）：会员旧入口阻断、套餐旧入口阻断、两个企业创建入口保护、个人空间恢复、页面文案修复等。

---

## 1. 逐条回应审核报告 B1—B6

### B1：目标套餐漂移（核验 STANDARD 却开通 PRO）
**问题**：路由对缺失 `targetPlan` 按 `STANDARD` 核验，却把 `undefined` 传入开通服务；后者重新选择排序最前/默认套餐（PRO 排序更前），导致**无支付开通 PRO**。规范目标未贯穿查询→资格→开通→订单→最终 `workspace.plan`。
**修复**：路由先 `normalize` 得到唯一 `normalizedKey`，并把它**同时**用于：①`getWorkspacePlanStrict(targetPlanRaw)` 查询核验；②免支付开通时 `provisionEnterpriseUpgrade({ targetPlanKey: normalizedKey })`；③PENDING 订单 `metadata.targetPlan: normalizedKey`。前端升级页现在**显式**携带 `targetPlan:"STANDARD"`，不再省略。缺失/空白目标 → 400 明确拒绝（不猜测授权）。
**证据**：`workspace/upgrade/route.ts` 配置解析段与订单写入段；`workspace/upgrade/page.tsx` 提交体。`r0a2-real-combo.test.ts` B1 用例：**PRO 排序更前、显式目标 STANDARD → 最终 `workspace.plan==="STANDARD"`，非 PRO**；缺失目标 → 400 且个人空间不变；retain 选项新建空间同样绑定 STANDARD。

### B2：严格核验原始配置（`getWorkspacePlanStrict` 丢失 isActive、先清洗价格）
**问题**：原实现直接 `dbToConfig(row)`（丢弃 `isActive`，并把缺失价格 `Number(x||0)` 清洗成 0 再判定），且对缺失/异常返回 `null` 不区分原因。
**修复**：重写 `getWorkspacePlanStrict` 返回结构化 `StrictPlanResult`，**先对原始行**做：目标非空 → 记录存在 → `isActive===true` → `purchasable===true` → 价格均为安全非负整数（`Number.isInteger` 且 ≥0，不前置 `Number(x||0)`）。任一不满足即 `ok:false` 并给出对应 `httpStatus/code/message`（缺失目标 400、记录缺失 503、停用 400、不可在线购买 400、非法价格 503、读取异常 503）。**不回退代码常量**。
**证据**：`workspace-plan-service.ts` `getWorkspacePlanStrict`；测试覆盖缺失/异常/停用/不可购买/非法价格均 `ok:false`。

### B3：统一免费条件，禁止未批准的 0 元高级订单
**问题**：原“免费分支”只判当前周期 `cycleAmount<=0`，故月 0 年正价/年 0 月正价会按本周期免费；零价 PRO/ENTERPRISE 走 PENDING 却生成 0 元订单（绕过免费资格）。旧测试甚至断言“零价 PRO 应成功下 0 元订单”。
**修复**：免费资格 = **既有免费基础身份（`DEFAULT_WORKSPACE_PLAN`）且真实月年价格均为合法 0**。否则若 `cycleAmount>0` → PENDING；若 `cycleAmount<=0`（混合价 / 零价非基础档）→ **400 拒绝**，不建 0 元订单、不调用支付、不调用开通。修正了错误测试断言（零价 PRO 现在期望 400 被拒）。合法正价保留原有 PENDING 流程，不提前开通。
**证据**：`workspace/upgrade/route.ts` 免费条件与 `else if (cycleAmount <= 0)` 拒绝分支；`r0a2-real-combo.test.ts` B3 用例；`r0a-business-boundary.test.ts` 零价 PRO / 混合价断言。

### B4：自助开通服务仍重新宽松读取，核验未贯穿写边界
**问题**：`upgradePersonalToEnterprise` 在 `targetPlanKey` 缺失时调用 `resolveDefaultEnterprisePlan()` 重选默认，且用带常量回退的 `getWorkspacePlanByKey`；自助来源可能“核验 STANDARD、实际开通 PRO”。
**修复**：新增 `resolveTargetConfig(input)`：①自助来源**必须显式带 `targetPlanKey`**，并用 `getWorkspacePlanStrict`（**不回退常量**）在写边界重新核验；②自助来源缺目标 → 返回 `null` → `TARGET_PLAN_NOT_FOUND`，杜绝自动选档漂移；③管理员/线下授予（`SALES_SIGNUP`/`ADMIN_MANUAL`）沿用宽松读取与最低档回退，**既有职责保留并显式说明**。不信任客户端 `paid/free/trustedPlan/source` 等字段（本路由不读取 `free/paid`）。
**证据**：`workspace-upgrade-service.ts` `resolveTargetConfig`；`r0a2-real-combo.test.ts` B4 用例：自助显式 PRO 且配置存在 → 写入 PRO；自助目标配置缺失 → 写边界重验拒绝（`TARGET_PLAN_NOT_FOUND`），个人空间不变。

### B5：必须增加真实服务组合回归 + 错误文案优先 message
**问题**：原 39 项测试把整个 `provisionEnterpriseUpgrade` 替换，无法发现目标漂移；部分前端错误分支优先展示机器码 `error`；旧缺陷断言“零价 PRO 应下 0 元订单”。
**修复**：①**新增** `r0a2-real-combo.test.ts`：只替换数据库与外部副作用，跑**真实 route + 真实 `getWorkspacePlanStrict` + 真实 `provisionEnterpriseUpgrade`/`upgradePersonalToEnterprise`**；断言最终 `workspace.plan`、配额、账单与支付调用，而非仅断言某函数被调用。②修正错误测试断言（零价非基础档 → 拒绝，不再下 0 元订单）。③前端 5 处错误分支改为优先 `message` 再兜底 `error`（升级页、两处 UpgradeModal、WorkspacePlanSection、useEnterpriseWorkspace、workspace-hub/create）。路由侧拒绝响应均带可读 `message`。
**证据**：测试文件与用例列表见第 2 节；`git` 未改动历史审核脚本/JSON，旧缺陷断言失败属预期（已用新断言覆盖正确行为）。
**未声称**：内存测试等同真实 MySQL 事务测试——第 3 节明确标注。

### B6：修复实际升级调用者（page / 两处 UpgradeModal）
**问题**：`workspace/upgrade/page.tsx` 省略 `targetPlan`，且 200 即写“已升级”localStorage（不区分 payUrl/免费）。其余调用者行为不一致。
**修复**：升级页①提交体显式带 `targetPlan:"STANDARD"`；②收到 `result.payUrl` → 跳转收银台，**不写已升级标记**；③`result.free===true` → 真正开通后才写 localStorage 并跳转；④其它（失败/兜底）→ toast 提示，**不写成功标记、不跳转已升级**。两处 UpgradeModal 已正确处理 payUrl/免费（保留并修正文案优先级）。
**证据**：`workspace/upgrade/page.tsx` `handleSubmit`；`r0a2-real-combo.test.ts` 中“缺失目标→400 个人空间不变”即对应前端不会误写成功。

---

## 2. 实际证据（测试命令与结果）

```
npx vitest run --no-color --reporter=default \
  src/app/api/__tests__/r0a-business-boundary.test.ts \
  src/app/api/__tests__/r0a2-real-combo.test.ts
# Test Files  2 passed (2)
#      Tests  48 passed (48)
```

分类：
- `r0a-business-boundary.test.ts`（40 项）：A1 严格核验 11 项、会员入口 4、套餐入口 2、企业/个人创建 14、A2 个人误伤 3、A3 升级入口 6（含缺失目标 400、零价 PRO 拒绝、混合价拒绝）。
- `r0a2-real-combo.test.ts`（8 项，真实服务组合）：B1 漂移证明 3（PRO 排序更前仍只开通 STANDARD / 缺失目标拒绝 / retain 绑定）、B3 免费与下单 3（零价非基础档拒绝 / 混合价拒绝 / 合法正价只 PENDING 且订单 targetPlan=PRO 金额 19900）、B4 写边界重验 2（自助显式目标→写入 / 目标缺失→拒绝）。

类型检查：`npx tsc --noEmit --incremental false -p tsconfig.json` → `TSC_EXIT:0`；相关文件 `read_lints` 0 诊断。

---

## 3. 类型、页面验证证据与未覆盖项

- **类型检查 / 隔离测试**：已通过（exit 0，48/48）。
- **整站生产构建 `next build`**：**未验证**。工作区含大量他人未提交改动，且本机 `next build` 会被 IDE 删除钩子拦截（与代码无关），无法在本环境保证副作用隔离；类型正确性已由 `tsc` 覆盖。
- **浏览器真人点击**：**未验证**。前端改动（传 `targetPlan`、三类状态区分、文案优先级）由后端契约测试 + 源码审查覆盖，建议独立复核阶段在隔离预览补一次点击闭环。
- **真实 MySQL 事务测试**：**未声称等价**。本批真实服务组合测试使用内存 Prisma 代理替代持久化，能复现并验证目标漂移/免费条件/写边界重验的**逻辑正确性**，但不替代真实库的并发/事务/触发器行为。

---

## 4. 通过 / 失败 / 未验证 与遗留风险

| 项 | 结论 |
|---|---|
| B1 目标漂移修复（规范目标贯穿写入） | 通过 |
| B2 严格核验原始配置 | 通过 |
| B3 统一免费条件、拒绝未批准 0 元高级订单 | 通过（含修正错误断言） |
| B4 自助写边界重验、不回退/重选 | 通过 |
| B5 真实服务组合回归 + 文案优先级 | 通过（48 项） |
| B6 升级调用者传目标、区分 payUrl/免费/失败 | 通过（源码审查） |
| 类型检查 / 隔离测试 | 通过 |
| 整站生产构建 | 未验证（环境限制，已说明） |
| 浏览器真人验证 | 未验证（环境限制，已说明） |
| 真实 MySQL 事务测试 | 未声称等价（内存测试，已说明） |

**遗留风险（不谎称为已解决）**：
1. **支付履约闭环（payments/mock/confirm → fulfillEnterpriseUpgradeFromOrder）**：本批已让订单 `metadata.targetPlan` 存**规范化后**的 `normalizedKey`，履约环节重读订单存储的目标写入开通服务 → 与核验目标一致（按结构不再漂移）。但该路径属支付批次范围，本批未加专门测试，建议支付批次复测确认。
2. **管理员/线下授予**仍沿用宽松读取与默认回退（B4 已显式保留其既有职责）。
3. **前端无浏览器验证**：见第 3 节。

---

## 5. 对现有工作区修改的保护

- `git status --short` 显示工作区约 90+ 文件为他人既有未提交改动；本批仅触及上表 11 个文件（含 1 个新增测试），未触碰其余文件，未 `reset`/`clean`/`restore` 整文件，未覆盖他人修改。
- 历史独立审核脚本与 `verification.json` 保留未改；旧缺陷断言失败属预期，已用新断言覆盖正确行为，未为制造通过而改动证据。

---

## 6. 实际数据库及外部费用影响

- **无真实数据库写入**：所有源码改动仅为“拒绝分支 + 严格读取 + 真实内存写边界”，测试全程 mock 持久化/支付/模型/赠送/迁移；`tsc` 与 `vitest` 均不连真实库。
- **无费用/外部调用**：未调用真实支付、模型、短信、邮件；未读取或打印密钥；未启用真实 Token 结算；未改价格/赠点/名额/权限同步。

---

## 7. 仅撤销本批差量的回滚办法

- 本批差量只涉及源码（无迁移、无数据写入）。
- 撤销 B1–B6 源码：`git restore` 上表 10 个既有文件到 R0-A1 已交付状态（保留 R0-A1 修复，仅回退 R0-A2 增量），并删除新增测试 `src/app/api/__tests__/r0a2-real-combo.test.ts`。
- 因 R0-A/R0-A1/R0-A2 改动叠加在同一文件，若需精确到“仅撤 R0-A2 而不撤前批”，按本报告第 0 节逐文件 diff 手工回退对应段落即可，**无需任何数据库/数据回滚**。

---

## 8. 最终状态

**R0-A2 待独立复核。**

本批未宣称全站费用漏洞清零、商业闭环完成或生产可发布；仅完成 R0-A1 审核所列 B1—B6 的补修与隔离验证，并将未覆盖项与遗留风险如实标注。完成后停止交回审核，不继续下一批。
