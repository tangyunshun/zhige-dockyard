# -*- coding: utf-8 -*-
# developer/page.tsx：吊销密钥弹窗加「输入 DELETE」强确认 + Esc；审计删除弹窗同样处理
import io

P = "src/app/user/developer/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. state + Esc
old = "  const [deleteId, setDeleteId] = useState<string | null>(null);"
assert old in s, "deleteId state"
new = old + "\n  // KN-UI：吊销密钥「输入 DELETE」强确认（自查清单指令四）\n  const [deleteConfirmText, setDeleteConfirmText] = useState(\"\");\n  useEscapeKey(!!deleteId, () => setDeleteId(null));"
s = s.replace(old, new, 1)
if "useEscapeKey" not in s.split("useEscapeKey")[0]:
    a = 'import { getAuthToken } from "@/utils/auth";'
    assert a in s, "import"
    s = s.replace(a, a + '\nimport { useEscapeKey } from "@/hooks/useEscapeKey";', 1)

# 2. 打开弹窗处重置输入（找 setDeleteId( 调用）
s = s.replace("setDeleteId(id)", 'setDeleteConfirmText(""); setDeleteId(id)')
s = s.replace("setDeleteId(key.id)", 'setDeleteConfirmText(""); setDeleteId(key.id)')

# 3. 弹窗体加输入框（密钥信息卡片后）
old = """              {deletingKeyObj && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1 mb-4">
                  <div className="font-bold text-slate-800">{deletingKeyObj.name}</div>
                  <div className="font-mono text-[11px] text-slate-500">
                    前缀：{deletingKeyObj.keyPrefix}•••• · 累计已调用 {deletingKeyObj.usageCount ?? 0} 次
                  </div>
                </div>
              )}"""
new = old + """

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  此操作不可撤销，请输入「<span className="font-mono text-red-600">DELETE</span>」以确认吊销删除
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  maxLength={10}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-xs font-mono"
                />
                {deleteConfirmText.trim() !== "DELETE" && deleteConfirmText.length > 0 && (
                  <p className="text-xs text-red-600 font-medium">输入不匹配，请输入 DELETE</p>
                )}
              </div>"""
assert old in s, "dialog body"
s = s.replace(old, new, 1)

# 4. 确认按钮禁用
old = """                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="zg-btn zg-btn-danger text-xs h-8 px-4 font-bold"
                >
                  {deleting ? "正在吊销…" : "确认吊销删除"}
                </button>"""
new = """                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting || deleteConfirmText.trim() !== "DELETE"}
                  className="zg-btn zg-btn-danger text-xs h-8 px-4 font-bold"
                >
                  {deleting ? "正在吊销…" : "确认吊销删除"}
                </button>"""
assert old in s, "confirm btn"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("developer delete key OK")
