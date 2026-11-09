# R0-J6：只完成原J3-02与J3-04的两个状态缺口

先读 `docs/PROJECT-DEVELOPMENT-CHARTER.md`、`docs/reviews/R0-J4-independent-review/IDE-R0-J5-PROMPT.md`、本目录REVIEW.md与handler-verification.json、additional-cases.txt、manifest-verification.json。

本轮R0-J5的四项J3-01/03/05/07验收通过并冻结，J3-06/J-KEYS与F01–F12继续冻结。**只修下面两项，不进入F14，不重开其他已通过功能。**

## 一、交付目标与边界

用户重复点击同一删除恢复时，如果另一请求已完成清理，应看到已完成的幂等结果；真实漂移仍须阻断。管理员/调用方读取清空结果时，待清理数量要与仍存在的认领一致，不能把共享或漂移保留的认领漏成0。

这两项修复API状态与持久事实的一致性；不改变容量、收费或权限政策，不涉及人民币/算力点账务。

预计必要改动：`src/lib/storage-quota.ts`的finalizeObjectCleanup及其必要小范围辅助；`src/app/api/workspace/clear-data/route.ts`的结果计数；精确测试、快照与报告。handler正常消费修正后的service结果即可；不重做页面、file-store、schema、解析/OCR、上传协议、权限、套餐或价格。不新增配置项、分布式锁服务、队列平台或运营产品。

开工前在 `docs/reviews/R0-J6-fix-snapshot/` 保存所有实际拟修改文件完整副本、完整SHA256、真实时间及机器可读清单；新文件标新，起点与本轮独立审核当前哈希对齐。只改必要内容，不批量格式化大文件，不覆盖他人dirty改动或旧审核证据。

不读.env/密钥，不连接真实数据库、客户文件/云桶或模型，不迁移、seed、付费、部署或清理历史数据。验证只用隔离IO；不得无过滤执行npm test/vitest。

## 二、J3-02：两个终结事务都已读到PENDING时，后到者也须正确识别完成

当前问题：先SELECT检查RELEASED能处理顺序重放，但两个事务都读旧PENDING时，A提交后B在扣量时count=0，直接报漂移，没有按最新已提交终态识别A已完成。

要求：

1. 同认领的受保护终结应与quota扣减在同一短事务保持原子，只有真正完成者扣量一次；同认领的另一完成请求识别已提交RELEASED，返回幂等已完成事实。
2. 可以利用现有条件状态转换形成事务内互斥，或在安全回滚后重新核对已提交终态等小范围方式修复。若重读，不能仍拿原事务旧快照当最新事实；不得把“有一条操作”当成功。
3. 身份/空间/对象/类型/字节事实应一致，仍PENDING且真实用量不足继续drift=true，保留用量与待处理状态。不能无条件把count=0或所有RELEASE_DRIFT改成成功，不能清零用量。
4. 保留外部物理IO在数据库短事务之外；不靠进程内锁冒充跨实例正确性，不改变数据库，不迁移模型。
5. 实际remove_asset恢复入口应消费正确结果：同项已完成重放不再返回500/STORAGE_RELEASE_DRIFT或“占用已保留请人工核对”；真实漂移依然如实返回失败。不能只修测试返回对象。

必须通过实际API给出正向证据：

| 场景 | 目标结果 |
| --- | --- |
| 同用户两个实际删除恢复请求，两个终结均已读到旧PENDING；A先提交、B再继续 | 两个请求均得到成功/幂等完成，认领RELEASED，used30→0且仅一次扣减，文件确认清理 |
| 第一次完成后再开始第二次请求 | 已通过的顺序幂等继续保持 |
| 真实PENDING、bytes30、used10 | 仍漂移阻断；used10不清零，认领保持PENDING，不伪装成功 |
| 终结提交失败后重试 | 保留恢复依据，故障解除后仅释放一次 |
| 另一对象、另一空间 | 资料/文件/计量不受影响 |

测试必须显式控制“两个事务均已经读取旧状态，但最终写入依次执行”。本轮additional-cases.txt在quota写前控制顺序用于复现旧实现；若你的修复调整了受保护写顺序，应把屏障放在相应的读取后/首次受保护写前，保持同一业务交错事实。不要因为等待点失效就删掉竞争条件，也不要仅用顺序请求冒充这项验证。隔离夹具不等于真实MySQL验收。

## 三、J3-04：待清理数量按持久事实计算，不能漏掉共享/漂移保留

当前pendingCount直接等于pendingStill，而pendingStill只记录部分处理失败。共享保留和漂移保留的认领仍PENDING，却返回known=true/count=0。

要求：

1. 明确pendingCount是本授权空间文件清理协议中尚未终结的RELEASE/PENDING_CLEANUP认领数量，以可核实持久事实为准。按唯一认领计数，同一认领被恢复循环和资料循环碰到不能重复计数。
2. pendingStill如保留为本请求已知逐项失败数，应说明其口径；不能再用它代表全部尚存认领。共享保留、真实漂移、物理失败、认领已建立而本次并发跳过等尚未终结事实不得漏掉。
3. 可对最终状态作最小只读校验/计数，或用足够可靠的已知状态实现；正常并发导致结果时点差异须按最近可核实事实报告，不为计数引入锁服务/队列或写库修复。
4. 已通过的恢复查询失败口径保持：recoveryCheckFailed/unknown、pendingCount=null，不伪造0/1。如果最终校验本身失败，同样报告数量未知，不掉成known=true/count=0，不伪装完全完成。普通查询/计数失败不能被吞掉。
5. 继续保留共享对象和计量、漂移不清零。不得为了让pendingCount归零而取消/删除认领、释放在用对象容量或隐藏错误。
6. 只修现有结构化字段与必要说明，不新增运营页面，不改私密授权，不做真实历史数据扫描或自动修复。

正向证据：

| 场景 | 目标结果 |
| --- | --- |
| 两资料别名引用同对象，有1条pending认领；清空保留 | 文件/资料/used30仍在，认领PENDING；pendingCountKnown=true、pendingCount=1 |
| 无文档、认领bytes30/used10的真实漂移 | 认领PENDING、used10保持；pendingCount=1，不能known=true/count=0 |
| 一条恢复成功、一条仍失败或保留 | 只计仍存在的唯一pending认领；完成数与未完成数各按事实 |
| 正常空集合或全部完成 | known=true/count=0，与持久终态一致 |
| 初始恢复查询失败（实际0条/多条） | 沿用已有unknown/null和不报完全成功的规则 |
| 最终计数/核实失败 | 数量未知且错误可诊断，不编造0，不改认领/额度 |

## 四、回归与证据交付

本轮只需围绕两项补正向测试；现有17文件513条是回归基线，不能为凑数字删除或弱化旧测试。允许新增一个精确文件，先确认所有外部IO隔离。

```powershell
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0j5-remaining-branches.test.ts src/app/api/__tests__/r0j4-storage-fixes.test.ts src/app/api/__tests__/r0j3-recovery-close.test.ts src/app/api/__tests__/r0j2-storage-close.test.ts src/app/api/__tests__/r0j-storage.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0i2-cold-quote.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
```

19条独立正向保持证据与已冻结项可复用未变化部分；新增3条缺陷现象断言需改为正确结果，不把“旧错误被复现”的绿灯当修复通过。回归只扩到受影响部分，不重新设计已通过的上传/删除/鉴权或前端。

交付 `docs/reviews/R0-J6-fix-report.md`：按J3-02/J3-04两项写实际入口、文件行号、用户可见结果、quota/认领终态、并发顺序、计数事实、正向测试/命令结果、起点/期末副本与完整哈希、回滚范围和未覆盖限制。只报告实际验证，不宣称真实MySQL、浏览器全链路或生产可用。

两项完成并有证据后停止，报告“R0-J6已实现，待独立审核”。不自行宣布F13通过，不进入F14，不上线。需要真实库、费用或突破范围时停止对应动作并说明具体阻碍。
