# 导出功能规范（EXPORT-SPEC）

全站导出统一使用 `src/utils/excel-export.ts` 的 `exportToExcel` 工具，并遵循以下规范。
本规范由 EXPORT-UNIFY 批次确立，新增列表页导出默认按此执行。

---

## 一、四步落地规范

1. **筛选查询接口**：数据必须走对应页面已有的查询接口（如 `/api/admin/points/ledger`、
   `/api/admin/recharge-orders`、`/api/user/points` 等），传入当前筛选条件，分页参数设为导出上限
   （默认 5000，见 `src/lib/export-config.ts` 的 `EXPORT_MAX_ROWS`），拉取**全量**数据。
2. **列配置**：使用 `ExcelColumn<T>[]` 声明中文表头（`header`）、字段键（`key`，支持 `a.b` 点路径）、
   列宽（`width`）、以及 `formatter` 做格式化（时间用 `formatExcelDateTime`、金额分转元、带符号数值等）。
3. **调用 exportToExcel**：`{ filename, sheetName, columns, data, maxRows, trace, dateRange? }`。
4. **文件名**（工具自动拼，禁止手写时间戳）：
   - `filename` 只传**业务类型名**（不含「知阁」前缀，如 `用户清单`、`操作审计日志`）；
   - 无时间区间：`知阁_{类型}_{导出日期YYYYMMDD}.xlsx`，例：`知阁_用户清单_20261024.xlsx`；
   - 有时间区间筛选：`知阁_{类型}_({起YYYYMMDD}-{止YYYYMMDD})_{导出日期}.xlsx`，
     例：`知阁_用户清单_(20261002-20261010)_20261024.xlsx`；
   - 区间起止由 `dateRange: { start, end }` 传入，支持 `YYYY-MM-DD` / `YYYYMMDD`，自动规范为 8 位；
   - JSON 导出（操作审计日志）同规则，仅扩展名换为 `.json`。

> 工具行为：数据为空时 `toast.warning` 提示且不生成文件；数据量触达 `maxRows` 时，
> 文件末尾追加一行「已达导出上限 N 条，请缩小筛选范围」。

---

## 二、权限要求（敏感数据导出必须独立 :export 权限点）

- 敏感数据导出按钮必须受独立权限点控制，**不得**复用只读权限。
- 已登记的导出权限点：
  - `user:export`（用户管理模块，label「导出用户清单」）—— 后台「用户清单」导出按钮。
  - `billing:export`（账务管理模块，label「导出账务数据」）—— 算力点流水 / 充值订单 / 退款工单 / 结算记录 四类导出按钮。
- 权限等级：`high`（高危，批量带走敏感信息）。
- 判定方式（前端）：`const { hasPermission, isSuperAdmin } = useAdminPermission();`
  - 无权限时按钮**置灰**（disabled）并 `title` 提示「当前账号未配置导出权限，请联系超级管理员」；
  - 单击置灰按钮时 `toast.warning` 同一提示。
  - **超级管理员不受限制**。
- **服务端兜底（防绕过）**：前端置灰只是第一道；以下五个敏感列表接口在收到 `export=1` 参数时会再次校验对应导出权限，无权限直接返回 `403`：
  - `/api/admin/users` → 校验 `user:export`
  - `/api/admin/points/ledger`、`/api/admin/recharge-orders`、`/api/admin/refund-requests`、`/api/admin/token-settlements` → 校验 `billing:export`
  - 前端五个导出请求均已带上 `export=1`，常规翻页（无 `export` 参数）不受影响。
- 权限点登记位置：`src/lib/permission-rules-engine.ts` 的 `DEFAULT_FEATURE_MODULES`
  （对应模块 `supportedActions` 含 `"export"`），文案/等级由 `EXPORT_PERMISSION_OVERRIDES` 精确覆盖。
- **以后新功能导出**：照此模式 `代码声明（按钮 hasPermission 门控） → 目录登记（模块 supportedActions 加 export + 必要时覆盖 label/level） → 按需分配`。

---

## 三、敏感字段要求

- **允许完整导出**：手机号、邮箱等联系方式的完整值（便于业务联系），不做脱敏。
- **严禁导出**：任何密钥、Token、密码、凭证类字段。导出列中不得出现 `password`、`token`、
  `secret`、`apiKey`、`authorization` 等敏感字段。审计详情导出已通过 `sanitizeAuditDetails` 过滤敏感参数。

---

## 四、留痕要求（所有导出必须带 trace）

- `exportToExcel` 的 `trace` 参数：`{ exportType, filters?, rowCount, page, fileName? }`。
- 文件成功触发下载后，工具 **fire-and-forget** 上报审计：
  - `page` 以 `/admin` 开头 → `POST /api/admin/export-log`（管理员端）；否则 → `POST /api/user/export-log`（用户端本人）。
  - 留痕写入 `operationlog` 表，`action = "DATA_EXPORT"`，`details` 含数据类型、筛选条件、条数、文件名、来源页面。
  - 上报失败**仅** `console.warn`，绝不阻塞用户导出。
- 审计日志页（`/admin/operation-logs`）的 `DATA_EXPORT` 动作转译为
  「导出数据（XX，N 条）」，所有身份可见（谁导了什么，超管可查）。

---

## 五、已知字段偏差（对账必读）

以下导出列因后端查询接口未提供对应字段，按最接近字段映射，非资金数额口径问题：

| 导出点 | 规范列 | 实际数据来源 | 说明 |
|---|---|---|---|
| 算力点流水 | 关联任务编号 | `orderNo`（关联单号） | 算力点流水为账户变动，不关联具体任务，使用关联订单/单号 |
| 结算记录 | 组件名 / 模型 | 接口未返回 | 结算记录仅含 `taskId`，组件名/模型需联表获取，本期未提供；以任务编号标识 |
| 结算记录 | 多退金额 / 少补金额 | `releasedPoints` / `supplementPoints` | 按释放点数 / 补充点数近似呈现 |

> 资金数额（点数、金额、押金、结算点数）一律以接口返回数值为准，导出值须与页面展示一致；
> 若发现数额对不上，立即停止并先查账。

---

## 六、导出点清单（14 个）

| # | 页面 | 数据接口 | 文件名 | 权限点 | trace.exportType |
|---|---|---|---|---|---|
| 1 | /admin/users | GET /api/admin/users | 知阁_用户清单_{YYYYMMDD}.xlsx | user:export | 用户清单 |
| 2 | /admin/workspaces | GET /api/admin/workspaces | 知阁_工作空间清单_{YYYYMMDD}.xlsx | — | 工作空间 |
| 3 | /admin/components | GET /api/admin/components | 知阁_组件清单_({起}-{止})_{YYYYMMDD}.xlsx | — | 组件 |
| 4 | /admin/content | GET /api/admin/content（阶段） | 知阁_组件阶段大纲_({起}-{止})_{YYYYMMDD}.xlsx | — | 内容阶段 |
| 5 | /admin/operation-logs | GET /api/admin/operation-logs | 知阁_操作审计日志_({起}-{止})_{YYYYMMDD}.xlsx（另 .json） | — | 操作审计日志 |
| 6 | /admin/membership/users | GET /api/admin/membership/users | 知阁_会员用户列表_{YYYYMMDD}.xlsx | — | 会员用户 |
| 7 | /admin/membership/orders | GET /api/admin/membership/orders | 知阁_会员订单流水_{YYYYMMDD}.xlsx | — | 会员订单 |
| 8 | /admin/finance/points | GET /api/admin/points/ledger | 知阁_算力点流水_{YYYYMMDD}.xlsx | billing:export | 算力点流水 |
| 9 | /admin/finance/recharge-orders | GET /api/admin/recharge-orders | 知阁_充值订单清单_{YYYYMMDD}.xlsx | billing:export | 充值订单 |
| 10 | /admin/finance/refund-requests | GET /api/admin/refund-requests | 知阁_退款工单清单_{YYYYMMDD}.xlsx | billing:export | 退款工单 |
| 11 | /admin/finance/settlements | GET /api/admin/token-settlements | 知阁_结算记录_{YYYYMMDD}.xlsx | billing:export | 结算记录 |
| 12 | /user/billing-center | GET /api/user/points（本人） | 知阁_我的算力点流水_{YYYYMMDD}.xlsx | —（本人） | 我的算力点流水 |
| 13 | /admin/workspaces（成员） | 见工作空间导出 | 见工作空间导出 | — | 工作空间 |
| 14 | /admin/components（见组件导出） | 见组件导出 | 见组件导出 | — | 组件 |

> 表中 13/14 指工作空间与组件的导出入口在不同 tab；均未受独立导出权限限制（非敏感批量数据），
> 如需收紧可后续登记 `workspace:export` / `component:export`。

---

## 七、导出上限配置

- `systemconfig` 键 `export.maxRows`，默认 5000（见 `src/lib/export-config.ts`）。
- 服务端读取：`getExportMaxRows()`；客户端通过 `useExportMaxRows()` hook 挂载时拉取 `/api/export-max-rows` 读取实时值（默认 5000 兜底，网络/鉴权失败静默保留默认）。
- 后台「系统设置」页可编辑该值；达到上限时文件末尾追加提示行（见第一节）。
