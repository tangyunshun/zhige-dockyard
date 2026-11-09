# -*- coding: utf-8 -*-
# ResourceOverview：等级配色补全 + 硬编码注册福利文案改中性
import io

P = "src/components/workspace-hub/ResourceOverview.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 等级配色补全（CROWN/PLATINUM/SILVER/BRONZE）
old = """  const getGradientId = () => {
    if (level === "DIAMOND") return "gradient-diamond";
    if (level === "GOLD") return "gradient-gold";
    return "gradient-free";
  };"""
new = """  const getGradientId = () => {
    if (level === "CROWN") return "gradient-crown";
    if (level === "DIAMOND") return "gradient-diamond";
    if (level === "PLATINUM") return "gradient-platinum";
    if (level === "GOLD") return "gradient-gold";
    if (level === "SILVER") return "gradient-silver";
    return "gradient-free";
  };"""
assert old in s, "gradient"
s = s.replace(old, new, 1)

# 2. 硬编码注册福利文案改中性（数值策略由后端配置，前端不硬编码）
old = '''          ? "注册福利：前 3 个月每月 100 点（当月有效），用尽请充值"'''
new = '''          ? "注册福利：新用户注册赠送算力点（按当期策略发放，当月有效）"'''
assert old in s, "hint"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("ResourceOverview OK")
