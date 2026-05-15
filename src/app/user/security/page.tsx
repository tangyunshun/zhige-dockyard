"use client";

import React, { useState, useEffect } from "react";
import {
  Lock,
  Key,
  Shield,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  LogIn,
  Monitor,
  Smartphone,
  Globe,
  MapPin,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface LoginHistory {
  id: string;
  ipAddress: string;
  userAgent: string;
  location: string;
  device: string;
  loginAt: string;
}

export default function UserSecurityPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    loadLoginHistory();
  }, []);

  const loadLoginHistory = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/login-history?limit=10", {
        headers: { Authorization: `Bearer ${userId}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLoginHistory(data.loginHistory || []);
      }
    } catch (error) {
      console.warn("Load login history error:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // 验证
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setMessage({ type: "error", text: "请填写所有字段" });
      return;
    }

    if (formData.newPassword.length < 6) {
      setMessage({ type: "error", text: "新密码长度至少 6 位" });
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ type: "error", text: "两次输入的新密码不一致" });
      return;
    }

    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "密码已修改成功" });
        setFormData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        const error = await res.json();
        setMessage({ type: "error", text: error.message || "修改失败" });
      }
    } catch (error) {
      console.error("Change password error:", error);
      setMessage({ type: "error", text: "修改失败" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
          账号安全
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          密码修改、登录记录、账号保护
        </p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 shrink-0 ${
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

      {/* 修改密码 */}
      <form onSubmit={handleSubmit}>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#3182ce]" />
              </div>
              <h2 className="text-lg font-black text-slate-800">修改密码</h2>
            </div>

            <div className="space-y-5">
              {/* 当前密码 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="zg-required">当前密码</span>
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPasswords.current ? "text" : "password"}
                    value={formData.currentPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, currentPassword: e.target.value })
                    }
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入当前密码"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({ ...showPasswords, current: !showPasswords.current })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 新密码 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="zg-required">新密码</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPasswords.new ? "text" : "password"}
                    value={formData.newPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, newPassword: e.target.value })
                    }
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请输入新密码（至少 6 位）"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({ ...showPasswords, new: !showPasswords.new })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 确认新密码 */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <span className="zg-required">确认新密码</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showPasswords.confirm ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({ ...formData, confirmPassword: e.target.value })
                    }
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                    placeholder="请再次输入新密码"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="mt-8 flex justify-end shrink-0">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Shield className="w-5 h-5" />
                {loading ? "修改中..." : "修改密码"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* 登录历史记录 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                <LogIn className="w-5 h-5 text-[#10b981]" />
              </div>
              <h2 className="text-lg font-black text-slate-800">登录历史记录</h2>
            </div>
            <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1.5 rounded-full">
              最近 10 次
            </span>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[#10b981]/30 border-t-[#10b981] rounded-full animate-spin"></div>
            </div>
          ) : loginHistory.length > 0 ? (
            <div className="space-y-2">
              {loginHistory.map((record) => {
                const isMobile = record.userAgent.toLowerCase().includes("mobile");
                return (
                  <div
                    key={record.id}
                    className="group flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-white hover:shadow-md transition-all duration-300 border border-slate-200"
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-white font-bold shadow-md">
                      {isMobile ? (
                        <Smartphone className="w-5 h-5" />
                      ) : (
                        <Monitor className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-slate-800">
                          {record.device || (isMobile ? "移动设备" : "桌面设备")}
                        </span>
                        <span className="text-xs text-[#10b981] font-medium bg-[#10b981]/10 px-2 py-0.5 rounded-full">
                          成功
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {record.location || "未知地点"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {record.ipAddress || "未知 IP"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(record.loginAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <LogIn className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-sm">暂无登录记录</p>
            </div>
          )}
        </div>
      </div>

      {/* 安全提示 */}
      <div className="relative bg-gradient-to-br from-[#f59e0b]/5 to-[#d97706]/5 rounded-2xl border border-[#f59e0b]/20 p-6 overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-[#f59e0b]/10 opacity-50 blur-3xl"></div>
        <div className="relative">
          <h3 className="text-base font-black text-[#d97706] mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            安全提示
          </h3>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-[#f59e0b] mt-1">•</span>
              <span>密码长度至少 6 位，建议使用大小写字母、数字和符号的组合</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#f59e0b] mt-1">•</span>
              <span>不要使用过于简单的密码（如 123456、password 等）</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#f59e0b] mt-1">•</span>
              <span>定期更换密码可以保护账号安全</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#f59e0b] mt-1">•</span>
              <span>不要将密码告诉他人，包括系统管理员</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#f59e0b] mt-1">•</span>
              <span>如发现异常登录记录，请立即修改密码并联系客服</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
