# -*- coding: utf-8 -*-
# DemoRequestModal：Esc + 电话校验 + requirements maxLength + submitting 时禁关
import io

P = "src/components/DemoRequestModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. useEscapeKey import
if "useEscapeKey" not in s:
    a = 'import { useToast } from "@/components/Toast";'
    assert a in s, "toast import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";', 1)

# 2. Esc（在 toast = useToast() 后加）
old = "  const toast = useToast();"
if "useEscapeKey(" not in s:
    assert old in s, "toast usage"
    s = s.replace(old, old + "\n  useEscapeKey(true, onClose);", 1)

# 3. 电话格式校验（选填但填了要合法）
old = "    if (!name.trim()) {"
assert old in s, "name check"
s = s.replace(old, """    // KN-UI：电话格式校验（选填但填了必须合法；自查清单指令一）
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^[\\d\\-+() ]{7,20}$/.test(trimmedPhone)) {
      toast.error("联系电话格式不正确");
      return;
    }
    if (!name.trim()) {""", 1)

# 4. requirements maxLength
s = s.replace(
    'onChange={(e) => setRequirements(e.target.value)}',
    'onChange={(e) => setRequirements(e.target.value)}\n                    maxLength={5000}',
    1,
)

# 5. submitting 时遮罩点击不关
s = s.replace(
    'onClick={onClose}\n        className="fixed',
    'onClick={() => !submitting && onClose()}\n        className="fixed',
    1,
)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("DemoRequestModal OK")
