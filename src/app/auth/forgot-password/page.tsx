"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Shield,
  CheckCircle,
} from "lucide-react";

type Step = 1 | 2 | 3;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    account: "", // 邮箱或手机号
    smsCode: "",
    password: "",
    confirmPassword: "",
  });

  const [smsCountdown, setSmsCountdown] = useState(0);

  const sendSmsCode = async () => {
    const isPhone = /^1[3-9]\d{9}$/.test(formData.account);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account);

    if (!isPhone && !isEmail) {
      toast.warning("请输入正确的手机号或邮箱");
      return;
    }

    if (isPhone) {
      try {
        setLoading(true);
        const res = await fetch("/api/auth/send-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: formData.account,
            type: "reset-password",
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
    } else {
      // 邮箱验证码
      try {
        setLoading(true);
        const res = await fetch("/api/auth/send-email-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.account,
            type: "reset-password",
          }),
        });

        const data = await res.json();

        if (res.ok) {
          toast.success("验证码已发送到邮箱，请注意查收");
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
    }
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
    toast.success("身份验证通过，请输入验证码");
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: formData.account,
          code: formData.smsCode,
          type: "reset-password",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStep(3);
        toast.success("验证码正确，请设置新密码");
      } else {
        toast.error(data.message || "验证码错误");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("密码长度至少 8 位");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: formData.account,
          smsCode: formData.smsCode,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("密码重置成功！正在跳转到登录页面...");
        setTimeout(() => {
          router.push("/auth/login");
        }, 1500);
      } else {
        toast.error(data.message || "密码重置失败");
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

          {/* 进度条 */}
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                    step >= s
                      ? "bg-[var(--zhige-primary)] text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {step > s ? <CheckCircle className="w-5 h-5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`w-20 h-1 mx-2 transition-colors ${
                      step > s ? "bg-[var(--zhige-primary)]" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {step === 1 && (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                验证身份
              </h2>
              <p className="text-slate-600 mb-6">
                请输入绑定的手机号或邮箱
              </p>

              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    手机号 / 邮箱
                  </label>
                  <div className="relative">
                    {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account) ? (
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    ) : (
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    )}
                    <input
                      type="text"
                      value={formData.account}
                      onChange={(e) =>
                        setFormData({ ...formData, account: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入手机号或邮箱"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[var(--zhige-primary)] text-white py-3 rounded-[var(--radius-btn)] font-semibold hover:bg-[#2b6cb0] transition-colors flex items-center justify-center gap-2"
                >
                  <span>下一步</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                安全验证
              </h2>
              <p className="text-slate-600 mb-6">请输入收到的验证码</p>

              <form onSubmit={handleStep2Submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    验证码
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
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
                      {smsCountdown > 0
                        ? `${smsCountdown}秒后重发`
                        : "获取验证码"}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-[var(--zhige-primary)] text-white py-3 rounded-[var(--radius-btn)] font-semibold hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>验证中...</span>
                      </>
                    ) : (
                      <>
                        <span>验证</span>
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                重置密码
              </h2>
              <p className="text-slate-600 mb-6">请设置新的登录密码</p>

              <form onSubmit={handleStep3Submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    新密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="w-full pl-10 pr-12 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入新密码"
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    确认密码
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
                      placeholder="请再次输入新密码"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[var(--zhige-primary)] text-white py-3 rounded-[var(--radius-btn)] font-semibold hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>重置中...</span>
                    </>
                  ) : (
                    <>
                      <span>确认重置</span>
                      <CheckCircle className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 text-center text-sm text-slate-600">
            想起密码了？{" "}
            <Link
              href="/auth/login"
              className="text-[var(--zhige-primary)] font-medium hover:underline"
            >
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
