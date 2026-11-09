# -*- coding: utf-8 -*-
import io

p = "src/components/workspace-hub/UserGreeting.tsx"
s = io.open(p, encoding="utf-8").read()

# 在 GOLD 后加 CROWN/PLATINUM/SILVER/BRONZE/ENTERPRISE 等
old = """    if (level === "GOLD") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-amber-500 text-white shadow-sm flex items-center gap-1 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          <span>黄金会员版</span>
        </span>
      );
    }
    return ("""
new = """    if (level === "GOLD") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-amber-500 text-white shadow-sm flex items-center gap-1 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          <span>黄金会员版</span>
        </span>
      );
    }
    if (level === "CROWN") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm flex items-center gap-1 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          <span>皇冠会员版</span>
        </span>
      );
    }
    if (level === "PLATINUM") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-300 text-slate-800 shadow-sm flex items-center gap-1 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          <span>铂金会员版</span>
        </span>
      );
    }
    if (level === "ENTERPRISE") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm flex items-center gap-1 shrink-0">
          <span>企业版</span>
        </span>
      );
    }
    return ("""
assert old in s, "GOLD block"
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("UserGreeting levels OK")
