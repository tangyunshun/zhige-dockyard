// 临时脚本：send-email-code —— 可信 IP/actor + sendId 幂等回填
const fs = require("fs");
const p = "src/app/api/auth/send-email-code/route.ts";
let s = fs.readFileSync(p, "utf8");
const nl = s.includes("\r\n") ? "\r\n" : "\n";

const oldBlock = [
  "    const { email, type } = await request.json();",
  "",
  "    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {",
  "      return NextResponse.json(",
  '        { message: "请输入正确的邮箱地址" },',
  "        { status: 400 },",
  "      );",
  "    }",
  "",
  '    const purpose: VerifyPurpose = type === "register" ? "register" : "reset-password";',
  "",
  "    // 1) 共享预算裁决 + 签发（预算/委托未就绪 -> 503，不发生任何发送）",
  "    const code = generateEmailCode();",
  "    const store = await storeEmailCode(email, code, purpose);",
].join(nl);

const newBlock = [
  "    const { email, type } = await request.json();",
  "",
  "    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {",
  "      return NextResponse.json(",
  '        { message: "请输入正确的邮箱地址" },',
  "        { status: 400 },",
  "      );",
  "    }",
  "",
  "    // [U02 §2.1.5] 可信来源身份：IP 仅取自反向代理追加的转发头（取最后一跳，",
  "    // 为我们信任的代理所追加），绝不信任 body/客户端可任意伪造的字段；",
  "    // 已认证 actor（如有会话）从服务端会话解析，不信任请求体。",
  "    const trustedIp = extractTrustedClientIp(request);",
  "    let actorId: string | null = null;",
  "    try {",
  "      const { validateUser } = await import(\"@/lib/auth\");",
  "      const session = await validateUser(request.headers.get(\"authorization\"), request);",
  "      if (session.valid && session.user) actorId = session.user.id;",
  "    } catch { /* 匿名场景按原流程 */ }",
  "",
  '    const purpose: VerifyPurpose = type === "register" ? "register" : "reset-password";',
  "",
  "    // 1) 共享预算裁决 + 签发（预算/委托未就绪 -> 503，不发生任何发送）",
  "    const code = generateEmailCode();",
  "    const store = await storeEmailCode(email, code, purpose, { ip: trustedIp, actorId });",
].join(nl);

if (!s.includes(oldBlock)) { console.log("ANCHOR MISS block1"); process.exit(1); }
s = s.replace(oldBlock, newBlock, 1);

// sendId 传播到 onSendResult
const oldOnSend = [
  "    if (!sendResult.ok) {",
  "      // 仅“确定失败”退还本次预算；unknown（连接中断/超时）保留占用，不盲目退预算后重发",
  "      await getVerificationBackend().onSendResult(",
  '        { channel: "email", target: email, purpose },',
  '        sendResult.outcome === "failed" ? "failed" : "unknown",',
  "      );",
].join(nl);
const newOnSend = [
  "    if (!sendResult.ok) {",
  "      // 仅“确定失败”按预约身份幂等退还本次预算（重复回填零效果）；unknown 保留占用",
  "      await getVerificationBackend().onSendResult(",
  '        { channel: "email", target: email, purpose },',
  '        sendResult.outcome === "failed" ? "failed" : "unknown",',
  "        sendResult.sendId,",
  "      );",
].join(nl);
if (!s.includes(oldOnSend)) { console.log("ANCHOR MISS block2"); process.exit(1); }
s = s.replace(oldOnSend, newOnSend, 1);

// 附加 helper（文件末尾）
s += nl + [
  "/**",
  " * [U02 §2.1.5] 从可信代理头提取客户端 IP：只认 x-forwarded-for 的最后一跳",
  " * （由我们信任的反向代理追加），其次 x-real-ip；都不存在视为匿名。",
  " * 绝不信任 body/客户端可任意伪造的字段。",
  " */",
  "function extractTrustedClientIp(request: NextRequest): string | undefined {",
  '  const fwd = request.headers.get("x-forwarded-for");',
  "  if (fwd) {",
  '    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);',
  "    if (hops.length > 0) return hops[hops.length - 1];",
  "  }",
  '  return request.headers.get("x-real-ip")?.trim() || undefined;',
  "}",
].join(nl) + nl;

fs.writeFileSync(p, s);
console.log("send-email-code patched");
