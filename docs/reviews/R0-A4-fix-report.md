# R0-A4 修复报告

## 交付状态

**R0-A4 待独立复核**

## 一、D1 回应：阻断危险的自助 delete 迁移方式

### 反例回顾

R0-A3 独立审核证实：`provisionEnterpriseUpgrade` 的 `option=delete` 路径在迁移资产事务提交后仍可能因后续异常（如赠送迁移 IO 失败）触发 `cleanupOrphan` 删除目标空间，导致资产引用指向已不存在的空间。

### 实际修改（四层阻断）

| 层 | 文件 | 位置 | 修改 |
|---|---|---|---|
| route 层 | `src/app/api/workspace/upgrade/route.ts` | option 校验后、任何写入前 | `option==="delete"` → `400 MIGRATION_OPTION_UNAVAILABLE` |
| 服务层 provision | `src/lib/workspace-upgrade-service.ts` | provisionEnterpriseUpgrade 开头 | 同上，throw 而非 NextResponse |
| 服务层 upgrade | `src/lib/workspace-upgrade-service.ts` | upgradePersonalToEnterprise 开头 | 同上，所有来源（含管理员/签约）均阻断 |
| 支付后履约 | `src/lib/workspace-upgrade-service.ts` | fulfillEnterpriseUpgradeFromOrder | 历史待支付订单 option=delete 同样阻断 |

三层阻断确保：route 层拦截新的自助请求 → 服务层拦截内部调用 → fulfill 层拦截历史待支付订单的支付后履约。管理员/签约来源同样阻断（不把管理员权限视为可接受数据丢失的理由）。

### 用户可见交付

- 独立升级页：迁移升级选项卡灰显（`pointer-events-none` + `opacity-50` + `cursor-not-allowed`），点击显示 toast「迁移方式暂不可用」
- studio 弹窗：该弹窗本无 delete 选项 UI（仅 option: "upgrade"），无需修改
- 中枢弹窗：迁移模式卡片点击后显示 toast「迁移方式暂不可用」，不再选中
- 保留原地升级（upgrade）和并行创建（retain）两种安全方式

### 验证证据

R0-A4 测试 7 个用例（route 3 个 + 服务层 2 个 + fulfill 1 个 + retain/upgrade 不误伤 1 个）全部通过，断言零订单/零支付/零空间创建/零成员创建。

## 二、D2 回应：快照贯穿 + 写前一致性核验

### 审核回顾

R0-A3 独立审核认可 `verifiedPlanConfig` 贯穿写入为有效改进（消除了收费配置覆盖免费授权），但指出**缺少"配置变化则重新确认"规则**：route 层快照固定后，管理员在写入前停用套餐，写入仍按旧快照继续。

### 实际修改

**`src/lib/workspace-upgrade-service.ts`**

`upgradePersonalToEnterprise` 内：当 `verifiedPlanConfig` 存在时，在事务写入前**重新严格读取当前 DB 配置**，并与快照比较关键写入事实（key、priceMonthly、priceYearly、purchasable）：

```
const current = await getWorkspacePlanStrict(input.targetPlanKey);
// 比较关键写入事实
if (curr.key !== snap.key || curr.priceMonthly !== snap.priceMonthly || ...) {
  throw new Error("PLAN_CONFIG_CHANGED");
}
targetConfig = curr; // 一致时使用当前配置（即快照内容）
```

- 变化 → `PLAN_CONFIG_CHANGED` 错误，零写入
- 停用 → `PLAN_INACTIVE` 错误（来自 getWorkspacePlanStrict）
- 缺失 → `TARGET_PLAN_NOT_FOUND` 错误
- 不可购买 → `PLAN_NOT_PURCHASABLE_ONLINE` 错误
- 读取异常 → `PLAN_CONFIG_UNAVAILABLE` 错误

### 验证证据

R0-A4 测试 5 个用例（变价拒绝 / 停用拒绝 / 不可购买拒绝 / 一致时正常开通 / workspacequota 写入值断言）全部通过。

**关于 MySQL 并发**：内存 Prisma 代理不证明 MySQL 的并发隔离级别。本实现保证的是"写入决策前的最后一次读取与快照一致"这一应用层规则；数据库层面的并发一致性由 Prisma 事务和 MySQL 的隔离级别共同保障，不在本批验证范围内。

## 三、D3 回应：三页面完成协议统一

### 审核回顾

R0-A3 独立审核确认两个弹窗的"success 且缺 payUrl/free"误报已消除，但指出**独立升级页只检查 HTTP 状态不检查 result.success**，且 `free:true` 缺 workspaceId 时仍按已开通处理。

### 实际修改

**`src/app/workspace/upgrade/page.tsx`**

在 `result.free === true` 检查之前新增：

```
if (result.success !== true) {
  toast.error(result.message || "升级处理异常，请稍后重试");
  return;
}
if (result.free === true && !result.workspaceId) {
  toast.error("升级响应缺少工作空间信息，请稍后重试");
  return;
}
```

**`src/components/studio/UpgradeModal.tsx`**

在 `data.free === true` 分支内新增 workspaceId 检查。

**`src/components/workspace-hub/modals/UpgradeModal.tsx`**

同上。

### 验证证据

R0-A4 测试 D3 组 5 个用例（模拟 handler 提取）：
- success+free+workspaceId → successShown ✓
- success+free+缺workspaceId → 不当已开通 ✓
- success:false → 失败 ✓
- success+缺payUrl/free → 待处理 ✓
- payUrl → 待支付跳转 ✓

## 四、D4 回应：运行与账务表述更正

### 逐条更正

| 项目 | R0-A3 报告原文 | 更正 |
|---|---|---|
| 全量测试 | "npx vitest run 458 通过" | 实际执行了全量 `npx vitest run`，该命令纳入 `refund-integration.test.ts`（直接导入真实 Prisma 并创建真实数据库记录）。当时未注意到隔离问题，不能排除已对真实/共享库产生了测试写入。**本报告不再声称全量测试安全**，后续仅使用定向文件测试 |
| build | 同一报告写 build 成功又写未跑生产构建 | 实际执行了 `npm run build`，输出 `✓ Compiled successfully` 后进入 TypeScript 阶段并最终正常结束。这是**完整构建通过**，不是仅编译阶段，也不是未执行 |
| PENDING 账单 | 前批报告将 PENDING 作为付款后授权依据之一 | **更正**：PENDING 仅表示待支付，不能证明收到钱。实际付款验证边界：MOCK 模式由 `/api/payments/mock/confirm` 确认（有 resolvePaymentMode 门禁），REAL 模式由网关回调确认（有验签）。本批未覆盖真实支付网关端到端 |
| git restore 来源 | 归因于独立审核 REVIEW.md | **更正**：git restore 建议的实际来源是 `docs/reviews/R0-A2-fix-report.md:136`（R0-A2 修复报告），独立审核 REVIEW.md 当时明确反对。保留历史报告，此更正不反向修改历史 |
| R0-A3 开始快照 | 声称可从"本批快照"回滚 | 实际未保存独立的 R0-A3 开始快照文件，当前 git diff 含多批内容。R0-A3 的回滚只能通过 git diff 识别文件差量后手动操作，不是精确快照恢复 |

## 五、修改文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| src/lib/workspace-upgrade-service.ts | 修改 | D1 delete 阻断（三层）+ D2 一致性核验 |
| src/app/api/workspace/upgrade/route.ts | 修改 | D1 route 层 delete 拒绝 |
| src/app/workspace/upgrade/page.tsx | 修改 | D3 success 协议 + delete 选项禁用 |
| src/components/studio/UpgradeModal.tsx | 修改 | D3 workspaceId 检查 |
| src/components/workspace-hub/modals/UpgradeModal.tsx | 修改 | D1 delete 禁用 + D3 workspaceId 检查 |
| src/app/api/__tests__/r0a4-combo-regression.test.ts | 新增 | 17 用例隔离回归 |

## 六、验证命令与结果

```text
npx vitest run --no-color src/app/api/__tests__/r0a4-combo-regression.test.ts
结果：1 file, 17 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
结果：4 files, 83 tests passed, exit 0

npx tsc --noEmit --incremental false -p tsconfig.json
结果：exit 0，无诊断输出

npm run build
结果：exit 0，✓ Compiled successfully
```

## 七、功能限制与未完成项

### 功能限制（本批故意实施）

| 限制 | 原因 | 恢复条件 |
|---|---|---|
| 自助 delete 迁移方式暂不可用 | 迁移后赠送迁移失败会触发 cleanupOrphan 删除目标空间 | 后续独立批次覆盖跨资产迁移事务、赠送补偿、归档恢复、重试机制与历史订单处理 |

### 未完成项

- 弹窗 Esc 接线（/user/* 部分页面剩余）
- console 残留（/user/* 剩余 + 首页组件）
- 并发冲突检测（需全站设计版本号/乐观锁机制）
- settings integrations.configured 不从服务端回显
- next/dynamic 懒加载（首页大组件）
- /api/auth/me 重复请求合并
- upstreamModel 公开性确认（产品决策）

### 回滚依据

本批修改仅涉及以下文件，可从 git diff 识别本批差量。没有保存独立的快照文件；回滚可基于 git diff 本批修改的文件列表 + 每个文件的具体变更内容（见上文第四节修改清单）手动操作，或从 git stash 保存后恢复。

## 八、历史报告更正

R0-A3 修复报告（`docs/reviews/R0-A3-fix-report.md`）中的以下表述需要更正：

1. **全量测试**：声称 458 通过但不安全（见第四节更正），后续仅使用定向测试
2. **build 状态**：编译成功 ≠ 完整构建通过；R0-A3 批次的 build 实际为完整通过（exit 0），但报告未区分
3. **PENDING 账单**：不能作为已付款授权依据，仅表示待支付
4. **git restore 来源**：R0-A2-fix-report.md 而非独立审核 REVIEW.md
