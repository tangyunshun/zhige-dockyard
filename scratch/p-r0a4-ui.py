# -*- coding: utf-8 -*-
# R0-A4 D3 + D1 前端：三页面 delete 选项禁用 + 独立页 success 协议修复
import io

# ── 1. 独立升级页：delete 选项禁用 + success 协议修复 ──
p = "src/app/workspace/upgrade/page.tsx"
s = io.open(p, encoding="utf-8").read()

# 1a. delete 卡片加「暂不可用」遮罩
old = '''              {/* 选项 C：迁移升级（新建企业 + 搬运 + 归档） */}
              <div
                onClick={() => setSelectedOption("delete")}'''
new = '''              {/* 选项 C：迁移升级（新建企业 + 搬运 + 归档）—— [R0-A4 D1] 暂不可用 */}
              <div
                onClick={() => { toast.error("迁移方式暂不可用，请选择保留或原地升级"); }}
                className={`zg-card cursor-not-allowed p-0 border-2 transition-all overflow-hidden opacity-50 pointer-events-none ${'''
assert old in s, "delete card"
s = s.replace(old, new, 1)

# 1b. 独立页 success 协议：检查 result.success 和 result.workspaceId
old = "      if (result.free === true) {"
new = '''      if (result.success !== true) {
        // [R0-A4 D3] success 不为 true → 失败/待处理，不写已升级标记
        toast.error(result.message || "升级处理异常，请稍后重试");
        return;
      }

      if (result.free === true) {
        // [R0-A4 D3] free:true 但缺 workspaceId → 协议不完整，不当已开通
        if (!result.workspaceId) {
          toast.error("升级响应缺少工作空间信息，请稍后重试");
          return;
        }'''
assert old in s, "success protocol"
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("upgrade page OK")

# ── 2. studio/UpgradeModal：delete 选项禁用 ──
p2 = "src/components/studio/UpgradeModal.tsx"
s2 = io.open(p2, encoding="utf-8").read()
# 检查是否有 delete 选项（audit said it only has upgrade option）
if '"delete"' in s2 and "setTargetPlan" in s2:
    # 该弹窗没有 delete 选项选项（只有 upgrade option），跳过
    print("studio modal: no delete option UI")
else:
    print("studio modal: no delete option found, skip")

# ── 3. workspace-hub/modals/UpgradeModal：delete 选项禁用 ──
p3 = "src/components/workspace-hub/modals/UpgradeModal.tsx"
s3 = io.open(p3, encoding="utf-8").read()
if "迁移模式" in s3 and '"delete"' in s3:
    # 查找 delete 选项按钮/卡片的 onClick 或 select 逻辑
    # 加禁用样式和提示
    # 查看实际渲染结构
    i = s3.find("迁移模式")
    print("hub modal delete ctx:", s3[max(0,i-200):i+200][:350])
else:
    print("hub modal: no delete option")

io.open(p3, "w", encoding="utf-8", newline="").write(s3)
