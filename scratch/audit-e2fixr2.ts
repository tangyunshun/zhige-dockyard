/** 【只读】E2-FIX-R 补核：C27 失败错误码 / C24+C29 JSON artifact / 文件上传真实性 */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  // 1. C27 三次失败的错误码
  const c27 = await prisma.componenttask.findMany({ where: { type: "C27", status: "FAILED" }, orderBy: { createdAt: "asc" }, select: { id: true, result: true, createdAt: true } });
  for (const t of c27) console.log("C27 FAILED:", JSON.stringify({ at: t.createdAt, err: ((t.result ?? {}) as any)?.errorCode }));
  // 2. C24/C29 SUCCESS 的 artifact
  for (const cid of ["C24", "C29"]) {
    const t = await prisma.componenttask.findFirst({ where: { type: cid, status: "SUCCESS" }, orderBy: { createdAt: "desc" }, select: { id: true, result: true, config: true } });
    if (!t) continue;
    const res = (t.result ?? {}) as any;
    const art = res?.outputData?.artifacts?.[0] ?? res?.artifacts?.[0];
    const cfg = (t.config ?? {}) as any;
    console.log(`${cid} artifact:`, JSON.stringify({ type: art?.type, mime: art?.mimeType, renderer: art?.rendererType, preview: (typeof art?.content === "string" ? art.content : JSON.stringify(art?.content))?.slice(0, 180) }));
    console.log(`${cid} inputSource:`, JSON.stringify(cfg?.inputSource));
  }
  // 3. 文件上传真实性（C20/C26/C27 的 inputSource）
  for (const cid of ["C20", "C26"]) {
    const t = await prisma.componenttask.findFirst({ where: { type: cid, status: "SUCCESS" }, orderBy: { createdAt: "desc" }, select: { id: true, config: true } });
    if (!t) continue;
    const cfg = (t.config ?? {}) as any;
    console.log(`${cid} inputSource:`, JSON.stringify({ sourceType: cfg?.inputSource?.sourceType, fileName: cfg?.inputSource?.fileName, size: cfg?.inputSource?.fileSize }));
  }
}
main().catch((e) => console.error(e.message)).finally(() => prisma.$disconnect());
