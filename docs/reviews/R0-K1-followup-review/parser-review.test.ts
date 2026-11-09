import {describe,it,expect,vi,afterEach,afterAll} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import AdmZip from 'adm-zip';import * as XLSX from 'xlsx';
const h=vi.hoisted(()=>({doc:null as any,buffer:null as Buffer|null}));
vi.mock('@/lib/prisma',()=>({prisma:{document:{findUnique:vi.fn(async()=>h.doc)}}}));
vi.mock('@/lib/security',()=>({requireWorkspaceMembership:vi.fn(async()=>true)}));
vi.mock('@/lib/file-store',()=>({readAssetFile:vi.fn(async()=>h.buffer)}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>({valid:true,user:{id:'u1'}}))}));
const observations:any[]=[];
function docx(text:string){const z=new AdmZip();z.addFile('word/document.xml',Buffer.from('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+text+'</w:t></w:r></w:p></w:body></w:document>'));z.addFile('[Content_Types].xml',Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));return z.toBuffer();}
function sheet(compression=false,bookSST=false){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Product','Quantity'],['Widget '+ 'A'.repeat(1000),42]]),'Sheet1');return XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression,bookSST}) as Buffer;}
afterEach(async()=>{(await import('@/lib/text-extract')).__setOcrTestHooks({factory:null,timeoutMs:null});(await import('@/lib/parse-admission')).__setParseAdmissionBackendForTest(null);(await import('@/lib/parse-runner')).__resetParseRunnerHooks();vi.useRealTimers();});
describe('Current real parser and rich preview, tiny fixtures',()=>{
 it('positive: PNG pixel limit now rejects before OCR',async()=>{
  const t=await import('@/lib/text-extract'),{RootBudget}=await import('@/lib/parse-policy');let starts=0;const png=Buffer.alloc(24);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png);png.writeUInt32BE(100,16);png.writeUInt32BE(100,20);t.__setOcrTestHooks({factory:async()=>{starts++;throw Error('must not run');}});
  await expect(t.parseWithBoundary(png,'small.png','image/png',{budget:new RootBudget({limits:{imagePixels:4}})})).rejects.toMatchObject({code:'PARSE_BUDGET_EXCEEDED'});expect(starts).toBe(0);observations.push({name:'png-pixels-positive',ocrStarts:0});
 });
 it('positive: DOCX text budget now rejects tiny inflated limit',async()=>{
  const t=await import('@/lib/text-extract'),{RootBudget}=await import('@/lib/parse-policy');await expect(t.parseWithBoundary(docx('Controlled text'),'small.docx','',{budget:new RootBudget({limits:{inflatedBytes:8}})})).rejects.toMatchObject({code:'PARSE_BUDGET_EXCEEDED'});observations.push({name:'docx-text-inflation-positive',rejected:true});
 });
 it('positive: 21-entry ZIP now explicitly fails',async()=>{
  const t=await import('@/lib/text-extract'),z=new AdmZip();for(let i=0;i<21;i++)z.addFile(i+'.txt',Buffer.from('marker_'+i));await expect(t.parseWithBoundary(z.toBuffer(),'small.zip','')).rejects.toMatchObject({code:'PARSE_BUDGET_EXCEEDED'});observations.push({name:'archive-count-positive',entries:21,rejected:true});
 });
 it('defect KR5: compressed table charges compressed bytes instead of actual expansion',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy'),{runIsolatedParse}=await import('@/lib/parse-runner');const data=sheet(true);const expanded=new AdmZip(data).getEntries().reduce((n,e)=>n+e.header.size,0);const cap=data.length+16;expect(expanded).toBeGreaterThan(cap);const budget=new RootBudget({limits:{inflatedBytes:cap},deadlineMs:10000});
  const result=await runIsolatedParse({task:{kind:'table-preview',buffer:data,fileName:'small.xlsx'},budget,deadlineMs:10000});expect(result.rows?.length).toBe(2);expect(budget.used.inflatedBytes).toBe(data.length);observations.push({name:'xlsx-expansion-charged-compressed',compressedBytes:data.length,actualFixtureExpandedBytes:expanded,budgetBytes:cap,meteredBytes:budget.used.inflatedBytes,accepted:true});
 });
 it('positive: HTML preview now rejects tiny declared inflation budget',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy'),{runIsolatedParse}=await import('@/lib/parse-runner');const budget=new RootBudget({limits:{inflatedBytes:8},deadlineMs:10000});await expect(runIsolatedParse({task:{kind:'docx-html',buffer:docx('HTML controlled body'),fileName:'small.docx'},budget,deadlineMs:10000})).rejects.toMatchObject({code:'PARSE_BUDGET_EXCEEDED'});observations.push({name:'html-declared-inflation-positive',budgetBytes:8,rejected:true});
 });
 it('defect KR5: TIFF uses file bytes as pixels and proceeds with over-limit dimensions',async()=>{
  const t=await import('@/lib/text-extract'),{RootBudget}=await import('@/lib/parse-policy');const tif=Buffer.alloc(38);tif.write('II',0,'ascii');tif.writeUInt16LE(42,2);tif.writeUInt32LE(8,4);tif.writeUInt16LE(2,8);for(const [offset,tag]of [[10,256],[22,257]]){tif.writeUInt16LE(tag,offset);tif.writeUInt16LE(4,offset+2);tif.writeUInt32LE(1,offset+4);tif.writeUInt32LE(100,offset+8);}let starts=0;
  t.__setOcrTestHooks({factory:async()=>{starts++;return {setParameters:async()=>{},recognize:async()=>({data:{text:'Controlled fake OCR'}}),terminate:async()=>{}};}});const budget=new RootBudget({limits:{imagePixels:100}});const result=await t.parseWithBoundary(tif,'small.tiff','image/tiff',{budget});expect(result.noText).toBe(false);expect(starts).toBe(1);expect(budget.used.imagePixels).toBe(38);observations.push({name:'tiff-byte-pixel-substitution',declaredPixels:10000,budgetPixels:100,meteredPixels:38,ocrStarts:1,fixture:'TIFF header/IFD only; fake OCR, not full raster decode'});
 });
 it('positive: spreadsheet numeric value 42 is now retained',async()=>{
  const t=await import('@/lib/text-extract');const data=sheet(true,true);const old=await t.extractTextFromBuffer(data,'small.xlsx','');const result=await t.parseWithBoundary(data,'small.xlsx','');expect(old).toContain('42');expect(result.noText).toBe(false);expect(result.text).toContain('Widget');expect(result.text).toContain('42');observations.push({name:'xlsx-numeric-positive',oldContains42:true,newContains42:true,newAccepted:true,newTextPrefix:result.text.slice(0,60)});
 });
 for(const ext of ['doc','ppt'])it('positive: legacy '+ext+' expected text now restored through actual boundary',async()=>{
  const t=await import('@/lib/text-extract');const data=fs.readFileSync(path.join(process.cwd(),'src/lib/__tests__/fixtures/legacy/sample-real.'+ext));const old=await t.extractTextFromBuffer(data,'sample-real.'+ext,'');const text=(await t.parseWithBoundary(data,'sample-real.'+ext,'')).text;const expected=ext==='doc'?'智慧园区项目立项报告':'智慧交通汇报';expect(text).toContain(expected);expect(text).toBe(old);observations.push({name:'legacy-positive-'+ext,matchesOld:true,expectedText:expected});
 });
 it('defect KR4: OCR terminate acknowledgment still waits forever for pending recognize',async()=>{
  vi.useFakeTimers();const t=await import('@/lib/text-extract');let finishRecognition!:(x:any)=>void,entered!:()=>void,settled=false,terminates=0;const ready=new Promise<void>(r=>entered=r);t.__setOcrTestHooks({timeoutMs:10,factory:async()=>({setParameters:async()=>{},recognize:()=>{entered();return new Promise(r=>finishRecognition=r);},terminate:async()=>{terminates++;}})});
  const png=Buffer.alloc(24);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
  const p=t.parseWithBoundary(png,'small.png','image/png',{timeoutMs:30}).then(()=>{settled=true;return 'OK';},e=>{settled=true;return e.code;});await ready;await vi.advanceTimersByTimeAsync(100);expect(terminates).toBe(1);expect(settled).toBe(false);observations.push({name:'ocr-recognize-pending-after-terminate',rootDeadlineMs:30,ocrTimeoutMs:10,elapsedMs:100,terminateAcknowledged:true,settled:false});finishRecognition({data:{text:'late output'}});await vi.advanceTimersByTimeAsync(1);expect(await p).toBe('PARSE_TIMEOUT');
 });
 for(const ext of ['xlsx','docx'])it('positive: cached '+ext+' content no longer bypasses rich preview',async()=>{
  const a=await import('@/lib/parse-admission');a.__setParseAdmissionBackendForTest({acquire:async()=> 'granted',release:async()=>true,quarantine:async()=>{},sweep:async()=>0});h.doc={id:'d1',workspaceId:'w1',visibility:'PRIVATE',uploaderId:'u1',fileExt:ext,filePath:'w1/a.'+ext,title:'a.'+ext,content:'Cached plain text'};h.buffer=ext==='xlsx'?sheet():docx('Rich preview');const {GET}=await import('@/app/api/workspace/assets/[assetId]/preview/route');const response=await GET({headers:new Headers({authorization:'offline'})} as any,{params:Promise.resolve({assetId:'d1'})});const body=await response.json();expect(response.status).toBe(200);expect(body.data.type).toBe(ext==='xlsx'?'table':'html');observations.push({name:'cached-preview-positive-'+ext,status:response.status,type:body.data.type});
 });
});
afterAll(()=>fs.writeFileSync(path.join(process.cwd(),'docs/reviews/R0-K1-followup-review/parser-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),mode:'Real local workers/parsers/preview GET; tiny fixtures; fake auth/DB/file IO/OCR where explicitly indicated',observations},null,2)));

describe('Original shared sheet/cell budgets on current numeric extraction path',()=>{
 it('defect KR5: worksheet extraction consumes no sheet/cell root budget',async()=>{
  const {RootBudget}=await import('@/lib/parse-policy'),t=await import('@/lib/text-extract');const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Amount'],[42]]),'Revenue');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Amount'],[7]]),'Expenses');const data=XLSX.write(wb,{type:'buffer',bookType:'xlsx',compression:true,bookSST:true}) as Buffer;
  const budget=new RootBudget({limits:{sheets:1,cells:1},deadlineMs:10000});const result=await t.parseWithBoundary(data,'small.xlsx','',{budget});expect(result.text).toContain('42');expect(result.text).toContain('7');expect(budget.used.sheets??0).toBe(0);expect(budget.used.cells??0).toBe(0);
  observations.push({name:'sheet-cell-budget-not-consumed',actualSheets:2,actualCells:4,allowedSheets:1,allowedCells:1,meteredSheets:0,meteredCells:0,accepted:true});
 });
});
