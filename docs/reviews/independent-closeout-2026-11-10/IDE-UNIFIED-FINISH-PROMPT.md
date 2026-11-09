# 交给 IDE 的统一完成指令：原 1–14 剩余范围，2026-11-10

## 0. 本次范围与固定终点

工作仓库：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web`。

审核对象是基于 `6d9f68b403798a8243f11eeb36a587916c4deb13` 的**未提交工作区版本**。先读取本目录 source-manifest.json、verification-summary.json 核对逐文件 SHA，不能因 HEAD 相同就复用旧结论，也不能覆盖其他人的未提交工作。

依据：

- [开发总纲](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/PROJECT-DEVELOPMENT-CHARTER.md>)；
- [原 SCOPE-MAP](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/SCOPE-MAP.md>)、[原完整指令](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/ALL-INSTRUCTIONS.md>)和既有决策门；
- [上轮统一剩余指令](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/unified-closeout-review-2026-11-09/IDE-REMAINING-CLOSEOUT-PROMPT.md>)；
- [本轮审核](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/independent-closeout-2026-11-10/REVIEW.md>)及本目录反例。

这是原工程的收口，**不新增第15批/产品功能**。当前报告承认的大模块未实现仍在本任务内；不能以“跨模块工程量超出本轮”主动将用户要求缩成局部补丁。内部可按依赖分工，一次交回原已授权范围的完整生产代码、页面、数据方案和证据；确需负责人决定的具体政策仅阻断相应动作，继续其他工程工作。

目标：用户真实完成首次工作并能安全查看/复用历史，明确资料归属/付款方/费用；企业撤权一致且历史保留；管理员按可信事实安全对账/恢复；平台每个费用入口有授权、预算、执行事实和失败恢复，经营数据不伪报利润。

强制保护：

1. 不真实连接/写业务库、不迁移/seed、不创建真实管理员、不真实模型/SMTP/短信/支付/云桶、不部署，不读/打印真实 .env、密钥、验证码或客户正文。生产实现必须完整，验证替换外部 IO；不是只交 Memory/Fake。
2. 不自定真实价格/现金预算/赠送/商业退款/保留期/企业转个人，不开生产 Token 结算/BYOK 新收费。缺策略具体列门，未接线/缺 SQL/命名错/状态机缺口均是 FAILED，不是决策门。
3. 保留 F01–F13、固定点数兼容/既有单次成本门、F16 直充退役/人工收款暂停、F07 `MANUAL_REFUND_APPROVAL_PAUSED`、真实余额/历史数据。
4. 保留本轮已正确的具体子项：席位正常交易认领、终态持久事实、邮件精确确认、认证快速通道移除、调价真实计数、BYO query、无证据不腾槽等；不推倒重写、不回退安全门。
5. 历史文档恢复/history 已有进展，继续保护。独立审核目录和原始结果不覆盖；正确结果断言写正式测试或新复验目录。禁止删除问题/弱化类型/删测试换绿。

沿用原分工：A 原1/3/5/7/9/11/13，B 原2/4/6/8/10/12/14。共享 schema/migration 最终由 A13 单写；handler 解析与执行按块串行交接或隔离分支逐块集成；auth/security 公共帮助和 OTP 路由先对齐契约，不并发覆盖。交接包含当前源码 SHA、实际入口/数据契约/测试/未完项；依赖未齐如实列工程未完，不造新批次。

## 1. 原2/4：改密状态机必须真能运行、真可恢复且只提交一次

重点：[重置路由](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/reset-password/route.ts>)、[Entity](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/prisma/schema.prisma>)、验证码生产 backend 与实际敏感调用。

1. `PasswordResetClaim` 对应 `passwordResetClaim`，修路由及所有 tx 委托。正式 mock 不能继续提供错拼 `passwordresetclaim` 掩盖生产错误；使用与生成客户端一致的类型/字段，any 不得隐藏错位。缺表与错命名分开诊断。
2. 修“码消费成功、AUTH_CONSUMED 持久化失败”的窗口。授权消费与认领推进需同正确事务或有可验证的持久操作事实；不能新加一个状态写后仍在前面留下不可恢复消费。
3. AUTH_CONSUMED 重试必须原子取得唯一业务提交权。在事务内重读/锁定/条件版本裁决，不能两个请求事务外都读旧状态后各写一次用户。失败恢复、成功但响应丢失、并发重试均只产生一次合法密码写。
4. 绑定 user/challenge/jti/用途/有效期与操作参数或结果语义；同 token 换新密码不能被不加判断的恢复重试重做。不得明文保存密码、token 或验证码；使用合适的服务端操作身份/安全摘要或既有授权记录，不另造认证平台。
5. 保留旧 token 不能消费新 challenge、短信并发最多一消费权、锁/过期/故障拒绝。注册/绑定/会话持久化也核对消费与敏感业务提交的同类边界，别只修重置单端点。
6. 去掉生产服务中的“没有事务就顺序执行、等价由 mock 保证”式安全降级；测试通过注入忠实事务 IO 来跑生产协调逻辑，生产缺必要能力 fail-closed。

验收必须用真实路由与生产状态协调逻辑、快照式查询结果：

- 只提供正确 camelCase delegate，合法请求能进入业务；缺表/字段/委托在危险效果前未就绪拒绝。
- 单次密码写失败后可恢复；消费后推进失败也可恢复，不能500后永远400。
- 两个 AUTH_CONSUMED 请求并发最多一次业务提交；同键同参重放不重写，异参有明确拒绝/已完成结果。
- 提交前/提交后丢响应、状态更新失败、锁/过期/撤销、旧 challenge、新码及其他敏感消费者均有反例，存储/会话效果与响应一致。

本轮审核中两个恢复问题是**测试加入临时同义别名后**观察到的潜在逻辑；修完命名后必须一起修，不能等下轮才暴露。别照抄旧 wrong-case mock 当正确结果。

## 2. 原2/4：发送预约、各维度预算和结果回填同一事实

重点：[verification-backend](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-backend.ts>)、[高层操作](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-codes.ts>)、[发信路由](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/send-email-code/route.ts>)及新发送认领。

1. 不先不可逆写 REFUNDED 再独立减预算。claim 状态与对应窗口/count 要原子或有明确待恢复意图；任何计数更新失败后重放能完成，不永久显示已退但实际未退。
2. 移除/拒绝无 sendId 的无绑定退额路径；兼容旧调用不能绕过身份。缺身份不动任何人的预算，给稳定诊断/恢复入口；所有真实调用传同一次预约身份。
3. accepted 正常结果也要回填，持久事实正确变为已接受/终态；unknown 保留可核实状态，failed 幂等退回。不能实际发送成功且200、认领永远PENDING，影响恢复和清理。
4. 各维度预约与 claim 创建中途失败要整体回滚或有可靠补偿状态；部分 claim 不能保留成一组有效发送，旧窗口/版本回填不污染新窗口。
5. 保留已修首笔唯一、间隔/日限/失败锁/消费锁/异常fail-closed、精确收件确认、确定未发起与unknown分类。账号 actor 的生产策略真正落实；若原批准阈值不存在，明确缺哪项策略/影响入口，不编现金预算或默认数值解锁。
6. IP取值的可信性需要实际代理入口/头清理策略证据，不能仅靠最后一跳注释自证。来源不可确认时采用原批准安全处理，不接受 body/任意客户端身份。
7. 新认领有索引、可解释差异与有界保留/清理方案，不能永久累积PENDING，也不能清除未核实事实。技术清理不擅自修改账务/资料保留政策。

验收：A/B发送+重复A失败不动B；无ID不退任何预算；转状态成功后计数失败、计数后状态失败、部分维度失败、跨窗口迟到、并发回填和进程中断都守恒可恢复；accepted真实终态、unknown不盲退、未配置不伪发送；测试真实发送=0。

## 3. 原5：差异事实也要服从统一交易所有权

重点：[fulfill](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/fulfill.ts>)、[receipt](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/payment/receipt.ts>)、通知、席位/企业/充值与运营恢复。

1. 同一渠道/商户语境/交易号在所有状态下只有一个可信所有权。不能 SUCCESS 第二笔用订单维度 receipt-diff 留存，却没占全局交易键，之后另一 PENDING 订单可继续认领/履约。
2. 将交易身份与处理状态分开：履约中、差异、待恢复、已完成等共享同一身份裁决；不能换技术记录前缀绕过。首次归属、跨订单冲突与后来恢复都有持久审计，不任意改归属或自动现金退款。
3. 保留本轮正常席位跨订单认领、REAL必填、严格金额/渠道/币种/商户/应用核验、终态并发事实独立落库、同笔重放不双发、旧席位资格/期限事务。
4. 收款认领、权益、订单状态、恢复事实的提交失败/响应丢失一致，不能无条件覆盖并发终态；外部网络不放长事务。技术认领复用账单表时，用户订单/对账/退款/统计不能当第二笔真实收入。

验收：A SUCCESS 原T1，登记T2差异，再B尝试用T2，必须拒绝或合法归同一事实，不能发B权益；相反到达顺序、并发、取消/过期、未知/恢复、同单重放、跨渠道商户语境、三类权益与部分提交都覆盖。测试只替换签名输入/数据库，不把 mocked verify=true 当真实渠道验签或匿名攻击证明。

## 4. 原1/F14：退出证据和有限读取生命周期真正闭合

重点：[parse-admission](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-admission.ts>)、[runner](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/parse-runner.ts>)、[extract-text](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/studio/extract-text/route.ts>)、Studio file/asset/upload/预览。

1. 保留无证据不腾槽、ACTIVE过期只诊断隔离。可信 exit 事实先可靠记录，再尝试归还；归还失败后即使当前已QUARANTINED也必须能保存同一lease/claim/实例的停止证明。
2. quarantine helper只匹配ACTIVE导致Q状态不能写EXIT_CONFIRMED，必须修；不能用随便清零或仅看时间替代证明。不要让未知note覆盖已确认事实。
3. 处理 exit 在 quarantine 之前、过程中、之后到达的顺序；本地布尔标志还未置true时不能漏事件。回调只执行一次也要最终正确，失败可重试，旧claim不能释放新占用。各入口同源，不只补独立提取。
4. 计数更新count必须真实命中、使用持久化权重，失败回滚或保留差异，证据与恢复一致；不能日志说已退出、DB永远无证明。
5. File.size预检保留，但还要HTTP/代理请求体上界、实际有界字节、有限等待/取消。不能完整formData/arrayBuffer无限等待后才检查；读取取消/租约失效不能以后再启动worker，未启动与停止未知的资源分别按事实恢复。
6. 返回有限时间不等于后台物理工作结束；仍在进行的读取/解析占用不能盲释。按原合同各入口限制，不统一改套餐，不重写已好的OCR/Office/xlsx/预览/对象清理。

验收：已Q、exit确认、release失败，证据仍持久且以后恢复；exit先于Q标志/在写Q中/之后三顺序；并发回收/旧token/count=0/故障；读取悬挂+取消有限响应且后台受控，恢复后不启动过期worker；正常格式和真实线程终止保持。

正式超时测试需要修夹具：目前60ms预算、15ms工作延迟却期待超时，依赖额外启动耗时。用明确跨预算的工作延迟/握手控制证明真超时，保留真实terminate/退出/迟到丢弃断言。不能加大业务deadline或删除断言换绿。保留本轮791/792首次结果和32项单独复跑，不伪报一次全绿。

## 5. 原10：安全回跳与实际首次价值页面

重点：[登录页](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/auth/login/page.tsx>)、注册/首页/空间/Studio/确认/任务/成果/历史。

1. 回跳拒绝控制字符（含解码后tab、CR/LF等），对标准URL规范化后的最终目标校验同源/允许站内路径；不能只补字符串黑名单。`/%09/outside.example`不得被解释成外站。基址取可信当前站点，不能信任客户端Host/任意请求参数决定白名单。
2. 所有最终location/router消费点同源校验，登录/注册跨页和sessionStorage意图保留统一；正常站内query不因随意冒号/编码规则误伤。普通外站、协议相对、反斜杠、控制字符/编码及同源正常路径都测试。
3. 完成仍未交的页面接线：首页明确给谁/解决什么/产出与主行动，能力来自真实发布合同；无证据60+/300%去掉或改真实，示例永久标注，不伪造客户/进度。
4. 真实场景/路由、正确空间/资料接收者/付款方、材料/成果范围、固定/估算/免费性质、上限/有效期清楚。未上传不称已保存，参数/付款方变化重新确认，不静默新费用。
5. 任务状态取持久task/attempt，UNKNOWN解释下一步不盲重试；成果版本/来源/需复核处和费用真实，历史查看下载不重打模型，继续新工作先授权，企业材料不跨空间复用。
6. 无权限/余额/预算/套餐/供应商/解析能力提示真实原因和可行动作，保留安全历史。页面没接就是FAILED，不能归浏览器环境门。

验收：访客→场景→安全登录/注册→空间→预检/报价→任务→成果费用→刷新历史→下载/复用，含余额不足/未知/撤权/到期/示例。隔离API/假文件零真实费用；浏览器不能安全启动交具体阻碍，但源码接线仍必须完成。

## 6. 原6/7/8/9/11/12：必须完成的原生产接线，不再只交纯函数

### 6.1 报价、成本与执行（原6/8）

重点：[cost-reservation](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/cost-reservation.ts>)、[execution-orchestration](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/execution-orchestration.ts>)、估价、Studio/Open、模型测试/润色/多步重试/BYO等实际费用入口。

1. 写生产共享原子backend并接真实入口，Memory只测试；服务端报价绑定用户/空间/付款账户、合同/部署/价格版本、材料摘要、执行范围/授权上限/有效期/幂等。客户端不能指定vendor/key/费率/模型；同键异用户/空间/输入等拒绝，不能复用他人预约或用字符串长度伪造快照。
2. 原批准预算覆盖在途/UNKNOWN/已消耗，settle释放在途不清历史成本；跨实例/账号/空间/模型、管理员/-1/赠送不能绕支出保护。缺成本不当0，未批准新费用维持not-ready，不编预算也不一刀切关闭批准旧业务。
3. reserve/落行/状态/计数/hold原子或可靠恢复，部分失败不泄漏/负数/双释放，不钳0平账。所有实际费用入口交预算来源/费用前拒绝/attempt/未知/恢复对应表。
4. 真正持久task/attempt，外部调用前落意图。区分未发起、确定失败、已发送未知、供应商成功本地失败、有效成果；资金consume不当供应商结果，通用catch不把未知退完再调用。网络不放DB长事务，正确传tx。
5. 同键重复返回原任务不双扣/再调模型，多步/重试累计usage/cost；关页不意味着供应商没执行。恢复只根据保存事实做本地收尾；无有效记录/状态迁移未命中不返回RECOVERED，成功后保存/结算失败不再打一次模型。

### 6.2 来源与企业（原7/9）

1. [来源依据](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/billing/refund-basis.ts>)和配额守卫接真实ledger/grant/wallet/workspace/member/hold/recovery，绑定原消费/账户/空间/期限；不只对任意数组按桶求和。双退/双释放不造额度，未知来源列差异，不造兜底付费来源。
2. 保留FREE只读与成熟资金原语，不另造钱包；赠送不变现金、企业资产不转个人、可退点不等于可退现金，F07/F16继续暂停。
3. quota冲突只读核查不自动重绑/补余额；删除重建不重复领同一原资格，不新增赠送政策。
4. 企业成员/岗位/分享/Key撤销后UI/Studio/Open/资料/知识/下载与必要缓存一致拒绝；企业历史成果/账务保留，个人资产不误删。平台helper/部分空间入口改善不等于全矩阵完成。
5. 标准岗位公共目录不夹全平台workspaceId/name/成员/usages/submissions；空间只看本空间，平台统计用真实专用权限。到期按批准规则限制新增/只读，不清付费余额/删超额历史，不自编保留/导出/OWNER转移政策。

### 6.3 运营与指标（原11/12）

1. [运营恢复](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/operations/ops-readiness.ts>)接实际管理员API/页面：收款未履约、UNKNOWN任务、退点/预约失败、停止未知、结构/worker未就绪有真实业务ID/原因/事实/责任/下一动作。
2. 只读健康/列表/导出零DDL/资金/模型，null scope无跨租户授权拒绝或空。恢复按真实专用权限、必要再验证和持久可信事实，管理员选择SUCCESS/FAILED或confirmed=true不是证据，不盲退重发、不绕暂停。
3. 恢复CAS/幂等、结果审计一致，无记录/非法状态不假成功；失败再中断仍可继续。保留已修调价计数/回滚，必要并发旧→新记录与实际写对应。
4. [指标](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/metrics/value-cost-metrics.ts>)接真实task/attempt/成果/ledger/收款/成本API，最小事件ID/版本/原因，不正文/密钥，不新付费分析平台。真实事件时间/窗口/时区/租户一致、稳定ID去重，刷新/attempt/内部测试/模拟不伪价值或收入。
5. 收款、消费、未消费预付款、退点/现金退款、赠送/推广、供应商/支付/存储/支持与固定支出分栏。禁止consumedService=realCollected，也不盲用收款减即时余额造会计收入；口径/来源不足UNKNOWN。
6. 完整利润标志覆盖未知固定/供应商等必要成本、收入/来源差异与缺项。无记录不当0；满意需明确事实，不下载即满意，不编DAU/LTV/转化。贡献率/风险准备未批只离线敏感性，不写回价格/预算。

这些4个原模块反例（同键异参、预付当消费、固定成本未知却判完整、null scope越租户）必须在接线前一起改。生产服务/API缺失不能用图、import、测试数组或临时mock接口替代。

## 7. 原13：两个新模型、生产命名与离线迁移必须齐全

1. 为 VerificationSendClaim、PasswordResetClaim 交真实离线migration文件，核对表/字段/default/索引/唯一/时间/状态/回滚；当前只有Entity不是“已完成只待apply”。保留旧schema/历史字段，增量集成，不强制每概念一张表。
2. 核所有生产delegate与tx委托、类型/客户端/真实路径一致，纠正passwordResetClaim拼写。隔离目录/假配置、离线依赖齐全时可验证generate/validate；不能安全隔离则列具体环境门，不加载真实.env/下载/连接业务库。
3. 旧migration checksum/已执行/未执行/已有部分结构分别列兼容方案，不修改可能已部署历史后宣称所有环境可直接重跑。本次不真实apply/seed/回填，不自动补钱/扣回/迁租户/删资料。
4. 维持请求零CREATE/ALTER和稳定not-ready，不能为缺表重新引入热自愈DDL。新认领的状态、恢复、清理、对账语义与实际消费一致。
5. 收齐实际契约后由唯一集成人核全链：页面报价→生产预算资金→task/attempt→供应商事实→成果费用→恢复→指标；支付→唯一事实→一次权益→查询；撤权覆盖所有入口。缺接线是FAILED，不是环境/政策门。
6. 定格未提交候选时用baseline HEAD+全部文件哈希/工作区指纹；若提交则准确最终commit。测试前后保护源码无漂移，执行者停写后交独立审核。

## 8. 原14：正确结果矩阵和一次性交回

当前反例是缺陷确认，不能照抄错误结果为验收。正确断言放正式测试，旧审核保持不变：

| 原项 | 本次必须有的正确结果 |
| --- | --- |
| 2/13 | 仅正确camelCase生产delegate也能完成改密，不靠错拼mock |
| 2 | 消费后推进失败可恢复；AUTH_CONSUMED并发只有一次合法敏感提交 |
| 2/4 | 状态/计数失败一致可恢复，无sendId零退额，accepted不残留PENDING |
| 5 | SUCCESS差异交易不能被另一订单履约；全状态/三类权益共享身份 |
| 1 | 已Q也能持久化退出证据，回调三种顺序不丢；归还失败后可恢复 |
| 1 | 读取悬挂/取消有限收口、后台受控；真正跨deadline的线程超时测试 |
| 10 | tab/CR/LF等规范化回跳仍同源，正常站内意图可用 |
| 6/7/8 | 生产后端/实际费用入口、异参幂等、预算/UNKNOWN/原路来源守恒 |
| 9/11/12 | 撤权/租户/恢复真实权限事实，页面与指标真实接线且口径正确 |
| 13/14 | 完整离线SQL、正确客户端/契约、同版本SHA及原始可复跑结果 |

测试要求：

1. 保留原18文件基线，当前41文件清单见[本轮目标](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/independent-closeout-2026-11-10/test-targets.json>)，加新增正式反例。先检查所有外部IO隔离，禁止无过滤全仓测试。
2. 使用快照式查询返回，忠实唯一/条件count/版本/惰性执行/回滚；不要活对象引用随状态更新自动变新来掩盖旧读竞态，不跳过生产事务协调逻辑。故障点覆盖每个提交边界，不只最后一步。
3. 严格 `tsc --noEmit --incremental false -p tsconfig.json`，不排除业务/正式测试、不放松模式/any掩字段。两份node:test用正确runner+有限timeout，worker语法/真实本地终止保留，无OCR下载。
4. 记录首次失败和复跑，变更后只补受影响及必要组合；正式超时夹具修成不依赖冷启动。必要构建/浏览器先隔离真实环境，否则具体环境门，不伪截图/点击。
5. 真MySQL/渠道验签互通/迁移/真实成本/人工认可无授权不执行，不能从mock推断。工程可验收不等于生产可用或收益保证。

交付仍在：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/`，保留history：

- final-report：原1–14/U01–U12及具体子项用户结果、实际API/数据/权限/费用/恢复，已保留与新完成分开。
- scope-acceptance-map：原编号→入口/函数/页面/测试/状态，不新造阶段；候选未选OPTIONAL_NOT_SELECTED。
- final-manifest：准确HEAD/未提交指纹、起止时间、所有改动/新增及保护文件SHA、schema/migration、交接、测试前后无漂移。
- final-tests及原始输出/可复跑配置：精确命令/文件/时间/退出码/通过失败取消、mock范围、每声明对应具体断言，不把缺陷复现计为修复通过。
- production-wiring-map：每真实费用/敏感入口→生产共享服务→持久事实→拒绝/恢复→页面；Memory/Fake只列测试。
- user-journey-evidence：实际路由/角色/操作/看到的状态、费用/归属/历史复用，未做浏览器/人工如实说明。
- schema-migration-and-recovery：新表SQL、旧checksum兼容、delegate/索引/唯一、回滚/差异/清理，真实迁移未执行声明。
- decisions-and-release-gates：只列真正具体政策/环境项、影响动作/当前阻断/解除负责人证据，不以工程量代替未完成解释。
- handoff：DELIVERED_PENDING_INDEPENDENT_REVIEW、最终版本、所有执行者停写、全部FAILED/决策/环境门。

状态按具体子项用 PRESERVED_VERIFIED / IMPLEMENTED_OFFLINE_VERIFIED / FAILED / DECISION_BLOCKED / ENVIRONMENT_UNVERIFIED；大项只实现一部分不得整体写完成。未接线FAILED，源码完成但未实际环境验证另列环境门。

原工程全部落实并交齐证据后停止，不继续新组件/营销/微服务或新批次。确实未完直接列原编号和证据；不能只交几个局部补丁再让用户误以为全部完成，不能自签独立验收、真实交易或平台一定盈利。
