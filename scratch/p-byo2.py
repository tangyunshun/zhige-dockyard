# -*- coding: utf-8 -*-
# byo-model：修复解除全部绑定半成品（setUnbindAllConfirm 不存在）——改走 ConfirmDialog requireText
import io

P = "src/app/user/byo-model/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 修正调用：打开 ConfirmDialog（复用组件内已有的 confirmDialog state）
old = """    // KN-UI：清空全部勾选 = 解除该模型的所有空间绑定（不可逆），需二次确认（自查清单指令四）
    if (assignments.length === 0 && !unbindAllConfirmed) {
      setUnbindAllConfirm(true);
      return;
    }"""
new = """    // KN-UI：清空全部勾选 = 解除该模型的所有空间绑定（不可逆），需「输入模型名称」强确认（自查清单指令四）
    if (assignments.length === 0 && !unbindAllConfirmed) {
      const def = defs.find((d) => d.id === assigningId);
      setConfirmDialog({
        isOpen: true,
        title: "解除全部空间绑定",
        message: `确认解除模型「${def?.name || ""}」在所有空间的绑定吗？解除后各空间将无法继续使用该模型。`,
        type: "danger",
        requireText: { expect: "DELETE", hint: "此操作不可恢复，请输入「DELETE」以确认解除全部绑定" },
        onConfirm: async () => {
          setUnbindAllConfirmed(true);
          // 确认后自动重入保存流程（此时 assignments 仍为空 → 走解除分支）
          await saveAssignments();
          setUnbindAllConfirmed(false);
        },
      });
      return;
    }"""
assert old in s, "unbind call"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("unbind-all fixed")
