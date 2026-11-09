# R0-B 修复报告：席位订单唯一履约 + 原子入账

**状态：R0-B 待独立复核**（不部署、不进入下一批）

本批只修 `docs/reviews/R0-A5-independent-review/IDE-R0-B-PROMPT.md` 指定的 SEAT_ADDON 重复履约与订单/席位原子一致性问题。

---

## 一、开始基线（快照/哈希）

- **快照路径**：`docs/reviews/R0-B-fix-snapshot/manifest.json` + `docs/reviews/R0-B-fix-snapshot/frozen-source/`（7 个相关文件的修改前完整副本与 SHA256，写码前保存）。
- 关键哈希与审核方证据一致（未被人改动过）：
  - `src/lib/payment/fulfill.ts` = `63371884f2…ce0`（与 NEXT-BATCH-EVIDENCE.json 相同）
  - `src/app/api/payments/mock/confirm/route.ts` = `7be0832699…693d8`（同上）
- 未 reset/clean/整文件 restore；保留全部前批/他人未提交改动。

## 二、最小文件差量

| 文件 | 变更 |
|---|---|
| `src/lib/payment/seat-addon-fulfill.ts` | **新增**：SEAT_ADDON 专用履约服务（REAL/MOCK 共用） |
| `src/lib/payment/fulfill.ts` | SEAT_ADDON 分支改为转调专用服务（删除自带的双写逻辑）；其余分支（RECHARGE/PLAN_UPGRADE/状态机）未动 |
| `src/app/api/payments/mock/confirm/route.ts` | SEAT_ADDON 分支改为转调专用服务；模式门禁/登录/归属/幂等预检保留 |
| `src/app/api/workspace/seat-addon/route.ts` | 仅下单席位校验收紧：`Math.floor(Number(seats))` → `Number.isSafeInteger(seats)`（拒绝小数/NaN/负数/溢出，不再猜成有效）；定价公式零改动 |
| `src/app/api/__tests__/r0b-seat-addon.test.ts` | **新增**：36 用例隔离回归 |
| 微信/支付宝 notify 路由、SeatAddonModal、模拟收银台、qr 页 | **零改动**（契约未变；详见第六节） |

## 三、设计：唯一履约权 + 原子一致

### A. 同一订单只有一个并发请求获得履约权

`fulfillSeatAddonOrder` 在事务**写边界**用带 PENDING 条件的原子更新裁决：

```text
tx.billingrecord.updateMany({ where: { id, status: "PENDING" }, data: { status: "SUCCESS", metadata: 履约记录 } })
count === 1 → 胜者：继续 tx.workspace.update(extraSeats increment) → 同事务提交
count !== 1 → 抛 SEAT_CLAIM_LOST → 本事务回滚（零写入）→ 用根客户端重读分类
```

- 两个请求即使都在事务外读到 PENDING（隔离夹具复现了这一点），写边界条件更新只允许一个 count=1（MySQL InnoDB 下该 UPDATE 按最新已提交值评估并持行锁，串行化竞争者）；
- 落败者重读分类：`SUCCESS → ALREADY_PROCESSED`（与既有调用契约兼容的"已处理"，不报再次加席位成功）/ 仍 `PENDING → 暂时冲突可重试` / 其他 → REJECTED；
- 不靠按钮禁用、进程内锁或事务外读；不信任客户端 paid/seats/amount；未新增任何"强制入账/跳过状态"参数。

### B. 同一事务客户端，一起提交或回滚

席位增量、订单 SUCCESS 状态、履约记录（`metadata.seatsAdded/paidAt/paymentMode/gatewayTransactionId`）全部通过 `getBillingModel(tx)` 使用事务客户端。修复了审核指出的缺陷：原两处实现都在事务回调里用闭包捕获的**根** `billingModel.update`，订单状态可能脱离席位事务。测试 harness 在事务进行中对任何根客户端写直接抛错（封闭 stub），证明无逃逸。

### C. REAL/MOCK 同一份规则

两个入口都转调 `fulfillSeatAddonOrder`，无双份状态机：

- REAL（微信/支付宝回调）：`isRealPayment=true`，**强制要求**受控回调验证的实付金额且与订单金额一致（缺失/非法/不一致拒绝入账）；验签代码与算法未动（notify 路由零改动）。
- MOCK（模拟确认）：`isRealPayment=false`，`paymentMode:"MOCK"` 如实写入履约记录，不冒充真实收入；`resolvePaymentMode() !== "MOCK"` → 403 门禁、登录、订单归属检查保留（均有测试）。
- RECHARGE / PLAN_UPGRADE 分支未重构（回归用例通过）。

### D. 发权益前校验（不可安全履约 → 拒绝并保留证据，不伪装成功、不擅自退款）

| 校验 | 失败结果 |
|---|---|
| 订单存在 / type===SEAT_ADDON / 状态 | 非 PENDING（FAILED/EXPIRED/REFUNDED）拒绝，**不覆盖为 SUCCESS** |
| 支付截止时间 | 超时 PENDING → 落库 EXPIRED 并拒绝（单字段状态迁移，不涉权益） |
| 金额 | 非正安全整数 → 拒绝"请人工核查"；REAL 缺/不符网关实付金额 → 拒绝 |
| 席位数 | `Number.isSafeInteger && > 0`（不用 Math.floor 猜损坏订单）；与 `extraSeats` 相加不超 Prisma Int 上限 |
| 空间 | 必须存在、type===ENTERPRISE、planExpiresAt 非空且未到期 |
| 到期基准 | 下单时 `metadata.expiresAt` 与当前 `planExpiresAt` 不一致（已续费/变更）→ 拒绝"请人工核查" |
| 故障 | 事务内任何失败 → 全回滚，订单保持 PENDING，返回可重试错误并记录日志；**"付款已发生但没发权益"如实返回，绝不声称"用户没付钱"** |

### 履约记录去重

仅胜者写 metadata（seatsAdded/paidAt/paymentMode/gatewayTransactionId 一次定格）；重复请求走 ALREADY_PROCESSED，不重写不同付款事实。

## 四、隔离验证（36 用例全过）

**测试文件**：`src/app/api/__tests__/r0b-seat-addon.test.ts`。harness 特性：内存 Prisma 记录写时序（TX/ROOT）、updateMany 真实评估条件（不恒 count=1）、事务 undo 日志实现真回滚、并发 $transaction 排队串行（对应行锁串行化）、根写逃逸即抛错。**不 mock 被修核心**：`fulfillSeatAddonOrder`/`fulfillPaidOrder`/mock confirm POST/seat-addon POST 均真实执行；只替换 DB/认证/验签输入（验签结果为模拟，非实际交易）。

| prompt 验收场景 | 用例 | 结果 |
|---|---|---|
| 单次有效 2 席位订单 | 总增量 2，SUCCESS，seatsAdded/paymentMode/交易号正确，写入全为 TX | ✅ |
| 同一订单两次/多次并发确认 | Promise.all 两次（一次 FULFILLED 一次 ALREADY）；强制陈旧预读（两请求都见 PENDING）仍只增 2；三次确认只履约一次 | ✅ |
| REAL/MOCK 共享路径 | 两条入口履约写序列同构；paymentMode 各自如实 | ✅ |
| 先成功后重复通知 | mock 重复 POST → alreadyProcessed，零新增、无重复成功记录 | ✅ |
| 事务各写点/提交故障 | 席位更新失败 / commit 失败 / 条件更新失败 → 全回滚（PENDING+0 席位），重试后恰好一次 | ✅ |
| 根客户端写逃逸 | 封闭 stub（事务内根写即抛错）+ 全用例 ROOT 写序列为空断言 | ✅ |
| 不同订单同一空间并发 | 各增一次，2+3=5，metadata 各自正确 | ✅ |
| 非 PENDING/超时/损坏席位/缺空间/异常金额/溢出/到期基准变化 | 全部拒绝，状态不被覆盖，零席位写入（22 个参数化用例） | ✅ |
| REAL 缺金额/金额不符、MOCK 被 REAL 门禁阻断、未登录/他人订单 | 全部无权益写入，门禁不变 | ✅ |
| 充值/PLAN_UPGRADE 回归 | grantPoints 幂等键绑定订单号；PLAN_UPGRADE 履约后 SUCCESS | ✅ |

**异步回调 ACK 约定**：notify 路由零改动——入账失败仍返回 FAIL（微信重试/支付宝 fail），幂等由服务层保证（"先成功后重复通知"用例覆盖重复回调路径）。

**实际命令与退出码**：

```text
npx vitest run --no-color src/app/api/__tests__/r0b-seat-addon.test.ts
→ 1 file, 36 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
→ 4 files, 109 tests passed, exit 0（R0-A 成果未回退）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出
```

均定向运行、本地 node_modules 工具；未全量测试、未连真实库、未下载依赖、未写真实数据。

## 五、页面行为（prompt E）——现有页面满足，代码未动

| 入口 | 证据 |
|---|---|
| SeatAddonModal（下单） | 仅展示创建结果 message（后端 notice："模拟支付…支付确认后席位才会生效"）与 payUrl；PENDING 阶段无"席位到账"表述。契约用例证明下单响应只含 success/orderNo/amountCents/payUrl，且订单 PENDING、extraSeats=0 |
| 模拟收银台（`/user/pay/mock`） | 确认成功 → 显示后端真实 message（"已为空间增购 N 个席位"）；重复确认 → 2xx alreadyProcessed，显示"该订单此前已完成入账，未重复扣款"，不显示再次到账；失败（含 503 可重试冲突）→ authFetch 非 2xx 抛错 → 显示错误说明，订单状态不变，无自动重试下单；页面订单状态来自服务端响应/查询，不用本地存储冒充席位 |
| 真实二维码页 | 仅展示网关支付链接，履约只发生在验签回调，页面无入账表述（本批未改动） |

## 六、数据/账务影响与商业边界

- 本批零真实库写入/迁移/seed/补账、零真实支付/模型调用；测试全内存。
- **未修（按 prompt 另列）**：席位报价的月年折算公式（`seat-addon/route.ts`：`单席位月单价 × 剩余天数 ÷ 周期天数`，含 `Math.round` 舍入与潜在 0 元订单）仍待商业复核——本批未乘 12、未调价、未补历史差价；amount≤0 的存量订单会被履约侧拒绝并标"请人工核查"，不会带病入账。
- 未处理：真实回调重放攻击体系、退款争议、企业池回收；前批全量测试的环境残留影响仍未核实（未连库调查）。

## 七、未完成项 / 上线门槛

1. **真实 MySQL 并发/锁/回滚语义未验证**：内存模型串行化事务证明了业务时序（陈旧预读下写边界仲裁）与回滚逻辑，但不证明 InnoDB 行锁行为与隔离级别语义——需专门的真实库并发验证后才可宣称生产幂等。
2. 浏览器端到端（含重复点击连点）未验证。
3. 席位定价公式商业复核（第六节）；0 元折算存量订单的人工处置流程。
4. `metadata.expiresAt` 严格相等比较：续费后旧席位订单将被拒绝人工处置（设计如此），客服流程需知晓。

## 八、回滚说明

- 精确基线：`docs/reviews/R0-B-fix-snapshot/frozen-source/` 内为修改前原文件副本；回滚即用副本覆盖对应源文件（新增的 `seat-addon-fulfill.ts` 与测试文件可直接删除），不影响其他批次未提交改动。
- 本批未依赖任何 schema/DDL 变更，回滚无数据结构负担。

完成即停止：不进入 R0-C、不部署、不宣称席位售卖商业闭环完成或全站无费用漏洞。
