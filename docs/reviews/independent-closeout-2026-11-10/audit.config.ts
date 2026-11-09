import{defineConfig}from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},test:{environment:'node',fileParallelism:false,testTimeout:10000,include:['docs/reviews/independent-closeout-2026-11-10/*.test.ts']}});
