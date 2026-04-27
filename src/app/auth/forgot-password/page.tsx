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
  CheckCircle,
  Key,
  MessageSquare,
  ArrowLeft,
  User,
} from "lucide-react";
import {
  validateAccount,
  validateSmsCode,
  validatePasswordStrength,
  getEmailSuggestions,
  getAccountType,
} from "@/lib/validators";

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
  const [errors, setErrors] = useState<{
    account?: string;
    smsCode?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  // 确认密码验证状态
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>();

  // 账号类型和邮箱补全
  const [accountType, setAccountType] = useState<
    "phone" | "email" | "username" | "unknown"
  >("unknown");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  // 账号验证状态
  const [accountCheckStatus, setAccountCheckStatus] = useState<{
    exists?: boolean;
    locked?: boolean;
    disabled?: boolean;
    minutesRemaining?: number;
  }>({});

  // 检查账号是否存在
  const checkAccount = async (account: string) => {
    const validation = validateAccount(account);
    if (!validation.valid) {
      setAccountCheckStatus({});
      return;
    }

    try {
      const res = await fetch("/api/auth/check-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });

      const data = await res.json();

      if (!data.exists) {
        setAccountCheckStatus({ exists: false });
      } else if (data.status === "locked") {
        setAccountCheckStatus({
          exists: true,
          locked: true,
          minutesRemaining: data.minutesRemaining,
        });
      } else if (data.status === "disabled") {
        setAccountCheckStatus({
          exists: true,
          disabled: true,
        });
      } else {
        setAccountCheckStatus({ exists: true });
      }
    } catch (error) {
      console.error("Account check error:", error);
    }
  };

  // 账号输入处理
  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, account: value });

    if (errors.account) {
      setErrors({ ...errors, account: undefined });
    }

    // 清空账号检测状态
    if (accountCheckStatus.exists === false) {
      setAccountCheckStatus({});
    }

    // 验证账号格式并检测类型
    const validation = validateAccount(value);
    if (!validation.valid && value.length > 0) {
      setErrors({ ...errors, account: validation.message });
    }

    // 判断账号类型
    const type = getAccountType(value);
    setAccountType(type);

    // 邮箱自动补全建议
    if (value.includes("@")) {
      const suggestions = getEmailSuggestions(value);
      setEmailSuggestions(suggestions);
      setShowEmailSuggestions(suggestions.length > 0);
    } else {
      setEmailSuggestions([]);
      setShowEmailSuggestions(false);
    }
  };

  // 账号输入框失焦时检测
  const handleAccountBlur = () => {
    setShowEmailSuggestions(false);
    if (formData.account) {
      const validation = validateAccount(formData.account);
      if (validation.valid) {
        checkAccount(formData.account);
      }
    }
  };

  // 选择邮箱建议
  const handleEmailSuggestionClick = (suggestion: string) => {
    setFormData({ ...formData, account: suggestion });
    setEmailSuggestions([]);
    setShowEmailSuggestions(false);
    setErrors({ ...errors, account: undefined });
  };

  const sendSmsCode = async () => {
    const isPhone = /^1[3-9]\d{9}$/.test(formData.account);
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.account);

    if (!isPhone && !isEmail) {
      setErrors({ account: "请输入正确的手机号或邮箱" });
      return;
    }

    // 检查账号状态
    if (!accountCheckStatus.exists) {
      setErrors({ account: "账号不存在" });
      return;
    }

    if (accountCheckStatus.locked) {
      setErrors({
        account: `账号已锁定，请${accountCheckStatus.minutesRemaining}分钟后再试`,
      });
      return;
    }

    if (accountCheckStatus.disabled) {
      setErrors({ account: "账号已被禁用，请联系管理员" });
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
          // 开发环境显示验证码
          if (data.debugCode) {
            toast.showToast(
              "sms-code",
              `验证码已发送：${data.debugCode}`,
              5000 // 显示 5 秒
            );
          } else {
            toast.success("验证码已发送，请注意查收");
          }
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
          setErrors({ account: data.message || "发送失败" });
        }
      } catch (error) {
        setErrors({ account: "网络错误，请稍后重试" });
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
          setErrors({ account: data.message || "发送失败" });
        }
      } catch (error) {
        setErrors({ account: "网络错误，请稍后重试" });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证账号格式
    const accountValidation = validateAccount(formData.account);
    if (!accountValidation.valid) {
      setErrors({ ...errors, account: accountValidation.message });
      return;
    }

    setErrors({ ...errors, account: undefined });
    setStep(2);
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证验证码
    const smsCodeValidation = validateSmsCode(formData.smsCode);
    if (!smsCodeValidation.valid) {
      setErrors({ ...errors, smsCode: smsCodeValidation.message });
      return;
    }

    setErrors({ ...errors, smsCode: undefined });
    // TODO: 验证验证码
    setStep(3);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: typeof errors = {};

    // 验证密码
    if (!formData.password) {
      newErrors.password = "请输入新密码";
    } else {
      const passwordValidation = validatePasswordStrength(formData.password);
      if (!passwordValidation.valid) {
        newErrors.password = "密码强度不足，请满足所有要求";
      }
    }

    // 验证确认密码（只检查是否为空，一致性已在失焦时验证）
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "请再次输入新密码";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (formData.password.length < 8) {
      setErrors({ password: "密码长度至少 8 位" });
      return;
    }

    setErrors({});

    setLoading(true);

    // 先验证验证码（如果是手机号）
    const isPhone = /^1[3-9]\d{9}$/.test(formData.account);
    if (isPhone && formData.smsCode) {
      try {
        const verifyRes = await fetch("/api/auth/verify-sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: formData.account,
            smsCode: formData.smsCode,
          }),
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok) {
          if (verifyData.isLocked) {
            setErrors({
              smsCode: `验证失败次数过多，请${verifyData.minutesRemaining}分钟后再试`,
            });
          } else if (verifyData.remainingAttempts !== undefined) {
            setErrors({
              smsCode: `${verifyData.message}，剩余${verifyData.remainingAttempts}次尝试机会`,
            });
          } else {
            setErrors({ smsCode: verifyData.message || "验证失败" });
          }
          setLoading(false);
          return;
        }
      } catch (error) {
        setErrors({ smsCode: "网络错误，请稍后重试" });
        setLoading(false);
        return;
      }
    }

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
        setTimeout(() => {
          router.push("/auth/login");
        }, 1500);
      } else {
        // 根据错误字段显示
        if (data.field === "smsCode") {
          setErrors({ smsCode: data.message || "密码重置失败" });
        } else {
          setErrors({ account: data.message || "密码重置失败" });
        }
      }
    } catch (error) {
      setErrors({ account: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-4xl grid md:grid-cols-5 gap-0 rounded-[16px] overflow-hidden shadow-2xl bg-white/80 backdrop-blur-xl border border-white/50">
        {/* 左侧品牌区 - 固定 */}
        <div className="hidden md:flex md:col-span-2 flex-col justify-center items-center bg-gradient-to-br from-[#3182ce] to-[#1e3a8a] p-6 text-white relative overflow-hidden">
          {/* 装饰背景 */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-blue-300 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 text-center">
            <div className="w-16 h-16 mb-4 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm mx-auto shadow-lg">
              <svg
                className="w-10 h-10"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.8 1.1 2.8 2.5V11c.6 0 1.2.6 1.2 1.2v3.5c0 .7-.6 1.3-1.2 1.3H9.2c-.6 0-1.2-.6-1.2-1.2v-3.5c0-.7.6-1.3 1.2-1.3V9.5C9.2 8.1 10.6 7 12 7zm0 1c-.8 0-1.5.7-1.5 1.5V11h3V9.5c0-.8-.7-1.5-1.5-1.5zm-1.5 5v3.5h3v-3.5h-3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">知阁·舟坊</h1>
            <p className="text-blue-100 mb-6 text-sm">
              全链路 AI 软件研发效能操作系统
            </p>

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-xs">企业级安全架构</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-xs">AI 智能驱动</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span className="text-xs">全链路提效 300%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="md:col-span-3 p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => router.push("/")}
              className="group flex items-center gap-1.5 text-slate-600 hover:text-[#3182ce] transition-colors text-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              返回首页
            </button>
            <Logo variant="light" />
          </div>

          {/* 进度条 */}
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step >= s
                      ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {step > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-colors ${
                      step > s
                        ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb]"
                        : "bg-slate-200"
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
                  手机号 / 邮箱 / 用户名 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  {accountType === "email" ? (
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  ) : accountType === "phone" ? (
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  ) : (
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  )}
                  <input
                    type="text"
                    value={formData.account}
                    onChange={handleAccountChange}
                    onBlur={handleAccountBlur}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                      errors.account ? "border-red-500" : "border-[#e2e8f0]"
                    }`}
                    placeholder="请输入手机号/邮箱/用户名"
                  />
                </div>
                {errors.account && (
                  <p className="mt-1 text-xs text-red-500">{errors.account}</p>
                )}

                {/* 邮箱自动补全建议 */}
                {showEmailSuggestions && emailSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-[#e2e8f0] rounded-lg shadow-lg">
                    {emailSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleEmailSuggestionClick(suggestion)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-[#f0f8ff] text-slate-700 first:rounded-t-lg last:rounded-b-lg"
                      >
                        <Mail className="inline w-3 h-3 mr-2 text-[#3182ce]" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                {/* 账号状态提示 */}
                {accountCheckStatus.exists === false && (
                  <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <p className="text-xs text-orange-700">
                      ⚠️ 该账号不存在，请
                      <a
                        href="/auth/register"
                        className="text-[#3182ce] hover:underline font-medium"
                      >
                        先注册
                      </a>
                    </p>
                  </div>
                )}
                {accountCheckStatus.locked && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">
                      🔒 账号已锁定，请{accountCheckStatus.minutesRemaining}
                      分钟后再试
                    </p>
                  </div>
                )}
                {accountCheckStatus.disabled && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">
                      ⛔ 账号已被禁用，请联系管理员
                    </p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={
                    !accountCheckStatus.exists ||
                    accountCheckStatus.locked ||
                    accountCheckStatus.disabled
                  }
                  className="w-full mt-4 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-2.5 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    验证码 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={formData.smsCode}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({ ...formData, smsCode: value });
                          if (errors.smsCode) {
                            setErrors({ ...errors, smsCode: undefined });
                          }
                          // 实时验证验证码格式（6 位数字）
                          if (value && !/^\d{0,6}$/.test(value)) {
                            return;
                          }
                          if (value.length > 0 && value.length < 6) {
                            setErrors({
                              ...errors,
                              smsCode: "验证码为 6 位数字",
                            });
                          }
                        }}
                        className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                          errors.smsCode ? "border-red-500" : "border-[#e2e8f0]"
                        }`}
                        placeholder="请输入 6 位验证码"
                        maxLength={6}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={sendSmsCode}
                      disabled={smsCountdown > 0 || loading}
                      className="px-3 py-2.5 bg-[#3182ce] text-white rounded-lg text-xs font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {smsCountdown > 0
                        ? `${smsCountdown}秒后重发`
                        : "获取验证码"}
                    </button>
                  </div>
                  {errors.smsCode && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.smsCode}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 border border-[#e2e8f0] text-slate-700 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-2.5 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all flex items-center justify-center gap-2"
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
                    新密码 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({ ...formData, password: value });
                        if (errors.password) {
                          setErrors({ ...errors, password: undefined });
                        }
                      }}
                      className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                        errors.password ? "border-red-500" : "border-[#e2e8f0]"
                      }`}
                      placeholder="请输入新密码"
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
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    确认密码 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          confirmPassword: value,
                        });
                        // 清空错误状态
                        if (errors.confirmPassword) {
                          setErrors({ ...errors, confirmPassword: undefined });
                        }
                        if (confirmPasswordError) {
                          setConfirmPasswordError(undefined);
                        }
                      }}
                      onBlur={(e) => {
                        // 失焦时验证密码一致性
                        const confirmValue = e.target.value;
                        if (confirmValue && formData.password) {
                          if (formData.password !== confirmValue) {
                            setConfirmPasswordError("两次输入的密码不一致");
                          } else {
                            setConfirmPasswordError(undefined);
                          }
                        }
                      }}
                      className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                        confirmPasswordError || errors.confirmPassword
                          ? "border-red-500"
                          : "border-[#e2e8f0]"
                      }`}
                      placeholder="请再次输入新密码"
                    />
                  </div>
                  {(confirmPasswordError || errors.confirmPassword) && (
                    <p className="mt-1 text-xs text-red-500">
                      {confirmPasswordError || errors.confirmPassword}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 border border-[#e2e8f0] text-slate-700 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-2.5 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          <div className="mt-6 text-center text-xs text-slate-600">
            记得密码了？{" "}
            <Link
              href="/auth/login"
              className="text-[#3182ce] font-medium hover:underline"
            >
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
