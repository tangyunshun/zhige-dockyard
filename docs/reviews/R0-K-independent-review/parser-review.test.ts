import {describe,it,expect,vi,afterEach,afterAll} from 'vitest';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import * as XLSX from 'xlsx';
const preview=vi.hoisted(()=>({doc:null as any}));
vi.mock('@/lib/prisma',()=>({prisma:{document:{findUnique:vi.fn(async()=>preview.doc)}}}));
vi.mock('@/lib/security',()=>({requireWorkspaceMembership:vi.fn(async()=>true)}));
vi.mock('@/lib/file-store',()=>({readAssetFile:vi.fn(async()=>Buffer.from('controlled unused preview file'))}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>({valid:true,user:{id:'offline-u1'}}))}));
const observations:any[]=[];
const results=()=>import('@/lib/text-extract');
const request=(file:Blob)=>({headers:new Headers({authorization:'Bearer offline'}),formData:async()=>new Map([['file',file]])}) as any;
function png(w:number,h:number){const b=Buffer.alloc(24);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(b);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;}
function docx(text:string){const z=new AdmZip();z.addFile('word/document.xml',Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:body></w:document>'));z.addFile('[Content_Types].xml',Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));return z.toBuffer();}
afterEach(async()=>{const t=await results();t.__setOcrTestHooks({factory:null,timeoutMs:null});t.__setParseBoundaryTestHooks({taskKind:null});const a=await import('@/lib/parse-admission');a.__setParseAdmissionBackendForTest(null);const r=await import('@/lib/parse-runner');r.__resetParseRunnerHooks();vi.useRealTimers();});
describe('R0-K actual parser lifecycle and budgets, all small offline fixtures',()=>{
 it('positive: normal local worker returns text and confirms stopped',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy');const {runIsolatedParse}=await import('@/lib/parse-runner');const r=await runIsolatedParse({task:{kind:'parse',buffer:Array.from(Buffer.from('Small controlled text')) ,fileName:'safe.txt'},budget:new RootBudget({deadlineMs:5000})});
  expect(r.text).toContain('Small controlled text');expect(r.stopped).toBe(true);observations.push({name:'normal-worker-positive',stopped:r.stopped,textMatched:true});
 });
 it('defect K01: hanging terminate Promise prevents exit grace from ever starting',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy');const {runIsolatedParse,__setParseRunnerHooks}=await import('@/lib/parse-runner');vi.useFakeTimers();let resolveStop!:(n:number)=>void,stops=0,settled=false;
  const w=new EventEmitter() as any;w.terminate=()=>{stops++;return new Promise<number>(r=>resolveStop=r);};
  __setParseRunnerHooks({workerFactory:()=>w,exitConfirmMs:5});const p=runIsolatedParse({task:{kind:'__test_spin'},budget:new RootBudget({deadlineMs:10}),deadlineMs:10});const observed=p.then(()=>{settled=true;return 'ok';},e=>{settled=true;return e.code;});
  await vi.advanceTimersByTimeAsync(100);expect(stops).toBe(1);expect(settled).toBe(false);
  observations.push({name:'terminate-confirmation-unbounded',deadlineMs:10,exitGraceMs:5,elapsedMs:100,settled:false,terminateCalls:stops});resolveStop(1);expect(await observed).toBe('PARSE_TIMEOUT');
 });
 it('defect K02: direct image boundary skips pixel limit before OCR starts',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy');const t=await results();let starts=0,stops=0;
  t.__setOcrTestHooks({factory:async()=>{starts++;return {setParameters:async()=>{},recognize:async()=>({data:{text:'Controlled offline OCR text'}}),terminate:async()=>{stops++;}};}});
  const budget=new RootBudget({limits:{imagePixels:4}});const r=await t.parseWithBoundary(png(100,100),'small-header.png','image/png',{budget});
  expect(starts).toBe(1);expect(r.noText).toBe(false);expect(budget.used.imagePixels??0).toBe(0);
  observations.push({name:'image-pixel-budget-bypass',declaredPixels:10000,allowedPixels:4,ocrStarts:starts,ocrStops:stops,meteredPixels:budget.used.imagePixels??0,textAccepted:true});
 });
 it('defect K01: OCR creation remains outstanding when route returns and releases shared lease',async()=>{
  const t=await results();const {__setParseAdmissionBackendForTest}=await import('@/lib/parse-admission');const {POST}=await import('@/app/api/studio/extract-text/route');let acquired=0,released=0,created=0,terminated=0,resolveFactory!:(w:any)=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r);
  __setParseAdmissionBackendForTest({acquire:async()=>{acquired++;return 'granted';},release:async()=>{released++;return true;},quarantine:async()=>{},sweep:async()=>0});
  t.__setOcrTestHooks({factory:()=>{entered();return new Promise(r=>resolveFactory=r);},timeoutMs:10});vi.useFakeTimers();
  const f=Object.assign(new Blob([new Uint8Array(png(1,1))],{type:'image/png'}),{name:'tiny.png'});const p=POST(request(f));await ready;await vi.advanceTimersByTimeAsync(15);const res=await p;expect(res.status).toBe(422);expect(released).toBe(1);expect(terminated).toBe(0);
  observations.push({name:'ocr-initialization-releases-slot-early',status:res.status,body:await res.json(),acquired,released,initializationStillOutstanding:true,terminatedAtResponse:terminated});
  resolveFactory({setParameters:async()=>{},recognize:async()=>({data:{text:'unused'}}),terminate:async()=>{terminated++;}});created++;await vi.advanceTimersByTimeAsync(1);expect(terminated).toBe(1);void created;
 });
 it('defect K02: successful OOXML parser bypasses tiny inflated-bytes budget',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy');const t=await results();const budget=new RootBudget({limits:{inflatedBytes:8},deadlineMs:10000});const r=await t.parseWithBoundary(docx('Controlled OOXML body with readable text.'),'small.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',{budget,timeoutMs:10000});
  expect(r.text).toContain('Controlled OOXML');expect(budget.used.inflatedBytes??0).toBe(0);observations.push({name:'ooxml-inflation-budget-bypass',allowedInflatedBytes:8,meteredInflatedBytes:budget.used.inflatedBytes??0,textAccepted:true});
 });
 it('defect K02: table preview also skips ZIP expansion budget',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy');const {runIsolatedParse}=await import('@/lib/parse-runner');const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['A','B'],[1,2]]),'small');const data=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});const budget=new RootBudget({limits:{inflatedBytes:8},deadlineMs:10000});
  const r=await runIsolatedParse({task:{kind:'table-preview',buffer:Array.from(data)},budget,deadlineMs:10000});expect(r.rows?.length).toBe(2);expect(budget.used.inflatedBytes??0).toBe(0);observations.push({name:'table-preview-inflation-budget-bypass',allowedInflatedBytes:8,meteredInflatedBytes:budget.used.inflatedBytes??0,rows:r.rows?.length});
 });
 it('defect K02: 21-file archive silently drops remaining entry and returns success',async()=>{
  const t=await results();const z=new AdmZip();for(let i=0;i<21;i++)z.addFile(`part${String(i).padStart(2,'0')}.txt`,Buffer.from('marker_'+String(i).padStart(2,'0')));const r=await t.parseWithBoundary(z.toBuffer(),'small.zip','application/zip',{timeoutMs:10000});
  expect(r.noText).toBe(false);expect(r.text).toContain('marker_00');expect(r.text).not.toContain('marker_20');observations.push({name:'archive-silent-partial-success',entries:21,returnedEntryMarkers:(r.text.match(/--- part/g)||[]).length,missingLastEntry:true,success:true});
 });
 for(const [ext,expected]of [['doc','智慧园区项目立项报告'],['ppt','智慧交通汇报']])it('defect K04: old raw parser succeeds but actual boundary fails legacy '+ext,async()=>{
  const t=await results();const data=fs.readFileSync(path.join(process.cwd(),'src/lib/__tests__/fixtures/legacy/sample-real.'+ext));const old=await t.extractTextFromBuffer(data,'legacy.'+ext);let text='',error:any=null;
  try{text=(await t.parseWithBoundary(data,'legacy.'+ext,'',{timeoutMs:10000})).text;}catch(e:any){error={code:e.code,message:e.message};}
  expect(old).toContain(expected);expect(text.includes(expected)).toBe(false);expect(error?.code).toBe('PARSE_FAILED');observations.push({name:'legacy-boundary-'+ext,oldExpectedText:true,newExpectedText:text.includes(expected),newLength:text.length,error});
 });
 for(const ext of ['xlsx','docx'])it('defect K04: '+ext+' with extracted content loses original rich preview output type',async()=>{
  preview.doc={id:'offline-doc',workspaceId:'offline-ws',title:'sample.'+ext,originalName:'sample.'+ext,fileExt:ext,filePath:'offline-ws/sample.'+ext,fileSize:32,mimeType:ext==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',visibility:'PRIVATE',uploaderId:'offline-u1',content:'Previously extracted plain text'};
  const {GET}=await import('@/app/api/workspace/assets/[assetId]/preview/route');const res=await GET({headers:new Headers({authorization:'Bearer offline'})} as any,{params:Promise.resolve({assetId:'offline-doc'})});const body=await res.json();expect(res.status).toBe(200);expect(body.data.type).toBe('text');
  observations.push({name:'preview-content-format-regression-'+ext,status:res.status,expectedPreviousType:ext==='xlsx'?'table':'html',actualType:body.data.type,cachedExtractedTextPresent:true});
 });
});
afterAll(()=>fs.writeFileSync(path.join(process.cwd(),'docs/reviews/R0-K-independent-review/parser-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'real current runner/boundary/route; local real workers or explicit controlled lifecycle/OCR doubles; small generated and repository test fixtures; no DB, network, customer files, live OCR or fee',observations},null,2)));
