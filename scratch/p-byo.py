# -*- coding: utf-8 -*-
# byo-model：删除模型 requireText 强确认 + 解绑全部空间前确认 + Esc
import io, re

P = "src/app/user/byo-model/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. confirmDialog state 加 requireText
old = """  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warnings?: string[];
    onConfirm: () => void | Promise<void>;
  }>"""
if old not in s:
    # 兜底：宽松匹配
    m = re.search(r"const \[confirmDialog, setConfirmDialog\] = useState<\{[^}]*onConfirm: \(\) => void \| Promise<void>;\n?\s*\}>", s, re.S)
    assert m, "confirmDialog state"
    block = m.group(0)
    new_block = block.replace("onConfirm: () => void | Promise<void>;", "requireText?: { expect: string; hint?: string };\n    onConfirm: () => void | Promise<void>;")
    s = s.replace(block, new_block, 1)
else:
    s = s.replace(old, old.replace("onConfirm", "requireText?: { expect: string; hint?: string };\n    onConfirm"), 1)

# 2. removeDef 加 requireText（expect=模型名）
old = """    setConfirmDialog({
      isOpen: true,
      title: "删除模型库定义",
      message: `确认删除「${def.label}」？其绑定的所有空间将自动解除该自带模型并回落到空间/平台默认模型。`,
      warnings: ["删除后该定义不可恢复；已绑定空间的生效行会一并清除。"],"""
new = """    setConfirmDialog({
      isOpen: true,
      title: "删除模型库定义",
      message: `确认删除「${def.label}」？其绑定的所有空间将自动解除该自带模型并回落到空间/平台默认模型。`,
      warnings: ["删除后该定义不可恢复；已绑定空间的生效行会一并清除。"],
      requireText: { expect: "DELETE", hint: "删除后定义与空间绑定一并清除，请输入「DELETE」以确认" },"""
assert old in s, "removeDef"
s = s.replace(old, new, 1)

# 3. ConfirmDialog 透传 requireText
old = """      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}"""
new = """      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        requireText={confirmDialog.requireText}"""
assert old in s, "passthrough"
s = s.replace(old, new, 1)

# 4. saveAssignments：解除全部绑定时（assignments.length === 0）加确认
old = """  const saveAssignments = async () => {
    if (!assigningId) return;
    const assignments = Object.keys(selectedWs)
      .filter((wsId) => selectedWs[wsId])
      .map((wsId) => ({ workspaceId: wsId, enabled: assignEnabled, shareWithMembers: assignShare }));
    setSavingAssign(true);"""
new = """  const saveAssignments = async () => {
    if (!assigningId) return;
    const assignments = Object.keys(selectedWs)
      .filter((wsId) => selectedWs[wsId])
      .map((wsId) => ({ workspaceId: wsId, enabled: assignEnabled, shareWithMembers: assignShare }));
    // KN-UI：清空全部勾选 = 解除该模型的所有空间绑定（不可逆），需二次确认（自查清单指令四）
    if (assignments.length === 0 && !unbindAllConfirmed) {
      setUnbindAllConfirm(true);
      return;
    }
    setSavingAssign(true);"""
assert old in s, "saveAssignments"
s = s.replace(old, new, 1)

# 5. state：unbindAllConfirmed + 确认弹窗
old = "  const [prefillWorkspaceId, setPrefillWorkspaceId] = useState<string | null>(null);"
assert old in s, "prefill state"
new = old + "\n  // KN-UI：解除全部绑定确认（自查清单指令四）\n  const [unbindAllConfirmed, setUnbindAllConfirmed] = useState(false);\n  const [unbindAllConfirmOpen, setUnbindAllConfirmOpen] = useState(false);"
s = s.replace(old, new, 1)

# 6. Esc
if "useEscapeKey" not in s:
    a = 'import { ConfirmDialog } from "@/components/ConfirmDialog";'
    assert a in s
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";', 1)
# 找一个组件内锚点插 hook
m = re.search(r"\n(\s*)const \[confirmDialog, setConfirmDialog\]", s)
ins = m.end()
s = s[:ins] + "\n  useEscapeKey(!!assigningId && unbindAllConfirmOpen, () => setUnbindAllConfirmOpen(false));" + s[ins:]

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("byo-model OK")
