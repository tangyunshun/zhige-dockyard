# R0-I2 独立审核报告

日期：2026-11-07。依据：项目开发总纲、原 F12 修复范围及 R0-I2 指令 K01—K05。仅审核，未修业务代码。

## 结论

**原功能问题 I-GET-DDL-DEFAULT 已关闭。R0-I2 的功能验收通过；交付归档 K05 尚有一项 P2 不一致需要补齐。** 不重复返修报价、额度、管理员说明或成本准入，不启动新的 BYOK 开发轮次。本次不发 F13 实现指令，先按本目录归档提示词完成现有交付的收尾。

| 验收项 | 结果 | 独立证据 |
| --- | --- | --- |
| K01 默认/显式报价冷启动只读 | 通过 | 五类入口各独立文件运行，正常时 SELECT、零 raw 写和 ORM 写 |
| K02 缺列诚实拒绝及既有边界 | 通过 | 五类入口分别模拟探针失败，503 / BYO_SHARE_COLUMN_NOT_READY，零写；正式定向回归保留 401/403、平台报价及任务暂停 |
| K03 写 SQL 断言识别 EXEC 前缀 | 通过 | 当前正式测试已修正两处断言，并对 EXEC ALTER 自检；独立夹具另用自身判断检查写记录 |
| K04 定向回归及类型检查 | 通过 | 本人运行 12 文件 407 测试通过，tsc 退出 0；另有 10 项独立正向验收通过 |
| K05 版本/快照/交付事实 | 部分通过 | 5 个结束哈希、4 个起点哈希引用和 24 个保护文件核对通过；但报告所称 manifest 和起点副本未交付 |

这不是新增业务需求。归档缺口补齐后，如源码哈希保持一致，可复用本轮功能证据，不要求再修业务或无理由重跑整套测试。

## 唯一待补齐项：I2-ARCHIVE-MISSING（P2）

`docs/reviews/R0-I2-fix-report.md:13—14` 声称快照目录包含 manifest.json，并引用其中 capturedAtReal。第 96 行说明使用该目录的 R0-I1 源码副本覆盖四个文件即可回滚；第 98 行声称 K01—K05 完成。

本轮实际递归枚举（包括隐藏项）的结果：`docs/reviews/R0-I2-fix-snapshot/` 仅有一个文件 `after-hashes.json`；`frozen-source/` 为空，manifest.json 不存在。故无法按报告原文定位开工时间、打开副本或执行其回滚步骤。**哈希能核对字节，不能代替文件内容。**

影响限于交付可追溯和回滚准备，不是新发现的扣费漏洞，也不否定已经通过的默认只读功能。不得为了补齐此项改业务逻辑或执行真实回滚。

已有可用证据：

- after-hashes.json 的 5 个结束哈希与当前文件完全匹配。
- 其中 4 个旧文件的 sha256Start 与 R0-I1 独立审核记录完全匹配。
- 本人进一步在内存中逆向还原已审核的改动，4 个文件均恢复出与上一轮完全相同的 SHA256，详见 `difference-verification.json` 和 `check-differences.cjs`。该验证也证实实际改动限于三处只读参数接线、正式测试的分类器/自检和两处断言。
- 上述验证没有将旧代码写回 src，也不是“开工时已采集原始快照”的证据。若用此方法补存副本，必须标为审核后重建，记录当前真实时间、来源及匹配哈希，不能倒填开工时间。

修复仅需：补齐可核对的归档文件并更正报告来源/时间/回滚说明，或如实报告无法补齐的部分；不允许继续保留“文件已经存在”的错误描述。具体见 `IDE-R0-I2-ARCHIVE-PROMPT.md`。

## 功能和副作用的独立验证

源码传递链已经完整：estimate 默认分支由服务端设置 readOnlyResolution=true，resolveDefaultDeployment 转发至 tryResolveWorkspaceByoDefault，再传至 ensureByoShareWithMembersColumn 的 readOnly 分支。显式分支保持原只读逻辑；未修改默认模型优先级、共享/归属/合同能力规则或收费策略。四个旧文件的内存反推哈希核对排除了未解释的额外差异。

每条独立测试文件拥有隔离模块，实际执行 GET、model-registry 和 BYO helper；只替换数据库、解密等 IO，避免模块缓存预热掩盖缺陷。旧 R0-I1 缺陷复现文件没有重写或作为本轮正向证据使用。

| 独立入口 | 正常结构 | 缺列夹具 | raw 写 / ORM 写 |
| --- | --- | --- | --- |
| 显式 BYOK | 200，暂停报价 | 503，稳定结构错误 | 0 / 0 |
| 省略 deploymentId，空间默认 BYOK | 同上 | 同上 | 0 / 0 |
| deploymentId=auto，空间默认 BYOK | 同上 | 同上 | 0 / 0 |
| 个人偏好历史 byo，空间默认平台模型 | 同上 | 同上 | 0 / 0 |
| 个人偏好 byo:w1，空间默认平台模型 | 同上 | 同上 | 0 / 0 |

正常结构的五条路径均核对 blocked=true、canExecute=false、points/yuan=null、BYOK_BILLING_POLICY_UNCONFIRMED；原始记录均只有 shareWithMembers 的 SELECT 探针。十份 `cold-*-verification.json` 保存请求条件、响应、raw 和 ORM 写记录。

月度 handler、管理员组件及另外 22 个既有保护文件共 24 个文件与 R0-I1 版本哈希一致，复用上一轮已核验的额度顺序、页面/回调证据；正式回归同时覆盖相关既有行为。没有因本轮归档缺口重新打开这些功能问题。

## 本人运行的验证

1. 原指令的 11 个明确 R0 定向文件，加 r0i2-cold-quote.test.ts：12 文件、407/407 通过，退出 0。预期的故障注入 stderr 不代表真实外部调用。
2. `vitest run --no-color --config docs/reviews/R0-I2-independent-review/vitest.review.config.ts`：10 文件、10/10 独立验收通过，退出 0。
3. `tsc --noEmit --incremental false -p tsconfig.json`：退出 0，无诊断。
4. 5 个当前交付文件哈希、4 个起点引用、24 个保护文件核对；4 个起点字节内容通过内存重建匹配原 SHA256。结束核对记录在 validation-results.json。

版本和归档枚举详见 manifest-verification.json；差异证明详见 difference-verification.json。本目录构建/审核脚本只新增独立证据，未修改正式源码、正式测试或旧审核产物。

## 数据、成本、限制和下一关口

全程没有连接真实数据库、读取真实环境密钥、实际 ALTER/迁移、调用模型/支付/退款、写管理员配置、清理或部署。数据库及外部 IO 夹具证明的是调用逻辑，不证明 MySQL 锁、生产持久化、真实收益或浏览器 DOM。

原 F12 的安全暂停策略保持；BYOK 正式收费/恢复仍需另行商业授权。不是“整个 BYOK 已商用”或“整个系统生产就绪”。

下一步只补 K05 归档：原交付报告和快照事实一致、四个起点副本可验证、五个结束哈希保持一致后，即可结束本批并按原路线进入 F13 的范围确认。无需继续开报价业务修复批次。
