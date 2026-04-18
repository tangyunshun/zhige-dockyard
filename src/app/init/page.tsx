"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useToast } from "@/components/Toast";
import { Shield, User, Mail, Phone, Lock, Eye, EyeOff, ArrowRight, CheckCircle } from "lucide-react";

export default function InitWizard() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    setupToken: "",
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

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

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-setup-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: formData.setupToken }),
      });

      const data = await res.json();

      if (res.ok) {
        setStep(2);
        toast.success("安装令牌验证通过，请创建创世管理员账号");
      } else {
        toast.error(data.message || "安装令牌无效");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const res = await fetch("/api/auth/init-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setStep(3);
        toast.success("创世管理员账号创建成功！");
      } else {
        toast.error(data.message || "创建失败，请重试");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-[var(--radius-card)] shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
              系统初始化完成！
            </h2>
            <p className="text-slate-600 mb-8">
              创世管理员账号已创建，即将跳转到登录页面
            </p>
            <div className="flex items-center justify-center gap-2 text-[var(--zhige-primary)]">
              <span className="text-sm">正在跳转...</span>
              <ArrowRight className="w-4 h-4 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8">
        {/* 左侧品牌区 */}
        <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-[var(--zhige-primary)] to-[#1e3a8a] rounded-[var(--radius-card)] p-8 text-white shadow-2xl">
          <div className="w-24 h-24 mb-6 bg-white/10 rounded-[var(--radius-card)] flex items-center justify-center backdrop-blur-sm">
            <Shield className="w-14 h-14" />
          </div>
          <h1 className="text-3xl font-bold mb-4 text-center">
            知阁·舟坊
          </h1>
          <p className="text-blue-100 text-center mb-8">
            全链路 AI 软件研发效能操作系统
          </p>
          <div className="space-y-3 w-full">
            <div className="flex items-center gap-3 bg-white/10 rounded-[var(--radius-btn)] px-4 py-3 backdrop-blur-sm">
              <CheckCircle className="w-5 h-5 text-green-300" />
              <span className="text-sm">企业级安全架构</span>
            </div>
            <div className="flex items-center gap-3 bg-white/10 rounded-[var(--radius-btn)] px-4 py-3 backdrop-blur-sm">
              <CheckCircle className="w-5 h-5 text-green-300" />
              <span className="text-sm">全链路效能提升</span>
            </div>
            <div className="flex items-center gap-3 bg-white/10 rounded-[var(--radius-btn)] px-4 py-3 backdrop-blur-sm">
              <CheckCircle className="w-5 h-5 text-green-300" />
              <span className="text-sm">AI 智能驱动</span>
            </div>
          </div>
        </div>

        {/* 右侧表单区 */}
        <div className="bg-white rounded-[var(--radius-card)] shadow-xl p-8">
          <div className="mb-8">
            <Logo variant="light" />
          </div>

          {step === 1 ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">
                  系统初始化安装
                </h2>
                <p className="text-slate-600 text-sm">
                  请输入服务器配置的安装令牌以继续
                </p>
              </div>

              <form onSubmit={handleTokenSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    安装令牌 (SETUP_TOKEN)
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={formData.setupToken}
                      onChange={(e) =>
                        setFormData({ ...formData, setupToken: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入安装令牌"
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
                      <span>验证中...</span>
                    </>
                  ) : (
                    <>
                      <span>验证令牌</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">
                  创建创世管理员
                </h2>
                <p className="text-slate-600 text-sm">
                  配置系统第一个超级管理员账号
                </p>
              </div>

              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    姓名 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入姓名"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    邮箱 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请输入邮箱"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    手机号
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
                      placeholder="请输入手机号（选填）"
                    />
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
                      placeholder="请输入密码"
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
                        setFormData({ ...formData, confirmPassword: e.target.value })
                      }
                      className="w-full pl-10 pr-4 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] focus:border-[var(--zhige-primary)] focus:ring-2 focus:ring-[var(--zhige-primary)]/20 outline-none transition-all"
                      placeholder="请再次输入密码"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 border border-[var(--zhige-border)] rounded-[var(--radius-btn)] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !passwordStrength.valid}
                    className="flex-1 bg-[var(--zhige-primary)] text-white py-3 rounded-[var(--radius-btn)] font-semibold hover:bg-[#2b6cb0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>创建中...</span>
                      </>
                    ) : (
                      <>
                        <span>创建管理员</span>
                        <CheckCircle className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
