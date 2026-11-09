# R0-B1 修复报告：席位状态机收敛 + 空间/报价写边界核验 + 扫码载体 + 收银台诚实展示

**状态：R0-B1 待独立复核**（不部署、不进入下一批）

逐条回应 `docs/reviews/R0-B-independent-review/IDE-R0-B1-PROMPT.md` F1—F4。R0-B 已确认有效的唯一履约权（PENDING 条件更新裁决）与 tx 原子写入全部保留。

---

## 〇、开始基线

- **快照路径**：`docs/reviews/R0-B1-fix-snapshot/manifest.json` + `frozen-source/`（8 个相关文件修改前副本与 SHA256）。
- **真实时间**：`2026-11-06T01:32:18+08:00`（manifest.capturedAtReal，保存时刻实测）。
- 该基线独立于 R0-B 批次快照（`docs/reviews/R0-B-fix-snapshot/`，7 文件）；未覆盖此后其他修改，未 reset/clean/restore，历史报告/脚本/JSON 零改动。

## 最小文件差量

| 文件 | 变更 |
|---|---|
| `src/lib/payment/seat-addon-fulfill.ts` | F1 条件超时关闭；F2 空间状态/企业/报价基准核验（预检 + 事务内重读 + 条件席位写入） |
| `src/lib/payment/fulfill.ts` | F1 外层超时写改条件更新 + 竞争失败分类；其余分支未动 |
| `src/app/api/payments/mock/confirm/route.ts` | F1 同上；幂等响应抽为 `alreadyProcessedPayload`（成功分支与竞争落败共用） |
| `src/app/api/workspace/seat-addon/route.ts` | F3 保存微信 codeUrl 载体（条件更新，仅 PENDING）；REAL 微信缺载体 → 502 明确错误 |
| `src/lib/payment-cashier-display.ts` | **新增** F4 共享展示契约（状态视图/商品类型视图/二维码可用性） |
| `src/app/user/pay/mock/page.tsx` | F4 按状态/类型展示（修正"非 PENDING 一律成功"） |
| `src/app/user/pay/qr/page.tsx` | F4 按类型展示完成结果 + FAILED/REFUNDED/未知分支 + 缺载体明确报错 |
| `src/app/api/__tests__/r0b-seat-addon.test.ts` | 36→65 用例（同步屏障修正 + F1/F2/F3/F4/notify ACK 新组） |

微信/支付宝 notify 路由、`/api/payments/order` 查询路由：**零改动**（codeUrl 读取契约已存在，F3 只补服务端保存）。

---

## 一、F1：超时关闭与成功履约竞争同一订单状态

### 修复内容（三处一致）

原先 `fulfill.ts`、`mock/confirm`、共享服务都按事务外旧读直接 `update(id → EXPIRED)`（且 `.catch(() => {})` 吞写失败）。现三处统一为**带 PENDING 条件的条件更新**：

```text
updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED" } })
count === 1 → 确实超时且仍是 PENDING → EXPIRED 落库 + 拒绝（既有生命周期规则不变）
count === 0 → 竞争失败，按最新状态分类：
  SUCCESS → ALREADY_PROCESSED（不覆盖已成功状态与已发席位；MOCK 返回与既有幂等契约相同的"已处理"响应）
  PENDING → 暂时冲突（可重试，REJECTED+retryable）
  其他   → REJECTED"订单当前状态为 X，不可入账"
```

- 外层入口不再有"绕过共享规则的无条件席位状态写"：三处竞争的是同一个 PENDING 状态，胜者（履约或超时关闭）互斥。
- 移除 `.catch(() => {})`——状态写失败向上抛，不吞掉后宣称已关闭。
- **提交结果不确定口径**：事务失败消息改为"订单状态未确认变更（可凭订单号查询核实），可安全重试同一订单"——不再无条件断言"数据库一定保持 PENDING"；重试同一订单由唯一履约权保证不多发。无自动退款/补账。
- 其他订单类型影响：RECHARGE/PLAN_UPGRADE 的外层超时写同样变为条件更新（只更安全：不会覆盖 SUCCESS），入账规则零变化（回归用例通过）。

### 证据（新测试组 "R0-B1 F1"，5 用例）

审核报告的反例时序（一个请求截止前已获准履约提交 SUCCESS+2 席位；另一个持有旧 PENDING+过期快照）分别注入**共享服务、REAL 外层 fulfillPaidOrder、MOCK POST** 三个入口：最终均 `SUCCESS` 保留、extraSeats=2、迟到请求得到 ALREADY_PROCESSED/已处理响应——不再出现"extraSeats=2 但订单 EXPIRED"。反向用例：确实超时的 PENDING 先被关闭（EXPIRED 落库），后续带旧读的请求不能再发席位、不覆盖其他终态。

## 二、F2：写入边界核验空间与可信报价

### 修复内容

**预检扩展**（快速失败 + 诊断信息）：workspace 读取增加 `status/plan/planBillingCycle`；按 `assertWorkspaceWritable` 同一规则拒绝 ARCHIVED/DISABLED；`metadata.planKey/billingCycle/expiresAt` 三项**必须存在**且与当前空间一致——缺失或变化明确拒绝"请人工核查"，不默认当前配置补齐（修复了"expiresAt 缺失跳过校验"）。

**写边界强制**（解决"检查后在事务前变化"）：

1. 事务内（履约权裁决之后、席位写入之前）**重读空间最新事实**，重核企业类型、可写状态、extraSeats 溢出（考虑同空间并发订单的增量）；
2. 席位增量从无条件 `update` 改为**带关键事实条件的 updateMany**：`{ id, type: "ENTERPRISE", status: { notIn: ["ARCHIVED","DISABLED"] }, plan: 下单planKey, planBillingCycle: 下单cycle, planExpiresAt: 下单到期基准 }`——检查之后到写入之前发生的变化无法通过条件（MySQL 下条件在持锁的当前读上评估），count=0 即整体回滚；
3. `SEAT_QUALIFICATION_LOST` → 订单 SUCCESS 状态与席位**一起回滚**（订单保留 PENDING 原状供人工核查），不产生"成功订单无权益"或"无效空间有权益"；不退款、不改历史账。

说明：`workspace.status` 为非空 `String @default("ACTIVE")`（schema 已核），`notIn` 条件无 NULL 语义风险；未凭空设置商业席位上限（仅 Int 存储边界）；内存数字运算不冒称验证了 MySQL Int 约束。

### 证据（新测试组 "R0-B1 F2"，12 用例）

- ARCHIVED/DISABLED → 拒绝，零席位、订单不落 SUCCESS；
- **检查后变化**：事务内重读时刻把空间改为 PERSONAL → 拒绝且回滚（订单 PENDING、无 seatsAdded）；plan 在写入边界变化 → 条件更新 count=0 → 整体回滚；
- 缺 planKey / planKey 不一致 / 缺 billingCycle / cycle 不一致 / 缺 expiresAt / 到期基准不一致 → 6 组全部拒绝且错误含"人工核查"；
- 同空间两订单并发且接近 Int 上限：合法的一笔成功、溢出的一笔被事务内重读拒绝，终态 1 SUCCESS + 1 PENDING。

## 三、F3：真实微信席位订单的二维码载体

### 修复内容

`seat-addon/route.ts` 在 `createCharge` 成功后：若为 REAL+微信且网关返回 `gatewayPayload.codeUrl`，用**条件更新**（`where: { id, status: "PENDING" }`）把 `codeUrl` 存入订单 metadata——

- 只保存必要的展示载体；不保存整个网关 payload（测试断言 `metadata.gatewayPayload` 不存在）；不接受任何浏览器自传地址（codeUrl 仅来自服务端网关调用）；
- 本人订单查询（`/api/payments/order`，零改动）读取 `metadata.codeUrl` 交收银台渲染二维码；支付宝跳转与 MOCK 契约保持（不写 codeUrl）；
- 载体保存竞争失败（count=0）→ 重读分类：已 SUCCESS 则如实返回"订单已完成入账，无需再支付"；否则 502 明确错误，不覆盖履约记录；
- REAL 微信但网关未返回载体 → **502"未能准备收银台"**，订单保留 PENDING 供重试/人工核查，不伪装可付款、不无限转圈、不自动重下单。

### 证据（新测试组 "R0-B1 F3"，4 用例）

真实 seat-addon POST → 网关 IO 夹具（含 `codeUrl`，符合实际网关返回类型）→ 真实 order GET 组合执行：metadata.codeUrl 与查询返回一致、仅载体本身入 metadata、订单保持 PENDING；他人查询 403；MOCK/支付宝分支无载体且契约不变；缺载体 → 502 + 订单保留。

## 四、F4：收银台按真实状态与商品类型展示

### 修复内容

新增实际生产模块 `src/lib/payment-cashier-display.ts`（两个页面直接导入，非测试副本）：

- `resolveCashierStatusView`：仅 `SUCCESS` 视为完成（isCompleted）；`EXPIRED/FAILED/REFUNDED/未知` 分别呈现真实含义、合适语气与"请勿重复支付/凭订单号联系客服"提示；
- `resolveCashierSuccessView(type, seats)`：席位成功 → "已为空间增购 N 个席位" + 空间工作台入口（**不说算力到账、不引导点数流水**）；充值 → 算力到账 + 点数流水；套餐 → 企业空间已开通 + 工作台；未知类型中性"支付成功" + 账单入口；
- `isQrReady`：仅 PENDING 且有载体展示二维码。

**模拟页**（`/user/pay/mock`）：修复"status!==PENDING 就显示已完成支付并入账"——加载时仅 SUCCESS 显示完成，EXPIRED/FAILED/REFUNDED/未知按语气（琥珀/玫红/中性）显示具体含义 + 查看账单/返回；确认成功（含"已处理"）才写完成态，文案来自服务端；状态行按真实状态着色；成功 CTA 按商品类型（席位 → 空间工作台）。

**扫码页**（`/user/pay/qr`）：OrderInfo 增加 `type/seats`（既有查询字段，最小扩展）；SUCCESS 按类型展示文案与入口；新增 FAILED/REFUNDED/未知分支；"重新下单"改为"返回收银台"（不提示自动重新购买）；**缺二维码载体从无限加载 spinner 改为明确报错 + 返回收银台出口**；页脚"算力入账"改为按订单类型入账的中性表述。

### 证据（新测试组 "R0-B1 F4"，4 用例）

展示契约按全部状态 × 商品类型执行（实际生产函数）；页面接线为源码级核验：两页导入 `payment-cashier-display`、旧错误模式字符串（非 PENDING 成功文案、无条件"支付成功，算力已到账"）已不存在、缺载体错误文案存在。**如实说明**：React 组件/效果级执行与浏览器 DOM 仍未做（见未验证项）。

## 五、审核要求的测试修正与新组合

- **同步屏障修正**（替换原"强制陈旧预读"用例）：新增屏障机制（前 N 次根客户端账单预读返回种子时刻 PENDING 快照）+ `billingReadLog` 读日志断言——`Promise.all` 两个竞争者的前两次读取均记录 `["PENDING","PENDING"]`，随后恰好一次 FULFILLED、席位 +2。原 Promise.all 用例保留。
- **真实 notify 路由 ACK**（验签 IO stub，模拟验签结果非实际交易，不放宽生产验签）：微信验签失败 401 / SUCCESS 入账+规范 ACK / 重复通知零重复入账仍 200 / 拒绝 500 FAIL（渠道重试约定）；支付宝 success 纯文本 / fail 500。
- **历史反例脚本 `verify.cjs` 实测 exit 1**（未改动该脚本）：其第一个断言（对照组 same_order_concurrency 期望 extraSeats=2）得到 0——该脚本的 Prisma stub 只有 `workspace.update` 没有 `updateMany`，而修复后的服务按 F2 要求使用**条件 workspace updateMany**，stub 缺该方法导致履约被拒；其后断言旧缺陷存在的反例同样不再成立。此脚本作为历史证据保留，不修改；本批正确回归为 `r0b-seat-addon.test.ts`（65 用例，夹具含完整报价事实与 updateMany 支持）。

## 六、验证命令与退出码（本批实测）

```text
npx vitest run --no-color src/app/api/__tests__/r0b-seat-addon.test.ts
→ 1 file, 65 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts
  src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts
  src/app/api/__tests__/r0a4-combo-regression.test.ts
→ 5 files, 174 tests passed, exit 0（R0-A/R0-B 有效保护零回退）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-B-independent-review/verify.cjs
→ exit 1（历史反例脚本，见第五节说明；未修改）
```

均定向运行、本地工具；未全量测试、未连真实库、未写真实数据、未下载依赖。

## 七、对原报告不准确项的更正（历史不倒改）

R0-B 修复报告第五节"页面满足 E 要求零改动"不成立：模拟页把所有非 PENDING 状态显示为成功、扫码页对席位订单显示算力到账——本批已修正并在新测试中固化。R0-B 报告"写入序列同构"等并发证据仍有效（保留于本批用例）。

## 八、数据/账务影响、未验证项与回滚

- 本批零真实库写入/迁移/seed/补账、零真实支付/模型调用；定价/赠送/名额/BYOK/结算开关零变更；月年折算/舍入/零元报价仍未动（商业复核门）。
- **未验证**：真实 MySQL 行锁/隔离级别/条件更新并发语义（内存为串行化模拟）；浏览器 DOM 渲染与端到端支付；React 组件级执行（页面验证为共享生产函数 + 源码接线核验）；真实网关/证书。
- 前批真实库测试残留影响仍未核实（未连库调查）。
- **回滚**：用 `docs/reviews/R0-B1-fix-snapshot/frozen-source/` 副本覆盖对应源文件；删除本批新增的 `seat-addon-fulfill.ts`（R0-B 版本可从 R0-B 快照恢复）、`payment-cashier-display.ts` 并还原页面/路由即可；无 schema/DDL 依赖。

完成即停止：不进入 R0-C、不部署、不宣称生产就绪或席位商业闭环完成。
