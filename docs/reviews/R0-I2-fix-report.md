# R0-I2 修复报告：默认报价链路只读传递（I-GET-DDL-DEFAULT 收口）

**状态：R0-I2 待独立复核**（不进入 F13、不部署）

只修 R0-I1 独立审核唯一残留：GET `/api/billing/estimate` 在省略 deploymentId、auto 或个人默认命中 BYOK 时冷启动仍尝试 ALTER TABLE。已通过的月度额度顺序、管理员口径、F11 成本准入全部保持冻结。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-I2-fix-snapshot/`（after-hashes.json + manifest.json + archive-verification.json + reconstruct-log.json + frozen-source/ 四个起点副本） |
| 真实生成时间 | `2026-11-07`（manifest.capturedAtReal 为**归档补交时真实生成时间**；原开工快照缺失，起点副本为审核后重建 RECOVERED_AFTER_REVIEW，非开工时原始采集，不倒填开工时间） |
| 开始 → 结束 SHA256 | estimate 路由 `cf0d741a… → c141d5c3…`；model-registry `b87c9127… → 7f4d9ae1…`；workspace-byo-model `eb4648b2… → fa18f041…`；r0h 测试 `812f67f8… → c1a9f49f…`；r0i2 冷启动测试（本批新增）`ef86ca83…` |

**修改差量（最小链路）**：
1. `workspace-byo-model.ts`：`tryResolveWorkspaceByoDefault` 增加可选 `opts?: { readOnly?: boolean }`，传递给 `ensureByoShareWithMembersColumn({ readOnly })`；
2. `model-registry.ts`：`resolveDefaultDeployment` 增加可选 `readOnlyResolution?: boolean`，BYO 默认分支传递给 `tryResolveWorkspaceByoDefault`；
3. `estimate/route.ts`：默认/auto 分支调用 `resolveDefaultDeployment` 时**由服务端强制传入** `readOnlyResolution: true`（客户端不可关闭）；
4. 新增 `src/app/api/__tests__/r0i2-cold-quote.test.ts`（11 用例）；r0h 测试修正写 SQL 断言（K03）。

非报价调用方（Studio 执行、绑定保存等）未传该参数 → 保持原热补全语义，零改动。

## 二、只读传递链（完整）

```text
GET /api/billing/estimate
  ├─ 显式 deploymentId → resolveDeploymentForWorkspace({ readOnlyResolution: true })
  │                        → ensureByoShareWithMembersColumn({ readOnly: true }) → SELECT 探针
  └─ 省略 / auto → resolveDefaultDeployment({ readOnlyResolution: true })   ← [R0-I2 补齐]
                        → tryResolveWorkspaceByoDefault({ readOnly: true }) ← [R0-I2 补齐]
                              → ensureByoShareWithMembersColumn({ readOnly: true }) → SELECT 探针
```

- 只读模式：`SELECT shareWithMembers FROM workspace_byo_model LIMIT 1` 探针验证列就绪；列缺失 → 抛 `BYO_SHARE_COLUMN_NOT_READY`（code+status 503）→ estimate 路由按既有错误体系返回稳定 503。**不在读请求中 ALTER/补数据/迁移**，也不吞掉该错误后改用另一个模型报价。
- 参数由服务端在路由内硬编码传入，客户端无法关闭；模型来源判断完全来自服务端解析（`loadSpaceModelPolicy` + 个人偏好 + BYO 注册行），未把判断来源交给客户端。
- 保留原有优先级与门禁：个人偏好（含历史 "byo" 偏好值规范化）→ 空间默认 → BYO 共享权限/私有归属/能力覆盖检查 → `resolveActivePricingAt` 等既有逻辑零改动；不靠跳过 BYOK 或固定平台模型绕开问题。

## 三、K01：四条路径独立冷启动只读证据（真实 GET + 真实解析器 + 真实 BYO 辅助）

| 路径 | HTTP | 业务结果 | DDL/DML 尝试 | ORM 写 |
|---|---|---|---|---|
| 显式 `deploymentId=byo:w1` | 200 | blocked=true, canExecute=false, points/yuan=null, 稳定码 | **0** | **0** |
| 省略 deploymentId（空间默认 BYOK） | 200 | 同上 | **0** | **0** |
| `deploymentId=auto`（空间默认 BYOK） | 200 | 同上 | **0** | **0** |
| 个人默认 BYOK（历史 "byo" 偏好，空间默认平台） | 200 | 同上 | **0** | **0** |
| 个人默认 BYOK（"byo:w1" 偏好） | 200 | 同上 | **0** | **0** |

**冷启动机制**：每条路径独立模块上下文——`vi.resetModules()` + 动态 `import()`，`workspace-byo-model` 的 `_byoShareColumnChecked` 在每个用例全新为 false，探测/ALTER 分支均真实执行（不是同文件顺序预热后的假通过）。raw 记录非空（断言真实走到了 raw 层）且包含 shareWithMembers 查询。

## 四、K02：缺列诚实拒绝

shareWithMembers 列缺失（探针失败注入）在**显式、省略、auto、个人默认**四条路径分别冷启动：全部 503 `BYO_SHARE_COLUMN_NOT_READY`，零 DDL/DML、零模型调用/扣费。正常平台模型报价（空间默认 dep-1，真实解析 modeldeployment/modelprovider/密钥解密 IO 夹具）保持 200 `points=100`，未被一律拒绝。

## 五、K03：写尝试断言修正 + 自检

- **根因**：夹具记录形如 `EXEC ALTER TABLE …` / `QUERY SELECT …`，旧断言 `startsWith("ALTER")` 永不匹配 → 无法识别写尝试。
- **修正**：新增 `isRawWriteAttempt(record)` 按 `EXEC/QUERY` 前缀 + SQL 关键字分类（EXEC 通道即写通道）；r0h 测试两处断言与 r0i2 全部断言改用该函数。
- **自检**：①模块加载时注入两条 fixture 断言（`EXEC ALTER …` 必须识别为写、`QUERY SELECT` 不误判），识别失败即整文件失败；②`r0i2` 文件内含受控失败演示用例（`isRawWriteAttempt("EXEC ALTER …")` 必须为 true）。若解析器或调用方注入写调用，这些断言立即失败。
- 旧独立审核目录的缺陷复现测试（3 项期望写尝试=1）**零改动**，保持旧证据原貌。

## 六、K04：定向回归与类型检查

```text
npx vitest run --no-color src/app/api/__tests__/r0i2-cold-quote.test.ts
→ 1 file, 11 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
  src/app/api/__tests__/r0f-maintenance-readonly.test.ts src/app/api/__tests__/r0e-production-mock.test.ts
  src/app/api/__tests__/r0d-refund-approval.test.ts src/app/api/__tests__/r0c-pool-recycle.test.ts
  src/app/api/__tests__/r0b-seat-addon.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts
  src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a3-combo-regression.test.ts
  src/app/api/__tests__/r0a4-combo-regression.test.ts src/app/api/__tests__/r0i2-cold-quote.test.ts
→ 12 files, 407 tests passed, exit 0（396 基线 + 冷启动 11，R0-H/I 断言无一削弱）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

页面脚本（UI 零改动，引用同版本哈希旧证据重跑确认）：
node docs/reviews/R0-I-fix-snapshot/verify-byok-pause-pages.cjs → 3/3, exit 0
node docs/reviews/R0-I1-fix-snapshot/verify-admin-copy.cjs → 4/4, exit 0
node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs → 10/10, exit 0
```

零真实数据库/迁移/seed/密钥/模型/连接测试/支付/退款/补账/清理/部署；未全量测试；未花钱跑模型。

## 七、数据影响与未验证项

- 零真实数据操作。行为影响：默认命中 BYOK 的报价请求与显式 BYOK 一致严格只读；若部署库缺 shareWithMembers 列，所有 BYOK 报价路径均 503 诚实拒绝（运维需完成迁移使列就绪）——这是止损语义的预期结果。
- 未验证：真实 MySQL 探针/锁行为、真实供应商分词、浏览器 DOM、其他入口（refine-prompt/连接测试）的只读性——如实列明，不在本批范围。
- 名义点数预算 ≠ 现金收入；BYOK 恢复仍待负责人商业授权。

## 八、回滚说明（已更正，指向实际存在的副本）

原报告声称的 manifest.json、capturedAtReal 与四个起点副本当时**并不存在**（快照目录仅有 after-hashes.json），本批已按审核建议以独立核验的内存逆向补建（RECOVERED_AFTER_REVIEW，逐副本 SHA256 匹配 startHashReferences）：

- 四个起点副本（审核后重建，非原始采集）实际存在于 `docs/reviews/R0-I2-fix-snapshot/frozen-source/`，逐一匹配 `manifest-verification.json`（R0-I2 独立审核目录）的 startHashReferences（estimate `cf0d741a…`、model-registry `b87c9127…`、workspace-byo-model `eb4648b2…`、r0h 测试 `812f67f8…`），核验结果见 `archive-verification.json`（allChecksPassed=true）。
- **只准备了离线恢复材料，未执行真实回滚**：如需回到 R0-I1 结束状态，用上述四个副本覆盖对应 src 文件、删除本批新增的 `r0i2-cold-quote.test.ts` 即可（r0i2 测试为本批新增、无起点副本）；无 schema/DDL/环境变量依赖。
- 当前五个交付源码结束哈希经归档脚本再次核验未变。
- K05 归档核验结果（`archive-verification.json`）：四个副本 MATCH（可读、SHA256 与 startHashReferences 完全一致）；五个交付源码 UNCHANGED；K03 自检（`EXEC ALTER …` 夹具记录识别为写尝试、`QUERY SELECT` 不误判）通过；407 项回归 / 10 项独立冷启动 / 类型检查证据按源码未变直接引用本批实测（12 files / 407 tests, exit 0；tsc exit 0）。

**功能独立审核通过（I-GET-DDL-DEFAULT 关闭），归档已补交待核对；等待核对确认，不自行宣布验收完成，不进入 F13。**
