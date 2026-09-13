"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  UserPlus,
  RefreshCw,
  ShieldOff,
  ShieldCheck,
  AlertTriangle,
  X,
  AlertCircle,
  Building2,
  Mail,
  Phone,
  KeyRound,
  History,
  Lock,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { getActionLabel, getActionColor } from "@/lib/activity";

interface SubAccount {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

function fmt(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserSubAccountsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  // 重置密码
  const [resetTarget, setResetTarget] = useState<SubAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // 操作审计
  const [activityTarget, setActivityTarget] = useState<SubAccount | null>(null);
  const [activities, setActivities] = useState<
    { id: string; action: string; resource: string | null; details: any; ipAddress: string | null; createdAt: string }[]
  >([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/user/sub-accounts", {
        headers: authHeaders(),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setSubAccounts(json.subAccounts || []);
        setCanManage(!!json.canManage);
        if (manual) toast.success("子账号列表已刷新");
      } else {
        toast.error("加载子账号失败");
      }
    } catch (e) {
      console.error("加载子账号失败:", e);
      toast.error("加载子账号失败");
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const handleCreate = async () => {
    setError(null);
    if (!form.name.trim()) return setError("请输入姓名");
    if (!form.email.trim()) return setError("请输入邮箱");
    if (form.phone.trim() && !/^1[3-9]\d{9}$/.test(form.phone.trim()))
      return setError("请输入正确的 11 位手机号");
    if (!form.password) return setError("请输入初始密码");

    setCreating(true);
    try {
      const res = await fetch("/api/user/sub-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("子账号创建成功");
        setShowCreate(false);
        setForm({ name: "", email: "", phone: "", password: "" });
        load(false);
      } else {
        setError(json.error || "创建失败");
      }
    } catch (e) {
      console.error("创建子账号失败:", e);
      setError("网络异常，创建失败");
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (acc: SubAccount) => {
    const disable = acc.status === "active";
    if (disable && !window.confirm(`确认停用子账号「${acc.name}」？停用后其登录会话将立即失效。`)) return;
    setActingId(acc.id);
    try {
      const res = await fetch("/api/user/sub-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          subAccountId: acc.id,
          action: disable ? "disable" : "enable",
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || (disable ? "子账号已停用" : "子账号已启用"));
        load(false);
      } else {
        toast.error(json.error || "操作失败");
      }
    } catch (e) {
      console.error("操作失败:", e);
      toast.error("操作失败");
    } finally {
      setActingId(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetError(null);
    if (!newPassword) return setResetError("请输入新密码");
    setResetting(true);
    try {
      const res = await fetch("/api/user/sub-accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          subAccountId: resetTarget.id,
          action: "reset_password",
          newPassword,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || "子账号密码已重置");
        setResetTarget(null);
        setNewPassword("");
      } else {
        setResetError(json.error || "重置失败");
      }
    } catch (e) {
      console.error("重置密码失败:", e);
      setResetError("网络异常，重置失败");
    } finally {
      setResetting(false);
    }
  };

  const openActivity = async (acc: SubAccount) => {
    setActivityTarget(acc);
    setActivities([]);
    setActivityLoading(true);
    try {
      const res = await fetch(
        `/api/user/sub-accounts/activity?subAccountId=${encodeURIComponent(acc.id)}`,
        { headers: authHeaders(), cache: "no-store" },
      );
      const json = await res.json();
      if (res.ok) {
        setActivities(json.activities || []);
      } else {
        toast.error(json.error || "获取操作记录失败");
      }
    } catch (e) {
      console.error("获取操作记录失败:", e);
      toast.error("获取操作记录失败");
    } finally {
      setActivityLoading(false);
    }
  };

  const stats = {
    total: subAccounts.length,
    active: subAccounts.filter((a) => a.status === "active").length,
    disabled: subAccounts.filter((a) => a.status !== "active").length,
  };

  return (
    <div className="space-y-5">
      {/* 顶部标题 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-800 mb-1.5 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-[#3182ce]" />
            子账号管理
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            为企业创建并管理由主账号统管的子账号，可随时停用或恢复
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:border-[#3182ce] hover:text-[#3182ce] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
            {refreshing ? "刷新中..." : "刷新"}
          </button>
          {canManage && (
            <button
              onClick={() => { setError(null); setShowCreate(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-md shadow-[#3182ce]/20 hover:shadow-lg transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              创建子账号
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="bg-white/85 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-center h-48">
          <div className="w-10 h-10 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
        </div>
      ) : !canManage ? (
        <div className="bg-white/85 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-2xs p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">暂无子账号管理权限</h3>
          <p className="text-sm text-slate-500 max-w-lg mx-auto mb-5">
            子账号由「主账号」（企业空间所有者）统一创建与管理。你当前尚未拥有企业空间，
            请先创建企业空间后再使用子账号功能。
          </p>
          <Link
            href="/user/workspaces"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-xl hover:brightness-105 transition-all"
          >
            <Building2 className="w-3.5 h-3.5" />
            前往工作空间
          </Link>
        </div>
      ) : (
        <>
          {/* 概览 */}
          <div className="grid grid-cols-3 gap-3.5">
            {[
              { label: "子账号总数", value: stats.total, tone: "bg-slate-50 text-slate-500" },
              { label: "已启用", value: stats.active, tone: "bg-emerald-50 text-emerald-600" },
              { label: "已停用", value: stats.disabled, tone: "bg-slate-100 text-slate-400" },
            ].map((s) => (
              <div key={s.label} className="bg-white/85 backdrop-blur-xl rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${s.tone}`}>
                    <Users className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-800 mt-1.5">{s.value}</div>
              </div>
            ))}
          </div>

          {/* 列表 */}
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            {subAccounts.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Users className="w-7 h-7" />
                </div>
                <p className="text-sm text-slate-500">暂无子账号，点击右上角「创建子账号」开始</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="py-3 px-4 font-medium">子账号</th>
                      <th className="py-3 px-4 font-medium">联系方式</th>
                      <th className="py-3 px-4 font-medium">状态</th>
                      <th className="py-3 px-4 font-medium">最近登录</th>
                      <th className="py-3 px-4 font-medium">创建时间</th>
                      <th className="py-3 px-4 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subAccounts.map((acc) => {
                      const active = acc.status === "active";
                      return (
                        <tr key={acc.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shrink-0">
                                {(acc.name || "U").slice(0, 1)}
                              </div>
                              <div>
                                <div className="font-bold text-slate-800">{acc.name}</div>
                                <div className="text-[11px] text-slate-400">子账号</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              {acc.email || "—"}
                            </div>
                            {acc.phone && (
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {acc.phone}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ShieldCheck className="w-3.5 h-3.5" /> 已启用
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                <ShieldOff className="w-3.5 h-3.5" /> 已停用
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs">{fmt(acc.lastLoginAt)}</td>
                          <td className="py-3 px-4 text-slate-500 text-xs">{fmt(acc.createdAt)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openActivity(acc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                                title="查看操作记录"
                              >
                                <History className="w-3.5 h-3.5" /> 活动
                              </button>
                              <button
                                onClick={() => { setResetError(null); setNewPassword(""); setResetTarget(acc); }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#2b6cb0] bg-blue-50 hover:bg-blue-100 transition-colors"
                                title="重置密码"
                              >
                                <Lock className="w-3.5 h-3.5" /> 重置密码
                              </button>
                              <button
                                onClick={() => toggleStatus(acc)}
                                disabled={actingId === acc.id}
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                                  active
                                    ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                    : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                                }`}
                              >
                                {active ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                {active ? "停用" : "启用"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 text-[11px] text-slate-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            子账号可独立登录平台，停用后其全部登录会话将立即失效；如需彻底移除请联系平台管理员。
          </div>
        </>
      )}

      {/* 创建弹窗 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowCreate(false)}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowCreate(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#3182ce]" />
              创建子账号
            </h3>
            <p className="text-xs text-slate-500 mb-5">为子账号设置登录邮箱与初始密码，创建后可随时停用</p>

            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  <span className="zg-required">姓名</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="子账号姓名 / 昵称"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  <span className="zg-required">登录邮箱</span>
                </label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="用于子账号登录"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">手机号（可选）</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="11 位手机号"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  <span className="zg-required">初始密码</span>
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="至少 8 位，含大小写字母与数字"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
                />
              </div>
              <div className="flex items-start gap-2 text-[11px] text-slate-400">
                <KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                密码需至少 8 位且包含大小写字母与数字，将以加密方式存储；请将账号与初始密码安全地告知子账号使用者。
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-3 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-60 text-sm"
              >
                {creating ? "创建中..." : "确认创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重置密码弹窗 */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setResetTarget(null)}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setResetTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#3182ce]" />
              重置子账号密码
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              为「{resetTarget.name}」设置新的登录密码，重置后其当前会话将立即失效。
            </p>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              <span className="zg-required">新密码</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 位，含大小写字母与数字"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm"
            />
            {resetError && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-3 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                {resetError}
              </p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors text-sm"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-60 text-sm"
              >
                {resetting ? "重置中..." : "确认重置"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 操作审计弹窗 */}
      {activityTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setActivityTarget(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 relative max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActivityTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
              <History className="w-5 h-5 text-[#3182ce]" />
              操作审计
            </h3>
            <p className="text-xs text-slate-500 mb-4">「{activityTarget.name}」最近的操作记录（最多 50 条）</p>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {activityLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-8 h-8 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">暂无操作记录</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activities.map((a) => (
                    <div key={a.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span
                          className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${getActionColor(
                            a.action,
                          )}`}
                        >
                          {getActionLabel(a.action)}
                        </span>
                        {a.resource && <div className="text-[11px] text-slate-400 mt-0.5">{a.resource}</div>}
                        {a.ipAddress && a.ipAddress !== "unknown" && (
                          <div className="text-[11px] text-slate-400 mt-0.5">IP：{a.ipAddress}</div>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 shrink-0">{fmt(a.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
