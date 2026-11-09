# 原方案统一返工复核：6724345

日期：2026-11-09。仓库：`D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web`。

当前提交：`67243457064f645a3a4af1a2e8b4b1d012a85d2d`；对照上一轮审核提交 `5162e5b12b105c71ca71fb628854d32f7201f371`。

**结论：本轮仍不通过整体验收。不是原方案又增加了内容，而是本次只实现了其中一部分，而且部分“已完成”项还有可重复确认的缺口。** IDE 自己的 final-report/handoff 也明确写明支付、鉴权、解析、真实接线、经营指标和请求 DDL 等仍未完成。不能把“交了 P14 文件”理解为原 1–14 项全部完成。

本助手仅新增本目录审核材料、隔离测试、输出和快照，未修改业务源码、价格、开关、数据库或历史审核记录。

## 1. 本次证据

| 检查 | 结果 | 限制 |
| --- | --- | --- |
| 原基线与第 1–12 项相关精确正式测试 | 32 文件，732/732 通过 | 只证明实际断言，不等于报告中声称的全部场景 |
| 严格 TypeScript | `tsc --noEmit --incremental false -p tsconfig.json` 退出 0 | any/替身仍可能掩盖运行时语义 |
| 两份解析 node:test | 18/18 通过，0 取消 | 隔离文件/OCR 替身，无真实语言包下载 |
| 独立复验 | 11 文件，57/57：32 项正常回归、25 项缺陷确认 | 缺陷确认“通过”表示漏洞被复现，不能计为修复通过 |
| 版本核对 | 本次相对上一轮 19 个源码/测试/schema/migration 文件新增或变化 | 大量原待办源码确实未变化，不是拿旧结论猜当前状态 |
| 交付文件 | P14 的九份文件现在已存在 | 缺准确最终 SHA/文件哈希、原始输出，部分覆盖声明与实际测试不符 |

严格检查、正式测试与独立补测的原始结果在本目录。第一次新增 mailer 审核夹具的 beforeEach 误将 mock 函数返回为清理回调，导致清理时额外执行；仅修正审核夹具并完整重跑，最终为上述 57 项。未因此修改业务代码。

所有 Prisma、模型、SMTP、支付、网络、密钥解密等外部 IO 都使用隔离替身。重置凭证补测使用真实签名/验签算法和专用假 key；BYO 补测仅捕获假 key，不发送网络请求。初始化只使用假环境配置与内存事务模型。没有真实库迁移、真实管理员创建、客户数据、真实付费调用或部署。真实 MySQL 锁、渠道互通、浏览器和人工业务认可仍未验收。

## 2. 可以保留、无需重写的修复

| 具体修复 | 独立判断 |
| --- | --- |
| 现行 20,000 bps 不再自动变为 2,000 | 已核实，保留；不再要求重做 U08 的该缺陷 |
| FREE 额度读取不再写表/硬编码返回 100 | 正式定向回归及源码核对通过，保留 |
| reset-password 检查消费返回，普通连续重放被拒绝 | 已核实这个子场景；challenge 绑定仍未完成 |
| 正确使用 verificationBudget delegate；顺序重发间隔生效 | 已核实；首次并发、锁定核验等仍未完成 |
| SMTP 连接结果丢失归 unknown | 已核实；accepted 判断还有缺口 |
| health/debug-test01、test-db 增加平台守卫 | 未授权 health 读数据次数为 0 已核实；完整守卫弱兜底仍待修 |
| init-admin 无凭证拒绝、唯一认领与 Prisma 字段 | 受控事务委托下通过；现有安装页面仍无法完成流程 |
| BYO 不同 host 不再直接复用旧 key | 已核实；路径/协议规范化仍不安全 |
| 批量调价回报真实 7/3 行、默认配置只写一次 | 正常路径通过；审计和改价仍非同一事务 |
| 原 F16、F07 暂停及既有账务/存储/到期保护 | 相关原正式基线通过，继续保护 |

已经关闭的具体问题不再列为本轮必改；不要为了增加修改量重新设计这些部分。

## 3. “已完成”项内仍有的问题

### U02/U03 · P1：验证码生产算法仍有并发漏计、核验锁定和窗口错误

定位：[生产 backend](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-backend.ts:378>)、[高层操作](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/verification-codes.ts:93>)。

本次直接执行生产算法，仅替换数据库委托，确认：

1. **首次创建竞争漏计并绕过间隔。** 两个请求同时读到预算行不存在，均执行 `upsert(create,count=1,update={})` 后直接成功；第二个实际命中已有行也不重新裁决。隔离复现两次都被准入，但 platform 与 target 都只记录 1 次。现有并发测试特意预建行，恰好绕开此场景。
2. **失败锁定只限制发送，没有限制核验。** 失败 5 次后 lockedUntil 已在未来，但 lookup 不检查预算锁定，返回 failCount/lockedUntil=0；正确码仍 valid=true。现有测试只断言无法“再次发送”，没有验证核验端锁定。
3. **消费过期码仍成功。** lookup 会拒绝过期码，但 consume 的更新只有 target/purpose/used=false，没有 expiry/锁定/当前 challenge 条件；独立复现过期后核验失败、消费仍 ok=true。
4. **每日窗口重置没有重置 count。** 旧 count=10，窗口过期后虽然判断 currentCount=0，写入仍是 increment，变成 11；下一次即使经过 60 秒也 429。平台计数达到上限后的跨日情况同理。
5. **失败回退没有发送身份/幂等保护。** 同一结果回填两次，platform/target 都可减到 -1。无窗口/预约绑定的 decrement 也可能影响新窗口或别次请求。

源码另确认：高层签发仍不传可信 ip/actorId，actorId 在生产算法中未使用，报告声称的“平台/IP/账号技术边界已接好”不成立；issue 的旧码标 used 与新码 create 分离；SMS/email 持久行只用 phone/type，没有 channel/不可替换 challenge 身份；ready 仅检查 delegate 对象，不能作为表/列已就绪证据。

费用影响：共享次数少记可低估发送支出；并发和回退错误不能靠顺序单测证明安全。体验影响：日限可能跨日仍不能恢复，安全锁也未真正挡核验。均属于原第 2/4/13 项，不是新增防护产品。

### U02 · P1：旧 resetToken 可消费后来签发的新码，同一码并发登录可签发两个会话

定位：[resetToken 签发](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/verify-email-code/route.ts:46>)、[消费](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/reset-password/route.ts:83>)、[登录删除](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/login-sms/route.ts:378>)。

已修“忽略消费失败”值得保留，但凭证仍只绑定 email/phone 与 purpose，没有 challenge/version/jti 的一次性绑定。独立走真实签发路由、真实 JWT 签名/验签和实际高层消费流程确认：

1. 码 A 校验后签 token T，用 T 改密一次；
2. 61 秒后同账号重新签发码 B，**没有核验码 B**；
3. 再用已用过的 T，接口仍返回 200，第二次写密码并消费码 B。

因此旧 token 能在有效期内借新 challenge 恢复改密权。复现前提是持有旧的合法签名 token，不是无凭证任意改密。

短信登录仅把旧 delete 调用补了 await/login 用途，仍是先验证、最后执行返回 void 的 delete；删除没有“谁取得唯一消费权”的判断。独立实际路由补测确认：同一码两个并发请求都验证成功，最后都返回 200、写入两个会话。顺序重放拒绝不能证明并发一次性成立。短信当前未接供应商继续暂停，但代码闭环仍不能按已完成交付。

注册仍在创建用户/空间后删除码，也需要按原方案统一核对敏感业务与消费的原子/恢复边界。不要仅把 delete 改名 consume，或只在某一条 happy path 加判断。

### U09-6 · P1：批量调价与审计仍为两个事务

定位：[价格事务](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/model-pricing/global-markup/route.ts:71>)、[另一个审计事务](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/admin/model-pricing/global-markup/route.ts:82>)。

虽然注释和交付报告说“同事务”，实际第一笔已提交模型/时段/全局默认，第二笔才写审计。独立使用惰性 PrismaPromise 语义和事务回滚替身确认：审计失败返回 500，但三个价格值已从 2,000 改为 3,000，版本已递增。用户看到失败，不代表价格未改；再次点击还可能再递增版本。

正常路径计数已修，不再要求重做。剩余要求是实际一致性与审计/结果事实，而不是再增加一个 transaction 包装。

### U05-4 · P1/P2：初始化创建端加了授权，但安装向导没接，且用了另一套配置

定位：[安装向导](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/init/page.tsx:95>)、[旧令牌验证](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/verify-setup-token/route.ts:10>)、[新创建端](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/auth/init-admin/route.ts:25>)。

向导先用 SETUP_TOKEN 验证，只得到 success；创建请求仍只传 name/email/phone/password。新接口要求 `initToken === INIT_ADMIN_TOKEN`。独立用假配置和实际两条路由确认：第一步 200，向导当前创建 payload 第二步 403，即使两项服务器配置均存在也没有可用凭证传递。

安全门应保留，不能删鉴权修通流程。需要按原批准 setup 流程建立真正绑定创建动作的一次性授权，页面、接口、服务端认领一起闭环；不要通过新增另一份静态安装密钥绕开原产品流程。

### U06 · P1：不同 host 已拦旧 key，但把协议和路径大小写差异吞掉

定位：[normalizeEndpoint](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/workspace/byo-model/test/route.ts:8>)。

当前规范化对整个 URL 转小写且去掉 http/https：

- 保存 `https://original.example/Private/V1`，请求 `https://original.example/private/v1`，仍会复用旧 key；路径大小写可能对应不同服务或租户，不能当同一 endpoint。
- HTTPS 改为 HTTP 也会在此层选择旧 key。独立捕获确认旧假 key 进入下游 helper；**是否实际外发还取决于后续 URL 策略**，不能将此项说成默认配置下已发生明文外泄。即使下游默认拒绝 HTTP，本层凭据绑定仍不应丢协议。

不同 host 不再取旧 key 的正向修复保留。下一步按 URL 结构保留 scheme、路径、有效端口、必要查询及协议身份，核对保存/测试/redirect 的同一授权目的地，不扩大为无关网络系统重构。

### U03 · P2：SMTP unknown 已改，accepted 仍是“Promise resolve 就算接受”

定位：[mailer](<D:/Project Development/ZhiGe-Dockyard/zhige-dockyard-web/src/lib/mailer.ts:127>)。

实际代码忽略 sendMail 返回的 accepted/rejected 等接收事实。独立替身返回 `accepted=[] / rejected=[目标]` 时仍得到 `{ok:true,outcome:'accepted'}`，未做收件人确认。同时 SMTP 未配置被当 unknown，调用前又已签发码/占预算；应区分“确定没有发起”和“已发起结果未知”，不能一律保留或一律退还。

后者的具体发送阶段应通过当前传输契约与替身验证；本次未真实发信，也不据此声称已验证某个 SMTP 供应商行为。

### U12/原13 · P1：离线迁移仍不能从现有迁移链创建新预算表

本次 migration 只有三条 `ALTER TABLE VerificationBudget ADD COLUMN ...`。逐个检查仓库 migration SQL，没有找到 VerificationBudget 创建语句。上轮该 model 只有 schema，不能假设已部署成表。**空库按仓库迁移链部署会缺创建前置条件**；已有实例到底有没有表仍是环境未核实。

需要可审查的完整离线迁移/兼容顺序，明确已有表、未建表、已执行迁移等状态；不能真实 apply 或重写已部署历史。请求中的 Webhooks 建表、BYO 热 ALTER、settings 惰性扩列仍未改，不因新增三个列就算 U12 完成。

本地生成客户端的静态 DMMF 还只有 id/count/windowStart/version/updatedAt，尚不含 lastSentAt/failCount/lockedUntil。此次未连接数据库；这证明当前本地源码/schema/client 尚未一致，不能证明线上库状态。必须在受控离线条件下准备正确生成/部署步骤，不能用 any 隐藏字段错位后把 tsc 通过当运行就绪。

## 4. 上轮明确待办且本次确实未完成的原范围

以下通过本轮源码哈希/引用扫描、实际代码与相应隔离复验再次确认。不是重开已关闭缺陷。

| 原归属 | 当前事实 | 本轮处理 |
| --- | --- | --- |
| 第5项 / U04 | 支付先查后入账没有交易事实原子唯一认领；跨渠道、底层 REAL 缺字段、非法精度、晚收款覆盖仍可复现 | 退回同一支付范围 |
| 第9项 / U05-1/2 | 完整认证失败后平台 fallback 仍复活；Key 匹配不查账号状态 | 原两个隔离反例仍成立 |
| 第9项 / U05-5/6/7 | debug/test01、标准岗位跨空间私有统计、实际企业撤权/历史保留矩阵未完成 | 不用 lifecycle 纯函数替代实际入口 |
| 第1项 / U07 | 隔离超时自动释放、ACTIVE sweep 计数未命中仍终态、读取前实际字节边界未补 | 原资源范围，不修改已好的格式提取 |
| 第6/8项 / U01/U10 | 成本预约只有 Memory 后端，编排没有真实 task/attempt/费用入口持久接线 | 生产实现与实际入口必须补齐 |
| 第7项 / U01 | 来源可退依据/配额映射守卫未接实际服务；FREE 单一缺陷已修 | 保留已有账务原语，补对应真实闭环 |
| 第10项 / U11 | 首页 60+/300% 及登录直接 redirect 未改；旅程模块未接页面 | 原首页到历史复用流程 |
| 第11项 / U01/U10 | 运营恢复未接线；null scope 可见他租户；恢复未凭可信事实裁决 | 原运营/权限范围 |
| 第12项 / U10 | 指标未接 API；预付全部当消费、未知固定支出不影响完整性、时间/去重缺口 | 原经营指标口径 |
| 第13项 / U12 | 三类请求 DDL、持久化集成仍缺 | 完整离线数据/契约集成 |
| 第14项 | 新交付包范围表、版本证据、页面/业务矩阵不完整 | 按原要求补同版本材料 |

八个新增业务模块仍只由测试或这些模块之间引用，没有从实际页面/API 形成调用链。内部 type import 不代表生产接线。引用证据见本目录 import-evidence.json。

独立补测还保留确认：同预约键改变用户/空间/材料仍返回原预约成功；未消费预付款全部计已消费；固定成本未知仍可给出利润口径完整；运营 null scope 无跨租户权限仍返回他租户。它们当前在未接线模块，不说成已发生的生产越权/错账，但不能直接把这些模块接入。

## 5. 原 1–14 状态与交付报告纠正

| 原项 | 独立判断 |
| --- | --- |
| 1 F14 | 部分保留已验证；U07 仍 FAILED |
| 2 F15 | 部分修复，U02/U03 关键反例仍 FAILED |
| 3 F16 | 既有暂停/权限保护定向回归通过，PRESERVED_VERIFIED |
| 4 中间模型集成 | delegate 进步，完整迁移/原子契约仍缺 |
| 5 支付 | FAILED，实际入口未改 |
| 6 报价/预算 | 单位猜测已修；生产预算/报价绑定仍 FAILED |
| 7 来源/权益 | FREE 查询已修；来源与真实接线仍未完整 |
| 8 执行/恢复 | FAILED；BYO 不同 host 改善，完整目的地约束仍不足 |
| 9 身份/企业 | 两个诊断入口及初始化创建端部分改善，其余 FAILED |
| 10 首次价值 | FAILED，未接实际页面；不能全归环境门 |
| 11 运营/调价 | 计数改善；事务审计缺陷、真实恢复 FAILED |
| 12 指标 | FAILED，未接线且有口径错误 |
| 13 总集成 | FAILED/待实现依赖；不是商业决策阻断 |
| 14 工程交回 | 文件已收到；仍不能独立验收关闭 |

P14 材料需要纠正：

1. 不把“前置代码没写完所以不能集成”标 DECISION_BLOCKED；这是实现依赖未满足。
2. 不把原编号写成“原5=F16/F07 SMTP”等错位；CF-F08 是跨空间岗位统计，CF-F10 是请求 DDL。按既定 SCOPE-MAP 原编号销项，不再造 U13/U14 当新业务需求。
3. final-tests 声称 r0l 覆盖 reset-password 写=0/绑定/登录/一次性 resetToken，但实际该文件没有调用 reset-password、profile、login-sms 路由。生产并发测试预建行并关闭间隔，不能证明首次创建竞争和真实锁定核验。覆盖文字必须对应具体断言。
4. final-manifest 只有文件名和“基线+修改”，缺最终 HEAD、逐文件 SHA、保护文件 SHA、测试前后无漂移证据；没有原始测试输出/完整执行时间与退出码。
5. 页面没改、后台实现没接，属于 FAILED；只有源码实现完成但浏览器没验证的部分才单独列 ENVIRONMENT_UNVERIFIED。

## 6. 对用户价值、商业模式和数据设计的综合判断

用户侧：不能用辅助模块中的好设计代替实际流程。初始化的前后端契约已经展示了“后端局部修好了，但用户仍完成不了”的情况；首页理解价值、登录意图、费用确认、成果/版本/错误、历史下载与同工作复用还要按既定流程接通。没有真实用户认可/付费样本，不能声明留存和付费意愿已提升。

平台侧：当前单次成本准入、人工资金暂停和既有账务保护应保留，但共享预算/attempt/恢复仍未控制全部成本入口，支付并发唯一性仍缺。验证码新增漏计和价格部分提交进一步说明：只看“返回失败/通过测试”不能判断有没有费用或配置副作用。修复应优先堵实际风险，不用增加新组件和营销活动掩盖。

经营口径：收款、预付余额、已消费服务和利润必须分开；模型成本已知也不能代表 OCR、存储、支付、支持、固定成本全部已知。未经批准的价格/预算/商业退款/资产转移继续保持决策门；不要为“全部通过”编预算或打开真实收费。

数据侧：沿用现有单体、Prisma、资金来源/ledger/hold/recovery/task，不新造第二套账。补齐最小持久事实、唯一约束、状态条件、生产委托和离线迁移，确保同一用户流程各段用的是同一套身份/报价/来源/版本。历史关系未知仅列差异，不自动修钱或迁移资产。

下一轮固定终点：完成本次统一提示词中**原 1–14 的剩余工程范围**，保持已验证子项，不另开产品批次。真实交易、迁移、供应商成本、浏览器/人工与商业决策分别列门。可以争取一次交齐工程证据，不能承诺代码修好就必然盈利或全部生产验收。
