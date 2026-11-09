# 原方案 1–14 统一独立复核报告

复核日期：2026-11-09。仓库：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web`。候选提交：`5162e5b12b105c71ca71fb628854d32f7201f371`。

**结论：本轮不能按“全部实现完毕”验收，也不能据此放行真实收费和放量。** 已有修复有明显进展，但第 5–12 项存在业务入口未接线，第 13–14 项没有形成完整集成交付，并且独立补测确认真实入口仍有安全、支付和资源回收缺陷。这些均退回原方案已有条目；没有新增第 15 批或扩展产品。

本助手没有修复业务代码，仅新增本目录的审核报告、隔离夹具、输出和源码快照。核验期间对 1,055 个源码/模型/迁移/配置文件比对，未发生内容变化。不是生产库、真实供应商、浏览器旅程或人工业务验收。

## 一、有效证据与结论边界

| 检查 | 本次结果 | 能证明什么 |
| --- | --- | --- |
| 原 18 文件基线 + F14/F15/F16 + 第 5–12 项定向测试 | 30 文件，717/717 通过 | 当前精确范围内的既有断言通过；不代表入口已接好 |
| 两个解析 node:test 文件 | 18/18 通过，0 取消 | 原格式提取、取消与迟到创建等断言通过 |
| 严格 TypeScript | `tsc --noEmit --incremental false -p tsconfig.json` 退出 0 | 当前项目类型检查通过；`any` 仍可能掩盖运行时 delegate 错误 |
| worker 语法 | `node --check src/lib/parse-worker.cjs` 退出 0 | worker 语法合法 |
| 独立补测 | 9 文件，46 项：22 项正常回归、24 项缺陷确认 | 缺陷确认用例“通过”表示成功复现漏洞，不能计为修复通过 |
| 最终工程交付材料 | 未在约定路径找到 P13/P14 最终清单、报告和交接 | 无法接受原第 13–14 项已完整交付的说法 |

本次独立补测没有真实库连接、迁移、seed、真实账号创建、模型、短信、SMTP、支付或云桶操作。数据库条件更新使用隔离委托；不是 MySQL 锁与隔离级别的真实验证。支付补测将验签结果替换为受控输入，因此证明的是**验签之后的业务核验和状态机缺口**，不是“任意匿名者已可伪造签名”。BYO 补测使用假密钥和捕获函数，没有外发密钥。

原始命令目标、JSON 输出、测试分类和版本摘要均在本目录。最初一次新增审核夹具因过期记录被正常清理而访问了不存在的记录，已修正为清理前的时间边界，并重新运行；最终结果为上述 46 项。没有因此修改业务源码或原断言。

## 二、已保留的修复

1. 原 18 文件账务、席位、维护只读、到期和存储保护回归全部通过；本轮不推翻这些成果。
2. F14 的按持久化权重归还、直接 release 计数未命中回滚、OCR 有限收口、旧 Office 文本、表格提取、预览格式等已有通过证据。独立正常回归再次核实直接 release 的权重与回滚。
3. F15 短信通道未配置时诚实拒绝，使用安全随机数和哈希存储，业务响应不再直接返回调试验证码；这部分保留。
4. F16 旧免支付直充已退役，人工确认收款保持暂停，退款申请权限不能确认充值；F07 人工退款批准暂停保持。对应精确测试通过。
5. 支付回调已经补充交易号和金额的基础必填判断，取消/过期订单已有待恢复收款标记；这些属于部分进展，不能替代下列完整核验。

## 三、按影响排列的缺陷与未完成项

### U01 · P1：第 6–12 项主要模块未接入业务入口，不能将纯函数测试当完成

源码引用扫描显示：下列模块只有测试或这些新增模块之间的引用，没有从实际页面/API 接入的执行链：

- `billing/cost-reservation`、`billing/execution-orchestration`；
- `billing/refund-basis`、`billing/entitlement-read-guard`；
- `tenant/enterprise-lifecycle`、`journey/first-value-journey`；
- `operations/ops-readiness`、`metrics/value-cost-metrics`。

例如执行编排注释明确将“真实接线”交给第 13 项，但实际 Studio handler 没有调用它；成本预约仅有 Memory 后端，没有生产数据库后端。首次价值模块的状态机没有被首页、登录页、任务页使用。模块之间存在 type import 和一次生命周期函数调用，故不能简单理解为“源码完全无引用”；关键事实是**没有接入用户请求入口**。

影响：用户实际执行仍缺这次方案要求的跨实例成本预约与 attempt 闭环；管理员不能使用新增恢复服务；负责人看不到实际落地的经营指标。这也是“测试很多、项目仍未收尾”的主要原因之一。证据见本目录 `import-evidence.json`，以及[真实执行入口](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/studio/handler.ts:3528>)、[未接线编排](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/execution-orchestration.ts:1>)。

归属：原 6/7/8/9/10/11/12/13/14。不是新增需求。

### U02 · P1：重置密码的一次性凭证可重复使用，验证码消费失败仍改密

[重置密码](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/reset-password/route.ts:83>) await 了消费函数，却完全不检查 `{ok:false}`。独立补测确认：同一已验证凭证第一次消费成功、第二次返回“已使用”，两次请求仍均返回 200 并写密码；后端消费返回 503 时也继续写。

此外，[短信 resetToken 签发](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/verify-sms-code/route.ts:21>)接受客户端 `type`，校验任意用途后统一签 `reset_password`；token 没有绑定不可替换的 challenge 身份。[短信登录末尾](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/login-sms/route.ts:379>)还存在未 await 且未传 `login` 用途的删除调用，默认会删除 reset-password 用途，登录码仍可能保持有效。[绑定手机](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/user/profile/route.ts:250>)同样没有检查消费结果。

影响：一次性验证码/重置授权的安全保证不成立。重复改密补测的前提是已有合法签发凭证；不是声称没有任何凭证也能改密。归属：原 2/F15、14。

### U03 · P1：生产验证码实现与内存测试不等价，当前邮箱发送还存在确定的接线错误

[生产验证码后端](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-backend.ts:323>)访问 `prisma.verificationbudget`；schema 的 `model VerificationBudget` 和当前生成客户端对应的是 `prisma.verificationBudget`。现有测试自行提供了错误拼写的 mock，掩盖了此错误。独立使用正确 delegate 拼写的夹具确认：ready 返回 true，实际签发返回 503，即便表和客户端按当前 schema 准备好仍无法正常发送。

进一步使用测试别名跨过该拼写缺陷，生产算法仍存在：

1. 60 秒发送间隔没有实现；立即两次签发均通过。
2. `recordFailure` 为空实现；失败 5 次后正确码仍可通过。内存版有锁定，不能用其测试代替生产实现。
3. 高层签发不传可信 IP/账号，声明的 IP/账号预算没有形成路由闭环。
4. 预算更新、窗口重置、签发替换不是一个完整的原子授权过程；version 列没有形成有效 CAS。
5. 已签发码和消费只按 target/purpose 操作，缺不可替换 challenge 绑定；查验、重发和消费之间有竞态。
6. [邮件发送](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/mailer.ts:94>)把所有异常都归为确定失败；调用方因此返还预算，未区分“供应商可能接受但响应丢失”。成功分支也未检查接收结果。此项为源码确认，未真实发信。

新表仅出现在 schema，没有配套的 VerificationBudget 离线迁移文件。归属：原 2/4/13/14。

### U04 · P1：支付事实没有形成并发唯一约束，且核验/留存仍不完整

[统一履约](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/fulfill.ts:70>)先查询其他 SUCCESS 订单交易号，再分别入账，没有渠道交易事实的数据库唯一认领。独立补测确认：两个不同订单并发使用同一交易号，两者均履约，发放 2 次；顺序重复测试通过并不能覆盖这个问题。

独立补测还确认：

- ALIPAY 来源能履约 `channel=WECHAT_PAY` 的订单；
- 直接调用统一履约层，PENDING 的 REAL 充值缺交易号/金额仍可履约；当前真实回调已拦部分缺字段，但服务底层仍没有统一强约束；
- [支付宝金额](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/payments/notify/alipay/route.ts:55>)会把 `10.004` 四舍五入为 1000 分并接收入账，应按明确协议精度解析；
- 同一取消订单先后出现不同收款事实，单个 `pendingReceipt` 会被后来的交易覆盖，第一笔不再保留在该记录中。

源码另确认：[微信验签解密](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/wechatpay.ts:196>)没有核对解密结果的商户、应用、币种与订单渠道；[支付宝](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/alipay.ts:156>)仅在 app_id 存在时比较，没有完整商户归属链。支付签名有效不等于这笔钱属于此订单/此渠道/此商户配置。

归属：原 5/7/11/13/14。保留 F16/F07 暂停，不通过人工按钮绕开。

### U05 · P1：原 CF 身份/租户问题没有真正关闭，部分公开调试数据风险仍在

独立补测确认：

1. [平台守卫](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/security.ts:487>)在完整认证返回 FORCED_LOGOUT 后，重新验签并仅检查 active，可以重新放行超级管理员。密码到期、会话失效等完整拒绝同样不应被弱路径绕过。
2. [API Key 鉴权](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/api-key-auth.ts:36>)匹配 hash 后不查询所属账号状态；单独的 Key 身份认证无法阻断封禁/注销账号。完整执行路径可能还有下游门禁，仍需逐入口核验，不能声称所有下游均可执行。
3. [公开 health 调试](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/health/debug-test01/route.ts:4>)无需身份即可读固定空间配额和成员；middleware 公开 health 前缀。用虚构成员夹具确认返回资料，未读取真实客户数据。
4. [初始化](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/init-admin/route.ts:5>)没有绑定 setup 凭证。两次空库条件并发的隔离调用均到达管理员 insert。Raw SQL 列名与 Entity 字段还需统一。此复现证明创建授权/并发缺失，不证明实际生产库会成功创建两个管理员。

源码确认：[test-db](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/test-db/route.ts:4>)和 debug/test01 只有中间件级登录门，路由没有管理员/归属控制；[标准岗位目录](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/posts/standard/route.ts:16>)与[空间建议岗位](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/workspace/posts/suggested/route.ts:60>)仍携带跨空间私有统计。动态权限规则的真实配置本次未读取，不将源码条件风险说成已观察到线上泄露。

归属：原 9/10/14，CF-F01/F02/F03/F07/F08。新增 lifecycle 注释把 CF-F08 解释成“个人企业边界”、把 CF-F10 解释成“角色统一”，与原 SCOPE-MAP 不符，须纠正对照，不能用错编号销项。

### U06 · P1：旧密钥会随未保存的新地址进入 BYO 测试

[空间 BYO 测试](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/workspace/byo-model/test/route.ts:55>)在客户端空 key 时解密旧 key，却使用客户端新 baseUrl。独立补测确认：旧配置地址为 original.example，提交 changed.example 和空 key，测试调用收到“新地址 + 旧密钥”。全部使用假 key 和捕获替身，没有外发。

普通公网 HTTPS 地址通过 SSRF 检查，不等于被授权接收旧密钥。这一缺口已经在原 8 项范围，不能以“用户是空间 OWNER”代替密钥目的地授权。原 6/8 对模型测试、润色等费用入口也未形成共享预算/attempt 接线。

### U07 · P1：解析隔离状态仍会仅因经过时间而释放；过期回收的计数失败仍可提交终态

[quarantine sweep](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-admission.ts:239>)把 `createdAt` 超过 75+15 秒当作停止证据，直接释放 QUARANTINED。独立补测中没有任何 exit/停止证明，仅将时间推进 100 秒，就归还了容量。**“曾请求 terminate”或“等了足够久”不能证明任务已停。** 这会重新打开原 F14 的资源超发风险。

[ACTIVE 过期回收](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-admission.ts:218>)没有像直接 release 一样检查两次计数 updateMany.count；独立计数未命中夹具确认 lease 仍提交 EXPIRED，workUnits 残留。直接 release 已修好，不应重写它。

源码还显示独立提取先 `arrayBuffer()` 全量分配，之后才核实际字节上限；请求体/字节读取的资源边界须补齐，不能只依赖 Content-Length。[现入口](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/studio/extract-text/route.ts:110>)已有 worker 启动前租约二次检查，必须保留。归属：原 1/F14、11/14。

### U08 · P1：FREE 查询仍改权益，加价率仍按数值大小猜单位

独立补测确认：[FREE 查询](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/quota-token.ts:33>)把库中 500 改为 100，并返回硬编码 100。只读 guard 纯函数存在，不能阻止这条实际写路径。应读真实批准配置，不能在查询时擅自“纠正政策”。归属：原 7、CF-F04。

独立补测确认：[费率解析](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/billing-config.ts:128>)将合法 20,000 bps（+200%）猜成旧单位并折成 2,000 bps（+20%）；当前合法上限为 100,000 bps。[调价 GET](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/model-pricing/global-markup/route.ts:145>)亦有同类显示转换。必须使用明确版本/单位与历史证据；不能再猜。归属：原 6、CF-F05。

### U09 · P1/P2：真实批量调价没有接入新增守卫，计数、审计和事务边界仍错

[实际调价接口](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/model-pricing/global-markup/route.ts:55>)只把两类 pricing 更新放入事务，默认配置在事务外重复 upsert；`batch` 结果没有赋给计数，modelCount/periodCount 永远为 0；审计失败 catch 后仍返回 success。

独立补测让模型/时段实际委托返回 7/3 行且审计失败，接口仍 200 success、回报 0/0。未真实改价。新增 `authorizePriceChange` 等纯函数没有接线，不能关闭 CF-F06。归属：原 11/13/14。

### U10 · P1/P2：未接线的成本、恢复和指标模块本身也不能直接接入

独立补测确认：

- 成本预约已有同幂等键的 RESERVED 后，替换用户、空间和 inputDigest，仍返回原预约成功；没有比较报价身份/参数。不能在集成时把它当安全核心直接调用。
- 指标把 1,000,000 微元预付收款全部计成 consumedService，即使另有 900,000 微元未消费余额。正确财务口径需来源事实/批准规则，不能简单盲减余额代替核算。
- 固定成本 UNKNOWN 时，全部成本组件都有已知占位数据即可让 `profitNotDeterminable=false`；利润完整性判断遗漏未知固定支出。
- 运营待处理过滤在 `scopeTenantId=null`、无跨租户权限时返回其他租户记录。

源码另外显示：预约 settle/release 先转状态、后返还计数，没有组合事务/恢复保证；执行编排没有实际模型调用或持久 attempt 委托，通用 catch 会将无法确定的异常视为确定失败退款；恢复函数可在无有效预约/状态迁移失败时仍返回 RECOVERED；运营动作只看调用方 SUCCESS/FAILED 意图，未验证业务事实，布尔 confirmed 也不是停止证明；指标 ledger/cost 没有事件时间字段，无法按其声明的窗口过滤，重复 ID 未去重。

后半部分为源码确认/待增加反例，不能冒充已在真实请求或真实数据库中复现。归属：原 6/8/11/12/13/14。

### U11 · P2：用户第一眼、真实成果路径和安全回跳未落实

[首页 Hero](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/components/HeroSection.tsx:99>)仍直接写“60+ 上线”“提效 300%”；本次未见对应测量/批准证据。新旅程模块虽写了动态能力和示例规范，实际页面未使用。[登录页](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/auth/login/page.tsx:275>)仍将 query/sessionStorage 的 redirect 直接赋给 location，没有使用安全校验；新 helper 中的 /workspaces、/capabilities 等候选地址也不能不核真实路由便接入。

这影响用户能否迅速理解价值，也影响信任与回访。不能通过再写一个状态机取代“首页→登录→空间→材料→费用确认→成果→历史复用”的可操作页面闭环。本次没有启动真实业务服务或浏览器，因此页面运行、用户认可和付费意愿均未验收。归属：原 10/14。

### U12 · P1/P2：数据集成和最终交付缺口，业务请求仍有 DDL

源码确认三处现存请求建表/改列：

- [Webhooks](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/webhooks/route.ts:40>) GET 在鉴权前 ensure table；
- [BYO 保存](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/workspace-byo-model.ts:115>)读路径探针已保留，但写路径仍 ALTER；
- [后台配置](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/settings/route.ts:195>)仍按错误惰性扩列。

与原 CF-F10/第13项“请求内无 DDL”冲突。新增 VerificationBudget 没有对应 migration，成本/attempt/恢复也没有生产持久化链。约定 `docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/` 不存在，未找到同版本 final-report/final-manifest/handoff。提交说明写过移除临时 deliverables，但无法替代要求的最终验收材料。

归属：原 4/13/14。清理文档不等于关闭问题；仅调整 schema 不等于真实库已迁移。

## 四、原 1–14 的覆盖判断

| 原项 | 当前判断 | 此次去向 |
| --- | --- | --- |
| 1 F14 | 部分修好，仍有 U07 | 只补停止证据/回收和读取边界，保留格式回归 |
| 2 F15 | 部分修好，U02/U03 未闭合 | 生产算法、真实调用消费、迁移一起补 |
| 3 F16 | 18 项定向通过，暂停机制保留 | 本轮不扩建收款/退款政策 |
| 4 中间集成 | OTP delegate/迁移缺口 | 并入原 13 集成返工 |
| 5 收款事实 | 部分实现，U04 | 可信绑定、原子认领、不可覆盖事实 |
| 6 报价/成本 | 未接线且 U08/U10 | 生产预约、报价绑定、既有费用门保护 |
| 7 来源/退款/权益 | 未接线，FREE 读写未修 | 保留旧账务；补真实只读/来源闭环 |
| 8 attempt/恢复 | 仅契约/测试，BYO 仍有 U06 | 实际入口、外部结果事实与恢复 |
| 9 身份/企业 | 新 pure helper 不能替代原安全修复 | U05 与实际撤权/到期矩阵 |
| 10 首次价值 | 模块未接页面，U11 | 原有页面闭环与真实能力/安全回跳 |
| 11 运营 | 未接线，U09/U10 | 真恢复、调价事务/审计 |
| 12 经营指标 | 未接线且口径错误 | 真实只读数据源、时间/去重/未知 |
| 13 总集成 | 未完成 | schema/delegate/migration/请求 DDL/实际调用链 |
| 14 最终核验 | 测试已改善，交付和场景证据未完整 | 同版本范围矩阵与完整交回材料 |

“部分修好/未接线”不计作 DECISION_BLOCKED。已经获准的工程接线和安全修复属于实现缺口。只有预算数值、商业售后、历史归属处理等未批准政策，以及真实库/供应商/人工验收，才能明确登记为决策或环境门。

## 五、对用户价值和盈利目标的判断

用户侧：现在不能凭新模块断言首次成果、再次使用和企业持续使用已经顺畅；首页可信度、登录意图、费用确认、真实结果/版本/来源及历史复用需要在实际页面串起来。更不能从单测推断用户愿意付费、留存提升或市场已经验证。

平台侧：现有单次模型成本准入和资金暂停机制有价值，但不等于所有入口、多步/重试/未知结果、短信邮件/OCR/存储等总支出已被共享预算控制。并发支付事实、验证码次数、旧 key 去向与隔离容量属于必须先堵的漏洞。收款不是利润，点数面值不是现金收入，尚未消费的预付款不应冒充已赚收入。

数据侧：必须把资金来源、收款事实、执行意图/attempt、供应商结果、成果版本、退款/恢复和指标关联到现有权威记录；优先复用已有表/服务，只有证明必要才补最小模型，不另造一套账或微服务。历史数据关系不明时只读核查、列差异，不自动补钱/扣钱/绑定/删除。

本轮固定终点仍是原 14 项范围。下一次应当对照本目录的**一份统一修复提示词**收口，不增加营销平台、优惠体系、排行榜、更多组件或自动部署。工程验收可做到明确可重复；真实利润、付费意愿和上线结论需要另行授权的实际数据与人工认可，不能承诺“修一次代码就一定不亏”。
