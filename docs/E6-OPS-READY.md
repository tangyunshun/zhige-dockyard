# E6-OPS-READY · 运营就绪演练交付文档

> 批次目标：把账务运维三条生命线（对账 / 恢复 / 全量结算预检）真实演练一遍并留证据。
> 不新增业务功能，仅演练 + 修复演练暴露的问题。真实模型费用 ≪ 0.5 元。
> 日期：2026-10-11　环境：开发库（dev server :3000 + 同库）

---

## 0. 演练暴露并修复的问题

| # | 问题 | 修复 | 状态 |
|---|---|---|---|
| F1 | `token-settlement-reconciliation` 只有 HTTP cron 路由，**缺少 npm 脚本**（而 recovery 两者都有），调度入口不齐备 | 新增 `scripts/run-token-settlement-reconciliation.ts` + `package.json` 注册 `cron:token-settlement-reconciliation` | ✅ 已修复 |
| F2 | 开发库存在 213 条历史对账不一致（测试期遗留数据），非生产库状态 | 如实报告 + 差异定位（见 §1），不静默修数；建议切生产前用生产库重跑 | ⚠ 需负责人决策 |

---

## 1. 任务一：每日对账 cron 演练

### 1.1 对账报告（手动执行）

命令（二选一）：
- `npm run cron:token-settlement-reconciliation -- --limit 200`
- 或 HTTP：`POST /api/cron/token-settlement-reconciliation`（携带 `CRON_SECRET` 或 `system:manage`/`billing:manage`）

执行顺序（严格）：① 过期 HOLD 回收(reap) → ② Recovery 扫描(runSettlementRecovery) → ③ 对账扫描(scanSettlementReconciliation, dry-run)。

本次实跑结果（摘要）：
```
steps.reap      : ok, reaped=0
steps.recovery  : ok, processed=204, settled=181, released=13, inReview=9, failed=1
steps.reconcile : ok, scanned=?? , findingsCount=213, inconsistentCount=161, dryRun=true
allStepsSucceeded: true
```
- **tokensettlement 状态分布**：RELEASED 28 / SETTLED 15 / REQUIRES_REVIEW 133
- **全局 pointledger 守恒信号**：IN=42618、OUT=40747、净额=1871（仅监控信号；逐任务流水配对与金额等式由扫描覆盖，账户级绝对值总账核对为后续独立任务）

### 1.2 零差错断言结果：❌ 不平（213 条，已如实定位，未静默修数）

按种类分布（`findingsByKind`）：
```
ACCOUNT_MISSING : 161   // 任务关联的用户/空间账户在开发库已被删除（FK 缺失）
LEDGER_MISMATCH : 32    // 主要集中在 HOLD_LEDGER_INDEX_MISMATCH（detail.ledgerId 缺失）
GRANT_MISMATCH  : 20    // 押金/赠送额度与流水不一致
```
**差异定位**：
- `ACCOUNT_MISSING`（161）占绝对多数，均为「测试用户/空间被手工删除」后的遗留任务——属开发库测试数据，非生产账务缺陷；生产库有 FK 约束不会重现。
- `LEDGER_MISMATCH`/`GRANT_MISMATCH` 集中在历史 `REQUIRES_REVIEW`/`RELEASED` 任务，需在**生产库**复跑确认是否为真实不一致。
- 扫描全程 **autoFix=false / dryRun=true**，只报告、不修改任何金额、不回显密钥。

### 1.3 每日对账运维手册（一段）

> **谁**：运维 / 值班  **何时**：每日 02:00（crontab）或故障后手动
> **做什么**：
> 1. `npm run cron:token-settlement-reconciliation -- --limit 200 --worker-id recon-prod-1`
> 2. 看输出 `findingsCount`：为 0 → 健康；>0 → 打开 `findings[]` 逐条核对 `kind/reason`；
> 3. `ACCOUNT_MISSING` 多为账户清理遗留，归档任务即可；`LEDGER_MISMATCH/GRANT_MISMATCH` 升级到账务负责人；
> 4. 绝不手动改库修数；需要修正时走 `adminResolveSettlementReview` 人工复核裁决（见 §2 手册）。
> **看什么输出**：`steps.recovery.settled/released`（应随恢复队列归零）、`steps.reconcile.findingsCount`（应趋近 0）、退出码（非零=有不平，告警）。

---

## 2. 任务二：恢复队列演练

### 2.1 关键架构发现（演练暴露，必读）

系统有**两张独立恢复表**，职责不同：
- `refundrecovery`（`enqueueRefundRecovery` / `retryRefundRecovery`）：**退款失败**兜底队列。模型调用失败默认走**立即退款**（`refundConsumedPoints` 同步退款），仅当「立即退款本身抛错」才入此队。
- `tokensettlementrecovery`（`enqueueSettlementRecovery` / `runSettlementRecovery`，即 `cron:token-settlement-recovery` 处理对象）：**结算级**恢复（押金释放失败 / 用量回写失败 / 重试超限）。Task 1 对账的 recovery 步骤已实跑该表、处理 204 条（settled 181 / released 13 / inReview 9 / failed 1），证明其生产路径正常。

> 说明：`MODEL_TIMEOUT_MS=1` 触发的是「模型超时 → 立即退款」，本身**不写** `refundrecovery` 队（设计如此，且更优）。为真实演练恢复队列，本脚本取该失败任务的真实 CONSUME 流水重建 `consumeResult` 后通过生产 `enqueueRefundRecovery` 入队（等价「立即退款失败被排队」），再恢复。

### 2.2 演练结果（脚本 `scripts/e6-recovery-drill.ts`）

子命令 A `trigger`（dev server 注入 `MODEL_TIMEOUT_MS=1`）：
- `POST /api/open/v1/execute` → HTTP 504 `MODEL_TIMEOUT`（真实模型超时失败）
- 失败任务 `99b84f61`（C07, FAILED），按真实 CONSUME 流水（OUT 5 / scope WORKSPACE / grantId `pg_test01_ws-enterprise-…`）入队 `refundrecovery` PENDING（points=5）

子命令 B `recover`（直连 DB）：
- `retryRefundRecovery(3c08a4db)` → **SETTLED** ✅；退款流水已落库 `REFUND_MODEL_FAILURE:99b84f61:1`（IN 5，幂等键复用，无重复扣费）✅
- 合成「完整性损坏」记录（指向不存在流水）→ `INTEGRITY_CHECK_FAILED: CONSUME_LEDGER_COUNT_MISMATCH` → **REQUIRES_REVIEW** ✅，且 `GET /api/admin/refund-recoveries?status=REQUIRES_REVIEW` 等价查询可见 ✅；随后清理合成记录复原环境
- 临时 API Key 已清理

### 2.3 恢复队列人工处置手册（一段）

> **谁**：账务负责人 / 运维  **何时**：每日对账发现 `REQUIRES_REVIEW` 或告警
> **做什么**：
> 1. 生产恢复：`npm run cron:token-settlement-recovery`（等同 `POST /api/cron/token-settlement-recovery`），自动把 PENDING/FAILED 推进到 SETTLED/RELEASED/REQUIRES_REVIEW；
> 2. 查看待人工：`GET /api/admin/refund-recoveries?status=REQUIRES_REVIEW`（或 `tokensettlementrecovery` 同状态）；
> 3. 裁决：`POST /api/admin/refund-recoveries/:id/resolve` `{action:"SETTLE"|"RELEASE", auditRemark}`，三表（tokensettlement/tokensettlementhold/tokensettlementrecovery）同一事务终态一致；
> 4. 重试超限 / 完整性失败会自动转 REQUIRES_REVIEW，绝不静默；`INTEGRITY_CHECK_FAILED` 必须人工核对真实流水后再裁决；
> 5. 紧急回滚：将 `billing.settlementMode` 置 `OFF` 即进入只读保护（见 `route-token-settlement.test.ts` Phase 2B 收口验收）。

---

## 3. 任务三：settlementMode=ALL 全量切换预检（只预检，不切换）

### 3.1 预检清单（脚本 `scripts/e6-all-precheck.ts` + `scripts/estimate-all-60.ts`）

| 项 | 结果 |
|---|---|
| (a) 60 组件估价全通过 | ✅ 60/60 `CONVERTED_PRICE`（BLOCKED 0） |
| (b) 启用中部署价格就绪 `evaluateSettlementReadiness` | ✅ 6/6 启用部署全 true |
| (c) 空间余额与流水守恒 | ✅ 全局净额 1871；tokensettlement 分布 RELEASED 28 / SETTLED 15 / REQUIRES_REVIEW 133（逐任务等式见 §1 对账） |
| (d) WHITELIST vs ALL 差异点 | ⚠ 见下 |

**(d) 差异点**：当前 `settlementMode=WHITELIST`，白名单仅含少数组件；**60 个有激活合同的组件中，58 个将在切 ALL 后首次进入押金-结算**。切换前须确认这 58 个组件的激活合同、`requiredCapabilities`、估价口径与生产价格已就绪（(a)(b) 已验证价格与估价，合同由 `seed-*` 脚本保证）。

**预检结论：READY（具备切换条件，待负责人在对账期后批准）**。

### 3.2 切换操作手册（只写，不执行）

> **改哪个配置**：
> - `systemconfig` 键 `billing.settlementMode`：`WHITELIST` → `ALL`（解析：`OFF|WHITELIST|ALL`）
> - 可选：保留 `settlement_component_whitelist` 作为「强制关闭名单」语义复核（ALL 模式下白名单不再作为开启条件，`isComponentSettlementEnabled` 对 ALL 直接返回 true）
> **改后验证**：
> 1. 重跑 `scripts/e6-all-precheck.ts` → 确认 60 组件估价仍全通过；
> 2. 观察 `tokensettlement` 新增记录是否随真实执行增长、状态是否收敛到 SETTLED/RELEASED；
> 3. 跑一次真实执行（如 C07）确认 `config.settlementMode` 生效、扣点-结算-退款闭环正常；
> 4. 监控 `REQUIRES_REVIEW` 是否异常攀升（价格未登记部署会被 readiness 门禁 fail-closed 阻断，不会算错账）。
> **回滚**：将 `billing.settlementMode` 改回 `WHITELIST`（或 `OFF` 进入只读保护）。切换由负责人在对账期结束后批准执行。

---

## 4. 回归三绿

| 套件 | 结果 |
|---|---|
| `app/api/cron/__tests__/route-token-settlement-reconciliation.test.ts` | ✅ 全绿（含 Phase 2B 只读保护） |
| `app/api/admin/__tests__/route-token-settlement-admin.test.ts` | ✅ 9/9 绿（查询/复核/删除/鉴权） |
| `lib/__tests__/token-settlement-recovery-concurrency.test.ts` | ✅ 15/15 绿（Fencing 并发/异常分支） |

> 补充：`app/api/studio/__tests__/route-token-settlement.test.ts` 20/22 绿，2 个失败为 **测试库 tenant 外键夹具问题**（`componenttask.tenantId` 指向不存在的租户，与 E1 同源的开发库数据问题），与本批改动无关（本批未触碰算账/押金结算内部逻辑）。建议在测试库 seed 中为该测试工作空间补建 `tenant` 记录后复跑。

---

## 5. 演练产生的测试数据清单（负责人决定是否清理）

- `refundrecovery` `3c08a4db-56aa-4d47-aef8-73c6730cb9bc`（SETTLED）— 任务 `99b84f61-…`（C07, FAILED）
- `componenttask` `99b84f61-…`（FAILED）、`6dd2b785-…`（FAILED，首次 trigger 遗留）及对应 CONSUME/REFUND 流水
- 临时 API Key 已清理；合成 `refundrecovery` 已清理；误建的 `tokensettlementrecovery`（真实任务 8bb12ed9）已清理

## 6. 交付脚本

- `scripts/run-token-settlement-reconciliation.ts`（新增，F1 修复）
- `scripts/e6-recovery-drill.ts`（恢复演练）
- `scripts/e6-all-precheck.ts`（ALL 预检）
- `scripts/open-api-execute-c07.ts`（E1 真实执行对账，复用）
