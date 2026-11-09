# 统一剩余修复指令：原方案 1–14 固定收口

## 0. 本次任务与执行纪律

工作仓库：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web`。

当前审核基线：`6d9f68b`，完整 SHA 以本目录 verification-summary.json 为准。HEAD 或工作区不同先列差异，保护用户改动，不 reset/clean、不覆盖整份 schema/handler。

这是原统一返工的剩余工程范围，**没有第 15 批，没有新产品需求**。一次接收全文，内部按依赖实施，全部工程交付后统一独立验收，不再只修容易的几个子项便称全部完成。

必读：

- [项目总纲](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/PROJECT-DEVELOPMENT-CHARTER.md>)；
- [本轮审核](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/REVIEW.md>)、[验证摘要](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/verification-summary.json>)；
- [上一提交原范围只读副本](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/reference/SCOPE-MAP.md>)、[原全部指令副本](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/reference/ALL-INSTRUCTIONS.md>)、[原决策门副本](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/reference/DECISION-GATES.md>)；
- [上一轮收口指令](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-recheck-2026-11-09/IDE-UNIFIED-CLOSEOUT-PROMPT.md>)。本指令把当前剩余工作集中列出；已经验收的具体修复不重做。

目标用户闭环：访客明确价值→真实场景→安全登录/注册意图→正确空间/资料归属→预检和付款方/费用确认→真实任务/成果或诚实失败/未知→历史下载/复用。管理员有权限地对账/恢复，企业撤权和历史保留一致，平台所有费用入口有授权、预算、持久事实和安全恢复。

强制边界：

1. 不真实连接/写业务库、不 apply migration/seed、不创建真实管理员、不真实模型/SMTP/短信/支付/云桶、不部署；用隔离 IO 验证生产实现。不能因为不能真实执行，就只写 Memory/Fake 模块。
2. 不读取/打印真实 .env、setup/支付/模型密钥、验证码或客户正文。测试只用假 key、虚构材料和隔离模型。受控离线 generate/validate 也不能偷偷加载真实环境或网络。
3. 不改变实际售价/现金预算/赠送/商业退款/保留期/企业转个人政策，不开生产 Token 结算/BYOK 新收费。缺具体政策列决策门；未写代码/未接线/缺迁移是实现缺口，不是决策阻断。
4. 保留固定点数兼容、既有单次成本准入、F01–F13 止损、F16 旧直充退役/人工收款暂停、F07 `MANUAL_REFUND_APPROVAL_PAUSED`、真实余额和历史记录。
5. 本轮已修好的冷启动计数/窗口普通路径、challenge 绑定和短信唯一消费、平台 helper 弱兜底移除、Key 账号状态、安装授权、调价失败回滚、URL scheme/path 比较、严格金额和三类请求零 DDL等子项保留。不要整个模块推倒重来，也不要因为还有剩余缺陷回退安全门。
6. **不得修改旧独立审核目录和原始结果。** 正确结果断言放正式测试或新复验目录。当前已有 9 个旧审核测试被执行方改写，记录变更与旧 SHA；能从可信快照恢复原证据则恢复，不能恢复就保留事实声明，不伪造旧内容。除用户另有明确删除授权外，恢复/保留误删的原方案和审核 Markdown；只处理对应文件，不全仓 restore 覆盖用户工作。

可继续原分工：A 原 1/3/5/7/9/11/13，B 原 2/4/6/8/10/12/14。schema/migrations 由 A13 单写集成；Studio handler 的解析/执行按块串行交接或隔离分支逐块集成；auth/security 公共帮助由 A9 单写，OTP 调用由 B2 单写。先交最小接口/数据契约再消费，禁止同时覆盖共享文件。内部依赖顺序不是新增开发批次。

## 1. 原5 / U04：把交易事实唯一性覆盖所有订单与终态

重点：[统一履约](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/fulfill.ts>)、[席位履约](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/seat-addon-fulfill.ts>)、[收款解析/认领键](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/receipt.ts>)以及微信/支付宝 notify、企业/充值履约与订单查询。

必须修：

1. SEAT_ADDON 不得绕过渠道/商户/交易号持久唯一认领。席位的订单 CAS 只管同一订单，不能管同交易跨订单。沿用既有席位资格、报价/期限、事务/回滚，增加/复用全类型统一的收款事实裁决，不复制第二套席位发放。
2. REAL 底层包括席位都必须有完整受控事实；不能为兼容旧测试允许缺交易号。现通知入口有必填不等于服务底层可放宽；MOCK 保留生产关闭，不用 MOCK 绕开 REAL。
3. 唯一事实认领应覆盖正常、已成功、取消/过期/晚到账及恢复分支。区分同笔通知重放与另一笔交易；SUCCESS 收到不同交易不能直接 ACK 后丢弃。保留事实/差异，不自动追加权益或退款。
4. 取消/过期同订单多笔到账采用持久事件/条件事务/版本等原子方案，不能对旧 metadata 读改写覆盖。两笔同时到账必须两笔都可追溯，已知重复不无限追加冲突数组。
5. 收款事实、认领、原账务/权益、订单状态和恢复记录在正确事务/幂等边界内一致。提交失败、响应丢失、发放后订单更新失败可恢复，不产生重复点数/席位/企业、不无条件覆盖并发取消或终态。外部网络不包入 DB 长事务。
6. 保留严格金额、商户/应用/币种/渠道/签名核验；认领键及前置历史去重采用同一渠道/商户语境，别一处含商户、一处忽略。未知事实不可由客户端 paid/截图/备注代替。
7. 若继续用 billingrecord 保存技术认领，标明技术类型/状态，核对用户订单、账单、退款、对账、金额统计均不会把认领记录当第二笔收款；不强制再建独立表，但必须有正确可解释的数据模型。

验收（真实运行两层服务，不能 mock 掉席位履约后说已覆盖）：

- 同一交易并发两个不同席位订单最多一次合法权益；同订单重发仍只一次。
- REAL 席位缺交易号/金额/可信归属拒绝，零权益。
- 两笔不同交易并发晚到账都持久保存；SUCCESS 的第二笔交易留差异，重复同笔不二次发放。
- 充值/席位/企业类型、取消并发、过期、事务/提交失败、恢复重放均不双发或丢事实；订单 GET 零资金写。
- 正式签名/解析与业务状态机分别测；真实 MySQL/支付互通未授权不执行，不把 mocked verify=true 当渠道验收。

## 2. 原2/4 / U02/U03：发送回填身份、消费锁与提交一致性

重点：[生产 backend](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-backend.ts>)、[高层验证码](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-codes.ts>)、SMS/email store、发送/验证/重置/注册/短信登录和 profile 绑定路由。

### 2.1 共享预算与核验/消费

1. 为每次发送预约/结果回填绑定稳定身份、窗口版本和状态。一次 failed 只退一次，不能靠 count>0 防负数就称幂等。A/B 已准入时，重复回填 A 不能退掉 B 的平台占用；旧窗口迟到回填不污染新窗口。进程中断/部分回退失败可诊断恢复，不钳 0 平账。
2. 锁定、过期、未使用、purpose/channel/challenge 身份在验证与敏感消费端使用同一事实。原 lookup 锁定修复保留，但 consume 也必须在正确原子边界核对；已签 token 不得越过之后的有效锁/撤销策略。
3. 区分“锁记录不存在”和“表/委托/查询不可用”。后者不能吞成 null 后当没有锁继续授权；缺结构/服务故障在敏感效果和外发前稳定 not-ready/503，不内存放行。ready 不把 delegate 对象存在当成库结构已部署。
4. 失败次数首次创建也要并发安全，不能原封保留 upsert update={} 丢增量。锁定开始/结束按原 5 次、30 分钟批准语义，拒绝中的核验不要无依据改成永久延长锁。
5. 将可信 IP/已认证 actor 从实际入口传入生产预算；代理信任边界明确，不能信任 body 任意字符串。匿名场景仍可按原流程，但不能宣称存在实际没实现的账号/IP 限制。
6. 保留已修首笔唯一 create、60 秒、10/日、5 分钟、跨日重置；旧码标用与新码创建的签发/失败处理要原子或可恢复，channel/用途/同一 challenge 不串。必要最小模型增量交原13，不强制每概念建表。

### 2.2 敏感业务提交

1. 保留 resetToken challenge/jti 绑定和短信唯一消费，不能因故障恢复重新开放旧 token 消费新码。
2. 改密不能先永久消费授权再独立更新用户，导致 update 失败后重试永远 400。授权消费与敏感业务写在同一事务，或有明确持久操作/恢复状态；失败可解释重试，已提交但响应丢失不能重做敏感动作。
3. 同样核对绑定、注册/默认空间/赠送、短信会话/设备/审计的实际顺序。不能先创建/发权益/写成功审计，后续失败却无恢复；也不能失败后无条件恢复所有验证码有效。复用现有原语，不另造认证平台。
4. 未接通 SMS 继续 CHANNEL_NOT_READY；测试用隔离签发，不启付费通道或真实账号可消费验证码。

验收：A/B 两预约+重复 A failed 不改变 B；跨窗口回填、部分故障、并发失败计数；已锁 challenge 即使持有效 token 也不能错误消费；锁服务不可用验证/消费失败且零敏感效果；过期在提交边界不放行。码 A/token T 使用后发 B，T 不能消费 B；密码写失败、提交丢响应、注册/绑定/会话持久化失败有正确恢复。生产委托必须忠实条件/唯一/回滚，不能只测 Memory。

## 3. 原2 / U03：邮件确认必须是目标的精确接收事实

重点：[mailer](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/mailer.ts>)和 send-email-code。

1. 删除 includes 子串地址判断。按当前传输契约提取规范化邮箱并精确比较；alice@example.com 不能因 malice@example.com 被接受就成功，空字符串也不能匹配一切。
2. 没 accepted/rejected 等必要确认事实时不能 default accepted。目标明确拒收=确定失败，无法确认=unknown；只有有事实确认该目标被接受才显示已发送。保留已修网络结果丢失的 unknown。
3. SMTP 未配置属于确定未发起，和已发起结果未知分开。发送/有效签发前预检或明确定义失效/幂等回退，不能长期误占预算；unknown 不能退完再立即重发。
4. 结果与上述发送预约身份对应；明文码仅进入合法邮件正文，不在日志/响应。测试不得真实发信。

验收：相似后缀邮箱、不规范/空 accepted、缺确认字段、目标 rejected、网络 unknown、未配置、重复结果回填与正常 accepted；断言状态、验证码有效性和预算效果，不只看 HTTP。

## 4. 原9 / U05：完整身份不能只在平台 helper 生效

重点：[Webhooks](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/webhooks/route.ts>)、[auth](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/auth.ts>)、[security](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/security.ts>)、[Key](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/api-key-auth.ts>)、middleware 和实际企业/资料/岗位入口。

1. Webhooks 不能 x-user-id 存在就跳过完整会话状态，或查到用户就当授权。中间件验签身份不等于会话、封禁/注销、强制下线、密码到期/撤权有效；统一完整验证并保留其拒绝语义。未授权不查询/返回 secret，不先做业务写/结构写。
2. 保留平台 helper 删除弱兜底、Key 账号状态和安装授权向导的修复，不重做；检查实际入口全一致，不用 helper 单测代表全站。
3. 完成尚未交的企业撤权：成员离职/Key/分享/岗位撤销后，UI/Studio/Open/资料/知识/下载及必要缓存一致拒绝；企业历史成果/账务保留，个人资产不误删/转移。
4. 标准岗位公共目录与本空间建议只含可公开或本空间被授权信息；全平台 workspaceId/name/成员/usages/submissions 需真实平台专用权限。debug/test01 等残留诊断不能基本登录就暴露他人资料，保留最小健康状态。
5. 到期按原批准策略限制新增/只读，不清空付费余额、不删除超额历史、不转企业资金给个人。OWNER 转移、保留/导出期等未批准规则列门，不编政策。

验收：中间件身份仍有合法签名但会话已 FORCED_LOGOUT/过期/封禁时 Webhooks 及其他受影响入口拒绝，零敏感查询/写；正常合法请求仍可用。跨空间 ID、旧缓存、分享/Key 撤销、企业到期/离职与个人资金隔离；安装合法向导、无授权/重放/并发和已修 Key 正常路径继续通过。

## 5. 原11 / U09-6：审计内容必须与实际修改同事务对应

重点：[global-markup](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/model-pricing/global-markup/route.ts>)。

1. 保留当前单事务价格/默认/审计回滚和 API 真实计数。
2. 同一事务内实际更新拿到 count 后构建审计，再提交；不能在 count 还是 0 时预构建审计，事务结束后只更新响应变量。必要旧值/版本也与该次写对应。
3. 不事务外补审计、不把事务外查询数量当实际修改数量，不擅自改变 scope/价格政策。权限继续后端批准动作；测试真实调价=0。

验收：真实委托返回 7/3，API 和持久 audit details 都是 7/3；默认模式计数按其真实语义；并发旧→新/版本可追溯；审计/价格/默认任一失败整体无部分提交。用惰性 PrismaPromise 或交互 tx 忠实模型，不能自动成功 mock。

## 6. 原8 / U06：目的地比较覆盖实际 query 与请求构造

重点：[BYO 测试](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/workspace/byo-model/test/route.ts>)、保存/分配与实际模型适配器。

1. 保留 host、scheme、path 大小写/端口修复；不要再去掉 query 后自动取旧 key。按实际凭据/路由语义定义目标，未知 query 变化默认不复用，只有已核实不影响接收者的参数可等价。
2. 保存、测试、适配器最终请求和重定向使用同一规范/授权边界；不能本层判同目标、下游实际请求另一目标。保留 SSRF/DNS/跨源 redirect 不带旧 Authorization 等保护。
3. 目标变化+空 key 在外部费用/调用前明确未就绪，不解密旧 key、不自动回退平台付费模型。所有验收用假 key/捕获函数，真实外发=0。

验收：tenant/query、重复/编码 query、scheme/path/端口/协议/redirect 变化不得错误复用；相同合法目标正常验证。具体可等价参数列依据，不用“通常没用”扩大授权。

## 7. 原1 / F14：只收口仍未实现的停止/回收/有界读取

重点：[准入](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-admission.ts>)、[runner](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-runner.ts>)、[提取](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/studio/extract-text/route.ts>)及 handler 的 file/asset/upload/预览。

1. 无 exit/当前实例终止/明确未启动等可信证据，QUARANTINED 和已启动 ACTIVE 不能仅凭 TTL/grace/createdAt 腾槽；时间只触发核验/诊断。绑定 lease/claim/实例，旧执行者不能释放新占用。
2. late-exit 与 quarantine 先后竞态都只归还一次，失败可恢复；不要无原因永久卡槽或定时清零掩盖。
3. ACTIVE sweep 的两类计数 updateMany.count 必须命中，任一未命中/抛错整笔回滚，不能提交 EXPIRED 后残留权重。复用已修持久化权重 release。
4. 按原合同限制读取前 File.size 预检和真实有界读取/有限等待/取消，不先无限 arrayBuffer 后看上限，Content-Length 不能唯一信任。
5. 保留 OCR 有限终止、启动前租约核对、根预算、迟到创建清理、doc/ppt/xlsx/预览协议和 F13 存储清理，别重写已好的格式逻辑。

验收：cap=1 未停止推进过 100 秒仍不能第二个；可信退出后幂等归还；两个回收者/回调顺序/count=0/抛错/多周期守恒；慢读取/实际超限/取消有限返回且不先写成功文档。受控线程与假材料，无真实 OCR 下载。

本轮正式组合有一次 DOCX 预览 504，单独文件 25 项通过；保留首次结果和环境记录，不将其写成一次全绿。最终应在受控条件执行必要组合，解释时间敏感性；不能简单加大业务 deadline 或删断言掩盖。

## 8. 原6/7/8：真正生产预算、来源与执行，不再只交纯契约

重点：[成本预约](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/cost-reservation.ts>)、[执行编排](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/execution-orchestration.ts>)、[credit](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/credit-service.ts>)、[可退依据](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/refund-basis.ts>)、估价/Studio/Open 与现有 hold/recovery。

1. 成本预约写生产共享原子 backend 并接真实入口。Memory 仅测试；服务端报价绑定用户/空间/付款账户、合同/部署/价格版本、材料摘要、范围/上限、有效期/幂等。同键异用户/空间/材料等拒绝，不返回他人旧预约、不用字符串长度伪造快照。
2. 预算覆盖原批准范围的在途、UNKNOWN 和已消耗；settle 释放在途不清历史成本。跨实例/账号/企业/模型、管理员/-1/赠送不得绕支出保护；缺成本不当 0，未批准新费用保持 not-ready，不编预算也不一刀切关掉批准旧业务。
3. reserve/落行、状态/计数/hold 原子或可恢复；部分失败/响应丢失不泄漏、不负数、不双释放，不钳 0 平账。每实际费用入口说明预算来源与费用前拒绝：Studio/Open、多步/质量重试、润色、模型/供应商/BYO 测试都覆盖。
4. 真正持久 task/attempt，外部调用前落意图，区分未发起、确定失败、已发送未知、供应商成功本地提交失败、有效成果。不能把资金 consume 返回值当供应商事实；通用 catch 不把未知当确定失败退完再调用。
5. 同键重复返回原任务不再打模型；多步/重试累计 usage/cost，客户端关页不等于供应商没执行。恢复依据保存事实完成本地状态/成果/费用，不重发模型猜结果；无有效记录/状态 count=0 不可 RECOVERED。
6. 来源退款/释放/预览接真实 ledger/grant/wallet/workspace/member/hold，绑定原消费/账户/空间/期限；不只按数组桶名求和。已扣/净耗/已退/释放/保留守恒，赠送不变现金、企业资产不转个人，未知来源列差异不造兜底付费来源。
7. quota 双关联只读核查，冲突不自动重绑/补权益；注册/空间重建不重复领取同一原资格，不新增赠送政策。保留 FREE 只读及成熟账务原语，不造第二套钱包。

验收：真实入口同键异参、两实例并发预算、UNKNOWN 保留/恢复、结算不清已耗；模型响应丢失/成功后保存失败不二次调用；逐来源双退/双释放/提交故障守恒；历史查询下载模型=0；quota 冲突不修钱。生产 DB/模型全部用替身，不声称真实锁/供应商验收。

## 9. 原10：接通实际页面的首次价值与复用

重点：首页 Hero、登录/注册、workspace-hub、Studio/ConfirmRunModal、任务/结果/资产与账务历史的现有页面。

1. 首页明确目标用户、问题、成果和主行动，能力来自当前真实发布/合同/服务；无证据的 60+ 上线/提效300% 等去掉或改真实表达，示例永久标注，不伪造客户/提升率/进度。
2. 真实场景与路由存在且可用；登录/注册保留安全工作意图，所有最终 redirect 来源校验外站/协议相对/反斜杠/危险协议/编码绕过，回落现有安全站内路径。
3. 任务前真实空间/资料接收者/付款方、材料/成果范围、固定/估算/免费性质、上限/有效期清楚；未上传不称已保存，内容/模型/付款方变更重新确认，不静默收费。
4. 状态来自持久 task/attempt，UNKNOWN 解释下一步，不能假进度/空结果成功或一键盲重试。成果有内容/来源/版本/需复核处和真实费用/退点，历史查看下载不重调模型；确需新执行先重新授权，企业材料不跨空间复用。
5. 无权限/余额/预算/套餐/供应商/解析能力显示真实原因与可行动作，保留安全历史查询。模块未接是 FAILED，不能全部归浏览器环境门。

验收实际页面串联：访客→场景→安全登录/注册→正确空间→预检/报价→任务→成果费用→刷新历史→下载/再次工作，包含余额不足/未知/撤权/到期/示例。隔离 API/假文件/零真实费用；不能安全启动浏览器如实报阻碍，但源码接线仍必须完成，不声称用户留存/付费意愿已验证。

## 10. 原11/12：真实运营恢复与真实经营口径

重点：[运营](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/operations/ops-readiness.ts>)、[指标](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/metrics/value-cost-metrics.ts>)及现有管理员/空间/用户只读入口。

1. 收款未履约、UNKNOWN task、退款/预算恢复失败、停止未知、结构/worker/配置未就绪接实际后台；真实业务 ID/原因/事实/责任/下一动作。健康/列表/导出零 DDL/资金/模型。
2. 专用批准动作权限在服务端，不信任请求的 permissions/confirmed；null scope 无跨租户授权时拒绝/空，不能全平台通配。
3. 恢复凭持久可信事实，不凭管理员选 SUCCESS/FAILED 或确认框造证据；unknown 不盲退重发，不绕 F07/F16。CAS/幂等、结果审计与业务一致，无记录/非法状态不假 RECOVERED，失败再中断仍可恢复。
4. 指标接实际 task/attempt/成果/ledger/收款/成本，最小事件字段，不正文/key、不新收费分析平台。真实事件时间、租户/窗口/时区与 ID 去重；刷新、attempt、重试、模拟/内部测试不伪造价值或收入。
5. 分开收款、已消费服务、未消费预付款、退点、现金退款、赠送/推广、供应商/支付/存储/支持与固定支出。禁止 consumedService=realCollected；也不盲用收款减即时余额造会计收入。缺批准口径/来源返回 UNKNOWN，不填0。
6. 完整利润判断覆盖未知固定/供应商等必要成本、收入/来源差异、缺项；已知部分可求和但不称完整利润。满意需明确事实，下载不当认可，不编DAU/LTV/转化。目标贡献率/风险准备未批只离线敏感性，不写回价格/预算。

验收：读权限/无scope零危险动作/跨租户；未知仅填成功不能恢复；同恢复键不双发；充值100且未消费90不全算已消费；未知固定成本不判完整利润；窗口外/重复ID/attempt不重计；查询业务写=0。备份/迁移/人工演练未做如实报告。

## 11. 原13：模型/迁移/契约唯一集成

1. 先收齐上述实现的实际接口/数据/测试，唯一 schema/migration 集成人增量合并，优先复用现有 task/config/ledger/hold/recovery，不每概念建表。
2. 新增 VerificationBudget 创建前提和请求 DDL 迁出保留；核 schema、生成 delegate/字段/类型/事务 client 与全部调用方一致。当前本地生成客户端若仍旧，受控离线生成或列具体环境门，禁止加载真实环境/网络后偷偷 generate。
3. 上一提交已存在的同名 migration 被本轮改写，需明确已执行/未执行/旧checksum/已有部分结构状态的兼容与回滚；不能宣称一份新文件覆盖所有历史。真实库未知不猜、不真实apply，不自动补钱/迁租户/删资料。
4. 业务请求扫描维持零CREATE/ALTER，不因写失败重新引入自愈DDL；缺表/列在危险效果前稳定not-ready，已有只读探针保持。
5. 核实际链：页面/报价→生产预算/资金→task/attempt→供应商事实→成果费用→恢复→指标；支付→事实→唯一认领→一次权益→查询；撤权覆盖UI/Open/Key/资料。交入口/函数/持久事实，import存在不是接好。
6. 最终全部执行者停写，定格真实HEAD和逐文件SHA，测试前后无漂移。实现前置未齐写FAILED/依赖未满足，不再标商业DECISION_BLOCKED。

## 12. 原3 / F16 与已关闭子项只保护，不扩功能

旧直充继续退役，人工CONFIRM_PAID无批准可信事实继续暂停；F07 APPROVE继续暂停、合法REJECT/查询保留。禁止通过本次恢复绕开或新建线下收款/现金退款产品。原已验收资金/席位/到期/存储、U08、认证和金额等具体修复的正向回归不得倒退。

## 13. 原14：一次提交可审核的当前版本证据

### 必须覆盖的结果矩阵

| 原归属 | 当前正确验收目标 |
| --- | --- |
| 5 | 一笔交易跨两席位订单最多一次权益；REAL缺交易号拒绝 |
| 5/11 | 并发晚收款全保留；SUCCESS第二交易留差异；ACK前事实可靠 |
| 2/4 | A重复failed不能退B；锁服务故障/已锁/过期不能敏感消费 |
| 2 | 密码/绑定/注册/会话写失败，消费和业务一致可恢复 |
| 2 | 精确收件人、缺确认unknown、未发起与unknown预算正确 |
| 9 | 完整会话拒绝不被身份头绕过；撤权/企业私有数据一致 |
| 11 | 调价API与持久审计同为7/3；同事务失败不部分提交 |
| 8 | query/实际目标变更不拿旧key，正常目的地仍可用 |
| 1 | 无停止证明不腾槽，回收count未命中回滚，有界读取 |
| 6/7/8 | 生产后端/真实入口；同键异参、并发预算、unknown、原路退款守恒 |
| 10/11/12 | 页面能走通，恢复真实授权/事实，预付款不当利润、窗口去重未知正确 |
| 13/14 | schema/client/离线历史兼容、无请求DDL、完整SHA/原始输出、旧证据保留 |

本目录 DEFECT 通过是缺陷复现，不是通过验收。将正确结果写入正式测试，保留旧审核。敏感拒绝同时断言实际最终存储/资金/网络调用，不能只看HTTP。并发/事务替身忠实于唯一、条件count、版本、惰性执行和回滚；席位必须实际运行席位服务，不mock成永远FULFILLED。

### 精确检查

1. 当前联合正式目标见[41文件清单](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/test-targets.json>)，原18文件基线仍需保护；加本轮正式反例。运行前确认新测试IO隔离，禁止无过滤全仓测试。
2. 两份node:test用匹配runner和有限timeout，worker语法及本地真实停止验证保留，无OCR下载。严格 `tsc --noEmit --incremental false -p tsconfig.json`，不加排除/放松模式/any掩字段。
3. 最终必要组合尽量在受控资源条件执行；记录首次失败及复跑，不只保留最后绿结果。变更后仅补受影响与必要组合，没新证据需求不反复无谓全跑。
4. 页面实际角色/操作、成功/拒绝/空态/失败/unknown、费用和历史复用有证据；不能安全启动浏览器交具体阻碍和替代证据。源码未接不得伪装环境门。
5. 真MySQL锁/迁移、支付验签互通、真实供应商成本与人工认可仍独立授权/环境门，不拿mock当生产验收；不承诺代码修一次就保证盈利。

### 必须交回

沿用目录：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/`。开发交付可更新当前报告，但保留此前版本历史；独立审核目录不可覆盖。

- `final-report.md`：原1–14/U01–U12和当前子问题逐一，用户结果、实际API/权限/数据/费用/恢复；保留与新完成分开。
- `scope-acceptance-map.md`：编号→实际入口/函数/页面/测试与状态，候选未选列OPTIONAL_NOT_SELECTED；不新造U13/U14产品需求。
- `final-manifest.json`：准确最终HEAD、基线、起止时间、所有改动/保护源码SHA、schema/migration、交接与测试前后无漂移。只有文件名和“基线+改动”不合格。
- `final-tests.json`及原始输出：可直接复跑的精确命令/配置/文件/时间/退出码/通过失败取消、替身边界、覆盖断言；临时配置删掉就不能当可复跑证据，不把残留DEFECT当修复通过。
- `production-wiring-map.md`：每费用/敏感实际入口→生产共享服务→持久事实→拒绝/恢复→页面，Memory/Fake只列测试。
- `user-journey-evidence.md`：真实路由/角色/材料/操作/看到的状态与费用，未做浏览器/人工如实说明。
- `schema-migration-and-recovery.md`：完整前置、历史checksum/已部署兼容、delegate/唯一/索引、回滚/历史差异、真实迁移未执行声明。
- `decisions-and-release-gates.md`：真正政策/环境项、影响动作、当前阻断与解除负责人/证据；没有批准记录不自编。
- `handoff.json`：`DELIVERED_PENDING_INDEPENDENT_REVIEW`，最终版本、执行者停写、所有未完/失败/决策/环境门。

状态用具体子项 PRESERVED_VERIFIED / IMPLEMENTED_OFFLINE_VERIFIED / FAILED / DECISION_BLOCKED / ENVIRONMENT_UNVERIFIED。没有工程接线就FAILED；代码完成但未真实环境验证单列环境门。不要整个大项“完成”掩盖剩余分支。

完成原工程剩余项后停止，不继续新产品/新批次；若仍失败直接列原编号、原因和证据，不宣称全部完成。由用户把最终报告和manifest完整路径交独立审核者，开发者不自签独立验收、真实交易或生产可用。
