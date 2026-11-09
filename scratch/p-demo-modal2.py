# -*- coding: utf-8 -*-
# DemoRequestModal 修复（正确锚点版）
import io

P = "src/components/DemoRequestModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. useEscapeKey import
if "useEscapeKey" not in s:
    a = 'import { useToast } from "@/components/Toast";'
    assert a in s, "toast import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";', 1)

# 2. Esc（toast = useToast() 后）
old = "  const toast = useToast();"
if "useEscapeKey(" not in s:
    assert old in s, "toast usage"
    s = s.replace(old, old + "\n  useEscapeKey(true, onClose);", 1)

# 3. validate() 内加电话格式校验
old = """    if (userType === "enterprise" && !formData.company.trim()) {"""
new = """    // KN-UI：电话格式校验（选填但填了必须合法；自查清单指令一）
    const trimmedPhone = formData.phone?.trim();
    if (trimmedPhone && !/^[\\d\\-+() ]{7,20}$/.test(trimmedPhone)) {
      setErrors((prev: any) => ({ ...prev, phone: "联系电话格式不正确" }));
      valid = false;
      return valid;
    }
    if (userType === "enterprise" && !formData.company.trim()) {"""
assert old in s, "phone validation anchor"
s = s.replace(old, new, 1)

# 4. requirements maxLength
old = 'onChange={(e) => setFormData((prev) => ({ ...prev, requirements: e.target.value }))}'
if old in s:
    s = s.replace(old, old + '\n                    maxLength={5000}', 1)
else:
    # 查找 requirements 的 onChange
    i = s.find("requirements: e.target.value")
    if i > 0:
        # 在 onChange 行尾加 maxLength
        le = s.find("\n", i)
        line_start = s.rfind("\n", 0, i) + 1
        line = s[line_start:le]
        if "maxLength" not in line:
            indent = "                    "
            s = s[:le] + f"\n{indent}maxLength={{5000}}" + s[le:]
            print("requirements maxLength added")

# 5. submitting 时遮罩/X 不关
s = s.replace(
    "onClick={onClose}",
    "onClick={() => !submitting && onClose()}",
    1,
)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("DemoRequestModal OK")
