# -*- coding: utf-8 -*-
# PersonalPointsPaymentModal 加固（独立脚本，用正确锚点）
import io

p = "src/components/studio/PersonalPointsPaymentModal.tsx"
s = io.open(p, encoding="utf-8").read()

# imports
old = 'import { AlertCircle } from "lucide-react";'
new = 'import { AlertCircle } from "lucide-react";\nimport { useEscapeKey } from "@/hooks/useEscapeKey";\nimport { formatNumber } from "@/utils/format";'
assert old in s, "lucide import"
s = s.replace(old, new, 1)

# Esc + 千分位
s = s.replace("{requiredPoints}", "{formatNumber(requiredPoints)}", 1)
s = s.replace("{availablePoints}", "{formatNumber(availablePoints)}", 1)

# 在 return ( 前加 Esc（函数体内）
import re
m = re.search(r"(\n\s*)return \(", s)
if m and "useEscapeKey(" not in s:
    s = s[:m.start()] + "\n  useEscapeKey(true, onClose);\n" + s[m.start():]

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("payment modal OK")
