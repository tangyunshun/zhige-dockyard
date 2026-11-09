# -*- coding: utf-8 -*-
# studio 审查修复批次 1（高危）：
# 1. handler.ts internalComponents 从响应中移除（成本字段泄露给游客）
# 2. ComponentBrowser 搜索历史防抖/Enter 提交
# 3. guide 页搜索功能实现
import io

# ── 1. handler.ts：internalComponents 不下发 ──
p = "src/app/api/studio/handler.ts"
s = io.open(p, encoding="utf-8").read()
old = """        success: true,
        data: {
          components: componentsWithStats,
          categories,
          internalComponents,
          defaultAllowedIds,
          presetPositions,
        },
      });"""
new = """        success: true,
        data: {
          components: componentsWithStats,
          categories,
          // KN-SEC：internalComponents 含 costFloorPoints 等内部成本字段，不下发给游客（自查清单安全红线）
          defaultAllowedIds,
          presetPositions,
        },
      });"""
assert old in s, "internalComponents"
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("handler OK")

# ── 2. ComponentBrowser：搜索历史防抖（Enter 才写入） ──
p = "src/components/studio/ComponentBrowser.tsx"
s = io.open(p, encoding="utf-8").read()

# 找到搜索历史写入的位置
import re
# audit says 1338 行有 handleSearch 直接写入历史
# 先看当前搜索提交逻辑
i = s.find("searchHistory")
ctx_start = max(0, i - 200)
print("searchHistory ctx:", s[ctx_start:ctx_start+400][:380])
