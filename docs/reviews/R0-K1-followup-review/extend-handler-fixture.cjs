const fs=require('node:fs'),path=require('node:path'),dir=__dirname;
let s=fs.readFileSync(path.join(dir,'handler-fixture.txt'),'utf8');
s=s.replace('else if (op === "gt") { if (!(rv > ov)) return false; }','else if (op === "gt") { if (!(rv > ov)) return false; }\n        else if (op === "gte") { if (!(rv >= ov)) return false; }\n        else if (op === "lte") { if (!(rv <= ov)) return false; }');
s=s.replace('next[k] = (v as any).set;','next[k] = (v as any).set;').replace('} else {\n        next[k] = v;','} else if (v !== null && typeof v === "object" && !(v instanceof Date) && ("increment" in v || "decrement" in v)) {\n        next[k] = next[k] + ((v as any).increment ?? -((v as any).decrement));\n      } else {\n        next[k] = v;');
s=s.replace('const row = { ...data };','if ((name === "parseadmissioncounter" && rows().some(r => r.id === data.id)) || (name === "parselease" && rows().some(r => r.leaseId === data.leaseId || r.claimToken === data.claimToken))) { const e: any = new Error("Unique"); e.code = "P2002"; throw e; }\n      const row = { ...data };');
fs.writeFileSync(path.join(dir,'handler-fixture.txt'),s);
