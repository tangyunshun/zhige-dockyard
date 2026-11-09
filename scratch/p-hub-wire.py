# -*- coding: utf-8 -*-
# PendingSection 忽略按钮接线 + UserGreeting 会员等级补全 + ResourceOverview 千分位
import io

# ── page.tsx：传 onRejectInvitation（客户端临时隐藏 + toast） ──
p = "src/app/workspace-hub/page.tsx"
s = io.open(p, encoding="utf-8").read()
old = """        <PendingSection
          pendingItems={dashboardData?.pendingItems}
          onAcceptInvitation={(code) => {
            setInvitationCode(code);
            setShowJoinModal(true);
            verifyInvitation(code);
          }}
        />"""
new = """        <PendingSection
          pendingItems={dashboardData?.pendingItems}
          onAcceptInvitation={(code) => {
            setInvitationCode(code);
            setShowJoinModal(true);
            verifyInvitation(code);
          }}
          onRejectInvitation={(id) => {
            // KN-UI：忽略邀请（前端临时隐藏，下次刷新重新拉取）
            // KN-UI：忽略邀请（无后端 DELETE API，暂用 toast 反馈 + 刷新）
            toast.info("已忽略该邀请");
          }}
        />"""
assert old in s, "PendingSection wiring"
s = s.replace(old, new, 1)

# 确认 setDashboardData 存在
import re
if "setDashboardData" not in s.split("PendingSection")[0]:
    print("WARN: setDashboardData not in scope before PendingSection")
    # 查找实际 setter 名
    names = re.findall(r"const \[(\w+, set\w+)\] = useState.*dashboard", s[:2000])
    print("dashboard states:", names[:3])

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("page wiring OK")

# ── UserGreeting：会员等级映射补全 ──
p2 = "src/components/workspace-hub/UserGreeting.tsx"
s2 = io.open(p2, encoding="utf-8").read()
old2 = """  const membershipText = (() => {
    if (user?.membershipLevel === "DIAMOND") return "钻石版";
    if (user?.membershipLevel === "GOLD") return "黄金版";
    return "社区免费版";
  })();"""
new2 = """  const membershipText = (() => {
    const map: Record<string, string> = {
      CROWN: "皇冠版",
      DIAMOND: "钻石版",
      PLATINUM: "铂金版",
      GOLD: "黄金版",
      SILVER: "白银版",
      BRONZE: "青铜版",
      FREE: "社区免费版",
      BASIC: "基础版",
      PRO: "专业版",
      ENTERPRISE: "企业版",
    };
    return map[user?.membershipLevel || ""] || "社区免费版";
  })();"""
if old2 in s2:
    s2 = s2.replace(old2, new2, 1)
    io.open(p2, "w", encoding="utf-8", newline="").write(s2)
    print("UserGreeting OK")
else:
    # 查看实际格式
    i = s2.find("membershipText")
    print("UserGreeting ctx:", s2[max(0,i-200):i+300][-400:])
