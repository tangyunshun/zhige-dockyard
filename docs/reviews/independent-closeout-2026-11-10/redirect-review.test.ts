import{it,expect}from 'vitest';
import{createRequire}from 'node:module';
const require=createRequire(import.meta.url);
const sanitize=require('./redirect-fixture.js');
it('POSITIVE: ordinary external return target is rejected',()=>{
 expect(sanitize('https://outside.example')).toBe('/workspace-hub');expect(sanitize('/workspace-hub?tab=tasks')).toBe('/workspace-hub?tab=tasks');
});
it('DEFECT: encoded ASCII tab survives sanitizer then URL normalization redirects to external host',()=>{
 const result=sanitize('/%09/outside.example');const target=new URL(result,'https://app.example');expect(target.origin).toBe('https://outside.example');
});
