"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  validatePhone,
  validateSmsCode,
  validatePasswordStrength,
  getEmailSuggestions,
  getAccountType,
} from "@/lib/validators";

type Step = 1 | 2 | 3;
type VerificationMethod = "phone" | "email" | null;

interface UserBindInfo {
  hasPhone: boolean;
  hasEmail: boolean;
  phone?: string;
  email?: string;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [smsMessage, setSmsMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    account?: string;
    smsCode?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const [confirmPasswordError, setConfirmPasswordError] = useState<string>();

  const [accountType, setAccountType] = useState<
    "phone" | "email" | "username" | "unknown"
  >("unknown");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);

  const [accountCheckStatus, setAccountCheckStatus] = useState<{
    exists?: boolean;
    locked?: boolean;
    disabled?: boolean;
    minutesRemaining?: number;
  }>({});

  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>(null);
  const [userBindInfo, setUserBindInfo] = useState<UserBindInfo | null>(null);

  const checkAccount = async (account: string) => {
    const validation = validateAccount(account);
    if (!validation.valid) {
      setAccountCheckStatus({});
      return null;
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
        return null;
      } else if (data.status === "locked") {
        setAccountCheckStatus({
          exists: true,
          locked: true,
          minutesRemaining: data.minutesRemaining,
        });
        return null;
      } else if (data.status === "disabled") {
        setAccountCheckStatus({
          exists: true,
          disabled: true,
        });
        return null;
      } else {
        setAccountCheckStatus({ exists: true });
        return data;
      }
    } catch (error) {
      console.error("Account check error:", error);
      return null;
    }
  };

  const checkAccountForReset = async (account: string, type: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/check-account-for-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, accountType: type }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ account: data.message || "验证失败" });
        return;
      }

      if (data.bindInfo) {
        setUserBindInfo(data.bindInfo);
        
        if (data.bindInfo.hasPhone && data.bindInfo.hasEmail) {
          setStep(1.5 as Step);
        } else if (data.bindInfo.hasPhone) {
          setVerificationMethod("phone");
          setFormData(prev => ({ ...prev, phone: data.bindInfo.phone || "" }));
          setStep(2 as Step);
        } else if (data.bindInfo.hasEmail) {
          setVerificationMethod("email");
          setFormData(prev => ({ ...prev, email: data.bindInfo.email || "" }));
          setStep(2 as Step);
        } else {
          setErrors({ account: "该账号未绑定手机号或邮箱，无法找回密码" });
        }
      } else {
        setErrors({ account: "无法获取账号信息" });
      }
    } catch (error) {
      console.error("Check account error:", error);
      setErrors({ account: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const accountParam = searchParams.get("account");
    if (accountParam) {
      const decodedAccount = decodeURIComponent(accountParam);
      setFormData((prev) => ({
        ...prev,
        account: decodedAccount,
      }));
      
      const validation = validateAccount(decodedAccount);
      if (validation.valid) {
        const type = getAccountType(decodedAccount);
        setAccountType(type);
        checkAccount(decodedAccount);
      }
    }
  }, [searchParams]);

  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({ ...formData, account: value });

    if (errors.account) {
      setErrors({ ...errors, account: undefined });
    }

    if (accountCheckStatus.exists === false) {
      setAccountCheckStatus({});
    }

    const validation = validateAccount(value);
    if (!validation.valid && value.length > 0) {
      setErrors({ ...errors, account: validation.message });
    }

    const type = getAccountType(value);
    setAccountType(type);

    if (value.includes("@")) {
      const suggestions = getEmailSuggestions(value);
      setEmailSuggestions(suggestions);
      setShowEmailSuggestions(suggestions.length > 0);
    } else {
      setEmailSuggestions([]);
      setShowEmailSuggestions(false);
    }
  };

  const handleAccountBlur = () => {
    setShowEmailSuggestions(false);
    if (formData.account) {
      const validation = validateAccount(formData.account);
      if (validation.valid) {
        checkAccount(formData.account);
      }
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!formData.account) {
      setErrors({ account: "请输入账号" });
      return;
    }

    const validation = validateAccount(formData.account);
    if (!validation.valid) {
      setErrors({ account: validation.message });
      return;
    }

    if (!accountCheckStatus.exists) {
      const result = await checkAccount(formData.account);
      if (!result) return;
    }

    if (accountCheckStatus.locked) {
      return;
    }

    if (accountCheckStatus.disabled) {
      return;
    }

    await checkAccountForReset(formData.account, accountType);
  };

  const handleSelectVerificationMethod = (method: "phone" | "email") => {
    setVerificationMethod(method);
    setStep(2 as Step);
  };

  const sendVerificationCode = async () => {
    let target = "";
    let type = "";

    if (accountType === "phone") {
      target = formData.account;
      type = "reset-password";
    } else if (accountType === "email") {
      target = formData.account;
      type = "reset-password-email";
    } else if (verificationMethod === "phone") {
      target = formData.phone || "";
      type = "reset-password";
    } else if (verificationMethod === "email") {
      target = formData.email || "";
      type = "reset-password-email";
    }

    if (!target) {
      setErrors({ smsCode: "请输入手机号或邮箱" });
      return;
    }

    if (verificationMethod === "phone" || accountType === "phone") {
      const phoneValidation = validatePhone(target);
      if (!phoneValidation.valid) {
        setErrors({ smsCode: phoneValidation.message });
        return;
      }
    }

    setErrors({ ...errors, smsCode: undefined });
    setSmsMessage(null);

    try {
      setLoading(true);
      
      const apiEndpoint = (verificationMethod === "phone" || accountType === "phone")
        ? "/api/auth/send-sms"
        : "/api/auth/send-email-code";

      const requestBody = (verificationMethod === "phone" || accountType === "phone")
        ? { phone: target, type }
        : { email: target, type };

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (res.ok) {
        setSmsCountdown(60);
        const timer = setInterval(() => {
          setSmsCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              setSmsMessage(null);
              return 0;
            }
            const newCount = prev - 1;
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
        setErrors({ smsCode: data.message || "发送失败" });
      }
    } catch (error) {
      setErrors({ smsCode: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!formData.smsCode) {
      setErrors({ smsCode: "请输入验证码" });
      return;
    }

    const codeValidation = validateSmsCode(formData.smsCode);
    if (!codeValidation.valid) {
      setErrors({ smsCode: codeValidation.message });
      return;
    }

    setLoading(true);
    try {
      const verifyEndpoint = (verificationMethod === "phone" || accountType === "phone")
        ? "/api/auth/verify-sms-code"
        : "/api/auth/verify-email-code";

      const requestBody = (verificationMethod === "phone" || accountType === "phone")
        ? { phone: formData.account, code: formData.smsCode, type: "reset-password" }
        : { email: formData.account, code: formData.smsCode, type: "reset-password-email" };

      const res = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ smsCode: data.message || "验证码错误" });
        return;
      }

      setStep(3 as Step);
    } catch (error) {
      console.error("Verify code error:", error);
      setErrors({ smsCode: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!formData.password) {
      setErrors({ password: "请输入新密码" });
      return;
    }

    const passwordValidation = validatePasswordStrength(formData.password);
    if (!passwordValidation.valid) {
      setErrors({ password: passwordValidation.message });
      return;
    }

    if (!formData.confirmPassword) {
      setErrors({ confirmPassword: "请再次输入新密码" });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrors({ confirmPassword: "两次输入的密码不一致" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: formData.account,
          newPassword: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ password: data.message || "重置密码失败" });
        return;
      }

      toast.success("密码重置成功，即将跳转到登录页");
      setTimeout(() => {
        router.push("/auth/login");
      }, 2000);
    } catch (error) {
      console.error("Reset password error:", error);
      setErrors({ password: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSuggestionClick = (email: string) => {
    setFormData({ ...formData, account: email });
    setShowEmailSuggestions(false);
    setEmailSuggestions([]);
  };

  const renderStepIndicator = () => {
    const steps = [
      { num: 1, label: "验证账号" },
      { num: 2, label: verificationMethod === "phone" || accountType === "phone" ? "短信验证" : "邮箱验证" },
      { num: 3, label: "重置密码" },
    ];

    if (accountType === "username" && step === 1.5) {
      steps.splice(1, 0, { num: 1.5, label: "选择验证方式" });
    }

    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((s, idx) => (
          <div key={s.num} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s.num
                  ? "bg-[#3182ce] text-white"
                  : "bg-[#e2e8f0] text-slate-500"
              }`}
            >
              {s.num}
            </div>
            <span
              className={`ml-2 text-sm ${
                step >= s.num ? "text-[#3182ce]" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <div
                className={`w-12 h-0.5 mx-2 ${
                  step > s.num ? "bg-[#3182ce]" : "bg-[#e2e8f0]"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderStep1 = () => (
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">验证账号</h2>
      <p className="text-sm text-slate-500 mb-6">
        请输入您要找回密码的账号（手机号/邮箱/用户名）
      </p>

      <form onSubmit={handleStep1} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            账号 <span className="text-red-500">*</span>
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

          {accountCheckStatus.exists === false && (
            <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-xs text-orange-700">
                ⚠️ 该账号不存在，请检查输入是否正确
              </p>
            </div>
          )}

          {accountCheckStatus.locked && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700">
                ⚠️ 账号已锁定，请
                {accountCheckStatus.minutesRemaining}分钟后再试
              </p>
            </div>
          )}

          {accountCheckStatus.disabled && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700">
                ⚠️ 账号已被禁用，请联系管理员
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !accountCheckStatus.exists || accountCheckStatus.locked || accountCheckStatus.disabled}
          className="w-full py-2.5 bg-[#3182ce] text-white rounded-lg font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              下一步
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  );

  const renderStep1_5 = () => (
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">选择验证方式</h2>
      <p className="text-sm text-slate-500 mb-6">
        您的账号已绑定多种验证方式，请选择一种进行验证
      </p>

      <div className="space-y-3">
        {userBindInfo?.hasPhone && (
          <button
            onClick={() => handleSelectVerificationMethod("phone")}
            className="w-full p-4 border border-[#e2e8f0] rounded-lg hover:border-[#3182ce] hover:bg-[#f0f8ff] transition-colors flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-[#e6f4f1] rounded-full flex items-center justify-center">
              <Phone className="w-5 h-5 text-[#3182ce]" />
            </div>
            <div className="text-left">
              <p className="font-medium text-slate-800">手机验证</p>
              <p className="text-sm text-slate-500">
                使用绑定的手机号 {userBindInfo.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')} 验证
              </p>
            </div>
          </button>
        )}

        {userBindInfo?.hasEmail && (
          <button
            onClick={() => handleSelectVerificationMethod("email")}
            className="w-full p-4 border border-[#e2e8f0] rounded-lg hover:border-[#3182ce] hover:bg-[#f0f8ff] transition-colors flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-[#e6f4f1] rounded-full flex items-center justify-center">
              <Mail className="w-5 h-5 text-[#3182ce]" />
            </div>
            <div className="text-left">
              <p className="font-medium text-slate-800">邮箱验证</p>
              <p className="text-sm text-slate-500">
                使用绑定的邮箱 {userBindInfo.email?.replace(/(.{2}).+(@.+)/, '$1***$2')} 验证
              </p>
            </div>
          </button>
        )}
      </div>

      <button
        onClick={() => {
          setStep(1 as Step);
          setFormData({ ...formData, account: "" });
          setAccountType("unknown");
          setAccountCheckStatus({});
          setUserBindInfo(null);
        }}
        className="w-full mt-4 py-2.5 border border-[#e2e8f0] text-slate-600 rounded-lg font-medium hover:bg-[#f8fafc] transition-colors flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        返回上一步
      </button>
    </div>
  );

  const renderStep2 = () => {
    const isPhoneVerification = verificationMethod === "phone" || accountType === "phone";
    
    return (
      <div>
        <h2 className="text-xl font-semibold text-slate-800 mb-1">
          {isPhoneVerification ? "短信验证" : "邮箱验证"}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {isPhoneVerification 
            ? `验证码已发送至手机 ${formData.account || formData.phone}`
            : `验证码已发送至邮箱 ${formData.account || formData.email}`
          }
        </p>

        <form onSubmit={handleStep2} className="space-y-4">
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
                onClick={sendVerificationCode}
                disabled={smsCountdown > 0 || loading}
                className="px-3 py-2.5 bg-[#3182ce] text-white rounded-lg text-xs font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {smsCountdown > 0 ? `${smsCountdown}秒后重发` : "获取验证码"}
              </button>
            </div>
            {smsMessage && (
              <p className="mt-1 text-xs text-green-600">{smsMessage}</p>
            )}
            {errors.smsCode && (
              <p className="mt-1 text-xs text-red-500">{errors.smsCode}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || formData.smsCode.length !== 6}
            className="w-full py-2.5 bg-[#3182ce] text-white rounded-lg font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                下一步
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <button
          onClick={() => {
            if (accountType === "username") {
              setStep(1.5 as Step);
            } else {
              setStep(1 as Step);
            }
          }}
          className="w-full mt-3 py-2.5 border border-[#e2e8f0] text-slate-600 rounded-lg font-medium hover:bg-[#f8fafc] transition-colors flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          返回上一步
        </button>
      </div>
    );
  };

  const renderStep3 = () => (
    <div>
      <h2 className="text-xl font-semibold text-slate-800 mb-1">重置密码</h2>
      <p className="text-sm text-slate-500 mb-6">
        请设置您的新密码
      </p>

      <form onSubmit={handleResetPassword} className="space-y-4">
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
                setFormData({ ...formData, password: e.target.value });
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
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-500">{errors.password}</p>
          )}
          {formData.password && !errors.password && (
            <p className="mt-1 text-xs text-green-600">密码格式正确</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            确认新密码 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={formData.confirmPassword}
              onChange={(e) => {
                setFormData({ ...formData, confirmPassword: e.target.value });
                if (confirmPasswordError) {
                  setConfirmPasswordError(undefined);
                }
              }}
              className={`w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
                confirmPasswordError || errors.confirmPassword
                  ? "border-red-500"
                  : "border-[#e2e8f0]"
              }`}
              placeholder="请再次输入新密码"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {(confirmPasswordError || errors.confirmPassword) && (
            <p className="mt-1 text-xs text-red-500">
              {confirmPasswordError || errors.confirmPassword}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !formData.password || !formData.confirmPassword}
          className="w-full py-2.5 bg-[#3182ce] text-white rounded-lg font-medium hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Key className="w-4 h-4" />
              重置密码
            </>
          )}
        </button>
      </form>

      <button
        onClick={() => setStep(2 as Step)}
        className="w-full mt-3 py-2.5 border border-[#e2e8f0] text-slate-600 rounded-lg font-medium hover:bg-[#f8fafc] transition-colors flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        返回上一步
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Logo />
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {renderStepIndicator()}
          
          {step === 1 && renderStep1()}
          {step === 1.5 && renderStep1_5()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        <div className="text-center mt-6">
          <Link
            href="/auth/login"
            className="text-sm text-slate-600 hover:text-[#3182ce] flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" />
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
