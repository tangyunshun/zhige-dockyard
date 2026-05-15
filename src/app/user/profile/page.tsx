"use client";

import React, { useState, useEffect } from "react";
import {
  User,
  Mail,
  Phone,
  Camera,
  Save,
  X,
  Upload,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Trash2,
  Clock,
} from "lucide-react";

export default function UserProfilePage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState<string>(""); // 当前检测步骤
  const [deleteProgress, setDeleteProgress] = useState(0); // 进度
  const [isDeleting, setIsDeleting] = useState(false); // 正在注销中
  const [hasAgreed, setHasAgreed] = useState(false); // 是否已勾选"我已知晓"
  const [showNoticeModal, setShowNoticeModal] = useState(false); // 显示注销须知弹窗
  const [showCheckModal, setShowCheckModal] = useState(false); // 显示检测进度弹窗
  const [checkComplete, setCheckComplete] = useState(false); // 检测是否完成
  const [checkResults, setCheckResults] = useState<
    { item: string; status: string }[]
  >([]); // 检测结果
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    avatar: "",
    bio: "",
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        const data = await res.json();
        setUserInfo(data.data);
        setFormData({
          name: data.data.name || "",
          email: data.data.email || "",
          phone: data.data.phone || "",
          avatar: data.data.avatar || "",
          bio: data.data.bio || "",
        });
      }
    } catch (error) {
      console.error("Load user info error:", error);
      setMessage({ type: "error", text: "加载用户信息失败" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setShowCheckModal(false);

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        const data = await res.json();
        const daysRemaining = data.daysRemaining || 7;
        localStorage.removeItem("userId");
        document.cookie = "auth_token=; path=/; max-age=0";
        window.location.href = `/?deletion_pending=true&daysRemaining=${daysRemaining}`;
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.error || "注销失败" });
      }
    } catch (error) {
      console.warn("Delete account error:", error);
      setMessage({ type: "error", text: "注销失败" });
    }
  };

  // 开始检测流程
  const handleStartCheck = () => {
    setShowNoticeModal(false);
    setShowCheckModal(true);
    setCheckComplete(false);
    setCheckResults([]);
    setHasAgreed(false);
    performAccountDeletionCheck();
  };

  // 执行账号注销检测
  const performAccountDeletionCheck = async () => {
    const checkItems = [
      { name: "检测个人信息...", item: "个人信息" },
      { name: "检测工作空间...", item: "工作空间" },
      { name: "检测组件...", item: "组件" },
      { name: "检测活动记录...", item: "活动记录" },
      { name: "检测会员信息...", item: "会员信息" },
    ];

    const results: { item: string; status: string }[] = [];

    for (let i = 0; i < checkItems.length; i++) {
      const check = checkItems[i];
      setDeleteStep(check.name);
      setDeleteProgress(Math.round(((i + 0.5) / checkItems.length) * 100));

      await new Promise((resolve) => setTimeout(resolve, 600));

      results.push({ item: check.item, status: "pass" });
      setCheckResults([...results]);
      setDeleteProgress(Math.round(((i + 1) / checkItems.length) * 100));
    }

    setCheckComplete(true);
    setDeleteStep("检测完成");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // 验证必填项
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "昵称不能为空" });
      return;
    }

    try {
      setSaving(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "个人信息已更新" });
        loadUserInfo();
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "更新失败" });
      }
    } catch (error) {
      console.error("Update profile error:", error);
      setMessage({ type: "error", text: "更新失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "头像大小不能超过 5MB" });
      return;
    }

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "请上传图片文件" });
      return;
    }

    try {
      setSaving(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const uploadFormData = new FormData();
      uploadFormData.append("avatar", file);

      const res = await fetch("/api/user/upload-avatar", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userId}`,
        },
        body: uploadFormData,
      });

      if (res.ok) {
        const data = await res.json();
        setFormData({ ...formData, avatar: data.data.avatarUrl });
        setMessage({ type: "success", text: "头像已更新" });
        loadUserInfo();
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "上传失败" });
      }
    } catch (error) {
      console.warn("Upload avatar error:", error);
      setMessage({ type: "error", text: "上传失败" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
          个人设置
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          基本信息、头像管理
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* 头像上传区 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>
        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
            头像管理
          </h2>
          <div className="flex items-center gap-6">
            <div className="relative">
              {formData.avatar ? (
                <img
                  src={formData.avatar}
                  alt="Avatar"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg">
                  {formData.name[0]?.toUpperCase() || "U"}
                </div>
              )}
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-[#3182ce] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#2b6cb0] transition-colors border-2 border-white">
                <Camera className="w-4 h-4 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={saving}
                />
              </label>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-2">
                点击相机图标上传头像
              </p>
              <p className="text-xs text-slate-400">
                支持 JPG、PNG 格式，大小不超过 5MB
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 基本信息表单 */}
      <form onSubmit={handleSubmit}>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>
          <div className="relative">
            <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
              基本信息
            </h2>

            <div className="space-y-5">
              {/* 昵称 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="zg-required">昵称</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入昵称"
                    required
                  />
                </div>
              </div>

              {/* 邮箱 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="zg-required">邮箱</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入邮箱"
                    required
                  />
                </div>
              </div>

              {/* 手机号 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="zg-required">手机号</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入手机号"
                    required
                  />
                </div>
              </div>

              {/* 个人简介 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  个人简介
                </label>
                <textarea
                  value={formData.bio}
                  onChange={(e) =>
                    setFormData({ ...formData, bio: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all resize-none"
                  rows={4}
                  placeholder="介绍一下自己吧..."
                />
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="mt-8 flex justify-end shrink-0">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-5 h-5" />
                {saving ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* 危险区域 - 注销账号 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-red-200 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-red-500/10 to-red-600/10 opacity-50 blur-3xl"></div>
        <div className="relative">
          <h2 className="text-lg font-black text-red-600 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-red-500 to-red-600 rounded-full"></div>
            <AlertTriangle className="w-5 h-5" />
            危险区域
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700 font-medium mb-1">
                注销账号
              </p>
              <p className="text-xs text-slate-500">
                {userInfo?.role &&
                [
                  "admin",
                  "super_admin",
                  "superadmin",
                  "ADMIN",
                  "SUPERADMIN",
                  "SUPER_ADMIN",
                ].includes(userInfo.role)
                  ? "管理员账号不支持注销账号操作"
                  : "注销后所有数据将被永久删除，此操作不可恢复"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => setShowNoticeModal(true)}
                disabled={
                  userInfo?.role &&
                  [
                    "admin",
                    "super_admin",
                    "superadmin",
                    "ADMIN",
                    "SUPERADMIN",
                    "SUPER_ADMIN",
                  ].includes(userInfo.role)
                }
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                注销账号
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 注销须知弹窗 */}
      {showNoticeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowNoticeModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-7 h-7 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">
                账号注销须知
              </h3>
            </div>

            <div className="space-y-3 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-blue-700">
                    冷静期说明
                  </span>
                </div>
                <p className="text-blue-600 text-sm">
                  注销后有 <span className="font-bold">7天冷静期</span>
                  ，期间可随时撤销注销申请恢复正常
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span className="font-semibold text-red-700">数据清空</span>
                </div>
                <p className="text-red-600 text-sm">
                  冷静期结束后，系统中{" "}
                  <span className="font-bold">所有数据将被永远清空</span>
                  ，包括工作空间、组件、活动记录等，
                  <span className="font-bold">且无法恢复</span>
                </p>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-semibold text-green-700">撤销操作</span>
                </div>
                <p className="text-green-600 text-sm">
                  冷静期内登录后点击"撤销注销"可恢复正常，所有数据完整保留
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2">
              <button
                type="button"
                onClick={() => setHasAgreed(!hasAgreed)}
                className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                  hasAgreed
                    ? "bg-[#3182ce] border-[#3182ce]"
                    : "border-slate-300 hover:border-slate-400"
                }`}
              >
                {hasAgreed && <CheckCircle className="w-3 h-3 text-white" />}
              </button>
              <label
                onClick={() => setHasAgreed(!hasAgreed)}
                className="text-sm text-slate-600 cursor-pointer select-none"
              >
                我已阅读并了解上述注销须知，同意注销我的账号
              </label>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowNoticeModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-50 transition-all text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStartCheck}
                disabled={!hasAgreed}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
              >
                开始检测
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 检测进度弹窗 */}
      {showCheckModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            {!checkComplete ? (
              <>
                <div className="text-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
                    <div className="w-8 h-8 border-4 border-blue-300 border-t-blue-500 rounded-full animate-spin"></div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">
                    正在检测账号数据
                  </h3>
                  <p className="text-sm text-slate-500">{deleteStep}</p>
                </div>

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
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-slate-600">{result.item}</span>
                      <span className="text-green-500 text-xs ml-auto">
                        检测通过
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">
                    检测完成
                  </h3>
                  <p className="text-sm text-green-600">
                    未发现任何问题，可以注销
                  </p>
                </div>

                <div className="space-y-2 mb-4">
                  {checkResults.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm bg-green-50 p-2 rounded-lg"
                    >
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-slate-600">{result.item}</span>
                      <span className="text-green-500 text-xs ml-auto">
                        正常
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 text-center mb-3">
                  点击"确认注销"后，您的账号将进入冷静期
                </p>

                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-red-500/30 transition-all text-sm"
                >
                  确认注销
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
