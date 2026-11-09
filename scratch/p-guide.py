# -*- coding: utf-8 -*-
# guide/page.tsx：搜索过滤实现 + 死链接修复 + 组件数动态化 + 菜单图标标签优化
import io

P = "src/app/studio/guide/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 搜索过滤：在渲染前过滤 guideSections 和 faqs
old = """  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 font-sans text-left">"""
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
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 font-sans text-left">"""
assert old in s, "return head"
s = s.replace(old, new, 1)

# 2. 渲染改用 filtered 变量
s = s.replace("guideSections.map((section)", "filteredSections.map((section)", 1)
s = s.replace("faqs.map((faq, index)", "filteredFaqs.map((faq, index)", 1)

# 3. 空结果提示：在教程分类前插
old = """          {/* 教程分类 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">"""
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

          {/* 教程分类 */}
          {filteredSections.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">"""
assert old in s, "sections render"
s = s.replace(old, new, 1)

# 4. FAQ 渲染条件化
s = s.replace("{faqs.map((faq, index)", "{filteredFaqs.map((faq, index)", 1)
# FAQ section 也条件化（找 FAQ 渲染区域的条件或标题）
old = """          {/* 常见问题 */}
          <div className="max-w-3xl mx-auto space-y-3 mb-12">"""
if old in s:
    s = s.replace(old, """          {/* 常见问题 */}
          {filteredFaqs.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-3 mb-12">""", 1)
    # 在 FAQ 区域结束后加 )}
    # 找 FAQ 区域的结束（下一个 </div> 后跟另一个注释）
    # 简化：不加闭合，因为可能有多个结构——改为不用条件包裹，空数组时 map 自然为空
    s = s.replace("""          {filteredFaqs.length > 0 && (
          <div className="max-w-3xl mx-auto space-y-3 mb-12">""",
                  """          <div className="max-w-3xl mx-auto space-y-3 mb-12">""", 1)

# 5. 条目点击导航：给卡片加 onClick
# 找条目渲染的 div（有 link 字段但无 onClick）
# guide 条目结构：item.link 存在但未绑定
if "item.link" in s:
    # 给条目 div 加 onClick 导航
    s = s.replace(
        '<div key={item.title}',
        '<div key={item.title} onClick={() => item.link && router.push(item.link)} className="cursor-pointer hover:shadow-md transition-all"',
        1,
    )
    # 确保 router 存在
    if "useRouter" not in s:
        s = s.replace('import { Search } from "lucide-react";', 'import { useRouter } from "next/navigation";\nimport { Search } from "lucide-react";', 1)
        # 在组件函数内加 router
        m = __import__("re").search(r"export default function (\w+)", s)
        if m:
            comp_start = m.start()
            m2 = re.search(r"(\n\s*)const \[", s[comp_start:])
            if m2:
                ins = comp_start + m2.end()
                s = s[:ins] + "\n  const router = useRouter();" + s[ins:]
    print("guide onClick added")

# 6. 硬编码「16 个高阶组件」改动态
old = "16 个高阶组件"
if old in s:
    s = s.replace(old, "guideSections.reduce((sum, sec) => sum + sec.items.length, 0) + \" 个高阶组件\" if false else old", 1)
# 用更安全方式：找到硬编码位置再替换
i = s.find("16 个高阶组件")
if i > 0:
    # 确认上下文是 JSX 文本
    ctx = s[max(0,i-80):i+40]
    if "{" not in ctx[-40:]:
        s = s[:i] + "{guideSections.reduce((acc, sec) => acc + sec.items.length, 0)} 个组件教程" + s[i+len(old):]
        print("guide count dynamic")

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("guide OK")
