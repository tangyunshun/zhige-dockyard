"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  Phone,
  MessageSquare,
  Lock,
  Eye,
  EyeOff,
  Check,
  ArrowRight,
  Shield,
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [formData, setFormData] = useState({
    phone: "",
    smsCode: "",
    password: "",
    confirmPassword: "",
  });

  const [smsCountdown, setSmsCountdown] = useState(0);
  const [passwordStrength, setPasswordStrength] = useState({
    valid: false,
    score: 0,
    requirements: [] as string[],
  });

  const validatePassword = (password: string) => {
    const requirements = [];
    let score = 0;

    if (password.length >= 8) score++;
    else requirements.push("至少 8 个字符");

    if (/[a-z]/.test(password)) score++;
    else requirements.push("包含小写字母");

    if (/[A-Z]/.test(password)) score++;
    else requirements.push("包含大写字母");

    if (/[0-9]/.test(password)) score++;
    else requirements.push("包含数字");

    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else requirements.push("包含特殊字符");

    setPasswordStrength({ valid: score === 5, score, requirements });
  };

  const sendSmsCode = async () => {
    if (!formData.phone || !/^1[3-9]\d{9}$/.test(formData.phone)) {
      toast.warning("请输入正确的手机号");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.phone,
          type: "register",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("验证码已发送，请注意查收");
        setSmsCountdown(60);
        const timer = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast.error(data.message || "发送失败");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreedToTerms) {
      toast.warning("请先同意服务条款和隐私政策");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    if (!passwordStrength.valid) {
      toast.error("密码强度不足，请满足所有要求");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.phone,
          smsCode: formData.smsCode,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("注册成功！正在跳转到登录页面...");
        setTimeout(() => {
          router.push("/auth/login");
        }, 1500);
      } else {
        toast.error(data.message || "注册失败");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[var(--radius-card)] shadow-xl p-8">
          <div className="mb-8">
            <Logo variant="light" />
          </div>

          <h2 className="text-2xl font-bold text-slate-800 mb-2">创建账号</h2>
          <p className="text-slate-600 mb-6">使用手机号注册新账号</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                手机号 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                  placeholder="请输入手机号"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                验证码 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.smsCode}
                    onChange={(e) =>
                      setFormData({ ...formData, smsCode: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                    placeholder="请输入验证码"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={sendSmsCode}
                  disabled={smsCountdown > 0 || loading}
                  className="px-4 py-3 bg-[var(--zhige-primary)] text-white rounded-[var(--radius-btn)] font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {smsCountdown > 0 ? `${smsCountdown}秒后重发` : "获取验证码"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                密码 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    validatePassword(e.target.value);
                  }}
                  className="w-full pl-10 pr-12 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                  placeholder="请设置密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* 密码强度指示器 */}
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`flex-1 h-1.5 rounded-full transition-colors ${
                        level <= passwordStrength.score
                          ? passwordStrength.score === 5
                            ? "bg-green-500"
                            : level <= 2
                              ? "bg-red-500"
                              : level <= 4
                                ? "bg-orange-500"
                                : "bg-yellow-500"
                          : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                {passwordStrength.requirements.length > 0 && (
                  <div className="text-xs text-slate-500">
                    需要满足：{passwordStrength.requirements.join("、")}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                确认密码 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      confirmPassword: e.target.value,
                    })
                  }
                  className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                  placeholder="请再次输入密码"
                  required
                />
              </div>
            </div>

            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors mt-0.5 ${
                  agreedToTerms
                    ? "bg-[var(--zhige-primary)] border-[var(--zhige-primary)]"
                    : "border-[var(--zhige-border)]"
                }`}
              >
                {agreedToTerms && <Check className="w-3 h-3 text-white" />}
              </button>
              <label className="text-sm text-slate-600 cursor-pointer select-none">
                我已阅读并同意{" "}
                <Link
                  href="/terms"
                  className="text-[var(--zhige-primary)] hover:underline"
                >
                  《知阁服务条款》
                </Link>{" "}
                与{" "}
                <Link
                  href="/privacy"
                  className="text-[var(--zhige-primary)] hover:underline"
                >
                  《隐私政策》
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreedToTerms || !passwordStrength.valid}
              className="w-full bg-[var(--zhige-primary)] text-white py-3 rounded-[var(--radius-btn)] font-semibold hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>注册中...</span>
                </>
              ) : (
                <>
                  <span>注册</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-600">
            已有账号？{" "}
            <Link
              href="/auth/login"
              className="text-[var(--zhige-primary)] font-medium hover:underline"
            >
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
