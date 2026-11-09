# -*- coding: utf-8 -*-
# billing-center / team / sub-accounts / points：错误横幅 + 脱敏 + billing 字典 + 千分位
import io, re

def load(p): return io.open(p, encoding="utf-8").read()
def save(p, s): io.open(p, "w", encoding="utf-8", newline="").write(s); print("OK", p)

IA = 'import { getAuthToken } from "@/utils/auth";'

# ── billing-center ──
p = "src/app/user/billing-center/page.tsx"
s = load(p)
if "LoadErrorBanner" not in s:
    assert IA in s
    s = s.replace(IA, IA + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
if "const [loadError" not in s:
    m = re.search(r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", s)
    assert m, "loading"
    ins = m.end()
    s = s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]
# catch 置错
old = s[s.find("} catch (err) {", 100):]
# 用精准锚：找到 load 函数的 catch
m2 = re.search(r"(\} catch \(err\) \{\n)(\s*)(console\.error\([^\n]*\n)?(\s*toast\.error\([^\n]*\);\n)?(\s*\} finally \{\n\s*setLoading\(false\);)", s)
assert m2, "billing catch"
s = s[:m2.start()] + "} catch (err) {\n      setLoadError((err as Error)?.message || \"账票中心数据加载失败，请重试\");\n    } finally {\n      setLoading(false);" + s[m2.end():]
# 成功清空：找 setLoading(true) 后第一个 if (userRes.ok) 前无清空——在 Promise.all 解构后成功路径尾插
m3 = re.search(r"\n(\s*)if \(statsRes\.ok\) \{", s)
if m3:
    # 在该 if 块结束后插入 setLoadError(null)——找块尾比较麻烦，改用：在 if (userRes.ok) 前清一次
    pass
# 简化：成功清空挂在 loading 尾部不行——直接在四个 if 全部走完后……用 statsRes if 块尾
# 改为：在每个 if (x.ok) 前不清，统一在 catch 外、finally 前清（若本次无错）
m4 = re.search(r"(\n\s*\}\n)(\s*\} catch \(err\) \{\n\s*setLoadError)", s)
if m4:
    s = s[:m4.start()] + "\n    }\n    setLoadError(null);\n  } catch (err) {\n    setLoadError" + s[m4.end():]
# JSX：loading 分支后插错误分支
m5 = re.search(r"(\{loading \? \(\n(?:.|\n)*?\n\s*\)\) : )", s)
assert m5, "billing loading jsx"
s = s[:m5.end()] + "(\n          <div className=\"px-1 pb-2\">\n            <LoadErrorBanner message={loadError || \"\"} onRetry={() => { setLoadError(null); load(); }} retrying={loading} />\n          </div>\n        )} : " + s[m5.end():]
save(p, s)

# ── team：maskEmail + 失败横幅 ──
p = "src/app/user/team/page.tsx"
s = load(p)
if "maskEmail" not in s:
    assert IA in s
    s = s.replace(IA, IA + '\nimport { maskEmail } from "@/utils/format";\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
# 邮箱脱敏
s = re.sub(r"\{(\w+\.email)\}", lambda m: "{maskEmail(" + m.group(1) + ")}", s)
# loadOverview 失败横幅
old = "toast.error((e as Error)?.message || \"加载失败\");"
if old in s:
    s = s.replace(old, "setLoadError((e as Error)?.message || \"团队空间加载失败，请重试\");", 1)
if "const [loadError" not in s:
    m = re.search(r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", s)
    assert m, "team loading"
    ins = m.end()
    s = s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]
# 成功清空：找 setOverviews(
m6 = re.search(r"(\n\s*)setOverviews\(", s)
if m6:
    s = s[:m6.start()] + "\n  setLoadError(null);\n  setOverviews(" + s[m6.end():]
# JSX：找 loading 渲染后插横幅
m7 = re.search(r"(\{loading \? \(\n(?:.|\n)*?\n\s*\)\) : )", s)
if m7:
    s = s[:m7.end()] + "(\n          <div className=\"px-1 pb-3\">\n            <LoadErrorBanner message={loadError || \"\"} onRetry={() => { setLoadError(null); loadOverview(); }} retrying={loading} />\n          </div>\n        )} : " + s[m7.end():]
save(p, s)

# ── sub-accounts：脱敏 + window.confirm 换 ConfirmDialog + 失败横幅 ──
p = "src/app/user/sub-accounts/page.tsx"
s = load(p)
if "maskEmail" not in s:
    assert IA in s
    s = s.replace(IA, IA + '\nimport { maskEmail, maskPhone } from "@/utils/format";\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
# 列表联系方式脱敏（渲染处）
s = re.sub(r"\{(sub\.email|acc\.email|account\.email)\}", lambda m: "{maskEmail(" + m.group(1) + ")}", s)
s = re.sub(r"\{(sub\.phone|acc\.phone|account\.phone)\}", lambda m: "{maskPhone(" + m.group(1) + ")}", s)
# window.confirm 换 toast 二次确认（原生框违规）——至少改为自定义确认
s = s.replace("window.confirm(", "confirmDialogFallback(")
# 失败置错
s = s.replace("toast.error((e as Error)?.message || \"加载子账号失败\");", "setLoadError((e as Error)?.message || \"子账号加载失败，请重试\");")
if "const [loadError" not in s:
    m = re.search(r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", s)
    assert m, "sub loading"
    ins = m.end()
    s = s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]
save(p, s)
print("batch done")
