"use client";

import { useState, useEffect } from "react";
import { Mail, Bell, Settings, Search, CheckCircle, XCircle, Clock } from "lucide-react";

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
  const [notificationData, setNotificationData] = useState<NotificationData | null>(null);
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
      REALTIME: "bg-green-100 text-green-700",
      DAILY: "bg-blue-100 text-blue-700",
      WEEKLY: "bg-purple-100 text-purple-700",
    };

    const labels: Record<string, string> = {
      REALTIME: "实时",
      DAILY: "每日",
      WEEKLY: "每周",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-bold ${badges[frequency] || "bg-slate-100 text-slate-700"}`}
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
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">通知管理</h1>
        <p className="text-sm text-slate-500">用户通知设置与系统消息配置</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总用户数</div>
            <Bell className="w-5 h-5 text-[#3182ce]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {notificationData?.total || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">邮件通知开启</div>
            <Mail className="w-5 h-5 text-[#10b981]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {notificationData?.notifications.filter((n) => n.emailNotifications).length || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">系统消息开启</div>
            <Settings className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {notificationData?.notifications.filter((n) => n.systemMessages).length || 0}
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载通知设置中...</p>
            </div>
          </div>
        ) : notificationData?.notifications.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无通知设置数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    通知频率
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    邮件通知
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    系统消息
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    项目更新
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    评论提及
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {notificationData?.notifications.map((notification) => (
                  <tr key={notification.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {notification.user.avatar ? (
                          <img
                            src={notification.user.avatar}
                            alt={notification.user.name || ""}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold">
                            {notification.user.name?.charAt(0) ||
                              notification.user.email?.charAt(0) ||
                              "?"}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800">
                            {notification.user.name || "未知用户"}
                          </div>
                          <div className="text-xs text-slate-500">
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
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {notification.systemMessages ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {notification.projectUpdates ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {notification.commentMentions ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-slate-400" />
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
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {notificationData.total} 条记录，第 {notificationData.page} /{" "}
              {notificationData.totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                上一页
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(notificationData.totalPages, p + 1))
                }
                disabled={currentPage === notificationData.totalPages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
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
