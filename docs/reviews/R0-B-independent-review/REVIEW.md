# R0-B独立审核：同批补修，不进入下一批

日期：2026-11-06。

**结论：重复履约的主要修复有效，但订单生命周期、空间有效性和真实收银台链路仍有缺陷，R0-B暂不通过。**

## 本轮验收状态

| 项目 | 事实 |
| --- | --- |
| 用户流程 | 席位下单→收银台→付款确认→席位到账→重复/失败/超时状态 |
| 有效修复 | REAL/MOCK席位分支共用服务；PENDING条件更新裁决唯一履约权；成功状态与席位写入使用tx客户端；正常重复与已知故障回滚隔离对照成立 |
| 已有测试 | 本轮5个定向文件145/145通过（R0-B36项、R0-A109项）；类型检查exit0 |
| 独立验证 | 3个正确行为对照、10个后端反例观察、1个支付载体丢失组合、5个实际页面effect状态、1个实际二维码组件输出 |
| 基线 | IDE已保存7个开始副本，实测副本SHA256全部匹配manifest；这是相较前批的改进 |
| 数据/费用 | 本助手仅新增本目录材料；所有数据库、认证、支付和React/网络IO为stub；无真实收款、席位写入或模型调用 |
| 未验证 | 真实MySQL锁/回滚/发生率、真实付款/证书、浏览器DOM、生产构建未验收 |
| 发布与下一关口 | 本批不通过；执行IDE-R0-B1-PROMPT.md，补修后独立复核，不进入R0-C |

## F1 / P1：超时分支仍可把已成功订单覆盖成EXPIRED

位置：`src/lib/payment/fulfill.ts:58–59`、`src/app/api/payments/mock/confirm/route.ts:120–121`、`src/lib/payment/seat-addon-fulfill.ts:74–78`。

三处都根据事务外读取的PENDING/截止时间，直接按id执行update(status=EXPIRED)，没有附带当前状态仍为PENDING的条件。外层两个入口还会在进入共享席位服务之前执行这段独立状态写入，席位状态机并未完全收敛。

可发生的顺序：一个请求在截止前已获准履约；另一个请求读取了PENDING并判断超时；前者提交SUCCESS和席位；后者根据旧读执行EXPIRED，覆盖已成功状态。事务内唯一履约权并不能阻止事务外的无条件覆盖。

独立隔离验证对共享服务、真实回调使用的外层服务、模拟POST分别注入上述“旧读之后另一请求提交”时序，实际最终均为：**extraSeats=2，但订单EXPIRED**。没有重复发席位，却破坏了账单与权益的一致性。

边界：另一已获准请求的提交以数据库IO夹具模拟，不是实际MySQL调度演练，也没有线上事故证据。可确认源码的无条件覆盖会接受这种旧读；不能把145项通过写成所有状态转换都原子安全。

修复要求：席位路径的超时/失败/成功转换均有当前状态条件，竞争落败后按实际最新状态分类；不能把SUCCESS/REFUNDED等覆盖回EXPIRED。外层入口不得先执行不受共享规则保护的席位状态写入。正常确实超时的PENDING仍按既有规则处理，不在本批发明迟到付款退款政策。

## F2 / P1：空间/报价基准校验不完整，且关键检查仍在事务外

位置：`src/lib/payment/seat-addon-fulfill.ts:112–145,150–176`。

实际select只有id/type/extraSeats/planExpiresAt：没有status，归档、停用空间照样入账；没有plan/planBillingCycle，无法核对下单metadata.planKey/billingCycle。metadata.expiresAt缺失或空值时直接跳过到期基准比较。

这些检查又全部在事务前，最终只按workspace.id增加席位，未在写边界约束空间仍然符合资格与原报价。

独立验证均实际返回FULFILLED、订单SUCCESS、增加2席位：

- 初始空间为ARCHIVED或DISABLED。
- 事务外读完以后，事务开始之前空间被改为PERSONAL。
- 同一时点套餐到期日被改变（旧报价基准失效）。
- 订单缺metadata.expiresAt。
- 套餐key或计费周期已与下单记录不一致，而到期日仍相同。

静态无效空间可通过属于直接校验缺失；动态变化属于时序验证夹具。均不证明线上已发生或用户可随意改订单。

修复要求：在席位实际写入边界核验空间状态/企业类型、原报价套餐/周期/到期事实、有效席位上限及原有关系规则；用合适的事务读取/行锁或条件写入防止检查之后再变化。不能只把读取移到tx内却仍按id无条件写。缺少可信报价字段不能默认为当前套餐继续；列为损坏/待人工核查，不改历史订单、不擅自退款。

## F3 / P1：真实微信席位订单丢失二维码载体，正常用户无法扫码

位置：`src/app/api/workspace/seat-addon/route.ts:123–137`、`src/lib/payment-gateway.ts:117–118`、`src/app/api/payments/order/route.ts:39`。

网关的真实微信分支返回：payUrl指向本地二维码收银台，gatewayPayload.codeUrl为官方下单二维码地址。席位route只返回payUrl，既不保存codeUrl，也不把它传给收银台。查询API只从metadata.codeUrl读取，因此得到null；二维码页只在codeUrl存在时生成二维码。

独立组合执行真实席位下单route和真实查询GET，用符合实际网关返回契约的支付IO夹具：创建HTTP200/REAL并跳转本地qr页；支付夹具已提供codeUrl，但订单内没有，随后查询仍为null。没有真实调用微信，也没有真实收款。

这是现有席位用户流程的缺陷，未必是R0-B新增，但原指令要求核对页面/下单契约。报告称页面满足、二维码页只展示支付链接，不能作为闭环证据。

修复要求：只保存必要、经服务端验证的支付展示载体，沿既有订单查询契约交给本人收银台；不要保存整个敏感网关payload，不接受浏览器自传支付地址。保存载体不能覆盖并发完成的履约metadata或订单状态；失败/缺载体时明确阻断或给出可诊断错误，不无限转圈、不伪装可付款。不得改供应商、证书或真实支付配置。

## F4 / P2：页面把失败状态说成入账成功，席位结果又说成算力到账

位置：`src/app/user/pay/mock/page.tsx:75,160–196`；`src/app/user/pay/qr/page.tsx:14–25,139–147`。

模拟页初始化使用status!==PENDING就setResult("该订单已完成支付并入账")。实际执行原TSX的useEffect，EXPIRED、FAILED、REFUNDED三个输入都得到相同成功文案，随后渲染绿色完成区域；状态行又把非SUCCESS笼统标为等待支付。

真实二维码页虽然查询API已提供type/seats，却没有在OrderInfo中消费这些字段。对SUCCESS的SEAT_ADDON，实际组件输出仍为“支付成功，算力已到账”和“查看点数流水”。并非报告所称“页面无入账表述”。

本轮执行实际effect/组件函数，替换hook与jsx输出，不是浏览器/DOM验证。该问题不会直接发点或重复扣款，但会误导用户、增加投诉与对账成本。

修复：仅明确成功状态显示完成，过期/失败/退款/未知状态分别诚实呈现；按真实订单类型显示席位/算力/套餐结果和对应入口。付款发生但履约未确认的错误不能称“用户没付款”，也不能提示自动重新购买。不要靠只测API结果宣称页面验证通过。

## 测试与报告需补的证据

现有内存事务的条件更新、undo回滚和封闭根写检测是有效改进，不应删除。独立正常对照确认同订单并发只增一次、workspace写失败和提交故障能回滚。

但所谓“强制陈旧预读”用例把旧读夹具给第一次请求消费，第二次串行调用实际会读到SUCCESS，不能据此证明两请求都持有旧PENDING。另一个Promise.all用例仍有价值，不能说所有并发测试都无效。补修应使用明确同步屏障，记录两个竞争者在写边界前都读过PENDING，并加入超时处理竞态。

当前没有执行真实notify路由的验签/ACK集成，报告应区分“源码未改”与“已通过实际回调测试”。无需调用真实网关，可以替换验签IO并执行真实通知route观察ACK。

本批未保存schema变更、未改定价，这与范围一致。月年折算/舍入/零元报价仍为商业发布门，不能自行调价或把异常订单当已履约。前批真实Prisma全量测试残留影响仍待授权核查。

## 本轮实际命令

```text
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
结果：5files、145tests passed、exit0。错误日志来自预期故障注入/拒绝场景。

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
结果：exit0，无诊断。

node docs/reviews/R0-B-independent-review/verify.cjs
结果：exit0；3个正确行为对照、10个后端反例、1个支付载体组合、5个实际effect状态、1个实际QR组件输出。
```

源码SHA256及具体结果见verification.json。依赖封闭替换，未连真实库/支付/模型；内存不证明MySQL隔离级别与线上发生率，React hook/组件替换不冒充浏览器验收。

本目录脚本断言当前反例存在，作为历史证据保留；后续另写缺陷消除后的正确回归，不改旧脚本制造通过。
