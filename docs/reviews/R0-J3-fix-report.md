# R0-J3 修复报告：完成原 F13 剩余四组（J-RELEASE / J-UPLOAD / J-CLEAR / J-KEYS）

**状态：R0-J3 待独立复核**（不进入 F14、不部署、不执行迁移）

只修 R0-J2 独立审核确认的四组剩余问题。已冻结通过项（J-PRIVATE、J-WRITE-BOUND、J-PARTIAL 过滤方向/HTTP/缺集合、J-RECONCILE 三项、S3 同键/单一历史位置、私密权限、非空 ID/服务端 userId、零额度拒绝、主键默认值、预留原子提交、读后非法用量拒绝、清空保留失败对象与扫描后新上传）只回归不重开。价格/套餐/点数/支付/BYOK/结算开关/F11/F12 零改动。

---

## 一、开工基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-J3-fix-snapshot/manifest.json`（真实时间 `2026-11-08T02:59:25+08:00`，8 文件完整副本 + 完整 SHA256）+ `after-hashes.json`（11 文件完整起止哈希） |
| storage-quota | `bd674807…f8c02 → 23ca6363…a85b` |
| file-store | `f53ff936…45ba2 → 2d649aab…5d6a`（J-KEYS 剩余边界 + 对象键预分配，本批实际修改） |
| handler | `a5b69ab7…9d09b → 6c948b62…f0e2` |
| clear-data | `86377e12…8be81 → 1658c0e9…25c40` |
| 布局页 | `8c1e17b3…e6f926 → 7c0dd62c…70be5b` |
| schema | `7665df42…26cb9 → dd595598…92905`（仅 status 注释增补 CANCELLED，模型结构零改动） |
| 资产读取路由 ×2 | 新增 scope 边界（`d4ac28fc…` / `6d3bd0c5…`） |
| 测试 | r0j `ad0046d8…→44e4f406…`、r0j2 `ac854b55…→82b92aba…afea`、**新增 r0j3** `d7f9e954…59f64e`（12 用例） |

## 二、真实入口 → 服务调用矩阵

| 真实入口 | 本批协议 |
|---|---|
| remove_asset（PRIVATE）/ delete_removal_record / batch_delete_assets / batch_remove_assets（PRIVATE） | **认领协议**：别名身份共享检查 → `claimObjectCleanup`（破坏性前持久认领，确定性 opId）→ `deleteAssetFile`（含歧义拒绝）→ 条件删行 → `finalizeObjectCleanup`（同一事务 { 条件扣减 + 认领 RELEASED 终态 }） |
| upload_doc（multipart）/ upload_knowledge_attachment | **预绑定协议**：`allocateObjectKey` → `reserveStorageBytes` → `bindOperationObjectKey`（对象键写入前持久关联操作）→ `saveAssetFileToKey`（saveAttempted 前置）→ doc.create → `confirmStorageOperation` |
| clear-data | 恢复重试段（终结历史 PENDING_CLEANUP 认领）+ 逐对象认领协议 + 同事务终结 + 如实结果说明 |
| 两个资产读取路由 | `readAssetFile(path, doc.workspaceId)` 授权空间边界 |
| reconcileWorkspaceStorage | 在途净占用 = RESERVED + PENDING_CLEANUP（含认领字节），终态不计入 |

旧 `deleteDocumentsAndReleaseStorage` / `releaseStorageForDeletedDocuments` / `persistOrphanCleanupLead` 已删除（被认领协议取代，无残留调用）。

## 三、J-RELEASE：物理未清理，占用不先释放（容量不变量）

1. **不变量恢复（§一.1）**：释放只发生在物理对象确认删除/不存在之后的终结事务中。物理失败 → 记录保留 + 占用保持计量 + 认领 PENDING_CLEANUP。测试：r0j3 A1（限额 30 → 删除失败 → 占用仍 30 → 再上传 30 被 EXCEEDED 拒绝 → 重试清理 → 释放一次 → 再上传成功）。
2. **认领先持久（§一.2/§一.3）**：`claimObjectCleanup` 在任何破坏性步骤之前持久化恢复事实（对象定位/真实字节/主体/空间/状态；确定性 opId `del-{wsId}-{归一键}` 幂等）。认领写失败 → 抛 `STORAGE_CLAIM_FAILED 500` 中止删除——记录/文件/占用全保留，不允许"元数据与计量消失但文件仍在"（r0j3 A2）。删除逻辑行可以先发生，但认领事实已先行持久。
3. **同事务终结（§一.2/§三）**：`finalizeObjectCleanup` = 同一事务 { 条件扣减（used≥bytes，漂移回滚）+ 认领状态 PENDING_CLEANUP→RELEASED（count≠1 → 回滚防并发双释放）}。重复终结 → 扣减不命中（drift）零重复扣减（r0j2 D2、r0j3 D1 重试恢复）。
4. **并发让位**：删行 count=0（并发后到者）→ `closeClaimWithoutRelease`（CANCELLED 终态 + note）；CANCELLED 认领被同对象后续删除自动重开（r0j3 E 歧义用例、r0j2 D1）。
5. **别名一致身份（§一.5）**：`objectPathAliases`（原始值/归一键/assets/ 前缀/uploads/assets/ 前缀）+ `countOtherReferences`（`filePath in 别名集`）。`assets/w1/shared` 与 `w1/shared` 同对象识别（r0j2 D1、r0j3 D2 共享保留 2 个引用）。存在保留引用 → 不删对象、不释放占用、认领 CANCELLED（对账不再当在途）。
6. **用户结果对齐（§一.6）**：batch_delete/batch_remove 响应带 `cleanupPendingIds`/`sharedRetainedIds`；物理失败计入 failed（记录+占用保留，可重试），不再计入成功。两处回调新增待清理/共享保留 warning（含"占用保持计量，可重试"），原 200/207/403/500 列表行为不回归（`verify-r0j3-ui-callbacks.cjs` 2 回调 × 6 态 = 12 场景 exit 0）。

## 四、J-UPLOAD：可定位、可恢复、可终结的失败协议

1. **saveAttempted 前置 + 对象键预绑定（§二.1）**：`allocateObjectKey` 在外部写入前分配键，`bindOperationObjectKey` 把键持久关联操作（RESERVED + filePath）——丢失响应后可凭操作定位具体对象，不再依赖 saveAssetFile 私自随机命名。`saveAttempted = true` 在 `saveAssetFileToKey` 之前。
2. **未知结果稳定待核实（§二.2）**：保存开始后失败 → 按预绑定键实际核实/清理：对象确认不存在 → 原子释放 + 终态；对象未确认清理（仍在/歧义/删除失败）→ `STORAGE_OP_PENDING`（响应含 opId + filePath）+ 占用保留 + op PENDING_CLEANUP（r0j3 C1：写入产生对象 + 清理失败 → 操作持有可定位对象、bytes=8、占用保留、无资料行）。
3. **终态一致性（§二.3）**：清理完成即 `releaseReservationAtomic`（同一事务 { 条件扣减 + RESERVED→RELEASED }）——不再遗留"已清理却仍 RESERVED"（对账 inFlight 与实际一致）。重放已释放操作 → OP_CONFLICT 409（明确状态，不重建对象、不重复释放）。
4. **确认失败 + 文档清理失败（§二.4）**：确认失败 → 条件删残留文档行；行删除失败 → 保留文档/文件/占用 + op PENDING_CLEANUP + `STORAGE_CLEANUP_PENDING` 500——不再 `.catch(()=>{})` 后删除文件释放占用留下 APPROVED 空壳（r0j3 C2：APPROVED 文档仍在、文件在、占用在、响应用户可见为失败）。
5. **delegate 未就绪（§二.5）**：`ensureOpModel`（delegate 缺失 → 503 NOT_READY）用于 findStorageOp/updateStorageOpStatus/reserveAtomic.create/claimObjectCleanup——不再 undefined.findUnique → TypeError 500（r0j3 B3：预留/认领零副作用）。
6. **P2002 同口径核验（§二.6）**：`classifyExistingOp` 统一普通重放与并发分支的空间/操作者/字节/状态核验——不同主体重放 → OP_CONFLICT（r0j3 B2）。
7. **保留项回归**：正常确认、0 字节（op bytes=0 CONFIRMED）、JSON 文本不伪造字节、单次授权后解析、父条目空间校验、原子预留——r0j/r0j2 既有用例全绿。

## 五、J-CLEAR：认领、终态与额度不能断开

1. **恢复重试段**：清空开始时处理该空间 PENDING_CLEANUP 释放认领（物理核实/再删除 → 终结）——上次提交故障的对象重试可完成且不重复扣减（r0j3 D1：提交故障 → 认领持久含定位与字节、占用保持 30 → 重试 pendingRecovered=1 → 占用 0 → 认领 RELEASED）。
2. **同事务终结**：逐对象 条件删行认领 → `finalizeObjectCleanup`（扣减+终态原子）；漂移/提交失败 → 认领保持待清理（占用保留、最后元数据不丢——认领先于破坏性步骤持久化）。
3. **共享保留如实提示（§三）**：只有无任何失败/漂移/共享保留/待处理时才返回"纯净出厂状态"；有保留时 message 明确列出各项数量（r0j3 D2：sharedRefKept=2 → message 含"共享引用保留"、不含"纯净出厂状态"）。
4. **保留项回归**：失败对象保留记录/文件/计量、扫描后新上传完整保留（r0j2 E 组既有用例全绿）；非存储段（任务/组件/默认初始化/审计/授权/确认文本）零改动。

## 六、J-KEYS：剩余边界实际实现

1. **多候选歧义拒绝（§四）**：`deleteAssetFile` 删除前探测全部候选位置（归一位置 + 历史 assets/ 位置），≥2 存在 → `{ ok:false, ambiguous:true }`，不删第一个、不擅删全部（r0j3 E1：双候选并存 → 拒绝且两候选原样保留；单候选正常删除回归）。
2. **根/空间越界拒绝（§四）**：`toObjectKey` 任何位置的 `..`/`.` 穿越段一律抛 `ObjectPathEscapeError`（不再只剥开头 ../）；`resolveAssetAbsolute` 根级兜底（解析结果必须仍在存储根内）；`assertObjectKeyInWorkspace` 归一键首段必须等于授权空间；读取（两个路由传 `doc.workspaceId`）/删除（各入口传空间）/保存（`saveAssetFileToKey` 传空间）全部生效（r0j3 E2：`w1/../../outside.txt` 拒绝、`w2/…` 对 w1 拒绝、合法键分配→落盘→读取→删除契约回归）。
3. **保留项**：S3 同键（PUT/GET/DELETE 同 `assets/{归一}`）、单一历史位置读删、大小写敏感身份——r0j S04/r0j2 F 既有用例回归；不迁移/不清理真实历史文件。

## 七、验证证据

```text
npx vitest run --no-color src/app/api/__tests__/r0j3-recovery-close.test.ts
→ 12 tests passed, exit 0（§五表格场景正向验收）

15 文件定向回归（14 个明确 R0 文件 + r0j3，基线 463）：
→ 15 files, 476 tests passed, exit 0（基线 463 + 净增 13：r0j3 新 12 + r0j2 D 组重构 5 用例替换旧 4 用例）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

UI：node docs/reviews/R0-J3-fix-snapshot/verify-r0j3-ui-callbacks.cjs → 12 场景 PASS, exit 0
   node docs/reviews/R0-J2-fix-snapshot/verify-r0j2-ui-callbacks.cjs → 10 场景 PASS（回归）, exit 0
旧页面：R0-I verify-byok-pause-pages 3/3；R0-F verify-r0f-pages 10/10（均 exit 0）
```

夹具说明：r0j3 夹具与 schema 约束一致——storageoperation.opId 唯一约束（P2002，r0j 夹具本批补齐同款）、`$executeRaw` 真实条件求值（含 usage≥0 写边界）、事务按本事务写操作撤销日志回滚（并发对方已提交写不受影响）、提交故障注入、delegate 缺失模拟（`storageoperation` 属性返回 undefined）、按目标状态精确故障注入（仅 CONFIRMED 更新失败）、file-store 包装注入"写入后响应丢失/删除失败"。

## 八、诚实更正（§六要求）

1. **r0j2-cold-quote 名称更正**：R0-J2 报告/清单中 `r0j2-cold-quote.test.ts` 从未创建，实际新增文件为 `r0j2-storage-close.test.ts`（独立复核已确认）。本批不为补名字创建无用文件；R0-J2 起止哈希完整值见本报告 §一 与 `R0-J3-fix-snapshot/manifest.json`（R0-J2 结束态 = 本批开工态，完整副本可独立核对）。
2. **预检更正记录版本来源澄清**：已追加至 `docs/reviews/R0-J-preflight/verification-results.json` `correctionRecord.clarifications`——898c6e17 等哈希实为 R0-J 结束态（= R0-J1 开工态），并给出各批次开工/结束态的完整哈希链（R0-J1 结束 = R0-J2 开工 de7f954a…；R0-J2 结束 = R0-J3 开工 bd674807…），版本来源以各批 manifest + frozen-source 完整副本为唯一可核实依据。原字段与此前更正记录未改动。

## 九、数据影响与未验证项

- `storageoperation` 仍为 schema 离线草案（本批仅 status 注释增补 CANCELLED，模型/索引零改动）：上线前需迁移 + 客户端重新生成；未迁移前预留/认领均稳定 503 零副作用；孤儿线索无降级路径（认领失败即中止破坏性步骤，无"仅日志"状态）。
- 资金/点数/套餐额度零改动；本批未读写真实数据库、云桶、磁盘客户文件；未执行迁移/seed/部署/历史清理。
- 未验证：真实 MySQL 事务隔离/行锁/P2002 并发时序、真实 S3 SDK 歧义行为（S3 单键 DELETE 幂等，本地歧义拒绝不适用 S3 双候选）、浏览器 DOM（UI 为实际回调 AST/合成环境验证）、生产迁移后的真实恢复演练。

## 十、回滚说明

用 `docs/reviews/R0-J3-fix-snapshot/frozen-source/` 8 个副本覆盖对应文件；删除 `r0j3-recovery-close.test.ts`；恢复两处读取路由；即回到 R0-J3 开工态（= R0-J2 结束态，含独立审核确认的剩余缺陷——回滚前请对照 REVIEW.md）。schema 仅注释差异，无 DB 回滚需求。

**四组关闭，等独立审核；不进入 F14，不恢复收费或 BYOK，不宣称生产就绪。**
