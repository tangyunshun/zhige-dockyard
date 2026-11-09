# -*- coding: utf-8 -*-
import io

p = "src/app/workspace-hub/page.tsx"
s = io.open(p, encoding="utf-8").read()

# 撤销错误插入
old_bad = '\n      {loadError && (\n        <div className="px-4 pt-4">\n          <LoadErrorBanner message={loadError} onRetry={() => refresh()} retrying={isLoading} />\n        </div>\n      )}'
if old_bad in s:
    s = s.replace(old_bad, "", 1)
    print("reverted bad insert")

# 找主组件 return：搜索「核心业务指标」向上最近的 return (
i = s.find("核心业务指标")
r = s.rfind("return (", 0, i)
assert r > 0, "main return"

# 找该 return 后第一个 <div...> 的结束 >
gt = s.find(">", s.find("<div", r))
assert gt > 0, "container close"

banner = '\n      {loadError && (\n        <div className="px-4 pt-4">\n          <LoadErrorBanner message={loadError} onRetry={() => refresh()} retrying={isLoading} />\n        </div>\n      )}'
s = s[:gt + 1] + banner + s[gt + 1:]

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("banner placed at correct location")
