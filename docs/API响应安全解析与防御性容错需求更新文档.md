# API 响应安全解析与防御性容错功能需求更新文档

## 1. 需求背景
在 Next.js (Turbopack) 架构中，当服务端发生 404（路由不存在）、500（服务内部报错）或重定向拦截时，服务端默认返回以 `<!DOCTYPE html>` 开头的 HTML 页面。如果前端直接执行 `await res.json()`，浏览器控制台会抛出未捕获的 `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON` 崩溃异常。为提升平台稳定性与防御性，需建立统一的 API 响应安全解析防线。

## 2. 功能规范与实现

### 2.1 安全解析工具 `safeJsonResponse`
- **路径**: `src/utils/api-helpers.ts`
- **机制**:
  1. 校验 HTTP 响应标头 `Content-Type` 是否包含 `application/json`。
  2. 若响应为非 JSON（如 HTML 错误页），自动使用 `res.text()` 安全拦截，避免触发 JSON 语法解析崩溃。
  3. 若状态码不为 200/OK，提取 JSON 中的 `error`/`message` 字段或返回结构化错误描述。

### 2.2 核心业务 Hook 防御升级
- **路径**: `src/hooks/useDeleteWorkspace.ts`
- **涉及逻辑**: 工作空间注销状态检查、工作空间注销、个人升级空间注销。
- **效果**: 当接口发生网络抖动或服务端异常返回 HTML 时，页面通过系统级 Toast 进行优雅提示，保证控制台无未捕获异常。

### 2.3 UTF-8 BOM 签名字符清理
- **路径**: `src/app/api/workspace/check-delete/route.ts`
- **处理**: 清除首行 UTF-8 BOM (`\uFEFF`) 字符，确保路由符合 Turbopack / App Router 标准格式。

## 3. UI/UX 与交互一致性
- 拦截到非 OK 响应或 HTML 异常时，统一使用系统提示组件 (`.zg-toast`) 展现友好错误，拒绝原生 `alert` 与控制台崩死。
- 沿用既有样式组件库，保持主色调与设计规范 100% 一致。
