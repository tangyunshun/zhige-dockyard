# -*- coding: utf-8 -*-
# 用户工作台静默失败修复批次：dashboard / billing-center / team / sub-accounts
import io, re

def add_banner_import(s):
    if "LoadErrorBanner" not in s:
        a = 'import { getAuthToken } from "@/utils/auth";'
        assert a in s, "import anchor"
        s = s.replace(a, a + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
    return s

# ── dashboard ──
p = "src/app/user/dashboard/page.tsx"
s = io.open(p, encoding="utf-8").read()
s = add_banner_import(s)
# catch 置错
old = """    } catch (error) {
      console.error("Load dashboard data error:", error);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }"""
new = """    } catch (error) {
      setLoadError("工作台数据加载失败，请重试");
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }"""
assert old in s, "dash catch"
s = s.replace(old, new, 1)
# state
m = re.search(r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", s)
assert m, "dash loading"
ins = m.end()
s = s[:ins] + "\n" + m.group(1) + "const [loadError, setLoadError] = useState<string | null>(null);" + s[ins:]
# JSX：loading 分支后插横幅。找 loading 渲染
m2 = re.search(r"(\n\s*)if \(loading\) \{\n\s*return \(\n(?:.|\n)*?\n\s*\);\n\s*\}", s)
if m2:
    # 在 if(loading) 块后插独立横幅 return 前置不可行——改为在主 return 顶部插。找主 return
    m3 = re.search(r"\n(\s*)return \(\n(\s*)<div", s[m2.end():])
    if m3:
        base = m2.end()
        ins_at = base + m3.end()
        s = s[:ins_at] + ("\n" + m3.group(2) + "  {loadError && (\n"
                          + m3.group(2) + "    <div className=\"mb-4\">\n"
                          + m3.group(2) + "      <LoadErrorBanner message={loadError} onRetry={() => { setLoadError(null); loadDashboardData(); }} retrying={loading} />\n"
                          + m3.group(2) + "    </div>\n"
                          + m3.group(2) + "  )}") + s[ins_at:]
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("dashboard OK")
