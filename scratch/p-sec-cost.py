# -*- coding: utf-8 -*-
# 安全修复：底层模型成本 costMicros 仅 OWNER/ADMIN/平台管理员可见（普通成员不下发）
import io

P = "src/app/api/workspace/[id]/model-usage/route.ts"
s = io.open(P, encoding="utf-8").read()

# 1. 明细模式：非管理员置空 costMicros
old = '''          costMicros: m.row.costMicros != null ? Number(m.row.costMicros) : null,
          userPriceMicros: m.row.userPriceMicros != null ? Number(m.row.userPriceMicros) : null,
          ...m.meta,
        }));
      return NextResponse.json({ success: true, data: { key, days, items: details } });'''
new = '''          // KN-SEC：底层模型成本仅空间 OWNER/ADMIN 与平台管理员可见（自查清单：敏感数据脱敏）
          costMicros: canViewAll && m.row.costMicros != null ? Number(m.row.costMicros) : null,
          userPriceMicros: m.row.userPriceMicros != null ? Number(m.row.userPriceMicros) : null,
          ...m.meta,
        }));
      return NextResponse.json({ success: true, data: { key, days, items: details } });'''
assert old in s, "detail cost"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("detail OK")
