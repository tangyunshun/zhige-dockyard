# -*- coding: utf-8 -*-
# DissolvePersonalWorkspaceModal：高危强确认 + 状态中文化 + Esc + 错误态 + 脱敏/清理（修正版）
import io, re

P = "src/components/workspace/DissolvePersonalWorkspaceModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. imports + state + Esc
if "useEscapeKey" not in s:
    a = 'import { useToast } from "@/components/Toast";'
    assert a in s, "toast import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";\nimport { formatNumber } from "@/utils/format";\nimport LoadErrorBanner from "@/components/admin/LoadErrorBanner";', 1)
anchor = "  const toast = useToast();"
assert anchor in s
ins = s.find(anchor) + len(anchor)
s = s[:ins] + ("\n  // KN-UI：高危清理动作「输入 DELETE」强确认（自查清单指令四）\n"
               "  const [cleanupConfirm, setCleanupConfirm] = useState<null | { action: string; label: string }>(null);\n"
               "  const [checkFailed, setCheckFailed] = useState(false);\n"
               "  useEscapeKey(!!cleanupConfirm, () => setCleanupConfirm(null));") + s[ins:]

# 2. handleCleanupAction 拦截
old = """  const handleCleanupAction = async (
    action: "UNBIND_ASSETS" | "CANCEL_TASKS" | "CLEAR_ALL" | "UNBIND_SINGLE_ASSET" | "CANCEL_SINGLE_TASK",
    targetId?: string
  ) => {
    setCleaning(true);"""
new = """  const handleCleanupAction = async (
    action: "UNBIND_ASSETS" | "CANCEL_TASKS" | "CLEAR_ALL" | "UNBIND_SINGLE_ASSET" | "CANCEL_SINGLE_TASK",
    targetId?: string
  ) => {
    // KN-UI：不可逆清理必须先过「输入 DELETE」强确认弹窗
    const labelMap: Record<string, string> = {
      CLEAR_ALL: "一键清空全部沙箱依赖",
      UNBIND_ASSETS: "批量解绑所有个人组件",
      CANCEL_TASKS: "批量清理所有效能任务",
      UNBIND_SINGLE_ASSET: "解绑该组件",
      CANCEL_SINGLE_TASK: "清理该任务",
    };
    setCleanupConfirm({ action, label: labelMap[action] || action });
    return;
  };

  const executeCleanup = async (
    action: "UNBIND_ASSETS" | "CANCEL_TASKS" | "CLEAR_ALL" | "UNBIND_SINGLE_ASSET" | "CANCEL_SINGLE_TASK",
    targetId?: string
  ) => {
    setCleaning(true);"""
assert old in s, "head"
s = s.replace(old, new, 1)

# 3. 任务状态中文化
s = s.replace(
    "状态：{task.status}",
    '状态：{task.status === "RUNNING" ? "运行中" : task.status === "COMPLETED" ? "已完成" : task.status === "FAILED" ? "已失败" : task.status === "CANCELLED" ? "已取消" : "处理中"}',
    1,
)

# 4. usageCount 千分位 + console.error 清理
s = s.replace("{asset.usageCount}", "{formatNumber(asset.usageCount)}")
s = s.replace('console.error("加载空间盘点数据失败:", error)', 'setCheckFailed(true)')

# 5. 错误横幅：return 后第一个子容器
m = re.search(r"\n(\s*)return \(\n(\s*)<div", s)
assert m, "return"
ins_at = m.end()
s = s[:ins_at] + ("\n" + m.group(2) + "  {!scanning && checkFailed && (\n"
                  + m.group(2) + "    <div className=\"mb-4\">\n"
                  + m.group(2) + "      <LoadErrorBanner message=\"合规盘点接口失败，无法获取真实依赖数据。请点击【重新检测】重试；在检测成功前请勿注销空间。\" onRetry={() => { setCheckFailed(false); runPersonalCheck(); }} retrying={scanning} />\n"
                  + m.group(2) + "    </div>\n"
                  + m.group(2) + "  )}") + s[ins_at:]

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("personal step1 OK")
