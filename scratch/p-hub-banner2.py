# -*- coding: utf-8 -*-
import io

p = "src/app/workspace-hub/page.tsx"
s = io.open(p, encoding="utf-8").read()

anchor = '<div className="min-h-screen flex flex-col relative">'
assert anchor in s, "main container"

banner = anchor + '\n      {loadError && (\n        <div className="px-4 pt-4">\n          <LoadErrorBanner message={loadError} onRetry={() => refresh()} retrying={isLoading} />\n        </div>\n      )}'
s = s.replace(anchor, banner, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("banner placed")
