# -*- coding: utf-8 -*-
# UsageStats：删 98.5% 假成功率（无真实数据源→整卡移除）+ 死代码 + 时间格式
import io

p = "src/components/studio/UsageStats.tsx"
s = io.open(p, encoding="utf-8").read()

# 1. 删「平均成功率 98.5%」整卡（无真实数据源，红线禁止假数据）
old = """        {/* 运行成功率 */}
        <div className="bg-white rounded-xl p-4 border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500 font-bold">平均成功率</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg font-black text-slate-800">
            98.5%
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-1">
            基于近 100 次运行测算
          </div>
        </div>"""
assert old in s, "fake card"
s = s.replace(old, "", 1)

# 2. 死代码 toast 移除
s = s.replace("  const toast = useToast();\n", "", 1)
# useToast import 若不再使用则一并清理
if "toast." not in s:
    s = s.replace('import { useToast } from "@/components/Toast";\n', "", 1)

# 3. 时间格式走 formatDateTime
if "formatDateTime" not in s:
    a = "export default function UsageStats"
    assert a in s
    s = s.replace('import { getAuthToken } from "@/utils/auth";', 'import { getAuthToken } from "@/utils/auth";\nimport { formatDateTime } from "@/utils/format";', 1)
s = s.replace('const date = new Date(timeStr);', 'return formatDateTime(timeStr);', 1)
# 清理 formatTime 中残留的旧实现（return date 行起）
import re
m = re.search(r'return formatDateTime\(timeStr\);(\n\s*(?:const date|if \(!isNaN)[^\n]*\n)+\s*return [^\n]*;)', s)
if m:
    s = s.replace(m.group(1), "", 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("UsageStats OK")
