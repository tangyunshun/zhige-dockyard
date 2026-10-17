// Next.js 路由文件只允许导出 HTTP handler 与路由段配置。
// 执行核心（runStudioPost / runStudioGet / buildProductionDeps / markTaskStatusFailed /
// StudioExecutionDeps）位于同目录 handler.ts，供测试与 Open API 复用：
//   - 测试：src/app/api/studio/__tests__/simulate-request-di.test.ts 等
//   - Open API：src/app/api/open/v1/execute/route.ts
export const dynamic = "force-dynamic";
export { POST, GET, DELETE } from "./handler";
