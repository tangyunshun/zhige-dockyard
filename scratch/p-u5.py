# -*- coding: utf-8 -*-
import io, re

def load(p): return io.open(p, encoding="utf-8").read()
def save(p, s): io.open(p, "w", encoding="utf-8", newline="").write(s); print("OK", p)

def ensure(s, anchor_re, import_after_re):
    if "const [loadError" not in s:
        m = re.search(anchor_re, s)
        assert m, "state"
        ins = m.end()
        s = s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]
    if "LoadErrorBanner" not in s:
        mi = re.search(import_after_re, s)
        assert mi, "import"
        ins = mi.end()
        s = s[:ins] + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";' + s[ins:]
    return s

# ── team ──
p = "src/app/user/team/page.tsx"
s = load(p)
s = ensure(s, r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", r"import React, { useState, useEffect } from" + chr(34) + "react" + chr(34) + ";")
if "maskEmail" not in s:
    s = s.replace('import LoadErrorBanner from "@/components/admin/LoadErrorBanner";',
                  'import LoadErrorBanner from "@/components/admin/LoadErrorBanner";\nimport { maskEmail } from "@/utils/format";', 1)
s = re.sub(r"\{(\w+\.email)\}", lambda m: "{maskEmail(" + m.group(1) + ")}", s)
s = s.replace('toast.error((e as Error)?.message || "加载失败");', 'setLoadError((e as Error)?.message || "团队空间加载失败，请重试");')
if "setLoadError(null)" not in s:
    m = re.search(r"(\n\s*)setOverviews\(", s)
    if m:
        s = s[:m.start()] + "\n  setLoadError(null);\n  setOverviews(" + s[m.end():]
m2 = re.search(r"(\{loading \? \(\n(?:.|\n)*?\n\s*\)\) : )", s)
if m2 and "loadError ?" not in s:
    s = s[:m2.end()] + "(\n          <div className=\"px-1 pb-3\">\n            <LoadErrorBanner message={loadError || \"\"} onRetry={() => { setLoadError(null); loadOverview(true); }} retrying={loading} />\n          </div>\n        )} : " + s[m2.end():]
save(p, s)

# ── sub-accounts ──
p = "src/app/user/sub-accounts/page.tsx"
s = load(p)
s = ensure(s, r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", r"import React, { useState, useEffect } from" + chr(34) + "react" + chr(34) + ";")
if "maskEmail" not in s:
    s = s.replace('import LoadErrorBanner from "@/components/admin/LoadErrorBanner";',
                  'import LoadErrorBanner from "@/components/admin/LoadErrorBanner";\nimport { maskEmail, maskPhone } from "@/utils/format";', 1)
s = re.sub(r"\{(\w+\.email)\}", lambda m: "{maskEmail(" + m.group(1) + ")}", s)
s = re.sub(r"\{(\w+\.phone)\}", lambda m: "{maskPhone(" + m.group(1) + ")}", s)
s = s.replace('toast.error((e as Error)?.message || "加载子账号失败");', 'setLoadError((e as Error)?.message || "子账号加载失败，请重试");')
if "setLoadError(null)" not in s:
    m = re.search(r"(\n\s*)setSubAccounts\(|(\n\s*)setSubs\(|(\n\s*)setAccounts\(", s)
    if m:
        s = s[:m.start()] + "\n  setLoadError(null);\n" + s[m.start():]
m2 = re.search(r"(\{loading \? \(\n(?:.|\n)*?\n\s*\)\) : )", s)
if m2 and "loadError ?" not in s:
    s = s[:m2.end()] + "(\n          <div className=\"px-1 pb-3\">\n            <LoadErrorBanner message={loadError || \"\"} onRetry={() => { setLoadError(null); load(); }} retrying={loading} />\n          </div>\n        )} : " + s[m2.end():]
save(p, s)
