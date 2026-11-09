# R0-F2 修复报告：审计变更事实准确性（原 F-AUDIT 残留）

**状态：R0-F2 待独立复核**（不进入 F10、不部署）

只修 R0-F1 独立审核指出的一项残留的两个表现：① 正文等字段已修改但日志空 diff/changed=false；② 全部相同的重复同步仍 changed=true。权限、GET 只读、事务、实际生成 ID、提交后缓存行为全部保留。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-F2-fix-snapshot/manifest.json` + `frozen-source/`（3 文件修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T13:46:01+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | route `c7e4b71f…` / maintenance.ts `9ec33aaf…` / 测试 `d67ee7b4…`（与 R0-F1 结束哈希一致） |
| 结束 SHA256 | route `c2584eea…` / maintenance.ts `9ec33aaf…`（未改动）/ 测试 `2d187df7…`（`after-hashes.json`） |

**修改差量**：仅 `route.ts`（事实提取/差异比较/同步事实）与测试文件（+26 用例）；`maintenance.ts` 零改动。未触碰其他文件，未覆盖他人未提交修改，历史报告/快照/测试/scratch 保留。

## 二、修复内容

1. **事实提取覆盖全部既有业务字段**（route.ts）：
   - `scheduleFacts`：title、type、status、isDowntime、startTime、endTime、manager、scope、description、actualResult（原来缺后 4 个 → 空 diff 缺陷根源）；
   - `releaseFacts`：version、title、type、publishDate、isPublished、author、items（原来缺 author/items）；
   - `normFact`：undefined 统一为 null，避免序列化丢键造成前后形态不一致。
2. **内容级比较**：新增 `auditValuesEqual`（数组/对象按实际 JSON 内容含顺序递归比较，不再用 `!==` 引用比较）——同内容新数组视为未变，正文变化记录原值/新值。`hasActualChange` 与两处 update diff 循环均改用该比较。
3. **同步 changed 综合计算**：删除固定 `fact.changed = true`；改为 `计划 diff 非空 || 模式变化 || 实际写入说明变化`。旧说明在**写入前**于同一事务读取（修复过程中自查发现并修正了一处"写后读"错误顺序）；IN_PROGRESS 时事实含 `maintenanceMessageBefore/After/Written`。创建/删除的目标 ID 与必要事实保持不变。

未新增表/迁移/审计框架/日志展示；不记录 token、会话原值、密钥。

## 三、字段覆盖矩阵（H01/H02，每字段独立单改用例）

| 计划字段 | 用例 | | 公告字段 | 用例 |
|---|---|---|---|---|
| title | ✅ 单改 | | version | ✅ 单改 |
| type | ✅ 单改 | | title | ✅ 单改 |
| status | ✅ 单改 | | type | ✅ 单改 |
| isDowntime | ✅ 单改 | | publishDate | ✅ 单改 |
| startTime | ✅ 单改 | | isPublished | ✅ 单改 |
| endTime | ✅ 单改 | | author | ✅ 单改（原缺陷） |
| manager | ✅ 单改（原缺陷） | | items | ✅ 单改（原缺陷，内容级比较） |
| scope | ✅ 单改（原缺陷） | | | |
| description | ✅ 单改（原缺陷） | | | |
| actualResult | ✅ 单改（原缺陷） | | | |

每个用例：从独立种子常量（`FULL_SCHEDULE`/`FULL_RELEASE`）出发只改该字段，断言 `changed=true`、`before[field]` 等于种子旧值、`after[field]` 等于新值、**diff 键恰为该字段**、事务后实际存储与日志一致。期望值独立于被测事实提取函数。

## 四、H01—H06 逐项证据

- **H01**：7 个公告字段逐字段单改全过（含 items 正文数组变化记录原数组/新数组、author 前后）；create/delete 目标事实不退化（实际生成 ID、原目标 items 事实）。
- **H02**：10 个计划字段逐字段单改全过（含 manager/scope/description/actualResult 四个原缺陷字段），各自 before/after 准确、diff 不含其他字段；实际生成 ID 保持。
- **H03**：同内容新数组 items → changed=false、无 items diff；计划 10 字段全同重复提交 → changed=false、空 diff；**计划/模式/说明全同的重复同步（两轮：首轮真实变化 changed=true，次轮全同 changed=false）**；设置重复提交回归确认。
- **H04**：仅模式改变（计划/说明全同）→ changed=true、计划 diff 空、模式 false→true；仅实际说明改变（计划/模式全同、旧说明为自定义值）→ changed=true、`maintenanceMessageBefore="管理员自定义的旧说明"`（事务内真实旧值）→ After 为实际写入说明；计划+模式同时变 → 计划 diff 与模式前后均准确；关闭方向（COMPLETED 同步）模式 true→false 准确；双权限（u_both）保持。
- **H05**：G04 既有故障组保持（配置中途失败/清会话后审计失败/提交失败均完整回滚、双方向缓存原状态、无 ROOT 写逃逸）；F01—F04 权限与 GET 只读组保持通过。
- **H06**：见下节命令与退出码。

## 五、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
→ 1 file, 63 tests passed, exit 0（37 既有 + 26 新增）

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
→ 9 files, 316 tests passed, exit 0（290 既有 + 26 新增）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
→ 10/10 checks passed, exit 0

node docs/reviews/R0-F1-independent-review/verify.cjs
→ exit 1（预期）：其第 45 行断言"内容已修改却 changed=false 且 before/after 为空"（旧缺陷形态），
   修复后实际得到真实 before/after 与 changed=true，冻结断言不再成立。脚本零改动。
```

均定向隔离运行、本地工具；零真实库/配置/会话/审计操作、零迁移/seed/支付/模型/费用/部署；未全量测试。

## 六、数据影响与未验证项

- 本批零真实库读写、零业务配置变化；测试全内存隔离。
- 未验证：真实 MySQL 事务/回滚语义、线上角色授权、浏览器 DOM；审计 details 展示端 UI 适配（details 为增量扩展，未发现读取端依赖旧空形态）。
- 修复过程自查记录：同步说明旧值读取最初误置于写入之后，已在实现中修正为写入前读取（测试"仅说明改变"覆盖该顺序）。

## 七、回滚说明

用 `docs/reviews/R0-F2-fix-snapshot/frozen-source/` 的 route.ts 与测试副本覆盖对应文件即可精确回到 R0-F1 结束状态；`maintenance.ts` 本批未改动；无 schema/DDL 依赖。

**H01—H06 通过即停止交回；不进入 F10，不做额外优化。**
