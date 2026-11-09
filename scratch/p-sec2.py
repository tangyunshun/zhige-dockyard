# -*- coding: utf-8 -*-
# security：清空所有登录审计加输入文字强确认 + 状态中文化/格式补齐 + console 清理
import io

P = "src/app/user/security/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 清空审计：输入「清空」解锁
old = """            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">清空所有登录审计</h3>
              <p className="text-xs text-slate-500 mt-1">
                确认清空个人所有的历史登录审计日志吗？清空后将无法查阅过去的登录记录。
              </p>
            </div>"""
new = """            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">清空所有登录审计</h3>
              <p className="text-xs text-slate-500 mt-1">
                确认清空个人所有的历史登录审计日志吗？清空后将无法查阅过去的登录记录。
              </p>
              <div className="mt-3 text-left space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  请输入「<span className="font-mono text-rose-600">清空</span>」以确认执行
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={clearAllConfirmText}
                  onChange={(e) => { setClearAllConfirmText(e.target.value); }}
                  maxLength={6}
                  placeholder="清空"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-xs"
                />
              </div>
            </div>"""
assert old in s, "clear-all modal"
s = s.replace(old, new, 1)

old = """                onClick={confirmClearAllHistory}
                disabled={deletingHistory}"""
new = """                onClick={confirmClearAllHistory}
                disabled={deletingHistory || clearAllConfirmText !== "清空"}"""
assert old in s, "clear btn"
s = s.replace(old, new, 1)

# 2. state（放在 deletingHistory 旁）
import re
m = re.search(r"\n(\s*)const \[deletingHistory, setDeletingHistory\] = useState[^\n]*;", s)
assert m, "deletingHistory"
ins = m.end()
s = s[:ins] + "\n" + m.group(1) + "const [clearAllConfirmText, setClearAllConfirmText] = useState(\"\");" + s[ins:]
# 打开弹窗时重置（找 setClearAllHistoryModal(true)）
s = s.replace("setClearAllHistoryModal(true)", "setClearAllConfirmText(\"\"); setClearAllHistoryModal(true)")

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("security requireText OK")
