# -*- coding: utf-8 -*-
# members/page.tsx 修复：移出确认弹窗、OWNER 变更强确认、角色中文徽章、邮箱脱敏、loading 防抖、空态、错误横幅、残留清理
import io, re

P = "src/app/workspace/[id]/members/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 0. import：useToast 已有？确认；引入 ConfirmDialog/maskEmail/formatNumber/formatDate/LoadErrorBanner
if "ConfirmDialog" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    assert a in s, "auth import"
    s = s.replace(a, a + '\nimport { ConfirmDialog } from "@/components/ConfirmDialog";\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";\nimport { maskEmail, formatNumber, formatDate } from "@/utils/format";', 1)

# 1. state：确认弹窗 + 防抖标记
m = re.search(r"\n(\s*)const \[loadError, setLoadError\] = useState", s)
if not m:
    m2 = re.search(r"\n(\s*)const \[loading, setLoading\] = useState", s)
    assert m2, "loading state"
    ins = m2.end()
    s = s[:ins] + ("\n" + m2.group(1) + "const [loadError, setLoadError] = useState<string | null>(null);"
                   "\n" + m2.group(1) + "// KN-UI：移出成员/角色变更确认弹窗与防连点（自查清单指令四/九）"
                   "\n" + m2.group(1) + "const [removeConfirm, setRemoveConfirm] = useState<{ userId: string; name: string } | null>(null);"
                   "\n" + m2.group(1) + "const [ownerConfirm, setOwnerConfirm] = useState<{ userId: string; name: string } | null>(null);"
                   "\n" + m2.group(1) + "const [ownerConfirmText, setOwnerConfirmText] = useState(\"\");"
                   "\n" + m2.group(1) + "const [busyId, setBusyId] = useState<string | null>(null);") + s[ins:]

# 2. handleRemoveMember 改为弹窗触发；执行函数加防抖
old = """  const handleRemoveMember = async (targetUserId: string, targetName: string) => {
    try {
      const authToken = getAuthToken();"""
new = """  const handleRemoveMember = async (targetUserId: string, targetName: string) => {
    if (busyId) return; // KN-UI：防连点
    setBusyId(targetUserId);
    try {
      const authToken = getAuthToken();"""
assert old in s, "remove head"
s = s.replace(old, new, 1)
# 函数 finally（找该函数 catch 结束）
i = s.find("const handleRemoveMember")
seg_end = s.find("\n  };", i)
seg = s[i:seg_end]
if "finally" not in seg:
    s = s[:seg_end] + " finally {\n      setBusyId(null);\n      setRemoveConfirm(null);\n    }" + s[seg_end:]
else:
    print("WARN: remove has finally, manual check")

# 3. handleChangeRole：OWNER 变更走强确认弹窗
i = s.find("const handleChangeRole = async (targetUserId: string, newRole: string) => {")
seg_end2 = s.find("\n  };", i)
seg2 = s[i:seg_end2]
old_call = "handleChangeRole(m.userId, e.target.value as any)"
new_call = """onChange={(e) => {
                          const next = e.target.value as any;
                          if (next === "OWNER") {
                            setOwnerConfirm({ userId: m.userId, name: m.name });
                            setOwnerConfirmText("");
                            e.target.value = "ADMIN";
                          } else {
                            handleChangeRole(m.userId, next);
                          }
                        }}"""
# select 的 onChange 在 JSX 里为 onChange={(e) => handleChangeRole(m.userId, e.target.value as any)}
old_jsx = 'onChange={(e) => handleChangeRole(m.userId, e.target.value as any)}'
assert old_jsx in s, "select onChange"
s = s.replace(old_jsx, new_call, 1)
# handleChangeRole 内加防抖
s = s.replace(
    "const handleChangeRole = async (targetUserId: string, newRole: string) => {\n    try {",
    "const handleChangeRole = async (targetUserId: string, newRole: string) => {\n    if (busyId) return; // KN-UI：防连点\n    setBusyId(targetUserId);\n    try {", 1)
i = s.find("const handleChangeRole")
seg_end = s.find("\n  };", s.find("const handleChangeRole"))
seg = s[i:seg_end]
if "finally" not in seg:
    s = s[:seg_end] + " finally {\n      setBusyId(null);\n    }" + s[seg_end:]

# 4. 角色徽章中文化
old = """                          {isTargetOwner ? (
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-200 text-[9px] rounded font-bold">Owner</span>
                          ) : isTargetAdmin ? (
                            <span className="px-1.5 py-0.2 bg-purple-50 text-purple-600 border border-purple-200 text-[9px] rounded font-bold">Admin</span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 border text-[9px] rounded font-bold">Member</span>
                          )}"""
new = """                          {isTargetOwner ? (
                            <span className="px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-200 text-[9px] rounded font-bold">所有者</span>
                          ) : isTargetAdmin ? (
                            <span className="px-1.5 py-0.2 bg-purple-50 text-purple-600 border border-purple-200 text-[9px] rounded font-bold">管理员</span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 border text-[9px] rounded font-bold">协同成员</span>
                          )}"""
assert old in s, "role badge"
s = s.replace(old, new, 1)

# 5. 邮箱脱敏
old = """                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{m.email}</p>"""
new = """                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{maskEmail(m.email)}</p>"""
assert old in s, "email mask"
s = s.replace(old, new, 1)

# 6. 移出按钮改为打开确认弹窗 + loading
old = """                        <button
                          onClick={() => handleRemoveMember(m.userId, m.name)}"""
new = """                        <button
                          onClick={() => setRemoveConfirm({ userId: m.userId, name: m.name || "该成员" })}
                          disabled={busyId === m.userId}"""
assert old in s, "remove btn"
s = s.replace(old, new, 1)

# 7. 空态 + 错误横幅：找成员列表渲染容器（(0 人) 附近）
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("members step1 OK")
