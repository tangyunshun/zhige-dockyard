# -*- coding: utf-8 -*-
import io, re

p = "src/app/user/pay/mock/page.tsx"
s = io.open(p, encoding="utf-8").read()

m = re.search(
    r"(\n(\s*)const res = await authFetch\(`/api/payments/mock/confirm\?orderNo=\$\{encodeURIComponent\(orderNo\)\}`\);\n)\s*setOrder\(res\.data\);",
    s,
)
assert m, "fetch block"
indent = m.group(2)
replacement = (
    m.group(1)
    + indent + "if (res.status === 403) {\n"
    + indent + "  // KN-SEC：REAL 模式下模拟收银台被后端拒绝，页面降级为不可用且不渲染支付按钮\n"
    + indent + "  setError(res.message || \"当前为真实支付模式，模拟收银台不可用\");\n"
    + indent + "  setModeBlocked(true);\n"
    + indent + "  return;\n"
    + indent + "}\n"
    + indent + "setOrder(res.data);"
)
s = s[:m.start()] + replacement + s[m.end():]

old = "  const [error, setError] = useState<string | null>(null);"
assert old in s, "state"
s = s.replace(old, old + "\n  const [modeBlocked, setModeBlocked] = useState(false);", 1)

old = "  const pay = async () => {\n    setPaying(true);"
assert old in s, "pay fn"
s = s.replace(old, "  const pay = async () => {\n    if (modeBlocked) return; // KN-SEC：REAL 模式双保险\n    setPaying(true);", 1)

old = '{paying ? "处理中…" : "模拟支付成功"}'
assert old in s, "btn"
s = s.replace(old, '{modeBlocked ? "模拟支付不可用" : paying ? "处理中…" : "模拟支付成功"}', 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("mock gate OK")
