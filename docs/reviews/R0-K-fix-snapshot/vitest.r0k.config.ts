import { defineConfig } from "vitest/config";
import path from "node:path";

/** R0-K 精确隔离测试专用配置：只跑本批新增文件，别名为项目真实 src。 */
const root = path.resolve(__dirname, "../../..");
export default defineConfig({
  resolve: { alias: { "@": path.join(root, "src") } },
  test: {
    root,
    environment: "node",
    include: ["src/app/api/__tests__/r0k-parse-resource.test.ts"],
    fileParallelism: false,
    isolate: true,
    testTimeout: 30000,
  },
});
