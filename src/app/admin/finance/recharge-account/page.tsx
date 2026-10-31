"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Save, RefreshCw, AlertCircle, CheckCircle2, Copy } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface OfficialAccount {
  companyName: string;
  bankName: string;
  bankAccount: string;
  remarkHint?: string;
}

export default function AdminRechargeAccountPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<OfficialAccount | null>(null);
  const [form, setForm] = useState<OfficialAccount>({
    companyName: "",
    bankName: "",
    bankAccount: "",
    remarkHint: "转账汇款时务必在「转账附言/备注」中注明充值工单号",
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/system/recharge-account", { headers, credentials: "include" });
      const json = await res.json().catch(() => ({}));
      const acc = json?.account || null;
      setCurrent(acc);
      if (acc) {
        setForm({
          companyName: acc.companyName || "",
          bankName: acc.bankName || "",
          bankAccount: acc.bankAccount || "",
          remarkHint: acc.remarkHint || "转账汇款时务必在「转账附言/备注」中注明充值工单号",
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  const save = async () => {
    if (!form.companyName.trim() || !form.bankName.trim() || !form.bankAccount.trim()) {
      toast.error("户名、开户银行、银行账号均为必填项");
      return;
    }
    setSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/system/recharge-account", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          bankName: form.bankName.trim(),
          bankAccount: form.bankAccount.trim(),
          remarkHint: form.remarkHint?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success("对公收款账户已更新，用户端将实时展示");
        setCurrent(json.account || form);
        await load();
      } else {
        toast.error(json.error || "保存失败");
      }
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full h-10 px-3 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-blue-100 transition-colors";

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5 text-[#3182ce]" />
          <h2 className="text-xl font-black text-slate-800">平台官方对公收款账户配置</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> 刷新
        </button>
      </div>

      <p className="text-xs text-slate-500 font-medium bg-blue-50/70 border border-blue-200/70 rounded-lg px-3 py-2">
        此处配置的收款账户将实时展示在用户端「对公转账 / 企业充值」页，供企业用户汇款。户名、开户银行、银行账号为必填项。
      </p>

      {current && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 当前已配置账户
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {[
              { label: "户名", value: current.companyName },
              { label: "开户银行", value: current.bankName },
              { label: "银行账号", value: current.accountNumber || current.bankAccount },
            ].map((f) => (
              <div key={f.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">{f.label}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(f.value || "", f.label)}
                    className="text-slate-400 hover:text-[#3182ce]"
                    title="复制"
                  >
                    {copiedField === f.label ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <div className="mt-1 font-bold text-slate-800 break-all">{f.value || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
          <span className="w-1.5 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
          编辑收款账户
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              收款方户名（对公）<span className="text-rose-500">*</span>
            </label>
            <input
              className={inputCls}
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="如：知阁（深圳）科技有限公司"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              开户银行全称<span className="text-rose-500">*</span>
            </label>
            <input
              className={inputCls}
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              placeholder="如：中国招商银行深圳高新园支行"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            对公银行结算账号<span className="text-rose-500">*</span>
          </label>
          <input
            className={`${inputCls} font-mono`}
            value={form.bankAccount}
            onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
            placeholder="对公收款账号"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">转账附言提示（选填）</label>
          <input
            className={inputCls}
            value={form.remarkHint}
            onChange={(e) => setForm({ ...form, remarkHint: e.target.value })}
            placeholder="转账汇款时务必在「转账附言/备注」中注明充值工单号"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" /> 读取中…
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white font-black text-sm shadow-sm hover:shadow-md disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" /> {saving ? "保存中…" : "保存配置"}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50/90 border border-amber-200/80 rounded-lg px-3 py-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
        <span>修改后请通知财务人员，企业用户汇款时以此处展示的账户为准。</span>
      </div>
    </div>
  );
}
