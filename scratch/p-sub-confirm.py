# -*- coding: utf-8 -*-
import io

p = "src/app/user/sub-accounts/page.tsx"
s = io.open(p, encoding="utf-8").read()

# 1. window.confirm → ConfirmDialog state
old = "    if (disable && !window.confirm(`确认停用子账号「${acc.name}」？停用后其登录会话将立即失效。`)) return;"
assert old in s, "window.confirm"
s = s.replace(old, """    if (disable && !disableConfirm) {
      setDisableConfirm(acc);
      return;
    }""", 1)

# 2. state（在 loadError 旁加）
old2 = 'const [loadError, setLoadError] = useState<string | null>(null);'
assert old2 in s
s = s.replace(old2, old2 + '\n  // KN-UI：停用子账号二次确认（规范统一，弃用原生 confirm）\n  const [disableConfirm, setDisableConfirm] = useState<{ id: string; name: string } | null>(null);', 1)

# 3. JSX：挂 ConfirmDialog（文件尾 </...> 前）——找文件最后的 return 尾
tail = "  );\n}"
idx = s.rfind(tail)
assert idx > 0, "tail"
dialog = """
      <ConfirmDialog
        isOpen={!!disableConfirm}
        title="停用子账号"
        message={`确认停用子账号「${disableConfirm?.name || ""}」吗？停用后其登录会话将立即失效，可随时重新启用。`}
        type="warning"
        confirmText="确认停用"
        cancelText="取消"
        onConfirm={async () => {
          if (disableConfirm) await handleToggleStatus(disableConfirm.id, true);
          setDisableConfirm(null);
        }}
        onCancel={() => setDisableConfirm(null)}
      />
"""
# handleToggleStatus 名字需核对——先查函数名
if "handleToggleStatus" not in s.split("const handleToggleStatus")[0][-1:]:
    pass
s = s[:idx] + dialog + s[idx + len(tail):]

# 4. 确认真实处理函数名
import re
fn = re.findall(r"const (handle\w+) = async \(\s*\w*:? ?\w*", s)
print("async fns:", fn[:8])
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("dialog added")
