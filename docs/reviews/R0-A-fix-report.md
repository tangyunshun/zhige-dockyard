# R0-A 修复交付报告：阻断“绕过付款直接获得会员/付费企业套餐”

- 项目：`zhige-dockyard-web`（知阁·舟坊）
- 执行日期：2026-11-05
- 批准范围：仅修复“用户不能绕过付款直接获得会员或付费企业套餐”这一业务边界，并同步页面状态与提示；不新建支付体系、不发布、不进入下一批。
- 最终状态：**R0-A 待独立复核**

---

## 一、修改文件清单、理由与 diff 说明

> 共 7 个文件修改 + 1 个新增隔离测试文件。其余工作区内的 `M` 均为既有未提交改动（如 `payments/mock/confirm`、`studio/handler`、`auth/register` 等），本批未触碰。

### 1. `src/app/api/membership/upgrade/route.ts`（POST）
- **理由**：原入口在未确认收款的情况下直接 `user.update` 会员等级、改 `workspacequota`、创建 `SUCCESS` 订单与账单、调用 `grantPoints`，构成“绕过付款直接开通”。
- **diff 说明**：删除全部授权逻辑（会员/余额/分桶/有效期变更、`membershiporder`/`billingrecord` 成功写入、`grantPoints` 调用），仅保留完整身份校验。未确认收款直接返回 **403 + `MEMBERSHIP_CHECKOUT_UNAVAILABLE`**，提示“会员在线购买暂未开放，本次没有产生扣款或权益变更”。不写会员、余额、分桶、有效期；不创建成功账单或待支付订单；不调用 `grantPoints`。

### 2. `src/app/api/workspace/upgrade-plan/route.ts`（POST / GET）
- **理由**：原 POST 在未确认收款情况下直接改 `workspace.plan`、配额并生成 `SUCCESS` 账单。
- **diff 说明**：**GET 只读展示完全保留**（与企业套餐页展示一致）；POST 仅保留身份/归属校验，返回 **403 + `WORKSPACE_PLAN_CHECKOUT_UNAVAILABLE`**，提示“该套餐的在线购买流程尚未开放，本次未扣款、未变更套餐”。不再变更 `workspace.plan`/配额、不生成成功账单。移除不再使用的导入（`assertWorkspaceWritable`、`storageMbToBytes`/`WorkspacePlanKey`、`mergeLimits`）与 `generateId` 辅助函数。

### 3. `src/lib/workspace-plan-service.ts`（新增函数）
- **理由**：两个企业创建入口此前共用“常量回退 + 仅当 DB 记录存在才校验”的宽松逻辑，导致“DB 记录缺失/异常→回退代码常量继续建”以及“付费档根本未被拒绝”两大绕过。
- **diff 说明**：新增 `verifyEnterprisePlanForCreation` 与类型 `EnterprisePlanVerifyResult`。严格读取**真实 `workspaceplan` 记录**：
  - 缺失 / 读取异常 → `REJECT(503)`，绝不回退代码常量后继续写入；
  - 已停用 → `REJECT(400)`；不可在线购买（线下定制）→ `REJECT(400)`；
  - 月付/年付价格非合法整数（含 `null`）→ `REJECT(503)`，不得猜成免费；
  - 仅当真实月付与年付价格**均为合法整数 0** → `FREE`（回传真实配置，不回退常量）；
  - 其余（价格 > 0）→ `PAID`。
  该函数只读、不写，两个创建入口共用，避免规则漂移；不影响既有只读展示的 `getWorkspacePlanByKey` 回退语义。

### 4. `src/app/api/workspace/create-enterprise/route.ts`（POST）
- **理由**：原逻辑用 `getWorkspacePlanByKey` 常量回退，且仅在 DB 记录存在时才校验，付费档（PRO/ENTERPRISE）可免费创建企业空间。
- **diff 说明**：用 `verifyEnterprisePlanForCreation` 替换原宽松逻辑。付费档 → **402 + `PAID_PLAN_REQUIRES_CHECKOUT`**，且**拒绝前零写入**（不建空间/配额/成员/装配/赠送/订单）；配置缺失/停用/非在线/价格非法 → 对应 `REJECT`；仅真实配置一致的免费基础档继续原有免费创建（使用真实配置，不回退常量）。

### 5. `src/app/api/user/workspaces/create/route.ts`（POST，ENTERPRISE 分支）
- **理由**：同上的常量回退 + 仅存在时校验的绕过。
- **diff 说明**：ENTERPRISE 分支接入 `verifyEnterprisePlanForCreation`；付费档 → 402 拒绝且无写入；异常配置 → `REJECT`；个人空间固定 `STANDARD` 同样走核验（其免费配置一致时正常创建，**未误伤**）。

### 6. `src/app/pricing/page.tsx`（会员购买入口）
- **理由**：原 CTA“立即支付升级”与确认弹窗文案“确认后将立即开通/支付成功后…”会暗示已付款/已开通。
- **diff 说明**：会员购买 CTA 改为“在线购买暂未开放”；确认弹窗标题/正文/警告改为明确“在线购买暂未开放（演示环境），本次不会产生真实扣款或权益变更”；确认按钮文案改为“确认（演示校验）”；错误提示优先采用后端 `message`。**后端拒绝时走错误分支，不跳转 `upgraded=1`、不显示成功提示**（由后端契约 + 隔离测试保证）。

### 7. `src/components/pricing/WorkspacePlanSection.tsx`（套餐升级）
- **理由**：失败分支仍调用 `onUpgraded?.()`，构成“假成功回调/已升级状态”。
- **diff 说明**：**删除失败分支的 `onUpgraded?.()`**（仅保留回源刷新与错误提示）；升级按钮文案改为“在线购买暂未开放”。后端拒绝时不触发成功回调、不修改本地权益。

### 8. `src/app/api/__tests__/r0a-business-boundary.test.ts`（新增，隔离）
- 全程 mock `@/lib/prisma`、鉴权、组件装配、赠送、缓存；不连接真实数据库或支付。覆盖核验函数、会员入口、套餐入口、两个企业创建入口、个人空间、伪造付款字段。

---

## 二、逐项验收结果

| 验收项（来自 IDE-R0-A-PROMPT / RECHECK） | 结果 |
|---|---|
| 普通用户调用旧会员入口不能直接得权益 | **通过**（返回 403，零写入） |
| 管理员调用旧会员入口同样被阻断 | **通过**（返回 403） |
| 企业所有者调用旧套餐入口不能直接得套餐；其他用户仍被正确拒绝 | **通过**（返回 403，零写入；归属/身份校验保留） |
| 两个企业创建入口均拒绝未付款付费档，且无业务写入/赠送/装配/支付调用 | **通过**（402，断言 `workspace.create`/`workspacequota.create`/`operationlog.create`/`billingrecord.create` 计数为 0） |
| 伪造付款字段（paid/amount/orderNo/paymentMode/simulated）无效 | **通过**（仍 403/402） |
| 未知/停用/配置异常/非法价格不能被当成免费 | **通过**（缺失→503；停用→400；非整数价格→503；均不回退常量） |
| 真实配置一致、符合资格的免费基础创建仍正常 | **通过**（STANDARD 免费 → 200 且 `workspace.create` 计数 1） |
| 个人空间行为没有被误改 | **通过**（固定 STANDARD 免费创建 200，未误伤） |
| 页面失败分支没有假成功或升级回调 | **通过**（已删除 `onUpgraded?.()`；后端拒绝走错误分支） |
| 没有遗留相同业务的绕行入口 | **通过**（已核查其余 `status:"SUCCESS"` 写入点均属充值/资产计费/管理员/合法支付闭环，不在本批） |
| 类型检查（全量 `tsc --noEmit`） | **通过**（exit 0） |
| 隔离回归测试 | **通过**（18/18） |
| 整站生产构建（`next build`） | **未验证**（见第三节） |
| 浏览器真人验证 | **未验证**（见第三节） |

---

## 三、测试命令、类型/构建/页面验证证据与未覆盖项

### 实际测试命令与结果
```
npx vitest run src/app/api/__tests__/r0a-business-boundary.test.ts
# 结果：Test Files 1 passed (1)；Tests 18 passed (18)；Duration ~1.5s
```
测试覆盖：核验函数 6 项 + 会员入口 3 项 + 套餐入口 2 项 + 企业创建/个人空间 7 项。

### 类型检查
```
npx tsc --noEmit -p tsconfig.json   # TSC_EXIT:0
```
覆盖全项目（含新增测试文件），无错误。

### 构建验证
- **未执行整站生产构建**。原因：`git status` 显示工作区已有大量他人未提交修改（约 90+ 文件，涵盖 admin、studio、user 等多模块），在此之上跑 `next build` 会把预存在的、与 R0-A 无关的编译/耦合问题混入本批结论，且构建可能触碰网络/真实服务，不满足“隔离验证”要求。本批以 `tsc` 类型正确性 + 定向隔离测试作为功能正确性证据。

### 页面（浏览器）验证
- **未执行真人浏览器点击验证**。原因同上（工作区非隔离、且与数据库/网络副作用隔离要求冲突）。前端改动为文案与失败分支回调删除，已由：① 后端契约隔离测试（拒绝码与零写入断言）；② 源码逻辑审查（失败分支不再调用 `onUpgraded?.()`、后端拒绝时前端走错误分支）覆盖。建议独立复核阶段在隔离预览环境补一次真人点击（会员购买、企业套餐升级、企业/个人空间创建）以闭环。

---

## 四、对现有工作区修改的保护情况

- 执行前已 `git status`：工作区存在大量他人未提交修改。本批**仅**新增/修改以下文件，未对其它任何文件执行 `reset`/`clean`/覆盖：
  - 修改：`src/app/api/membership/upgrade/route.ts`、`src/app/api/workspace/upgrade-plan/route.ts`、`src/app/api/workspace/create-enterprise/route.ts`、`src/app/api/user/workspaces/create/route.ts`、`src/lib/workspace-plan-service.ts`、`src/app/pricing/page.tsx`、`src/components/pricing/WorkspacePlanSection.tsx`
  - 新增：`src/app/api/__tests__/r0a-business-boundary.test.ts`
- 未运行任何迁移、seed、历史余额修复、价格/权限同步脚本（`tsc`/测试均隔离，不触碰真实库）。

---

## 五、本轮是否发生真实库写入或费用

- **无真实数据库写入**：所有源码改动仅新增“拒绝分支”，未触发任何写入路径；隔离测试全程 mock，未连接真实 MySQL。
- **无费用/外部调用**：未调用真实支付、模型、邮件或短信；未启用真实 Token 结算；未读取或打印密钥。

---

## 六、用户影响、遗留风险与回滚方法

### 暂不可购买的用户影响
- 会员在线购买、空间套餐在线购买在 UI 上明确标注“在线购买暂未开放”；点击会被后端拒绝并给出清晰提示，**不再出现“没有付款却显示已付款/已开通”**。
- 免费创建企业空间 / 个人空间不受影响（既有的免费基础档配置一致时正常开通）。
- 企业创建页的 `spaceType` 选择器（STANDARD/PRO/ENTERPRISE）当前不随请求下发，后端一律按免费 `STANDARD` 创建（见遗留风险 4）。

### 遗留风险（不在本批授权范围内，需各自独立批次处理）
1. **`src/app/api/workspace/upgrade`（个人→企业）免费开通分支**：当 `cycleAmount <= 0` 时直接 `provisionEnterpriseUpgrade`，价格取自 `getWorkspacePlanByKey` 常量回退。若该档在数据库已配置为收费但常量仍为 0，可能被当成免费。该路由涉及“席位并发/企业池回收”，属后续独立批次，本批未改，列为遗留风险。
2. **`src/app/api/payments/mock/confirm`**：仍可按既有 `PENDING` 订单履约（含 `PLAN_UPGRADE`/`SEAT_ADDON`/`RECHARGE`）。本批阻断了“无订单直接开通”，但该履约入口属支付闭环，需在支付批次统一纳入权限/幂等复核。
3. **充值（recharge）、算力加油包等付费入口**：不在本批范围，需各自批次处理。
4. **`workspace-hub/create` 页面 `spaceType` 与后端解耦**：UI 可选 PRO/ENTERPRISE 但后端忽略，统一建免费 STANDARD。属历史不一致，非安全绕行，建议后续对齐；本批未改（不扩大范围）。

### 回滚方法
- 改动均为纯源码（无迁移、无数据写入）。回滚即 `git restore` 还原上述 7 个文件并删除新增测试文件，**无需任何数据库/数据回滚**。

---

## 七、最终状态

**R0-A 待独立复核。**

（本批未宣称全站费用漏洞清零、商业闭环完成、可生产发布或保证盈利；仅完成 R0-A 授权范围内的边界修复、页面同步、隔离验证与报告。）
