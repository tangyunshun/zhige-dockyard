// Current evidence for original F09. Actual route + maintenance helper, memory-only systemconfig.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hashes={};
function read(file){const bytes=fs.readFileSync(file);hashes[file]=crypto.createHash('sha256').update(bytes).digest('hex');return bytes.toString('utf8');}
function load(file,stubs){const js=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  const exports={};vm.runInNewContext(js,{exports,Date,Error,Response,Headers,process:{env:{}},console:{log(){},error(){},warn(){}},
    require(name){if(Object.hasOwn(stubs,name))return stubs[name];throw new Error('Dependency denied '+name);}}, {filename:file});return exports;}
function setup(legacyRows=false){
  const releases=[{id:'fixture-release',version:'v1.2.0',isPublished:true}],schedules=[{id:'fixture-schedule',title:'fixture',status:'SCHEDULED'}];
  if(legacyRows){releases.push({id:'rel-20260908-01',version:'v0.0.0',isPublished:true});schedules.push({id:'maint-20260920-01',title:'legacy fixture',status:'SCHEDULED'});}
  const s={config:{maintenance_mode:'true',maintenance_message:'fixture maintenance',maintenance_estimated:'30',
    SYSTEM_RELEASE_NOTES_V1:JSON.stringify(releases),SYSTEM_MAINTENANCE_SCHEDULES_V1:JSON.stringify(schedules)},writes:[],authCalls:0};
  const prisma={systemconfig:{findUnique:async({where})=>Object.hasOwn(s.config,where.key)?{key:where.key,value:s.config[where.key]}:null,
    update:async({where,data})=>{s.writes.push({method:'update',key:where.key});s.config[where.key]=data.value;return {key:where.key,value:data.value};},
    upsert:async({where,create,update})=>{s.writes.push({method:'upsert',key:where.key});s.config[where.key]=Object.hasOwn(s.config,where.key)?update.value:create.value;return {key:where.key,value:s.config[where.key]};}}};
  const maintenance=load('src/lib/maintenance.ts',{'@/lib/prisma':{prisma}});
  const route=load('src/app/api/system/maintenance/route.ts',{
    'next/server':{NextResponse:{json:(body,init)=>new Response(JSON.stringify(body),init)}},
    '@/lib/prisma':{prisma},'@/lib/maintenance':maintenance,
    '@/lib/auth':{validateUser:async()=>{s.authCalls++;return {valid:false};},isAdminRole:()=>false},
    '@/lib/role-utils':{ADMIN_ROLE_VALUES:['ADMIN']},
    '../../../../../package.json':{version:JSON.parse(read('package.json')).version},
  });
  return {s,route};
}
async function main(){
  const cases=[];
  for(const options of [{name:'ordinary_public_query_control',query:'',legacy:false},{name:'anonymous_GET_disables_maintenance',query:'?action=emergency_disable',legacy:false},
    {name:'ordinary_GET_cleans_historical_records',query:'',legacy:true}]){
    const c=setup(options.legacy),before=structuredClone(c.s.config);
    const response=await c.route.GET({headers:new Headers(),nextUrl:new URL('http://isolated/api/system/maintenance'+options.query)});
    const body=await response.json();assert.equal(response.status,200);assert.equal(c.s.authCalls,0);
    if(options.name==='ordinary_public_query_control'){assert.equal(c.s.writes.length,0);assert.equal(c.s.config.maintenance_mode,'true');}
    if(options.name==='anonymous_GET_disables_maintenance'){assert.equal(c.s.config.maintenance_mode,'false');assert.equal(c.s.writes.length,1);}
    if(options.legacy){assert.equal(c.s.writes.length,2);assert.equal(JSON.parse(c.s.config.SYSTEM_RELEASE_NOTES_V1).length,1);assert.equal(JSON.parse(c.s.config.SYSTEM_MAINTENANCE_SCHEDULES_V1).length,1);}
    cases.push({scenario:options.name,requestHadAuthentication:false,httpStatus:response.status,authCalls:c.s.authCalls,
      returnedMode:body.maintenanceMode,before,after:c.s.config,writes:c.s.writes});
  }
  const middleware=read('src/middleware.ts');assert.ok(middleware.includes('"/api/system/maintenance"'));
  const security=read('src/lib/security.ts');
  for(const file of ['src/app/admin/maintenance/page.tsx','src/components/MaintenanceUpcomingBanner.tsx','src/app/releases/page.tsx',
    'src/app/maintenance/page.tsx','src/app/api/admin/permissions/route.ts'])read(file);
  const evidence={capturedAt:new Date().toISOString(),originalIssue:'F09 public maintenance GET writes',cases,
    staticFacts:{publicPrefixListed:true,writeAuditLogSwallowsFailure:security.includes('持久化写入操作审计日志失败'),
      existingPermissionKeys:['system:maintenance_toggle','maintenance:publish','maintenance:read']},
    isolation:'Actual GET and actual is/setMaintenanceMode/getMaintenanceMessage with local systemconfig memory. No credential headers, DB, network, actual configuration or sessions modified.',
    limits:'Direct route execution plus static public-prefix inspection; not actual middleware HTTP deployment or online incident. Legacy IDs are deliberate synthetic inputs, not production inventory. Admin POST/DELETE/audit hardening are next implementation scope, not executed here.',sha256:hashes};
  fs.writeFileSync('docs/reviews/R0-E-independent-review/next-maintenance-verification.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({originalIssue:evidence.originalIssue,cases:cases.map(r=>({scenario:r.scenario,httpStatus:r.httpStatus,authCalls:r.authCalls,
    returnedMode:r.returnedMode,writes:r.writes})),publicPrefixListed:true},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
