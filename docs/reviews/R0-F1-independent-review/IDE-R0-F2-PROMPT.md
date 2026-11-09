# R0-F2：只纠正原F-AUDIT残留，固定字段与退出标准

项目：D:\Project Development\ZhiGe-Dockyard\zhige-dockyard-web。

## 1. 唯一任务与用户流程

先读AGENTS.md、docs/PROJECT-DEVELOPMENT-CHARTER.md、上轮IDE-R0-F1-PROMPT.md及本目录REVIEW.md/verification.json。

用户流程：管理员按现有授权/确认入口修改维护计划或发布公告，持久化内容变化后，审计真实显示对应变化；重复提交相同内容时，不虚构变化。访客继续只读，拒绝/失败不产生业务写。

仅修原F-AUDIT剩余的两个表现：
1. 只改items/author或计划description/scope/actualResult/manager，内容已生效，审计却before={}、after={}、changed=false。
2. 计划与维护状态、说明全部相同的重复同步，因为固定fact.changed=true而记录假变化。

这不是新增需求。G02实际前后变化、无变化诚实记录仍未完成。本批不要再只补某一个示例字段，要按下方既有字段表一次覆盖完整比较范围。

## 2. 固定修改范围与禁区

默认只改src/app/api/system/maintenance/route.ts中的事实提取/差异比较/同步事实，必要时微调src/lib/maintenance.ts的相关类型；对应定向测试、快照和报告。

继续使用现有operationlog、withMaintenanceAudit和事务。保留公开GET只读、专用权限、双权限AND、实际生成ID、事务内旧值、配置/审计/会话同事务和提交后缓存。管理页不需为本问题重构。

禁止新增表、迁移、日志平台、日志展示页、权限体系、缓存体系、价格/支付/模型/结算功能。R0-A/B/C/D/E保持冻结，不进入F10。

修改前保存真实当前副本、完整相对路径、实际时间及SHA256。禁止替换共享源码跑旧版；对照只在VM/隔离副本进行。不reset/clean/整文件restore，不删历史报告、快照、测试或scratch，不覆盖他人修改。

## 3. 明确事实字段与比较规则

计划当前业务字段：title、type、status、isDowntime、startTime、endTime、manager、scope、description、actualResult。ID用作目标，不借本批更改ID策略。

公告当前业务字段：version、title、type、publishDate、isPublished、author、items。ID用作目标。

- 当前实现能持久化这些字段，审计事实必须反映对应字段的实际变化。沿现有必要事实提取方式最小补齐，不按任意客户端键无条件记录所有内容。
- 修改时仅把确实变化的业务字段写入before/after；创建保留实际生成ID与必要创建事实；删除保留必要原目标事实。不要保存整张列表或整套systemconfig。
- items是数组，按实际JSON内容/顺序比较，不用数组引用不相等判断变化。同内容的新数组应视为未变，正文变化应记录原值/新值。
- 新增/删除可选字段的缺省表达保持一致，必要时明确null/缺失，不能因undefined序列化被丢弃而伪造完整前后事实。
- 单动作涉及计划、维护模式、实际维护说明时，changed根据这些实际写入目标的差异综合计算。禁止同步分支固定赋值true。
- 重复提交计划、模式、说明全相同时changed=false；计划没变但模式或实际说明改变时changed=true，并可看出对应实际前后事实。同步写入说明的旧值应在同一事务取得。
- 不记录token、会话原值、密钥或用户原始材料，不扩大全局日志策略。

配置、事实和审计依旧同一事务；读取故障不编造空旧值；任何必要写/审计/提交失败均整体回滚，缓存只在成功提交后更新或失效。

## 4. 固定验收H01—H06

| 项 | 必须验证 |
| --- | --- |
| H01 公告字段 | 逐字段单独变更version/title/type/publishDate/isPublished/author/items；实际存储与日志before/after一致，changed=true；新建/删除目标事实不退化 |
| H02 计划字段 | 逐字段单独变更上述10个既有业务字段；真实变更有相应before/after及changed=true，实际生成ID保持；不把同时改标题当作其他字段已被验证 |
| H03 无变化 | 同内容items新数组、相同计划及设置重复提交均不虚构变化；计划/模式/说明全相同且sync=true时changed=false |
| H04 同步实际变化 | 仅模式改变、仅实际说明改变、计划与模式均变的组合，changed及目标/前后事实准确；双权限校验保持 |
| H05 原子性及门禁 | 配置中途失败、已清会话后审计失败、回调完成后提交失败仍完整回滚、缓存保持原状态，无ROOT写逃逸；GET和权限拒绝零写 |
| H06 冻结 | 既有290项必要定向回归+新增有效字段/无变化用例、原组件检查及类型检查通过；最小差量、快照和报告完整 |

用真实route/helper、隔离持久化与权限执行。每个字段用例从独立保存的旧记录出发，只改变该业务字段；必需请求字段保持相同。独立比对事务后存储与日志内容，不只断言日志条数，不复用事实提取函数计算测试期望。

本目录verify.cjs/verification.json是当前缺陷冻结证据，不改写成新结果。新增正确回归；修复前/后比较只用隔离副本。无需为了本补修启动真实维护、编造浏览器测试或新增UI。

## 5. 验证影响、交回与停止

只运行检查过依赖的定向隔离vitest、受控组件及本地tsc --noEmit --incremental false -p tsconfig.json。禁止全量测试（含真实MySQL写入用例）和下载依赖。

零真实库读写、配置/会话/审计操作、迁移/seed/清洗/补账/退款，零真实支付/模型/短信邮件/费用/部署，不读取或打印环境密钥。

新增docs/reviews/R0-F2-fix-report.md，逐项H01—H06，附字段覆盖矩阵、两种残留修复前后的隔离证据、事务故障证据、实际命令/退出码、开始/结束哈希和最小差量、数据影响及未验证项。历史报告不覆盖。

状态仅“R0-F2待独立复核”。**H01—H06通过即停止交回，不能自行继续F10或其他优化。** 若需要DDL、真实操作或范围外调整，停止该扩展并报告依赖。不得宣称生产就绪或盈利保证。
