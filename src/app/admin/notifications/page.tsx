"use client";

import { useState, useEffect } from "react";
import {
  Mail,
  Bell,
  Settings,
  Search,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface UserNotification {
  id: string;
  userId: string;
  emailNotifications: boolean;
  systemMessages: boolean;
  projectUpdates: boolean;
  commentMentions: boolean;
  frequency: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface NotificationData {
  notifications: UserNotification[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminNotificationsPage() {
  const [notificationData, setNotificationData] =
    useState<NotificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadNotifications(currentPage);
  }, [currentPage]);

  const loadNotifications = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      const res = await fetch(`/api/admin/notifications?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) throw new Error("加载通知设置失败");

      const result = await res.json();
      setNotificationData(result.data);
    } catch (error) {
      console.error("Load notifications error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getFrequencyBadge = (frequency: string) => {
    const badges: Record<string, string> = {
      REALTIME: "bg-gradient-to-r from-[#10b981] to-[#059669] text-white",
      DAILY: "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white",
      WEEKLY: "bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white",
    };

    const labels: Record<string, string> = {
      REALTIME: "实时",
      DAILY: "每日",
      WEEKLY: "每周",
    };

    return (
      <span
        className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg ${badges[frequency] || "bg-gradient-to-r from-slate-400 to-slate-500 text-white"}`}
      >
        {labels[frequency] || frequency}
      </span>
    );
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "刚刚";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}小时前`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-[#3182ce]/10 via-[#10b981]/10 to-[#f59e0b]/10 rounded-2xl blur-xl"></div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-white/90 shadow-lg">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 bg-gradient-to-r from-[#3182ce] via-[#10b981] to-[#f59e0b] bg-clip-text text-transparent">
            通知管理
          </h1>
          <p className="text-sm text-slate-600 font-medium">
            用户通知设置与系统消息配置
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#3182ce]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">总用户数</div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg">
                <Bell className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] bg-clip-text text-transparent">
              {notificationData?.total || 0}
            </div>
          </div>
        </div>
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#10b981]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">
                邮件通知开启
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                <Mail className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#10b981] to-[#059669] bg-clip-text text-transparent">
              {notificationData?.notifications.filter(
                (n) => n.emailNotifications,
              ).length || 0}
            </div>
          </div>
        </div>
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#f59e0b]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">
                系统消息开启
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-lg">
                <Settings className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#f59e0b] to-[#d97706] bg-clip-text text-transparent">
              {notificationData?.notifications.filter((n) => n.systemMessages)
                .length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-lg overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#3182ce]/5 via-[#10b981]/5 to-[#f59e0b]/5 pointer-events-none"></div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-bold">加载通知设置中...</p>
            </div>
          </div>
        ) : notificationData?.notifications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#3182ce]/10 to-[#10b981]/10 flex items-center justify-center">
              <Bell className="w-10 h-10 text-[#3182ce] opacity-50" />
            </div>
            <p className="text-slate-600 font-bold text-lg">暂无通知设置数据</p>
            <p className="text-slate-500 text-sm mt-2">
              用户通知偏好设置将显示在这里
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-[#3182ce]/10 via-[#10b981]/10 to-[#f59e0b]/10 border-b border-white/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    通知频率
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    邮件通知
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    系统消息
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    项目更新
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    评论提及
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/50">
                {notificationData?.notifications.map((notification) => (
                  <tr
                    key={notification.id}
                    className="hover:bg-gradient-to-r hover:from-[#3182ce]/5 hover:to-transparent transition-all duration-300"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {notification.user.avatar ? (
                          <img
                            src={notification.user.avatar}
                            alt={notification.user.name || ""}
                            className="w-10 h-10 rounded-xl shadow-md"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shadow-md">
                            {notification.user.name?.charAt(0) ||
                              notification.user.email?.charAt(0) ||
                              "?"}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800">
                            {notification.user.name || "未知用户"}
                          </div>
                          <div className="text-xs text-slate-500 font-medium">
                            {notification.user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getFrequencyBadge(notification.frequency)}
                    </td>
                    <td className="px-6 py-4">
                      {notification.emailNotifications ? (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow-lg">
                          <XCircle className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {notification.systemMessages ? (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow-lg">
                          <XCircle className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {notification.projectUpdates ? (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow-lg">
                          <XCircle className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {notification.commentMentions ? (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow-lg">
                          <XCircle className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {notificationData && notificationData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-white/50 bg-gradient-to-r from-[#3182ce]/5 via-[#10b981]/5 to-[#f59e0b]/5 flex items-center justify-between">
            <div className="text-sm text-slate-600 font-bold">
              共{" "}
              <span className="text-[#3182ce]">{notificationData.total}</span>{" "}
              条记录，第{" "}
              <span className="text-[#3182ce]">{notificationData.page}</span> /{" "}
              <span className="text-[#3182ce]">
                {notificationData.totalPages}
              </span>{" "}
              页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-5 py-2.5 text-sm font-bold border border-white/50 rounded-xl bg-white/60 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gradient-to-r hover:from-[#3182ce] hover:to-[#2b6cb0] hover:text-white hover:border-transparent hover:shadow-lg transition-all duration-300"
              >
                上一页
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(notificationData.totalPages, p + 1),
                  )
                }
                disabled={currentPage === notificationData.totalPages}
                className="px-5 py-2.5 text-sm font-bold border border-white/50 rounded-xl bg-white/60 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gradient-to-r hover:from-[#3182ce] hover:to-[#2b6cb0] hover:text-white hover:border-transparent hover:shadow-lg transition-all duration-300"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
