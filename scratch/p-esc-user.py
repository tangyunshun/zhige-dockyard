# -*- coding: utf-8 -*-
# 低危收尾批次1：/user 各页弹窗 Esc 批量接线（useEscapeKey）
import io, re

def wire(path, states, import_anchor='import { getAuthToken } from "@/utils/auth";'):
    p = path
    s = io.open(p, encoding="utf-8").read()
    changed = False
    if "useEscapeKey" not in s:
        assert import_anchor in s, p + " import"
        s = s.replace(import_anchor, import_anchor + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";', 1)
        changed = True
    added = 0
    for state, setter in states:
        hook = f"  useEscapeKey({state}, () => {setter}(false));"
        if hook in s:
            continue
        # 在该 state 声明行后插入
        m = re.search(r"\n(\s*)const \[" + state + r", " + setter + r"\] = useState[^\n]*;", s)
        if not m:
            print("SKIP", p, state)
            continue
        ins = m.end()
        s = s[:ins] + "\n" + m.group(1) + hook.strip() + s[ins:]
        added += 1
    if added or changed:
        io.open(p, "w", encoding="utf-8", newline="").write(s)
        print("OK", p, f"+{added}")
    else:
        print("NOOP", p)

# profile：注销须知/安全检测/撤销注销
wire("src/app/user/profile/page.tsx", [
    ("showNoticeModal", "setShowNoticeModal"),
    ("showCheckModal", "setShowCheckModal"),
    ("showCancelConfirmModal", "setShowCancelConfirmModal"),
])

# security：下线全部/清空历史（单条下线/删单条用 kickTarget——对象态用 !!）
wire("src/app/user/security/page.tsx", [
    ("kickAllModal", "setKickAllModal"),
    ("clearAllHistoryModal", "setClearAllHistoryModal"),
])

# sub-accounts：创建弹窗
wire("src/app/user/sub-accounts/page.tsx", [
    ("showCreate", "setShowCreate"),
])

# workspaces：编辑/删除确认/删除 StepUp
wire("src/app/user/workspaces/page.tsx", [
    ("showEditModal", "setShowEditModal"),
    ("showDeleteConfirm", "setShowDeleteConfirm"),
    ("showDeleteStepUp", "setShowDeleteStepUp"),
])

# developer：创建/编辑/日志查看/日志删除确认
wire("src/app/user/developer/page.tsx", [
    ("showCreate", "setShowCreate"),
])

# reviews：删除确认/预览
wire("src/app/user/reviews/page.tsx", [
    ("previewRow", "setPreviewRow"),
])

# activities：详情/原始 JSON
wire("src/app/user/activities/page.tsx", [
    ("showDetailModal", "setShowDetailModal"),
    ("showRawJson", "setShowRawJson"),
])

# settings：恢复默认确认
wire("src/app/user/settings/page.tsx", [
    ("showResetConfirm", "setShowResetConfirm"),
])
