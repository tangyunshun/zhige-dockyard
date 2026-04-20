"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  Phone,
  MessageSquare,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Mail,
  User,
} from "lucide-react";
import {
  validateAccount,
  validatePhone,
  validateSmsCode,
  validatePasswordStrength,
  getEmailSuggestions,
  getAccountType,
} from "@/lib/validators";

// 内部组件用于处理 searchParams
function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // 账号类型：phone | email | username
  const [accountType, setAccountType] = useState<
    "phone" | "email" | "username" | "unknown"
  >("unknown");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  const [formData, setFormData] = useState({
    account: "", // 账号（手机号/邮箱/用户名）
    phone: "", // 仅当账号类型为 username 时需要
    smsCode: "",
    password: "",
    confirmPassword: "",
  });

  // 确认密码验证状态
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>();

  const [smsCountdown, setSmsCountdown] = useState(0);
  const [errors, setErrors] = useState<{
    account?: string;
    phone?: string;
    smsCode?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [passwordStrength, setPasswordStrength] = useState({
    valid: false,
    score: 0,
    requirements: [] as string[],
  });

  // 账号验证状态
  const [accountCheckStatus, setAccountCheckStatus] = useState<{
    registered?: boolean;
    checking?: boolean;
  }>({});

  // 手机号验证状态（独立于账号状态）
  const [phoneCheckStatus, setPhoneCheckStatus] = useState<{
    registered?: boolean;
    checking?: boolean;
  }>({});

  // 从登录页跳转时，获取账号参数
  useEffect(() => {
    const accountParam = searchParams.get("account");
    if (accountParam) {
      setFormData({ ...formData, account: accountParam });
      const type = getAccountType(accountParam);
      setAccountType(type);
      // 自动检测账号是否已注册
      checkAccount(accountParam);
    }
  }, [searchParams]);

  // 检查账号是否已注册
  const checkAccount = async (account: string) => {
    const validation = validateAccount(account);
    if (!validation.valid) {
      setAccountCheckStatus({});
      return;
    }

    setAccountCheckStatus({ checking: true });

    try {
      const res = await fetch("/api/auth/check-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account }),
      });

      const data = await res.json();

      if (data.exists) {
        setAccountCheckStatus({ registered: true, checking: false });
        if (validation.type === "phone") {
          setErrors({ ...errors, account: "该手机号已被注册" });
        } else if (validation.type === "email") {
          setErrors({ ...errors, account: "该邮箱已被注册" });
        } else {
          setErrors({ ...errors, account: "该用户名已被注册" });
        }
      } else {
        setAccountCheckStatus({ registered: false, checking: false });
        setErrors({ ...errors, account: undefined });
      }
    } catch (error) {
      console.error("Account check error:", error);
      setAccountCheckStatus({ checking: false });
    }
  };

  // 检查手机号是否已注册（保留用于用户名注册时的手机号验证）
  const checkPhone = async (phone: string) => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      setPhoneCheckStatus({});
      return;
    }

    setPhoneCheckStatus({ checking: true });

    try {
      const res = await fetch("/api/auth/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (data.registered) {
        setPhoneCheckStatus({ registered: true, checking: false });
        // 不设置 errors.phone，避免与提示框重复
      } else {
        setPhoneCheckStatus({ registered: false, checking: false });
        setErrors({ ...errors, phone: undefined });
      }
    } catch (error) {
      console.error("Phone check error:", error);
      setPhoneCheckStatus({ checking: false });
    }
  };

  // 账号输入处理
  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, account: value });

    // 清空账号检测状态和错误
    if (accountCheckStatus.registered || errors.account) {
      setAccountCheckStatus({});
      setErrors({ ...errors, account: undefined });
    }

    // 验证账号格式并检测类型
    const validation = validateAccount(value);
    if (!validation.valid && value.length > 0) {
      setErrors({ ...errors, account: validation.message });
      return;
    }

    // 判断账号类型
    const type = getAccountType(value);
    setAccountType(type);

    // 如果是手机号，检查是否已注册
    if (type === "phone" && validation.valid) {
      checkAccount(value);
    }

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
      if (validation.valid && validation.type !== "phone") {
        // 邮箱和用户名在失焦时检测
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
    checkAccount(suggestion);
  };

  // 手机号输入处理（仅当账号类型为用户名时使用）
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, phone: value });

    // 清空错误状态
    if (errors.phone || phoneCheckStatus.registered) {
      setErrors({ ...errors, phone: undefined });
      setPhoneCheckStatus({});
    }

    // 实时验证手机号格式
    if (value && !validatePhone(value).valid) {
      setErrors({ ...errors, phone: validatePhone(value).message });
    }
  };

  // 手机号输入框失焦时检测（仅当账号类型为用户名时使用）
  const handlePhoneBlur = () => {
    if (formData.phone && accountType === "username") {
      checkPhone(formData.phone);
    }
  };

  const validatePassword = (password: string) => {
    const result = validatePasswordStrength(password);
    setPasswordStrength({
      valid: result.valid,
      score: result.score,
      requirements: result.requirements,
    });
  };

  const sendSmsCode = async () => {
    // 根据账号类型确定发送验证码的手机号
    let targetPhone = "";

    if (accountType === "phone") {
      targetPhone = formData.account;
    } else if (accountType === "username") {
      targetPhone = formData.phone;
    } else {
      // 邮箱注册，应该发送邮件验证码
      toast.warning("邮箱注册功能开发中");
      return;
    }

    const phoneValidation = validatePhone(targetPhone);
    if (!phoneValidation.valid) {
      setErrors({ ...errors, phone: phoneValidation.message });
      return;
    }

    setErrors({ ...errors, phone: undefined });

    try {
      setLoading(true);
      const res = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: targetPhone,
          type: "register",
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

    const newErrors: typeof errors = {};

    // 验证账号
    const accountValidation = validateAccount(formData.account);
    if (!accountValidation.valid) {
      newErrors.account = accountValidation.message;
    }

    // 检查账号是否已注册
    if (accountCheckStatus.registered) {
      if (accountValidation.type === "phone") {
        newErrors.account = "该手机号已被注册";
      } else if (accountValidation.type === "email") {
        newErrors.account = "该邮箱已被注册";
      } else {
        newErrors.account = "该用户名已被注册";
      }
    }

    // 根据账号类型验证手机号
    if (accountType === "phone") {
      // 手机号注册，不需要额外验证
    } else if (accountType === "username") {
      // 用户名注册，需要验证绑定的手机号
      const phoneValidation = validatePhone(formData.phone);
      if (!phoneValidation.valid) {
        newErrors.phone = phoneValidation.message;
      }
    } else if (accountType === "email") {
      // 邮箱注册，需要验证绑定的手机号
      const phoneValidation = validatePhone(formData.phone);
      if (!phoneValidation.valid) {
        newErrors.phone = phoneValidation.message;
      }
    }

    // 验证验证码
    const smsCodeValidation = validateSmsCode(formData.smsCode);
    if (!smsCodeValidation.valid) {
      newErrors.smsCode = smsCodeValidation.message;
    }

    // 验证密码
    if (!formData.password) {
      newErrors.password = "请输入密码";
    }

    // 验证确认密码（只检查是否为空，一致性已在失焦时验证）
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "请再次输入密码";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (!agreedToTerms) {
      toast.warning("请先同意服务条款和隐私政策");
      return;
    }

    if (!passwordStrength.valid) {
      toast.error("密码强度不足，请满足所有要求");
      return;
    }

    setErrors({});
    setLoading(true);

    // 先验证验证码
    const phoneToVerify =
      accountType === "phone" ? formData.account : formData.phone;
    try {
      const verifyRes = await fetch("/api/auth/verify-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneToVerify,
          smsCode: formData.smsCode,
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        if (verifyData.isLocked) {
          toast.error(
            `验证失败次数过多，请${verifyData.minutesRemaining}分钟后再试`,
          );
        } else if (verifyData.remainingAttempts !== undefined) {
          toast.error(
            `${verifyData.message}，剩余${verifyData.remainingAttempts}次尝试机会`,
          );
        } else {
          toast.error(verifyData.message || "验证失败");
        }
        setLoading(false);
        return;
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
      setLoading(false);
      return;
    }

    try {
      // 根据账号类型构建请求数据
      const requestData: any = {
        smsCode: formData.smsCode,
        password: formData.password,
      };

      if (accountType === "phone") {
        requestData.phone = formData.account;
        requestData.accountType = "phone";
      } else if (accountType === "username") {
        requestData.username = formData.account;
        requestData.phone = formData.phone;
        requestData.accountType = "username";
      } else if (accountType === "email") {
        requestData.email = formData.account;
        requestData.phone = formData.phone;
        requestData.accountType = "email";
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
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

          <h2 className="text-xl font-bold text-slate-800 mb-1">创建账号</h2>
          <p className="text-slate-600 mb-6 text-sm">
            {accountType === "phone" && "使用手机号注册新账号"}
            {accountType === "email" && "使用邮箱注册新账号"}
            {accountType === "username" && "使用用户名注册新账号"}
            {accountType === "unknown" && "使用手机号/邮箱/用户名注册新账号"}
          </p>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* 账号输入框 */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {accountType === "phone"
                  ? "手机号"
                  : accountType === "email"
                    ? "邮箱"
                    : accountType === "username"
                      ? "用户名"
                      : "账号"}{" "}
                <span className="text-red-500">*</span>
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
                  placeholder={
                    accountType === "phone"
                      ? "请输入 11 位手机号"
                      : accountType === "email"
                        ? "请输入邮箱地址"
                        : accountType === "username"
                          ? "请输入用户名（3-20 位字母、数字、@、下划线）"
                          : "请输入手机号/邮箱/用户名"
                  }
                />
                {accountCheckStatus.checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
                  </div>
                )}
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

              {/* 账号已注册提示 */}
              {accountCheckStatus.registered && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">
                    ⚠️ 该账号已被注册，请
                    <Link
                      href="/auth/login"
                      className="text-[#3182ce] hover:underline font-medium"
                    >
                      直接登录
                    </Link>
                  </p>
                </div>
              )}
              {accountCheckStatus.registered === false &&
                formData.account &&
                validateAccount(formData.account).valid && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-700">✅ 该账号可以注册</p>
                  </div>
                )}
            </div>

            {/* 手机号输入框 - 当账号类型为用户名或邮箱时显示 */}
            {(accountType === "username" || accountType === "email") && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {accountType === "email" ? "绑定手机号" : "绑定手机号"} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                      errors.phone ? "border-red-500" : "border-[#e2e8f0]"
                    }`}
                    placeholder="请输入 11 位手机号"
                  />
                  {phoneCheckStatus.checking && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
                )}
                {phoneCheckStatus.registered && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-700">⚠️ 该手机号已被注册</p>
                  </div>
                )}
                {phoneCheckStatus.registered === false &&
                  formData.phone &&
                  validatePhone(formData.phone).valid && (
                    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-xs text-green-700">
                        ✅ 该手机号可以绑定
                      </p>
                    </div>
                  )}
              </div>
            )}

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
                        setErrors({ ...errors, smsCode: "验证码为 6 位数字" });
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
                  {smsCountdown > 0 ? `${smsCountdown}秒后重发` : "获取验证码"}
                </button>
              </div>
              {errors.smsCode && (
                <p className="mt-1 text-xs text-red-500">{errors.smsCode}</p>
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
                    const value = e.target.value;
                    setFormData({ ...formData, password: value });
                    validatePassword(value);
                    if (errors.password) {
                      setErrors({ ...errors, password: undefined });
                    }
                  }}
                  className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                    errors.password ? "border-red-500" : "border-[#e2e8f0]"
                  }`}
                  placeholder="请设置密码"
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
                <p className="mt-1 text-xs text-red-500">{errors.password}</p>
              )}

              {/* 密码强度指示器 */}
              <div className="mt-1.5 space-y-1.5">
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
                  <p className="text-[10px] text-slate-500">
                    还需满足：{passwordStrength.requirements.join("、")}
                  </p>
                )}
              </div>
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
                    setFormData({
                      ...formData,
                      confirmPassword: e.target.value,
                    });
                    // 清空错误状态
                    if (errors.confirmPassword) {
                      setErrors({ ...errors, confirmPassword: undefined });
                    }
                    if (confirmPasswordError) {
                      setConfirmPasswordError(undefined);
                    }
                  }}
                  onBlur={() => {
                    // 失焦时验证密码一致性
                    if (formData.confirmPassword && formData.password) {
                      if (formData.password !== formData.confirmPassword) {
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
                  placeholder="请再次输入密码"
                />
              </div>
              {(confirmPasswordError || errors.confirmPassword) && (
                <p className="mt-1 text-xs text-red-500">
                  {confirmPasswordError || errors.confirmPassword}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                  agreedToTerms
                    ? "bg-[#3182ce] border-[#3182ce]"
                    : "border-[#e2e8f0]"
                }`}
              >
                {agreedToTerms && (
                  <CheckCircle className="w-3 h-3 text-white" />
                )}
              </button>
              <label
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className="text-xs text-slate-600 cursor-pointer select-none"
              >
                我已阅读并同意{" "}
                <Link
                  href="/terms"
                  className="text-[#3182ce] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  服务条款
                </Link>{" "}
                和{" "}
                <Link
                  href="/privacy"
                  className="text-[#3182ce] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  隐私政策
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="w-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white py-2.5 rounded-lg font-medium text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>注册中...</span>
                </>
              ) : (
                <>
                  <span>立即注册</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-600">
            已有账号？{" "}
            <Link
              href="/auth/login"
              className="text-[#3182ce] font-medium hover:underline"
            >
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// 导出包装组件，带 Suspense 边界
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center">
          <div className="text-[#3182ce] text-lg">加载中...</div>
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
