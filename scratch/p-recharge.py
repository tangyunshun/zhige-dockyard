# -*- coding: utf-8 -*-
# RechargeModal：0元支付拦截 + 对公必填校验 + 回收空值拦截 + Esc + 千分位
import io

P = "src/components/workspace/RechargeModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. imports + Esc
if "useEscapeKey" not in s:
    a = 'import { useToast } from "@/components/Toast";'
    assert a in s, "toast import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";\nimport { formatNumber } from "@/utils/format";', 1)

# 2. Esc（弹窗开关 state 名探测）
import re
m = re.search(r"\n(\s*)const \[(\w*open\w*|\w*Open\w*), set\2\] = useState", s)
if m:
    var = m.group(2)
    ins = m.end()
    s = s[:ins] + f"\n{m.group(1)}useEscapeKey({var}, () => set{var[0].upper() + var[1:]}(false));" + s[ins:]
else:
    print("WARN: open state not found")

# 3. 在线充值 0 点拦截：找 selectedRechargePack 相关提交按钮 disabled 条件
old = "disabled={recharging}"
cnt = s.count(old)
s = s.replace(old, "disabled={recharging || !selectedRechargePack || !selectedRechargePack.points}", 1)
print("recharge disabled sites:", cnt)

# 4. 回收点数空值拦截：找确认回收按钮 disabled 条件
i = s.find("确认回收")
print("recycle ctx:", s[max(0, i-350):i][-320:])

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("recharge step1 OK")
