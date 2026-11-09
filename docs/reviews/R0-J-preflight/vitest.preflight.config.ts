import {defineConfig} from 'vitest/config';import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve(__dirname,'../../../src')}},test:{environment:'node',include:['docs/reviews/R0-J-preflight/storage-facts.test.ts'],isolate:true,fileParallelism:false}});
