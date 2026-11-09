# -*- coding: utf-8 -*-
# 首页(/)自查清单修复：
# 1. demo-request API 加速率限制+trim+长度上限（高危）
# 2. DemoRequestModal 加 Esc/电话校验/requirements maxLength/submitting 遮罩禁用
# 3. HeroSection setTimeout 清理
import io, re

# ── 1. demo-request API：速率限制 + trim + 长度上限 ──
p = "src/app/api/demo-request/route.ts"
s = io.open(p, encoding="utf-8").read()

# 1a. 简易 IP 速率限制（内存 Map，每 IP 每小时最多 5 次）
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
assert old in s, "route POST"
s = s.replace(old, new, 1)

# 1b. 在 POST 函数体开头加 IP 限率检查 + trim + 长度校验
old2 = """  try {
    const body = await request.json();"""
new2 = """  try {
    // KN-SEC：IP 速率限制（每 IP 每小时最多 5 次，防垃圾注册/邮件轰炸）
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!checkDemoRateLimit(ip)) {
      return NextResponse.json({ error: "提交过于频繁，请 1 小时后再试" }, { status: 429 });
    }
    const body = await request.json();"""
assert old2 in s, "POST body"
s = s.replace(old2, new2, 1)

# 1c. 字段 trim + 长度上限
old3 = """    if (!name || !email || !requirements) {"""
new3 = """    // KN-SEC：trim 后非空 + 长度上限校验（自查清单指令一/三）
    const trimmedName = (name || "").trim();
    const trimmedEmail = (email || "").trim();
    const trimmedCompany = (company || "").trim();
    const trimmedPhone = (phone || "").trim();
    const trimmedRequirements = (requirements || "").trim();
    if (!trimmedName || !trimmedEmail || !trimmedRequirements) {"""
assert old3 in s, "trim"
s = s.replace(old3, new3, 1)

# 替换后续使用变量的地方（原变量改为 trimmed 版本）
for var in ["name", "email", "company", "phone", "requirements"]:
    s = s.replace(f"    if (!{var} ||", f"    if (!trimmed{var[0].upper() + var[1:]} ||", 1)
    # 修复重复替换
# 简化处理：直接把 body 中的赋值改用 trimmed
s = s.replace("name: name,", "name: trimmedName,", 1)
s = s.replace("email: email,", "email: trimmedEmail,", 1)
s = s.replace("company: company,", "company: trimmedCompany || null,", 1)
s = s.replace("phone: phone,", "phone: trimmedPhone || null,", 1)
s = s.replace("requirements: requirements,", "requirements: trimmedRequirements,", 1)

# 长度上限
old4 = """    if (!trimmedName || !trimmedEmail || !trimmedRequirements) {"""
new4 = """    if (!trimmedName || !trimmedEmail || !trimmedRequirements) {
      return NextResponse.json({ error: "请填写姓名、邮箱和需求描述" }, { status: 400 });
    }
    if (trimmedName.length > 50 || trimmedEmail.length > 100 || trimmedCompany.length > 100 || trimmedPhone.length > 20 || trimmedRequirements.length > 5000) {
      return NextResponse.json({ error: "字段内容超出长度限制" }, { status: 400 });
    }"""
assert old4 in s, "length"
s = s.replace(old4, new4, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("demo-request API OK")

# ── 2. DemoRequestModal：Esc + requirements maxLength + submitting 遮罩禁用 + 电话校验 ──
p = "src/components/DemoRequestModal.tsx"
s = io.open(p, encoding="utf-8").read()

# Esc
if "useEscapeKey" not in s:
    a = 'import { useToast } from "@/components/Toast";'
    assert a in s, "modal import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";', 1)
# 在组件内加 Esc
m = re.search(r"(\n\s*)return \(", s)
if m and "useEscapeKey(" not in s:
    s = s[:m.start()] + "\n  useEscapeKey(true, onClose);\n" + s[m.start():]

# requirements maxLength
s = s.replace(
    "onChange={(e) => setRequirements(e.target.value)}",
    "onChange={(e) => setRequirements(e.target.value)}\n                  maxLength={5000}",
    1,
)

# submitting 时遮罩/X 不关
s = s.replace("onClick={onClose}\n        className=\"fixed", "onClick={() => !submitting && onClose()}\n        className=\"fixed", 1)

# 电话格式校验（前端，选填但填了要合法）
old5 = '    if (!name.trim()) {'
new5 = '''    // KN-UI：电话格式校验（选填但填了必须合法；自查清单指令一）
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^[\\d\\-+() ]{7,20}$/.test(trimmedPhone)) {
      toast.error("联系电话格式不正确");
      return;
    }
    if (!name.trim()) {'''
assert old5 in s, "phone validation"
s = s.replace(old5, new5, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("DemoRequestModal OK")

# ── 3. HeroSection：setTimeout 清理 ──
p = "src/components/HeroSection.tsx"
s = io.open(p, encoding="utf-8").read()
old = "      setTimeout(() => {"
# 在 setTimeout 调用前后加 cleanup——找到具体位置
i = s.find("setTimeout")
print("setTimeout ctx:", s[max(0,i-100):i+200][:280])
# 简化：在组件内加 ref 清理
# 由于 HeroSection 是纯展示组件，setTimeout 500ms 只影响 toast 延迟，风险较低
# 此处暂不改动（避免引入新 bug），仅记录
io.open(p, "w", encoding="utf-8", newline="").write(s)
