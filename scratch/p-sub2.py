# -*- coding: utf-8 -*-
import io

p = "src/app/user/sub-accounts/page.tsx"
s = io.open(p, encoding="utf-8").read()

# 1. window.confirm → ConfirmDialog
old = '    if (disable && !window.confirm(`确认停用子账号「${acc.name}」？停用后其登录会话将立即失效。`)) return;'
new = '''    if (disable && !disableConfirm) {
      setDisableConfirm({ id: acc.id, name: acc.name });
      return;
    }'''
assert old in s, "confirm"
s = s.replace(old, new, 1)

# 2. state
old2 = 'const [loadError, setLoadError] = useState<string | null>(null);'
assert old2 in s, "loadError"
s = s.replace(old2, old2 + '\n  // KN-UI：停用子账号二次确认（规范统一，弃用原生 confirm）\n  const [disableConfirm, setDisableConfirm] = useState<{ id: string; name: string } | null>(null);', 1)

# 3. ConfirmDialog import + JSX
if 'from "@/components/ConfirmDialog"' not in s:
    a = 'import { getAuthToken } from "@/utils/auth";'
    assert a in s, "import"
    s = s.replace(a, a + '\nimport { ConfirmDialog } from "@/components/ConfirmDialog";', 1)

# 4. JSX 挂载：主 return 尾（文件尾 </div>\n  );\n}）
tail = "    </div>\n  );\n}"
idx = s.rfind(tail)
assert idx > 0, "tail"
dialog = '''
      <ConfirmDialog
        isOpen={!!disableConfirm}
        title="停用子账号"
        message={`确认停用子账号「${disableConfirm?.name || ""}」吗？停用后其登录会话将立即失效，可随时重新启用。`}
        type="warning"
        confirmText="确认停用"
        cancelText="取消"
        onConfirm={async () => {
          const target = subAccounts.find((x) => x.id === disableConfirm?.id);
          setDisableConfirm(null);
          if (target) await toggleStatus(target);
        }}
        onCancel={() => setDisableConfirm(null)}
      />
'''
s = s[:idx] + dialog + s[idx + len(tail):]

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("sub confirm dialog OK")
