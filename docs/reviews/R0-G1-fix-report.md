# R0-G1 修复报告：null 绑定候选保护 + STANDARD 配置缺失停止写入

**状态：R0-G1 待独立复核**（不进入下一批、不部署）

只修 R0-G 独立审核确认的两项：G-BINDING/P1（扫描时 quota 绑定为 null、写前变为非空时未被保护）与 G-CONFIG/P2（STANDARD 配置缺失时仍按写死 2 席继续降级）。R0-G 已通过的调度鉴权、余额保护、续费条件写、事务回滚及原维护审计全部保留。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-G1-fix-snapshot/manifest.json` + `frozen-source/`（2 文件修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T14:37:04+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | route `f8d44f6b…` / 测试 `3c289438…`（与 R0-G 结束哈希一致） |
| 结束 SHA256 | route `cffd87b9…` / 测试 `c0bf42c7…`（`after-hashes.json`） |

**修改差量**：route.ts（绑定条件 +1 行 where、配置校验块 +~14 行、注释）；测试 +12 用例 + harness 注入 failPlanRead。未触碰其他 cron/middleware/维护审计/支付/价格；历史报告/测试/快照/scratch 保留。

## 二、修复内容

### G-BINDING（null 也是候选事实）

套餐条件写边界 from `{ id, plan, planExpiresAt }` 扩为 **`{ id, plan, planExpiresAt, workspacequotaId: 候选绑定 }`**——null 与非空绑定同样参与等值匹配（Prisma 对可空列 `= null` 条件成立匹配 null 行）。绑定相对扫描发生任何变化（null→q2 / q1→q2 / q1→null）即 count=0 → `CANDIDATE_STATE_CHANGED` → 整体回滚、零提交、诚实跳过；外部已提交的新绑定保留。非空 quota 的归属校验与条件席位写原样保留；不是靠"一律拒绝无 quota 空间"实现（null→null 合法降级保留）。

### G-CONFIG（缺配置不能猜席位数）

凭证门禁之后、任何降级/席位写之前：读取 STANDARD 并校验 `maxMembers` 为**正安全整数**——行缺失、席位为 0/负数或读取失败 → **503 `STANDARD_PLAN_CONFIG_UNAVAILABLE`**（读取抛错走既有 500，均非成功），零降级/席位写，不自动建配置/seed/补默认值/换位置写死数字；有效实际值（4、7）精确使用。0/-1 等特殊值按"无法可靠取得席位配置"阻断并报告，不自行发明免费/无限席位语义。鉴权仍位于所有配置读取之前（未授权请求零 IO）。

## 三、K01 绑定矩阵（5 场景逐项真实 handler，扫描后写边界前注入）

| 场景 | downgraded | skipped | 空间事实 | quota 写 | 新绑定保留 |
|---|---|---|---|---|---|
| null→q2 | 0 | 1 | plan=PRO、期限/席位未变 | 旧新均零写 | ✅ q2=30席/余额10 未被触碰 |
| q1→q2 | 0 | 1 | 同上 | 旧(20/850)新(30/10)均零写 | ✅ |
| q1→null | 0 | 1 | plan=PRO、绑定 null 保留 | q1 零写 | ✅ |
| null→null（不变） | 1 | 0 | 降级 STANDARD、extraSeats=0 | 无 quota 写（合法路径） | — |
| q1→q1（不变） | 1 | 0 | 降级 STANDARD | q1 席位→2、余额 850 保持 | — |

期望值独立取自种子与事务后实际存储；夹具对 `workspacequotaId` 的 null 等值真实求值（未硬编码 count）。

## 四、K02—K05 逐项证据

- **K02**：STANDARD 行缺失 → 503 + 零 workspace/quota 写（IO 日志仅 workspaceplan.findUnique）；maxMembers=0/-1 → 503 同码零写；读取失败注入 → 500 非成功零写；4/7 席有效配置 → enterpriseSlots 精确等于配置值、余额 850 保持；未授权 + 无配置 → 401 且 IO 为空（门禁先于读库）。
- **K03**：R0-G 既有续费/换套餐/期限变化、quota 归属、并发恰好一次、重复请求、套餐写/quota 写/提交失败回滚、无 ROOT 写逃逸共 35 用例全部保持通过。
- **K04**：三环境缺/空/空白密钥 503 零 IO、错误 key/token/查询参数 401 零 IO；回收开关 5 种取值余额与来源资产保持、true 诚实 reclaimPaused——全部保持通过。
- **K05**：见下节命令。

## 五、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
→ 1 file, 47 tests passed, exit 0（35 既有 + 12 新增）

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts
→ 10 files, 363 tests passed, exit 0（351 既有 + 12 新增）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-G-independent-review/verify.cjs
→ exit 1（预期）：其 null→q2 反例断言 downgraded=1/skipped=0/plan=STANDARD（旧缺陷形态），
   修复后实际 skipped=1、零降级写，冻结断言不再成立。该脚本与 verification.json 零改动。
```

均定向隔离运行、本地工具、合成环境值；零真实库读写/降级/配置/会话/审计操作、零迁移/seed/支付/模型/费用/部署；未读取或打印真实密钥；未全量测试。

## 六、数据影响与未验证项

- 零真实数据影响；本轮仅 route 防护逻辑与隔离测试。
- 未验证：真实 MySQL 可空列等值条件与行锁并发语义（内存为串行化模拟）；生产 STANDARD 配置巡检（本批选择诚实拒绝而非补配置，运维需保证 STANDARD 行存在且席位数有效）；其他 cron 与全站实时权益体系不变、未验证。
- 设计说明（如实）：`maxMembers ≤ 0`（含 -1）按"不可靠配置"阻断而非赋予商业语义——若产品确认免费版可为 0/无限席位，需另行授权后调整该判断。

## 七、回滚说明

用 `docs/reviews/R0-G1-fix-snapshot/frozen-source/` 两个副本覆盖对应文件即回到 R0-G 结束状态；无 schema/DDL 依赖。

**K01—K05 通过即停止交回；不进入下一批、不修其他 cron、不做一般优化。**
