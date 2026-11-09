# -*- coding: utf-8 -*-
# workspace-hub 主页：错误横幅 + PendingSection 忽略接线 + 会员等级中文化 + 扫描定时器清理
import io

P = "src/app/workspace-hub/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 从 hook 解构 loadError
old = "const {"
# 找 hook 解构
i = s.find("useWorkspaceHubData()")
if i < 0:
    i = s.find("useWorkspaceHubData(")
# 找解构块：往上找最近的 const {
j = s.rfind("const {", 0, i)
k = s.find("} = ", j)
assert j > 0 and k > j, "hook destructure"
block = s[j:k]
if "loadError" not in block:
    s = s[:k] + "\n    loadError,\n  " + s[k:]

# 2. import LoadErrorBanner
if "LoadErrorBanner" not in s:
    a = 'import { useWorkspaceHubData } from "@/hooks/useWorkspaceHubData";'
    assert a in s, "hook import"
    s = s.replace(a, a + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)

# 3. 错误横幅：主 return 容器顶部
m = __import__("re").search(r"\n(\s*)return \(\n(\s*)<div", s)
assert m, "main return"
ins_at = m.end()
s = s[:ins_at] + ("\n" + m.group(2) + "  {loadError && (\n"
                  + m.group(2) + "    <div className=\"px-4 pt-4\">\n"
                  + m.group(2) + "      <LoadErrorBanner message={loadError} onRetry={() => refresh()} retrying={isLoading} />\n"
                  + m.group(2) + "    </div>\n"
                  + m.group(2) + "  )}") + s[ins_at:]

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("hub page banner OK")
