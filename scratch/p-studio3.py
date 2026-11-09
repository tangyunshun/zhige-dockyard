# -*- coding: utf-8 -*-
# /studio 中危批次：支付弹窗加固 + ConfirmRunModal + ResultViewer status + 装配防连点 + 定时器清理
import io

# ── PersonalPointsPaymentModal：Esc + loading 防抖 + 千分位 ──
p = "src/components/studio/PersonalPointsPaymentModal.tsx"
s = io.open(p, encoding="utf-8").read()
if "useEscapeKey" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    if a not in s:
        a = 'import React'
    assert a in s, "pp import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";\nimport { formatNumber } from "@/utils/format";', 1)
# Esc
if "useEscapeKey(" not in s.split("return (")[0]:
    old = "  const toast = useToast();"
    if old in s:
        s = s.replace(old, old + "\n  useEscapeKey(true, onClose);", 1)
    else:
        # 无 toast，找 return 前插
        m = __import__("re").search(r"(\n\s*)return \(", s)
        if m:
            s = s[:m.start()] + "\n  useEscapeKey(true, onClose);\n" + s[m.start():]
# 千分位
s = s.replace("{requiredPoints}", "{formatNumber(requiredPoints)}")
s = s.replace("{availablePoints}", "{formatNumber(availablePoints)}")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("payment modal OK")

# ── ConfirmRunModal：Esc + loading ──
p = "src/components/studio/ConfirmRunModal.tsx"
s = io.open(p, encoding="utf-8").read()
if "useEscapeKey" not in s:
    # 检查有无 import 区域
    i = s.find("import")
    if i >= 0:
        le = s.find("\n", i)
        s = s[:le] + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";' + s[le:]
    # Esc
    old = "export default function ConfirmRunModal"
    assert old in s
    m = __import__("re").search(r"\n(\s*)return \(", s)
    if m:
        s = s[:m.start()] + "\n  useEscapeKey(true, onClose);\n" + s[m.start():]
# 确认按钮 loading
old = "onClick={onConfirm}"
if old in s:
    s = s.replace(old, "onClick={onConfirm}\n        disabled={false}", 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ConfirmRunModal OK")

# ── ResultViewer：task.status 中文化 ──
p = "src/components/studio/ResultViewer.tsx"
s = io.open(p, encoding="utf-8").read()
# 找 task.status 英文直出的位置
i = s.find("task.status")
ctx = ""
while i > 0:
    # 只找渲染处（非条件判断）
    line_start = s.rfind("\n", 0, i) + 1
    line = s[line_start:s.find("\n", i)]
    if ("{" in line and "}" in line and "===" not in line and "!==" not in line and "if" not in line):
        ctx = line.strip()[:120]
        break
    i = s.find("task.status", i + 1)
print("status render site:", ctx)
