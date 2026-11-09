# R0-H2 修复报告：可靠成本边界来源与缺失拒绝（H-BOUND 收口）

**状态：R0-H2 待独立复核**（不进入 F12、不部署）

只修 R0-H1 独立审核唯一残留：无条件对所有部署使用「UTF-8 字节数 + 128」并标为已证明上界。已通过的模式隔离、未知规则/缓存费用拒绝、金额判断、最终参数复用、页面行为全部保留不重做。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-H2-fix-snapshot/manifest.json` + `frozen-source/`（3 文件修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T16:42:16+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | handler `0ebac90f…` / admission `ff233368…` / 测试 `4fe6505c…`（与 R0-H1 结束哈希一致） |
| 结束 SHA256 | handler `743dc697…` / admission `57fbb1e3…` / 测试 `11313a7e…` / tsconfig `ccda8316…`（`after-hashes.json`） |

**修改差量**：admission 函数（边界来源替换 + 签名 `systemPrompt/userPrompt → contextLimit: unknown`）；handler 准入调用点（传 `contextLimit: modelPlan.contextLimit`）；测试重写（18 用例）。`tsconfig.json` 未再改动（R0-H1 已加 docs exclude）。售价/markup/充值比例/补贴/BYOK 费率/结算开关/白名单/冻结模块零改动。

## 二、所选边界方案（来源、单位、适用条件）

| 项 | 内容 |
|---|---|
| **唯一可信来源** | 服务端最终模型计划的注册表硬上下文限制 `modelPlan.contextLimit`——该部署在服务端登记的真实硬上限：本次请求的输入+输出 Token 总量不可能超过它 |
| **预算口径** | 用**完整 contextLimit** 作为输入量预算（审核明确允许的偏保守做法，不按 0.7 之类比例缩小成本边界）；输出仍按实际硬上限 `finalMaxOutputTokens` 计费 |
| **单位与计算** | BigInt 微元（MICROS_PER_POINT=10000 唯一真源），除法全向上取整；加价沿用既有 `10000+bps` 口径 |
| **适用条件** | `contextLimit` 必须为**正安全整数**；0/缺失/负数/小数/NaN/非数值/客户端伪造值 → `MODEL_COST_NOT_TRUSTWORTHY`（422）稳定未就绪拒绝，零扣点/零 hold/零 execute/无任务，不猜默认值继续 |
| **客户端隔离** | 边界只读服务端最终计划（`modelPlan.contextLimit`）；测试证明 body 携带伪造 `contextLimit/inputTokens` 大值不改变裁决 |
| **字节/字符粗估** | 降级为纯诊断（输入防爆阀 INPUT_TOO_LARGE、校准告警）；`PROTOCOL_FRAMING_TOKEN_ALLOWANCE` 与「字节+128 上界」整体移除——不再对所有协议无条件通用 |
| **快照区分** | allowed 决策返回 `inputBoundSource: "REGISTRY_CONTEXT_LIMIT_FULL"` + `inputTokenUpperBound`（= 计划值），与估算明确区分；不含原始材料/提示词/密钥 |

明确零供应商成本（FREE 或 VERIFIED+0/0）仍按现有规则放行，但不借免费绕过模型/输入/权限或未知附加费用检查（规则/缓存检查在免费判断之前/之后均保持）。

## 三、N01—N05 逐项证据（真实 runStudioPost + 准入函数，只替换 IO）

- **N01**：handler 级——`contextLimit=0`（注册表未登记）→ 422 未就绪 + 零扣点/hold/execute/refund/任务/流水；负数、NaN、"abc" → 422（正小数会被既有 INPUT_TOO_LARGE 门禁先拦——生产分层行为，报告中如实说明）；客户端伪造 body `contextLimit/inputTokens` 大值不改变服务端裁决（仍 422 零副作用）。
- **N02**：`contextLimit=128000` + 低单价 → 200 SUCCESS + execute 1 次；边界值取自夹具计划（128000），测试内独立复算成本 1 点 < 100——期望不抄被测常量。
- **N03**：`contextLimit=100000` 下 100/101/150/200/201 点边界——先独立复算（`ceil(contextLimit×costIn/1e10)`）再断言决策（等值放行、其余拒绝）；`contextLimit=8192` 的 handler 对照：costIn=122,000,000 → 恰在预算内执行、123,000,000 → 拒绝，两用例输出上限一致（300，无检查后放大、不缩输出、不换模型）。
- **N04**：未知规则/非零缓存拒绝、模式隔离三条件（`!settlementFeatureEnabled` 等）、生产结算关闭、BYOK 7 点口径、正常 100 点扣点 SUCCESS、失败原路退款、页面诚实错误——全部保持通过（用例保留）。
- **N05**：见下节命令。

## 四、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts
→ 1 file, 18 tests passed, exit 0（R0-H1 的 16 用例按新签名重组 + 2 净增；重组情况已在报告如实说明，
  非净增冒充全保留——字节上界相关旧用例随方案移除，等值/超预算/规则/模式/退款用例全部保留）

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  src/app/api/__tests__/r0e-production-mock.test.ts src/app/api/__tests__/r0d-refund-approval.test.ts
  src/app/api/__tests__/r0c-pool-recycle.test.ts src/app/api/__tests__/r0b-seat-addon.test.ts
  src/app/api/__tests__/r0a-business-boundary.test.ts src/app/api/__tests__/r0a2-real-combo.test.ts
  src/app/api/__tests__/r0a3-combo-regression.test.ts src/app/api/__tests__/r0a4-combo-regression.test.ts
  src/app/api/__tests__/r0g-cron-subscription-expire.test.ts src/app/api/__tests__/r0h-cost-admission.test.ts
→ 11 files, 381 tests passed, exit 0（379 既有口径 + 重组后净增 2）

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

冻结证据脚本（预期失败，零改动）：
- verify-manifest.cjs → exit 1（handler 哈希与冻结清单不一致——本批合法修改）
- build-review.cjs → exit 1（AST 查找旧字节+128 边界代码块不再存在）
- vitest.review.config.ts（review.test.ts 5 项冻结用例）→ 2 failed | 3 passed：
  两个失败正是本批修复的两个缺陷复现（字节公式算术 + 「无按模型/协议边界证据仍全放行」），
  3 个通过项（规则/缓存拒绝、模式隔离、正常与失败流程）确认既有成果未被破坏
```

均定向隔离运行、本地工具、合成数据；零真实库/模型/组件执行、零支付/配置或合同切换/迁移/seed/退款/补账/费用/部署；未读取或打印真实密钥；未全量测试；未花钱跑模型。

## 五、数据影响与未验证项

- 零真实数据影响。部署影响说明：注册表中 `contextLimit` 未登记（0/空）或非法的平台模型，其固定点数兼容路径将诚实拒绝执行（此前会以字节估算放行）——运维需保证模型注册表的 contextLimit 真实有效；这是本批止损语义的预期结果，不是缺陷。
- 未验证：真实供应商分词与上下文行为（字节方案已整体移除，不存在其适用性验证需求）；真实 MySQL；浏览器 DOM；多步/重试编排路径；其他模型调用入口（refine-prompt 等）仍不在范围。
- 名义点数预算 ≠ 现金收入；利润率/补贴/运营成本仍需商业决策，本批未设任何数字。

## 六、回滚说明

用 `docs/reviews/R0-H2-fix-snapshot/frozen-source/` 三个副本覆盖对应文件即回到 R0-H1 结束状态；无 schema/DDL/环境变量依赖。

**N01—N05 通过即停止交回；不进入 F12，不追加一般优化。**
