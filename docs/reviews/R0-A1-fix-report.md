# R0-A1 同批补修交付报告

- 项目：`zhige-dockyard-web`（知阁·舟坊）
- 日期：2026-11-05
- 依据：`docs/reviews/R0-A-independent-review/REVIEW.md`、`verification.json`、`IDE-R0-A1-PROMPT.md`
- 上一批状态：R0-A 独立审核暂不通过 → 本批为同批补修，**不进入下一批**。
- 最终状态：**R0-A1 待独立复核**。

---

## 0. 本批与上一批的差量关系（保护现场）

工作区在 `master` 分支，已有大量他人未提交修改。本批**仅**在 R0-A 已改文件上做最小增量，未 `reset`/`clean`、未覆盖他人修改、未格式化无关代码。

本批实际改动文件（相对 R0-A 基线的最小差量）：

| 文件 | 本批改动 | 对应复核点 |
|---|---|---|
| `src/lib/workspace-plan-service.ts` | A1：免费资格仅限基础免费档 + 价格安全非负整数；新增 `getWorkspacePlanStrict`（严格读取、不回退常量） | A1 |
| `src/app/api/user/workspaces/create/route.ts` | A2：企业门禁移入 `ENTERPRISE` 分支；个人分支恢复 `getWorkspacePlanByKey` 既有读取语义 | A2 |
| `src/app/api/workspace/upgrade/route.ts` | A3：去除 `getWorkspacePlanByKey` 常量回退，改用 `getWorkspacePlanStrict`；仅基础免费档免支付开通 | A3 |
| `src/app/pricing/page.tsx` | A4：移除“选择任一支付方式即可完成开通”的演示支付块与“演示环境”措辞 | A4 |
| `src/app/workspace-hub/create/page.tsx` | A5：提交体如实携带 `plan`；付费空间类型禁止提交并加“暂未开放”提示 | A5 |
| `src/app/api/__tests__/r0a-business-boundary.test.ts` | A6：扩展隔离测试至 39 项（含认证 fixture 切换、spy 断言装配/赠送/支付/迁移未调用） | A6 |

R0-A 已改但本批**未再改动**的文件（保持）：`membership/upgrade/route.ts`、`workspace/upgrade-plan/route.ts`、`components/pricing/WorkspacePlanSection.tsx`、`hooks/useEnterpriseWorkspace.ts`。

---

## 1. 逐条回应审核点 A1–A6

### A1：免费资格遗漏（零价非基础档被当免费）
**问题**：原 `verifyEnterprisePlanForCreation` 仅凭“月年价格均为 0”即返回 `FREE`，导致零价 PRO/ENTERPRISE 等非基础档可直接免费创建。
**修复**：免费资格 = 既有免费基础档身份（`planKey === DEFAULT_WORKSPACE_PLAN`，即 `STANDARD`）+ 真实价格均为合法整数 0。任何其他零价档一律判为 `PAID`（需在线购买）。价格必须为安全非负整数，拒绝 `null`/小数/负数（负价不是合法 PAID）。
**证据**：`verifyEnterprisePlanForCreation` 现有分支；测试 `A1` 描述 11 项全通过，含“零价非基础档 PRO → PAID”“负价→REJECT”“小数价→REJECT”。

### A2：个人空间回归（企业门禁误伤 PERSONAL）
**问题**：R0-A 把 `verifyEnterprisePlanForCreation` 放在 `type` 分支外，个人请求也走企业门禁，可能误伤个人流程。
**修复**：企业门禁仅在 `type === "ENTERPRISE"` 内执行；个人分支恢复本批前既有 `getWorkspacePlanByKey` 读取语义（含常量兼容回退），不新增企业付费门禁；个人请求即便带 `plan=PRO` 也被强制 `STANDARD`，不会获得高阶企业权益。
**证据**：`user/workspaces/create/route.ts` 的 `let planConfig` 分支；测试 `A2` 描述 3 项全通过，含“企业套餐整体缺失个人仍 200”“plan=PRO 被忽略”。

### A3：邻近升级入口 `workspace/upgrade` 的回退放行
**问题**：该路由用 `getWorkspacePlanByKey`（配置缺失/异常时回退代码常量）后，`cycleAmount<=0` 直接 `provisionEnterpriseUpgrade`，配置失败可静默免费开通。
**修复**：改用新增的 `getWorkspacePlanStrict`（缺失/异常返回 `null`，**不回退常量**）；先严格校验真实目标、可购买性、价格安全非负整数；**仅**基础免费档（`DEFAULT_WORKSPACE_PLAN` 且 0/0）走免支付直接开通；其余一律走既有“先下单后支付”的 `PENDING` 流程，不在本入口免支付放行；合法正价的 `PENDING` 下单路径保持不变。
**证据**：`workspace/upgrade/route.ts` 配置解析段；测试 `A3` 描述 6 项全通过，含“配置缺失/读取异常/未知目标 → 503 且未调用开通/未下单/零写入”“基础免费档 → 200 调用开通、未下单”“付费档/零价非基础档 → 200 创建 PENDING 订单、未调用直接开通”。
**遗留声明（不谎称已修复）**：支付履约层 `upgradePersonalToEnterprise`/`provisionEnterpriseUpgrade` 内部仍用 `getWorkspacePlanByKey`（常量回退）。该路径属支付批次范围，且其行为只会把“缺失的付费档”回退为 `STANDARD`（**降级**，而非免费获得更高阶权益），不构成“未付款获得未批准高级权益”的越权漏洞。本批未改动它，作为已知残留写入第 4 节。

### A4：页面矛盾与静默替换
**问题**：会员弹窗残留“选择任一支付方式即可完成开通”与“演示环境”承诺；系统整体被称演示环境。
**修复**：移除会员购买弹窗内的支付方式选择块（不再让用户选择支付方式后提交注定失败的假购买）；去除“演示环境”措辞，改为“会员在线购买通道暂未开放……本次不会产生真实扣款或权益变更”。确认按钮文案改为“确认（后端校验）”。
**证据**：`pricing/page.tsx` 弹窗；`useEnterpriseWorkspace.ts` 本就“失败显示错误、成功才跳转”，无需改；`WorkspacePlanSection.tsx` 失败分支已在 R0-A 去除 `onUpgraded?.()` 假成功回调。
**未验证**：浏览器真人点击验证（见第 3 节）。

### A5：创建页 `spaceType` 静默替换
**问题**：`workspace-hub/create` 选择器提供 PRO/ENTERPRISE，但提交体不携带 `plan`，后端一律按 `STANDARD` 免费创建——用户选 PRO 却得到 STANDARD，属静默替换。
**修复**：提交体补上 `plan: formData.spaceType`（如实提交既有选择）；付费空间类型（非 `STANDARD`）**禁止提交**（按钮 disabled + 提示“该空间类型暂未开放在线购买，目前仅标准空间可免费创建”）；只有用户主动选择免费基础档才正常创建。
**证据**：`workspace-hub/create/page.tsx` 提交体与禁用条件；后端 `create-enterprise` 收到 `plan=PRO` 会按 R0-A1 规则返回 402（见测试“企业零价非基础档/付费档 → 402 零写入”）。

### A6：补齐正式回归测试
**问题**：旧测试未真实覆盖零价非基础档、个人误伤、升级入口异常放行；认证 fixture 始终用 USER 却称管理员；装配/赠送/支付/迁移用空实现而非 spy 断言。
**修复**：重写为 39 项隔离测试，覆盖 A1–A5 全部路径；认证 fixture 真实切换 `USER/ADMIN/未认证`；“装配/赠送/缓存”用 `vi.fn` spy 断言拒绝路径**未调用**；“开通/支付”用 spy 断言拒绝路径未调用；后端拒绝测试与前端证据分离（前端见第 3 节）。历史 `verify.cjs` 作为漏洞取证保留，未修改。
**证据**：`src/app/api/__tests__/r0a-business-boundary.test.ts`，`npx vitest run` 结果 **39 passed (39)**。

---

## 2. 实际证据（测试命令与结果）

```
npx vitest run --no-color --reporter=default src/app/api/__tests__/r0a-business-boundary.test.ts
# Test Files  1 passed (1)
#      Tests  39 passed (39)
```

分类：A1 严格核验 11 项；会员入口 4 项；套餐入口 2 项；企业创建入口（含零价非基础档/异常/免费/管理员）14 项；A2 个人误伤 3 项；A3 升级入口 6 项。

类型检查：`npx tsc --noEmit -p tsconfig.json` → `TSC_EXIT:0`；相关文件 `read_lints` 0 诊断。

---

## 3. 类型、页面验证证据与未覆盖项

- **类型检查**：已通过（exit 0，含测试文件）。
- **构建（`next build`）**：未执行。原因同 R0-A——工作区含大量未提交改动且本机 `next build` 会被 IDE 删除钩子拦截（与代码无关），无法在本环境保证副作用隔离；类型正确性已由 `tsc` 覆盖。
- **浏览器/页面真人验证**：**未验证**。本环境无可用浏览器试错通道，且规范明确“不能保证副作用隔离时明确未验证，不用真实环境试错”。前端改动（A4/A5）已通过源码审查保证：①移除诱导性支付方式选择；②去除“演示环境/立即开通”承诺；③创建页如实提交 `plan` 并禁止付费类型提交；④失败分支不显示成功、不调用 `onUpgraded`、不跳转。上述均有对应源码与单测（后端契约）支撑，但**未做真人点击闭环**，列为未覆盖项，建议独立复核阶段在隔离预览补一次点击验证。

---

## 4. 通过 / 失败 / 未验证 与遗留风险

| 项 | 结论 |
|---|---|
| A1 免费资格严格化 | 通过 |
| A2 个人不受企业门禁误伤 | 通过 |
| A3 升级入口去除回退放行（本路由边界） | 通过 |
| A4 页面矛盾/静默替换文案 | 通过（源码审查） |
| A5 创建页空间类型如实提交 + 禁止付费提交 | 通过（源码审查） |
| A6 隔离测试覆盖与 spy 断言 | 通过（39/39） |
| 类型检查 / 隔离测试 | 通过 |
| 整站生产构建 | 未验证（环境限制，已说明） |
| 浏览器真人页面验证 | 未验证（环境限制，已说明） |

**遗留风险（不谎称为已解决）**：
1. **支付履约层常量回退（A3 深层）**：`upgradePersonalToEnterprise`/`provisionEnterpriseUpgrade` 仍用 `getWorkspacePlanByKey` 回退。仅会在“付费档记录缺失”时降级为 `STANDARD`，不会免费授予更高阶权益；属支付批次范围，本批未改，建议支付批次统一收口为严格读取 + 幂等对账。
2. **其他付费入口未在本批范围**：充值（recharge）、算力加油包、`payments/mock/confirm` 履约闭环等，按 R0-A 划分不在本批，已在 R0-A 报告列为独立批次。
3. **前端无浏览器验证**：见第 3 节。

---

## 5. 对现有工作区修改的保护

- `git status --short` 确认本批仅改动上述 8 个文件（R0-A 既有 7 个 + A1 增量）+ 新增 1 个测试文件；其余约 90+ 他人未提交文件**未触碰**。
- 未执行 `reset`/`clean`/`restore` 整文件，未覆盖他人改动，未顺手格式化无关代码。
- 本批零真实数据库写入、零迁移/seed/补账、零外部费用（测试全程 mock）。

---

## 6. 实际数据库及外部费用影响

- **无真实数据库写入**：所有源码改动仅为“拒绝分支 + 严格读取”，测试全 mock；`tsc` 与 `vitest` 均不连真实库。
- **无费用/外部调用**：未调用真实支付、模型、短信、邮件；未读取或打印密钥；未启用真实 Token 结算；未改 BYOK 收费。

---

## 7. 仅撤销本批差量的回滚办法

- 本批差量只涉及源码（无迁移、无数据写入）。
- 撤销 A1–A5 源码：将 8 个文件 `git restore` 到 R0-A 已交付状态（即保留 R0-A 修复，仅回退 R0-A1 增量），并删除新增测试文件 `src/app/api/__tests__/r0a-business-boundary.test.ts`。
- 因 R0-A 与 R0-A1 改动叠加在同一文件，若需精确到“仅撤 R0-A1 而不撤 R0-A”，按本报告第 0 节逐文件 diff 手工回退对应段落即可，**无需任何数据库/数据回滚**。

---

## 8. 最终状态

**R0-A1 待独立复核。**

本批未宣称全站费用漏洞清零、商业闭环完成、可生产发布或保证盈利；仅完成 R0-A 独立审核所列 A1–A6 的补修与隔离验证，并将未覆盖项与遗留风险如实标注。完成后停止交回审核，不继续下一批。
