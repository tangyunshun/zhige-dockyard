# 工作空间中枢 2.0 聚焦化大重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 彻底重构工作空间中枢（Workspace Hub）页面，砍掉与空间管理不相关的“53个云端组件列表（Card 5）”和“Token 算力趋势曲线（Card 6）”，并对重合、冗余功能实施系统级合并。

**Architecture:** 
1. **后端 API 增强**：在 `/api/user/workspace-hub/dashboard` 接口中，使用 Prisma 额外查询 `loginhistory` 表获取用户最近 3 次登录记录。
2. **两栏式精炼布局 (左 8 右 4)**：
   - **左侧 (8列)**：工作空间管理中枢（合并了空间健康态、三方加固安全策略状态等 Card 1 的数据，彻底去重），支持个人主空间 Tab 和企业协作空间 Tab 切换、进入、扩容、注销，并在底部嵌入“创建企业协作空间”闭环按钮。
   - **右侧 (4列)**：
     - 卡片 1：空间算力配额与 VIP 升级（圆盘进度与升级通道，合入账号特权等级及“开通 VIP”引导按钮）。
     - 卡片 2：加入已有协作空间（邀请码快捷输入加入）。
     - 卡片 3：账号安全与最近登录审计（直接展示从后端获取的 `loginHistory` 真实登录历史数据）。
3. **彻底砍掉组件库罗列与无谓的算力走势**，全站零 Mock 假数据。

**Tech Stack:** Next.js, React, Tailwind CSS, Lucide-React, Prisma, MySQL.

---

### Task 1: 增强后端聚合 Dashboard 数据接口

**Files:**
- Modify: [route.ts](file:///d:/Project%20Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/api/user/workspace-hub/dashboard/route.ts)

**步骤：**
1. 在 `route.ts` 的 `GET` 方法中，新增 `loginHistoryPromise` 常量。
2. 通过 Prisma 查询 `loginhistory` 表中当前 `userId` 的前 3 条记录，按 `loginAt` 降序排列。
3. 把 `loginHistoryPromise` 加入到 `Promise.all` 中并行执行。
4. 在接口的返回 JSON 的 `data` 属性中包含 `loginHistory`。

---

### Task 2: 重构前端 page.tsx 的两栏式 Bento Grid 布局结构

**Files:**
- Modify: [page.tsx](file:///d:/Project%20Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/workspace-hub/page.tsx)

**步骤：**
1. **移除组件库和趋势图逻辑**：
   - 彻底删除 `componentStagesData` 的多余常量数据。
   - 在 `page.tsx` 中移除原本属于 Card 5 (舟坊研发高阶组件库) 与 Card 6 (算力曲线图) 的渲染代码和相关状态/特效逻辑（如不需要的组件过滤逻辑）。
2. **合并去重**：
   - 移除原 `Card 1: 活跃研发环境与状态看板` 的独立展示区域。
   - 将原 Card 1 里的 “系统服务已就绪 🟢”、“安全策略状态：三方加固中 🔒” 等关键指标，精妙地放置在 `Card 3: 工作空间管理中枢` 顶部或个人沙箱详情列表项中，实现极简化信息展现。
3. **两栏大布局重构**：
   - 将页面主体结构调整为 `grid grid-cols-1 md:grid-cols-12 gap-6` 容器。
   - **左半边占 8 列 (`md:col-span-8`)**：渲染 `工作空间管理中枢 (原 Card 3)`，内含个人主空间和企业协作空间的 Tab 切页。在个人主空间详情项中，丰富健康态和加固态指标。在企业协作空间底部，渲染符合极简、高密度设计系统要求的 “+ 创建企业协作空间” 闭环引导卡片。
   - **右半边占 4 列 (`md:col-span-4`)**：依次自上而下渲染：
     - 卡片 1 (占 4 列) - **全局算力配额与账号特权 (原 Card 2 融合版)**：展示 SVG 进度圆环、已用/可用上限，并在显要位置展示用户账号等级（“社区免费极客”）与“开通 VIP 获取企业空间额度”的明显按钮，连通升级流程。
     - 卡片 2 (占 4 列) - **快速加入协作空间 (原 Card 4)**：提供快速输入邀请码入口。
     - 卡片 3 (占 4 列) - **账号安全与最近登录审计 (全新 Card)**：展示一个精致小巧的高安全感卡片，列出最近 3 次的真实登录记录。渲染内容包含“时间”、“登录 IP”与“登录设备/浏览器”，使用 `loginHistory` 数据循环渲染。如果没有登录历史，则显示优雅的“暂无安全审计记录”缺省态。

---

### Task 3: 静态类型与构建验证

**步骤：**
1. 在项目根目录下执行 `npx tsc --noEmit` 进行 TypeScript 秒级类型检查，确保 `page.tsx` 页面重构后没有任何丢失变量、方法名错误或者类型报错。
2. 运行 `npm run lint` 进行 ESLint 静态代码扫描，确保没有残留冗余声明。

---

### Task 4: 浏览器端全量自动化交互与自检

**步骤：**
1. 访问 `http://localhost:3000/workspace-hub`，检查两栏式页面的全局布局渲染。
2. 确认控制台是否包含任何错误日志。
3. 验证 “加入空间” 弹窗是否能正常触发和渲染。
4. 验证个人沙箱和企业协作空间的 Tab 切换，以及“注销空间”红边强警告弹窗的安全验证机制。
5. 验证新版“账号安全与最近登录审计”卡片是否正确从数据库读取并显示了用户的登录记录。
