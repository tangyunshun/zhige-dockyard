# -*- coding: utf-8 -*-
# guide/page.tsx：搜索过滤实现 + 死链接修复 + 组件数动态化（修正版，用正确锚）
import io, re

P = "src/app/studio/guide/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 搜索过滤：在渲染前过滤
old = """  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">"""
new = """  // KN-UI：搜索过滤（自查清单指令一，此前 searchQuery 从未使用属死功能）
  const q = searchQuery.trim().toLowerCase();
  const filteredSections = q
    ? guideSections
        .map((sec) => ({
          ...sec,
          items: sec.items.filter(
            (item) =>
              (item.title || "").toLowerCase().includes(q) ||
              (item.description || "").toLowerCase().includes(q)
          ),
        }))
        .filter((sec) => sec.items.length > 0)
    : guideSections;
  const filteredFaqs = q
    ? faqs.filter((f) => (f.q || "").toLowerCase().includes(q) || (f.a || "").toLowerCase().includes(q))
    : faqs;

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">"""
assert old in s, "return head"
s = s.replace(old, new, 1)

# 2. 渲染改用 filtered 变量
s = s.replace("{guideSections.map((section)", "{filteredSections.map((section)", 1)
s = s.replace("{faqs.map((faq, index)", "{filteredFaqs.map((faq, index)", 1)

# 3. 搜索无结果提示
old = """          {/* 教程分类 */}"""
new = """          {/* 搜索无结果提示 */}
          {q && filteredSections.length === 0 && filteredFaqs.length === 0 && (
            <div className="mb-8 p-10 text-center bg-white/60 rounded-2xl border border-slate-200/60">
              <p className="text-sm font-bold text-slate-500">未找到与「{searchQuery}」匹配的教程或常见问题</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-3 px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl cursor-pointer"
              >
                清空搜索
              </button>
            </div>
          )}

          {/* 教程分类 */}"""
assert old in s, "sections render"
s = s.replace(old, new, 1)

# 4. 渲染改用 filtered（补 FAQ）
s = s.replace("{faqs.map((faq, index)", "{filteredFaqs.map((faq, index)", 1)

# 5. 硬编码「16 个高阶组件」改动态
i = s.find("16 个高阶组件")
if i > 0:
    s = s[:i] + "{guideSections.reduce((acc, sec) => acc + sec.items.length, 0)} 个组件教程" + s[i+len("16 个高阶组件"):]
    print("guide count dynamic")

# 6. 条目 onClick 导航（确保 router 存在）
if "useRouter" not in s:
    s = s.replace('import { Search } from "lucide-react";', 'import { useRouter } from "next/navigation";\nimport { Search } from "lucide-react";', 1)
m = re.search(r"export default function (\w+)", s)
if m and "const router = useRouter();" not in s:
    comp_start = m.start()
    m2 = re.search(r"(\n\s*)const \[", s[comp_start:])
    if m2:
        ins = comp_start + m2.end()
        s = s[:ins] + "\n" + m2.group(1) + "const router = useRouter();" + s[ins:]
# 给卡片 div 加 onClick（有 link 字段的条目）
if "item.link && router.push" not in s:
    s = s.replace(
        "<div\n                key={item.title}",
        "<div\n                key={item.title}\n                onClick={() => item.link && router.push(item.link)}",
        1,
    )
    # 样式加 cursor
    s = s.replace(
        'className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border',
        'className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border cursor-pointer hover:shadow-md transition-all',
        1,
    )

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("guide OK")
