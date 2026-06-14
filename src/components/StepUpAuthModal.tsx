"use client";

import React, { useEffect, useState, useRef } from "react";
import { X, Shield, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

interface StepUpAuthModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  action: "delete_workspace" | "cancel_account";
  onConfirm: (verifyToken: string) => void;
  onCancel: () => void;
}

export default function StepUpAuthModal({
  isOpen,
  title,
  message,
  action,
  onConfirm,
  onCancel,
}: StepUpAuthModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setPassword("");
      setShowPassword(false);
      setErrorMsg(null);
      document.body.style.overflow = "hidden";
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = "unset";
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg("请输入密码");
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      // 从 localStorage 获取当前登录的 userId
      const userId = localStorage.getItem("userId");

      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          password,
          action,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onConfirm(data.verifyToken);
      } else {
        setErrorMsg(data.error || data.message || "密码验证失败");
      }
    } catch (err) {
      console.error("[二次鉴权] 失败:", err);
      setErrorMsg("网络错误，验证失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div
        className={`relative bg-white/98 backdrop-blur-2xl border border-white/90 rounded-[20px] shadow-2xl w-full max-w-[440px] mx-4 transform transition-all duration-300 ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors p-1.5 rounded-full focus:outline-none"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 内容区 */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-800 mb-1">
                {title}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {message}
              </p>
            </div>
          </div>

          {/* 错误信息 */}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* 密码输入框 */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-700 mb-2">
              验证账户密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入登录密码以确认身份"
                disabled={loading}
                className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-orange-500 focus:bg-white transition-all text-sm font-semibold text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 按钮区 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 h-11 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 h-11 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/20 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>正在验证...</span>
                </>
              ) : (
                <span>验证并继续</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
