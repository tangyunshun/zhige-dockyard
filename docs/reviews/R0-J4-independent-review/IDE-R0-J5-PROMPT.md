# R0-J5：原F13剩余验收缺口，沿用原问题编号

先完整阅读：

1. `docs/PROJECT-DEVELOPMENT-CHARTER.md`；
2. `docs/reviews/R0-J3-independent-review/IDE-R0-J4-PROMPT.md`；
3. `docs/reviews/R0-J4-independent-review/REVIEW.md`；
4. 同目录 `handler-verification.json`、`cases.txt`、`manifest-verification.json`。

本轮只修原J3-01/02/03/04/05/07的剩余分支。**J3-06已通过并冻结；J-KEYS与F01–F12冻结；不进入F14。** 不新增商业模式、产品页面、通用恢复队列、配置项或架构层。不改价格、套餐、额度、算力点、BYOK、支付、结算、模型和解析/OCR策略。

## 一、流程目标、范围和安全边界

用户删除一份资料、重试失败删除或清空空间时：共享资料仍可读取；私密资料的权限不因元数据已删而放宽；历史大小不明先保留；并发终结恰好释放一次；失败与未知数量如实展示。

可见交付限于既有删除/恢复API与现有提示，以及相应持久状态和存储计量。无人民币/点数账务变更。预计必要文件只有storage-quota、Studio handler、clear-data文件清理段、精确测试与报告；若消费新增结构化未知状态必须调整现有回调，只做相关最小改动。不改file-store、schema或其他页面，除非先指出本次需求无法满足的具体原因。

开工前在 `docs/reviews/R0-J5-fix-snapshot/` 保存**所有实际拟修改文件**的完整副本、完整SHA256、真实采集时间、机器可读清单；新文件标新。起点应匹配R0-J4独立审核当前哈希，若不匹配先如实记录中间变化并读差异，不能只报告最后一个会话的局部改动。

不读.env或密钥；不连接真实数据库、模型、客户磁盘/云桶；不迁移、seed、部署、付费调用或清理历史数据。不得reset/clean、覆盖他人工作或旧审核证据。所有测试使用内存/明确隔离IO；不得无过滤运行npm test/vitest。

## 二、J3-01剩余：把共享引用保护接到单项删除恢复

当前清空恢复已安全，但handler文档不存在分支findStorageOpByDocument后直接删文件。禁止只修一个入口、其他入口继续绕过。

1. 在实际外部删除之前，用授权空间与规范对象身份查询当前仍保留引用；已有合法历史别名规则复用，不按原始filePath字符串漏查。
2. 如有其他资料仍引用对象，保留文件和计量，返回明确共享保留/待处理事实。不能pendingCleared=true、不能RELEASED、不能给新上传腾容量。
3. 该检查必须落在用户正在调用的remove_asset恢复入口；不能只新增一个未接线service或仅修clear-data。
4. 没有任何引用且同项已授权的pending，应继续安全恢复，不一律拒绝所有pending。

验收：d1已删、其30字节待清理操作仍在，d2以别名引用同一对象；重试d1后d2、文件、30字节占用均保留，API说明实际状态。再测无引用的同项恢复释放一次，以及不影响其他对象/空间。

## 三、J3-05剩余：同空间管理员不能绕过私密恢复权限

当前 `pending.userId === userId || isManager` 让企业所有者删除他人私密待清理对象，尽管有文档时正常分支会403。

1. 文档不存在后的恢复仍按已持久化的主体、空间、文档及既有操作授权范围裁决；isManager不能无条件覆盖私密限制。
2. 对私密删除认领，仅原来被授权的主体可重试。历史状态无法证明允许当前其他管理角色代恢复时，应安全拒绝或明确待核实，不能猜成公开资料。
3. 优先用现有持久身份作最小修复，不新增一套权限产品，不让客户端传visibility/filePath/uploaderId作为授权依据，不把私密政策改成“管理员均可”。
4. 未授权请求不得触碰文件、额度、认领状态，也不能伪装成功并声称pendingCleared。原合法上传者恢复和已明确授权的公开治理流程保持。

验收：同一企业空间u1所有者、u2成员。u2私密文档存在时u1得到403；文档经u2已授权删除、剩pending后u1仍被拒绝且无副作用；u2合法重试可完成。保留跨空间伪造拒绝。不要用只有一个用户的夹具代替权限测试。

## 四、J3-03剩余：清空必须消费blocked，状态重开之前必须核对载荷

1. clear-data把原始d.fileSize交给校验，不能 `??0` 把null当真实零字节；未知、非法、负数与真实0分开。
2. clear-data收到claim.state=blocked必须在任何文件删除/最后元数据删除前停止本对象，保存原对象/资料/用量/恢复事实，给出实际阻断原因。不能先删，再靠finalize漂移来报告。
3. claimObjectCleanup对CANCELLED重开等可继续破坏性动作的分支，先核对已有持久事实与当前空间/类型/规范对象/可信字节，再改变状态或允许调用方继续。不能提前return claimed绕过后面的冲突判断，也不能覆盖历史字节猜测修正。
4. 保持单项PENDING冲突/null保护与真实0字节正常流程；纯JSON文本无物理文件仍正常，不强塞文件大小。
5. 大小矛盾无需扫描或自动修复真实历史对象，不新增去重/迁移功能。

必须有以下正向证据：

| 入口与前置状态 | 修复后结果 |
| --- | --- |
| 清空，fileSize=null，文件30/used30 | 资料、文件、占用保留；未知大小提示；不报出厂完成 |
| 清空，pending.bytes30、文档fileSize50 | blocked被消费，破坏性动作零发生，数据保留 |
| 单项删除，CANCELLED.bytes30、文档fileSize50 | 状态不重开、文件/文档不删、占用不动，说明冲突 |
| 单项/清空，可信真实0字节 | 正常删除与终结，不额外占用/扣量 |
| 两个无冲突正常对象 | 分别只释放各自可信字节，其他对象/空间不动 |

## 五、J3-02剩余：清空与删除交错，以及已释放终态重放

1. 移除clear-data中凭 `claim.state === claimed && count===0` 关闭共用认领的逻辑。曾创建认领并不代表拥有独占执行权；count=0不证明另一方已经完成扣量。
2. 共用认领由完成方或受授权恢复者推进到真实终态；未完成不CANCELLED隐藏用量。不要把慢文件IO放进数据库事务，不加进程内锁冒充跨实例正确性。
3. finalizeObjectCleanup在受保护事务中先识别已RELEASED终态，再决定是否需要扣量；已完成重放返回幂等事实，即便当前用量为0，也不能报新漂移。未完成且真实用量不足仍保持漂移阻断，不能清零。
4. clear-data发现并发跳过后，未核实共用认领完成时不能报完整出厂重置；明确待处理或核实后的实际完成状态，不把concurrentSkipped一律等同成功。
5. 两个remove_asset交错已通过，不重做，只回归。

必须用显式屏障实际交错：A清空扫描并创建认领后停在文件删除前；B单项删除读取旧资料、物理删除和删行成功后暂停；A继续至count=0；最后B终结。结果应是文件/文档已删、净用量0、RELEASED、只释放一次，没有CANCELLED卡住用量；其他资料/空间不动。不能用“强制deleteMany返回0，再手动删行+清空”代替这条并发证据。

另测：同认领连续终结，第一次30→0，第二次识别alreadyReleased且不漂移；故障提交后重试仍可终结；清空/删除反向交错保持安全。数据库夹具只模拟明确事实，不夸称通过真实MySQL并发验收。

## 六、J3-04剩余：查询失败是状态未知，不能凭空计为1个对象

1. 查询pending失败时不递增“认领条数”；检查失败次数与对象数量分开表达。未知不是0也不是1。
2. 结构化storage结果明确输出恢复检查失败/数量是否可确认；可保留已知逐项失败数，并另外声明总量未知，或使用清楚的可空数量。调用方必须能区分“确认没有pending”和“未查到事实”，而不仅依赖一段中文提示。
3. 对查询失败，提示“恢复检查失败，待清理数量未知”；不能同时说“1条未完成”。已知某条失败时仍按实际1条报告，正常空集合继续显示清理完成。
4. 沿用当前API及现有提示，仅补字段与准确文案，不加页面/配置。已通过连续提交失败的安全保留/最终恢复保持。

验收：实际空集合、实际多条认领两种数据下分别注入查询失败，都不得编造具体总数；API有未知标志且不报完全成功。查询成功时逐项失败数、完成数按实际记录。

## 七、J3-07剩余：补新增恢复查询与实际HTTP错误映射

1. findStorageOpByDocument的findFirst缺表P2021、缺列P2022及缺delegate按现有稳定存储就绪错误处理；普通网络/业务异常不要全伪装成未迁移。
2. remove_asset文档不存在的实际恢复入口，应将相应错误映射到503与稳定code；不能仅在service改抛StorageQuotaError，最后又被Studio通用catch包装成500。
3. 在任何物理动作之前拒绝，资料/对象/占用/认领无变化；响应不泄露SQL/密钥。现有两上传的503已通过，保持其code与行为，不来回改名。
4. 不在请求中生成客户端、迁移或修表。其他发生真实业务故障的500、权限403、额度403、载荷400/冲突409保持。

验收必须通过实际runStudioPost/remove_asset，并构造目标文档已无、pending查询分别缺delegate/P2021/P2022；得到稳定503且零文件/计量副作用。不要只断言service抛错。

## 八、验证、交付与停止

提交按上述**6个原编号**组织的证据，不重新编号成另一套路线图。可以复用本次隔离夹具，但把缺陷现象断言改为修复后的正向目标；禁止把原“错误结果被复现”的绿色测试当验收。

已通过部分只作受影响回归：J3-06类型/真实P2002拒绝与合法预留、清空共享保护、合法同项恢复、两个单项并发、上传预绑定与未知保存保护、真实0字节/文本、私密权限、物理失败不腾容量、J-KEYS及两处前端回调。测试数量不是验收目标，不删旧测试凑全绿。

精确隔离回归命令：

```powershell
.\node_modules\.bin\vitest.cmd run --no-color src/app/api/__tests__/r0j4-storage-fixes.test.ts src/app/api/__tests__/r0j3-recovery-close.test.ts src/app/api/__tests__/r0j2-storage-close.test.ts src/app/api/__tests__/r0j-storage.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0i2-cold-quote.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
.\node_modules\.bin\tsc.cmd --noEmit --incremental false -p tsconfig.json
```

本轮新增精确测试单独追加，但开跑前必须确认IO隔离，不扩为全仓扫描测试。当前493条是基线，不是下轮硬编码通过数量。

输出 `docs/reviews/R0-J5-fix-report.md` 与快照清单：每个原编号的实际入口、文件行号、用户可见结果、文件/资料/用量/操作状态前后、正向测试与命令结果、版本哈希、回滚范围、限制、未完成项。必须覆盖从上轮独立审核版本到交付版本的全部改动，不能只说最后会话20行。不得虚称浏览器、真实数据库/交易或生产可用验收。

六项剩余全部正向验证后停止，报告“R0-J5已实现，待独立审核”；不能自行关闭F13、进入F14或上线。若需要真实库、客户文件、费用或突破冻结范围，停止对应动作并指出具体阻碍。不要趁修复附带开发其他功能。
