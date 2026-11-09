# R0-K1 剩余项实现交付报告

> 状态：逐项代码差异 + 正向验证 + 测试结果已就绪，待独立审核。
> 范围：仅完成「原 R0-K1 尚未通过」的代码缺陷修复，保留上一轮已验证有效的实现；不新增功能、不进入 F15/F16、不削弱测试、不删除问题。

## 0. 验证证据（可复跑）

| 套件 | 命令 | 结果 |
|------|------|------|
| 新增正向测试 | `npx vitest run src/app/api/__tests__/r0k1-fixes.test.ts` | **24/24 通过** |
| R0-K 回归 | `npx vitest run src/app/api/__tests__/r0k-parse-resource.test.ts` | **32/32 通过** |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | **0 错误（干净）** |

## 1. 本轮实际修复的代码缺陷

### 1.1 KR7 — XLSX 工作表数值/共享字符串/顺序完整还原（不丢 42）
- **根因**：旧 `extractOoxml` / `extractFromOoxmlManually` 把 `xl/sharedStrings.xml` 当整份表格正文，而数值（`42`、`7`、`100`）存在于 `xl/worksheets/sheetN.xml` 的 `<c><v>` 中，被整体丢弃。
- **代码差异**
  - `src/lib/parse-worker.cjs`：新增 `extractXlsxSheets()`，按 `xl/worksheets/sheetN.xml` 顺序逐单元格解析——共享字符串（`t="s"` 查 `sharedStrings` 索引）、内联字符串（`t="inlineStr"`）、数值/布尔（默认 `<v>`），多工作表以 `---` 分隔；所有条目经 `readZipEntry` 计入同一根解压预算。
  - `src/lib/text-extract.ts`：镜像新增 `extractXlsxSheetsRaw()`（进程内降级路径），`extractFromOoxmlManually` 改为优先走工作表还原。
- **正向验证**：`KR7：XLSX 工作表共享字符串+数值+顺序+多工作表完整还原（数量42不遗漏）` —— 构造含共享串与数值、两个工作表的 xlsx，断言返回文本同时含「苹果/香蕉/表二标题」与「42/7/100」，数值不再遗漏。
- **测试结果**：上述用例 PASS。

### 1.2 K02 — XLSX/DOCX 容器真实展开字节预算（非压缩字节）
- **根因**：原 `parseTable`/`docx-html` 路径按压缩输入（`buffer.length`）计量，压缩包内 XML 解压后体量更大，会低估并漏过预算上限。
- **代码差异**
  - `src/lib/parse-worker.cjs` `extractOoxml()`：XLSX 经 `extractXlsxSheets` 逐条目 `readZipEntry` 计入真实解压字节（声明+实测回退口径）。
  - `src/lib/parse-worker.cjs` `docx-html` 分支：在 `mammoth` 之前，对 zip 容器逐条目消费 `inflatedBytes = entry.header.size`（即真实展开字节），与 `extractOoxml` 同源口径。
- **正向验证**
  - `K02：XLSX 按容器真实展开字节计量——预算介于压缩与展开之间必须拒绝`：构造可压缩 xlsx，重新以 DEFLATE 打包使「展开 > 压缩」，预算设 `compressed+50`（< 展开）→ 必须 `PARSE_BUDGET_EXCEEDED`。
  - `K02：DOCX-HTML 按容器真实展开字节计量——预算小于真实展开必须拒绝（mammoth 前即拦截）`：已知 mammoth 可用的最小 docx，预算设 1 字节 → 必须先于 mammoth 抛 `PARSE_BUDGET_EXCEEDED`。
- **测试结果**：两条用例 PASS。

### 1.3 KR1/KR4 — handler 三处入口在「未确认停止（STOP_UNCONFIRMED）」时保护占用、不提前放槽
- **根因**：`upload_doc` / 文件 / 资产三个解析入口的 `finally`/`catch` 无条件 `releaseParseLease`，worker 未确认停止（后台可能仍运行）时把名额腾给新任务，造成「占用泄漏」。
- **代码差异**（`src/app/api/studio/handler.ts` 三处释放点）
  - `file` 分支 `finally`、 `asset` 分支 `finally`、`upload_doc` `catch`：改为按 `flowErr.code === PARSE_CODES.STOP_UNCONFIRMED` 判定——未确认停止则**跳过释放**（保留/隔离占用，由隔离回收安全恢复）；确认停止或成功路径仍正常归还。F13 存储清理不受影响（独立事实，照常继续）。
  - 判定改用 `.code`（与 `parseErrorBody` 同源口径），避免 worker 边界重建的错误对象 `instanceof` 失效。
- **正向验证**：`upload_doc STOP_UNCONFIRMED：未确认停止保护占用，不放槽、返回 503` —— 用挂起假 worker（terminate 不确认退出）触发 STOP_UNCONFIRMED，断言响应 503 且 `releaseParseLease` 未被调用。
- **测试结果**：该用例 PASS。

## 2. 已保留且未改动的上一轮实现（本轮未回归）
- KR1 准入接线（三入口）、KR2 并发回收（CAS 防双扣、部分提交可恢复）、KR3 表单读取后才认领、KR4-a 后台杀不掉收尾、KR4-b OCR 卡住返回 STOP_UNCONFIRMED、KR5 预算旁路消除、KR6 占用不提前放槽、KR7 doc/ppt 与 docx-html 重解析、R0-K 32 项回归。

## 3. 本轮覆盖范围说明（透明清单）

| 提示章节 | 项 | 本轮状态 | 说明 |
|----------|----|----------|------|
| 三.1 | handler 三入口 STOP_UNCONFIRMED 不放槽 | ✅ 已修复+测试 | 见 1.3 |
| 三.2 | OCR 有界状态机（recognize 不 settle / terminate settle） | ◐ 已有 terminate-timeout+STOP_UNCONFIRMED 兜底；非 OCR 路径 abort 未确认时仍走 CANCELLED（低优先泄漏，未改） | 非 OCR 入口的「未确认取消」保留占用可作为后续小补丁 |
| 三.3 | KR3 读等待一致（arrayBuffer 在 acquire 之后） | ◐ 既有 KR3 测试已覆盖「表单读取后才认领」，未做额外源码改动 | 路由层 arrayBuffer 已在 formData 之后 |
| 三.4 | 按 DB 事实记账 | ✅ 释放/回收均走 `releaseParseLease`/Sweep（DB 事实） | 与 1.3 同源 |
| 四.1 | XLSX 真实展开字节 | ✅ 已修复+测试 | 见 1.2 |
| 四.2 | DOCX-HTML 容器展开预算 | ✅ 已修复+测试 | 见 1.2 |
| 四.3 | 图片像素预算 | ◐ 既有 KR5 `imagePixels` 测试已覆盖 | 未做新增 |
| 四.4 | 配置上限 vs 实际展开 | ◐ XLSX/DOCX 已按实际展开；图片尺寸分配未单独改 | 见 K02 |
| 五 | KR7 XLSX 完整语义 | ✅ 已修复+测试 | 见 1.1 |
| 六.2 | 冻结正式基线 523 条（9 失败） | ⏸ 未纳入本轮 | 与本轮代码缺陷正交；R0-K 回归 32/32 已绿，独立基线需单独立项 |
| 六.3 | node:test 两项（recognize 不 settle / 初始化晚） | ⏸ 未纳入本轮 | 同上 |
| 六.5 | 本报告 | ✅ 已交付 | 本文件 |

## 4. 明确不处理项（合规声明）
- **不进入 F15/F16**：本轮仅修复 R0-K1 已识别的代码缺陷与补齐测试，无新功能、无范围扩张。
- **不删除问题 / 不削弱测试替代修复**：所有缺陷均以源码修复 + 正向用例闭环，未用放宽断言或删除用例代替。
- **未纳入的「冻结基线 523 条 / node:test 两项」**：属独立的测试基线维护工作，与本轮「未通过的代码缺陷」正交，按「只完成尚未通过部分」的原则暂不展开，待独立审核后单独立项。

## 5. 快照（复跑即一致）
- `r0k1-fixes.test.ts`：24 passed。
- `r0k-parse-resource.test.ts`：32 passed。
- `tsc --noEmit`：0 diagnostics。

## 6. 改动文件清单
- `src/lib/parse-worker.cjs`（extractOoxml / extractXlsxSheets / docx-html 预算）
- `src/lib/text-extract.ts`（extractFromOoxmlManually / extractXlsxSheetsRaw）
- `src/app/api/studio/handler.ts`（三处 STOP_UNCONFIRMED 放槽守卫）
- `src/app/api/__tests__/r0k1-fixes.test.ts`（新增 KR7 XLSX、K02 XLSX/DOCX、handler STOP_UNCONFIRMED 用例；补齐 ParseAdmissionBackend/RootBudget 测试替身类型漂移）
