"use client";

import React, { useState, useEffect } from "react";
import {
  Code2,
  Plus,
  Copy,
  Trash2,
  Key,
  ShieldCheck,
  AlertTriangle,
  X,
  Eye,
  Calendar,
  Clock,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function DeveloperCenterPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // 创建弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // 创建成功后一次性展示完整 key
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 仅在存在 token 时才加入 Authorization，返回类型固定为 Record<string, string> 以避免
  // 空对象分支被推断成 { Authorization?: undefined } 而触发 fetch headers 的类型错误。
  const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadKeys = async () => {
    try {
      const res = await fetch("/api/user/api-keys", {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.apiKeys || []);
      } else if (res.status === 401) {
        toast.error("登录状态已失效，请重新登录");
      } else {
        toast.error("加载 API Key 失败");
      }
    } catch (e) {
      console.error("加载 API Key 错误:", e);
      toast.error("加载 API Key 失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("请填写 API Key 名称");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRevealedKey(data.apiKey.key);
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        loadKeys();
        toast.success("API Key 创建成功");
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch (e) {
      console.error("创建 API Key 错误:", e);
      toast.error("创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ id: deleteId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setKeys((prev) => prev.filter((k) => k.id !== deleteId));
        toast.success("API Key 已删除");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (e) {
      console.error("删除 API Key 错误:", e);
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const copy = (text: string, label = "已复制到剪贴板") => {
    navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const fmtDate = (s?: string | null) =>
    s ? new Date(s).toLocaleString("zh-CN") : "—";

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate flex items-center gap-2">
            <Code2 className="w-7 h-7 text-[#3182ce]" />
            开发者中心
          </h1>
          <p className="text-sm text-slate-500 font-medium truncate">
            在此管理你的 API Key，用于调用平台开放接口与自动化集成
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#3182ce]/30 hover:shadow-xl transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          创建 API Key
        </button>
      </div>

      {/* 安全提示条 */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs font-medium leading-relaxed">
          <span className="font-bold">安全提醒：</span>
          API Key 等同于你的账号凭证，请勿外泄或在客户端代码中硬编码。创建后仅展示一次完整 Key，请立即妥善保存。
        </div>
      </div>

      {/* 列表卡片 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-10 h-10 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
          </div>
        ) : keys.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                <div className="w-11 h-11 rounded-xl bg-[#3182ce]/10 flex items-center justify-center text-[#3182ce] shrink-0">
                  <Key className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 truncate">{k.name}</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-1 truncate">
                    {k.keyPrefix}••••••••••••••••••••
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {fmtDate(k.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      最近使用：{fmtDate(k.lastUsedAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => copy(`${k.keyPrefix}••••`, "已复制 Key 前缀")}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  title="复制前缀"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  onClick={() => setDeleteId(k.id)}
                  className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Key className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">暂无 API Key</h3>
            <p className="text-slate-500 text-sm">点击右上角「创建 API Key」开始使用开放接口</p>
          </div>
        )}
      </div>

      {/* 创建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowCreate(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <h3 className="text-xl font-black text-slate-800 mb-1">创建 API Key</h3>
            <p className="text-xs text-slate-500 mb-5">为你的应用或脚本生成一个访问凭证</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="如：我的脚本 / 生产环境服务"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">描述（可选）</label>
                <input
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="备注用途，便于后续识别"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-60"
            >
              {creating ? "创建中..." : "创建"}
            </button>
          </div>
        </div>
      )}

      {/* 一次性展示完整 Key */}
      {revealedKey && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setRevealedKey(null)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">API Key 已生成</h3>
                <p className="text-xs text-slate-500 mt-0.5">请立即复制保存，关闭后将无法再次查看</p>
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-xl">
              <code className="flex-1 text-emerald-400 font-mono text-sm break-all select-all">
                {revealedKey}
              </code>
              <button
                onClick={() => copy(revealedKey, "完整 Key 已复制")}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0"
                title="复制"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
            </div>

            <button
              onClick={() => setRevealedKey(null)}
              className="w-full mt-6 px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all"
            >
              我已保存，关闭
            </button>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">确认删除</h3>
                <p className="text-xs text-slate-500 mt-0.5">删除后使用该 Key 的服务将立即失效</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
