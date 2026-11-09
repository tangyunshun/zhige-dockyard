# -*- coding: utf-8 -*-
# hub modal：delete 选项禁用 + free 缺 workspaceId 校验
import io

p = "src/components/workspace-hub/modals/UpgradeModal.tsx"
s = io.open(p, encoding="utf-8").read()

# 1. delete 选项 onClick 改为提示暂不可用
old = 'onClick={() => !loading && setOption("delete")}'
new = 'onClick={() => { if (!loading) { toast.info("迁移方式暂不可用，请选择保留或原地升级"); } }}'
assert old in s, "delete onClick"
s = s.replace(old, new, 1)

# 2. free:true 缺 workspaceId 校验
old = """        if (data.free === true) {
          toast.success(data.message || "空间升级成功！");"""
new = """        if (data.free === true) {
          // [R0-A4 D3] free:true 但缺 workspaceId → 协议不完整
          if (!data.workspaceId) {
            toast.error("升级响应缺少工作空间信息，请稍后重试");
            return;
          }
          toast.success(data.message || "空间升级成功！");"""
assert old in s, "free workspaceId check"
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("hub modal delete disabled + workspaceId check OK")

# ── studio/UpgradeModal：同样加 free workspaceId 校验 ──
p = "src/components/studio/UpgradeModal.tsx"
s = io.open(p, encoding="utf-8").read()
old = """        if (data.free === true) {
          toast.success(data.message || "空间升级成功！");"""
new = """        if (data.free === true) {
          // [R0-A4 D3] free:true 但缺 workspaceId → 协议不完整
          if (!data.workspaceId) {
            toast.error("升级响应缺少工作空间信息，请稍后重试");
            return;
          }
          toast.success(data.message || "空间升级成功！");"""
if old in s:
    s = s.replace(old, new, 1)
    io.open(p, "w", encoding="utf-8", newline="").write(s)
    print("studio modal workspaceId check OK")
else:
    print("studio modal: free block not found (may already have it)")
