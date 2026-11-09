# -*- coding: utf-8 -*-
# workspace-plan-service.ts：Number.isInteger → Number.isSafeInteger（C5 修正）
import io

P = "src/lib/workspace-plan-service.ts"
s = io.open(P, encoding="utf-8").read()

old = """    if (
      !Number.isInteger(monthly) ||
      monthly < 0 ||
      !Number.isInteger(yearly) ||
      yearly < 0
    ) {"""
new = """    if (
      !Number.isSafeInteger(monthly) ||
      monthly < 0 ||
      !Number.isSafeInteger(yearly) ||
      yearly < 0
    ) {"""
assert old in s, "safe integer"
s = s.replace(old, new, 1)

# 同步修正注释
s = s.replace(
    "价格非安全非负整数",
    "价格非安全非负整数",
)
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("plan-service isSafeInteger OK")
