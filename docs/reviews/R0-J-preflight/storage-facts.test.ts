import {beforeEach,describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
const h=vi.hoisted(()=>({quota:null as null|{storageUsed:bigint;storageLimit:bigint},fail:false,writes:[] as unknown[],files:new Map<string,Buffer>(),observations:[] as unknown[]}));
vi.mock('@/lib/prisma',()=>({prisma:{workspacequota:{
  findUnique:async()=>h.quota?{...h.quota}:null,
  update:async({data}:any)=>{h.writes.push(data);if(h.fail||!h.quota)throw Error('synthetic quota write failure');if(typeof data.storageUsed==='bigint')h.quota.storageUsed=data.storageUsed;else h.quota.storageUsed+=data.storageUsed.increment;return {...h.quota};}
}}}));
vi.mock('fs/promises',()=>({default:{
  mkdir:async()=>{},writeFile:async(p:string,b:Buffer)=>{h.files.set(p,Buffer.from(b));},
  readFile:async(p:string)=>{const b=h.files.get(p);if(!b)throw Object.assign(Error('synthetic ENOENT'),{code:'ENOENT'});return b;},
  unlink:async(p:string)=>{if(!h.files.delete(p))throw Object.assign(Error('synthetic ENOENT'),{code:'ENOENT'});}
}}));
import {assertStorageQuota,addStorageUsed,subtractStorageUsed} from '@/lib/storage-quota';
beforeEach(()=>{h.quota={storageUsed:0n,storageLimit:100n};h.fail=false;h.writes=[];h.files.clear();});
afterEach(()=>vi.unstubAllEnvs());
describe('Original F13 current-code facts, defect reproduction rather than acceptance',()=>{
  it('missing quota currently permits a physical upload',async()=>{h.quota=null;await expect(assertStorageQuota('w1',1)).resolves.toBeUndefined();h.observations.push({case:'missing quota',admitted:true});});
  it('zero limit currently permits a physical upload',async()=>{h.quota!.storageLimit=0n;await expect(assertStorageQuota('w1',1)).resolves.toBeUndefined();h.observations.push({case:'zero limit',admitted:true});});
  it('negative value other than -1 also permits upload',async()=>{h.quota!.storageLimit=-2n;await expect(assertStorageQuota('w1',1)).resolves.toBeUndefined();h.observations.push({case:'invalid negative limit',admitted:true});});
  it('explicit existing -1 remains unlimited, positive control',async()=>{h.quota!.storageLimit=-1n;await expect(assertStorageQuota('w1',1000)).resolves.toBeUndefined();h.observations.push({case:'existing explicit -1',admitted:true,control:true});});
  it('two checks of 60 bytes each pass against 100, then usage reaches 120',async()=>{await Promise.all([assertStorageQuota('w1',60),assertStorageQuota('w1',60)]);await Promise.all([addStorageUsed('w1',60),addStorageUsed('w1',60)]);expect(h.quota!.storageUsed).toBe(120n);h.observations.push({case:'concurrent upload',limit:'100',actual:'120',expectedMaximum:'100'});});
  it('concurrent deletes lose one decrement',async()=>{h.quota!.storageUsed=100n;await Promise.all([subtractStorageUsed('w1',30),subtractStorageUsed('w1',40)]);expect(h.quota!.storageUsed).toBe(60n);h.observations.push({case:'concurrent delete',initial:'100',deltas:['30','40'],actual:'60',expected:'30'});});
  it('upload accounting failure is swallowed',async()=>{h.fail=true;await expect(addStorageUsed('w1',60)).resolves.toBeUndefined();expect(h.quota!.storageUsed).toBe(0n);h.observations.push({case:'upload accounting failed',rejected:false,usage:'0'});});
  it('delete accounting failure is swallowed',async()=>{h.quota!.storageUsed=100n;h.fail=true;await expect(subtractStorageUsed('w1',30)).resolves.toBeUndefined();expect(h.quota!.storageUsed).toBe(100n);h.observations.push({case:'delete accounting failed',rejected:false,usage:'100'});});
  it('Number conversion can admit bytes above actual BigInt limit',async()=>{h.quota={storageUsed:9007199254740993n,storageLimit:9007199254740994n};await expect(assertStorageQuota('w1',2)).resolves.toBeUndefined();h.observations.push({case:'BigInt precision',used:h.quota.storageUsed.toString(),limit:h.quota.storageLimit.toString(),incoming:2,admitted:true});});
  it('local save path differs from read/delete; silent deletion leaves saved bytes',async()=>{vi.stubEnv('STORAGE_DRIVER','local');vi.resetModules();const store=await import('@/lib/file-store');const saved=await store.saveAssetFile('w1','test.txt',Buffer.from('abc'),'txt');const actualPath=[...h.files.keys()][0];const readPath=store.resolveAssetAbsolute(saved.filePath);expect(path.normalize(actualPath)).not.toBe(path.normalize(readPath));await expect(store.readAssetFile(saved.filePath)).rejects.toThrow('synthetic ENOENT');await expect(store.deleteAssetFile(saved.filePath)).resolves.toBeUndefined();expect(h.files.size).toBe(1);h.observations.push({case:'local path and silent delete',filePath:saved.filePath,actualPath,readPath,remainingFiles:1});});
});
import {afterAll} from 'vitest';
afterAll(()=>fs.writeFileSync('docs/reviews/R0-J-preflight/storage-facts.json',JSON.stringify({checkedAt:new Date().toISOString(),observations:h.observations,limits:'Actual quota helper and local file-store logic with in-memory Prisma/fs IO. Passing reproductions prove existing problems, not a repaired system. No real database, disk uploads or object storage.'},null,2)));
