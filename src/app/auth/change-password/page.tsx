"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Lock, Key, Eye, EyeOff, Shield, AlertTriangle } from "lucide-react";

function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const isExpired = searchParams.get("expired") === "true";
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [formErrors, setFormErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          router.push("/auth/login");
          return;
        }
      } catch (error) {
        router.push("/auth/login");
      }
    };

    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    const newErrors: typeof formErrors = {};

    if (!isExpired && !formData.currentPassword) {
      newErrors.currentPassword = "请输入当前密码";
    }

    if (!formData.newPassword) {
      newErrors.newPassword = "请输入新密码";
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = "新密码长度至少 6 位";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "请再次输入新密码";
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = "两次输入的新密码不一致";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormErrors(newErrors);
      const firstErrorField = Object.keys(newErrors)[0];
      const element = document.getElementById(`change-${firstErrorField}`);
      if (element) {
        element.focus();
      }
      return;
    }

    try {
      setLoading(true);

      const userId = localStorage.getItem("userId");

      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          currentPassword: isExpired ? "" : formData.currentPassword,
          newPassword: formData.newPassword,
          forceChange: isExpired,
        }),
      });

      if (res.ok) {
        toast.success("密码已修改成功");

        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (response.ok) {
          localStorage.removeItem("userId");
          localStorage.removeItem("auth_token");
          localStorage.removeItem("userRole");
          localStorage.removeItem("sessionToken");
          sessionStorage.removeItem("hasActiveSession");
        }

        setTimeout(() => {
          router.push("/auth/login?reason=PASSWORD_CHANGED");
        }, 1000);
      } else {
        const data = await res.json();
        throw new Error(data.message || "修改失败");
      }
    } catch (error) {
      console.error("Change password error:", error);
      toast.error(error instanceof Error ? error.message : "修改失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-red-50 via-slate-50 to-orange-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-6 w-full max-w-md mx-auto">
        <div className="w-full animate-slide-up">
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
                {isExpired ? "密码已过期" : "修改密码"}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                {isExpired
                  ? "您的密码已超过 90 天未修改，为保障账号安全，请修改密码"
                  : "请输入您的当前密码和新密码"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isExpired && (
                <div>
                  <label
                    htmlFor="change-currentPassword"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    当前密码 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="change-currentPassword"
                      type={showPasswords.current ? "text" : "password"}
                      value={formData.currentPassword}
                      onChange={(e) =>
                        setFormData({ ...formData, currentPassword: e.target.value })
                      }
                      className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-tech-blue focus:ring-2 focus:ring-tech-blue/20 outline-none transition-all ${
                        formErrors.currentPassword
                          ? "border-red-500"
                          : "border-slate-200"
                      }`}
                      placeholder="请输入当前密码"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({
                          ...showPasswords,
                          current: !showPasswords.current,
                        })
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPasswords.current ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {formErrors.currentPassword && (
                    <p className="mt-1 text-xs text-red-500">
                      {formErrors.currentPassword}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label
                  htmlFor="change-newPassword"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  新密码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="change-newPassword"
                    type={showPasswords.new ? "text" : "password"}
                    value={formData.newPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, newPassword: e.target.value })
                    }
                    className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-tech-blue focus:ring-2 focus:ring-tech-blue/20 outline-none transition-all ${
                      formErrors.newPassword
                        ? "border-red-500"
                        : "border-slate-200"
                    }`}
                    placeholder="请输入新密码（至少 6 位）"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({
                        ...showPasswords,
                        new: !showPasswords.new,
                      })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.new ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {formErrors.newPassword && (
                  <p className="mt-1 text-xs text-red-500">{formErrors.newPassword}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="change-confirmPassword"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  确认新密码 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="change-confirmPassword"
                    type={showPasswords.confirm ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-tech-blue focus:ring-2 focus:ring-tech-blue/20 outline-none transition-all ${
                      formErrors.confirmPassword
                        ? "border-red-500"
                        : "border-slate-200"
                    }`}
                    placeholder="请再次输入新密码"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({
                        ...showPasswords,
                        confirm: !showPasswords.confirm,
                      })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.confirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {formErrors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">
                    {formErrors.confirmPassword}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-tech-blue to-tech-indigo text-white rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-tech-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Shield className="w-4 h-4" />
                {loading ? "修改中..." : "修改密码"}
              </button>
            </form>

            {!isExpired && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="text-sm text-slate-600 hover:text-slate-800"
                >
                  返回
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <ChangePasswordForm />
    </Suspense>
  );
}
