# R0-I 修复报告：原方案 F12 —— BYOK 任务收费口径未确认时安全暂停

**状态：R0-I 待独立复核**（不进入 F13、不部署）

交付内容 = **未确认收费路径的安全暂停**，不是 BYOK 新收费规则上线。原 F11（R0-H/H1/H2）保持冻结；正式 BYOK 商业收费/恢复待负责人决定付款责任、费率、用量口径、保底、退款与生产门槛后单独授权。

---

## 一、开始基线与结束哈希

| 项 | 值 |
|---|---|
| 快照路径 | `docs/reviews/R0-I-fix-snapshot/manifest.json` + `frozen-source/`（7 文件修改前副本 + SHA256，扩展名 `.snapshot.txt`） |
| 真实采集时间 | `2026-11-07T17:13:51+08:00`（manifest.capturedAtReal） |
| 开始 SHA256 | handler `743dc697…` / estimate 路由 `41530f58…` / byok-preview `f5334ed8…` / 布局页 `97943f90…` / 策略页 `f4cfe128…` / 管理页 `5f4736ca…` / 测试 `11313a7e…`（与 R0-H2 结束哈希一致） |
| 结束 SHA256 | handler `f9c63646…` / estimate `8a2fd467…` / preview `099c797e…` / 布局页 `9af127d8…` / 策略页 `93a7e73e…` / 管理页 `1583e06f…` / 测试 `2c0bac24…`（`after-hashes.json`） |

**修改差量**：handler（早期估价块 BYOK 估算→暂停；最终解析后新增 BYOK 暂停检查；配额重置/配额行两步移至最终裁决之后；imports 清理）；estimate 路由（BYOK 分支改为暂停响应，删除估价调用）；byok-preview 路由（同暂停事实）；布局页（估价 blocked 分支）；策略页与管理页（文案）；测试重组（BYOK 7 点→暂停契约 + 交错/auto + 报价路由用例）。费率（1500bps 保持已存值）、售价、保底、点数兑换、markup、结算开关/白名单、历史账本：零改动。

## 二、服务端实现（I01—I03）

### 暂停裁决位置（两处，均先于一切资金/任务副作用）

1. **早期模型裁决**（合同能力估价块内）：解析结果 `USER_BYOK` → 立即 409，**先于** `estimatePoints`（不存在"估价异常吞掉后继续"）、先于配额重置写入。
2. **最终模型裁决**（`modelPlan = resolvedPlan` 之后、`createModelAdapter`/配额重置/扣点/hold/任务创建/execute 之前）：再核对最终计划——**auto/默认命中 BYOK、显式 byo: 部署、前后两次解析交错为 BYOK 均在此被拦**；判定只依据服务端解析的计划（`resolvePricingSource(modelPlan.deploymentId)`），不读客户端来源/费率/标记。
3. **配额重置与配额行确保移至最终裁决之后**：BYOK 暂停不产生任何配额重置写入（I02 的"任何配额重置写入之前"）。
4. 有价/缺价/估价异常**都不能绕过**：暂停先于估价调用（测试断言 `estimatePoints` 零调用），旧"价格不可用回退固定点数"执行行为已删除。

**稳定响应**：HTTP 409、`success:false`、`code: "BYOK_BILLING_POLICY_UNCONFIRMED"`、文案含「自带模型（BYOK）的任务调用暂不可用：平台收费口径待确认。本次未扣除算力点、未调用模型服务；您的模型配置与绑定已保留…」。生产结算开关/ALL/WHITELIST 不构成放行后门（暂停检查独立于 settlementFeatureEnabled，且原结算分支原样保留）。

## 三、报价接口与页面（I04/I05）

| 入口 | 行为 |
|---|---|
| `GET /api/billing/estimate`（BYOK 命中） | `success:true` 封套内 `blocked:true, canExecute:false, code:"BYOK_BILLING_POLICY_UNCONFIRMED", points:null, yuan:null, blockedReason 同码, message 暂停说明`；不调用估价（暂停先于估价）；身份/归属校验与 GET 只读保持（401/403 用例通过、零写入断言通过） |
| `GET /api/billing/byok-preview` | 同一暂停事实（blocked/canExecute/稳定码/points+yuan=null）；`byokServiceRateBps` 仅作已存配置展示（不宣称 Studio 任务收费生效）；403 保持、零写入 |
| 平台模型 estimate | 不误拦：固定点数报价正常返回（对照用例 `basis:"FIXED_POINTS", points:100`） |
| 布局页（真实回调受控执行，3/3 场景通过） | 场景1 估价返回暂停 → toast 展示暂停说明、busy 恢复 false、**未发送执行 POST**（暂停发生在估价返回后）、无伪造任务/成功提示/本地成功标记；场景2 POST 409 → 后端暂停说明展示、busy 恢复、无假任务；场景3 平台模型正常成功对照（不误拦） |
| 策略页（WorkspaceModelPolicyTab） | 两处「平台另收 X% 服务费」改为「任务调用暂不可用（收费口径待确认），绑定与默认设置已保留」——不把"已绑定/已设默认"表述成可执行 |
| 管理页（byok-service-rate.tsx） | 「保存后立即对系统估价与结算口径生效」→「费率仅作为已存配置展示：自带模型任务调用当前暂停（收费口径待确认），不会用于当前任务收费」；费率数值与保存功能保留 |

**如实声明**：BYO 连接测试与其他模型调用入口不在本批范围——`refine-prompt` 润色链与连接测试仍可能调用供应商（handler 的 estimatePoints import 因润色分支保留），不能报告"所有 BYOK 外部调用均被暂停"。

## 四、I01—I07 逐项结论（真实 runStudioPost / 真实 GET handler / 受控页面回调）

| 项 | 证据 |
|---|---|
| I01 显式 BYOK | `deploymentId:"byo:w1"` + 有价（含 1e12 高成本）→ 409 稳定码；`estimatePoints` 零调用、consume/hold/execute/refund 全 0、任务/流水 0；估价异常（mockRejectedValue）同样暂停且估价仍未调用——缺价/异常不回退固定点数 ✅ |
| I02 默认与交错 | auto 命中 BYOK（deps 返回 byo 计划）→ 409 零副作用；交错夹具（早期解析平台计划、最终解析 BYOK）→ 最终裁决 409，零扣点/hold/execute/任务/流水 ✅ |
| I03 各报价与模式 | 有价/估价异常均暂停（I01 用例）；0 服务费/0 基础价由"暂停先于估价"天然覆盖（estimatePoints 从不被调用）；客户端伪造来源/价格/费率不参与判定（仅读服务端计划）；合成结算 ALL 亦不构成放行（暂停检查独立于结算开关，I03 用例中结算配置为 ALL 仍 409） ✅ |
| I04 只读预览 | estimate/byok-preview 两条 GET：暂停状态与 POST 一致、points/yuan=null；401/403 保持；平台模型对照不误拦；全部 GET 零写入断言（写操作日志过滤为空）、`estimatePoints` 零调用 ✅ |
| I05 页面 | `verify-byok-pause-pages.cjs`（本批新增，TS AST 提取**真实** handleExecuteSimulation 回调 + vm 受控执行）：3/3 场景通过（见第三节）；标注为受控回调执行，非浏览器 DOM ✅ |
| I06 已冻结成果 | 11 文件 387 项回归通过：平台固定点数正常成功、F11 边界缺失/超预算拒绝、未知规则/缓存拒绝、平台测试结算 hold、失败原路退款调用、A—G 全部保持 ✅ |
| I07 证据交付 | 见本报告与快照；tsc exit 0 ✅ |

**测试变动说明**（按提示词允许）：R0-H2 的「BYOK 7 点成功」用例按本批明确变更改为 BYOK 暂停契约（409 + 零副作用 + estimatePoints 零调用），并新增 auto/交错/估价异常/报价路由等用例（净增 6）；平台、金额、规则、退款、模式隔离断言无一削弱。冻结审核材料（R0-H2 review.test.ts 等）零改动——其 1 个失败项即旧 BYOK-7 点断言，属预期（已核验其余 5 项通过）。

## 五、实际命令与退出码

```text
npx vitest run --no-color src/app/api/__tests__/r0h-cost-admission.test.ts
→ 1 file, 24 tests passed, exit 0（R0-H2 的 18 用例重组 + 净增 6）

npx vitest run --no-color src/app/api/__tests__/r0f-maintenance-readonly.test.ts
  … （11 个定向文件，同 R0-H2 清单）
→ 11 files, 387 tests passed, exit 0

npx tsc --noEmit --incremental false -p tsconfig.json
→ exit 0，无诊断输出

node docs/reviews/R0-I-fix-snapshot/verify-byok-pause-pages.cjs
→ RESULT: 3/3 scenarios passed, exit 0（真实回调受控执行，非浏览器 DOM）

node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
→ RESULT: 10/10 checks passed, exit 0

冻结证据（预期，零改动）：R0-H2 review.test.ts 6 项中 1 failed（旧 BYOK-7 点断言）/ 5 passed；
build-review.cjs / verify-manifest.cjs 因 handler 合法变更哈希/结构不再匹配而失败。
```

零真实数据库/模型/支付/短信/配置或合同切换/迁移/seed/退款/补账/清理/部署；未读取或打印 .env 与真实密钥；未全量测试；未执行真实连接测试。

## 六、数据/账务影响与未验证项

- 零真实数据操作；历史账本、默认模型/绑定/费率配置零改动、零重算、零退款。
- **未验证**：浏览器 DOM、真实供应商调用、真实分页交互、其他 BYOK 入口（连接测试/refine-prompt）的供应商调用行为——已如实标注可能仍调用供应商。
- **恢复前提（待负责人决定 + 单独授权）**：付款责任（代付采购 or 平台代收）、实际费率与 15%/115% 口径错误、用量计量口径、单次保底、退款规则、生产门槛；授权前本暂停不解除。恢复时不得把「已配置/已绑定」直接当作可执行承诺。

## 七、回滚说明

用 `docs/reviews/R0-I-fix-snapshot/frozen-source/` 七个副本覆盖对应文件即回到 R0-H2 冻结状态（恢复旧 BYOK 收费行为）；无 schema/DDL/配置依赖。

**I01—I07 通过即停止交回；不进入 F13，不追加一般优化。**
