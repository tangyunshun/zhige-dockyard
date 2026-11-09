# -*- coding: utf-8 -*-
# dissolve-check step2：强确认弹窗 JSX + 角色/邮箱中文化脱敏 + 错误态 + usageCount 千分位
import io

P = "src/components/workspace/DissolveWorkspaceCheckModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. 强确认弹窗 JSX：插在组件最外层容器的关闭前（return 块尾部 </div>\n  );\n}）
tail_marker = "    </div>\n  );\n}"
idx = s.rfind(tail_marker)
assert idx > 0, "tail"
confirm_jsx = '''
      {/* KN-UI：高危清理动作「输入 DELETE」强确认弹窗（自查清单指令四） */}
      {cleanupConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md" onClick={() => !cleaning && setCleanupConfirm(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-1 w-full bg-gradient-to-r from-rose-500 to-red-600" />
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-slate-900">确认执行「{cleanupConfirm.label}」？</h3>
              </div>
              <p className="text-xs text-slate-600 font-bold leading-relaxed">
                此操作将永久移除依赖数据，<strong className="text-rose-600">不可撤销</strong>。执行后请重新运行合规盘点扫描。
              </p>
              <CleanupConfirmInput
                expect={cleanupConfirm.expect}
                onConfirmed={() => {
                  const act = cleanupConfirm.action as "REMOVE_MEMBERS" | "UNBIND_ASSETS" | "CLEAR_ALL" | "REMOVE_SINGLE_MEMBER" | "UNBIND_SINGLE_ASSET";
                  setCleanupConfirm(null);
                  executeCleanup(act);
                }}
                onCancel={() => setCleanupConfirm(null)}
                cleaning={cleaning}
              />
            </div>
          </div>
        </div>
      )}
'''
s = s[:idx] + confirm_jsx + s[idx + len(tail_marker):]

# 2. CleanupConfirmInput 子组件（文件尾部追加）：输入 DELETE 解锁
s = s.rstrip() + '''

// KN-UI：高危操作输入文字确认子组件（输入 DELETE 解锁；自查清单指令四）
function CleanupConfirmInput({
  expect,
  onConfirmed,
  onCancel,
  cleaning,
}: {
  expect: string;
  onConfirmed: () => void;
  onCancel: () => void;
  cleaning: boolean;
}) {
  const [val, setVal] = React.useState("");
  const [err, setErr] = useState<string | null>(null);
  const locked = val.trim() !== expect;
  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-slate-700">
        请输入「<span className="font-mono text-rose-600">{expect}</span>」以确认执行
        <span className="text-red-500 ml-0.5">*</span>
      </label>
      <input
        type="text"
        value={val}
        onChange={(e) => { setVal(e.target.value); setErr(null); }}
        maxLength={10}
        autoFocus
        placeholder={expect}
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-xs font-mono"
      />
      {err && <p className="text-xs text-red-600 font-medium">{err}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={cleaning} className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50">
          取消
        </button>
        <button
          type="button"
          onClick={() => { if (locked) { setErr(`请输入「${expect}」后才能执行`); return; } onConfirmed(); }}
          disabled={cleaning}
          className="px-5 h-9 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-lg cursor-pointer disabled:opacity-50"
        >
          {cleaning ? "执行中…" : "确认执行"}
        </button>
      </div>
    </div>
  );
}
'''

# 3. 成员行角色中文化 + 邮箱脱敏
old = '''                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black flex items-center justify-center shrink-0 text-xs shadow-xs">
                                {member.name?.[0]?.toUpperCase() || "U"}
                              </div>'''
i = s.find(old)
assert i > 0, "member row"
seg_end = s.find("</div>", s.find("action=", i))
seg = s[i:i+700]
# 直接替换已知的两个渲染点
s = s.replace('{member.role || "MEMBER"}', '{member.role === "OWNER" ? "所有者" : member.role === "ADMIN" ? "管理员" : "协同成员"}')
s = s.replace('{member.email}', '{maskEmail(member.email)}')

# 4. usageCount 千分位
s = s.replace('{asset.usageCount}', '{formatNumber(asset.usageCount)}')

# 5. 检测失败错误态区分：checkData null 时显示错误而非 0 计数 —— 找 summary 渲染
old = '''  const summary = checkData?.summary || { memberCount: 0, assetCount: 0, pendingInvitationCount: 0 };'''
new = '''  const checkFailed = !checkData;
  const summary = checkData?.summary || { memberCount: 0, assetCount: 0, pendingInvitationCount: 0 };'''
assert old in s
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("dissolve-check step2 OK")
