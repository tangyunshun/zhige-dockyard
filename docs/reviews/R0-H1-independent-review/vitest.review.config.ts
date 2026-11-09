import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({resolve:{alias:{"@":path.resolve(__dirname,"../../../src")}},test:{environment:"node",include:["docs/reviews/R0-H1-independent-review/review.test.ts"],fileParallelism:false,testTimeout:60000}});
