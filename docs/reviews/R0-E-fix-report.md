# R0-E 修复报告：原方案 F08 生产环境禁止模拟支付入账

> **状态：R0-E 待独立复核**。本批只完成风险关闭；不宣称完整支付功能修复、生产就绪或平台利润已保证。
> 不顺势开发真实支付上线、支付系统重构、自动退款对账或企业池转个人恢复。

---

## 〇、理解确认与范围

| 项 | 内容 |
|---|---|
| 唯一目标 | 生产环境显式配置 `PAYMENT_MODE=mock` 时，明确拒绝模拟付款、模拟确认及相关付费下单；不产生订单成功、点数、席位或收费权益 |
| 依据 | 原方案 F08、R0-D 独立审核 `next-production-mock-verification.json` 与 `IDE-R0-E-PROMPT.md` |
| 已核实事实 | `resolvePaymentMode` 仅 `raw==="mock"` 即返回 `MOCK`，生产显式 mock 未被拦截；支付密码/真实校验不足导致「缴费/充值/企业空间开通」可零成本伪造成功；自动任务失败原路退点（真实）独立于本批 |
| 目标用户 | 提出任务扣点争议/需退款的用户、查看/处理工单的管理员、进行充值/席位/升级的付费用户 |
| 用户可见结果 | 生产显式 mock 下：模拟收银台显示不可用、模拟确认显式失败、付费下单显式失败；非生产联调与真实支付流程不变 |
| 明确保留 | 自动任务失败原路退点、用户历史查询/受理/撤销、管理员列表/导出、合法免费开通、历史已付款事实与真实回调履约、企业池/席位/定价/结账/支付模式/schema/网关供应商适配/计费层 |
| 实际改动 | 5 个源码文件（见第四节）+ 1 个新增定向测试 + 页面受控执行脚本 + 报告与快照 |
| 约束遵循 | 零真实库写入/迁移/清账补账/退款、零真实支付/模型/短信/邮件、零部署、零密钥读取；未整文件盲覆、未删历史反例脚本、未改历史审核材料 |

---

## 一、统一模式裁决（核心修复）

`src/lib/payment-gateway.ts` 的 `resolvePaymentMode` 在 `raw==="mock"` 且 `NODE_ENV==="production"` 时**抛出 `PaymentConfigError`**（`code=PRODUCTION_MOCK_PAYMENT_DISABLED`，稳定可识别），不再返回可用 `MOCK`；`createCharge` 首行即调用 `resolvePaymentMode()`，故直接调用也一并拒绝。既不用静默 `REAL` 去调真实供应商，也不新增生产 mock 豁免开关。

```ts
export class PaymentConfigError extends Error {
  code = "PRODUCTION_MOCK_PAYMENT_DISABLED";
  constructor(message: string) { super(message); this.name = "PaymentConfigError"; }
}

export function resolvePaymentMode(): PaymentMode {
  const raw = (process.env.PAYMENT_MODE || "").trim().toLowerCase();
  if (raw === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new PaymentConfigError(
        "当前支付配置不允许在生产环境使用模拟支付（PAYMENT_MODE=mock）。该操作已拒绝；请改用真实支付渠道或修正部署配置。",
      );
    }
    return "MOCK";
  }
  if (raw === "real") return "REAL";
  return process.env.NODE_ENV === "production" ? "REAL" : "MOCK";
}
```

环境矩阵（归一化后判定）：

| 配置 | 行为 |
|---|---|
| production + `mock`（含 ` MOCK `、`Mock` 变体） | 抛 `PaymentConfigError`；`createCharge` 拒绝；mock GET/POST 403；三类付费下单 503 |
| production + `real` | 返回 `REAL`；mock GET/POST 403(`REAL_MODE_MOCK_UNAVAILABLE`)；`create` 缺凭证诚实拒绝（**不 MOCK 降级**） |
| production + 未配置 / 非法值 | 返回 `REAL`（fail-closed）；mock GET/POST 403 |
| development / test + `mock` 或缺失配置 | 维持 `MOCK` 联调：`mock` GET/POST 可用、三类下单创建 PENDING 订单并返回 MOCK 收银台、不入账 |
| 合法免费升级（基础档月年均为 0） | 不经付款路径，按既有规则直接开通，不受生产 + mock 影响 |

---

## 二、覆盖模拟确认 GET/POST（修改 `src/app/api/payments/mock/confirm/route.ts`）

- GET / POST 在读取订单、调用账务/履约（`grantPoints`）**之前**调用 `resolvePaymentMode()`；捕获 `PaymentConfigError` 返回 `{ success:false, code, error }` + **403**，未被通用 catch 吞成 500。
- `REAL` 模式下原有 `REAL_MODE_MOCK_UNAVAILABLE` 403 保持；`success:false` 与稳定 code 使页面/历史查询可明确识别。
- 充值、席位、套餐及历史 PENDING `MOCK` 订单在 production+mock 下均**不能**经模拟确认获得任何权益（GET/POST 在读取订单前即拒绝）。

## 三、覆盖三条付费下单路径（create / seat-addon / upgrade）

- `create`：在 `billingModel.create`（本次 PENDING 订单）**之前**调用 `resolvePaymentMode()`，捕获 `PaymentConfigError` 返回 **503** + 稳定 code。
- `seat-addon`：移除未使用的 `const mode`，在 `billingModel.create` 之前插入守卫，返回 **503**；零新订单、零渠道调用、零席位变化。
- `upgrade`：在 `billingModel.create` 之前插入守卫返回 **503**；原本用于文案的 `mode` 改为 `charge.mode`；**合法免费升级**（金额均为 0 的基础档）不经此路径，按既有规则直接开通，不受影响。
- 三条路径均不返回模拟付款链接、不调用真实渠道、不自动换模式或重试；合法免费开通不被误拦。

## 四、保留已付款事实与历史（不改验签/不改历史数据）

- `src/app/api/payments/notify/wechat/route.ts` 与 `src/lib/payment/wechatpay.ts` 未改动：真实回调继续按既有验签、金额、履约规则处理，`PRODUCTION_MOCK_PAYMENT_DISABLED` 不影响 REAL 履约（notify 不读 `resolvePaymentMode`）。
- 本人历史订单仍只读可查；不删除、不把历史 `MOCK` 改成 `REAL`、不补扣或自动退款。
- 未恢复已暂停的人工退款与企业转个人、未修改席位核心。

## 五、页面（仅最小接线，默认不重写）

- `src/app/user/pay/mock/page.tsx` **未改写**。受控执行（见第七节）证实：production+mock 下 GET 返回 403，页面经 `authFetch` 错误分支 `setError` 渲染错误提示，渲染树**不含**「模拟支付成功」按钮、不设置本地 `SUCCESS`、不跳模拟页、不自动重买。
- 该页面错误分支本就存在（line 167-168 展示 `{error}`），依赖后端 403 消息；本批只修改后端契约，未触碰前端逻辑。

---

## 六、E01—E08 验收结果

隔离夹具：内存 Prisma / 权限 / 计费 / 履约 / 验签 IO 夹具；只替换认证、持久化、计费、履约、验签 IO；**真实** `resolvePaymentMode` / `createCharge` / 三个付费下单路由 / 模拟确认 GET+POST / 真实微信 notify 路由不 mock。环境、凭证、渠道、数据库均用隔离夹具，`vi.stubEnv` 自动恢复。

**先复现失败**：把 5 个源文件临时换成 `frozen-source/` 开始态原始副本，用**完全相同**的断言执行 → **8 failed / 11 passed，退出码 1**；`finally` 恢复并逐项校验哈希一致，修复版同组断言 **19 passed，退出码 0**。（注：还原过程中 swap 脚本的 `route.ts` 文件名冲突曾临时损坏 3 个路由文件，已用 `frozen-source` 重新还原并逐字节复核结束态哈希一致；未实际回退工作区。）

| 编号 | 场景 | 结果 |
|---|---|---|
| E01 | 核心裁决：production+mock（含大小写/空格变体、伪造齐备真实凭证）→ `resolvePaymentMode`/`createCharge` 抛 `PaymentConfigError`；dev/test+mock 与缺配置仍 MOCK；production+real/未配置/非法值 维持 REAL（不降级） | **通过**：19/19 内含 8 项直接裁决断言 |
| E02 | 模拟确认 GET/POST 生产 mock 明确拒绝：403 + `success:false` + 稳定 code；零订单读取、零入账、响应不含订单/金额/用户/密钥 | **通过**：复现前该配置下未统一拒绝（8 fail），修复后稳定 403 |
| E03 | 三付费下单路由 生产 mock 前置于下单/权益写拒绝：503 + 稳定 code；零 PENDING 订单创建、零渠道、零发放 | **通过** |
| E04 | production+real 安全行为保持：mock GET/POST 仍 403（REAL_MODE_MOCK_UNAVAILABLE）、零发放；create 缺凭证诚实拒绝、不返回 MOCK payUrl、不发放 | **通过** |
| E05 | development/test 显式 mock 与缺配置正常联调：三路由创建 PENDING 订单并返回 `^/user/pay/mock` 收银台、不入账；合法免费升级不受生产+mock 影响仍可开通 | **通过** |
| E06 | 真实 notify 路由 + 验签 IO stub：验签通过+SUCCESS→既有履约被调用并返回微信成功 ACK；验签失败→401+FAIL 且绝不履行；trade_state 非 SUCCESS→确认收到但不入账（不放宽）；即便环境误配 mock 仍按 REAL 履约 | **通过** |
| E07 | 真实页面错误 handler/组件受控执行：production+mock 下页面展示后端错误原因，不假成功、不渲染「模拟支付成功」按钮、提供返回/账单入口 | **通过（5/5）** |
| E08 | 冻结回归与相邻功能保持：7 个隔离文件 **253 tests passed**（218 冻结 + 16 R0-D + 19 R0-E）、企业池 18/18、收银台 21/21、D 页面 24/24、E 页面 5/5、`tsc` 退出码 0；自动退款原语 5 文件哈希与 C 审核记录一致（零差量） | **通过** |

### 零业务写 / 零渠道调用证据（统一断言）

- `PaymentConfigError` 路径下：`createCharge` 在 `resolvePaymentMode()` 抛错后即终止，真实网关动态导入不发生；`grantPointsCalls === 0`；`billingrecord.create`（本次 PENDING 订单）调用数为 0；`billingrecord.update/updateMany` 为 0；`state.reads`（订单读取）在生产 mock 的 mock/confirm 路由为 0（在读取订单前拒绝）。
- `fulfillCalls`（真实 notify 履约）仅在 E06 显式 stub 触发，生产 mock 的付费下单路径不触发。
- 生产 mock 下任何响应都不含 `payUrl` 指向模拟页、不含「已支付/已到账/成功」诱导文案。

### 相邻功能保持证据

- `src/lib/credit-service.ts`、`src/lib/payment/wechatpay.ts`、`src/lib/payment/alipay.ts`、`notify/wechat/route.ts` 均未改动（行级差量仅限 payment-gateway 与 4 个订单/确认路由）；真实自动退点流水、用户 GET/POST/DELETE、后台 GET、REJECT 流程未删。
- 本批 5 个文件差量行号集中在 `PaymentConfigError` 类、模式裁决前置守卫、稳定错误响应；未新增任何字段开关、角色后门或旁路接口。

---

## 七、实际命令与退出码

依赖检查先行：本批新增测试文件 `vi.mock("@/lib/prisma")` 并已隔离所有外部 IO；历史 7 个定向测试文件均隔离数据库。未运行全量测试、未下载依赖。

| # | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 1 | `npx vitest run src/app/api/__tests__/r0e-production-mock.test.ts`（**开始态原始副本**） | 8 failed / 11 passed（复现生产 mock 可下单/入账、mock 确认未统一拒绝） | **1** |
| 2 | 同上（**修复版**，同一组断言） | **19 passed** | **0** |
| 3 | `npx vitest run <8 个指定隔离文件> --reporter=dot` | **8 files / 253 tests passed**（218 冻结 + 16 R0-D + 19 R0-E） | **0** |
| 4 | `node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs` | **18/18** | **0** |
| 5 | `node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs` | **21/21** | **0** |
| 6 | `node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs` | **24/24** | **0** |
| 7 | `node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs` | **5/5** | **0** |
| 8 | `npx tsc --noEmit --incremental false -p tsconfig.json` | 无诊断输出 | **0** |
| 9 | `read_lints`（5 个改动文件） | 0 诊断 | — |

过程记录（如实）：新增测试首轮因 Prisma 夹具 `workspace` 键重复声明被覆盖、以及跨用例 `state.workspace` 状态泄漏、内存夹具返回 `BigInt` 导致 `NextResponse.json` 序列化失败，分别修正断言写法/夹具后全绿；页面受控执行脚本因 vm 缺少 `exports`、组件用 `void (async()=>{})()` 异步 IIFE、以及自研 hooks 游标未复用导致状态不刷新，逐一定位修正后通过。全部只修正**夹具/断言/脚本**，未放宽业务零写、权限或失败闭环验收，未改历史反例脚本或删除旧用例。最终状态全绿。

---

## 八、最小差量、数据影响与未验证项

**最小差量（vs 开始态原始副本）**：

| 文件 | 开始态 SHA256 | 结束态 SHA256 | 差量 |
|---|---|---|---|
| `src/lib/payment-gateway.ts` | `56972d80…` | `68fff929…` | +24 / −1 |
| `src/app/api/payments/mock/confirm/route.ts` | `2795103f…` | `41a6dd65…` | +39 / −6 |
| `src/app/api/payments/create/route.ts` | `eb338f49…` | `c4462ae1…` | +16 / −2 |
| `src/app/api/workspace/seat-addon/route.ts` | `0ab6a55c…` | `054ec8a2…` | +16 / −2 |
| `src/app/api/workspace/upgrade/route.ts` | `d6b3a40e…` | `90825304…` | +17 / −3 |

新增：`src/app/api/__tests__/r0e-production-mock.test.ts`、本报告、`R0-E-fix-snapshot/`（manifest、两份源码副本、`verify-r0e-pages.cjs`）。

**数据影响**：零真实库写入/迁移/seed/清账/补账/退款；零真实支付、模型、短信、邮件调用；零部署、零密钥读取；未改变任何历史订单、钱包、企业池或权限配置；未批准或驳回任何真实工单。行为上的唯一变化是收紧闸门：production+mock 下模拟确认与三类付费下单显式失败，不再创建可用订单或入账。历史已付款记录与自动原路退点不受影响。

**未验证**：真实部署 RBAC / 中间件授权状态（权限/环境夹具只验证路由请求的参数与模式裁决，不证明线上角色/环境配置）；真实浏览器 DOM 渲染（页面为 vm 受控执行）；真实数据库并发与行锁；真实渠道/资金退款；当前生产余额与历史已发生损失。

---

## 九、状态与停止

E01—E08 与 253 项定向回归、企业池 18 项、收银台 21 项、D 页面 24 项、E 页面 5 项、类型检查全部通过，**到此停止并交回独立审核**：

- **最终状态：R0-E 待独立复核**；
- 冻结本次生产 mock 拒绝逻辑；不开发完整支付引擎、不恢复企业转个人、不重开席位补修、不顺势真实支付上线；
- 不宣称完整退款功能修复、生产就绪或平台盈利闭环完成；
- 历史报告与历史反例脚本不覆盖；当前工作区保持修复态，未实际回退。
