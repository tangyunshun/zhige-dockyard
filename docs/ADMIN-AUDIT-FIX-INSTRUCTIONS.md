# 管理后台《交付自查清单》修复实现指令

> 依据：2026-11-03 对 `/admin` 全部 33 个页面按《功能页面开发与交付自查清单》（7 维度）的全量审查报告。
> 执行原则：**外科手术式修改**——只改本指令点名的文件与位置，禁止顺手重构、禁止改无关格式与注释；公共组件改动必须保持旧调用方行为完全不变。
> 每批完成后统一验收：`npx tsc --noEmit` 0 错误 → `npx vitest run` 全过 → `npm run build` 通过 → 浏览器实测本批点名的页面。

---

## 指令一：公共层基建（最先做，后续批次全部依赖）

### 1a. `src/components/ConfirmDialog.tsx` 增加「输入文字确认」+ Esc 关闭

新增 prop：

```ts
requireText?: { expect: string; hint?: string };
```

实现要求：
1. `requireText` 存在时，在警告信息（warnings）与操作按钮之间渲染输入区：
   - label 文案用 `requireText.hint`，缺省为 `请输入「{expect}」以确认执行此操作`
   - input 单行，样式复用现有 `input` 输入区（`w-full px-3.5 py-2 bg-slate-50 border ...`）
2. 确认按钮校验：`requireText` 存在时，输入值 `trim()` 后与 `expect` **完全一致**才允许提交；不一致时点击按钮给出红字提示（样式复用现有 `inputError`），且**不调用 onConfirm**
3. 输入不匹配期间确认按钮保持可点（用于触发红字提示）但逻辑拦截；输入匹配后恢复
4. 弹窗关闭/重新打开时清空输入值（复用 `isOpen` 的 useEffect 重置逻辑）
5. Esc 关闭：`isOpen === true` 时在 `document` 上注册 `keydown` 监听，`e.key === "Escape"` 调用 `onCancel()`；useEffect 返回清理函数移除监听
6. **兼容性红线**：现有所有调用方（不传 `requireText`）的行为、渲染、按钮状态必须与改动前完全一致

### 1b. `src/components/ConfirmModal.tsx` 同等改造

- 同样增加 `requireText?: { expect: string; hint?: string }`，渲染与校验规则同 1a
- 同样加 Escape 监听 → `onCancel()`
- 注意该组件用 `createPortal`，监听逻辑一致即可

### 1c. `src/components/GlobalConfirmProvider.tsx`

- `ConfirmOptions` 接口增加 `requireText?: { expect: string; hint?: string }`
- 渲染 `<ConfirmModal>` 时透传该字段；`handleConfirm` 前无需额外校验（由 ConfirmModal 内部拦截）

### 1d. 新建 `src/utils/format.ts`

```ts
// 全部对 null/undefined/NaN 返回 "-"
export function formatDateTime(v: string | Date | null | undefined): string;
// 输出 "YYYY-MM-DD HH:mm:ss"，本地时区，补零
export function formatDate(v: string | Date | null | undefined): string;
// 输出 "YYYY-MM-DD"
export function formatNumber(n: number | string | null | undefined): string;
// 千分位，小数位原样保留（金额先按各页现有逻辑分转元后再传入）
export function maskPhone(p: string | null | undefined): string;
// "182****1234"；非 11 位手机号保留前 3 后 2 打码；空返回 "-"
export function maskEmail(e: string | null | undefined): string;
// "a***@domain.com"（本地部分仅保留首字符 + *** + @域名）；空返回 "-"
```

### 1e. 新建 `src/hooks/useEscapeKey.ts`

```ts
// isOpen 为 true 时监听 document keydown，Escape 调用 onClose；返回 cleanup
export function useEscapeKey(isOpen: boolean, onClose: () => void): void;
```

### 1f. 新建 `src/components/admin/LoadErrorBanner.tsx`

- props：`{ message: string; onRetry: () => void; retrying?: boolean }`
- 视觉：红色横幅（`bg-red-50/80 border border-red-200 rounded-2xl`，与系统错误色规范一致），左侧 ⚠ 图标 + `message`，右侧【重试】按钮（`retrying` 为 true 时禁用并显示 spinner）
- 用于指令四各页面主列表加载失败态

**本批验收**：tsc/vitest/build 全过；现有页面（不使用新 props）截图对比无任何视觉与行为变化。

---

## 指令二：高危操作接入「输入文字确认」

统一用指令一的 `requireText`。下表每一行 = 一处改造（行号来自审查报告，允许 ±10 行漂移，以操作语义定位）：

| 页面（src/app/admin/） | 操作 | requireText.expect | 备注 |
|---|---|---|---|
| finance/recharge-orders/page.tsx | **确认收款并自动入账（page.tsx:372-381）** | 该工单号后 6 位 | ⚠ 当前点击立即执行、无任何确认——先补 `deleteTarget` 式确认弹窗（type=danger，正文说明"将自动为用户入账 X 算力点，不可撤销"），再接 requireText |
| users/page.tsx | 彻底清理已注销用户（4580-4721） | `DELETE` | |
| users/page.tsx | 批量删除用户 | `DELETE` | |
| account-appeals/page.tsx | 超管批量删除申诉工单（435-484） | `DELETE` | |
| components/page.tsx | 物理删除组件（1161-1189） | 组件编码（如 C01） | |
| content/page.tsx | 删除阶段（1763-1770） | `DELETE` | |
| documents/page.tsx | 删除文档（886-922） | `DELETE` | |
| documents/page.tsx | 删除自定义分类（574-656） | `DELETE` | |
| operation-logs/page.tsx | 删除审计日志（2303-2337） | `DELETE` | |
| models/page.tsx | 删除供应商（1395）/删除部署（1472） | `DELETE` | |
| maintenance/page.tsx | 删除维护计划 / 发版记录（613-648、780-814） | `DELETE` | |
| membership/levels/page.tsx | 删除会员等级（232-265） | 等级名称 | |
| finance/settlements/page.tsx | 批量删除结算单（496-532） | `DELETE` | 单条删除保持按钮式即可 |

**验收**：不输入指定文字时确认按钮逻辑拦截；输入错误有红字提示；Esc/取消不执行任何请求。

---

## 指令三：敏感字段脱敏（页面渲染层）

统一使用 `maskPhone` / `maskEmail`。**API 返回结构一律不动**（保证导出 Excel、复制等管理功能拿到完整数据）。

接入清单（渲染处替换，行号 ±10）：

| 页面 | 位置 | 字段 |
|---|---|---|
| users/page.tsx | 2330-2335、2548-2556、3321 | phone、email |
| account-appeals/page.tsx | 1073-1075、1340-1367 | 申诉人 phone/email（一键复制按钮保留完整值复制） |
| demo-requests/page.tsx | 202、204 | email、电话 |
| upgrade-applications/page.tsx | 290、383 | contactPhone、user.email |
| tenants/page.tsx | 750-764、933 | 成员 email |
| administrators/page.tsx | 750-752 | 候选用户 email |
| orders/page.tsx | 630、789、791 | 充值用户 phone/email |
| operation-logs/page.tsx | 1898、2171、2182 | email、`手机号：${phone}` |
| membership/users/page.tsx | 386、395 | email、phone |
| membership/logs/page.tsx | 384、393 | email、phone |
| membership/orders/page.tsx | 489 | email（Excel 导出保留完整值，不改） |
| membership/levels/page.tsx | 历史弹窗 email | email |
| testimonials/page.tsx | 614-619 | 提交人 email |
| notifications/page.tsx | 1770、2208、3071、3110 | 用户 email |
| refund-requests/page.tsx | 351、357、510 | 申请人/审批人 email |
| workspaces/page.tsx | 1927 | 管控弹窗成员 phone |
| documents/page.tsx | 2960 | 历史版本操作者 email |

**交互补充（仅 users、account-appeals、demo-requests 三页）**：脱敏字段旁加「👁 显示」切换按钮，点击后本行临时显示完整值（state 按行 id 记录），再点恢复脱敏。其余页面不加切换。

---

## 指令四：错误态 + 重试按钮（LoadErrorBanner 统一接入）

改造模式（每页相同）：
1. 新增 `const [loadError, setIsLoadingError] = useState<string | null>(null);`
2. 主列表 load 的失败分支（`!res.ok` 与 `catch`）：`setLoadError(具体信息)`；成功分支清空
3. 渲染层三分支互斥：`loading → 骨架/转圈`；`loadError → <LoadErrorBanner message={loadError} onRetry={load} retrying={loading} />`；否则 `空态 / 列表`
4. **严禁**在 loadError 非空时渲染"暂无 XX 数据"空态

页面清单（file:line 为审查证据，按语义定位）：
`workspaces:226`（当前静默吞错，最严重）、`preferences:71`（静默）、`administrators:149`、`users:540`、`account-appeals:213`、`quota-apply:76`、`system-status:126`、`maintenance:211`、`demo-requests:159`（已有红条，补重试按钮）、`components:907`、`content:306`、`models:1093`、`platform-defaults:104`、`testimonials:158`（主列表，待审核区已有）、`notifications:536`、`orders:133`、`finance/points:93`、`finance/settlements:231`、`finance/refund-requests:100`、`finance/recharge-orders:270`（已有文字，补按钮）、`membership/levels:192`、`membership/users:220`、`membership/orders:246`、`membership/logs:106`、`operation-logs:1744`（已有提示条，补按钮）、`knowledge-categories:91`、`components/contracts:507`、`workspace/plans:200`、`workspaces/model-policy:242`。

**特别**：`system-status` 加载失败时**禁止回退渲染默认值**（健康度 100 分/延迟 0ms/“正在检测中”），必须显示错误态；`services` 表 data 为空时 tbody 渲染一行空态（colSpan 合并）。

---

## 指令五：搜索防抖 + 定时器清理

### 5a. 搜索防抖（300ms）
两种接法任选其一（与页面现状改动最小者优先）：
- 换用 `src/components/common/SearchInput.tsx`（自带 300ms 防抖 + 清除按钮 + Enter，样式与其他后台页一致）
- 或保留现有 input，将「onChange 直接 setState 触发请求」改为「onChange setState + useEffect 对该 state 做 300ms debounce 后再请求」（参考 notifications 用户搜索 565 行的既有实现）

页面：`users:1922`、`demo-requests:114`、`documents:1363`、`knowledge-categories:288`、`membership/users:259`、`membership/orders:343`、`membership/logs:260`、`components:1632`、`content:704`、`notifications:1542`（主搜索）与 `notifications:358`（historySearch）。

### 5b. 定时器/监听 unmount 清理
- `tenants/page.tsx:257、267`：searchTimer/detailSearchTimer 改到 useEffect 内管理并在 cleanup clearTimeout
- `workspace/plans/page.tsx:209`：同上
- `operation-logs/page.tsx:1129`：复制成功提示的 setTimeout 存 ref，unmount clearTimeout
- `users/page.tsx`：指令七删除自造 showToast 后此项自然消除

---

## 指令六：时间与数值格式统一（使用 `src/utils/format.ts`）

### 6a. 时间格式规则（按功能决定，不是一刀切）
| 场景 | 用法 |
|---|---|
| 操作/交易/审批/审计/登录等**精确时刻** | `formatDateTime`（YYYY-MM-DD HH:mm:ss） |
| 纯日期语义（生效日、过期日、仅日期列） | `formatDate`（YYYY-MM-DD） |
| 近因展示（"x 分钟前"） | 保留相对时间，title 悬浮显示 formatDateTime 绝对时间 |

替换清单——**formatDateTime**：`demo-requests:197`、`upgrade-applications:86`、`account-appeals:649`、`analytics:292`、`users:2630/4183/4186`、`system-status:262`、`components:2443-2447`、`contracts:1697/2850`、`testimonials:101-106`、`notifications:1839/2235/3468`、`orders:662/941/979`、`documents:1747/2955`、`operation-logs:926-936`、`finance/points:380`、`finance/settlements:975`、`finance/refund-requests:62`、`finance/recharge-orders:301`、`membership/orders:467`、`settings:3749`、`posts:2507`、`administrators:585`、`models:1296`。
**formatDate**：`components:2092`、`content:902-907`、`membership/logs:130`、`membership/users:64`、membership/levels 生效日期列。
**保持不变**：models `formatTestedAt`（956-962 已达标）、tenants 自实现的 YYYY-MM-DD HH:mm:ss、preferences 相对时间（补 title 绝对时间）。

### 6b. 数值千分位（formatNumber）
`orders:361/595/729`（金额）、`finance/settlements:923-937`（点数）、`finance/recharge-orders:306/331`、`finance/refund-requests:342/512`、`membership/orders:537`、`membership/levels:787-790`、`system-status:674-780 与 281-291`（统计卡与导出）、`notifications:1434/2463/2517`、`components:1583/2088`、`tenants:774/1804`、`posts:1034`、`platform-defaults:400`、`models:3538/3556`、`finance/points:391`（折算金额）。

### 6c. 需核对单位（先查后改）
`membership/page.tsx:301/307` totalRevenue / monthRevenue：与 orders 同源 amount（单位：分）核对，若未 `/100` 则分转元并加千分位。

---

## 指令七：console 清理 + Toast 归一

1. **`membership/levels/page.tsx`（最高优先）**：删除全部 console.log（约 17 处）。其中 **158 行打印 authToken 属安全问题**，必须最先删除
2. `membership/users/page.tsx:207-229`：删除约 8 处 console.log
3. `workspaces/page.tsx:233-235`：删除 3 处（"API 返回的数据/统计数据/总数"）
4. `permissions/page.tsx:947`：删除 1 处
5. `src/app/api/admin/users/route.ts:139`：删除服务端 console.log
6. `users/page.tsx:1535-1558`：**删除自造 DOM 版 showToast（innerHTML 拼接，存在注入风险且 setTimeout 未清理）**，页面改用全局 `useToast`（`@/components/Toast`），原有调用点逐一替换
7. `users:978/1083`、`analytics:55`、`account-appeals:220/281`、`admin/page.tsx:276/288`、`system-status:140/307`：页面级 console.warn/log 调试残留删除（**catch 块内的 console.error 保留**，属错误日志规范）
8. `demo-requests:92-98`：标记已联系/关闭/重置成功后补 `toast.success(...)`
9. 断网文案统一：全局 Toast 中"网络异常"类文案统一为"网络已断开，请检查网络连接"（仅改文案，不改逻辑）

---

## 指令八：后端分页补齐（仅数据量会大的表）

### 8a. `finance/recharge-orders`（最高优先，当前全量渲染）
- API：充值工单查询路由（该页调用的 admin route）增加 `page/pageSize/status/keyword` 参数，Prisma `skip/take` + `count` 返回 `{ list, total, page, pageSize, totalPages }`，对齐 `api/admin/billing-records` 的既有分页写法
- 前端：接 `Pagination` 组件（复用 orders 页的分页区写法），状态/搜索筛选走服务端

### 8b. `upgrade-applications`
- `api/admin/upgrade-applications/route.ts:28` findMany 加 `page/pageSize`（同 8a 模式）；前端接分页

### 8c. `finance/refund-requests`
- 从「status=ALL 全量拉取 + 前端过滤分页」改为后端 `page/pageSize/status/keyword` 筛选分页

### 8d. `administrators` 候选用户弹窗
- 去掉 `users/page.tsx` 数据源的 `limit=400` 硬编码消费：候选列表改为「输入关键字 ≥2 字符时调 `/api/admin/users?search=xx&limit=20`」实时搜索（300ms 防抖），默认展示最近创建的 20 个用户

**暂缓项（数据量小，本轮不做，列此备查）**：posts 标准岗位全量、models 前端切片分页、contracts limit=500 组件目录、testimonials 分组列表。

---

## 指令九：交互细节补齐

### 9a. Esc/Enter 键盘接线
- 各页自定义弹窗（`fixed inset-0` 结构）接 `useEscapeKey(isOpen, onClose)`：`models`（供应商/部署/价格弹窗）、`content`（新增/编辑/删除）、`testimonials`（编辑弹窗）、`notifications`（推送/偏好调优/成员管理）、`maintenance`（计划/发版编辑）、`quota-apply`（审批弹窗）、`upgrade-applications`（处理弹窗）、`membership/levels`（新增/编辑）、`workspace/plans`、`tenants`（详情弹窗）、`settings`（4 处）、`workspaces`、`orders`（详情弹窗）、`operation-logs`（详情弹窗）、`knowledge-categories`（4 处）、`system-status`（巡检报告）、`documents`（5 处）、`contracts`、`components`、`finance/refund-requests`（裁决弹窗）、`membership/token-packs`
- 表单主输入框 Enter 提交（`onKeyDown` 判断 `e.key === "Enter"`）：重点 `workspace/plans` 表单、`settings` 配置表单、`quota-apply` 批准额度输入框、`finance/recharge-account` 表单、`membership/levels` 表单、`upgrade-applications` 备注输入
- 已达标不动的：finance/settlements（Esc/Enter 已实现）、admin/page.tsx 服务弹窗、各页 SearchInput 自带 Enter

### 9b. 按钮 loading/防重复
- `users`：封禁/状态变更确认按钮（3403-3430）加 disabled + `handleChangeStatus`（1023）入口加进行中守卫（ref 标志位）
- `system-status`：导出报表按钮（240-310）点击后 disabled 至生成完成
- `membership/token-packs`：确认下架按钮（688-694）加 disabled/loading
- `knowledge-categories` 空状态：有筛选时加「重置筛选」按钮、无数据时加「新增分类」引导

### 9c. 空状态引导按钮（统一：有筛选 → 「重置筛选」；无数据 → 「新增 XX」入口）
`orders:513`、`finance/points:338`、`finance/settlements:811`、`finance/refund-requests:315`、`quota-apply:207`、`operation-logs:1835`、`membership/levels`（levels 空时补整块空态，当前表格空白）、`membership/token-packs`（packs 空时补空态，当前空网格）、`membership/orders:404`、`membership/logs:310`、`contracts:1413`、`platform-defaults:495`、`workspaces:1172`、`testimonials:731`。

### 9d. 死代码清理
- `system-status:108`：声明未使用的 loading state 删除或接入渲染
- `system-status:570-656`：services 表补空态行（并入 9c）

---

## 指令十：本轮明确不实现（单独立项/不适用）

| 清单项 | 结论 |
|---|---|
| 并发编辑冲突提示（六-2） | 需要热点表加版本号字段 + 全链路改造，建议单独立项（先试点 orders/users 两张表） |
| 长列表虚拟化（四-1） | 指令八完成后无 >100 条一次性渲染场景，不适用 |
| 暗黑模式适配（五-4） | 系统未启用暗黑模式，不适用 |
| 首屏懒加载（四-3） | 后台页面无重图表/重编辑器，暂不适用 |
| 计费与配额前置校验（一-5） | 管理后台无消耗算力点的执行操作，不适用（执行侧已在组件工作台实现） |

---

## 全局回归验收（全部批次完成后）

1. `npx tsc --noEmit` 0 错误
2. `npx vitest run` 全过（当前基线 457）
3. `npm run build` 成功
4. 浏览器抽查（1920×1080）：users / orders / finance/recharge-orders / membership/levels / components / operation-logs / knowledge-categories 七个页面，逐项核对：空态有引导、断网/报错有重试、高危删除需输入文字、手机号邮箱脱敏、时间格式符合场景规则、金额点数千分位、弹窗 Esc 可关、搜索防抖
5. 控制台无 console.log/warn 残留（Network 面板无新增异常请求）
