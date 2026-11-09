import{it,expect,vi,beforeEach}from 'vitest';
const h=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{systemconfig:{findMany:vi.fn(async()=>[{key:'smtpHost',value:'smtp.fixture.invalid'},{key:'senderEmail',value:'fixture@example.com'}])}}}));
vi.mock('nodemailer',()=>({default:{createTransport:()=>({sendMail:h.send})}}));
import{sendMail}from '@/lib/mailer';
beforeEach(()=>{h.send.mockReset();});
it('POSITIVE: transport rejection without known SMTP response now stays unknown',async()=>{
 h.send.mockRejectedValue({code:'ECONNRESET',message:'fixture response lost'});
 expect((await sendMail({to:'fixture@example.com',subject:'fixture',text:'fixture'})).outcome).toBe('unknown');
});
it('POSITIVE: recipient rejected (or empty accepted) is not reported accepted',async()=>{
 h.send.mockResolvedValue({accepted:[],rejected:['fixture@example.com']});
 expect(await sendMail({to:'fixture@example.com',subject:'fixture',text:'fixture'})).toMatchObject({ok:false,outcome:'failed'});
});
