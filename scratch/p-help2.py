# -*- coding: utf-8 -*-
# /help 修复（独立小补丁，每个用精准锚点）
import io

P = "src/app/help/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 搜索后重置展开索引
old1 = "  }, [searchQuery]);"
new1 = """  }, [searchQuery]);

  // KN-UI：搜索关键词变化时重置展开索引（自查清单指令一）
  useEffect(() => {
    setExpandedIndex(null);
  }, [searchQuery]);"""
# 只替换第一个出现的（filteredFaqs 的 useMemo）
i = s.find(old1)
assert i > 0, "patch 1"
s = s[:i] + new1 + s[i + len(old1):]

# 2. 联系方式格式校验
old2 = '''    if (content.trim().length < 10) {
      toast.error("反馈内容至少需要 10 个字符");
      return;
    }'''
new2 = '''    if (content.trim().length < 10) {
      toast.error("反馈内容至少需要 10 个字符");
      return;
    }
    // KN-UI：联系方式格式校验（填了但太短时拦截；自查清单指令一）
    const trimmedContact = contact.trim();
    if (trimmedContact && trimmedContact.length < 5) {
      toast.error("联系方式格式不正确，请填写有效的邮箱或手机号");
      return;
    }'''
assert old2 in s, "patch 2"
s = s.replace(old2, new2, 1)

# 3. 提交成功后清空联系方式
old3 = """        setContent("");
        setFeedbackType("suggestion");"""
new3 = """        setContent("");
        setContact("");
        setFeedbackType("suggestion");"""
assert old3 in s, "patch 3"
s = s.replace(old3, new3, 1)

# 4. Ctrl+Enter 快捷提交
old4 = "maxLength={5000}"
i4 = s.find(old4)
assert i4 > 0, "patch 4 anchor"
le = s.find("\n", i4)
s = s[:le] + '\n                      onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !submitting) { e.preventDefault(); handleSubmitFeedback(); } }}' + s[le:]

# 5. 快捷键提示
old5 = "{content.length}/5000"
new5 = '{content.length}/5000 · Ctrl+Enter 快捷提交'
s = s.replace(old5, new5, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("help page ALL OK")
