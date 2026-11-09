const fs=require('node:fs'),path=require('node:path');
const old='docs/reviews/unified-independent-review-2026-11-09';
for(const file of ['payment-review.test.ts','admission-review.test.ts','security-review.test.ts'])fs.copyFileSync(path.join(old,file),path.join(__dirname,file));
let business=fs.readFileSync(path.join(old,'business-modules-review.test.ts'),'utf8');
business=business.replace("it('DEFECT IN CURRENT PRICING: legitimate 20000 bps is guessed into 2000 bps without unit version',()=>{\n expect(parseBillingConfig([{key:'billing.markupCoefficientBps',value:'20000'}]).markupCoefficientBps).toBe(2000);\n});", "it('POSITIVE: legitimate 20000 bps now remains unchanged',()=>{\n expect(parseBillingConfig([{key:'billing.markupCoefficientBps',value:'20000'}]).markupCoefficientBps).toBe(20000);\n});");
fs.writeFileSync(path.join(__dirname,'business-modules-review.test.ts'),business);
let byo=fs.readFileSync(path.join(old,'byo-review.test.ts'),'utf8');
byo=byo.replace("baseUrl:'https://original.example/v1',apiKeyCipher", "baseUrl:'https://original.example/Private/V1',protocol:'OPENAI_COMPATIBLE',apiKeyCipher");
byo=byo.slice(0,byo.indexOf("it('DEFECT:"));
byo+=`
it('POSITIVE: different host no longer receives saved key',async()=>{
 await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'https://changed.example/v1',apiKey:''})}));
 expect(h.sent.apiKey).toBe('');
});
it('POSITIVE: exact same endpoint and protocol may reuse saved key',async()=>{
 await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'https://original.example/Private/V1',apiKey:''})}));
 expect(h.sent.apiKey).toBe('FAKE-SAVED-KEY');
});
it('DEFECT: case-sensitive path change is normalized into same destination and reuses old key',async()=>{
 await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'https://original.example/private/v1',apiKey:''})}));
 expect(h.sent).toMatchObject({baseUrl:'https://original.example/private/v1',apiKey:'FAKE-SAVED-KEY'});
});
it('DEFECT: HTTPS to HTTP scheme change is normalized into same destination before downstream checks',async()=>{
 await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'http://original.example/Private/V1',apiKey:''})}));
 expect(h.sent).toMatchObject({baseUrl:'http://original.example/Private/V1',apiKey:'FAKE-SAVED-KEY'});
});`;
fs.writeFileSync(path.join(__dirname,'byo-review.test.ts'),byo);
console.log('Prepared unchanged-route checks and updated positive assertions in new review directory only.');
