# -*- coding: utf-8 -*-
# UsageStatsTab：伪归因 + 假兜底真实化 + 英文枚举中文化 + 错误横幅
import io

P = "src/components/studio/UsageStatsTab.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 失败归因 i % 3 造假 → 删除伪造归因，改真实 errorCode/NULL
old_snippet = None
import re
m = re.search(r"i % 3", s)
assert m, "fake attribution"
# 查看上下文
i = m.start()
print(s[max(0,i-500):i+300])
