# -*- coding: utf-8 -*-
import io, re

p = "src/app/workspace/[id]/settings/permissions/page.tsx"
s = io.open(p, encoding="utf-8").read()

old = '''  if (isPersonalSpace) {
    return (
      <div className="min-h-screen bg-[#f0f8ff] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm font-black text-slate-700">个人空间不支持岗位权限配置</p>
          <p className="text-xs text-slate-400">岗位与组件权限矩阵是企业空间专属功能，可升级为企业空间后使用。</p>
        </div>
      </div>
    );
  }'''
new = '''  if (isPersonalSpace) {
    return (
      <div className="min-h-screen bg-[#f0f8ff] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm font-black text-slate-700">当前账号无岗位权限配置权限</p>
          <p className="text-xs text-slate-400">个人空间不支持岗位权限配置；企业空间的岗位与权限矩阵仅空间所有者/管理员可编辑。</p>
        </div>
      </div>
    );
  }'''
assert old in s, "personal gate"
s = s.replace(old, new, 1)

m = re.search(r"\n(\s*)return \(\n(\s*)<div", s)
assert m, "main return"
ins_at = m.end()
s = s[:ins_at] + (
    "\n" + m.group(2) + "  {loadErrorPosts && (\n"
    + m.group(2) + "    <div className=\"mb-4\">\n"
    + m.group(2) + "      <LoadErrorBanner message={loadErrorPosts} onRetry={() => { setLoadErrorPosts(null); loadWorkspacePosts(); }} />\n"
    + m.group(2) + "    </div>\n"
    + m.group(2) + "  )}"
) + s[ins_at:]

if "LoadErrorBanner" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    assert a in s, "import"
    s = s.replace(a, a + '\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("perm banner + gate text OK")
