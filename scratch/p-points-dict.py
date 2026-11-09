# -*- coding: utf-8 -*-
# points 页：类型/支付方式走 billing_display_dict DB 字典（红线：不硬编码英文兜底）
import io

P = "src/app/user/points/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. import 字典工具
if "lookupBillingValueLabel" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    assert a in s, "import"
    s = s.replace(a, a + '\nimport { lookupBillingValueLabel, setBillingDicts } from "@/lib/billing-display-dict";', 1)

# 2. 组件内加载 DB 字典 + label 函数改 DB 优先
old = "const TYPE_LABEL: Record<string, string> = {"
assert old in s, "TYPE_LABEL"
# 在 TYPE_LABEL 前插入 DB 加载 hook 变量与组件级获取——先定位组件函数
import re
m = re.search(r"export default function (\w+)\(", s)
assert m, "component fn"
# 把 label 调用改为 DB 优先：组件内加 dbDict state + effect
anchor = "const TYPE_LABEL: Record<string, string> = {"
# 1) state 声明放在组件函数内第一个 useState 前不好定位——直接在 TYPE_LABEL 之后加组件级代码不可行（组件外）。
# 改为：模块内保留兜底，组件内新增 dbTypeLabels state + effect，渲染用合并函数。
comp_start = m.start()
# 找组件内第一个 useState
m2 = re.search(r"(\n\s*)const \[", s[comp_start:])
assert m2, "first useState"
ins_at = comp_start + m2.end()
s = s[:ins_at] + (
    "\n" + m2.group(1) + "// KN-CFG：类型/支付方式中文名唯一真相源 = 数据库 billing_display_dict（红线：不硬编码）\n"
    + m2.group(1) + "const [dbBillingDict, setDbBillingDict] = useState<Record<string, string>>({});\n"
    + m2.group(1) + "useEffect(() => {\n"
    + m2.group(1) + "  (async () => {\n"
    + m2.group(1) + "    try {\n"
    + m2.group(1) + "      const authToken = getAuthToken();\n"
    + m2.group(1) + "      const res = await fetch(\"/api/user/billing-dict\", {\n"
    + m2.group(1) + "        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},\n"
    + m2.group(1) + "        credentials: \"include\",\n"
    + m2.group(1) + "      });\n"
    + m2.group(1) + "      if (res.ok) {\n"
    + m2.group(1) + "        const data = await res.json().catch(() => null);\n"
    + m2.group(1) + "        if (data) setDbBillingDict(data.values || {});\n"
    + m2.group(1) + "      }\n"
    + m2.group(1) + "    } catch { /* 字典加载失败时回退本地映射 */ }\n"
    + m2.group(1) + "  })();\n"
    + m2.group(1) + "}, []);"
) + s[ins_at:]

# 3. 渲染兜底改 DB 优先
old = "{TYPE_LABEL[r.type] || r.type}"
new = "{dbBillingDict[r.type] || TYPE_LABEL[r.type] || \"-\"}"
assert old in s, "render type"
s = s.replace(old, new, 1)
old = "(PAYMENT_LABEL[r.paymentMethod] || r.paymentMethod)"
new = "(dbBillingDict[r.paymentMethod] || PAYMENT_LABEL[r.paymentMethod] || \"-\")"
assert old in s, "render pay"
s = s.replace(old, new, 1)

# 4. 金额千分位（formatMoney）
if "formatMoney" not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    s = s.replace(a, a + '\nimport { formatMoney } from "@/utils/format";', 1)
s = s.replace("((walletBalance) / 100).toFixed(2)", "formatMoney(walletBalance)")
s = s.replace("(walletBalance / 100).toFixed(2)", "formatMoney(walletBalance)")

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("points billing dict OK")
