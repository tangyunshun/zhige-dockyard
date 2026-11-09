# 第4批给B：三项定格后集成检查，交本助手统一审核

开始条件：A1、B1、A2的handoff、源码manifest与结果均已实际到约定位置，执行者已停止写入；你完成B1后才能接本批。只收到口头“做好了”不算满足条件。先读COMMON-RULES、三份指令和三份实际报告，不宣称它们已独立验收。

这是原F14/F15/F16的集成与验收准备，不是新增F17，也不增加业务功能。

## 1. 核查三份成果与范围

逐一核对实际文件与最终SHA，检查是否覆盖全部原要求、有无越界/覆盖、未做项是否诚实。A1的523/node:test/tsc不能移出；B1缺共享数据模型时不能称完整部署；A2不能重新开放F07人工退点。

发现handoff后源码被改动，先要求对应执行者交新版本，不把旧测试套在新代码上。待验项按F14/F15/F16归类，不另造新业务任务。

## 2. 你是共享模型和配置的唯一集成人

接收A1最后schema SHA，保存整份真实集成起点。将B1/A2模型片段增量合并进prisma/schema.prisma、生成可审阅的离线迁移；保留现有parse模型与所有历史字段，检查命名、唯一键、索引、delegate和状态一致。无新增模型的批次明确记无，不能为凑交付造表。

集成各批明确提出的最小共享配置/页面/权限目录补丁；不改现有用户权限映射、不真实写systemconfig、不启用资金/短信/结算能力。不替业务负责人决定收款来源、供应商或新售价。

必要本地生成/验证要保证不读取真实.env、不连接库、不联网、不下载；有阻碍列环境门，代码缺模型时的503行为仍须测。不能在业务请求中生成客户端或建表。

## 3. 同一最终版本运行统一检查

先定格三项业务源码，再执行：

1. 原F01–F13精确18文件：以docs/reviews/R0-J6-independent-review/validation-results.json的formal.files为准；保留全部原断言，数量不作为目标。
2. F14当前正式r0k/r0k1及后续本批精确文件；node:test两个文件用匹配runner带有限test-timeout；worker语法与真实本地有限非合作任务退出证据。
3. F15全部精确正式文件：未就绪真实路由零发送、共享预算/验证码状态和注册/找回调用链，费用与账户副作用隔离。
4. F16全部精确正式文件：读权限/错误域零资金副作用，暂停真实非成功，或批准可信链的稳定凭证/幂等验证；F07暂停策略保持。
5. `tsc --noEmit --incremental false -p tsconfig.json`，记录完整退出码/错误，不用缓存或排除文件假绿。

参考：

```powershell
$reviewBaseline = Get-Content -Raw 'docs/reviews/R0-J6-independent-review/validation-results.json' | ConvertFrom-Json
& '.\node_modules\.bin\vitest.cmd' run @($reviewBaseline.formal.files)
# F14/F15/F16用隔离配置和各自精确文件清单另跑，JSON放本批目录。
& '.\node_modules\.bin\tsx.cmd' --test --test-timeout=10000 'src/lib/__tests__/text-extract.test.ts' 'src/lib/__tests__/text-extract-paths.test.ts'
& '.\node_modules\.bin\tsc.cmd' --noEmit --incremental false -p tsconfig.json
node --check 'src/lib/parse-worker.cjs'
```

不无过滤跑全仓测试，不真实SMTP/短信/支付/模型/云桶/数据库，不运行真实部署。模拟产物复制不等于Next构建已通过；需要真实库/密钥/联网才能继续时停该动作并列发布门。

共享依赖的测试mock适配可以在本批最小修正，不能改期待结果/删用例/生产环境旁路来掩盖失败。审核目录里的“缺陷仍存在”用例绿色不是验收，要引用各批新的正向测试。

## 4. 发现问题如何处理

纯集成问题（模型拼接、delegate命名、最小配置、测试隔离）你在本批范围解决并补测。原业务实现缺陷退回原负责人和原编号，保留复现证据；不要替A重写解析/资金模块，也不另起“新优化”。

若退回后对方修改业务源码，收新handoff、验证新SHA，只重跑受影响部分及最终必要组合；你作为唯一集成人重新定格。执行人自检通过仍只记已交付待审核。

无法在本轮解决的实际阻断如实列出，不把任务从清单删除、不宣称所有批次完成。缺商业批准/真实环境证据保持能力阻断与发布门，不自动新建收费/供应商系统。

## 5. 最终统一交付

deliverables/B2/至少交：

- final-report.md：按F14/F15/F16逐项写用户流程、实际数据/API/权限、成本与资金影响、代码是否实现/离线测试/真实环境未测/是否暂停/待决定，不用一个“全完成”掩盖差异。
- final-manifest.json：共同最终版本、各文件SHA、每批对应更改、schema/离线migration和三份handoff引用；记录无业务改动的保护文件。
- final-tests.json与原始输出：真实命令、精确文件、通过/失败/取消及时间；最终SHA在测试前后相同，否则重核受影响部分。
- scope-map.md：原KR项及F15/F16要求→源码→真实测试→状态，保留已通过/未完成/环境门；不是新增问题清单。
- migration-and-rollback.md：仅可审阅未执行的迁移/兼容、缺表阻断、配置就绪条件和回滚限制，未知外部发送/已确认收款不得通过盲重试或代码回滚“撤销事实”。
- handoff.json：状态DELIVERED_PENDING_INDEPENDENT_REVIEW，声明全部执行者停止写入。更新主登记为“成果已收到/待独立核验”，不得写“已验收”。

交回本聊天时提供上述两份final文件的完整路径及所有未完成项。本助手会统一核验同一最终版本，按原项决定关闭或退回。没有真实生产证据不宣称上线可用、真实交易完成或利润保证。
