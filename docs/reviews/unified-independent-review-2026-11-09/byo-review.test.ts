import { it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h=vi.hoisted(()=>({sent:null as any}));
vi.mock('@/lib/auth',()=>({validateUser:vi.fn(async()=>({valid:true,user:{id:'owner',role:'USER'}})),isAdminRole:()=>false}));
vi.mock('@/lib/security',()=>({requireWorkspaceMembership:vi.fn(async()=>true),getLogicalWorkspaceRole:vi.fn(async()=> 'OWNER')}));
vi.mock('@/lib/prisma',()=>({prisma:{workspace_byo_model:{findUnique:vi.fn(async()=>({baseUrl:'https://original.example/v1',apiKeyCipher:'fixture-cipher'}))}}}));
vi.mock('@/lib/crypto-secrets',()=>({decryptSecret:()=> 'FAKE-SAVED-KEY'}));
vi.mock('@/lib/workspace-byo-model',()=>({testByoModelConnection:vi.fn(async(input:any)=>{h.sent=input;return{ok:true,sampleReply:'fixture'};}),deriveSuggestedCapabilities:()=>[]}));
import {POST} from '@/app/api/workspace/byo-model/test/route';
it('DEFECT: changed endpoint with empty key forwards saved key to new host',async()=>{
 const r=await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'https://changed.example/v1',apiKey:''})}));
 expect(r.status).toBe(200);expect(h.sent).toMatchObject({baseUrl:'https://changed.example/v1',apiKey:'FAKE-SAVED-KEY'});
});
