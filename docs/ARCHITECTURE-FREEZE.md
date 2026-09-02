# 🚢 知阁·舟坊 (ZhiGe Dockyard) - 全栈架构冻结文档 (ARCHITECTURE-FREEZE.md)

> **版本**：v1.0.0 (Final Freeze)  
> **更新时间**：2026-08-28  
> **冻结范围**：任务执行契约、端到端响应结构、知识库沉淀逻辑、全栈审计与 RBAC 规则  

---

## 1. 任务执行契约与服务端计价规范

### 1.1 `POST /api/studio` (action = "simulate")
- **后端计价逻辑**：
  - 优先读取请求参数中的 `estimatedTokens` 或组件默认 `tokenCost`。
  - 从用户当前工作空间配额 (`workspacequota`) 中物理扣减 Token 算力。
- **任务存档逻辑**：
  - 在 `componenttask` 表中插入一条任务记录，初始状态为 `SUCCESS`，包含格式化的 `result` JSON（含 `summary`、`conclusions`、`deviations`、`risks` 与 `advices`）。
- **统一响应格式**：
  ```json
  {
    "success": true,
    "taskId": "task_1724838000_xxxx",
    "componentId": "C11",
    "tokenCost": 5,
    "outputData": {
      "summary": "...",
      "conclusions": ["..."],
      "deviations": [{ "clause": "...", "requirement": "...", "contrast": "...", "risk": "..." }],
      "risks": ["..."],
      "advices": ["..."]
    }
  }
  ```

---

## 2. 任务状态机与归档审计

### 2.1 任务状态机
- `SUCCESS`：任务执行成功，可在工作空间、结果 Tab、任务中心查看。
- `FAILED`：任务执行失败。
- `ARCHIVED`：已归档任务。归档后不再在活跃任务列表中展示，但数据库记录保留。

### 2.2 跨空间任务聚合 API (`GET /api/tasks`)
- 聚合当前用户所拥有或作为成员加入的所有工作空间中的 `componenttask`。
- 自动排除 `status = "ARCHIVED"` 的归档任务。

### 2.3 归档审计
- 调用 `POST /api/studio` (action = "archive_task") 时：
  1. 将指定 `taskId` 的 `componenttask.status` 更新为 `ARCHIVED`。
  2. 自动往 `operationlog` 表追加一条审计日志：
     - `action`: `"ARCHIVE_TASK"`
     - `resource`: `"TASK"`
     - `details`: 包含 `taskId` 与 `workspaceId`

---

## 3. 共享前端组件职责划分

### 3.1 `ResultViewer.tsx` (共享结果预览画布)
- **核心职责**：
  - 接收标准化 `outputData` 结构，提供五大可视化渲染块（成果摘要、关键结论、条款偏离比对表、风险清单、建议清单）。
  - 支持 **一键复制 Markdown**、**导出 Word/报告**。
  - 内置 **沉淀到知识库** 触发按钮。
- **防御性容错**：自动容错未格式化的纯文本、Markdown 或解析异常的 JSON，不崩溃、不截断。

### 3.2 `TaskExecutionComposer.tsx` (两栏 Bento 快速任务面板)
- **左侧控制区**：选择组件、设置材料输入、算力成本预估提示、启动分析按钮。
- **右侧画布区**：共享嵌套渲染 `ResultViewer`，支持任务完成后直接预览与沉淀。

---

## 4. 知识库沉淀与企业审核规则

### 4.1 沉淀知识库 API (`POST /api/studio` action = "save_knowledge")
- **完整 Markdown 生成**：
  - 当请求携带 `sourceTaskId` 时，服务端自动加载对应 `componenttask` 的 `result.outputData`。
  - 提取 `summary`、`conclusions`、`deviations` 表格、`risks` 与 `advices`，组装为标准多章节 Markdown，存储至数据库 `document.content` (`@db.Text` 类型)。
- **审核流状态判定**：
  - **个人工作空间** / **系统管理员直接发布**：状态直接设为 `status = "active"`。
  - **企业工作空间普通成员**：状态设为 `status = "PENDING"`，需由企业空间 OWNER 或 ADMIN 审核后通过。

---

## 5. 组件大厅与转场规范

- **绝不伪造**：组件大厅 (`ComponentDispatcherPanelNew.tsx`) 不包含任何仿真器、假调试日志或静态组件硬编码文案。
- **职责聚焦**：只承担组件检索、收藏、工作空间绑定/解绑以及转场跳转至研发空间。
