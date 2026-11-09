# -*- coding: utf-8 -*-
# /help 页自查清单修复：搜索后展开索引重置 + 联系方式格式校验 + Ctrl+Enter 提交 + 提交后清空联系方式
import io

P = "src/app/help/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 搜索关键词变化时重置 expandedIndex（防止搜索后索引指向错误条目）
old = """  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
    );
  }, [searchQuery]);"""
new = """  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // KN-UI：搜索关键词变化时重置展开索引，防止指向错误的条目（自查清单指令一）
  useEffect(() => {
    setExpandedIndex(null);
  }, [searchQuery]);"""
assert old in s, "filteredFaqs"
s = s.replace(old, new, 1)

# 2. 联系方式格式校验（填写了但不是有效邮箱/手机号格式时标红提示）
old = """    if (content.trim().length < 10) {
      toast.error("反馈内容至少需要 10 个字符");
      return;
    }
    try {"""
new = """    if (content.trim().length < 10) {
      toast.error("反馈内容至少需要 10 个字符");
      return;
    }
    // KN-UI：联系方式格式校验（填了但格式不对时拦截；自查清单指令一）
    const trimmedContact = contact.trim();
    if (
      trimmedContact &&
      !/^[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$/.test(trimmedContact) &&
      !/^1[3-9]\\d{9}$/.test(trimmedContact) &&
      trimmedContact.length < 5
    ) {
      toast.error("联系方式格式不正确，请填写有效的邮箱或手机号");
      return;
    }
    try {"""
assert old in s, "contact validation"
s = s.replace(old, new, 1)

# 3. 提交成功后清空联系方式
old = """        toast.success("反馈提交成功，感谢您的宝贵意见");
        setTitle("");
        setContent("");
        setFeedbackType("suggestion");"""
new = """        toast.success("反馈提交成功，感谢您的宝贵意见");
        setTitle("");
        setContent("");
        setFeedbackType("suggestion");
        setContact("");"""
assert old in s, "clear contact"
s = s.replace(old, new, 1)

# 4. Ctrl+Enter 快捷提交（textarea）+ 联系方式 Enter 提交
old = """                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    maxLength={5000}"""
new = """                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !submitting) {
                        e.preventDefault();
                        handleSubmitFeedback();
                      }
                    }}
                    maxLength={5000}"""
assert old in s, "textarea keydown"
s = s.replace(old, new, 1)

# 5. 反馈表单 hint 更新（Ctrl+Enter 快捷键提示）
old = """                    <div className="text-right text-[10px] text-slate-400 font-semibold mt-1">
                      {content.length}/5000
                    </div>"""
new = """                    <div className="text-right text-[10px] text-slate-400 font-semibold mt-1">
                      {content.length}/5000 · Ctrl+Enter 快捷提交
                    </div>"""
assert old in s, "hint"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("help page OK")
