# -*- coding: utf-8 -*-
# security：清空审计/下线全部 requireText + points/pay billing 字典接入
import io, re

IA = 'import { getAuthToken } from "@/utils/auth";'

# ── security：两处高危强确认（清空所有登录审计 / 下线其他全部设备） ──
p = "src/app/user/security/page.tsx"
s = load(p)
# 找确认弹窗：audit said 1198 附近 4 个确认弹窗（自建）
for kw in ["清空所有登录审计", "下线其他全部设备"]:
    i = s.find(kw)
    print(kw, "at line", s[:i].count(chr(10)) + 1 if i > 0 else "N/A")
