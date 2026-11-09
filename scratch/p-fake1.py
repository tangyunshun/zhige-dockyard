# -*- coding: utf-8 -*-
# 假数据真实化批次：UsageStats 98.5% / UsageStatsTab 伪归因+假兜底 / TasksTab pointsCost||100 / 提报假文案
import io

# ── UsageStats.tsx：删 98.5% 假指标 + 失败横幅 + 死代码 ──
p = "src/components/studio/UsageStats.tsx"
s = io.open(p, encoding="utf-8").read()
i = s.find("平均成功率 98.5%")
print("UsageStats ctx:", s[max(0,i-400):i+150][-500:] if i > 0 else "NOT FOUND")
