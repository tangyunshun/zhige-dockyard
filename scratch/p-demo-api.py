# -*- coding: utf-8 -*-
# demo-request API 修复（正确锚点）：速率限制 + 空白校验 + 长度上限
import io

P = "src/app/api/demo-request/route.ts"
s = io.open(P, encoding="utf-8").read()

# 1. 速率限制函数（POST 之前）
old = "export async function POST(request: NextRequest) {"
new = """// KN-SEC：简易 IP 速率限制（自查清单安全红线：公开写接口防刷）
const _demoRateMap = new Map<string, { count: number; resetAt: number }>();
const DEMO_RATE_LIMIT = 5;
const DEMO_RATE_WINDOW = 60 * 60 * 1000; // 1 小时

function checkDemoRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _demoRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _demoRateMap.set(ip, { count: 1, resetAt: now + DEMO_RATE_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= DEMO_RATE_LIMIT;
}

export async function POST(request: NextRequest) {"""
assert old in s, "POST anchor"
s = s.replace(old, new, 1)

# 2. POST 开头加限率检查
old = """  try {
    const body = await request.json();
    const { name, email, company, phone, requirements } = body;

    // 验证必填字段
    if (!name || !email || !company) {"""
new = """  try {
    // KN-SEC：IP 速率限制（每 IP 每小时最多 5 次，防垃圾注册/邮件轰炸）
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkDemoRateLimit(ip)) {
      return NextResponse.json({ error: "提交过于频繁，请 1 小时后再试" }, { status: 429 });
    }
    const body = await request.json();
    const { name, email, company, phone, requirements } = body;

    // KN-SEC：trim 后非空校验（自查清单指令一：空白字符串不得通过）
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedEmail = typeof email === "string" ? email.trim() : "";
    const trimmedCompany = typeof company === "string" ? company.trim() : "";
    const trimmedRequirements = typeof requirements === "string" ? requirements.trim() : "";

    // 验证必填字段（trim 后）
    if (!trimmedName || !trimmedEmail || !trimmedCompany) {"""
assert old in s, "POST body"
s = s.replace(old, new, 1)

# 3. 邮箱校验改用 trimmed
old = """    if (!emailRegex.test(email)) {"""
new = """    if (!emailRegex.test(trimmedEmail)) {"""
assert old in s, "email check"
s = s.replace(old, new, 1)

# 4. 长度上限
old = """    // 落库
    const created = await prisma.demorequest.create({"""
new = """    // KN-SEC：长度上限校验（自查清单指令一/三）
    if (trimmedName.length > 50 || trimmedEmail.length > 100 || trimmedCompany.length > 100 || trimmedRequirements.length > 5000) {
      return NextResponse.json({ error: "字段内容超出长度限制" }, { status: 400 });
    }

    // 落库
    const created = await prisma.demorequest.create({"""
assert old in s, "length"
s = s.replace(old, new, 1)

# 5. 落库时用 trimmed 变量
s = s.replace("name: String(name).trim(),", "name: trimmedName,", 1)
s = s.replace("email: String(email).trim(),", "email: trimmedEmail,", 1)
s = s.replace("company: String(company).trim(),", "company: trimmedCompany,", 1)
s = s.replace("requirements: requirements ? String(requirements).trim() : null,", "requirements: trimmedRequirements || null,", 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("demo-request API OK")
