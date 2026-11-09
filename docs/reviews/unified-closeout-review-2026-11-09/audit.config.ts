import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(process.cwd(),'src')}},test:{environment:'node',fileParallelism:false,testTimeout:10000,include:['docs/reviews/unified-closeout-review-2026-11-09/*.test.ts']}});
