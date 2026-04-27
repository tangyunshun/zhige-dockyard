"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  Lock,
  Phone,
  Eye,
  EyeOff,
  User,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Mail,
} from "lucide-react";
import Image from "next/image";
import {
  validateAccount,
  validatePhone,
  validateEmail,
  validateSmsCode,
  getEmailSuggestions,
  getAccountType,
} from "@/lib/validators";

type LoginMethod = "password" | "sms";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // 获取回调参数
  const redirectPath = searchParams.get("redirect") || "/";

  const [formData, setFormData] = useState({
    account: "",
    password: "",
    phone: "",
    smsCode: "",
    captcha: "",
  });

  const [smsCountdown, setSmsCountdown] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [errors, setErrors] = useState<{
    account?: string;
    password?: string;
    phone?: string;
    smsCode?: string;
  }>({});

  // 账号类型和邮箱补全
  const [accountType, setAccountType] = useState<
    "phone" | "email" | "username" | "unknown"
  >("unknown");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  // 账号检测相关状态
  const [accountCheckStatus, setAccountCheckStatus] = useState<{
    exists?: boolean;
    locked?: boolean;
    disabled?: boolean;
    minutesRemaining?: number;
    remainingAttempts?: number;
  }>({});

  // 自动跳转注册倒计时
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(
    null,
  );

  // 使用 useEffect 处理倒计时和跳转，避免在渲染期间调用 router.push
  useEffect(() => {
    if (redirectCountdown === null || redirectCountdown <= 0) return;

    if (redirectCountdown === 1) {
      // 最后 1 秒，执行跳转，带账号参数
      const timer = setTimeout(() => {
        router.push(
          `/auth/register?account=${encodeURIComponent(formData.account)}`,
        );
        setRedirectCountdown(null);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // 倒计时
    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [redirectCountdown, router, formData.account]);

  // 检测账号是否存在
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
        setAccountCheckStatus({
          exists: false,
        });
        // 设置倒计时，由 useEffect 处理跳转
        setRedirectCountdown(5);
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
      // 不显示 toast，保持静默
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
      if (redirectCountdown !== null) {
        setRedirectCountdown(null);
      }
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
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.valid) {
      setErrors({ ...errors, phone: phoneValidation.message });
      return;
    }

    setErrors({ ...errors, phone: undefined });

    if (!showCaptcha) {
      setShowCaptcha(true);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.phone,
          captcha: formData.captcha,
          type: "login",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // 开发环境显示验证码
        if (data.debugCode) {
          toast.showToast(
            "sms-code",
            `验证码已发送：${data.debugCode}`,
            5000, // 显示 5 秒
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
        // 显示错误在对应字段下方
        if (data.field === "phone") {
          setErrors({ phone: data.message || "手机号错误" });
        } else {
          setErrors({ phone: data.message || "发送失败" });
        }
      }
    } catch (error) {
      setErrors({ phone: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  // 微信登录处理
  const handleWechatLogin = () => {
    // 跳转到微信授权页面
    window.location.href = "/api/auth/wechat";
  };

  // QQ 登录处理
  const handleQQLogin = () => {
    // 跳转到 QQ 授权页面
    window.location.href = "/api/auth/qq";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: typeof errors = {};

    if (loginMethod === "password") {
      // 验证账号
      const accountValidation = validateAccount(formData.account);
      if (!accountValidation.valid) {
        newErrors.account = accountValidation.message;
      }
      // 验证密码
      if (!formData.password) {
        newErrors.password = "请输入密码";
      }
    } else {
      // 验证手机号
      const phoneValidation = validatePhone(formData.phone);
      if (!phoneValidation.valid) {
        newErrors.phone = phoneValidation.message;
      }
      // 验证验证码
      const smsCodeValidation = validateSmsCode(formData.smsCode);
      if (!smsCodeValidation.valid) {
        newErrors.smsCode = smsCodeValidation.message;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    // 检查账号是否被锁定
    if (accountCheckStatus.locked) {
      setErrors({
        account: `账号已锁定，请${accountCheckStatus.minutesRemaining}分钟后再试`,
      });
      setLoading(false);
      return;
    }

    // 检查账号是否被禁用
    if (accountCheckStatus.disabled) {
      setErrors({ account: "账号已被禁用，请联系管理员" });
      setLoading(false);
      return;
    }

    try {
      const endpoint =
        loginMethod === "password" ? "/api/auth/login" : "/api/auth/login-sms";

      const payload =
        loginMethod === "password"
          ? {
              account: formData.account,
              password: formData.password,
              rememberMe,
            }
          : { phone: formData.phone, smsCode: formData.smsCode, rememberMe };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.token) {
          document.cookie = `auth_token=${data.token}; path=/; max-age=${rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60}`;
        }
        // 存储 userId 到 localStorage
        if (data.user?.id) {
          localStorage.setItem("userId", data.user.id);
        }
        setTimeout(() => {
          router.push(redirectPath);
        }, 1000);
      } else {
        // 处理各种错误情况，全部显示在输入框下方
        if (data.accountExists === false) {
          // 账号不存在，显示提示并倒计时
          setRedirectCountdown(5);
        } else if (data.remainingAttempts !== undefined) {
          // 密码错误，显示剩余次数
          if (data.remainingAttempts > 0) {
            setErrors({
              password: `${data.message}，剩余${data.remainingAttempts}次尝试机会`,
            });
          } else {
            setErrors({ password: data.message });
          }
        } else if (data.minutesRemaining) {
          // 账号被锁定
          setErrors({
            account: `账号已锁定，请${data.minutesRemaining}分钟后再试`,
          });
        } else if (data.field === "password") {
          // 密码错误
          setErrors({ password: data.message || "密码错误" });
        } else if (data.field === "account") {
          // 账号错误
          setErrors({ account: data.message || "账号错误" });
        } else {
          // 其他错误显示在账号字段
          setErrors({ account: data.message || "登录失败" });
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

          <h2 className="text-xl font-bold text-slate-800 mb-1">欢迎回来</h2>
          <p className="text-slate-600 mb-6 text-sm">请登录您的账号</p>

          <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setLoginMethod("password");
                setErrors({});
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                loginMethod === "password"
                  ? "bg-white text-[#3182ce] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              账号密码
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod("sms");
                setErrors({});
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                loginMethod === "sms"
                  ? "bg-white text-[#3182ce] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              手机号
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginMethod === "password" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    账号 / 邮箱 / 手机号 <span className="text-red-500">*</span>
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
                      placeholder="请输入账号/邮箱/手机号"
                    />
                  </div>
                  {errors.account && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.account}
                    </p>
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
                  {accountCheckStatus.exists === false &&
                    redirectCountdown !== null && (
                      <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                        <p className="text-xs text-orange-700">
                          ⚠️ 该账号未注册，{redirectCountdown}秒后跳转注册页面
                        </p>
                        <button
                          onClick={() => {
                            setRedirectCountdown(null);
                            // 带账号参数跳转到注册页面
                            router.push(
                              `/auth/register?account=${encodeURIComponent(formData.account)}`,
                            );
                          }}
                          className="text-xs text-[#3182ce] hover:underline font-medium"
                        >
                          立即注册 →
                        </button>
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
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    密码 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => {
                        setFormData({ ...formData, password: e.target.value });
                        if (errors.password)
                          setErrors({ ...errors, password: undefined });
                      }}
                      className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                        errors.password ? "border-red-500" : "border-[#e2e8f0]"
                      }`}
                      placeholder="请输入密码"
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
                  <div className="flex justify-between items-center mt-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          rememberMe
                            ? "bg-[#3182ce] border-[#3182ce]"
                            : "border-[#e2e8f0]"
                        }`}
                      >
                        {rememberMe && (
                          <CheckCircle className="w-3 h-3 text-white" />
                        )}
                      </button>
                      <label
                        onClick={() => setRememberMe(!rememberMe)}
                        className="text-xs text-slate-600 cursor-pointer select-none"
                      >
                        记住我
                      </label>
                    </div>
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs text-[#3182ce] hover:underline"
                    >
                      忘记密码？
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    手机号 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({ ...formData, phone: value });
                        if (errors.phone) {
                          setErrors({ ...errors, phone: undefined });
                        }
                        // 实时验证手机号格式
                        if (value && !validatePhone(value).valid) {
                          setErrors({
                            ...errors,
                            phone: validatePhone(value).message,
                          });
                        }
                      }}
                      className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                        errors.phone ? "border-red-500" : "border-[#e2e8f0]"
                      }`}
                      placeholder="请输入 11 位手机号"
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
                  )}
                </div>

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
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-2.5 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <>
                  <span>登录</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* 其他登录方式 */}
          <div className="mt-6 mb-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-4 bg-white text-slate-500 text-sm">
                  其他登录方式
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-8 mb-6">
            <button
              type="button"
              onClick={handleWechatLogin}
              className="transition-all hover:scale-110"
              title="微信扫码登录"
            >
              <Image
                src="/icons/wechat.png"
                alt="微信"
                width={32}
                height={32}
                className="w-8 h-8"
              />
            </button>
            <button
              type="button"
              onClick={handleQQLogin}
              className="transition-all hover:scale-110"
              title="QQ 登录"
            >
              <Image
                src="/icons/QQ.png"
                alt="QQ"
                width={32}
                height={32}
                className="w-8 h-8"
              />
            </button>
          </div>

          <div className="text-center text-sm text-slate-600">
            还没有账号？{" "}
            <Link
              href={`/auth/register${formData.account ? `?account=${encodeURIComponent(formData.account)}` : ""}`}
              className="text-[#3182ce] font-medium hover:underline"
            >
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
