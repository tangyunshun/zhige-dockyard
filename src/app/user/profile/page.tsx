"use client";

import React, { useState, useEffect } from "react";
import StepUpAuthModal from "@/components/StepUpAuthModal";
import {
  User,
  Mail,
  Phone,
  Camera,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Clock,
  ShieldCheck,
  Crown,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

export default function UserProfilePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [deleteStep, setDeleteStep] = useState<string>("");
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [checkComplete, setCheckComplete] = useState(false);
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [checkResults, setCheckResults] = useState<{ item: string; status: string; detail: string }[]>([]);
  const [pendingRecharge, setPendingRecharge] = useState(0);
  const [deletionCooldownDays, setDeletionCooldownDays] = useState(7);
  const [deletionPending, setDeletionPending] = useState(false);
  const [deletionDaysRemaining, setDeletionDaysRemaining] = useState<number | null>(null);
  const [cancelDeletionLoading, setCancelDeletionLoading] = useState(false);
  const [originalPhone, setOriginalPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [smsMessage, setSmsMessage] = useState<string | null>(null);
  const [smsDebugCode, setSmsDebugCode] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    avatar: "",
    bio: "",
  });

  const isPhoneChanged = (formData.phone || "").trim() !== (originalPhone || "").trim();

  useEffect(() => {
    if (countdown <= 0) {
      setSmsMessage(null);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setSmsMessage(null);
          return 0;
        }
        if (smsDebugCode) {
          setSmsMessage(`验证码已发送：${smsDebugCode}，${next}秒后可重新发送`);
        } else {
          setSmsMessage(`验证码已发送，${next}秒后可重新发送`);
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, smsDebugCode]);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/profile", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        setUserInfo(data.data);
        const serverPhone = data.data.phone || "";
        setOriginalPhone(serverPhone);
        setDeletionCooldownDays(data.deletionCooldownDays || 7);
        setDeletionPending(!!data?.user?.isPendingDeletion);
        setDeletionDaysRemaining(data?.user?.daysRemaining ?? null);
        setFormData({
          name: data.data.name || "",
          email: data.data.email || "",
          phone: serverPhone,
          avatar: data.data.avatar || "",
          bio: data.data.bio || "",
        });
      }
    } catch (error) {
      console.error("Load user info error:", error);
      toast.error("加载用户信息失败");
    } finally {
      setLoading(false);
    }
  };

  const formatRoleName = (role?: string | null) => {
    if (!role) return "普通用户";
    const r = role.toLowerCase();
    if (r === "admin" || r === "administrator") return "系统管理员";
    if (r === "superadmin" || r === "super_admin") return "超级管理员";
    if (r === "creator") return "创作者";
    if (r === "developer") return "开发者";
    return "普通用户";
  };

  const getDaysFromCreated = (createdAtString?: string) => {
    if (!createdAtString) return 1;
    const created = new Date(createdAtString);
    if (isNaN(created.getTime())) return 1;
    const diff = Date.now() - created.getTime();
    return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  const handleDeleteAccount = async (token?: string) => {
    if (!token) {
      setShowStepUpModal(true);
      return;
    }

    setShowCheckModal(false);

    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ verifyToken: token }),
      });

      if (res.ok) {
        const data = await res.json();
        const daysRemaining = data.daysRemaining || deletionCooldownDays || 7;
        localStorage.removeItem("userId");
        document.cookie = "auth_token=; path=/; max-age=0";
        window.location.href = `/?deletion_pending=true&daysRemaining=${daysRemaining}`;
      } else {
        const error = await res.json();
        toast.error(error.error || "注销失败");
      }
    } catch (error) {
      console.warn("Delete account error:", error);
      toast.error("注销请求失败，请稍后重试");
    }
  };

  const handleStartCheck = () => {
    setShowNoticeModal(false);
    setShowCheckModal(true);
    setCheckComplete(false);
    setCheckResults([]);
    setHasAgreed(false);
    performAccountDeletionCheck();
  };

  const performAccountDeletionCheck = async () => {
    const CHECK_LABELS: Record<string, string> = {
      profile: "检测个人信息...",
      workspaces: "检测工作空间...",
      components: "检测组件资产...",
      activities: "检测活动记录...",
      membership: "检测会员与算力...",
    };
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/delete-account/check", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("检测失败");
      const json = await res.json();
      const checks: { key: string; label: string; count: number; blocking: boolean }[] =
        json.data?.checks || [];
      const results: { item: string; status: string; detail: string }[] = [];
      for (let i = 0; i < checks.length; i++) {
        const c = checks[i];
        setDeleteStep(CHECK_LABELS[c.key] || `检测${c.label}...`);
        setDeleteProgress(Math.round(((i + 0.5) / checks.length) * 100));
        await new Promise((resolve) => setTimeout(resolve, 300));
        const status = c.blocking ? "warn" : "pass";
        const detail = c.count > 0 ? `${c.label} ${c.count} 项` : "无残留数据";
        results.push({ item: c.label, status, detail });
        setCheckResults([...results]);
        setDeleteProgress(Math.round(((i + 1) / checks.length) * 100));
      }
      setPendingRecharge(json.data?.pendingRechargeOrders || 0);
      setCheckComplete(true);
      setDeleteStep("安全检测完成");
    } catch (e) {
      console.warn("Deletion check error:", e);
      toast.error("安全检测失败，请稍后重试");
      setCheckComplete(true);
      setDeleteStep("安全检测失败");
    }
  };

  const handleCancelDeletion = async () => {
    if (!window.confirm("确认撤销账号注销申请？撤销后账号将恢复正常，所有数据资产完整留存。")) return;
    try {
      setCancelDeletionLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/user/cancel-deletion", {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "注销申请已撤销，账号已恢复正常");
        setDeletionPending(false);
        setDeletionDaysRemaining(null);
        loadUserInfo();
      } else {
        toast.error(data.error || data.message || "撤销注销失败");
      }
    } catch (error) {
      console.warn("Cancel deletion error:", error);
      toast.error("撤销注销失败，请稍后重试");
    } finally {
      setCancelDeletionLoading(false);
    }
  };

  const handleSendSmsCode = async () => {
    const targetPhone = (formData.phone || "").trim();
    if (!targetPhone) {
      setPhoneError("请输入手机号码");
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(targetPhone)) {
      setPhoneError("手机号不规范，请输入规范的 11 位有效手机号码");
      return;
    }
    if (targetPhone === (originalPhone || "").trim()) {
      setPhoneError("手机号码未发生变动，无需发送验证码");
      return;
    }

    try {
      setSendingCode(true);
      setPhoneError(null);
      setSmsMessage(null);
      const res = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: targetPhone }),
      });
      const data = await res.json();
      if (res.ok && (data.success || data.code)) {
        setCountdown(60);
        setSmsDebugCode(data.debugCode || null);
        if (data.debugCode) {
          setSmsMessage(`验证码已发送：${data.debugCode}，60秒后可重新发送`);
        } else {
          setSmsMessage("验证码已发送，60秒后可重新发送");
        }
      } else {
        setPhoneError(data.message || data.error || "验证码发送失败，请检查手机号并重试");
      }
    } catch (error) {
      console.error("Send SMS error:", error);
      setPhoneError("网络连接异常，验证码发送失败");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setNameError("用户昵称不能为空");
      return;
    }

    const currentPhoneTrimmed = (formData.phone || "").trim();
    if (currentPhoneTrimmed && !/^1[3-9]\d{9}$/.test(currentPhoneTrimmed)) {
      setPhoneError("手机号不规范，请输入规范的 11 位有效手机号码");
      return;
    }

    // 更换手机号时强制前置验证短信验证码
    if (isPhoneChanged) {
      if (!currentPhoneTrimmed) {
        setPhoneError("新手机号码不能为空");
        return;
      }
      if (!smsCode.trim()) {
        setSmsError("更换手机号必须填写短信验证码");
        return;
      }
      if (smsCode.trim().length !== 6) {
        setSmsError("短信验证码需为完整的 6 位数字");
        return;
      }
    }

    try {
      setSaving(true);
      setPhoneError(null);
      setSmsError(null);
      setNameError(null);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ...formData,
          phone: currentPhoneTrimmed,
          smsCode: isPhoneChanged ? smsCode.trim() : undefined,
        }),
      });

      if (res.ok) {
        toast.success(isPhoneChanged ? "手机号码更换并保存成功" : "个人基本信息已成功更新");
        setOriginalPhone(currentPhoneTrimmed);
        setSmsCode("");
        setCountdown(0);
        setSmsMessage(null);
        setSmsDebugCode(null);
        setPhoneError(null);
        setSmsError(null);
        loadUserInfo();
      } else {
        const error = await res.json();
        const errText = error.error || error.message || "更新个人资料失败";
        if (errText.includes("手机") || errText.includes("号码")) {
          setPhoneError(errText);
        } else if (errText.includes("验证码")) {
          setSmsError(errText);
        } else if (errText.includes("昵称")) {
          setNameError(errText);
        } else {
          toast.error(errText);
        }
      }
    } catch (error) {
      console.error("Update profile error:", error);
      toast.error("网络异常，更新失败");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("头像文件不能超过 5MB，请压缩后重新上传");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAvatarError("请选择合法的图片文件（JPG/PNG/WebP）");
      return;
    }

    try {
      setSaving(true);
      const authToken = getAuthToken();

      const uploadFormData = new FormData();
      uploadFormData.append("avatar", file);

      const res = await fetch("/api/user/upload-avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: uploadFormData,
      });

      if (res.ok) {
        const data = await res.json();
        setFormData({ ...formData, avatar: data.data.avatarUrl });
        toast.success("头像上传成功");
        setAvatarError(null);
        loadUserInfo();
      } else {
        const error = await res.json();
        setAvatarError(error.message || "上传失败，请稍后重试");
      }
    } catch (error) {
      console.warn("Upload avatar error:", error);
      setAvatarError("上传头像网络异常，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 font-medium text-sm">正在加载个人资料...</p>
        </div>
      </div>
    );
  }

  const isAdmin =
    userInfo?.role &&
    ["admin", "super_admin", "superadmin", "ADMIN", "SUPERADMIN", "SUPER_ADMIN"].includes(
      userInfo.role
    );

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-1">个人设置</h1>
        <p className="text-xs text-slate-500 font-medium">维护个人档案、头像与账户安全凭据</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：3 大资产与档案卡片（彻底消除留白） */}
        <div className="lg:col-span-4 space-y-4.5">
          {/* 卡片 1：头像与会员核心资产卡片 */}
          <div className="relative bg-white/85 backdrop-blur-xl rounded-2xl p-5 border border-slate-200/80 shadow-2xs text-center">
            <div className="relative mx-auto w-22 h-22 mb-3">
              {formData.avatar ? (
                <img
                  src={formData.avatar}
                  alt="Avatar"
                  className="w-22 h-22 rounded-2xl object-cover border-2 border-white shadow-sm"
                />
              ) : (
                <div className="w-22 h-22 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-3xl font-bold border-2 border-white shadow-sm">
                  {formData.name[0]?.toUpperCase() || "U"}
                </div>
              )}
              <label className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-lg flex items-center justify-center cursor-pointer shadow-md transition-all">
                <Camera className="w-3.5 h-3.5" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={saving}
                />
              </label>
            </div>
            {avatarError && (
              <div className="mb-2 p-2 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-600 flex items-center justify-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span>{avatarError}</span>
              </div>
            )}
            <h3 className="text-base font-bold text-slate-800 mb-0.5">{formData.name || "未命名用户"}</h3>
            <p className="text-xs text-slate-400 mb-3">{formData.email || "未绑定邮箱"}</p>

            {/* 会员等级、身份与状态三元组 */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-around text-center">
              <div>
                <div className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-0.5">
                  <Crown className="w-3 h-3 text-[#3182ce]" />
                  会员等级
                </div>
                <div className="text-xs font-bold text-[#3182ce] mt-0.5">
                  {userInfo?.membershipDisplayName || "普通会员"}
                </div>
              </div>
              <div className="w-px h-6 bg-slate-100"></div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-0.5">
                  <ShieldCheck className="w-3 h-3 text-[#2b6cb0]" />
                  系统身份
                </div>
                <div className="text-xs font-bold text-[#2b6cb0] mt-0.5">
                  {formatRoleName(userInfo?.role)}
                </div>
              </div>
              <div className="w-px h-6 bg-slate-100"></div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">账号状态</div>
                {deletionPending ? (
                  <div className="text-xs font-bold text-amber-600 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    注销冷静期{deletionDaysRemaining != null ? `（剩 ${deletionDaysRemaining} 天）` : ""}
                  </div>
                ) : (
                  <div className="text-xs font-bold text-emerald-600 mt-0.5">正常使用</div>
                )}
              </div>
            </div>

            {/* 账号注册时间 */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span className="flex items-center gap-1 text-slate-400">
                <Calendar className="w-3 h-3 text-slate-400" />
                账号注册时间
              </span>
              <span className="font-semibold text-slate-700">
                {userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString("zh-CN") : "—"}
              </span>
            </div>
          </div>

          {/* 卡片 2：个人资料完成度（填补留白，纯正个人设置指标） */}
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <div className="w-1 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                资料完善度
              </h3>
              <span className="text-xs font-black text-[#3182ce]">
                {(() => {
                  let s = 0;
                  if (formData.avatar) s += 25;
                  if (formData.name?.trim()) s += 25;
                  if (formData.email?.trim()) s += 25;
                  if (formData.phone?.trim()) s += 25;
                  return s;
                })()}%
              </span>
            </div>

            {/* 进度条 */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-[#3182ce] to-[#10b981] rounded-full transition-all duration-300"
                style={{
                  width: `${(() => {
                    let s = 0;
                    if (formData.avatar) s += 25;
                    if (formData.name?.trim()) s += 25;
                    if (formData.email?.trim()) s += 25;
                    if (formData.phone?.trim()) s += 25;
                    return Math.max(10, s);
                  })()}%`,
                }}
              />
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between py-1 text-slate-600 border-b border-slate-50">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle className={`w-3.5 h-3.5 ${formData.avatar ? "text-emerald-500" : "text-slate-300"}`} />
                  上传自定义头像
                </span>
                <span className={`text-[10px] font-bold ${formData.avatar ? "text-emerald-600" : "text-slate-400"}`}>
                  {formData.avatar ? "已设置" : "待上传"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-slate-600 border-b border-slate-50">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle className={`w-3.5 h-3.5 ${formData.name ? "text-emerald-500" : "text-slate-300"}`} />
                  设置个人昵称
                </span>
                <span className={`text-[10px] font-bold ${formData.name ? "text-emerald-600" : "text-slate-400"}`}>
                  {formData.name ? "已设置" : "待完善"}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 text-slate-600 border-b border-slate-50">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle className={`w-3.5 h-3.5 ${formData.email ? "text-emerald-500" : "text-slate-300"}`} />
                  认证主登录邮箱
                </span>
                <span className="text-[10px] font-bold text-emerald-600">已认证</span>
              </div>
              <div className="flex items-center justify-between py-1 text-slate-600">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle className={`w-3.5 h-3.5 ${formData.phone ? "text-emerald-500" : "text-slate-300"}`} />
                  绑定联系手机
                </span>
                <span className={`text-[10px] font-bold ${formData.phone ? "text-emerald-600" : "text-amber-600"}`}>
                  {formData.phone ? "已绑定" : "建议绑定"}
                </span>
              </div>
            </div>
          </div>

          {/* 卡片 3：团队协同名片实时预览（彻底消除留白，纯正个人信息展示） */}
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <div className="w-1 h-3.5 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
                协同名片预览
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-[#3182ce] border border-blue-200/60">
                团队可见效果
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/80 space-y-2.5">
              <div className="flex items-center gap-2.5">
                {formData.avatar ? (
                  <img
                    src={formData.avatar}
                    alt="Preview"
                    className="w-10 h-10 rounded-xl object-cover border border-white shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0">
                    {formData.name[0]?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {formData.name || "未命名用户"}
                    </span>
                    <span className="text-[10px] font-bold px-1 py-0.2 rounded bg-[#3182ce]/10 text-[#2b6cb0] shrink-0">
                      {formatRoleName(userInfo?.role)}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-slate-400 truncate mt-0.5">
                    {formData.email || "未绑定邮箱"}
                  </div>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-white/90 border border-slate-100 text-[11px] text-slate-600 italic leading-relaxed">
                "{formData.bio ? formData.bio : "该成员尚未填写个人寄语或签名..."}"
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                <span>知阁研发协同实名认证</span>
                <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                  <CheckCircle className="w-2.5 h-2.5" /> 已激活
                </span>
              </div>
            </div>

            <p className="text-[10.5px] text-slate-400 mt-2.5 leading-relaxed">
              此名片将在代码评审、空间协同与组件物料中向项目团队成员公开展示。
            </p>
          </div>
        </div>

        {/* 右侧：基本资料编辑 + 身份凭据档案 + 账号注销 */}
        <div className="lg:col-span-8 space-y-4.5">
          {/* 基本信息编辑表单 */}
          <form onSubmit={handleSubmit}>
            <div className="bg-white/85 backdrop-blur-xl rounded-2xl p-6 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                    基本资料编辑
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    维护您的个人基本信息，保存后将即时更新个人协同名片
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* 昵称 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    <span className="zg-required">用户昵称</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        if (nameError) setNameError(null);
                      }}
                      className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none transition-all ${
                        nameError
                          ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                          : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                      }`}
                      placeholder="请输入您的昵称"
                      required
                    />
                  </div>
                  {nameError && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in duration-200">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{nameError}</span>
                    </p>
                  )}
                </div>

                {/* 邮箱（作为主键凭证展示保护） */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">登录邮箱</label>
                    <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3 h-3" /> 已认证主安全凭证
                    </span>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={formData.email}
                      disabled
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50/80 text-slate-500 cursor-not-allowed outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">登录邮箱作为平台唯一主凭证，如需更换请联系管理员。</p>
                </div>

                {/* 手机号 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700">手机号码</label>
                    {isPhoneChanged ? (
                      <span className="text-[11px] text-amber-600 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3 h-3 text-amber-500" /> 更换中 (需验证码)
                      </span>
                    ) : originalPhone ? (
                      <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                        <CheckCircle className="w-3 h-3 text-emerald-500" /> 已绑定安全手机
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">未绑定</span>
                    )}
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => {
                        setFormData({ ...formData, phone: e.target.value });
                        if (phoneError) setPhoneError(null);
                      }}
                      onBlur={() => {
                        const val = (formData.phone || "").trim();
                        if (val && !/^1[3-9]\d{9}$/.test(val)) {
                          setPhoneError("手机号不规范，请输入规范的 11 位有效手机号码");
                        }
                      }}
                      className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none transition-all font-mono ${
                        phoneError
                          ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                          : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                      }`}
                      placeholder="请输入 11 位中国大陆手机号码"
                    />
                  </div>
                  {phoneError ? (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1.5 font-medium animate-in fade-in duration-200">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{phoneError}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">
                      用于接收高危敏感操作二次验证与协同通知短信。
                    </p>
                  )}
                </div>

                {/* 更换手机号时展开的短信验证码校验区域 */}
                {isPhoneChanged && (
                  <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-200/70 space-y-2.5 transition-all">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-[#2b6cb0]">
                        <span className="zg-required">新手机短信验证码</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, phone: originalPhone });
                          setSmsCode("");
                          setCountdown(0);
                          setSmsMessage(null);
                          setSmsDebugCode(null);
                        }}
                        className="text-[11px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                      >
                        放弃更换，恢复原号码
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          maxLength={6}
                          value={smsCode}
                          onChange={(e) => {
                            setSmsCode(e.target.value.replace(/\D/g, ""));
                            if (smsError) setSmsError(null);
                          }}
                          className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none transition-all font-mono tracking-wider ${
                            smsError
                              ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                              : "border-slate-200 bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                          }`}
                          placeholder="请输入 6 位短信验证码"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSendSmsCode}
                        disabled={countdown > 0 || sendingCode || !formData.phone.trim()}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-white border border-[#3182ce] text-[#3182ce] hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer shadow-2xs"
                      >
                        {sendingCode
                          ? "正在发送..."
                          : countdown > 0
                          ? `${countdown}秒后重试`
                          : "获取验证码"}
                      </button>
                    </div>

                    {/* 验证码错误提示 或 验证码成功提示 */}
                    {smsError ? (
                      <p className="text-xs text-red-600 flex items-center gap-1 font-medium animate-in fade-in duration-200">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span>{smsError}</span>
                      </p>
                    ) : smsMessage ? (
                      <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-emerald-50/90 border border-emerald-200/80 text-xs text-emerald-700 animate-in fade-in duration-200">
                        <span className="flex items-center gap-1.5 font-medium">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          {smsMessage}
                        </span>
                        {smsDebugCode && (
                          <button
                            type="button"
                            onClick={() => {
                              setSmsCode(smsDebugCode);
                              if (smsError) setSmsError(null);
                            }}
                            className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] hover:underline px-2 py-0.5 rounded bg-white border border-blue-200/80 shadow-2xs cursor-pointer shrink-0 ml-2"
                          >
                            点此填入
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>验证码将直接发送至新手机号</span>
                        <strong className="text-slate-700 font-semibold">{formData.phone}</strong>
                        <span>，核验通过后方可生效。</span>
                      </p>
                    )}
                  </div>
                )}

                {/* 个人简介 / 签名 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">个人签名 / 团队寄语</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full p-3 text-xs rounded-lg border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all resize-none"
                    rows={3}
                    placeholder="选填，向团队伙伴简要介绍您的专长与业务方向..."
                  />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg text-xs font-semibold hover:brightness-105 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "正在保存..." : isPhoneChanged ? "验证并更换手机号" : "保存资料修改"}
                </button>
              </div>
            </div>
          </form>

          {/* 危险区域 - 注销账号 */}
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl p-6 border border-rose-100 shadow-2xs">
            <h2 className="text-base font-bold text-rose-600 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              账号生命周期管理
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <div>
                <p className="text-xs font-bold text-slate-700 mb-1">
                  {deletionPending ? "注销申请已提交，冷静期中" : "注销并抹除此账号"}
                </p>
                <p className="text-xs text-slate-400">
                  {isAdmin
                    ? "管理员账号受系统最高安全规则保护，不支持前端自主注销。"
                    : deletionPending
                    ? `你的账号已进入注销冷静期，冷静期内随时可撤销申请；期满后数据将彻底清空、不可恢复。`
                    : `注销后将进入 ${deletionCooldownDays} 天冷静期，冷静期内随时可恢复；期满后数据彻底清空不可逆。`}
                </p>
              </div>
              {deletionPending && !isAdmin ? (
                <button
                  type="button"
                  onClick={handleCancelDeletion}
                  disabled={cancelDeletionLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {cancelDeletionLoading ? "正在撤销..." : "撤销注销申请"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNoticeModal(true)}
                  disabled={isAdmin || deletionPending}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  申请注销
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 注销须知弹窗 */}
      {showNoticeModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNoticeModal(false);
          }}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowNoticeModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-500 flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">账号注销须知</h3>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3">
                <div className="flex items-center gap-1.5 font-bold text-[#2b6cb0] mb-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  {deletionCooldownDays} 天安全冷静期
                </div>
                <p className="text-slate-600">在此期间再次登录即可一键撤销申请，所有数据资产完整留存。</p>
              </div>
              <div className="bg-rose-50/60 border border-rose-200/80 rounded-xl p-3">
                <div className="flex items-center gap-1.5 font-bold text-rose-600 mb-0.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  期满永久抹除
                </div>
                <p className="text-slate-600">冷静期结束将彻底抹除名下全部组件、工作空间配置与活动日志，无法找回。</p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2">
              <input
                type="checkbox"
                id="agree"
                checked={hasAgreed}
                onChange={(e) => setHasAgreed(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
              />
              <label htmlFor="agree" className="text-xs text-slate-600 cursor-pointer">
                我已知晓并理解注销影响，自愿进入安全预备流程
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNoticeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStartCheck}
                disabled={!hasAgreed}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                开始安全检测
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 检测进度弹窗 */}
      {showCheckModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCheckModal(false);
          }}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
            {/* 右上角关闭按钮 */}
            <button
              type="button"
              onClick={() => setShowCheckModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-blue-500 flex items-center justify-center mx-auto mb-2">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {checkComplete ? "检测完成" : deleteStep || "正在检测..."}
              </h3>
            </div>

            {!checkComplete ? (
              <>
                <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${deleteProgress}%` }}
                  ></div>
                </div>

                <div className="space-y-2">
                  {checkResults.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm"
                    >
                      {result.status === "warn" ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      )}
                      <span className="text-slate-600">{result.item}</span>
                      <span className={`text-xs ml-auto ${result.status === "warn" ? "text-amber-600" : "text-emerald-500"}`}>
                        {result.detail || (result.status === "warn" ? "需注意" : "检测通过")}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCheckModal(false)}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    取消检测并返回
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">
                    检测完成
                  </h3>
                  <p className="text-sm text-emerald-600">
                    未发现任何问题，可以注销
                  </p>
                </div>

                <div className="space-y-2 mb-4">
                  {checkResults.map((result, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 text-sm p-2 rounded-lg ${result.status === "warn" ? "bg-amber-50" : "bg-emerald-50"}`}
                    >
                      {result.status === "warn" ? (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                      )}
                      <span className="text-slate-600">{result.item}</span>
                      <span className={`text-xs ml-auto ${result.status === "warn" ? "text-amber-600" : "text-emerald-500"}`}>
                        {result.detail || (result.status === "warn" ? "将一并清除" : "正常")}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 text-center mb-4">
                  点击"确认注销"后，您的账号将进入冷静期
                </p>

                {pendingRecharge > 0 && (
                  <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs leading-relaxed">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      您有 {pendingRecharge} 笔线下充值工单尚未结算入账，注销后将无法自动退款，请先到「计费中心」处理完毕再申请注销。
                    </span>
                  </div>
                )}

                {/* 底部取消与确认注销双操作区 */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCheckModal(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-center"
                  >
                    取消 / 我再想想
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAccount()}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-red-500/30 transition-all text-sm cursor-pointer text-center"
                  >
                    确认注销
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* 二次身份验证弹窗 */}
      <StepUpAuthModal
        isOpen={showStepUpModal}
        title="敏感操作验证"
        message="此高危操作需要进行二次身份验证，以确认是您本人操作。"
        action="cancel_account"
        onConfirm={(token) => {
          setShowStepUpModal(false);
          handleDeleteAccount(token);
        }}
        onCancel={() => {
          setShowStepUpModal(false);
        }}
      />
    </div>
  );
}
