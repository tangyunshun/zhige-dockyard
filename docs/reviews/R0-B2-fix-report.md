# R0-B2 同批补修报告（待独立复核）

> **状态：R0-B2 待独立复核**。不进入 R0-C、不部署、不宣称生产就绪或平台盈利闭环完成。
> R0-B1 尚未通过独立审核；本批仅关闭 B2-1—B2-4，保留 R0-A 商业边界与 B/B1 全部有效修复。

---

## 〇、理解确认（目标 / 假设 / 文件 / 验收 / 边界）

| 项 | 内容 |
|---|---|
| 目标用户 | 企业空间所有者 |
| 目标流程 | 有效空间按可信周期下单 → 获取真实可用收银台 → 在明确有效的订单/套餐条件下确认 → 一次发放席位 → 新支付、重新打开、重复确认都显示准确结果和空间入口 |
| 核心承诺 | 平台不再制造「明知当前履约规则会拒绝」的可付款订单；不在预检之后的时间窗口错误履约 |
| 涉及源码文件（4 改 + 1 测） | `src/lib/payment/seat-addon-fulfill.ts`、`src/app/api/workspace/seat-addon/route.ts`、`src/lib/payment-cashier-display.ts`、`src/app/user/pay/mock/page.tsx`、`src/app/api/__tests__/r0b-seat-addon.test.ts` |
| 新增（非源码） | 本报告、`docs/reviews/R0-B2-fix-snapshot/`（manifest、两份验证脚本、结束态源码副本） |
| 未改动但已复核 | `src/lib/payment/fulfill.ts`、`src/app/api/payments/mock/confirm/route.ts`、`src/app/api/payments/order/route.ts`、`src/app/user/pay/qr/page.tsx`、`src/lib/order-expiry.ts`、`src/lib/workspace-readonly-guard.ts` |
| 用户可见验收 | ① 预检后跨期限不再错误发席位；② 非法周期空间下单被明确阻断；③ 成功/刷新/重复确认都显示席位结果与空间入口；④ 失败/过期/退款/未知如实呈现 |
| 数据/费用边界 | 零真实库写入/迁移/seed/补账/退款，零真实支付/模型调用，零定价/赠送/结算/BYOK/支付模式变更，零 DDL/渠道，零退款或宽限政策新增 |

**范围纪律**：未重写充值/套餐升级/退款/企业池，未改验签、价格公式、折算/舍入、月年乘数、历史差额；未给年付乘 12；QR 页源码零改动，仅做组件级回归。历史审核脚本 `verify.cjs`、旧报告、旧 JSON 与冻结快照全部保持不动。

### 开始快照（时间 / git / 哈希 / 差量）

- 采集时间 `2026-11-06T22:34:03+08:00`；`HEAD = 761684be8d5661d6ed288f3b91d1fedfdc795a75`；采集时 `git status --porcelain` 计 **115** 项未提交修改（前批 + 他人变更，本批未 reset / clean / restore / 清理）。
- **诚实说明**：本会话为延续执行，源码编辑先于快照采集发生，故 `R0-B2-fix-snapshot/frozen-source/` 保存的是**本批结束态**副本；**本批开始态**由 R0-B1 独立审核产出的 `verification.json` 的 `baseline[].expectedSha256` / `sha256` 字段锚定（非本批生成）。
- 基线可信性已验证：本批**未改动**的 4 个文件当前哈希与 B1 复核基线完全一致（`fulfill.ts` `2fde4030…`、`mock/confirm` `2795103f…`、`qr/page.tsx` `12663337…`、`order-expiry.ts` `15b9395b…`），说明期间无他人改动覆盖这些路径。
- 可识别差量（开始态 SHA256 → 结束态 SHA256）：

| 文件 | B2 开始态 | B2 结束态 |
|---|---|---|
| `src/lib/payment/seat-addon-fulfill.ts` | `fe8650986e…` | `4fc0e9a42e…` |
| `src/app/api/workspace/seat-addon/route.ts` | `4483ec5f18…` | `0ab6a55c34…` |
| `src/lib/payment-cashier-display.ts` | `644fe0cdd9…` | `541726f855…` |
| `src/app/user/pay/mock/page.tsx` | `421add3321…` | `0f0b2d8430…` |
| `src/app/api/__tests__/r0b-seat-addon.test.ts` | `102a5598b6…` | `ee29b40ac5…` |

完整哈希与副本路径见 `R0-B2-fix-snapshot/manifest.json`。

---

## 一、B2-1 订单与套餐期限的最终裁决

### 问题
预检时订单还有 500ms，事务开始前排队等待 2s 后仍会 `SUCCESS + 2 席位`；套餐在预检后到期同样发放。事务外预读 + 事务外 `Date.now()` 无法覆盖「预检通过 → 排队 → 取锁 → 跨期限」的窗口。

### 改动（`seat-addon-fulfill.ts`）
1. **授权裁决边界 = 进入事务回调后、第一条条件写之前**：`const now = new Date()` 从事务外移到 `$transaction` 回调内第一行。排队/取锁等待发生在进入回调之前，因此等待消耗的时间计入该 `now`；同一 `now` 供订单期限与套餐有效性两处判断，全链路统一项目既有 JS `Date` 口径，不混用 MySQL `NOW()`。
2. **订单期限在唯一履约权的条件写边界重新核验**：`claimed = updateMany({ where: { id, status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] } })`。
   - 与 `order-expiry.ts` 的 `isOrderExpired`（过期定义 `now > expiresAt`）严格对齐，故「仍可履约」= `expiresAt >= now`（`gte`，恰好相等不算过期）；
   - `OR ... expiresAt: null` 显式保留历史「无支付截止」订单的原有语义，避免新增条件静默拒绝历史订单；
   - 仅在 PENDING 且期限有效时可置 SUCCESS，并发/重复请求仍只有一个 `count=1`。
3. **套餐有效性在席位条件写边界重新核验**：`planExpiresAt: { gt: now, equals: expectedExpiresAt }`。`equals` 保留 B1 的「报价基准未被改写」校验，`gt: now` 新增「写边界时刻套餐仍未到期」；检查之后到写入之前的变化无法通过条件，`count=0` 抛 `SEAT_QUALIFICATION_LOST` → 同事务整体回滚。
4. **诚实分类与保护既有修复**：`SEAT_CLAIM_LOST` 后用根客户端重读最新状态分类（事务内快照可能滞后）：
   - 最新 `SUCCESS` → `ALREADY_PROCESSED`，**绝不覆盖已成功订单/履约 metadata/已发席位**；
   - 最新仍 `PENDING` 且确实 `isOrderExpired` → **条件** `updateMany({ where: { id, status: "PENDING" } })` 置 `EXPIRED`，`count=0` 时再重读并按最新状态分类（不无条件断言）；
   - 最新仍 `PENDING` 但未过期 → 暂时竞争冲突，可安全重试。
5. 外层 REAL（`fulfill.ts`）与 MOCK（`mock/confirm`）均未绕开：两者对本类型都直接调用同一 `fulfillSeatAddonOrder`，最终裁决在共享服务内完成；两个入口本批零改动（哈希与 B1 基线一致）。

**未采用**「给 updateMany 加一个事务前算出的常量时间」的伪修复；时间取自事务回调内，且条件写在持锁当前读上求值。本批**不连接真实数据库证明锁**。

### 用户可见结果 / 错误码
- 预检后跨支付截止：共享服务 `REJECTED「订单已超时未支付，拒绝入账」`；REAL 外层同；MOCK 确认 `409` 明确错误；订单诚实 `EXPIRED`、零席位。
- 套餐在写边界前到期：`REJECTED「空间资格或报价基准已变化，席位未发放，请人工核查（订单保留待支付原状）」`，订单回滚保留 `PENDING`、零席位。
- 已合法裁决完成的事务：迟到/旧读过期请求返回 `ALREADY_PROCESSED`，`SUCCESS` 与席位不被反转。
- 正常窗口内：一次 `FULFILLED`、席位 +2、状态 `SUCCESS`。

### 一次性发放与原子回滚（保留并强化）
条件写争唯一履约权 → 事务内重读 → 带条件席位写入，全部使用同一 `tx` 客户端；状态、席位增量、履约 metadata 同事务提交/回滚。B1 的故障注入用例（各写点失败 / commit 失败 / 根客户端写逃逸 / 同单重试不多发）本批全部保持通过。

---

## 二、B2-2 下单与履约的统一周期规则

### 改动
1. **收费入口前置阻断**（`src/app/api/workspace/seat-addon/route.ts`）：在读取到服务端真实空间事实之后、**创建订单与调用 `createCharge` 之前**新增
   `const billingCycle = workspace.planBillingCycle; if (billingCycle !== "MONTH" && billingCycle !== "YEAR") return 400`，错误文案「当前空间的计费周期不合规（仅支持月付/年付），无法创建增购订单，请人工核查」。
   通过校验后 `daysInCycle` 与 `metadata.billingCycle` 统一使用**已校验的** `billingCycle`（`YEAR→365`、`MONTH→30`），价格公式与舍入**一字未改**。
2. **履约端独立拒绝**（`seat-addon-fulfill.ts`）：`orderCycle && orderCycle !== "MONTH" && orderCycle !== "YEAR"` → `REJECTED「订单计费周期非法（仅支持月付/年付），拒绝入账，请人工核查」`，位于「与空间周期一致性」判断**之前**，因此即使订单与空间**同为 WEEK** 也拒绝；缺 `billingCycle` 仍走原有「缺计费周期」拒绝；不改历史数据、不默认补 MONTH。
3. 遵循最小实现：两处均为两值白名单比较，未搭建配置框架。

### 用户可见结果 / 错误码
- 空间周期 `null` / `""` / `WEEK` / `week` / `QUARTER`：`400`，**零新订单、`createCharge` 调用 0、零席位变化、原账不变**。
- 历史损坏订单周期非法（含双方同为 WEEK）：履约 `REJECTED`，订单保留 `PENDING` 列人工核查。
- `MONTH` / `YEAR` 合法链路：真实 `POST` 下单 → 网关载体 stub → 本人 `GET /api/payments/order` 读回 `codeUrl` 与周期 → 真实履约一次 `FULFILLED`，金额 > 0、无重复发放。

---

## 三、B2-3 模拟收银台完成状态

### 改动
1. **共享展示契约**（`payment-cashier-display.ts`）新增两个真实函数，页面与测试共用：
   - `resolveCashierCompletion(type, seats, status)`：以业务状态 `SUCCESS` 决定完成与否，返回按商品类型的完成文案与入口；
   - `isConfirmedSuccessResponse(res)`：`success === true` 且携带完成证据（`alreadyProcessed` / `seats` / `points` / 非空 `workspaceId`）之一才算业务成功。
2. **模拟页**（`src/app/user/pay/mock/page.tsx`）：
   - 完成分支由 `completion.completed`（业务状态）决定，**不再用 `result.tone === "success"` 颜色判断**；重复确认的 `alreadyProcessed` 中性提示仍进入完成区并展示空间入口；
   - 首次加载 / 刷新已成功订单：`view.isCompleted` 时按商品类型写入完成结果，直接打开不再出现「禁用支付按钮且无入口」；
   - POST 仅 `isConfirmedSuccessResponse(res)` 为真才把本地订单置 `SUCCESS`；2xx 但 `success:false`、缺完成证据、非 2xx、网络失败都保留原状态并给出核查提示，不新增付款请求；
   - 每次订单数据重新加载时 `setResult(null)`，避免上一单 result 残留；
   - MOCK 非真实扣款说明、REAL 模式门禁（403 降级）、归属校验、失败/过期/退款/未知状态呈现全部保留。
3. **QR 页零改动**，仅做组件级回归：席位成功仍显示席位数与空间入口、不改回「算力已到账」；缺载体仍明确报错。

### 用户可见结果
| 场景 | 结果 |
|---|---|
| 直接打开 / 刷新成功席位订单 | 「支付成功，已为空间增购 N 个席位」+「返回空间工作台」「查看算力账单」，无点数流水入口、无支付按钮 |
| 正常首次确认成功 | 同上完成分支 + 空间入口 |
| 重复确认成功 | 「该订单此前已完成入账，未重复扣款。」仍在完成分支 + 空间入口，零重复入账 |
| 2xx 业务失败 / 缺完成证据 / 非 2xx | 本地订单保持 `PENDING`，显示核查提示，不出现完成入口 |
| EXPIRED / FAILED / REFUNDED / 未知 | 各自如实话术 + 「查看账单记录 / 返回」，不误报成功 |
| 切换订单 | 新订单按自身状态呈现，旧单成功结果不残留 |

---

## 四、B2-4 回滚方案更正（不实际回退）

### 更正旧结论（旧报告不覆盖）
`docs/reviews/R0-B1-fix-report.md` 第 145 行称「删除本批新增的 `seat-addon-fulfill.ts`（R0-B 版本可从 R0-B 快照恢复）、`payment-cashier-display.ts`」——**该结论错误且危险**：

| 事实 | 证据 |
|---|---|
| **B 开始快照不含** `seat-addon-fulfill.ts` | `R0-B-fix-snapshot/manifest.json` 的 7 个文件列表；且 B 快照目录无该服务副本 |
| **B1 开始快照已含** `seat-addon-fulfill.ts` | `R0-B1-fix-snapshot/manifest.json` 8 个文件列表；副本哈希 `e949ced3379c…` = `verification.json` 的 `baseline.expectedSha256` |
| 该服务在 **B2 开始前已存在且已修好** | B1 复核哈希表 `fe8650986e…`；当前文件仍含 `SEAT_CLAIM_LOST` / `SEAT_QUALIFICATION_LOST` / `isOrderExpired` 等 B1 有效修复 |
| `payment-cashier-display.ts` 在 **B2 开始前已存在** | B1 复核哈希表 `644fe0cdd9…` |
| 「可从 B 快照恢复该服务」**不成立** | B 快照中根本不存在该文件的副本 |
| B1 开始快照是**修复前**版本 | 隔离副本验证：该副本不含 `SEAT_QUALIFICATION_LOST`，整文件覆盖会丢掉 B1 的 F1/F2 有效修复 |

结论：二者均为**前批既有有效文件**，回退 B1 或 B2 都**必须保留**，连同 3 个导入方（`fulfill.ts`、`mock/confirm/route.ts`、`r0b-seat-addon.test.ts`）与页面展示契约保持配套。本批**未新增任何源码文件**，因此 B2 回退不涉及删除源码文件。

### 导入关系（已解析）
```
src/lib/payment/fulfill.ts                      -> @/lib/payment/seat-addon-fulfill
src/app/api/payments/mock/confirm/route.ts     -> @/lib/payment/seat-addon-fulfill
src/app/api/__tests__/r0b-seat-addon.test.ts   -> @/lib/payment/seat-addon-fulfill
src/app/user/pay/mock/page.tsx                 -> @/lib/payment-cashier-display
src/app/user/pay/qr/page.tsx                   -> @/lib/payment-cashier-display
```

### 正确的差量回退方案（保护后续改动）
1. **执行前检查**：重新计算 5 个文件的当前 SHA256，与本报告「B2 结束态」逐一比对；若任一不符，说明存在后续/他人改动，**停止整文件覆盖**，改为只对该文件做逐段人工比对。
2. **逐项反向应用，不整文件盲覆**：按本报告第一~三节列出的改动点，在 5 个文件中分别回退（时间裁决条件写 + `gte/OR`、周期白名单两处、展示契约两个新函数、页面完成分支与完成证据判定、测试新增用例与夹具算子）。回退目标是 **B2 开始态**（即 B1 复核后状态，哈希见上表），**不是** B1 开始快照。
3. **配套一致性**：若回退 `seat-addon-fulfill.ts`，同步回退测试夹具（否则 `gte`/`OR`/`evalWhere` 与新条件不匹配）；若回退展示模块，同步回退两个页面对 `resolveCashierCompletion` / `isConfirmedSuccessResponse` 的引用，否则会编译失败。
4. **可删除的仅为本批新增的非源码产物**：`R0-B2-fix-report.md` 与 `R0-B2-fix-snapshot/` 目录（删除不影响运行时导入）。**不得删除**任何源码文件。
5. **回退 B1 时**：使用 `R0-B1-fix-snapshot/frozen-source/` 副本逐文件比对并保留 B1 之后的修复；同样不得删除 `seat-addon-fulfill.ts` / `payment-cashier-display.ts`。
6. 无 schema / DDL 依赖，无数据迁移；回退后无需账务冲正（本批未产生任何真实账务写入）。

### 隔离副本验证（绝不回退工作区）
`docs/reviews/R0-B2-fix-snapshot/verify-rollback-plan.cjs` 在系统临时目录构造模拟回退树，验证：前批服务仍存在且导出 `fulfillSeatAddonOrder`、3 个导入方引用可解析、展示契约函数存在、B1 开始快照确为修复前版本（不能整文件覆盖）、本批 5 个文件均能与 B1 基线形成可识别差量。**17/17 检查通过，退出码 0**；临时树退出即删，工作区未做任何写入。

---

## 五、验证（依赖检查 → 定向执行 → 退出码）

**依赖检查（先做）**：`vitest.config.ts` 明确仓库存在直写真实 MySQL 的集成测试，故**禁止全量 `npm test` / `vitest`**；仅对 5 个指定 R0 文件逐文件检查 `vi.mock("@/lib/prisma")` 与真实库标记，结果 5/5 均已隔离数据库、无 `new PrismaClient` / `DATABASE_URL` / `mysql://`。未下载任何依赖（TypeScript / React 均为仓库既有）。

| # | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 1 | `npx tsc --noEmit --incremental false -p tsconfig.json` | 无诊断输出 | **0** |
| 2 | `npx vitest run src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts --reporter=dot` | **5 files / 194 tests passed**（174 项既有回归 + 20 项本批新增），3.32s | **0** |
| 3 | `node docs/reviews/R0-B2-fix-snapshot/verify-rollback-plan.cjs` | 17/17 checks passed（隔离副本回退验证） | **0** |
| 4 | `node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs` | 21/21 checks passed（组件级执行：模拟页 14 + QR 页 7） | **0** |
| 5 | `read_lints`（5 个改动文件） | 0 诊断 | — |

补充过程中曾出现并被修正的中间失败（如实记录）：`tsc` 曾报 2 处联合类型 `r.error` 未收窄（已改为 `r.ok === false && r.error`）；回滚验证脚本首版因 `manifest.files` 为字典而抛 `TypeError`（已兼容），且一项「B1 有效修复仍在」断言错误地以 B1 **开始**快照为对象（已改为显式验证该快照是修复前版本）。这些均为本地诊断修正，最终状态全绿。

### 新增测试的真实执行证据（非源码字符串检查）
- **真实服务**：`fulfillSeatAddonOrder` / `fulfillPaidOrder`（REAL 外层）直接调用，覆盖预检后跨期限的三条入口（共享 / REAL / MOCK）、套餐写边界到期、时间相等边界、`expiresAt: null` 历史订单、已成功订单不被超时反转。
- **真实路由**：`seatAddonPOST`（收费前阻断）、`orderGET`（本人查询 codeUrl）、`mockConfirmGET` / `mockConfirmPOST`（成功恢复、首次确认、重复确认）、MONTH/YEAR 完整下单→网关 stub→查询→履约组合。
- **真实页面调用者**：`verify-b2-cashier.cjs` 用 TS 转译 + `vm` **执行真实 `MockCashierInner` 与 `PayQrPage` 组件**（仅替换 hook / JSX / fetch / qrcode 等 IO），配合**真实** `payment-cashier-display.ts`；覆盖直接打开、刷新、正常确认、重复确认、2xx 业务失败、缺完成证据、非 2xx、四类终态、切换订单残留，以及 QR 页按类型展示与缺载体错误。
- 内存 Prisma 夹具扩展为对 `notIn / gt / gte / lt / lte / equals / in / OR` 按真实语义求值，未知算子抛错而非静默放行；条件更新不恒 `count=1`，事务不空操作，模拟时间用 `vi.useFakeTimers` + `advanceTimersByTime` 确定性推进（无真实 sleep），事务入口排队等待可重现。

---

## 六、数据 / 账务影响

- **零真实数据库写入 / 迁移 / seed / 补账 / 退款**；零真实支付、模型、短信、邮件调用；零环境密钥读取或打印；零部署。
- 定价与商业边界：价格公式、折算、舍入、月年天数、赠送、名额、BYOK、结算开关、支付模式**全部未动**；月年价格公式仍标「待商业复核」，本批不借校验之名修改价格。
- 账务影响仅在**行为闸门**：非法周期不再产生「可付款但必然被履约拒绝」的 PENDING 订单；预检后跨期限不再错误发放席位。对已合法发放的订单**不撤回、不清账、不自动退款**；无法合法履约时按已有拒绝/重试/人工核查边界诚实返回并保留诊断证据。
- 未新增退款、宽限期、补差或后台恢复系统；未改历史数据库记录。
- `git status` 中 115 项前批/他人未提交修改保持不动；历史审核材料、冻结快照、`verify.cjs` 均未改动。

---

## 七、未验证项（明确标注）

1. **真实 MySQL 行锁 / 隔离级别 / 条件写在持锁当前读上的并发语义**：本批未连接真实数据库；内存事务为串行化模拟，`gte` / `OR` 条件在内存夹具中求值，**不构成数据库并发证据**。需独立复核阶段在隔离库验证。
2. **浏览器 DOM / 端到端真实支付**：组件级执行为 `vm` 受控执行（stub hook / JSX / fetch），**不是浏览器渲染验收**；真实网关、证书、二维码生成、轮询均未验证。
3. **真实业务数据**：未查询当前生产数据；历史真实库测试残留不在本批调查或清理范围。
4. **商业口径**：月年定价与折算公式的合理性仍待商业复核；本批只保证「规则一致、不误收费」，不保证定价正确。
5. **其他潜在「新建可付款订单必然被当前履约规则拒绝」的不一致**：本批在席位增购链路内已处理周期与期限；未扩展为全站定价/订单一致性重构，其他链路未调查。

---

## 八、状态与停止

本批完成 B2-1—B2-4 的源码补修、定向隔离验证与回滚方案更正，**到此停止并交回独立审核**：

- **最终状态：R0-B2 待独立复核**；
- 不进入 R0-C、不部署、不宣称生产就绪、不宣称平台盈利闭环完成；
- 不覆盖 `R0-B1-fix-report.md` 等历史报告，本报告为更正说明的新增文件；
- 未执行任何回退（仅临时副本模拟验证），当前工作区保持修复态。
