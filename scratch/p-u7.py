# -*- coding: utf-8 -*-
# settings 静默失败横幅 + profile debugCode 环境门禁 + profile 注销弹窗按钮防抖
import io, re

# ── settings/page.tsx：5 个加载失败置错 + 横幅 ──
p = "src/app/user/settings/page.tsx"
s = io.open(p, encoding="utf-8").read()
if "LoadErrorBanner" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    assert a in s, "import"
    s = s.replace(a, a + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
if "const [loadError" not in s:
    m = re.search(r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", s)
    assert m, "settings loading"
    ins = m.end()
    s = s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]
# 5 个 load 函数的 catch 置错（模式：console.error(...) 后跟 toast.error(...)）
cnt = 0
pat = re.compile(r"(console\.error\([^\n]*\)\n)(\s*)(toast\.error\([^\n]*\);\n)(\s*\})")
def _rep(mm):
    global cnt
    cnt += 1
    return mm.group(1) + mm.group(2) + "setLoadError((err as Error)?.message || \"部分设置加载失败，请重试\");\n" + mm.group(4)
# 更通用：catch 块内的 toast.error 前插入 setLoadError
pat2 = re.compile(r"(\} catch \((?:err|e|error)(?::\s*[\w|]+)?\) \{\n)(\s*)(toast\.error\()")
def rep2(mm):
    return mm.group(1) + mm.group(2) + "setLoadError((err as Error)?.message || \"设置加载失败，请重试\");\n" + mm.group(2) + mm.group(3)
# 仅前 5 处（load 类）
matches = list(pat2.finditer(s))
out = []
last = 0
for i, mm in enumerate(matches):
    out.append(s[last:mm.start()])
    out.append(mm.group(1) + mm.group(2) + "setLoadError((err as Error)?.message || \"设置加载失败，请重试\");\n" + mm.group(2) + mm.group(3))
    last = mm.end()
    if i >= 4:
        break
out.append(s[last:])
s = "".join(out)
print("settings catch patched:", min(len(matches), 5))
# 成功清空：settings 各 load 的成功分支不好定位——横幅重试即刷新页面级 load；用 window.location 简化
m3 = re.search(r"\n(\s*)return \(\n(\s*)<div", s)
if m3 and "loadError &&" not in s:
    ins_at = m3.end()
    s = s[:ins_at] + ("\n" + m3.group(2) + "  {loadError && (\n"
                      + m3.group(2) + "    <div className=\"mb-4\">\n"
                      + m3.group(2) + "      <LoadErrorBanner message={loadError} onRetry={() => { setLoadError(null); window.location.reload(); }} />\n"
                      + m3.group(2) + "    </div>\n"
                      + m3.group(2) + "  )}") + s[ins_at:]
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("settings OK")

# ── profile：debugCode 环境门禁 + 注销按钮防抖 ──
p = "src/app/user/profile/page.tsx"
s = io.open(p, encoding="utf-8").read()
old = '        setSmsDebugCode(data.debugCode || null);\n        if (data.debugCode) {\n          setSmsMessage(`验证码已发送：${data.debugCode}，60秒后可重新发送`);'
new = '''        setSmsDebugCode(data.debugCode || null);
        if (data.debugCode && process.env.NODE_ENV !== "production") {
          // KN-SEC：debugCode 仅开发环境回显，生产不下发到界面（自查清单安全红线）
          setSmsMessage(`验证码已发送：${data.debugCode}，60秒后可重新发送`);'''
assert old in s, "debugCode"
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("profile debugCode gate OK")
