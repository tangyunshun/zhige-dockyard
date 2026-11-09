# R0-D 修复报告：原方案 F07 人工退款权限与错误发放止损

> **状态：R0-D 待独立复核**。本批只完成风险关闭；不宣称完整退款功能修复、生产就绪或平台利润已保证。
> 不顺势开发完整来源守恒退款引擎，不恢复企业池转个人，不重开席位补修。

---

## 〇、理解确认与范围

| 项 | 内容 |
|---|---|
| 唯一目标 | ① 纠正人工裁决权限（复用既有 `order:refund_approve`）；② 阻断当前「人工 APPROVE → 不核净额直接给个人钱包加点」 |
| 依据 | 原方案 F07/F16、R0-C 独立审核 `next-refund-verification.json` 与 `IDE-R0-D-PROMPT.md` |
| 已核实事实 | resolve POST 原只请求 `order:read` 却能批准加钱或驳回；APPROVE 统一 `grantPoints(scope=WALLET)`，丢失企业/赠送来源限制；申请只累计 CONSUME，未扣既有自动退款。审核复现过「原扣 100、已自动退 100，人工再退 100」 |
| 目标用户 | 提出任务扣点争议的用户、查看/处理工单的平台管理员 |
| 用户可见结果 | 用户可查看历史、提交核查诉求、撤销；管理员可查看/筛选/导出、有专用审批权限者可按原规则驳回；批准退点显示暂停原因且不可触发，不显示到账 |
| 明确保留 | 自动任务失败原路退点实现、用户历史查询/受理/撤销、管理员列表/导出、有专用审批权限者驳回、历史已批准记录 |
| 明确不做 | 不改 `grantPoints`/`refundConsumedPoints`/`executeRefundTx`/自动退款恢复队列、Studio 执行/结算、赠送、定价、BYOK、支付模式、schema；不新建审批中心/队列/账务表或全站权限体系；不计算完整净额、不伪造 `remainingRefundable`、不改历史数据/权限配置 |
| 实际改动 | 5 个源码文件（见第四节）+ 1 个新增定向测试 + 报告与快照 |

---

## 一、权限与暂停契约

### 权限（A）

核实 `src/app/api/admin/permissions/route.ts:402–428`：

| 键 | 语义 | level |
|---|---|---|
| `order:read` | 查看支付订单流水 | read |
| `order:refund_approve` | 终审并将资金原路退回（资金不可逆） | **high** |

`resolve` 的 **APPROVE 与 REJECT 均改为** `requirePlatformPermission(request, "order:refund_approve")`，在**读取指定申请与任何业务写之前**检查。未登录 401、无权限 403 按既有 helper 契约；响应不含申请编号/金额/用户。未自动授予权限、未写数据库权限配置、未用前端按钮隐藏或角色字符串替代后端权限。只持 `order:read` 的管理员仍能 GET 列表与导出（导出另需 `billing:export`），但既不能 APPROVE 也不能 REJECT。

### 人工 APPROVE 暂停（B）

| 项 | 契约 |
|---|---|
| HTTP | **409** |
| 响应 | `{ success:false, code:"MANUAL_REFUND_APPROVAL_PAUSED", error:"人工批准退点暂不可用，申请保留待核查；不会因此重复退点或转入个人钱包" }` |
| 拒绝位置 | 权限校验 → 动作/理由校验 → **立即返回**，在 `prisma.refundrequest.findUnique`、`grantPoints`、钱包/池/桶/流水/账单写、`APPROVED` 状态变更、成功通知之前 |
| 副作用 | 零业务写；工单保持 `PENDING`，不自动 REJECTED/删除/清账/补退/扣回 |
| 禁止项 | 无环境开关、无管理员后门、无默认恢复、无旁路接口；`grantPoints` 与自动原路退款未全局禁用 |

暂停原因如实说明「无法证明净可退额度与原扣款来源」，不承诺恢复时间、人工到账时限或并不存在的客服能力。

### REJECT（C）

沿用理由校验（≥5 字）与 PENDING 限制；状态写改为 `updateMany({ where: { id, status: "PENDING" } })` 并**检查 count**，避免旧读覆盖新状态，不重做全站状态机。驳回通知如实显示「未通过」，不含任何退点/到账承诺。

### 能力事实与金额口径（两个 GET，仍只读）

后台 GET 与用户 GET 新增 `capabilities`：`manualApprovalPaused: true`、`manualApprovalCode`、`manualApprovalMessage`、`pointsAreReferenceOnly: true`。不是资金授权、不是可配置开关；旧页/直接 HTTP 仍由后端拒绝。`points` / `candidates[].points` 明确为**历史累计扣点参考申请值**，未扣既有自动退款、未核验原来源，**不是已核准净可退金额**；未新增任何伪净额字段。

---

## 二、页面与用户入口

| 位置 | 改动 | 保留 |
|---|---|---|
| `admin/finance/refund-requests/page.tsx` | 顶部与统计改为「待核查/申请参考值」，历史已批准标注「历史记录」；「同意退款」按钮改为禁用「批准退点（暂不可用）」并显示暂停原因；`resolve` handler 对 APPROVE 只给 `toast.info` 暂停提示、**不发 POST、不显示到账**；`ResolveModal` 批准分支标题改「人工批准退点暂不可用」、确认按钮禁用、移除「真实退点/写 REFUND 流水/不可撤销」承诺；金额改「申请参考值（历史累计扣点，非已核准净可退金额）」 | 工单查询、筛选、分页、导出、驳回入口与 REJECT 成功提示、历史已批准流水号展示 |
| `UserRefundRequests.tsx` | 新增醒目暂停说明条（申请保留待核查、不重复退点/不转个人钱包、历史累计扣点仅参考、技术失败原路自动退点不受影响）；状态 `待审批→待核查`；「可退额度」→「历史扣点（参考申请值）」；申请弹窗「申请退回 X 点」→「参考申请值 X 点」；「累计已退回」标注历史记录；不鼓励重复提交、不误报到账 | 历史 GET、提交核查诉求、撤销、筛选排序、刷新、历史 APPROVED 记录 |

---

## 三、D01—D08 验收结果

隔离夹具：内存账务/工单夹具记录所有业务写、钱包/池/桶/流水、通知与**权限 helper 实际被请求的键**；只替换认证/权限/持久化/通知/审计 IO，**真实** resolve POST、用户 GET/POST/DELETE、后台 GET 不 mock；`grantPoints` 若被误调用会同时记调用数与资金写。

**先复现失败**：把 3 个后端文件临时换成 `frozen-source/` 开始态原始副本，用**完全相同**的断言执行 → **11 failed / 5 passed，退出码 1**；`finally` 恢复并逐项校验哈希一致，修复版同组断言 **16 passed，退出码 0**。未实际回退工作区。

| 编号 | 场景 | 结果 |
|---|---|---|
| D01 | 只持 `order:read` 分别 APPROVE/REJECT、未登录、只读 GET | **通过**：APPROVE/REJECT 403 且 `requestedPermissions === ["order:refund_approve"]`；未登录 401；零写、响应无申请信息泄露；只读用户仍能 GET 列表/导出且无写 |
| D02 | 持 `order:refund_approve` 批准普通钱包申请 | **通过**：409 + `success:false` + 稳定 code/文案；PENDING、钱包、原桶、流水不变；`grantPoints` 调用 **0**；无成功通知；响应不含申请/金额/余额字段 |
| D03 | 企业池、赠送、混合/来源缺失、已自动全额退点 | **通过**：5 组全部 409，零资金写；不新增退款流水、不改归属、不自动改历史；工单仍 PENDING；未伪造净额算法 |
| D04 | 同单重复 5 次、并发 8 次（含多申请同任务） | **通过**：全部 409；`grantPoints=0`、钱包/池不变、所有工单 PENDING、无幂等键旁路 |
| D05 | 专用权限合法 REJECT / 理由不足 / 已处理单 / 只读者 / 并发 REJECT | **通过**：合法驳回 200 + PENDING 条件裁决 + 零加点 + «未通过»通知；理由不足 400、只读者 403、已处理单 409 且历史 APPROVED 不改写；4 路并发仅 1 个成功 |
| D06 | 用户历史/受理/撤销、后台列表/导出、未登录边界 | **通过**：GET 返回暂停能力与参考口径、无 `remainingRefundable`、GET 无写；受理成功但 `grantPoints=0`/钱包 0，撤销可用；同一任务已有申请不再出现在候选（不鼓励重复提交）；未登录 GET/POST/DELETE 与后台 GET 均 401 |
| D07 | 真实管理员页/用户组件/handler | **24/24 通过**：批准控件禁用并说明原因、handler 不发批准 POST/无成功到账 Toast/给暂停提示；驳回入口、弹窗、能力事实保留；用户组件暂停说明与参考金额口径、不宣称净额；后端契约核对：只请求 `order:refund_approve`、无 `grantPoints`、APPROVE 暂停在读申请之前、REJECT PENDING 条件写 + count |
| D08 | 冻结回归与自动退款保护 | **通过**：7 个隔离文件 **234 tests passed**（218 冻结 + 16 D 批）；企业池 18/18、收银台 21/21、D 页面 24/24；`tsc` 退出码 0；自动退款/账务原语 5 个文件哈希与 C 审核记录一致（**零差量**） |

### 零资金写证据（统一断言）

`grantPointsCalls === 0`；钱包/池 BigInt 前后一致；`pointgrant`/`userwallet`/`pointledger`/`billingrecord` 写调用为空；工单 `status` 保持 `PENDING`、`refundLedgerId` 仍为 null；`notifications` 为空；APPROVE 响应无 `refunded`/`refundLedgerId`。APPROVE 在读取申请之前即返回，因此连工单查询都不发生。

### 相邻功能保持证据

- `src/lib/credit-service.ts` `1ad8a8e3…`、`seat-addon-fulfill.ts` `a680ceb2…`、`fulfill.ts` `2fde4030…`、`payment-cashier-display.ts` `541726f8…`、`order-expiry.ts` `15b9395b…` 与 C 审核记录一致（本批零改动）；自动任务失败原路退点流水在测试中保持 `scope=WORKSPACE`，人工 APPROVE 不再新增任何 REFUND 流水。
- 用户 GET/POST/DELETE、后台 GET（含 `billing:export` 校验）身份边界与只读性质未改；REJECT 流程、筛选、导出、历史记录展示未删。
- 本批 5 个文件差量行号集中在权限键、APPROVE 分支、能力事实字段、批准按钮/handler、暂停说明与金额标签。

---

## 四、真实开始副本、哈希与最小差量

- 采集时间 `2026-11-07T00:32:57+08:00`；`HEAD = 761684be8d5661d6ed288f3b91d1fedfdc795a75`；开始时 `git status` 118 项（104 modified / 14 untracked）前批与他人改动，未 reset/clean/restore。
- 改动前保存的 5 个原始副本哈希与 R0-C 独立审核 `next-refund-verification.json` 的 `sha256` **逐项一致**；副本加 `.frozen` 后缀退出 `tsconfig` 收集，内容逐字节未变。

| 文件 | 开始态 SHA256 | 结束态 SHA256 | 差量 |
|---|---|---|---|
| `src/app/api/admin/refund-requests/[id]/resolve/route.ts` | `61c31ee1…` | `3bc318e1…` | +49 / −79 |
| `src/app/api/admin/refund-requests/route.ts` | `24c2fc56…` | `76f3a31b…` | +9 / 0 |
| `src/app/admin/finance/refund-requests/page.tsx` | `a9e97fb6…` | `d224befc…` | +52 / −36 |
| `src/app/api/user/refund-requests/route.ts` | `b9513aff…` | `ab996378…` | +9 / 0 |
| `src/components/UserRefundRequests.tsx` | `b51c14ad…` | `583d3bee…` | +16 / −10 |

新增：`src/app/api/__tests__/r0d-refund-approval.test.ts`、本报告、`R0-D-fix-snapshot/`（manifest、两份源码副本、`verify-r0d-pages.cjs`）。

**受保护差量回退方案（未实际执行）**：按上表 5 组开始/结束哈希逐项反向应用本批差量；执行前重新核对当前哈希与后续/他人改动，不整文件盲覆；删除本批新增的测试、报告与快照目录不影响运行时；保留自动退款原语、冻结的席位/企业池代码及历史审核材料；`verify-next-refund.cjs` 与 `next-refund-verification.json` 未运行、未修改、不删除。

---

## 五、实际命令与退出码

依赖检查先行：7 个定向测试文件均 `vi.mock("@/lib/prisma")`、无 `new PrismaClient`/`DATABASE_URL`/`mysql://`；未运行全量测试、未下载依赖。

| # | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 1 | `npx vitest run src/app/api/__tests__/r0d-refund-approval.test.ts --reporter=dot`（**开始态原始副本**） | 11 failed / 5 passed（复现权限与错误发放） | **1** |
| 2 | 同上（**修复版**，同一组断言） | **16 passed** | **0** |
| 3 | `npx vitest run <7 个指定隔离文件> --reporter=dot` | **7 files / 234 tests passed**（218 冻结 + 16 D 批），4.93s | **0** |
| 4 | `node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs` | **18/18** | **0** |
| 5 | `node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs` | **21/21** | **0** |
| 6 | `node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs` | **24/24** | **0** |
| 7 | `npx tsc --noEmit --incremental false -p tsconfig.json` | 无诊断输出 | **0** |
| 8 | `read_lints`（5 个改动文件） | 0 诊断 | — |

过程记录（如实）：新增测试首轮因「候选任务应为空（同任务已有申请）」与「撤销需使用新建工单真实 id」两处夹具假设错误而 2 项失败；页面验证脚本因统计卡模板串、TS 类型注解片段需转译、缺失 `react-dom` stub、注释中出现 `remainingRefundable` 字样、候选区空态不渲染而数次调整。全部只修正**夹具/断言写法**，未放宽业务零写、权限或暂停验收，未改历史反例脚本或删除旧用例。最终状态全绿。

---

## 六、数据影响与未验证项

**数据影响**：零真实库写入/迁移/seed/清账/补账/退款；零真实支付、模型、短信、邮件调用；零部署、零密钥读取；未改变任何历史工单、钱包、企业池或权限配置；未批准或驳回任何真实工单。行为上的唯一变化是收紧闸门：只读权限不再能裁决，人工 APPROVE 不再发钱。历史已批准记录如实保留，金额明确降为参考申请值。

**未验证**：真实部署 RBAC / 中间件授权状态（权限夹具只验证路由请求的键，不证明线上角色配置）；真实浏览器 DOM 渲染（页面为 vm 受控执行）；真实数据库并发与行锁；真实渠道/资金退款；当前生产余额与历史已发生损失。

**恢复人工批准前必须由负责人独立验收（本批只列依赖，不实现）**：

1. 所有退款路径共享「净实扣上限」，自动与人工并发同一任务不多退；
2. 按原扣款来源/期限/受限用途逐桶退回（企业池、赠送、付款购买分别处理），不默认发个人钱包；
3. 历史来源不明的记录须人工核查，不得由系统推断补发；
4. 商业补偿与技术失败自动退款分开授权、分开记账；
5. 授权、工单状态、资产与审计可靠一致，含幂等与并发裁决。

---

## 七、状态与停止

D01—D08 与 234 项定向回归、企业池 18 项、收银台 21 项、D 页面 24 项、类型检查全部通过，**到此停止并交回独立审核**：

- **最终状态：R0-D 待独立复核**；
- 冻结本次人工退款止损；不开发完整退款引擎、不恢复企业转个人、不重开席位补修；
- 不宣称完整退款功能修复、生产就绪或平台盈利闭环完成；
- 历史报告与历史反例脚本不覆盖；当前工作区保持修复态，未实际回退。
