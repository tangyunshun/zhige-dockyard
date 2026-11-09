# -*- coding: utf-8 -*-
# 修正版：用精确锚点逐页处理
import io, re

def load(p): return io.open(p, encoding="utf-8").read()
def save(p, s): io.open(p, "w", encoding="utf-8", newline="").write(s); print("OK", p)
IA = 'import { getAuthToken } from "@/utils/auth";'

def ensure_banner(s):
    if "LoadErrorBanner" not in s:
        assert IA in s
        s = s.replace(IA, IA + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
    return s

def ensure_state(s, anchor_state_re):
    if "const [loadError" in s:
        return s
    m = re.search(anchor_state_re, s)
    assert m, "state"
    ins = m.end()
    return s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]

# ── billing-center ──
p = "src/app/user/billing-center/page.tsx"
s = load(p)
s = ensure_banner(s)
s = ensure_state(s, r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;")
old = """    } catch (err) {"""
# 找 load 的 catch（唯一）
i = s.find("} catch (err) {")
assert i > 0
j = s.find("toast.error", i)
k = s.find("\n", j)
seg = s[i:k]
s = s[:i] + "} catch (err) {\n      setLoadError((err as Error)?.message || \"账票中心数据加载失败，请重试\");" + s[k:]
# 成功清空：Promise.all 之后的成功尾——在最后一个 if (statsRes.ok) 块后……直接在 return 前清有副作用风险；改在四个 if 块都成功路径：找 'if (statsRes.ok)' 块尾下一行
m = re.search(r"(if \(statsRes\.ok\) \{\n(?:.|\n)*?\n\s*\}\n)", s)
if m:
    s = s[:m.end()] + "    setLoadError(null);" + s[m.end():]
# JSX
old_jsx = """      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-9 h-9 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">正在从数据库拉取套餐、空间与账单数据...</p>
        </div>
      ) : ("""
new_jsx = """      {loading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-9 h-9 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">正在从数据库拉取套餐、空间与账单数据...</p>
        </div>
      ) : loadError ? (
        <div className="px-1 pb-2">
          <LoadErrorBanner message={loadError} onRetry={() => { setLoadError(null); loadBillingCenter(); }} retrying={loading} />
        </div>
      ) : ("""
assert old_jsx in s, "billing jsx"
s = s.replace(old_jsx, new_jsx, 1)
# load 函数名
import re as _re
names = _re.findall(r"const (\w+) = async", s)
print("billing fns:", names[:5])
save(p, s)
