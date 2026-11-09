import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
const h=vi.hoisted(()=>({started:0,active:0,pending:[] as Array<()=>void>,listeners:[] as Array<{n:number;resolve:()=>void}>}));
vi.mock('officeparser',()=>({OfficeParser:{parseOffice:vi.fn(async()=>{
 h.started++;h.active++;for(const x of h.listeners)if(h.started>=x.n)x.resolve();
 return await new Promise(resolve=>h.pending.push(()=>{h.active--;resolve({toText:()=> '这是一份可供研发分析的正常文档，包含项目背景、需求和具体交付内容。'});}));
})}}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>({valid:true,user:{id:'offline-u1'}}))}));
const observations:any[]=[];
function started(n:number){if(h.started>=n)return Promise.resolve();return new Promise<void>(resolve=>h.listeners.push({n,resolve}));}
function finishAll(){for(const f of h.pending.splice(0))f();}
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();h.started=0;h.active=0;h.pending=[];h.listeners=[];});
afterEach(async()=>{finishAll();await Promise.resolve();vi.clearAllTimers();vi.useRealTimers();});
describe('Original F14 current-code offline preflight, controlled parser only',()=>{
 it('WithTimeout abort deadline does not settle or stop the Office parser and accepts its late text',async()=>{
  const {extractTextFromBufferWithTimeout}=await import('@/lib/text-extract');let settled=false;
  const p=extractTextFromBufferWithTimeout(Buffer.from('controlled document'),'sample.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',10);p.then(()=>{settled=true;});
  await started(1);await vi.advanceTimersByTimeAsync(25);expect(settled).toBe(false);expect(h.active).toBe(1);
  finishAll();const result=await p;expect(result.length).toBeGreaterThan(0);
  observations.push({name:'office-timeout-not-enforced',requestedDeadlineMs:10,elapsedVirtualMs:25,settledAtDeadline:false,activeAfterDeadline:1,lateTextAccepted:true});
 });
 it('extract-text route returns timeout then admits a fourth parser while first three are still alive',async()=>{
  const {POST}=await import('@/app/api/studio/extract-text/route');
  const file=Object.assign(new Blob(['controlled document'],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),{name:'sample.docx'});
  const req=()=>({headers:new Headers({authorization:'Bearer offline'}),formData:async()=>new Map([['file',file]])}) as any;
  const first=[POST(req()),POST(req()),POST(req())];await started(3);await vi.advanceTimersByTimeAsync(60001);const responses=await Promise.all(first);
  expect(responses.map(r=>r.status)).toEqual([400,400,400]);expect(h.active).toBe(3);
  const fourth=POST(req());await started(4);expect(h.active).toBe(4);finishAll();const r4=await fourth;expect(r4.status).toBe(200);
  observations.push({name:'route-timeout-releases-slot-before-parser-stops',declaredPerUserLimit:3,firstResponseStatuses:responses.map(r=>r.status),activeAfterThoseResponses:3,activeAfterFourthAdmission:4,fourthStatus:r4.status});
 });
});
afterAll(()=>require('node:fs').writeFileSync(require('node:path').join(process.cwd(),'docs/reviews/R0-J6-independent-review/F14-preflight-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'current route/helper; controlled OfficeParser promise, fake time and auth; no real file, DB, OCR, cloud, model, fee or network',observations},null,2)));
