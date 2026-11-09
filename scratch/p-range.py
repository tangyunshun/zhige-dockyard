# -*- coding: utf-8 -*-
# TasksTab 自定义时间区间：禁未来 + 开始>结束校验拦截
import io

P = "src/components/studio/TasksTab.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. state 后加 today 常量与非法判定
old = """  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");"""
new = """  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  // KN-UI：自定义时间区间校验（禁未来 + 开始不得晚于结束；自查清单指令四）
  const todayStr = new Date().toISOString().slice(0, 10);
  const rangeInvalid = !!customStartDate && !!customEndDate && customStartDate > customEndDate;"""
assert old in s, "state"
s = s.replace(old, new, 1)

# 2. 输入框加 min/max 约束
old = """                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="p-0.5 px-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800"
                />
                <span className="text-slate-400 font-bold">至</span>
                <span className="text-[11px] text-slate-500 font-bold">结束:</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="p-0.5 px-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800"
                />"""
new = """                <input 
                  type="date" 
                  value={customStartDate} 
                  max={todayStr}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className={`p-0.5 px-1.5 border rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800 ${rangeInvalid ? "border-red-300" : "border-slate-200"}`}
                />
                <span className="text-slate-400 font-bold">至</span>
                <span className="text-[11px] text-slate-500 font-bold">结束:</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  min={customStartDate || undefined}
                  max={todayStr}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className={`p-0.5 px-1.5 border rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800 ${rangeInvalid ? "border-red-300" : "border-slate-200"}`}
                />
                {rangeInvalid && (
                  <span className="text-[11px] text-red-500 font-bold whitespace-nowrap">⚠️ 开始日期不能晚于结束日期</span>
                )}"""
assert old in s, "inputs"
s = s.replace(old, new, 1)

# 3. 过滤逻辑：非法区间不生效（视为未过滤），并给出注释
old = """          if (customStartDate) {
            const start = new Date(`${customStartDate} 00:00:00`).getTime();"""
new = """          if (customStartDate && !rangeInvalid) {
            const start = new Date(`${customStartDate} 00:00:00`).getTime();"""
assert old in s, "filter start"
s = s.replace(old, new, 1)
old = """          if (customEndDate) {
            const end = new Date(`${customEndDate} 23:59:59`).getTime();"""
new = """          if (customEndDate && !rangeInvalid) {
            const end = new Date(`${customEndDate} 23:59:59`).getTime();"""
assert old in s, "filter end"
s = s.replace(old, new, 1)
# 依赖数组加 rangeInvalid（两处 useMemo deps）
s = s.replace("[recentTasks, tasksFilterTab, searchQuery, dateFilter, customStartDate, customEndDate]",
              "[recentTasks, tasksFilterTab, searchQuery, dateFilter, customStartDate, customEndDate, rangeInvalid]")
s = s.replace("[tasksFilterTab, searchQuery, dateFilter, customStartDate, customEndDate]",
              "[tasksFilterTab, searchQuery, dateFilter, customStartDate, customEndDate, rangeInvalid]")

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("TasksTab range OK")
