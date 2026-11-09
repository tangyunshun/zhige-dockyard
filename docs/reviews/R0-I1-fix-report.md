# R0-I1 修复报告：月度维护顺序 + 报价只读解析 + 管理员口径统一

**状态：R0-I1 待独立复核**（不进入 F13、不部署）

只修 R0-I 独立审核确认的三项：I-MONTH-ORDER/P1、I-GET-DDL/P1、I-ADMIN-COPY/P2。R0-I 已通过的 BYOK 暂停主路径、报价暂停数据、页面错误提示全部保留不重做；F11（R0-H/H1/H2）保持冻结。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-I1-fix-snapshot/manifest.json` + `frozen-source/`（6 文件修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T18:07:15+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | handler `f9c63646…` / estimate `8a2fd467…` / model-registry `3c0a0bd9…` / workspace-byo-model `fe9eb769…` / admin `1583e06f…` / 测试 `2c0bac24…`（与 R0-I 结束哈希一致） |
| 结束 SHA256 | handler `80fe3162…` / estimate `cf0d741a…` / model-registry `b87c9127…` / workspace-byo-model `eb4648b2…` / admin `ae5a74a5…` / 测试 `812f67f8…`（`after-hashes.json`） |

**修改差量**：handler（成员额度校验块移位 + currentMember 提升）；workspace-byo-model（ensure 只读模式 +~15 行）；model-registry（resolver 签名 +readOnlyResolution、调用传递）；estimate 路由（+1 行 readOnlyResolution）；admin 组件（文案统一）；测试重组（+15 用例）。套餐/额度语义、费率、售价、白名单、结算开关零改动；未覆盖他人修改；历史报告/测试/快照/scratch 保留。

## 二、I-MONTH-ORDER：月度维护与额度校验顺序（J01/J02）

**新顺序**（handler simulate 分支）：
1. 身份/空间/合同门禁（原样保留）→
2. **最终服务端模型计划 BYOK 暂停裁决（409）**——此时**零**配额写入 →
3. 允许的平台任务执行既有 `checkAndResetQuotaCycle`（真实函数，仅 quotaResetAt 缺失/到期时清零计数，非无条件清零）+ 配额行确保 →
4. **重新读取**维护后的成员月度用量（`currentMember` 提升到外层声明并在此赋值，后续个人点预检与余额响应复用同一读取，不拿过期前对象判断）→
5. 月度额度校验（管理员显式配置限额才校验）→
6. 扣点 / hold / 任务创建 / execute。

**证据（真实 handler + 真实 quota-cycle + 内存 Prisma，6 用例）**：
- J01 跨月：企业成员限额 1000、旧用量 1000、quotaResetAt=2000-01-01 → 200 SUCCESS；真实 quota-cycle 调用后 `monthlyTokenUsed` 归零、quotaResetAt 推至下月；扣点 100、execute 1 次。quotaResetAt 缺失同样维护后执行。
- J02 同月用满（resetAt 未到期）→ 400「配额已用尽」、零执行、计数 1000 不动（未被无条件清零）；同月剩余 500 → 200 正常执行且**不**清零。
- **同根因交错夹具**：早期解析平台计划、最终解析交错为 BYOK 且旧月已满 → **409 暂停先于任何额度报告**，错误不含「配额已用尽」，零扣点/hold/execute/任务、成员计数未动（未被清零也未拒绝）。显式 BYOK 同样先暂停。

## 三、I-GET-DDL：报价解析冷启动严格只读（J03）

**修复**：`ensureByoShareWithMembersColumn({ readOnly?: boolean })`——`readOnly: true`（用户读请求）时**绝不 ALTER**，改用 SELECT 探针验证列就绪；列缺失抛 `BYO_SHARE_COLUMN_NOT_READY`（code+status 503）由调用方诚实拒绝。`resolveDeploymentForWorkspace` 增加可选 `readOnlyResolution` 参数传递（写路径配置/绑定保存仍走原热补全，未被顺手改写）。estimate 路由的显式部署解析传入 `readOnlyResolution: true`。

**证据（真实报价 handler + 真实模型解析器 + 真实 ensure helper，仅替换 Prisma/解密 IO，6 用例）**：
- 冷启动（进程缓存未热，每用例重置标志）显式 BYOK：raw 调用记录**仅含 SELECT 探针**（断言 `rawSql` 含 shareWithMembers 查询、**不含 ALTER/INSERT/UPDATE/DELETE**），常规写操作日志为空；暂停报价数据正确（blocked/canExecute=false、points/yuan=null、稳定码）。
- 探针失败（列缺失）→ 503 `BYO_SHARE_COLUMN_NOT_READY` 诚实拒绝，raw 记录无 ALTER（用户读请求未自动迁移）。
- 401/403 保持；平台模型正常报价（points=100）不误拦。
- 默认命中 BYOK 的执行链不受影响（R0-I 既有 auto 用例保持通过；解析器默认路径的 gatePolicy 逻辑未改动）。
- 解密 IO 为固定合成桩；`$executeRawUnsafe/$queryRawUnsafe` 全部记录进 `h.rawSql` 供断言，无遗漏通道。

## 四、I-ADMIN-COPY：管理员口径统一（J04）

`byok-service-rate.tsx` 全操作流程统一为「仅保存费率配置；Studio 自带模型任务调用仍暂停，保存不会恢复调用或启动收费，恢复需单独授权」：

| 位置 | 修改后 |
|---|---|
| 卡片状态徽章（原「实时生效 · 无需发版」） | 「任务暂停 · 仅保存配置」（琥珀色，title 同口径） |
| 卡片辅助提示 | 「…统一抽佣比例（仅存配置；Studio 自带模型任务调用仍暂停，恢复需单独授权）」 |
| 确认弹窗 message（原「对外收费将按新费率实时重新折算」） | 「仅保存费率配置；Studio 自带模型任务调用仍暂停，保存不会恢复调用或启动收费，恢复需单独授权。」 |
| 确认警告（原「立即对全部自带模型的估价/结算口径生效，无法撤销」） | 「保存不会恢复自带模型任务调用或启动收费；费率数值仅作为已存配置保留」 |
| 保存成功 toast | 「已保存为 X%（仅保存配置；Studio 自带模型任务调用仍暂停…）」 |
| 页脚 | 保持 R0-I 的暂停说明（不再有冲突承诺） |

**证据**：`verify-admin-copy.cjs`（真实组件 TS 转译 + React hooks 桩受控执行，非浏览器 DOM）4/4：①渲染文本无「实时生效」、卡片为「任务暂停 · 仅保存配置」；②打开确认框 message/warnings 统一口径且无「实时重新折算/立即对全部」；③保存成功提示含「仅保存配置；Studio 自带模型任务调用仍暂停」；④保存失败如实提示且无任何「生效」承诺。费率数值展示（15%/1500bps）与保存 POST 功能保留。

## 五、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts
→ 1 file, 33 tests passed, exit 0（R0-I 的 24 用例中 1 个重组 + 净增 9：J01×2/J02×4/J03×3）

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  … （11 个定向文件，同 R0-I 清单）
→ 11 files, 396 tests passed, exit 0（387 既有口径 + 净增 9）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-I-fix-snapshot/verify-byok-pause-pages.cjs
→ RESULT: 3/3 scenarios passed, exit 0（BYOK 暂停页面行为保持）

node docs/reviews/R0-I1-fix-snapshot/verify-admin-copy.cjs
→ RESULT: 4/4 admin-copy checks passed, exit 0（本批新增，真实组件受控执行）

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
→ RESULT: 10/10 checks passed, exit 0
```

冻结证据（预期失败，零改动）：R0-I review.test.ts 中 I-MONTH-ORDER/I-GET-DDL/I-ADMIN-COPY 三个缺陷复现断言不再成立（其余通过项确认暂停主路径未被破坏）。零真实数据库/迁移/seed/密钥/模型/连接测试/支付/退款/补账/清理/部署；未全量测试。

## 六、测试重组与数据影响

- 原 387 项中仅「BYOK 7 点→暂停契约」用例在 R0-I 已改；本批未删除任何 R0-I 用例，净增 9（J01×2、J02×4、J03×3）；J03 两个用例按 ensure 模块缓存的现实（探针失败路径不置缓存）排序为先探针失败后成功，断言均独立于顺序。
- 零真实数据操作；`currentMember` 提升后个人点预检（tokenBalance）与余额响应（4375 行区域）复用同一读取，语义未变。
- 未验证：真实 MySQL 的 ALTER 权限/锁行为、真实分页交互、其他入口（连接测试/refine-prompt）的供应商调用、生产注册表 contextLimit/费率数据的完整性——如实列明，不属于本批范围。

## 七、回滚说明

用 `docs/reviews/R0-I1-fix-snapshot/frozen-source/` 六个副本覆盖对应文件即回到 R0-I 结束状态；无 schema/DDL/环境变量依赖。

**三项关闭，J01—J06 通过即停止交回；不进入 F13，不追加一般优化。**
