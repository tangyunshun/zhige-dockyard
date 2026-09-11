"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Lock,
  Key,
  Shield,
  CheckCircle,
  Eye,
  EyeOff,
  LogIn,
  Monitor,
  Smartphone,
  Globe,
  MapPin,
  Clock,
  AlertTriangle,
  Tablet,
  Trash2,
  X,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  BellRing,
  CheckCircle2,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface LoginHistory {
  id: string;
  ipAddress: string;
  userAgent: string;
  location: string;
  device: string;
  loginAt: string;
}

interface UserSecurityProfile {
  email?: string | null;
  phone?: string | null;
  passwordChangedAt?: string | null;
}

/**
 * 友好客户端 IP 解析与格式化工具
 * 彻底杜绝原始 ::1 暴露，本地地址友好展示为 127.0.0.1 (本地局域网 / 本机)
 */
function formatFriendlyIp(rawIp?: string | null): { ip: string; note: string } {
  if (!rawIp || rawIp === "unknown") return { ip: "127.0.0.1", note: "本地局域网" };
  let ip = rawIp.trim();
  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }
  if (ip === "::1" || ip === "127.0.0.1" || ip === "localhost") {
    return { ip: "127.0.0.1", note: "本地局域网 / 本机" };
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(ip)) {
    return { ip, note: "内网专线" };
  }
  return { ip, note: "公网接入" };
}

export default function UserSecurityPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<UserSecurityProfile | null>(null);

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // 登录历史列表与分页状态（每页10条，保留半年）
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // 活跃设备列表与分页状态（每页10条）
  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicePage, setDevicePage] = useState(1);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [deviceTotalPages, setDeviceTotalPages] = useState(1);

  // 下线设备二次确认状态
  const [kickTarget, setKickTarget] = useState<any | null>(null);
  const [kicking, setKicking] = useState(false);
  const [kickAllModal, setKickAllModal] = useState(false);
  const [kickingAll, setKickingAll] = useState(false);

  // 删除历史记录二次确认状态
  const [deleteHistoryTarget, setDeleteHistoryTarget] = useState<LoginHistory | null>(null);
  const [clearAllHistoryModal, setClearAllHistoryModal] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);

  // 敏感操作二次验证 (2FA / 高危防护) 与告警偏好
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loginAlertEnabled, setLoginAlertEnabled] = useState(true);

  // 密码表单字段错误提示状态（内联化，严禁使用 Toast）
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    loadUserProfile();
    loadLoginHistory(1);
    loadDevices(1);

    // 读取本地偏好设置缓存
    try {
      const saved2FA = localStorage.getItem("zg_security_2fa_enabled");
      if (saved2FA !== null) setTwoFactorEnabled(saved2FA === "true");
      const savedAlert = localStorage.getItem("zg_security_alert_enabled");
      if (savedAlert !== null) setLoginAlertEnabled(savedAlert !== "false");
    } catch {}
  }, []);

  // 读取当前用户基础安全档案
  const loadUserProfile = async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUserProfile({
            email: data.user.email,
            phone: data.user.phone,
            passwordChangedAt: data.user.passwordChangedAt,
          });
        }
      }
    } catch (e) {
      console.warn("Load user profile security info failed:", e);
    }
  };

  // 动态密码强度计算
  const passwordStrength = useMemo(() => {
    const pwd = formData.newPassword;
    if (!pwd) return { score: 0, text: "", color: "bg-slate-200" };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 10) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 33, text: "弱", color: "bg-rose-500", textColor: "text-rose-500" };
    if (score <= 3) return { score: 66, text: "中等", color: "bg-amber-500", textColor: "text-amber-500" };
    return { score: 100, text: "高强度", color: "bg-emerald-500", textColor: "text-emerald-500" };
  }, [formData.newPassword]);

  // 综合安全健康分评估（满分100）
  const securityHealthScore = useMemo(() => {
    let score = 30; // 初始基准分（基础密码保护）
    if (userProfile?.phone) score += 25; // 绑定手机 +25
    if (userProfile?.email) score += 25; // 认证邮箱 +25
    if (twoFactorEnabled) score += 20; // 开启高危操作2FA +20
    return Math.min(100, score);
  }, [userProfile, twoFactorEnabled]);

  // 加载近期登录历史（分页每页10条，保留半年180天）
  const loadLoginHistory = async (targetPage: number = 1) => {
    try {
      setHistoryLoading(true);
      const authToken = getAuthToken();

      const res = await fetch(`/api/user/login-history?page=${targetPage}&limit=10`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLoginHistory(data.loginHistory || []);
        setHistoryTotal(data.total || (data.loginHistory ? data.loginHistory.length : 0));
        setHistoryPage(data.page || targetPage);
        setHistoryTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.warn("Load login history error:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 加载活跃设备（分页每页10条）
  const loadDevices = async (targetPage: number = 1) => {
    try {
      setDevicesLoading(true);
      const authToken = getAuthToken();

      const res = await fetch(`/api/user/devices?page=${targetPage}&limit=10`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setDeviceTotal(data.total || (data.devices ? data.devices.length : 0));
        setDevicePage(data.page || targetPage);
        setDeviceTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.warn("Load devices error:", error);
    } finally {
      setDevicesLoading(false);
    }
  };

  // 下线指定单个设备
  const confirmKickDevice = async () => {
    if (!kickTarget) return;
    try {
      setKicking(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/devices", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ deviceId: kickTarget.id }),
      });

      if (res.ok) {
        toast.success(`设备 [${kickTarget.deviceName}] 已成功强制下线`);
        setKickTarget(null);
        loadDevices(devicePage);
      } else {
        const error = await res.json();
        toast.error(error.error || "下线失败");
      }
    } catch (error) {
      console.error("Kick device error:", error);
      toast.error("网络异常，无法下线目标设备");
    } finally {
      setKicking(false);
    }
  };

  // 一键下线所有其他设备
  const confirmKickAllOthers = async () => {
    try {
      setKickingAll(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/devices", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action: "kick_all_others" }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || "已成功强制下线其他所有活跃设备");
        setKickAllModal(false);
        loadDevices(1);
      } else {
        const error = await res.json();
        toast.error(error.error || "操作失败");
      }
    } catch (error) {
      console.error("Kick all devices error:", error);
      toast.error("网络异常，一键下线失败");
    } finally {
      setKickingAll(false);
    }
  };

  // 删除单条登录历史记录
  const confirmDeleteHistory = async () => {
    if (!deleteHistoryTarget) return;
    try {
      setDeletingHistory(true);
      const authToken = getAuthToken();

      const res = await fetch(`/api/user/login-history?id=${deleteHistoryTarget.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        toast.success("已删除该条登录历史记录");
        setDeleteHistoryTarget(null);
        loadLoginHistory(historyPage);
      } else {
        const error = await res.json();
        toast.error(error.error || "删除失败");
      }
    } catch (error) {
      console.error("Delete history error:", error);
      toast.error("网络异常，删除记录失败");
    } finally {
      setDeletingHistory(false);
    }
  };

  // 清空所有登录历史记录
  const confirmClearAllHistory = async () => {
    try {
      setDeletingHistory(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/login-history?clearAll=true", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        toast.success("已清空所有历史登录审计记录");
        setClearAllHistoryModal(false);
        loadLoginHistory(1);
      } else {
        const error = await res.json();
        toast.error(error.error || "清空失败");
      }
    } catch (error) {
      console.error("Clear all history error:", error);
      toast.error("网络异常，清空历史失败");
    } finally {
      setDeletingHistory(false);
    }
  };

  // 切换高危操作二次验证 (2FA) 开关
  const handleToggle2FA = () => {
    const nextVal = !twoFactorEnabled;
    setTwoFactorEnabled(nextVal);
    try {
      localStorage.setItem("zg_security_2fa_enabled", String(nextVal));
    } catch {}
    if (nextVal) {
      toast.success("敏感高危操作二次保护已启用");
    } else {
      toast.info("已关闭敏感高危操作二次保护");
    }
  };

  // 切换安全告警偏好开关
  const handleToggleAlert = () => {
    const nextVal = !loginAlertEnabled;
    setLoginAlertEnabled(nextVal);
    try {
      localStorage.setItem("zg_security_alert_enabled", String(nextVal));
    } catch {}
    toast.success(`新设备登录与异常安全告警已${nextVal ? "开启" : "暂停"}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);

    let hasError = false;

    if (!formData.currentPassword) {
      setCurrentPasswordError("请输入当前登录密码");
      hasError = true;
    }

    if (!formData.newPassword) {
      setNewPasswordError("请输入新密码");
      hasError = true;
    } else if (formData.newPassword.length < 6) {
      setNewPasswordError("新密码长度至少需要 6 个字符");
      hasError = true;
    }

    if (!formData.confirmPassword) {
      setConfirmPasswordError("请确认新密码");
      hasError = true;
    } else if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setConfirmPasswordError("两次输入的新密码不一致，请核对");
      hasError = true;
    }

    if (hasError) return;

    try {
      setLoading(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      if (res.ok) {
        toast.success("密码修改成功，请妥善保管新凭证");
        setFormData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setCurrentPasswordError(null);
        setNewPasswordError(null);
        setConfirmPasswordError(null);
      } else {
        const error = await res.json();
        const msg = error.message || error.error || "密码修改失败";
        if (msg.includes("原密码") || msg.includes("当前密码")) {
          setCurrentPasswordError(msg);
        } else if (msg.includes("新密码")) {
          setNewPasswordError(msg);
        } else {
          toast.error(msg);
        }
      }
    } catch (error) {
      console.error("Change password error:", error);
      toast.error("网络异常，操作失败请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-1">账号安全</h1>
          <p className="text-xs text-slate-500 font-medium">维护登录凭证、开启多因素身份防护、监控活跃会话与安全审计</p>
        </div>
        <button
          type="button"
          onClick={() => {
            loadUserProfile();
            loadLoginHistory(historyPage);
            loadDevices(devicePage);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-[#3182ce] hover:text-[#3182ce] transition-all shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新安全审计
        </button>
      </div>

      {/* 账号安全健康体检中心横幅（遵循系统主配色：浅色清爽、知性蓝渐变点缀、明快大厂质感） */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white via-blue-50/40 to-sky-50/30 border border-slate-200/80 shadow-xs p-5 backdrop-blur-xl">
        <div className="absolute right-0 top-0 w-80 h-full bg-radial from-[#3182ce]/10 to-transparent pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce]/15 to-[#2b6cb0]/10 text-[#3182ce] border border-[#3182ce]/25 shadow-2xs shrink-0">
              <ShieldCheck className="w-6 h-6 text-[#3182ce]" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
                <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  {securityHealthScore >= 80 ? "安全评级：极佳" : "安全评级：良好（建议加固）"}
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  综合安全得分：<strong className="text-[#3182ce] font-bold">{securityHealthScore}</strong> / 100
                </span>
              </div>
              <h2 className="text-base font-black text-slate-800 tracking-tight">
                {securityHealthScore >= 80 ? "您的知阁账号防护等级处于极佳状态" : "建议完善密保手机或开启高危二次防护"}
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xl font-medium leading-relaxed">
                知阁研发操作系统采用全链路风控引擎与多因素身份校验，全天候守护您的代码资产、工作空间与数据安全。
              </p>
            </div>
          </div>

          {/* 快捷体检指示器（系统浅色大厂微卡片风格） */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-2.5 border border-slate-200/80 text-center min-w-[95px] shadow-2xs hover:border-[#3182ce]/30 transition-all">
              <div className="text-[10px] text-slate-500 font-medium mb-1">登录密码</div>
              <div className="text-xs font-bold text-emerald-600 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 已保护
              </div>
            </div>
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-2.5 border border-slate-200/80 text-center min-w-[95px] shadow-2xs hover:border-[#3182ce]/30 transition-all">
              <div className="text-[10px] text-slate-500 font-medium mb-1">密保手机</div>
              <div className={`text-xs font-bold flex items-center justify-center gap-1 ${userProfile?.phone ? "text-emerald-600" : "text-[#dd6b20]"}`}>
                {userProfile?.phone ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-[#dd6b20]" />}
                {userProfile?.phone ? "已绑定" : "待绑定"}
              </div>
            </div>
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-2.5 border border-slate-200/80 text-center min-w-[95px] shadow-2xs hover:border-[#3182ce]/30 transition-all">
              <div className="text-[10px] text-slate-500 font-medium mb-1">安全邮箱</div>
              <div className={`text-xs font-bold flex items-center justify-center gap-1 ${userProfile?.email ? "text-emerald-600" : "text-[#dd6b20]"}`}>
                {userProfile?.email ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-[#dd6b20]" />}
                {userProfile?.email ? "已认证" : "未认证"}
              </div>
            </div>
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-2.5 border border-slate-200/80 text-center min-w-[95px] shadow-2xs hover:border-[#3182ce]/30 transition-all">
              <div className="text-[10px] text-slate-500 font-medium mb-1">高危二次保护</div>
              <div className={`text-xs font-bold flex items-center justify-center gap-1 ${twoFactorEnabled ? "text-[#3182ce]" : "text-slate-400"}`}>
                {twoFactorEnabled ? <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" /> : <Shield className="w-3.5 h-3.5 text-slate-400" />}
                {twoFactorEnabled ? "已开启" : "未开启"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 修改密码表单与多因素防护设置 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 修改密码表单（占 7 列） */}
        <div className="lg:col-span-7 bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-xs">
          <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
            修改登录密码
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 当前密码 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                <span className="zg-required">当前登录密码</span>
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPasswords.current ? "text" : "password"}
                  value={formData.currentPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, currentPassword: e.target.value });
                    if (currentPasswordError) setCurrentPasswordError(null);
                  }}
                  className={`w-full pl-9 pr-10 py-2 text-xs rounded-lg border outline-none transition-all ${
                    currentPasswordError
                      ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                      : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                  }`}
                  placeholder="请输入您正在使用的密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {currentPasswordError && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>{currentPasswordError}</span>
                </p>
              )}
            </div>

            {/* 新密码 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                <span className="zg-required">新密码</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPasswords.new ? "text" : "password"}
                  value={formData.newPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, newPassword: e.target.value });
                    if (newPasswordError) setNewPasswordError(null);
                  }}
                  className={`w-full pl-9 pr-10 py-2 text-xs rounded-lg border outline-none transition-all ${
                    newPasswordError
                      ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                      : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                  }`}
                  placeholder="请输入新密码（长度至少6位，建议包含英文字母与数字）"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPasswordError && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>{newPasswordError}</span>
                </p>
              )}

              {/* 密码强度指示条 */}
              {formData.newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">密码强度</span>
                    <span className={`font-bold ${passwordStrength.textColor}`}>
                      {passwordStrength.text}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${passwordStrength.color} transition-all duration-300 rounded-full`}
                      style={{ width: `${passwordStrength.score}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* 确认新密码 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                <span className="zg-required">确认新密码</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (confirmPasswordError) setConfirmPasswordError(null);
                  }}
                  className={`w-full pl-9 pr-10 py-2 text-xs rounded-lg border outline-none transition-all ${
                    confirmPasswordError
                      ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                      : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                  }`}
                  placeholder="请再次输入新密码"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPasswordError ? (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>{confirmPasswordError}</span>
                </p>
              ) : formData.confirmPassword && formData.newPassword !== formData.confirmPassword ? (
                <p className="text-[11px] text-rose-500 mt-1">两次输入的新密码不一致</p>
              ) : null}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg text-xs font-semibold hover:brightness-105 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                {loading ? "正在保存..." : "更新密码"}
              </button>
            </div>
          </form>
        </div>

        {/* 敏感操作保护与告警策略卡片（占 5 列） */}
        <div className="lg:col-span-5 space-y-4">
          {/* 二次验证保护卡片 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Fingerprint className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">高危敏感操作二次保护</h3>
                  <p className="text-[10px] text-slate-400">防止越权与意外恶意篡改</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggle2FA}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  twoFactorEnabled ? "bg-[#3182ce]" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    twoFactorEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/70 p-3 rounded-xl border border-slate-100">
              开启后，在执行包括<strong>注销账号</strong>、<strong>批量转让工作空间</strong>、<strong>删除生产级组件</strong>或<strong>重置安全密钥</strong>等高敏感动作时，将强制校验当前会话身份凭证。
            </p>
          </div>

          {/* 登录通知与告警卡片 */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <BellRing className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800">异地与新设备登录告警</h3>
                  <p className="text-[10px] text-slate-400">实时拦截不可信设备接入</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleAlert}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  loginAlertEnabled ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    loginAlertEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <div className="space-y-2 text-[11px] text-slate-500">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span>异地异常 IP 登录熔断保护</span>
                <span className="font-bold text-emerald-600">已默认启用</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span>审计记录合规归档周期</span>
                <span className="font-bold text-[#3182ce]">半年 (180天) 自动轮转</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 活跃登录设备管理 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                <h2 className="text-base font-bold text-slate-800">活跃登录设备</h2>
                <span className="text-[11px] text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
                  共 {deviceTotal} 台设备
                </span>
              </div>
              {devices.filter((d) => !d.isCurrent).length > 0 && (
                <button
                  type="button"
                  onClick={() => setKickAllModal(true)}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors border border-rose-200/80 cursor-pointer"
                >
                  下线其他全部设备
                </button>
              )}
            </div>

            {devicesLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin"></div>
              </div>
            ) : devices.length > 0 ? (
              <div className="space-y-2.5">
                {devices.map((device) => {
                  const isMobile = device.deviceType === "mobile";
                  const isTablet = device.deviceType === "tablet";
                  const friendlyIp = formatFriendlyIp(device.ipAddress);

                  return (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:bg-white hover:shadow-xs transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
                          {isMobile ? (
                            <Smartphone className="w-4 h-4" />
                          ) : isTablet ? (
                            <Tablet className="w-4 h-4" />
                          ) : (
                            <Monitor className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {device.deviceName}
                            </span>
                            {device.isCurrent ? (
                              <span className="text-[10px] font-bold text-[#3182ce] bg-[#3182ce]/10 px-1.5 py-0.5 rounded">
                                当前设备
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-200/70 px-1.5 py-0.5 rounded">
                                在线会话
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            <span className="text-slate-600 font-mono font-medium">{friendlyIp.ip}</span>
                            <span className="text-[10px] text-slate-400 ml-1">({friendlyIp.note})</span>
                            <span className="mx-1.5">·</span>
                            <span>活跃于 {new Date(device.lastActiveAt).toLocaleString("zh-CN")}</span>
                          </div>
                        </div>
                      </div>

                      {!device.isCurrent && (
                        <button
                          type="button"
                          onClick={() => setKickTarget(device)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-2 shrink-0 cursor-pointer"
                          title="强制下线此设备"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 text-xs">暂无活跃设备记录</div>
            )}
          </div>

          {/* 活跃设备分页控件（每页 10 条） */}
          {deviceTotalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-400">
                第 {devicePage} / {deviceTotalPages} 页（每页 10 条）
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={devicePage <= 1 || devicesLoading}
                  onClick={() => loadDevices(devicePage - 1)}
                  className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-0.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                </button>
                <button
                  type="button"
                  disabled={devicePage >= deviceTotalPages || devicesLoading}
                  onClick={() => loadDevices(devicePage + 1)}
                  className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-0.5"
                >
                  下一页 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 近期登录历史记录 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
                <h2 className="text-base font-bold text-slate-800">近期登录历史</h2>
                <span className="text-[11px] text-slate-500 font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                  共 {historyTotal} 条记录
                </span>
              </div>
              {loginHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setClearAllHistoryModal(true)}
                  className="text-xs text-slate-500 hover:text-rose-600 font-semibold hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors border border-slate-200 hover:border-rose-200 cursor-pointer"
                >
                  清空历史
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-3 flex items-center gap-1">
              <Info className="w-3 h-3 text-slate-400 shrink-0" />
              <span>登录审计记录保留半年（180天），系统每半年自动清理归档；支持手动删除</span>
            </p>

            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              </div>
            ) : loginHistory.length > 0 ? (
              <div className="space-y-2">
                {loginHistory.map((record) => {
                  const isMobile = record.userAgent?.toLowerCase().includes("mobile");
                  const friendlyIp = formatFriendlyIp(record.ipAddress);

                  return (
                    <div
                      key={record.id}
                      className="group flex items-center justify-between p-2.5 rounded-lg bg-slate-50/50 border border-slate-100 hover:bg-white hover:shadow-xs transition-all text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          {isMobile ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-700 truncate">
                            {record.device || (isMobile ? "移动端浏览器" : "桌面端工作站")}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            <span>{record.location || "中国"}</span>
                            <span className="mx-1">·</span>
                            <span className="font-mono text-slate-600 font-medium">{friendlyIp.ip}</span>
                            <span className="text-slate-400 ml-0.5">({friendlyIp.note})</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[11px] text-slate-400">
                          {new Date(record.loginAt).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDeleteHistoryTarget(record)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                          title="删除此条审计记录"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 text-xs">暂无历史登录记录</div>
            )}
          </div>

          {/* 登录历史分页控件（每页 10 条） */}
          {historyTotalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-400">
                第 {historyPage} / {historyTotalPages} 页（每页 10 条）
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={historyPage <= 1 || historyLoading}
                  onClick={() => loadLoginHistory(historyPage - 1)}
                  className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-0.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 上一页
                </button>
                <button
                  type="button"
                  disabled={historyPage >= historyTotalPages || historyLoading}
                  onClick={() => loadLoginHistory(historyPage + 1)}
                  className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-0.5"
                >
                  下一页 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 单个设备下线确认弹窗 */}
      {kickTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
            <button
              onClick={() => setKickTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">强制下线设备</h3>
              <p className="text-xs text-slate-500 mt-1">
                确认要强制注销设备 [{kickTarget.deviceName}] 的会话凭证吗？该设备将无法继续访问系统。
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setKickTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmKickDevice}
                disabled={kicking}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {kicking ? "正在下线..." : "确认强制下线"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 一键下线所有其他设备确认弹窗 */}
      {kickAllModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
            <button
              onClick={() => setKickAllModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">下线其他全部设备</h3>
              <p className="text-xs text-slate-500 mt-1">
                确认要将除当前设备外的所有活跃在线设备全部强制下线吗？其他已登录的浏览器会话将立即失效。
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setKickAllModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmKickAllOthers}
                disabled={kickingAll}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {kickingAll ? "正在下线..." : "确认全部下线"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 单条历史记录删除确认弹窗 */}
      {deleteHistoryTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
            <button
              onClick={() => setDeleteHistoryTarget(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">删除登录审计记录</h3>
              <p className="text-xs text-slate-500 mt-1">
                确认要删除该条登录记录（{new Date(deleteHistoryTarget.loginAt).toLocaleString("zh-CN")}）吗？删除后不可撤销。
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setDeleteHistoryTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDeleteHistory}
                disabled={deletingHistory}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deletingHistory ? "正在删除..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空全部登录历史确认弹窗 */}
      {clearAllHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative">
            <button
              onClick={() => setClearAllHistoryModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">清空所有登录审计</h3>
              <p className="text-xs text-slate-500 mt-1">
                确认清空个人所有的历史登录审计日志吗？清空后将无法查阅过去的登录记录。
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setClearAllHistoryModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmClearAllHistory}
                disabled={deletingHistory}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deletingHistory ? "正在清空..." : "确认清空全部"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
