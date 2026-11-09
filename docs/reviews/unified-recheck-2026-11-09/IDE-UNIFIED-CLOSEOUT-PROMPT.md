# 交给两 IDE 的统一收口提示词：完成原 1–14，不新增批次

## A. 任务、版本与交付边界

仓库：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web`。

本次审核提交：`67243457064f645a3a4af1a2e8b4b1d012a85d2d`。如 HEAD 已变化，先核对相关差异，保护用户/其他执行者改动，不 reset/clean，不覆盖整文件解决冲突。

本次是**上一轮统一修复的收口返工**。原 1–14 尚有大量实现项未交，不能只处理容易的几项后宣布全部完成；也不新增第 15 批、营销功能、组件或另一套架构。内部按依赖顺序实施，但一次性交回完整工程结果，由独立审核者复验。

必读依据：

- [项目总纲](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/PROJECT-DEVELOPMENT-CHARTER.md>)；
- [原 SCOPE-MAP](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/SCOPE-MAP.md>)、[决策门](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/DECISION-GATES.md>)；
- [上一轮完整统一提示词](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-independent-review-2026-11-09/IDE-UNIFIED-REPAIR-PROMPT.md>)；
- [本轮复核](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-recheck-2026-11-09/REVIEW.md>)和本目录独立补测。本文是同范围的当前收口指令；上轮未关闭条目仍需完成，已关闭具体子项按本轮结果保留。

用户流程目标：访客理解真实价值→选择真实场景→登录/注册保留安全意图→在正确空间提交材料→确认接收者、付款方和费用→获得真实成果或明确失败/待核实→历史查看、下载与复用。企业撤权后访问失效、企业历史保留；管理员有权限地查看和恢复；平台费用前有预算和资金边界，收款只履约一次，未知结果不盲退再重试，经营指标不把预付款当利润。

禁区与保护项：

1. 不真实库连接/写入/迁移/seed、不创建真实管理员、不真实模型/SMTP/短信/支付/云桶、不部署。生产代码要实现完整，验证替换其外部 IO；不要把“不真实执行”理解成只写 Memory/Fake 后端。
2. 不读取/打印真实 .env、setup/支付/模型密钥、验证码或客户正文。测试使用明显虚构材料、专用假 key 和隔离数据。
3. 不变更真实价格、预算、赠送、商业退款、保留期或企业转个人政策；不打开生产 Token 结算/BYOK 新收费。未批准政策保持决策门，但不要因此拒绝完成已授权的工程实现。
4. 保留 F01–F13 既有止损、F16 旧直充退役与人工收款确认暂停、F07 `MANUAL_REFUND_APPROVAL_PAUSED`、既有固定点数兼容模式、真实余额和历史数据。
5. 已核实修好的 U08 费率原值/FREE 只读、delegate 拼写、普通消费失败拒绝、不同 host 不复用 key、调价真实计数等**不重做、不回退**；只补其仍缺的边界。
6. 保留旧审核记录和反例，不删除问题/测试换绿。实际业务状态与测试报告必须一致，不能用注释“同事务”代替真正事务。

可沿用原两 IDE 分工：A 原 1/3/5/7/9/11/13，B 原 2/4/6/8/10/12/14。schema/migrations 最终由 A13 一人集成；Studio handler 的解析和执行改动按块串行交接或隔离分支逐块集成，不能同时覆盖。auth/security 共享帮助由 A9 单写，OTP 路由由 B2 单写，接口先对齐；B14 核验同一最终版本。每方交起止 SHA、实际文件、入口/数据/测试、剩余门，依赖已交才集成。

## B. 原 2/4：把验证码与一次性授权真正修完（U02/U03）

重点文件：[backend](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-backend.ts>)、[高层操作](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-codes.ts>)、[SMS store](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/sms-store.ts>)、[邮件 store](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/email-code-store.ts>)及 auth 的发送、验证、注册、短信登录、重置、user/profile 路由。

### B1. 共享预算必须按真实数据库语义成立

1. 修首次创建竞争：读不到行→upsert update={}→直接成功是错的。已有行命中也必须执行同一次准入的条件/计数/间隔裁决。可用已有事务、原子条件更新/唯一认领实现；不能依赖 Prisma 一定抛 P2002，upsert 正常命中已有行本来就可能成功。
2. 并发冷启动时同目标 60 秒内最多原批准次数，platform/target/IP/actor 的计数与真实准入一一对应。平台或目标限制失败时，前面已占的额度必须正确回退或可恢复，不丢计数、不负数。
3. 修日窗口：过期后本次计数应是新窗口的真实第一次；不能只把判断变量设 0，写回仍 increment 旧 10。并发重置带版本/窗口条件，不能重置掉另一请求已计次数。
4. 给发送预约/结果回填稳定身份，failed 退款一次，unknown 不盲退，旧窗口/旧预约的迟到回填不得影响新窗口或其他发送。禁止无条件 decrement 和钳 0 掩盖差异。
5. 生产发送与核验都检查失败锁；消费也检查锁定、过期、未用及 challenge 身份。保持原 60 秒、10/日、5 分钟、5 次失败锁 30 分钟基线，不加任意商业限额。锁定结束计数按批准规则恢复，不擅自做永久锁。
6. 把可信 IP/已认证 actor 上下文从真实路由传到生产后端；代理/IP 信任边界明示，匿名场景不强求已注册账户，但不能信任 body 任意 IP/actor。报告声称账号预算前必须有实际实现与接线。
7. 保持正确 `verificationBudget` 命名；类型/测试委托忠实于真实 Prisma 的 upsert、CAS、缺行、日期/BigInt、失败/回滚。ready 不把 delegate 存在说成表/列已部署。任何必要结构缺失都在外部发送前稳定 not-ready/503，不内存放行、不请求 DDL。

### B2. 验证码、resetToken 和敏感业务绑定同一个不可替换授权

1. 持久记录 channel、归一化 target、purpose、challengeId/version、expiry、使用/锁定状态；现有 phone/type 不足时交最小 schema 增量。验证/重发/消费均绑定同一记录，不能操作“该账号最新任意码”。
2. resetToken 绑定已核验的 challenge 与一次性授权身份，包含正确用途/账号/有效期；服务端消费必须核对一致。码 A 签出的 token T，无论 A 是否已使用，均不能消费后来签发的码 B。旧 token 未过 JWT 时限也不因此获得新 challenge 权限。
3. 保留 reset-password 已修的 `{ok:false}` 拒绝。将授权消费与密码/绑定等敏感业务提交放在正确事务或可恢复状态机中；业务写失败不能假成功，也不能让授权永久丢失后无法正确重试。不要凭通用 JWT 验签成功直接改密。
4. 短信登录不能继续“先 verify、最后 await delete(void)”作为一次性消费。多个请求同时验证通过后，只有原子取得消费权的一方可提交会话；删除/消费失败不得继续发 token/cookie。成功登录审计、设备和 session 的先后/失败效果也按实际流程核对。
5. 注册、登录、绑定、改密所有实际调用一起核；不得登录码换改密、注册码换绑定，不能先创建账号/空间/领取权益再靠无返回值 delete 宣称已消费。优先复用现有业务服务，避免另造认证系统。
6. 当前未接通真实 SMS 继续 CHANNEL_NOT_READY，不启用付费供应商；测试可直接签发专用隔离 challenge，但不能导入真实账户可消费的码。

### B3. 邮件发送事实

1. 保留连接结果丢失为 unknown；accepted 必须据当前传输返回核实目标接收事实，不是 Promise resolve 即成功。空 accepted/目标明确拒收不得返回“验证码已发送”。多收件人/部分结果按实际调用契约处理，不伪造供应商行为。
2. 区分确定没有发起（如未配置）和已发起结果未知。缺配置在发送/有效签发前拒绝，或有明确定义的失效/回退；不能未配置也消耗长期预算，也不能未知就退完立即重发。
3. 发送结果与预约幂等关联；日志/响应不含验证码、密码、key 或正文。仅向合法收件正文传明文。

必须验收：冷库两并发首次发送、已有行 CAS、跨日重置、多失败后正确码也拒绝、过期不可消费、同一 failed 回填重复不负数、旧窗口回填不污染新窗口；验证码 channel/purpose/challenge 隔离；真实签名 token T 已用后发 B，T 再请求仍失败且 B 不被误消费；短信同码并发最多一份有效会话；消费 503 零敏感提交；密码写失败可解释恢复；生产委托测试不能预建行后宣称覆盖冷启动。实际发送/数据库连接均为 0。

## C. 原 9：初始化与身份/企业边界（U05）

### C1. 完成现有安装向导，不删安全门

入口：[安装页](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/init/page.tsx>)、[setup 验证](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/verify-setup-token/route.ts>)、[创建管理员](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/init-admin/route.ts>)。

1. 现页面验证 SETUP_TOKEN、创建端另要 INIT_ADMIN_TOKEN 且页面没传，流程必败。沿用已批准安装授权体系，第一步得到/绑定可验证的短期一次性安装授权，第二步实际传递并由服务端原子消费/认领；或按原批准契约提供等效安全闭环。不要随便新增另一份静态秘密要求用户配置。
2. 保留无授权拒绝、现有唯一认领与 Prisma 字段；授权绑定真正创建动作，空库检查/唯一初始化/用户创建同正确事务；失败回滚，重放/并发只一次资格。所有路径与错误状态对现有页面可用。
3. 用假 setup 配置、空隔离模型测实际两个 API 与页面请求契约。先成功验证但下一步漏授权必须有正确提示；合法向导流程能走通，旧授权不可重放。禁止读取真实 setup key 或创建真实管理员。

### C2. 完成原来未改的身份/租户工作

重点：[完整 auth](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/auth.ts>)、[平台守卫](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/security.ts>)、[API Key](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/api-key-auth.ts>)、[middleware](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/middleware.ts>)及真实成员/资料/知识/下载/岗位入口。

1. 完整认证 FORCED_LOGOUT、挤线、绝对/空闲超时、密码过期、封禁/注销、身份头不一致等拒绝，不能被重新 JWT 验签+active 弱兜底复活。多凭证解析可以统一，但拒绝语义不能丢。
2. Key 检查所属账号状态/撤销和当前空间授权；离职、账号禁用、分享/Key 撤销在 Studio/Open/资料/知识/历史下载一致生效。缓存失效可验证，不等不受控 TTL 才失效。
3. 新增 health/test-db 守卫保留，未授权零私有查询；仍存在的 debug/test01 也要关闭/最小化授权。不能靠页面隐藏、NODE_ENV 或只验 JWT 代替后端归属。
4. 标准岗位公共目录不夹带全平台 workspaceId/name、成员统计、usages/submissions；平台管理统计须真实专用权限，空间建议列表仅本空间被授权信息。不要把企业 OWNER 权限扩成全平台权限。
5. 企业撤权后访问拒绝、历史企业任务/成果/账务保留；套餐到期按已批准规则限制新增/只读，不清空付费余额、不删超额历史、不把企业资产转个人。未批准保留/导出/OWNER 转移政策单列决策门，其他安全工程继续。
6. 编号按 SCOPE-MAP：CF-F08=跨空间岗位私有统计；CF-F10=请求 DDL。纯角色统一/lifecycle 数组计算不能关闭这两项。

验收矩阵包含普通用户/空间 OWNER/平台只读管理员/动作管理员/超管、全部完整身份拒绝、Key 失效、跨空间 ID、旧缓存、分享撤销、套餐到期与个人资金不受影响。保留诊断授权正常路径；不发真实离职/资金/组织变更。

## D. 原 11：修真正的调价事务，接真正的运营恢复（U09/U01/U10）

### D1. 调价与审计

入口：[global-markup](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/model-pricing/global-markup/route.ts>)。

1. 保留已修真实 row count、删除重复 upsert、现行 bps 原值。
2. 模型主表、时段、全局默认、priceVersion 与必要审计/结果必须同正确原子边界或可证明的一致性恢复方案。当前两次 `$transaction` 不是同事务；不要只改注释或把第二次 transaction 套得更多。
3. 用真实事务 client 读必要旧值/计数并提交审计，失败语义一致；审计失败不留下未记账的价格提交。并发管理员改价的旧→新记录与最终版本要对应。
4. 权限按当前已注册、已批准的服务端动作权限，不靠请求 permissions 数组授权。不要给真实角色自动加权限，不真实改价。

验收：用惰性 PrismaPromise/交互事务忠实替身，任一价格/默认/审计失败都验证最终存储状态；不仅断言 status=500。正常 7/3 回报 7/3；重复请求/版本失败可追溯，不虚增或重复执行。禁止用“mock 返回错误即回滚一切”的不忠实测试。

### D2. 恢复与只读运营

1. 把收款未履约、任务 UNKNOWN、退款/预约恢复失败、解析停止未知、结构/worker/配置未就绪接到现有管理员页面/API，记录真实业务 ID、原因、事实状态、责任和下一动作。
2. 健康/查询/导出零资金写、零 DDL、零模型调用。null tenant scope 且无跨租户权限时拒绝或空结果，不能当全平台通配。
3. 恢复用真实专用权限、原因和必要再验证；动作来自持久可信事实。管理员选择 SUCCESS/FAILED 或 confirmed=true 不是供应商事实/停止证明，UNKNOWN 不能据此盲退重发或腾槽。
4. 原业务原语执行恢复，CAS/幂等与审计结果一致；无记录/非法状态/更新 count=0 不可返回 RECOVERED。失败或再中断可继续诊断，不二次退款/释放/履约。
5. 不绕过 F07/F16 暂停。备份/迁移/供应商/值守 runbook 如实说明未演练，不能拿说明文档当真实灾备验收。

## E. 原 8 / U06：补齐 BYO 目的地与完整执行链

### E1. 旧 key 的授权目标

重点：[BYO 测试入口](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/workspace/byo-model/test/route.ts>)、保存/分配/用户与空间 BYO 服务及实际模型适配器。

1. 保留不同 host 不复用旧 key；使用 URL 结构解析，不对整个字符串小写、不删除 scheme。host 的等价、默认有效端口、路径大小写、查询/凭据字段、模型接入协议及重定向按实际凭据绑定语义处理。必要差异重新提供该目的地授权凭据。
2. HTTPS→HTTP、大小写敏感路径/不同 tenant 路径、端口/协议等目标变化不能“空 key 自动解密旧 key”；跨源 redirect 不携带旧 Authorization，SSRF/DNS/协议保护保留。下游拒绝不应替代本层绑定。
3. 测试/保存两条路径用同一判定，不只修弹窗。目标变更且缺凭据在外部调用前明确拒绝；不能回退平台付费模型。所有测试用假 key/捕获函数，真实网络=0。

验收：同一明确合法目的地可按旧授权使用；不同 host、路径大小写实际不同、scheme/有效端口/协议改变均不得带旧 key；重定向不泄露。具体 URL 等价策略写明，不能为追求通过随意扩大/缩小批准功能。

### E2. task/attempt 与模型事实

重点：[编排](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/execution-orchestration.ts>)、[真实 Studio](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/studio/handler.ts>)、[Open](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/open/v1/execute/route.ts>)。

1. 落实生产 delegate 与实际费用入口，持久 task/attempt/预约/资金/供应商事实/成果/恢复关联。现有纯契约和 FakeAttemptDelegate 不是完成；优先复用既有 task、config、ledger、hold、recovery，必要最小增量交 A13。
2. 外部调用前落执行意图/唯一 attempt；区分未发送、确定失败、已发送结果未知、供应商成功本地保存/结算失败、有效成果成功。通用 catch 不能把 UNKNOWN/成功后本地失败当确定失败退完再允许新调用。
3. 编排实际控制模型调用，不能把资金 consume 返回值当供应商结果；正确传递 tx，不把模型网络等待包在 DB 长事务。客户端断开/关页不等于供应商没执行。
4. 同键重复请求返回原任务，不双扣或再发模型；多步、质量重试累计成本/usage/attempt 并受授权预算。恢复据保存事实处理本地结果/费用，不再打一次模型猜结果。
5. 没有有效 reservation/hold/状态迁移失败不得 RECOVERED；恢复再失败仍可继续，旧执行者不能覆盖新状态。持久成果绑定真实版本/来源/费用；历史预览/下载零模型调用。
6. Studio/Open、润色、admin provider/deployment test、user/workspace BYO test 都进当前批准的费用/权限/可追溯路径；不要测试入口、超管或 -1 权益自动免费绕过平台支出保护。

## F. 原 1 / F14：安全收尾解析，不重写已好的格式逻辑

重点：[准入](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-admission.ts>)、[runner](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-runner.ts>)、[提取入口](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/studio/extract-text/route.ts>)和 Studio file/asset/upload/预览。

1. 删除“createdAt 超过 TTL+grace 就视为停止”逻辑。QUARANTINED 和已启动 ACTIVE 的租约失效都不等于物理工作停止；时间只能触发核验，释放要当前 lease/claim/实例对应的可信 exit/未启动证明/原执行进程终结证据。
2. 无证明保留隔离并可诊断；late exit 与 quarantine 前后竞态都能只释放一次。旧 token/旧实例不能释放新占用。回收失败有恢复事实，不能永久无原因卡槽或定时清零掩盖。
3. ACTIVE sweep 检查 platform/user 更新 count=1，任一未命中或抛错则原子回滚，不能提交 EXPIRED 后残留 workUnits。复用已修的持久化权重 release，不再用调用方权重。
4. File.size 等读取前预检加实际有界读取、有限等待/取消；不得先无限 arrayBuffer 再看上限。Content-Length 仅提示；独立提取/任务/预览按原合同各自限制，不擅自重设套餐。
5. 保留 worker 启动前租约校验、OCR 有限终止、根预算、迟到创建清理、旧 doc/ppt、xlsx 数值/工作表/预览与 F13 对象清理。

验收：cap=1，worker 永不 exit，推进超过 TTL/grace 仍不能起第二个；可信退出后幂等归还；两个回收者/两种回调顺序/计数 count=0/抛错/多周期守恒；慢读取/真实超限/取消有限失败且不启动额外 worker、不先写成功文档。受控线程/假材料，不真实 OCR 下载。

## G. 原 5：支付事实与唯一履约，不能继续跳过（U04）

重点：[统一履约](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/fulfill.ts>)、[微信](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/wechatpay.ts>)、[支付宝](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/alipay.ts>)及 notify/订单/席位/企业履约。

1. 当前实际产品按官方协议核签名/解密、商户/应用、订单/渠道、币种、交易状态、交易号和精确金额，必填字段缺失拒绝。底层 REAL 也强制，不依赖每个路由自觉；客户端 paid/备注/截图不是可信收款。
2. 金额按安全整数与协议精度解析，禁止 Math.round 接受 10.004→1000 分、非法指数/NaN/Infinity/超安全范围等。具体合法格式按当前产品协议，不自行选支付供应商/商业政策。
3. 按正确渠道/商户语境/交易号建立持久原子唯一认领。findFirst 没查到再 grant 无法防并发；同交易并发跨订单最多一次履约。同字符串不同渠道合法情形不要误冲突。
4. 认领、原资金/权益原语、订单终态/审计正确事务/幂等关联；不无条件 markSuccess 覆盖竞争终态，不把外部网络包入长事务。发放提交失败/响应丢失可恢复，不重复点数/席位/企业权益。
5. 取消/过期/超时后真实收款持久留存并接运营恢复，两个不同交易不能覆盖单个 pendingReceipt。成功 ACK 以事实可靠落下为前提；冲突事实留差异，不能成功订单直接 ALREADY_PROCESSED 掩盖金额/渠道异常。
6. 查询零权益/订单写；保留旧报价/改价、取消并发到账、席位/企业开通与已购余额语义。人工收款/退款继续暂停，不通过恢复按钮绕过。

验收：双订单并发同交易、同单重发、跨渠道/商户/应用/币种不符、缺金额/交易号、非法精度、晚收款多笔、提交/取消竞争、权益成功后订单失败、查询无副作用。协议签名与验签后的业务逻辑分别测；mock verify=true 不能当真实渠道验签互通。

## H. 原 6/7：生产成本预算、报价绑定、资金来源守恒（U01/U10）

重点：[成本预约](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/cost-reservation.ts>)、[实际估价](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/billing/estimate/route.ts>)、[现有 credit](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/credit-service.ts>)、[退款依据](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/refund-basis.ts>)及 hold/settlement/recovery。

### H1. 报价与平台支出

1. 写生产共享原子 backend 并接真实执行，不能用 MemoryReservationBackend 或未使用 import 冒充接线。保留原单次成本准入、固定点数兼容和硬关闭门。
2. 服务端报价绑定 user/workspace/付款账户、合同/部署/价格版本、材料/结构化字段摘要、执行范围、授权上限、有效期和幂等身份；客户端不能定 vendor/key/费率/模型或报价。输入/付款方/合同/价格变了须重新授权。
3. 同键同参复用，同键换用户/空间/输入/付款方等拒绝，不能返回他人的原预约。重放使用原真实快照，禁止用字符串长度伪造 inputTokenUpperBound/budgetPoints。
4. 共享预算覆盖有效在途、UNKNOWN 和原批准范围的已消耗；settle 释放在途不代表抹去历史成本。跨实例/账号/空间/模型、管理员/-1/赠送来源均不能越过平台支出保护。
5. reserve/落行、状态/计数/hold 变更原子或可靠恢复；create 失败、状态 count=0、计数失败、提交响应丢失不泄漏/负数/重复释放。未知保守保留，不能当免费失败再试。
6. 明确每个费用入口的预算来源/费用前拒绝/attempt/恢复，覆盖多步/重试/润色/模型测试/BYO，不仅主 simulate。未知成本不当 0，未批准新费用能力维持 not-ready；不自编现金预算，也不一刀切关掉已批准正常旧业务。交逐入口适用表。

### H2. 来源与权益

1. 保留 FREE 只读修复；来源退款/释放/预览接真实 ledger/grant/wallet/workspace/member/hold/recovery，关联具体原消费/账户/空间/期限，不能只按任意数组的桶名相加。
2. 已扣/净耗/已退/已释放/保留按当前账务定义守恒。重复退款/释放不能创造额度，赠送不能变现金，企业资金不转个人，未知来源列差异而不是补“兜底付费来源”。
3. 复用成熟原语，不另造钱包/账本；自动失败退点、结算释放和人工只读预览共用正确依据，F07 商业批准继续暂停。可退点与可退现金明确分开。
4. quota 双关联只读核查，稳定一对一才认可，冲突不自动重绑/补额度；注册/空间删除重建不能重复领取同一原资格，但不新增赠送政策。历史映射/期限不清只列差异。

验收：同键异参拒绝、过期/旧价不能授权新任务、两个实例穿预算失败、UNKNOWN 不释放、结算不清历史已耗、全部费用入口有同源保护；逐来源并发双退/双释放/提交故障守恒，账户/空间/期限不变；只读查询零权益写；历史 quota 冲突不修库。

## I. 原 10：把首次价值做到实际页面（U11）

重点：[首页 Hero](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/components/HeroSection.tsx>)、[登录页](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/auth/login/page.tsx>)、注册、workspace-hub/Studio/ConfirmRunModal/任务/结果/资产与账务页面。

1. 首页清楚说给谁、解决什么、得到什么和主行动；能力来自当前已发布且有证据的合同/服务。无批准或测量依据的 60+ 上线、提效 300% 等去掉或改真实表达，不虚构客户数/案例/支持承诺。示例永久标示，模拟器不是实际分析。
2. 使用真实存在的路由/场景，不直接接 helper 里未经核对的候选 URL。登录/注册保留安全工作意图，所有最终 redirect 输入校验，拒绝外站/协议相对/反斜杠/危险协议与编码绕过，回落现有站内安全路径。
3. 前置报价显示真实空间/资料接收者/付款方、材料与成果范围、固定/估算/免费性质、授权上限和有效期。未上传不称已保存，修改输入/模型/付款方需重新确认，不静默新收费。
4. 状态来自持久 task/attempt，UNKNOWN 清楚说明下一步，不假进度/倒计时/空结果成功，不给用户一键盲重试导致第二次模型费。
5. 成果显示内容/来源/版本/需复核处、真实费用/退点状态；历史查看下载/复用不重打模型，确需新执行先重新授权。企业材料不得跨空间缓存复用。
6. 无权限/余额/预算/套餐/供应商/解析能力提示真实原因和可行下一步，保留安全历史阅读；不让技术日志替代用户提示。模块存在但页面未接是 FAILED，不是浏览器环境门。

验收实际串联：访客→场景→登录/注册回跳→正确空间→材料预检→报价→任务→成果/费用→刷新历史→下载/再次工作，并测余额不足/UNKNOWN/撤权/到期/示例。隔离 API、假文件、真实费用=0。不能安全启动浏览器则如实登记环境阻碍与替代证据；源码接线仍要完成，不能声称留存/付费意愿已验证。

## J. 原 12：经营指标必须有真实来源和正确口径（U10）

重点：[value-cost-metrics](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/metrics/value-cost-metrics.ts>)及现有用户/空间/管理员只读统计/导出入口。

1. 接实际 task/attempt/成果/ledger/收款/成本数据，不只测试数组；用最小业务 ID/版本/原因，不新增外部付费分析平台，不收正文/密钥。
2. 事件时间/来源进入 DTO，按窗口/时区/租户一致过滤，稳定业务 ID 去重；同任务重试、attempt、刷新、内部测试/模拟不算新增价值或收入。用户满意需要明确事实，不以下载替代认可。
3. 真实收款、已消费服务、未消费预付款、退点、现金退款、赠送/推广、供应商与固定支出分栏。禁止 consumedService=realCollected，也不能盲用“收款减当时余额”造会计收入；无批准/来源则 UNKNOWN/口径未定。
4. profitNotDeterminable 覆盖未知固定/供应商/支付/存储/支持成本、收入/来源差异和缺口；可汇总已知部分但不称完整利润。没有记录不等于成本 0，零成本须有证据。
5. 首个有效成果/重复工作/质量失败退点/留存按实际样本，低频工作不强求日活，不编 DAU/LTV/转化。目标贡献率/风险准备未批仅离线敏感性，不写回售价/预算。
6. 服务端租户/查看/导出权限，用户不读其他企业；指标 GET 零补权益/扣账/模型/调度。避免界面上“绿色盈利”掩盖 UNKNOWN。

验收：充值 100、未消费 90 不把 100 全记已消费；未知固定成本不能判完整利润；窗口外金额/成本排除，重复 ID/attempt 不重计；赠送/模拟不伪收入；跨租户拒绝，查询零业务写。原错误口径测试改为正确结果时说明依据并补反例。

## K. 原 13：完整离线数据与唯一集成（U12）

1. VerificationBudget 当前只有加列迁移，没有建表迁移。以目标已部署状态为依据，准备空迁移链可创建、已有表兼容的完整离线方案，正确顺序/默认值/BigInt/索引/唯一键与客户端一致。不能假设 schema model 已自动变数据库表，不真实 apply，不随意重写可能已执行的历史迁移。
2. 统一前述 challenge/发送预约、支付事实、成本/task/attempt/恢复等已证明必要增量；优先复用现有记录，别把每个逻辑概念都建表。模型、生产 delegate、tx client 和调用方一起对齐。
   本地当前生成客户端 DMMF 的 VerificationBudget 还没有 lastSentAt/failCount/lockedUntil，必须纳入受控离线生成与兼容步骤；any 使 tsc 通过不能替代这个核对。不要在未隔离真实环境的情况下直接 generate。
3. 移除业务请求 DDL：Webhooks GET/POST 自愈 CREATE、BYO 保存热 ALTER、settings 惰性扩列及扫描到的同类；转为离线迁移和稳定 not-ready。鉴权前不能建表/改列，保留只读结构探针。
4. 不运行真实 migrate/seed；validate/generate 也必须隔离真实 .env/库/网络，无法隔离则明确环境门。数据库状态未知不算已部署，历史关系不清不自动补钱/扣回/迁租户/删资料。
5. 核实际调用链：页面/报价→共享预算/资金→task/attempt→供应商事实→成果/费用→恢复→指标；支付→收款→原子认领→一次履约→查询；撤权覆盖 UI/Open/Key/资料。交实际文件/函数/生产 backend，未接不能用 import 或 Memory 代替。
6. 全部实现者交同版本文件/契约/测试后唯一集成，冻结最终 HEAD 与保护文件 SHA，测试前后比较。不要把实现依赖未齐写 DECISION_BLOCKED；只有具体政策未批才属于决策门。

停止条件：真实历史库/政策不清时停止该危险变更，保留只读能力和差异，继续无依赖的已批准代码任务。不是只交部分修复就结束；原工程闭环全部落实或具体外部门如实列出后交最终材料。

## L. 原 14：一套验收反例、一次性交回，固定终点

### L1. 必须将本轮缺陷确认改成正确结果断言

本目录 `independent-results.json` 中 DEFECT 通过代表仍有漏洞。不要照抄其“错误结果”为成功标准。正式新增/修正验收至少覆盖：

| 原项 | 关键正确结果 |
| --- | --- |
| 2/4 | 冷启动并发最多合法次数，真实准入数=预算数；不得预建行避开 |
| 2/4 | 失败 5 次后核验/消费均受锁；过期不可消费 |
| 2/4 | 跨日 count 从本次新预约起算；重复/跨窗口回填不负数、不污染 |
| 2 | T 不能消费后来 B；并发同一码最多一个敏感业务成功 |
| 2 | 消费不可用、密码提交失败、发信结果未知/拒收都无假成功 |
| 9 | 安装向导合法授权完成创建；无授权/重放/并发拒绝 |
| 9 | 完整身份拒绝不被弱 fallback 复活；账号不可用 Key 拒绝 |
| 9 | 私有诊断/岗位/企业数据无跨租户；撤权各入口一致 |
| 11 | 审计失败时价格/默认/版本都保持正确原子结果；计数真实 |
| 8 | scheme/路径/端口/协议/redirect 变更不携带旧凭据 |
| 1 | 无停止证明过 100 秒仍占隔离；计数未命中回收不假终态 |
| 5 | 双订单并发同交易最多一次权益；渠道/商户/应用/币种/金额严格 |
| 5 | 多笔晚收款不覆盖；失败/重发/查询不双发或写账 |
| 6/8 | 同键异参拒绝，跨实例预算/UNKNOWN/恢复不漏支出、不双扣 |
| 7 | 逐来源退款/释放守恒，FREE 读不写，历史关系冲突不修钱 |
| 10 | 实际首页到历史复用/拒绝/UNKNOWN，安全回跳且不二次调用 |
| 11/12 | 无 scope 不跨租户；预付/消费/利润分栏，未知与窗口/去重正确 |
| 13 | 空迁移链有创建前提；所有请求无 DDL，缺结构外部费用前拒绝 |

对每个敏感拒绝同时断言存储/资金/网络调用计数和最终状态，不能只检查 HTTP。事务测试必须有唯一约束、count 条件、失败回滚/惰性 PrismaPromise 语义，不用失真的自动成功 mock。

### L2. 精确执行与同版本证据

1. 原 18 文件基线来源：[冻结目标](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/R0-J6-independent-review/validation-results.json>)的 formal.files。当前 32 文件见[本轮目标](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-recheck-2026-11-09/test-targets.json>)。加本轮正式反例；先核所有外部 IO 隔离，再精确运行，禁止无过滤全仓测试。
2. 保留原业务断言、F16/F07、存储/到期/单次成本门与已修 U08。两份 node:test 用匹配 runner 加有限 timeout；worker 语法与本地真实停止检查，不下载 OCR，不覆盖运行服务产物。
3. 严格 `tsc --noEmit --incremental false -p tsconfig.json`；不新增排除文件/放松模式/any 绕字段错误。必要构建先保证无真实环境/外部副作用，否则列环境门。
4. 真实入口 API 与页面组合矩阵：用户/管理员角色、授权/拒绝/加载/空态/成功/确定失败/未知/恢复，检查费用和数据副作用。浏览器不能安全启动就交具体阻碍，不伪造截图或声称人工通过。
5. 记录精确命令、全部目标文件、时间/退出码、通过/失败/取消、替身范围和源码 SHA。现有 r0l 并未调用 login-sms/reset-password/profile，不得再声称它已覆盖这些路由；新证据必须对应具体用例。
6. 真 MySQL 锁、渠道验签互通、真实迁移/供应商成本和人工业务认可仍独立列环境/授权门，不从 mock 推断。目标是工程证据完整，不是编造利润保证。

### L3. 最终交回目录与格式

保留原目录：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/`。本轮审核材料不能覆盖；开发交付记录当前版本并保留此前版本历史。

交回：

- `final-report.md`：逐原 1–14、U01–U12 及本轮子问题，用户可见结果/真实 API/数据/权限/费用/恢复，明确哪些已保留、哪些新落实。
- `scope-acceptance-map.md`：原编号→入口/函数/页面/测试/结果；不再把原5写成 F16/SMTP 或把未实现叫环境门。候选未选列 OPTIONAL_NOT_SELECTED。
- `final-manifest.json`：真实最终 HEAD、基线、起止时间、逐改动/保护源码 SHA、schema/migration、各执行者交接、测试前后无漂移。只有“基线+改动”和文件名不合格。
- `final-tests.json` 和原始输出：完整命令/文件/时间/退出码/通过失败取消，匹配每项覆盖断言；缺陷复现与修复通过分开。
- `production-wiring-map.md`：每个实际费用/敏感入口→真实共享服务→生产持久事实→拒绝/恢复→页面。不能用 Memory/Fake 代替生产实现。
- `user-journey-evidence.md`：实际路由、角色、输入/操作/看到的状态与费用，隔离方式、未做的浏览器/人工验收。
- `schema-migration-and-recovery.md`：建表/增量完整前置、delegate/唯一/索引、兼容回滚、历史差异、请求 DDL 移除、真实迁移未执行声明。
- `decisions-and-release-gates.md`：每具体政策或环境门、影响动作、当前阻断、解除负责人/证据；未接线/缺迁移/缺代码不写成决策阻断。
- `handoff.json`：`DELIVERED_PENDING_INDEPENDENT_REVIEW`，最终 SHA、所有执行者停写、未完/失败/决策/环境门完整列表。

状态按具体子项使用 PRESERVED_VERIFIED / IMPLEMENTED_OFFLINE_VERIFIED / FAILED / DECISION_BLOCKED / ENVIRONMENT_UNVERIFIED；不要一个大项写“完成”掩盖未完子项。没有源码接线标 FAILED；源码完成但没浏览器/真实库验证单列 ENVIRONMENT_UNVERIFIED。

最后直接列出真实未完成项与完整报告/manifest 路径，不只报测试数量。原工程范围达标后停止，不继续新批次/新产品。若仍有失败，保留原编号、说明证据和原因，不自行自签独立验收、生产可用或“平台一定盈利”。
