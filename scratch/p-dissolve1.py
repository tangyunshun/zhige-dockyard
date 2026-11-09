# -*- coding: utf-8 -*-
# DissolveWorkspaceCheckModal：清理动作 requireText 强确认 + 角色/邮箱中文化脱敏 + Esc + 错误态
import io

P = "src/components/workspace/DissolveWorkspaceCheckModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. imports
if "useEscapeKey" not in s:
    a = 'import { useToast } from "@/components/Toast";'
    assert a in s
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";\nimport { maskEmail, formatNumber } from "@/utils/format";', 1)

# 2. state + Esc
m = io.open(P, encoding="utf-8").read()
anchor = "  const toast = useToast();"
assert anchor in s
ins = s.find(anchor) + len(anchor)
s = s[:ins] + ("\n  // KN-UI：高危清理动作「输入 DELETE」强确认（自查清单指令四）\n"
               "  const [cleanupConfirm, setCleanupConfirm] = useState<null | { action: string; label: string; expect: string }>(null);\n"
               "  useEscapeKey(!!cleanupConfirm, () => setCleanupConfirm(null));"
               ) + s[ins:]

# 3. handleCleanupAction 入口改为弹窗确认（CLEAR_ALL / REMOVE_MEMBERS / UNBIND_ASSETS 批量类）
old = """  const handleCleanupAction = async (
    action: "REMOVE_MEMBERS" | "UNBIND_ASSETS" | "CLEAR_ALL" | "REMOVE_SINGLE_MEMBER" | "UNBIND_SINGLE_ASSET",
    targetId?: string
  ) => {
    setCleaning(true);"""
new = """  const handleCleanupAction = async (
    action: "REMOVE_MEMBERS" | "UNBIND_ASSETS" | "CLEAR_ALL" | "REMOVE_SINGLE_MEMBER" | "UNBIND_SINGLE_ASSET",
    targetId?: string
  ) => {
    // KN-UI：批量/一键类不可逆操作必须先过「输入 DELETE」强确认弹窗
    if (action === "CLEAR_ALL" || action === "REMOVE_MEMBERS" || action === "UNBIND_ASSETS") {
      const labelMap: Record<string, string> = {
        CLEAR_ALL: "一键清空全部依赖数据",
        REMOVE_MEMBERS: "批量移出所有成员",
        UNBIND_ASSETS: "批量解绑所有资产",
      };
      setCleanupConfirm({ action, label: labelMap[action], expect: "DELETE" });
      return;
    }
    // 单条移出/解绑也需确认（误触即影响他人）
    if (action === "REMOVE_SINGLE_MEMBER" || action === "UNBIND_SINGLE_ASSET") {
      const labelMap2: Record<string, string> = {
        REMOVE_SINGLE_MEMBER: "移出该成员",
        UNBIND_SINGLE_ASSET: "解绑该资产",
      };
      setCleanupConfirm({ action, label: labelMap2[action], expect: "DELETE" });
      return;
    }
    await executeCleanup(action, targetId);
  };

  const executeCleanup = async (
    action: "REMOVE_MEMBERS" | "UNBIND_ASSETS" | "CLEAR_ALL" | "REMOVE_SINGLE_MEMBER" | "UNBIND_SINGLE_ASSET",
    targetId?: string
  ) => {
    setCleaning(true);"""
assert old in s, "cleanup head"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("dissolve-check step1 OK")
