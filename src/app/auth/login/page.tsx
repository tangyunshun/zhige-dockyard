"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import {
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  User,
  MessageSquare,
  QrCode,
  MessageCircle,
  Check,
  ArrowRight,
  Shield,
} from "lucide-react";

type LoginMethod = "password" | "sms";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("password");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [formData, setFormData] = useState({
    account: "",
    password: "",
    phone: "",
    smsCode: "",
    captcha: "",
  });

  const [smsCountdown, setSmsCountdown] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);

  const sendSmsCode = async () => {
    if (!formData.phone || !/^1[3-9]\d{9}$/.test(formData.phone)) {
      toast.warning("请输入正确的手机号");
      return;
    }

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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
        toast.success("登录成功，正在跳转...");
        if (data.token) {
          document.cookie = `auth_token=${data.token}; path=/; max-age=${rememberMe ? 7 * 24 * 60 * 60 : 24 * 60 * 60}`;
        }
        setTimeout(() => {
          router.push("/");
        }, 1000);
      } else {
        toast.error(data.message || "登录失败");
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
        {/* 左侧品牌区 - 缩小尺寸 */}
        <div className="hidden md:flex md:col-span-2 flex-col justify-center items-center bg-gradient-to-br from-[var(--zhige-primary)] to-[#1e3a8a] p-6 text-white relative overflow-hidden">
          {/* 装饰背景 */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-40 h-40 bg-blue-300 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 text-center">
            <div className="w-16 h-16 mb-4 bg-white/10 rounded-[var(--radius-card)] flex items-center justify-center backdrop-blur-sm mx-auto">
              <Shield className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold mb-2">知阁·舟坊</h1>
            <p className="text-blue-100 mb-6 text-sm">
              全链路 AI 软件研发效能操作系统
            </p>

            {/* 特性列表 - 精简 */}
            <div className="space-y-3 text-left">
              <div className="flex items-center gap-2 bg-white/10 rounded-[var(--radius-btn)] px-3 py-2 backdrop-blur-sm">
                <Check className="w-4 h-4 text-green-300" />
                <span className="text-xs">企业级安全架构</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-[var(--radius-btn)] px-3 py-2 backdrop-blur-sm">
                <Check className="w-4 h-4 text-green-300" />
                <span className="text-xs">AI 智能驱动</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 rounded-[var(--radius-btn)] px-3 py-2 backdrop-blur-sm">
                <Check className="w-4 h-4 text-green-300" />
                <span className="text-xs">全链路提效 300%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="md:col-span-3 p-6 md:p-8">
          {/* Logo */}
          <div className="mb-6">
            <Logo variant="light" />
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-1">欢迎回来</h2>
          <p className="text-slate-600 mb-6 text-sm">请登录您的账号</p>

          {/* 登录方式切换 - 更紧凑 */}
          <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-[var(--radius-btn)]">
            <button
              onClick={() => setLoginMethod("password")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-btn)] transition-colors ${
                loginMethod === "password"
                  ? "bg-white text-[var(--zhige-primary)] shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              账号密码
            </button>
            <button
              onClick={() => setLoginMethod("sms")}
              className={`flex-1 py-1.5 text-xs font-medium rounded-[var(--radius-btn)] transition-colors ${
                loginMethod === "sms"
                  ? "bg-white text-[var(--zhige-primary)] shadow-sm"
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
                    账号 / 邮箱 / 手机号
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.account}
                      onChange={(e) =>
                        setFormData({ ...formData, account: e.target.value })
                      }
                      className="w-full pl-9 pr-4 py-2.5 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] text-sm focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入账号"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    密码
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
                      placeholder="请输入密码"
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
                  <div className="flex justify-end mt-1.5">
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs text-[var(--zhige-primary)] hover:underline"
                    >
                      忘记密码？
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      rememberMe
                        ? "bg-[var(--zhige-primary)] border-[var(--zhige-primary)]"
                        : "border-[var(--zhige-border)]"
                    }`}
                  >
                    {rememberMe && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <label
                    onClick={() => setRememberMe(!rememberMe)}
                    className="text-xs text-slate-600 cursor-pointer select-none"
                  >
                    记住我
                  </label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    手机号
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full pl-9 pr-4 py-2.5 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] text-sm focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入手机号"
                      required
                    />
                  </div>
                </div>

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
                        placeholder="请输入验证码"
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
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--zhige-primary)] text-white py-2.5 rounded-[var(--radius-btn)] font-medium text-sm hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          {/* 分割线 */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--zhige-border)]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-slate-500">其他登录方式</span>
            </div>
          </div>

          {/* 第三方登录 - 更紧凑 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 py-2 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] hover:bg-slate-50 transition-colors"
            >
              <QrCode className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-medium text-slate-600">
                扫码登录
              </span>
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 py-2 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] hover:bg-slate-50 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-slate-600">
                微信登录
              </span>
            </button>
          </div>

          {/* 注册链接 */}
          <div className="mt-5 text-center text-xs text-slate-600">
            还没有账号？{" "}
            <Link
              href="/auth/register"
              className="text-[var(--zhige-primary)] font-medium hover:underline"
            >
              立即注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
