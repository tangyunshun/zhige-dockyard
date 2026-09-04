"use client";

import React, { useState } from "react";
import { X, ShieldCheck, User, Lock, Phone, Mail, Eye, EyeOff, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface CompleteOAuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar?: string | null;
  } | null;
  onSuccess?: (updatedUser: any) => void;
}

export default function CompleteOAuthProfileModal({
  isOpen,
  onClose,
  currentUser,
  onSuccess,
}: CompleteOAuthProfileModalProps) {
  const toast = useToast();

  const [username, setUsername] = useState(currentUser?.name || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 同步用户初始值
  React.useEffect(() => {
    if (currentUser?.name && !username) {
      setUsername(currentUser.name);
    }
    if (currentUser?.phone && !phone) {
      setPhone(currentUser.phone);
    }
    if (currentUser?.email && !email) {
      setEmail(currentUser.email);
    }
  }, [currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error("请输入登录账号名");
      return;
    }

    if (!password) {
      toast.error("请设置新的登录密码");
      return;
    }

    if (password.length < 6) {
      toast.error("密码长度至少为 6 个字符");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致，请重新确认");
      return;
    }

    if (phone.trim()) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(phone.trim())) {
        toast.error("请输入合法的 11 位手机号码");
        return;
      }
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        toast.error("请输入规范的电子邮箱格式");
        return;
      }
    }

    try {
      setSubmitting(true);
      const token = getAuthToken();

      const res = await fetch("/api/user/complete-oauth-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          password,
          confirmPassword,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("账号信息与独立登录密码设置成功！");
        if (typeof window !== "undefined") {
          sessionStorage.setItem("oauth_profile_dismissed", "true");
        }
        if (onSuccess) {
          onSuccess(data.user);
        }
        onClose();
      } else {
        toast.error(data.error || "保存失败，请稍后重试");
      }
    } catch (err: any) {
      toast.error(err?.message || "网络请求异常");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("oauth_profile_dismissed", "true");
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 顶部质感品牌色彩条 */}
        <div className="h-1.5 w-full bg-linear-to-r from-[#2b6cb0] via-[#3182ce] to-[#38a169]" />

        {/* 标题栏 */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-[#3182ce] shadow-2xs shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  完善账号与安全绑定
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  新用户引导
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                您通过第三方扫码快捷登录，建议设置独立账号密码，并在全终端直接登录
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="稍后完善"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单主体 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 账号名 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              登录账号名称 <span className="text-red-500 font-bold">*</span>
            </label>
            <div className="relative flex items-center">
              <User className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="设置您的个性登录账号"
                className="w-full pl-9 pr-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-800 transition-all bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">支持汉字、字母或数字，可用于今后直接登录</p>
          </div>

          {/* 密码与确认密码 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                设置登录密码 <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位密码"
                  className="w-full pl-9 pr-8 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-mono font-bold text-slate-800 transition-all bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                确认新密码 <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="w-full pl-9 pr-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-mono font-bold text-slate-800 transition-all bg-white"
                />
              </div>
            </div>
          </div>

          {/* 绑定手机号 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>绑定手机号码 (推荐)</span>
              <span className="text-[10px] text-slate-400 font-normal">支持手机验证码找回密码</span>
            </label>
            <div className="relative flex items-center">
              <Phone className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11 位中国大陆手机号码"
                className="w-full pl-9 pr-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-800 transition-all bg-white"
              />
            </div>
          </div>

          {/* 绑定邮箱 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>绑定电子邮箱 (推荐)</span>
              <span className="text-[10px] text-slate-400 font-normal">接收任务完成通知与安全告警</span>
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="例如：yourname@example.com"
                className="w-full pl-9 pr-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold text-slate-800 transition-all bg-white"
              />
            </div>
          </div>

          {/* 底部按钮栏 */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={submitting}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              稍后完善
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在保存...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>立即保存并绑定</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
