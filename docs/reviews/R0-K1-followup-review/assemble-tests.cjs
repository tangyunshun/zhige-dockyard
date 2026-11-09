const fs=require('node:fs'),path=require('node:path'),dir=__dirname;
for(const name of ['handler','admission'])fs.writeFileSync(path.join(dir,name+'-review.test.ts'),fs.readFileSync(path.join(dir,name+'-fixture.txt'),'utf8')+'\n'+fs.readFileSync(path.join(dir,name+'-cases.txt'),'utf8')+(name==='handler'?'\n'+fs.readFileSync(path.join(dir,'handler-extra.txt'),'utf8'):''));
const parser=fs.readFileSync(path.join(dir,'parser-review.test.ts'),'utf8');
if(!parser.includes("describe('Original shared sheet/cell budgets"))fs.appendFileSync(path.join(dir,'parser-review.test.ts'),'\n'+fs.readFileSync(path.join(dir,'parser-extra.txt'),'utf8'));
