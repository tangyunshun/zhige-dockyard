# R0-H 修复报告：原方案 F11 平台模型执行前成本准入止损

**状态：R0-H 待独立复核**（不进入 F12、不部署）

只修审核确认的准入缺陷：2 倍容忍区、成本缺失当零/跳过、预检与实际请求不一致（合同小上限 vs 目录×3、提示词后展开）。R0-A/B/C/D/E、R0-F/F1/F2、R0-G/G1 全部冻结，未重新触碰。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-H-fix-snapshot/manifest.json` + `frozen-source/`（handler 修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T15:05:40+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | handler `338bf06d…` |
| 结束 SHA256 | handler `0c486109…`；新增 `src/lib/model-cost-admission.ts` `46f02efa…`；新增测试 `1160d748…`（`after-hashes.json`） |

**修改差量**：handler.ts 三处（imports +1；最终请求参数前置块 +~15 行；2× 门槛替换为准入调用；execute 站点改为复用同一份参数）；新增纯函数模块与测试。售价、充值汇率、全局/model markup 配置、BYOK 费率、退款账务原语、settlementEnabled、维护审计、cron 零改动。

## 二、预算与成本定义（统一单位与来源）

| 概念 | 定义 |
|---|---|
| 名义预算 | 本次**实际会扣**的固定点数 `componentcatalog.estimatedModelTokens`（必须为正安全整数；小数等会被 consumePoints 取整产生歧义的损坏配置诚实拒绝） |
| 保守执行成本上界 | 最终部署的**可信生效供应商成本**：`ceil(输入Token×输入单价 + 输出上限×输出单价)`（微元，BigInt，向上取整）再按既有统一加价口径 `×(10000+bps)/10000` 向上取整，按 `MICROS_PER_POINT=10000`（point-rate 唯一真源，1 点=¥0.01）取点 |
| 可信价格状态 | 仅 `FREE` / `VERIFIED`；`UNCONFIGURED/UNVERIFIED/OBSERVED_ONLY/未知` 一律不可采信（不把 OBSERVED_ONLY 当免费） |
| 明确免费 | `priceStatus=FREE`，或 `VERIFIED` 且两侧成本均为 0 —— 权威事实证明免费才按零成本放行 |
| 币种 | 仅 CNY（点数换算唯一权威口径）；其他币种无授权换算规则，拒绝而非猜汇率 |
| 拒绝码 | `MODEL_COST_NOT_TRUSTWORTHY`（成本/预算未就绪，422）/ `MODEL_COST_EXCEEDS_BUDGET`（超过本次预算，400）；错误文案不含内部成本数值/密钥 |

供应商成本、用户售价、点数面值、现金收入、利润是不同概念：本批只做「保守成本上界 ≤ 名义预算」止损，不构成利润率/补贴授权（赠送点、折价充值、失败退款后的供应商费用、运营成本均需单独商业决策）。

## 三、最终请求一致性（L03）

`action=simulate` 的 PLATFORM + `ESTIMATED_COMPATIBILITY` 分支在执行前**统一生成一份最终请求参数**：

- `finalSystemPrompt`：合同首步 promptTemplate，**含 `{{COST_BASELINE}}` 真实展开**（与原执行点同源同逻辑）；
- `finalUserPrompt`：`buildSourceMaterialPrompt(effectiveInputMaterial)`；
- `finalMaxOutputTokens`：`目录 estimatedOutputTokens×3` / env / 默认 2000 —— 与 adapter.execute 完全同分支同值，不再出现「按合同 steps 小上限检查、按目录×3 执行」；
- 输入 Token 估算基于展开后的最终提示词 + 材料（旧实现用未展开模板）；
- adapter.execute 改为直接使用上述三个变量（删除执行点重复计算）；准入消耗的是同一份值 —— 检查后放大/后展开的通道已消除。
- 保守性如实声明：字符估算仍是估算而非严格上界证明；无法可靠限定成本的路径按本批规则拒绝，不悄悄换模型/缩短结果。多调用编排未实现（当前路径单次调用），准入覆盖当前真实执行路径。

## 四、写入顺序与副作用（L05/L06）

拒绝发生在 `createRunningTask`（RUNNING）之前、`consumePoints/hold` 之前、`adapter.execute` 之前——不靠先扣再退。测试（真实 `runStudioPost` + StudioExecutionDeps 注入 + 通用内存 Prisma）计数证明：

| 场景 | 结果 |
|---|---|
| 超预算（高单价夹具） | 400 `MODEL_COST_EXCEEDS_BUDGET`；consume/hold/execute/refund 全 0；componenttask 表 0 行；pointledger 0 行 |
| pricing 缺失 / OBSERVED_ONLY | 422 `MODEL_COST_NOT_TRUSTWORTHY`，零副作用 |
| 未授权（无登录） | 401；合同缺失（NO_ACTIVE_CONTRACT）→ 409 `COMPONENT_CONTRACT_NOT_READY`——原门禁不被新逻辑绕过 |
| 安全请求（可信低价） | 200 SUCCESS：consumePoints 恰 1 次且 `points=100`（固定点数不被上调）、无 hold（结算未启用）、任务 SUCCESS + 成果物落库 |
| 模型执行失败 | 真实扣点 1 次 → 原路退款（refundConsumedPoints 恰 1 次）→ 任务 FAILED（chargeAttempted=true）→ 502 `MODEL_UPSTREAM_ERROR`（既有契约） |

**L03 一致性断言**（execute spy）：`systemPrompt` 不含 `{{COST_BASELINE}}` 且含展开后基准文本；`userPrompt` 含材料；`maxOutputTokens === 300`（100×3，与准入一致）。

## 五、L01—L08 逐项结果

- **L01**：纯函数 + 独立 BigInt 复算：50k 输入下 101/150/200/201 点成本全拒（复算值分别为 101/150/200/201），80 点与恰好 100 点放行；handler 级超高单价夹具同样拒绝。实际扣点永不被上调。
- **L02**：pricing 缺失/UNCONFIGURED/UNVERIFIED/OBSERVED_ONLY/USD 币种/输入侧缺失/输出侧缺失/负数/小数 → 全部 `MODEL_COST_NOT_TRUSTWORTHY`；FREE 与 VERIFIED+0/0 两个明确免费对照放行（零成本）；可信完整价格正向对照通过。
- **L03**：见第四节 execute spy 断言；旧「合同缺失输出当 0」「未展开模板」通道已删除。
- **L04**：微元统一单位、ceil 舍入边界（1 微元→1 点）、加价 5000bps（k=1.5，既有 10000+bps 口径）150 点/预算 149 拒绝、10 亿 Token×10 亿微元大值 BigInt 不溢出、小数预算配置拒绝——全部以独立复算函数对照（不经被测函数）。
- **L05**：见第四节；限频器为 IO 边界以 spy 放行并计数（准入与业务流程未 mock）。
- **L06**：见第四节两条闭环用例。
- **L07**：源码级证据——准入调用被 `!== "USER_BYOK"` 与 `billingBasis === "ESTIMATED_COMPATIBILITY"` 双重限定，BYOK 押金/换算与结算开关代码未删改、旧 `rawCost * 2` 已不存在；页面（WorkspaceInternalLayoutV3）现有错误分支已能展示后端 error 并 `setIsExecutingTask(false)` 恢复忙碌、不假成功——页面零改动（源码接线证据，非浏览器验证）。
- **L08**：见下节命令。

## 六、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts
→ 1 file, 14 tests passed, exit 0

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts
→ 11 files, 377 tests passed, exit 0（363 既有 + 14 新增）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
→ 10/10 checks passed, exit 0

node docs/reviews/R0-G1-independent-review/verify-next-cost.cjs
→ exit 1（预期）：其第 5 行断言旧成本门槛条件 AST（`modelPlan.pricing && … !== "USER_BYOK"`）
   在源码中恰出现 1 次——修复后该条件已被准入调用取代，冻结断言不再成立。
   旧三反例（150 点成本/100 点收费放行、缺失定价跳过、输出缺失按 0）对应的旧断言同样不再成立。
   脚本与 next-cost-verification.json 零改动；退出输出存档于
   docs/reviews/R0-H-fix-snapshot/historical-repro-after-fix.txt。
```

均定向隔离运行、本地工具、合成数据；零真实库/组件执行/供应商调用/支付/短信/配置或合同切换/迁移/seed/退款/补账/费用/部署；未读取或打印真实密钥；未全量测试；未为验证花钱跑模型。

## 七、未验证项与发布依赖（不自行决定）

- **商业依赖（需单独授权，本批未设任何数字）**：最低利润率/补贴预算/组件售价调整；赠送点与折价充值的真实收入口径；失败退款后的供应商费用与运维成本——名义预算止损 ≠ 现金利润保证。
- **未验证**：真实浏览器 DOM 与多轮页面交互；真实 MySQL 并发；真实供应商调用与多步/重试编排（当前路径单次调用，未来多步编排须将全部可能费用纳入预算，否则按本批规则拒绝）；字符估算法对极端语言的保守性；其他模型调用入口（refine-prompt 润色链等）未在本批范围，如实列明。
- 字符估算仍是估算：本批以「可核查的保守换算 + 缺失即拒绝」落实止损，未宣称其为准入上界的数学证明。

## 八、回滚说明

用 `docs/reviews/R0-H-fix-snapshot/frozen-source/` 副本覆盖 handler.ts、删除 `model-cost-admission.ts` 与测试文件即回到 R0-G1 冻结状态；无 schema/DDL/环境变量依赖。

**L01—L08 通过即停止交回；不进入 F12，不追加一般优化。**
