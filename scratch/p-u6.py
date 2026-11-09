# -*- coding: utf-8 -*-
import io, re

def load(p): return io.open(p, encoding="utf-8").read()
def save(p, s): io.open(p, "w", encoding="utf-8", newline="").write(s); print("OK", p)

def ensure(s, import_anchor_line):
    if "const [loadError" not in s:
        m = re.search(r"\n(\s*)const \[loading, setLoading\] = useState[^\n]*;", s)
        assert m, "state"
        ins = m.end()
        s = s[:ins] + "\n" + m.group(1) + 'const [loadError, setLoadError] = useState<string | null>(null);' + s[ins:]
    if "LoadErrorBanner" not in s:
        i = s.find(import_anchor_line)
        assert i >= 0, "import line"
        le = s.find("\n", i)
        s = s[:le] + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";' + s[le:]
    return s

BANNER_IMPORT = 'import LoadErrorBanner from "@/components/admin/LoadErrorBanner";'

# ── team ──
p = "src/app/user/team/page.tsx"
s = load(p)
s = ensure(s, 'import { useState, useEffect, useCallback } from "react";')
if "maskEmail" not in s:
    s = s.replace(BANNER_IMPORT, BANNER_IMPORT + '\nimport { maskEmail } from "@/utils/format";', 1)
s = re.sub(r"\{(\w+\.email)\}", lambda m: "{maskEmail(" + m.group(1) + ")}", s)
s = s.replace('toast.error((e as Error)?.message || "加载失败");',
              'setLoadError((e as Error)?.message || "团队空间加载失败，请重试");')
if "setLoadError(null)" not in s:
    i = s.find("setOverviews(")
    if i > 0:
        ls = s.rfind("\n", 0, i)
        s = s[:ls] + "\n  setLoadError(null);" + s[ls:]
m2 = re.search(r"(\{loading \? \(\n(?:.|\n)*?\n\s*\)\) : )", s)
if m2 and "loadError ?" not in s:
    s = s[:m2.end()] + '(\n          <div className="px-1 pb-3">\n            <LoadErrorBanner message={loadError || ""} onRetry={() => { setLoadError(null); loadOverview(true); }} retrying={loading} />\n          </div>\n        )} : ' + s[m2.end():]
save(p, s)

# ── sub-accounts ──
p = "src/app/user/sub-accounts/page.tsx"
s = load(p)
s = ensure(s, 'import React, { useState, useEffect } from "react";')
if "maskEmail" not in s:
    s = s.replace(BANNER_IMPORT, BANNER_IMPORT + '\nimport { maskEmail, maskPhone } from "@/utils/format";', 1)
s = re.sub(r"\{(\w+\.email)\}", lambda m: "{maskEmail(" + m.group(1) + ")}", s)
s = re.sub(r"\{(\w+\.phone)\}", lambda m: "{maskPhone(" + m.group(1) + ")}", s)
for t in ["加载子账号失败", "加载子账号列表失败"]:
    s = s.replace('toast.error((e as Error)?.message || "%s");' % t,
                  'setLoadError((e as Error)?.message || "子账号加载失败，请重试");')
if "setLoadError(null)" not in s:
    for setter in ["setSubAccounts(", "setSubs(", "setAccounts(", "setList("]:
        i = s.find(setter)
        if i > 0:
            ls = s.rfind("\n", 0, i)
            s = s[:ls] + "\n  setLoadError(null);" + s[ls:]
            break
m2 = re.search(r"(\{loading \? \(\n(?:.|\n)*?\n\s*\)\) : )", s)
if m2 and "loadError ?" not in s:
    s = s[:m2.end()] + '(\n          <div className="px-1 pb-3">\n            <LoadErrorBanner message={loadError || ""} onRetry={() => { setLoadError(null); load(); }} retrying={loading} />\n          </div>\n        )} : ' + s[m2.end():]
save(p, s)
