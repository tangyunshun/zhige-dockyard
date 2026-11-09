# -*- coding: utf-8 -*-
# models 页：枚举 fallback 去英文 + est 千分位 + 简易分页
import io

P = "src/app/models/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. STATUS_LABEL fallback 去英文（未知枚举显示「待定」）
s = s.replace('STATUS_LABEL[verifyStatus] || verifyStatus', 'STATUS_LABEL[verifyStatus] || "待定"')
s = s.replace('STATUS_LABEL[p.status] || p.status', 'STATUS_LABEL[p.status] || "待定"')

# 2. CAP_LABELS fallback 去英文（未知能力显示「其他」）
s = s.replace('CAP_LABELS[c] || c', 'CAP_LABELS[c] || "其他"')

# 3. est 千分位
s = s.replace('`${est} 点`', '`${est.toLocaleString()} 点`')

# 4. 分页：加 PAGE_SIZE + visibleCount state + 加载更多按钮
old = """          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.map((it) => (
              <ModelCard key={it.id} it={it} />
            ))}
          </div>"""
new = """          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {filtered.slice(0, visibleCount).map((it) => (
              <ModelCard key={it.id} it={it} />
            ))}
          </div>
          {filtered.length > visibleCount && (
            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                加载更多（{filtered.length - visibleCount} 个）
              </button>
            </div>
          )}"""
assert old in s, "grid pagination"
s = s.replace(old, new, 1)

# 5. state：visibleCount + PAGE_SIZE
old = """  const [keyword, setKeyword] = useState("");"""
new = """  const [keyword, setKeyword] = useState("");
  const [visibleCount, setVisibleCount] = useState(24); // KN-UI：初始渲染 24 条 + 「加载更多」分页（自查清单指令四）"""
assert old in s, "visibleCount state"
s = s.replace(old, new, 1)
# PAGE_SIZE 常量放文件顶部
old = "const STATUS_LABEL"
new = "const PAGE_SIZE = 24;\n\nconst STATUS_LABEL"
assert old in s, "PAGE_SIZE"
s = s.replace(old, new, 1)
# 筛选变化时重置 visibleCount
old = "  const providers = useMemo("
new = "  // KN-UI：筛选变化时重置分页\n  useEffect(() => { setVisibleCount(24); }, [keyword, providerFilter, capFilter, onlyPriced]);\n\n  const providers = useMemo("
assert old in s, "providers"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("models pagination + enum OK")
