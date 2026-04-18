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
  Key,
  MessageSquare,
} from "lucide-react";

type Step = 1 | 2 | 3;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    account: "",
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

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();

    const isPhone = /^1[3-9]\d{9}$/.test(formData.account);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account);

    if (!isPhone && !isEmail) {
      toast.warning("请输入正确的手机号或邮箱");
      return;
    }

    setStep(2);
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.smsCode || formData.smsCode.length !== 6) {
      toast.warning("请输入 6 位验证码");
      return;
    }

    // TODO: 验证验证码
    setStep(3);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
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
          newPassword: formData.password,
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
      <div className="w-full max-w-4xl grid md:grid-cols-5 gap-0 rounded-[var(--radius-card)] overflow-hidden shadow-2xl bg-white">
        {/* 左侧品牌区 */}
        <div className="hidden md:flex md:col-span-2 flex-col justify-center items-center bg-gradient-to-br from-[var(--zhige-primary)] to-[#1e3a8a] p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-blue-300 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 text-center">
            <div className="w-16 h-16 mb-4 bg-white/10 rounded-[var(--radius-card)] flex items-center justify-center backdrop-blur-sm mx-auto">
              <Shield className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold mb-2">密码找回</h1>
            <p className="text-blue-100 mb-6 text-sm">重置您的账号密码</p>

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 bg-white/10 rounded-[var(--radius-btn)] px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-xs">安全验证</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-[var(--radius-btn)] px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-xs">快速重置</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-[var(--radius-btn)] px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-xs">即时生效</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="md:col-span-3 p-6 md:p-8">
          <div className="mb-6">
            <Logo variant="light" />
          </div>

          {/* 进度条 */}
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= s
                      ? "bg-[var(--zhige-primary)] text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {step > s ? <CheckCircle className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-colors ${
                      step > s ? "bg-[var(--zhige-primary)]" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* 步骤标题 */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-1">
              {step === 1 && "验证身份"}
              {step === 2 && "安全验证"}
              {step === 3 && "重置密码"}
            </h2>
            <p className="text-slate-600 text-sm">
              {step === 1 && "请输入您注册时使用的手机号或邮箱"}
              {step === 2 && "请输入收到的验证码"}
              {step === 3 && "请设置新的登录密码"}
            </p>
          </div>

          <form
            onSubmit={
              step === 1
                ? handleStep1
                : step === 2
                  ? handleStep2
                  : handleResetPassword
            }
            className="space-y-4"
          >
            {step === 1 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  手机号 / 邮箱
                </label>
                <div className="relative">
                  {formData.account &&
                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account) ? (
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  ) : (
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  )}
                  <input
                    type="text"
                    value={formData.account}
                    onChange={(e) =>
                      setFormData({ ...formData, account: e.target.value })
                    }
                    className="w-full pl-9 pr-4 py-2.5 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] text-sm focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                    placeholder="请输入手机号或邮箱"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full mt-4 bg-[var(--zhige-primary)] text-white py-2.5 rounded-[var(--radius-btn)] font-medium text-sm hover:bg-[#2b6cb0] transition-colors flex items-center justify-center gap-2"
                >
                  <span>下一步</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    验证码
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={formData.smsCode}
                        onChange={(e) =>
                          setFormData({ ...formData, smsCode: e.target.value })
                        }
                        className="w-full pl-9 pr-4 py-2.5 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] text-sm focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                        placeholder="请输入 6 位验证码"
                        maxLength={6}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={sendSmsCode}
                      disabled={smsCountdown > 0 || loading}
                      className="px-3 py-2.5 bg-[var(--zhige-primary)] text-white rounded-[var(--radius-btn)] text-xs font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {smsCountdown > 0 ? `${smsCountdown}秒` : "获取验证码"}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 border border-[var(--zhige-border)] text-slate-700 py-2.5 rounded-[var(--radius-btn)] font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[var(--zhige-primary)] text-white py-2.5 rounded-[var(--radius-btn)] font-medium text-sm hover:bg-[#2b6cb0] transition-colors flex items-center justify-center gap-2"
                  >
                    <span>下一步</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    新密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      className="w-full pl-9 pr-10 py-2.5 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] text-sm focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入新密码"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    确认密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          confirmPassword: e.target.value,
                        })
                      }
                      className="w-full pl-9 pr-4 py-2.5 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] text-sm focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请再次输入新密码"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 border border-[var(--zhige-border)] text-slate-700 py-2.5 rounded-[var(--radius-btn)] font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-[var(--zhige-primary)] text-white py-2.5 rounded-[var(--radius-btn)] font-medium text-sm hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>重置中...</span>
                      </>
                    ) : (
                      <>
                        <span>重置密码</span>
                        <Key className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="mt-5 text-center text-xs text-slate-600">
            记得密码了？{" "}
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
