# R0-C 修复报告：原方案 F06 企业池转个人钱包止损

> **状态：R0-C 待独立复核**。本批仅完成风险关闭，不宣称正确的企业池回收/退款功能已完成、不宣称生产就绪或全站费用风险清零。
> C01—C08 通过后停止，冻结本次企业转个人止损；不自行扩展企业资金迁移、退款或经营后台。

---

## 〇、理解确认与范围

| 项 | 内容 |
|---|---|
| 唯一目标 | 暂停当前不安全的「企业共享池 → 个人钱包」转移，保证**直接调用服务、空间接口、后台接口**都不能继续制造或错误转移点数 |
| 依据 | 原方案 `RESTRUCTURING-PROPOSAL.md` F06 与 8.1（企业资产归属、管理员不能仅凭成员管理角色把企业钱转自己钱包）；R0-B3 已通过独立审核、席位批次冻结 |
| 根因 | `recycleEnterprisePool` 只递减企业池快照、给个人钱包新建 WALLET 桶，却**不扣减 WORKSPACE 来源桶**，新桶丢失付费/赠送来源与期限；空间 ADMIN 可转入自己钱包，后台可转入 owner 钱包；当前无已批准的企业资产转个人政策 |
| 目标用户 | 企业空间所有者 / 管理员、平台管理员 |
| 用户可见结果 | 进入企业池管理或充值「回收」页签看到清晰暂不可用说明；直接请求/旧页面也不能改变企业或个人资产 |
| 明确不做 | 不重写成员独立余额→企业池路径、其它账务原语、退款、定价、会员、席位、认证、schema；不清理历史数据、不补扣补发清零；不自行决定企业资产归个人的新政策；不新增默认开启配置开关/绕过入口/后台页面 |
| 实际改动 | 6 个源码文件（服务 1、两个 API、三处页面）+ 1 个新增定向测试 + 报告与快照 |

---

## 一、改动与契约

### A. 服务层兜底（`src/lib/credit-service.ts`）

`recycleEnterprisePool` 的整个危险执行段被替换为**函数体第一行**抛出稳定错误，位于任何 `prisma.$transaction`、查询、扣池、加钱包、建分桶/流水/账单之前：

```text
export const ENTERPRISE_POOL_RECYCLE_DISABLED = "ENTERPRISE_POOL_RECYCLE_DISABLED"
export const ENTERPRISE_POOL_RECYCLE_MESSAGE  = "企业额度转入个人钱包暂不可用，原余额保留在企业空间"

export async function recycleEnterprisePool(_params): Promise<...> {
  throw new Error(ENTERPRISE_POOL_RECYCLE_DISABLED);
}
```

- 保持必要导出与调用签名；直接 `import` 调用同样拒绝。
- 不新增配置开关、角色后门、新接口或迁移引擎；未把旧执行逻辑接到别处。
- 只影响「企业共享池 → 个人钱包」；成员独立余额 → 企业共享池走 `transferPoints(MEMBER_TO_POOL)`，差量为 0。

### B. 两个 API 契约

| 接口 | 身份边界（未改） | 原本有资格角色的响应 |
|---|---|---|
| `POST /api/workspace/quota/recycle` | 未登录 401、非成员 403、普通成员 403、非企业空间 400 | **HTTP 409** `{ success:false, code:"ENTERPRISE_POOL_RECYCLE_DISABLED", error:"企业额度转入个人钱包暂不可用，原余额保留在企业空间" }` |
| `POST /api/admin/workspaces/recycle` | 未登录 401、非平台管理员 403、空间不存在 404、非企业空间/无所有者 400 | 同上 |

- 保留真实服务调用作为兜底链路（服务在事务前抛错），catch 把稳定错误**明确映射为 409**，不包装成通用 500。
- 删除了成功账务、`workspace:pool_recycle` / `admin:workspace_pool_recycle` 成功审计、低余额「回收成功」通知与成功响应；不返回 2xx、不发成功通知、不写成功流水/账单。
- 暂停文案不含空间名、余额、用户信息，不泄露敏感数据；不要求用户重新付款、不编造恢复时间或客服能力。

### C. 页面用户入口（仅三处）

| 文件 | 改动 | 保留 |
|---|---|---|
| `EnterprisePoolManager.tsx` | 回收区改为醒目暂停说明；移除回收输入/校验/成功 Toast；执行控件改为**禁用**「暂不可用」；`handleRecycle` 保留为防御（只 `toast.info` 暂停文案，不发任何请求） | 企业池列表/余额读取、低余额阈值编辑保存、`loadPools` |
| `WorkspaceInternalLayoutV3.tsx` | `handleExecuteRecycle` 改为防御性纯提示（无 fetch、无成功 Toast）；删除不再需要的回收输入/loading 状态与三个传参 | 阈值加载、充值、其余 8500 行零改动（差量仅两处） |
| `RechargeModal.tsx` | recycle 页签顶部改暂停说明；移除「将企业共享池…回收至您的个人钱包」承诺、回收点数输入、余额限制提示与「确认回收至个人钱包」按钮；保留 disabled「暂不可用」绑定防御 handler | 低余额阈值输入与「保存阈值」、online/offline 充值页签 |

前端不是安全依据：旧页面/直接 HTTP 仍由服务层与两个 API 拒绝。

---

## 二、C01—C08 验收结果

隔离夹具：内存账务夹具记录表/操作/根与 TX 客户端/`$transaction` 次数/前后快照；只替换认证、持久化、通知、成员关系 IO；**真实** `credit-service` 导出函数与两个真实 POST 均不 mock。页面用 TS 转译 + vm 受控执行真实组件/handler。

| 编号 | 场景 | 结果 |
|---|---|---|
| C01 | 直接调用真实 `recycleEnterprisePool`，付费 `OFFLINE_RECHARGE` / 赠送 `GIFT_BONUS` 来源、不同点数与接收者 | **通过**：均抛 `ENTERPRISE_POOL_RECYCLE_DISABLED`；`$transaction=0`、业务写=0；原池 100、原桶 100、钱包 0、无新桶/流水/负余额 |
| C02 | 空间 OWNER / ADMIN 经真实 workspace POST | **通过**：均 409 `success:false` + 稳定 code + 通俗 error；无转个人、无成功账务 |
| C03 | 平台管理员经真实 admin POST | **通过**：同样 409；不向 owner 或任意接收者转点，无 `ownerId`/成功账务/通知 |
| C04 | 未登录、非成员、普通成员、无平台管理权限 | **通过**：401/403 原边界保持；响应不含余额/钱包信息；零业务写 |
| C05 | 服务重复 5 次、空间 OWNER 并发 6 次 + 平台管理员并发 6 次 | **通过**：全部拒绝；每次原池 100、原桶 100、钱包 0 不变 |
| C06 | 真实 `EnterprisePoolManager` / `RechargeModal` 组件与 V3 `handleExecuteRecycle` | **通过 18/18**：显示暂停文案、控件禁用、无成功到账承诺、无成功 Toast、无 `/recycle` 请求；阈值与余额读取保留；源码契约核对确认两 API 409 且无成功账务/通知 |
| C07 | 相邻功能与范围保护 | **通过**：`transferPoints(MEMBER_TO_POOL)` 仍走自身业务校验且未被暂停码拦住；`grantPoints`/`consumePoints` 不含暂停码；差量行号核对确认 `credit-service.ts` 只动 1888–1992 的 `recycleEnterprisePool` 段，成员→共享池 1376–1570 段零差量；余额读取、低余额阈值、充值入口保留 |
| C08 | 冻结回归与检查 | **通过**：6 个指定隔离文件 **218 tests passed**（202 项既有 + 16 项 C 批）；收银台 **21/21**；C06 页面 **18/18**；`tsc` 无诊断；lint 0 |

依赖检查先行：6 个定向测试文件均 `vi.mock("@/lib/prisma")`、无 `new PrismaClient`/`DATABASE_URL`/`mysql://`；未运行全量测试、未下载依赖。

### 服务零写证据（C01/C05 统一断言）

`state.txCount === 0`、`state.writes === []`、`pool=100`、`grants.length=1 且 remaining=100`、`wallets={}`、`ledgers=[]`、`audits=0`、`notifications=[]`。服务在事务前抛错，因此连空事务/假成功都不存在。

---

## 三、实际开始副本、哈希与最小差量

- 采集时间 `2026-11-06T23:50:33+08:00`；`HEAD = 761684be8d5661d6ed288f3b91d1fedfdc795a75`；开始时 `git status` 115 项（101 modified / 14 untracked）前批与他人改动，未 reset/clean/restore。
- 改动前保存的真实原始副本（`frozen-source/`）哈希与 R0-B3 独立审核 `next-pool-verification.json` 的 `sha256` 逐项一致；结束态副本在 `end-source/`。副本统一加 `.frozen` 后缀以退出 `tsconfig` 的 `**/*.ts(x)` 编译收集，内容逐字节未变。

| 文件 | 开始态 SHA256 | 结束态 SHA256 | 差量 |
|---|---|---|---|
| `src/lib/credit-service.ts` | `57bc72b9…` | `1ad8a8e3…` | +19 / −98 |
| `src/app/api/workspace/quota/recycle/route.ts` | `8fc5d6cd…` | `e5bdf2ae…` | +48 / −55 |
| `src/app/api/admin/workspaces/recycle/route.ts` | `5bad6f3d…` | `c93cfc55…` | +48 / −33 |
| `src/components/EnterprisePoolManager.tsx` | `46fc1467…` | `5ef95e3a…` | +22 / −110 |
| `src/components/WorkspaceInternalLayoutV3.tsx` | `d26e8422…` | `97943f90…` | +5 / −37 |
| `src/components/workspace/RechargeModal.tsx` | `9113f78c…` | `c1f574a7…` | +10 / −47 |

新增：`src/app/api/__tests__/r0c-pool-recycle.test.ts`、本报告、`R0-C-fix-snapshot/`（manifest、两份源码副本、`verify-r0c-pages.cjs`）。

**受保护差量回退方案（未实际执行）**：按上表 6 组开始/结束哈希逐项反向应用本批差量；执行前重新核对当前哈希与后续/他人改动，不整文件盲覆；删除本批新增的测试、报告与快照目录不影响运行时；保留 `transferPoints` 等相邻原语与已冻结的席位代码；历史报告、审核材料与历史反例脚本不删除、不覆盖。

冻结项核对（零改动）：`seat-addon-fulfill.ts` `a680ceb2…`、`mock/page.tsx` `0f0b2d84…`、`payment-cashier-display.ts` `541726f8…`、`order-expiry.ts` `15b9395b…`；`verify-next-pool.cjs` `1a9f0838…` 未运行、未修改；R0-B1/B2/B3 报告均未改动。

---

## 四、实际命令与退出码

| # | 命令 | 结果 | 退出码 |
|---|---|---|---|
| 1 | `npx vitest run src/app/api/__tests__/r0c-pool-recycle.test.ts --reporter=dot` | **16 passed** | **0** |
| 2 | `npx vitest run <6 个指定隔离文件> --reporter=dot` | **6 files / 218 tests passed**（202 冻结 + 16 C 批），3.84s | **0** |
| 3 | `node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs` | **21/21 checks passed** | **0** |
| 4 | `node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs` | **18/18 checks passed** | **0** |
| 5 | `npx tsc --noEmit --incremental false -p tsconfig.json` | 无诊断输出 | **0** |
| 6 | `read_lints`（7 个改动文件） | 0 诊断 | — |

过程记录（如实）：首轮 C 批测试因 `body.message` 为 `undefined` 时 `not.toContain` 写法无效而 4 项失败；并发用例混用两种角色触发原身份门禁 403；`tsc` 报测试文件 `100n` BigInt 字面量与类型导出断言、快照 `.tsx` 副本被编译收集。均已针对**测试夹具/副本后缀**修正，未修改断言以接受错误履约，未改动历史反例脚本或删除旧用例。最终状态全绿。

---

## 五、数据与账务影响

- **零真实数据库写入 / 迁移 / seed / 补账 / 清账 / 退款；零真实支付、模型、短信、邮件调用；零部署；零环境密钥读取。**
- 未改历史桶、未对平余额、未清零、未补扣、未补发；未把估算额度面值当真实现金。
- 定价、赠送、会员、席位、结算、BYOK、支付模式、认证体系、schema 全部未动；已冻结的 202 项回归保持通过。
- 行为上的唯一变化是收紧闸门：企业共享池 → 个人钱包的自助与后台代操作全部暂停。原余额、来源桶、账单历史保持原状，不产生虚假成功；合法授权后的其它账务路径不受影响。
- 审核材料已说明受控数据下账务不守恒及资产归属风险，不证明线上现有余额、历史实际损失或可提现性；本批不声称已发现实际资金损失。

---

## 六、未验证项与恢复功能所需的业务决策

**未验证**：真实 MySQL 并发与事务语义（本批内存夹具，不连真实库）；浏览器 DOM 渲染（组件为 vm 受控执行）；真实网关/渠道；当前生产余额与历史数据；企业资产迁移的业务正确性（本批明确不实现）。

**恢复「企业共享池 → 个人钱包」前，须由负责人明确批准（本批不替负责人选政策、不实现）**：

1. 企业**付费**余额允许转个人，还是只能退回原付款方；
2. **赠送/活动**额度是否可转、期限与来源限制如何保留；
3. 转移的**审批人**与**接收者资格**（仅 OWNER？可否转给 ADMIN/成员？平台后台是否允许代操作）；
4. 按来源桶守恒的实现方案：`workspacequota` 快照与 `pointgrant` 分桶同时扣减、目标桶保留来源/期限、双向流水与幂等键；
5. 历史来源无法还原的记录如何处理；是否需要对既有账单做人工核查。

若发现已有批准的明确规则，应附原始证据交回独立审核，仍不自行扩大本批恢复功能。

---

## 七、状态与停止

C01—C08 与 218 项定向回归、21 项收银台检查、类型检查全部通过，**到此停止并交回独立审核**：

- **最终状态：R0-C 待独立复核**；
- 本次企业转个人止损冻结；不继续扩建企业资金迁移、退款或经营后台，不新增一般优化或新功能；
- 不宣称企业池回收功能完成、生产就绪或全站费用风险清零；
- 历史报告与历史反例脚本不覆盖；当前工作区保持修复态，未实际回退。
