# -*- coding: utf-8 -*-
# pay/page.tsx：对公工单撤销/删除（单条+批量）补二次确认（含批量 requireText）
import io

P = "src/app/user/pay/page.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. state：transfer 确认弹窗
m = s.find("  const toast = useToast();")
assert m > 0
ins = s.find("\n", m)  # 行尾
insert_block = """
  // KN-UI：对公工单撤销/删除二次确认（自查清单指令四）
  const [transferConfirm, setTransferConfirm] = useState<
    null | { kind: "cancel" | "delete" | "batch-delete"; ids: string[]; label: string }
  >(null);"""
s = s[:ins] + insert_block + s[ins:]

# 2. 拦截入口：改 4 个调用点
s = s.replace(
    "onClick={() => handleDeleteTransfer(selectedTransferIds)}",
    "onClick={() => setTransferConfirm({ kind: \"batch-delete\", ids: selectedTransferIds, label: `批量删除选中的 ${selectedTransferIds.length} 笔对公工单` })}",
    1,
)
s = s.replace(
    "onClick={() => handleCancelOrder(o.id)}",
    "onClick={() => setTransferConfirm({ kind: \"cancel\", ids: [o.id], label: \"撤销该笔对公工单\" })}",
    1,
)
s = s.replace(
    "onClick={() => handleDeleteTransfer([o.id])}",
    "onClick={() => setTransferConfirm({ kind: \"delete\", ids: [o.id], label: \"删除该笔对公工单\" })}",
    1,
)
s = s.replace(
    "onClick={() => handleCancelOrder(transferDetail.id)}",
    "onClick={() => setTransferConfirm({ kind: \"cancel\", ids: [transferDetail.id], label: \"撤销该笔对公工单\" })}",
    1,
)

# 3. 确认弹窗 JSX：插到文件主 return 尾（最后一个 </div> 前不好定位——挂 body portal 简化）
# 找 export default function ... 的 return 尾部：用最后一个 "</div>\n  );\n}" 
tail_marker = "    </div>\n  );\n}"
idx = s.rfind(tail_marker)
assert idx > 0, "tail"
confirm_jsx = """
      {/* KN-UI：对公工单撤销/删除二次确认（自查清单指令四） */}
      {transferConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md" onClick={() => !transferBusy && setTransferConfirm(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-1 w-full bg-gradient-to-r from-rose-500 to-red-600" />
            <div className="p-6 space-y-3">
              <h3 className="text-base font-black text-slate-900">
                {transferConfirm.kind === "cancel" ? "撤销工单" : "删除工单"}
              </h3>
              <p className="text-xs text-slate-600 font-bold leading-relaxed">
                {transferConfirm.kind === "cancel"
                  ? "撤销后该笔对公转账工单将终止处理，需重新提交。"
                  : "删除后工单记录将不可恢复（已入账的算力点不受影响）。"}
                {transferConfirm.ids.length > 1 ? ` 共 ${transferConfirm.ids.length} 笔。` : ""}
              </p>
              {transferConfirm.kind !== "cancel" && transferConfirm.ids.length > 1 && (
                <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    批量删除不可恢复，请输入「<span className="font-mono text-rose-600">DELETE</span>」以确认
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    id="transfer-batch-confirm-input"
                    maxLength={10}
                    placeholder="DELETE"
                    className="w-full h-9 px-3 text-xs font-mono border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTransferConfirm(null)}
                  disabled={transferBusy}
                  className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (transferConfirm.kind === "cancel") {
                      setTransferConfirm(null);
                      handleCancelOrder(transferConfirm.ids[0]);
                      return;
                    }
                    if (transferConfirm.ids.length > 1) {
                      const el = document.getElementById("transfer-batch-confirm-input") as HTMLInputElement | null;
                      if (!el || el.value.trim() !== "DELETE") {
                        toast.error("请输入「DELETE」后才能执行批量删除");
                        return;
                      }
                    }
                    const ids = transferConfirm.ids;
                    const kind = transferConfirm.kind;
                    setTransferConfirm(null);
                    handleDeleteTransfer(ids);
                  }}
                  disabled={transferBusy}
                  className={`px-5 h-9 text-white text-xs font-black rounded-lg cursor-pointer disabled:opacity-50 ${
                    transferConfirm.kind === "cancel" ? "bg-amber-500 hover:bg-amber-600" : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  {transferBusy ? "处理中…" : transferConfirm.kind === "cancel" ? "确认撤销" : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
"""
s = s[:idx] + confirm_jsx + s[idx + len(tail_marker):]

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("pay transfer confirm OK")
