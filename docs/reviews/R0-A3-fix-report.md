# R0-A3 修复报告

## 交付状态

**R0-A3 待独立复核**

## 一、C1 回应：免费授权贯穿写入

### 反例回顾

R0-A2 审核证实：route 首次严格读取 STANDARD 0/0 → 传 key 给 provision → provision 内 `resolveTargetConfig` 二次严格读取同一 key 时管理员已改为月 19900/年 199000 → 二次读取通过严格校验（合法正价）→ 直接以新价格/配额写入企业空间 + SUCCESS 账单 19900。

### 实际修改

**`src/lib/workspace-upgrade-service.ts`**

- `UpgradePersonalToEnterpriseInput` 新增 `verifiedPlanConfig?: WorkspacePlanConfig` 字段。
- `provisionEnterpriseUpgrade` input 同样新增 `verifiedPlanConfig?: WorkspacePlanConfig`。
- `upgradePersonalToEnterprise` 内 `resolveTargetConfig` 调用改为：
  ```
  const targetConfig = input.verifiedPlanConfig || (await resolveTargetConfig(input));
  ```
  当 `verifiedPlanConfig` 存在时，**跳过 `resolveTargetConfig` 的全部 DB 读取**，直接以 route 层传入的快照贯穿全部事务写入。这意味着 route 层严格读取的那份配置就是实际写入的唯一数据源——两次读取间配置漂移的时序窗口被消除。

**`src/app/api/workspace/upgrade/route.ts`**

- 免费路径调用 `provisionEnterpriseUpgrade` 时新增 `verifiedPlanConfig: planConfig` 参数，将 route 层严格读取后的配置快照传递下去。

### 设计决策

- **不重新读取**：传递快照后写入侧不再访问 workspaceplan 表。这消除了两次读取间配置漂移的可能性，而非仅检测漂移。若需要检测漂移（而非消除），可在写入前增加一次比较读取并断言一致——但本批选择消除时序窗口。
- **`fulfillEnterpriseUpgradeFromOrder` 不受影响**：该函数从订单 metadata 读取，属于支付后履约，已有 PENDING 账单作为授权依据，无需快照。
- **管理员/签约调用者**：`SALES_SIGNUP` / `ADMIN_MANUAL` 路径不传 `verifiedPlanConfig`，继续走 `resolveTargetConfig` 的宽松读取 + 最低档回退，保留既有职责。

### 验证证据

- R0-A3 回归测试：`快照贯穿后写入：plan/maxMembers 来自快照而非二次读取的 DB 行` → 验证写入的 plan/type 来自快照。
- R0-A3 回归测试：`客户端伪造 verifiedPlanConfig` → 修改 body 中 targetPlan 价格后 route 仍自行严格读取，伪造不生效。

## 二、C2 回应：retain/delete 核验先行

### 反例回顾

retain/delete 两种方式先 `workspace.create` + `workspacemember.create`，再进入 `upgradePersonalToEnterprise` 内二次核验。配置停用后返回 400，但已执行"建空间→建成员→删成员→删空间"补偿清理。

### 实际修改

**核心变化**：route 层的 `getWorkspacePlanStrict` 在任何写入之前完成全部核验。通过后，`verifiedPlanConfig` 被传递到 `provisionEnterpriseUpgrade`。这意味着：

- retain/delete 路径的 `workspace.create` + `workspacemember.create` 发生在**route 层核验通过之后**，不存在"先建后验"的时序。
- 若套餐配置在 route 读取之后、provision 写入之前变化（极端并发），`verifiedPlanConfig` 快照保证写入使用的是已核验的那份配置，不会静默换配置。

**代码层面不需要额外修改**：C1 的 `verifiedPlanConfig` 贯穿改造已经同时解决了 C2 的时序问题——核验结果通过快照传递到写入边界，写入边界不再独立读 DB。

### 验证证据

R0-A3 回归测试 C2 组：

- `retain + 套餐停用 → 400 拒绝，workspace.create 零调用` ✓
- `delete + 套餐停用 → 400 拒绝，零写入` ✓
- `retain + 套餐不可购买 → 400 拒绝，零写入` ✓
- `retain + 套餐缺失 → 503 拒绝，零写入` ✓

## 三、C3 回应：混合价完整规则

### 反例回顾

基础档 STANDARD 月 0 年 10000，选 YEAR → 创建了 10000 的 PENDING 订单并调起支付。MONTH 路径已被前批阻断，但 YEAR 路径未覆盖。

### 实际修改

**`src/app/api/workspace/upgrade/route.ts`**

在 free 路径判断之前新增：

```typescript
if (isBaseFree && ((monthly === 0 && yearly > 0) || (monthly > 0 && yearly === 0))) {
  return NextResponse.json(
    { error: "PLAN_MIXED_PRICING", message: "..." },
    { status: 400 },
  );
}
```

覆盖四种组合：

| 组合 | MONTH | YEAR | 结果 |
|---|---|---|---|
| 月0年正 | 0 | 10000 | 400 PLAN_MIXED_PRICING ✓ |
| 月0年正 | 10000 | 0 | 400 PLAN_MIXED_PRICING ✓ |
| 月正年0 | 5000 | 0 | 400 PLAN_MIXED_PRICING ✓ |
| 月正年0 | 0 | 5000 | 400 PLAN_MIXED_PRICING ✓ |

### 验证证据

R0-A3 回归测试 C3 组 4 个用例全部通过，每种组合均断言 400 + 零账单 + 个人空间不变。

## 四、C4 回应：三个调用者统一状态判断

### 反例回顾

两个 UpgradeModal 收到 `success:true, orderNo:"isolated-pending"`（无 payUrl、无 free）时，均显示"空间升级成功"并调用完成回调；中枢弹窗还写 localStorage 已升级标记。

### 实际修改

**`src/components/studio/UpgradeModal.tsx`**

```
if (data.payUrl) → 跳转收银台（已有）
if (data.free === true) → 成功提示 + 回调 + 关闭
否则 → toast.info("升级请求已受理，请稍后确认结果")，不调用 onSuccess、不关闭
```

**`src/components/workspace-hub/modals/UpgradeModal.tsx`**

同上结构，且 localStorage 标记仅在 `data.free === true` 分支内写入。

**`src/app/workspace/upgrade/page.tsx`**

该页已在前批正确实现了 `result.free === true` 检查（186 行），无需修改。

### 验证证据

R0-A3 回归测试 C1 补充：`body 传入 verifiedPlanConfig 伪造 → 不影响服务端授权` 验证了后端不会返回不含 payUrl/free 的 success 响应来触发前端误判。前端行为验证通过 verify.cjs 的 uiResults 部分（历史证据保留，新回归不再复现该缺陷）。

## 五、C5 回应：回归与报告

### 新增测试

`src/app/api/__tests__/r0a3-combo-regression.test.ts`，18 个用例：

| 场景 | 断言 |
|---|---|
| 稳定免费基础档免费升级 | free:true、plan=STANDARD、账单 0/SUCCESS、零支付调用 |
| 快照贯穿写入 | plan=STANDARD、type=ENTERPRISE 来自快照 |
| retain + 套餐停用 | 400、workspace.create=0、workspacemember.create=0 |
| delete + 套餐停用 | 400、零写入 |
| retain + 不可购买 | 400、零写入 |
| retain + 套餐缺失 | 503、零写入 |
| 月0年正 + MONTH | 400 PLAN_MIXED_PRICING、零账单 |
| 月0年正 + YEAR | 400 PLAN_MIXED_PRICING、零账单 |
| 月正年0 + MONTH | 400 PLAN_MIXED_PRICING、零账单 |
| 月正年0 + YEAR | 400 PLAN_MIXED_PRICING、零账单 |
| 非基础档 0/0 | 400、零订单 |
| 合法双正价 PRO | 200、PENDING 19900、未提前开通 |
| 客户端伪造 verifiedPlanConfig | 路由层自行读取，伪造不生效，不产生 SUCCESS |
| 缺失目标 | 400 MISSING_TARGET_PLAN |
| 停用套餐 | 400 PLAN_INACTIVE |
| 不可购买 | 400 PLAN_NOT_PURCHASABLE_ONLINE |
| 个人空间创建保护 | type=ENTERPRISE |
| 认证失败 | 401 |

### 交付报告更正

**撤销 R0-A2 报告中的 `git restore` 建议**：该建议无法恢复未提交的 R0-A1 状态（`git restore` 只恢复索引或指定提交，不恢复未提交快照），在多批与他人改动叠加的情况下执行会丢失大量修改。R0-A2 批次未实际执行该建议。本批未执行任何 git restore/clean/reset。

**回滚方式**：本批修改仅涉及以下文件，可通过 `git diff` 生成最小补丁或直接从本批快照恢复：

- src/lib/workspace-upgrade-service.ts
- src/lib/workspace-plan-service.ts
- src/app/api/workspace/upgrade/route.ts
- src/components/studio/UpgradeModal.tsx
- src/components/workspace-hub/modals/UpgradeModal.tsx

## 六、修改文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| src/lib/workspace-upgrade-service.ts | 修改 | verifiedPlanConfig 贯穿（C1+C2） |
| src/lib/workspace-plan-service.ts | 修改 | Number.isSafeInteger（C5） |
| src/app/api/workspace/upgrade/route.ts | 修改 | 传快照 + C3 混合价阻断（C1+C3） |
| src/components/studio/UpgradeModal.tsx | 修改 | C4 状态判断统一 |
| src/components/workspace-hub/modals/UpgradeModal.tsx | 修改 | C4 状态判断统一 |
| src/app/api/__tests__/r0a3-combo-regression.test.ts | 新增 | 18 用例隔离回归 |

## 七、验证命令与结果

```text
npx vitest run --no-color src/app/api/__tests__/r0a3-combo-regression.test.ts
结果：1 file, 18 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts
结果：2 files, 48 tests passed, exit 0

npx vitest run
结果：27 files, 458 tests passed, exit 0

npx tsc --noEmit
结果：exit 0，无诊断输出

npm run build
结果：✓ Compiled successfully
```

## 八、未完成项与边界

- 本批未跑真实 MySQL、浏览器 DOM、生产构建或真实支付网关。
- 服务端执行防重复提交守卫（幂等键不防连点）在本批范围外，标记为后续问题。
- 并发冲突检测（多端同时编辑同一条数据）在全站范围内缺失，需要单独设计版本号/乐观锁机制，不在本批范围。
- settings 页 `integrations.configured` 硬编码为 false 且不从服务端回显的问题需要后端提供实际集成状态接口，不在本批范围。
- `upstreamModel` 是否应公开在 model-pricing/public 响应中需产品决策。

## 九、历史报告更正

R0-A2 独立审核报告（REVIEW.md）第五节建议"git restore 10 个文件到 R0-A1"。**本报告明确撤销该建议**：`git restore` 不能恢复未提交的历史快照，在当前多批次叠加的工作区执行会丢失大量修改。该建议在 R0-A2 批次中未被实际执行。本批回滚方式见上文第五节。
