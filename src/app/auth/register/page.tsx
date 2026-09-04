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
  Check,
} from "lucide-react";
import Image from "next/image";
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
  // 系统全局公开配置（包含第三方联合登录状态与站点标识）
  const [publicConfig, setPublicConfig] = useState<{
    siteName: string;
    logo: string;
    description: string;
    oauth: {
      github: { enabled: boolean };
      wechat: { enabled: boolean };
      channels?: Array<{
        id: string;
        type: string;
        name: string;
        enabled: boolean;
        clientId?: string;
      }>;
    };
  }>({
    siteName: "知阁·舟坊",
    logo: "/logo.png",
    description: "全链路软件研发效能操作系统",
    oauth: {
      github: { enabled: false },
      wechat: { enabled: false },
      channels: [],
    },
  });
  const [logoError, setLogoError] = useState(false);

  // 加载系统公开全局配置
  useEffect(() => {
    fetch("/api/system/public-config")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setPublicConfig((prev) => ({
            ...prev,
            siteName: data.siteName || prev.siteName,
            logo: data.logo || prev.logo,
            description: data.description || prev.description,
            oauth: data.oauth || prev.oauth,
          }));
        }
      })
      .catch((err) => console.warn("获取公共系统配置异常:", err));
  }, []);

  // 监听 OAuth 错误提示
  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "github_disabled") {
      toast.warning("系统暂未开启 GitHub 快捷注册通道");
    } else if (error === "wechat_disabled") {
      toast.warning("系统暂未开启微信快捷注册通道");
    } else if (error === "github_login_failed" || error === "github_callback_error") {
      toast.error("GitHub 授权注册失败，请重试");
    } else if (error === "wechat_login_failed" || error === "wechat_callback_invalid") {
      toast.error("微信授权注册失败，请重试");
    }
  }, [searchParams]);

  // 服务条款与隐私政策弹窗状态
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentModalCategory, setDocumentModalCategory] = useState<"terms" | "privacy" | null>(null);
  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);

  const openDocumentModal = async (category: "terms-of-service" | "privacy-policy") => {
    setDocumentModalCategory(category === "terms-of-service" ? "terms" : "privacy");
    setShowDocumentModal(true);
    setDocumentContent(null);
    setDocumentLoading(true);
    try {
      const res = await fetch(`/api/system-documents?category=${category}`);
      const data = await res.json();
      if (res.ok) {
        setDocumentContent(data.data?.content || "暂无内容");
      } else {
        setDocumentContent(`加载文档失败: ${data.details || data.error || "未知原因"}`);
      }
    } catch (err: any) {
      setDocumentContent(`网络请求错误: ${err.message || String(err)}`);
    } finally {
      setDocumentLoading(false);
    }
  };

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
  // 验证码发送提示
  const [smsMessage, setSmsMessage] = useState<string | null>(null);
  // 验证码是否已发送
  const [smsCodeSent, setSmsCodeSent] = useState(false);
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

    // 防错状态重置
    if (smsCodeSent || smsCountdown > 0) {
      setSmsCodeSent(false);
      setSmsCountdown(0);
      setSmsMessage(null);
      setErrors((prev) => ({ ...prev, smsCode: undefined }));
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
        // 邮箱和用户名在失焦时检测是否已注册
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

    // 防错状态重置
    if (smsCodeSent || smsCountdown > 0) {
      setSmsCodeSent(false);
      setSmsCountdown(0);
      setSmsMessage(null);
      setErrors((prev) => ({ ...prev, smsCode: undefined }));
    }
  };

  // 手机号输入框失焦时检测（仅当账号类型为用户名时使用）
  const handlePhoneBlur = () => {
    if (formData.phone && accountType === "username") {
      const validation = validatePhone(formData.phone);
      if (!validation.valid) {
        setErrors({ ...errors, phone: validation.message });
      }
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
    // 防止重复点击（如果正在发送或倒计时中）
    if (smsCountdown > 0 || loading) {
      return;
    }

    // 根据账号类型确定发送验证码的手机号
    let targetPhone = "";

    if (accountType === "phone") {
      targetPhone = formData.account;
    } else if (accountType === "username") {
      targetPhone = formData.phone;
    } else {
      // 邮箱注册，应该发送邮件验证码
      setErrors({ account: "邮箱注册功能开发中" });
      return;
    }

    const phoneValidation = validatePhone(targetPhone);
    if (!phoneValidation.valid) {
      setErrors({
        ...(accountType === "phone"
          ? { account: phoneValidation.message }
          : { phone: phoneValidation.message }),
      });
      return;
    }

    setErrors({
      ...(accountType === "phone"
        ? { account: undefined }
        : { phone: undefined }),
    });
    setSmsMessage(null); // 清除旧的消息
    setLoading(true); // 设置加载状态

    try {
      const res = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: targetPhone,
          type: "register",
        }),
      });

      const data = await res.json();

      console.log("注册 API 响应:", res.status, data);

      if (res.ok) {
        setSmsCountdown(60);
        setSmsCodeSent(true); // 标记验证码已发送
        const timer = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              setSmsMessage(null); // 倒计时结束时清除消息
              return 0;
            }
            const newCount = prev - 1;
            // 实时更新提示消息
            if (data.debugCode) {
              setSmsMessage(
                `验证码已发送：${data.debugCode}，${newCount}秒后可重新发送`,
              );
            } else {
              setSmsMessage(`验证码已发送，${newCount}秒后可重新发送`);
            }
            return newCount;
          });
        }, 1000);
      } else {
        // 显示错误在对应字段下方
        if (data.field === "phone") {
          setErrors({
            ...(accountType === "phone"
              ? { account: data.message }
              : { phone: data.message }),
          });
        } else {
          setErrors({
            ...(accountType === "phone"
              ? { account: data.message }
              : { phone: data.message }),
          });
        }
      }
    } catch (error) {
      setErrors({
        ...(accountType === "phone"
          ? { account: "网络错误，请稍后重试" }
          : { phone: "网络错误，请稍后重试" }),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("注册表单提交，smsCodeSent:", smsCodeSent);
    console.log("表单数据:", formData);

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

    // 验证验证码 - 先检查是否已发送，再检查格式
    // 检查验证码是否已发送（优先检查）
    console.log("检查 smsCodeSent:", smsCodeSent);
    if (!smsCodeSent) {
      console.log("smsCodeSent 为 false，显示'请先获取验证码'");
      newErrors.smsCode = "请先获取验证码";
    } else {
      console.log("smsCodeSent 为 true，继续验证格式");
      // 如果已发送，再验证格式
      const smsCodeValidation = validateSmsCode(formData.smsCode);
      if (!smsCodeValidation.valid) {
        newErrors.smsCode = smsCodeValidation.message;
      }
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
      setErrors({ account: "请先同意服务条款和隐私政策" });
      return;
    }

    if (!passwordStrength.valid) {
      setErrors({ password: "密码强度不足，请满足所有要求" });
      return;
    }

    setErrors({});
    setLoading(true);

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

      console.log("注册 API 响应:", res.status, data);

      if (res.ok) {
        // 彻底清除可能残留的旧登录凭证与 Cookie，确保状态绝对纯净
        localStorage.removeItem("auth_token");
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        sessionStorage.removeItem("hasActiveSession");

        // 显式清理响应 Cookie 残留
        document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        document.cookie = "userId=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

        const message = "注册成功，请使用新账号登录！";
        toast.success(message, 1200);

        setTimeout(() => {
          // 如果有 redirect 参数（如协同邀请链路），透传给登录页
          const redirectParam = searchParams.get("redirect");
          const loginUrl = redirectParam
            ? `/auth/login?redirect=${encodeURIComponent(redirectParam)}`
            : "/auth/login";
          router.push(loginUrl);
        }, 1000);
      } else {
        console.log("注册失败，错误数据:", data);
        // 根据错误字段显示
        if (data.field === "phone") {
          setErrors({ phone: data.message || "注册失败" });
        } else if (data.field === "account") {
          setErrors({ account: data.message || "注册失败" });
        } else if (data.field === "smsCode") {
          setErrors({ smsCode: data.message || "注册失败" });
        } else {
          setErrors({ account: data.message || "注册失败" });
        }
      }
    } catch (error) {
      setErrors({ account: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] flex items-center justify-center p-4 overflow-hidden relative"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.08) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="w-full max-w-4xl grid md:grid-cols-5 gap-0 rounded-[24px] overflow-hidden shadow-2xl bg-white/80 backdrop-blur-xl border border-white/50 relative z-10">
        {/* 左侧品牌区 - 固定 */}
        <div className="hidden md:flex md:col-span-2 flex-col justify-center items-center bg-gradient-to-br from-[#3182ce] to-[#1a365d] p-6 text-white relative overflow-hidden">
          {/* 装饰背景 */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-[#63b3ed] rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 text-center">
            <div className="w-16 h-16 mb-4 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm mx-auto shadow-lg overflow-hidden p-2">
              {publicConfig.logo && !logoError ? (
                <img
                  src={publicConfig.logo}
                  alt={publicConfig.siteName}
                  className="w-full h-full object-contain"
                  onError={() => {
                    setLogoError(true);
                  }}
                />
              ) : (
                <svg
                  className="w-10 h-10 transition-transform duration-300 hover:scale-105"
                  viewBox="10 10 180 190"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="regLogoGradPrimary" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="100%" stopColor="#bfdbfe" />
                    </linearGradient>
                    <linearGradient id="regLogoGradLight" x1="200" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#93c5fd" />
                      <stop offset="100%" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                  <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#regLogoGradPrimary)" />
                  <path d="M25 155 L100 195 L175 155 L100 105 Z" fill="#3b82f6" opacity={0.8} />
                  <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#regLogoGradLight)" />
                  <circle cx="100" cy="105" r="14" fill="#1e3a8a" />
                  <circle cx="100" cy="105" r="6" fill="#ffffff" />
                </svg>
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">{publicConfig.siteName || "知阁·舟坊"}</h1>
            <p className="text-blue-100 mb-6 text-sm">
              {publicConfig.description || "全链路软件研发效能操作系统"}
            </p>

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span className="text-xs">企业级安全架构</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
                <span className="text-xs">自动化驱动</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
                <CheckCircle className="w-4 h-4 text-emerald-300" />
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

          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">创建账号</h2>
              <p className="text-slate-600 text-sm">
                {accountType === "phone" && "使用手机号注册新账号"}
                {accountType === "email" && "使用邮箱注册新账号"}
                {accountType === "username" && "使用用户名注册新账号"}
                {accountType === "unknown" && "使用手机号/邮箱/用户名注册新账号"}
              </p>
            </div>
          </div>

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
                  className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${
                    errors.account ? "border-red-500" : "border-[#e2e8f0]"
                  }`}
                  placeholder={
                    accountType === "phone"
                      ? "请输入手机号"
                      : accountType === "email"
                        ? "请输入邮箱地址"
                        : accountType === "username"
                          ? "请输入用户名（3-20 位字母、数字、@、#、-、下划线）"
                          : "请输入手机号/邮箱/用户名"
                  }
                />
                {accountCheckStatus.checking && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {errors.account && !accountCheckStatus.registered && (
                <p className="mt-1 text-xs text-red-500">{errors.account}</p>
              )}

              {/* 邮箱自动补全建议 */}
              {showEmailSuggestions && emailSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl pointer-events-auto overflow-hidden">
                  {emailSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleEmailSuggestionClick(suggestion)}
                      className="w-full px-4 py-2.5 text-left text-xs hover:bg-[#f0f8ff] text-slate-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Mail className="inline w-3.5 h-3.5 text-[#3182ce]" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {/* 账号已注册提示 */}
              {accountCheckStatus.registered && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600">
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
                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-xs text-emerald-600">✅ 该账号可以注册</p>
                  </div>
                )}
            </div>

            {/* 手机号输入框 - 当账号类型为用户名或邮箱时显示 */}
            {(accountType === "username" || accountType === "email") && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {accountType === "email" ? "绑定手机号" : "绑定手机号"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    onBlur={handlePhoneBlur}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${
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
                {errors.phone && !phoneCheckStatus.registered && (
                  <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
                )}
                {phoneCheckStatus.registered && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-600">⚠️ 该手机号已被注册</p>
                  </div>
                )}
                {phoneCheckStatus.registered === false &&
                  formData.phone &&
                  validatePhone(formData.phone).valid && (
                    <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-xs text-emerald-600">
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
                      // 如果验证码已发送，清除"请先获取验证码"的错误
                      if (smsCodeSent && errors.smsCode === "请先获取验证码") {
                        setErrors({ ...errors, smsCode: undefined });
                      }
                    }}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${
                      errors.smsCode ? "border-red-500" : "border-[#e2e8f0]"
                    }`}
                    placeholder="请输入 6 位验证码"
                    maxLength={6}
                  />
                </div>
                <button
                  type="button"
                  onClick={sendSmsCode}
                  disabled={smsCountdown > 0}
                  className="px-4 py-2.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl text-xs font-black hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                >
                  {smsCountdown > 0 ? `${smsCountdown}秒后重发` : "获取验证码"}
                </button>
              </div>
              {smsMessage && (
                <p className="mt-1 text-xs text-emerald-600">{smsMessage}</p>
              )}
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
                  className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${
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
                      className={`flex-1 h-1.5 rounded-full transition-all duration-300 ease-in-out ${
                        level <= passwordStrength.score
                          ? passwordStrength.score === 5
                            ? "bg-emerald-500"
                            : level <= 2
                              ? "bg-red-500"
                              : level <= 4
                                ? "bg-amber-500"
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
                  className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-200 ease-in-out ${
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
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setAgreedToTerms(!agreedToTerms);
                  }
                }}
                className={`mt-0.5 w-4 h-4 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 ${
                  agreedToTerms
                    ? "bg-[#3182ce] border-[#3182ce]"
                    : "border-[#e2e8f0]"
                }`}
              >
                {agreedToTerms && (
                  <Check className="w-3 h-3 text-white" />
                )}
              </button>
              <label
                onClick={() => setAgreedToTerms(!agreedToTerms)}
                className="text-xs text-slate-600 cursor-pointer select-none font-bold"
              >
                我已阅读并同意{" "}
                <span
                  className="text-[#3182ce] hover:underline font-bold cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDocumentModal("terms-of-service");
                  }}
                >
                  服务条款
                </span>{" "}
                和{" "}
                <span
                  className="text-[#3182ce] hover:underline font-bold cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDocumentModal("privacy-policy");
                  }}
                >
                  隐私协议
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreedToTerms}
              className="w-full bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white py-3 rounded-xl font-black text-sm hover:shadow-lg hover:shadow-[#3182ce]/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="font-black">注册中...</span>
                </>
              ) : (
                <>
                  <span className="font-black">立即注册</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* 第三方联合注册/登录：后台开启时动态渲染 */}
          {(() => {
            const activeChannels =
              publicConfig.oauth?.channels && publicConfig.oauth.channels.length > 0
                ? publicConfig.oauth.channels.filter((c) => c.enabled)
                : [
                    ...(publicConfig.oauth?.github?.enabled
                      ? [{ id: "github", type: "github", name: "GitHub 快捷注册" }]
                      : []),
                    ...(publicConfig.oauth?.wechat?.enabled
                      ? [{ id: "wechat", type: "wechat", name: "微信扫码注册" }]
                      : []),
                  ];

            if (activeChannels.length === 0) return null;

            return (
              <div className="mt-6 mb-4">
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-4 bg-white text-slate-500 text-xs font-medium">
                      第三方账号快捷注册 / 登录
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {activeChannels.map((channel) => {
                    const handleChannelClick = () => {
                      if (channel.type === "github" || channel.id === "github") {
                        window.location.href = "/api/auth/github";
                      } else if (channel.type === "wechat" || channel.id === "wechat") {
                        window.location.href = "/api/auth/wechat";
                      } else {
                        toast.info(`正在调起【${channel.name}】第三方联合注册通道...`);
                      }
                    };

                    const renderIcon = () => {
                      if (channel.type === "github" || channel.id === "github") {
                        return (
                          <svg className="w-5 h-5 text-slate-800 group-hover:text-black transition-colors" viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                          </svg>
                        );
                      }
                      if (channel.type === "wechat" || channel.id === "wechat") {
                        return (
                          <Image
                            src="/icons/wechat.png"
                            alt="微信"
                            width={20}
                            height={20}
                            className="w-5 h-5"
                          />
                        );
                      }
                      if (channel.type === "qq") {
                        return (
                          <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-black">
                            QQ
                          </div>
                        );
                      }
                      if (channel.type === "gitee") {
                        return (
                          <div className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black">
                            G
                          </div>
                        );
                      }
                      if (channel.type === "google") {
                        return (
                          <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">
                            G+
                          </div>
                        );
                      }
                      if (channel.type === "feishu") {
                        return (
                          <div className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] font-black">
                            飞
                          </div>
                        );
                      }
                      return (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                          {channel.name.slice(0, 1)}
                        </div>
                      );
                    };

                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={handleChannelClick}
                        className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 hover:border-slate-800 rounded-xl transition-all hover:scale-105 bg-white shadow-2xs group cursor-pointer"
                        title={channel.name}
                      >
                        {renderIcon()}
                        <span className="text-xs font-semibold text-slate-700">
                          {channel.name.replace(/开发者授权登录|开放平台扫码登录|互联快捷登录|联合登录|企业扫码登录/g, "").trim() || channel.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="mt-6 text-center text-xs text-slate-600">
            已有账号？{" "}
            <Link
              href={`/auth/login${searchParams.get("redirect") ? `?redirect=${encodeURIComponent(searchParams.get("redirect")!)}` : ""}`}
              className="text-[#3182ce] font-medium hover:underline"
            >
              立即登录
            </Link>
          </div>
        </div>
      </div>

      {/* 条款与协议弹窗 (SaaS大厂风范，无需离开注册页面) */}
      {showDocumentModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col animate-scaleUp overflow-hidden">
            {/* 头部 */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-[#3182ce]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {documentModalCategory === "terms" ? "服务条款" : "隐私协议"}
              </h3>
              <button
                onClick={() => {
                  setShowDocumentModal(false);
                  setDocumentModalCategory(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 内容区 */}
            <div className="p-6 overflow-y-auto flex-1 leading-relaxed zg-scrollbar">
              {documentLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="w-10 h-10 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin"></div>
                  <p className="text-xs text-slate-400 font-medium animate-pulse">正在加载条款内容...</p>
                </div>
              ) : (
                <div className="prose prose-slate max-w-none space-y-1 text-left">
                  {(() => {
                    if (!documentContent) return null;
                    const lines = documentContent.split("\n");
                    return lines.map((line, idx) => {
                      const trimmed = line.trim();
                      if (!trimmed) return null; // 物理消除空行过大间距

                      // 大标题
                      if (trimmed.startsWith("“知阁·舟坊”")) {
                        return <h1 key={idx} className="text-sm font-black text-slate-900 pb-1.5 border-b border-slate-200 mb-2">{trimmed}</h1>;
                      }
                      // 章节标题 (紧凑高密度)
                      if (/^第[一二三四五六七八九十]+章/.test(trimmed)) {
                        return (
                          <h2 key={idx} className="text-xs font-black text-[#2b6cb0] mt-3 mb-1 flex items-center gap-1.5 bg-blue-50/80 px-2.5 py-1 rounded-md border-l-3 border-[#3182ce]">
                            {trimmed}
                          </h2>
                        );
                      }
                      // 版本与时间标记
                      if (trimmed.startsWith("【版本号】") || trimmed.startsWith("【更新日期】") || trimmed.startsWith("【生效日期】")) {
                        return <span key={idx} className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded inline-block mr-1.5 mb-1">{trimmed}</span>;
                      }
                      // 【重点关注/警告/着重高亮色区块】
                      if (trimmed.includes("【核心提示") || trimmed.includes("【严禁红线】") || trimmed.includes("【违规处理") || trimmed.includes("【重要提示】")) {
                        return (
                          <div key={idx} className="bg-amber-50/90 text-amber-900 border-l-4 border-amber-500 font-bold p-2.5 rounded-r-lg text-xs leading-relaxed my-1.5 shadow-2xs">
                            <span className="inline-block mr-1">⚠️</span> {trimmed}
                          </div>
                        );
                      }
                      // 【用户权益/安全保障/数据保密着重色区块】
                      if (trimmed.includes("【用户成果所有权】") || trimmed.includes("【AI 生成内容权利归属】") || trimmed.includes("【数据保密承诺】") || trimmed.includes("【账号安全") || trimmed.includes("【数据保留")) {
                        return (
                          <div key={idx} className="bg-blue-50/90 text-blue-900 border-l-4 border-blue-500 font-bold p-2.5 rounded-r-lg text-xs leading-relaxed my-1.5 shadow-2xs">
                            <span className="inline-block mr-1">🛡️</span> {trimmed}
                          </div>
                        );
                      }

                      // 普通段落 (字号紧凑排版)
                      return (
                        <p key={idx} className="text-xs text-slate-700 leading-snug font-medium mb-1">
                          {trimmed}
                        </p>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 bg-slate-50/50">
              <button
                onClick={() => {
                  setShowDocumentModal(false);
                  setDocumentModalCategory(null);
                }}
                className="zg-btn px-6 py-2 text-xs font-black bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white hover:shadow-md hover:shadow-[#3182ce]/15 transition-all rounded-lg cursor-pointer"
              >
                我已阅读并关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 导出包装组件，带 Suspense 边界
export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] flex items-center justify-center">
          <div className="text-[#3182ce] text-lg">加载中...</div>
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
