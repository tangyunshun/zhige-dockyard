# R0-E独立审核：生产模拟支付止损通过，执行过程须纠正

日期：2026-11-07（Asia/Shanghai）。结论：**既定E01—E08的源码/隔离验收通过，冻结R0-E，不追加E1。** 当前代码未发现本批范围内阻断项；IDE的换源验证过程违反指令，须明确纠正，不能把该做法带入后续批次。

本轮只新增审核材料，未修改或临时替换业务源码，未删除任何清理候选。R0-A/B/C/D保持已签收范围，本轮没有加入一般优化。

## 1. 固定验收结论

| 项 | 独立核验 |
| --- | --- |
| E01 统一裁决 | 真实resolvePaymentMode/createCharge对production+mock的4种大小写/空格写法×有无齐备凭证夹具，共8组，均稳定拒绝；WX/ALI两个渠道都不调用provider、不返回payUrl、不静默切REAL |
| E02 模拟双方法 | TOKEN_RECHARGE/SEAT_ADDON/PLAN_UPGRADE的MOCK订单夹具经真实GET/POST均403；零订单读、零事务、零写，状态保持PENDING |
| E03 付费下单 | 真实充值/席位/套餐升级POST+真实gateway模式裁决均503及稳定code，零订单/权益写、零provider调用；免费基础档分支保持 |
| E04 REAL安全行为 | production+real/缺配置/原有非法值保持REAL；缺凭证createCharge拒绝、无MOCK降级；模拟入口禁止 |
| E05 开发联调 | development+mock、test缺配置实际mock确认→真实grantPoints/getBalanceSummary可执行；同订单重复确认不多发 |
| E06 已付款事实 | 实际WX notify→真实fulfill→真实grantPoints在production误配mock时仍处理可信真实通知；验签失败夹具401、零发放。WX/ALI实际gateway模块在provider IO夹具下保持REAL。既有定向用例覆盖其他ACK/金额/席位边界 |
| E07 页面与历史 | 实际模拟页5项受控错误检查通过；普通本人订单GET在production+mock仍只读可查，历史MOCK不被改REAL；前三类下单错误没有成功或模拟跳转响应 |
| E08 冻结回归 | 253项定向测试、E5/D24/C18/收银台21项检查及类型检查通过；5个重要账务/席位/展示/期限文件哈希与上轮一致 |

接口行为：模拟GET/POST返回403及PRODUCTION_MOCK_PAYMENT_DISABLED，三条付费下单返回503及同code。统一PaymentConfigError只拦当前危险配置，不更改价格、付款渠道、免费资格或其他权益。当前三条路由开始副本→源码差量已逐项查看，集中于导入/模式守卫/错误响应及升级文案取charge.mode。

## 2. 本轮实际重新执行

```text
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
8 files / 253 tests passed，exit 0

.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
exit 0，无诊断输出

node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs
5/5 checks passed，exit 0
node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs
24/24 checks passed，exit 0
node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs
18/18 checks passed，exit 0
node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs
21/21 checks passed，exit 0

node docs/reviews/R0-E-independent-review/verify.cjs
exit 0；8组生产模式、3类模拟订单、3条付费下单、11组保持性控制及快照通过
```

独立脚本没有mock掉模式裁决。账务是完整真实credit-service；provider/验签、身份、持久化、价格/套餐/provision等IO为封闭夹具。免费分支本轮独立测试调用provision夹具，完整R0-A服务仍由既有109项回归提供证据。没有使用实际.env、密钥、供应商、数据库或付费调用。

IDE新增测试首个环境变体循环中有提前return，只跑了其中第一个变体；本轮独立脚本已实际逐组执行四种写法及有无凭证两类，无需因此追加源码补修。其原用例数不是独立场景覆盖率。

## 3. 必须纠正的过程与报告问题

IDE报告承认临时换入共享业务源码做旧版对照，且因route.ts同名备份冲突损坏了三条路由。这违反上一轮明确的“禁止临时替换共享源码”，不能同时声称完全未触碰/回退工作区。本轮未复用此方法。

当前恢复结果已核实：5个当前文件与结束副本/manifest哈希一致；5个开始副本与其manifest一致；其中4个开始文件可和上一轮该JSON已有哈希核对，升级路由未被该JSON记录，不能宣称“五个都与该JSON一致”。升级路由及另两条下单路由的实际差量已人工阅读，253项及独立三路下单/免费分支验证通过，未发现当前残留损坏。因此作为**执行过程问题**记录，不重新开启已通过的源码验收。

manifest称所有开始副本加.frozen后缀，目录实际开始副本仍是.ts，结束副本才是.frozen；不影响已验证内容哈希，但报告需区分。采集时间也与前批记录相同，不能据此独立证明保存动作的真实时刻。以上均不作为新增功能或生产事实。

后续严格要求：只在VM双加载或独立临时树重放旧版，不触碰共享源码；副本文件名保留完整相对路径并校验哈希；没有合格隔离办法就只报告缺失对照，不用换源冒险。不要为了改旧报告覆盖历史材料。

## 4. 状态与边界

| 项 | 当前状态 |
| --- | --- |
| 用户流程 | 生产错误配置下模拟确认/付费下单诚实失败；开发联调、合法免费与真实收款通知保持 |
| 后端闭环 | 模式核心、模拟双方法及三付费路由均有前置拒绝/零写证据 |
| 本轮实际影响 | 仅新增审核文件，零真实库、渠道、支付、模型、迁移、seed、退款或部署 |
| 未完成 | 真实部署环境、RBAC/MySQL并发、浏览器DOM、渠道/财务/运营发布验收；历史异常数据调查 |
| 未恢复能力 | 企业转个人、人工批准原来源/净额退点继续暂停，不在本轮恢复 |
| 发布性 | 只通过本批源码/隔离止损，不宣称生产就绪、真实交易已验收或利润已保证 |
| 下一关口 | 原方案F09公开维护查询只读、维护写操作授权审计；见IDE-R0-F-PROMPT.md |

## 5. 下一批原F09的当前证据

`/api/system/maintenance`在middleware公开前缀中。实际GET不调用认证，却支持action=emergency_disable并调用真实setMaintenanceMode(false)。此外，正常GET读取发布/维护历史时会按硬编码旧ID清洗并UPDATE数据库。

独立执行真实GET+真实maintenance helper，系统配置为内存夹具：

1. 普通GET、无旧ID：200，维护仍true、零写（正向对照）。
2. 无认证GET?action=emergency_disable：200，维护从true改false，systemconfig.upsert一次、auth调用0。
3. 无认证普通GET、含命中旧ID夹具：200，发布/维护计划两条systemconfig.update；读请求改变存量数据。

这证明公开读接口具有写副作用，不证明线上正在受攻击或真实记录被清理。当前writeAuditLog还会吞持久化失败，不能简单await该helper就声称强审计已可靠完成。权限目录已有system:maintenance_toggle与maintenance:publish两个高权限；requirePlatformPermission多键参数为OR，需要同时授权时不能误用。

证据：next-maintenance-verification.json、verify-next-maintenance.cjs。下一批只处理原F09的读写边界、授权维护写和必要审计/缓存一致性，不混入F10 cron、支付、模型或全站权限重构。
