"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, RefreshCw, CheckCircle2, Search, ArrowLeft, Eye, X, ExternalLink, Trash2 } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import { useToast } from "@/components/Toast";

interface NotificationItem {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  type: string;
  createdAt: number;
  link?: string | null;
}

export default function MessagesPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "read">("all");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // 选中的消息长文本详情 Modal
  const [detailNotify, setDetailNotify] = useState<NotificationItem | null>(null);

  // 加载通知消息数据
  const loadNotifications = async () => {
    try {
      setLoading(true);
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/list", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include"
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.list || []);
      }
    } catch (e) {
      console.error("加载消息通知失败:", e);
      toast.error("加载消息通知失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // 标记单条为已读
  const handleMarkAsRead = async (id: string) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.list || []);
        // 全局广播通知事件，让顶部小铃铛未读数字实时减 1
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
        }
      }
    } catch (e) {
      console.error("操作失败:", e);
    }
  };

  // 点击卡片：查看详情 + 自动标已读
  const handleOpenDetail = (item: NotificationItem) => {
    setDetailNotify(item);
    if (!item.isRead) {
      handleMarkAsRead(item.id);
    }
  };

  // 一键全部标记为已读
  const handleMarkAllRead = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({ all: true })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.list || []);
        toast.success("已将所有消息标记为已读");
        // 全局广播通知事件
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
        }
      }
    } catch (e) {
      toast.error("操作失败");
    }
  };

  // 删除单条通知
  const handleDelete = async (id: string) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.list || []);
        toast.success("通知已删除");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
        }
      } else {
        toast.error("删除失败，请稍后重试");
      }
    } catch (e) {
      console.error("删除通知失败:", e);
      toast.error("删除失败，请稍后重试");
    }
  };

  // 清空全部已读通知（保留未读）
  const handleClearRead = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({ allRead: true })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.list || []);
        toast.success("已清空全部已读通知");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
        }
      } else {
        toast.error("清空失败，请稍后重试");
      }
    } catch (e) {
      console.error("清空已读通知失败:", e);
      toast.error("清空失败，请稍后重试");
    }
  };

  // 计算过滤后的消息列表与计数
  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const readCount = useMemo(() => notifications.filter(n => n.isRead).length, [notifications]);

  const filteredList = useMemo(() => {
    return notifications.filter(item => {
      // 1. 已读/未读 Tab 筛选
      if (activeTab === "unread" && item.isRead) return false;
      if (activeTab === "read" && !item.isRead) return false;

      // 2. 类别筛选
      if (selectedType !== "ALL" && item.type !== selectedType) return false;

      // 3. 关键字搜索
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (item.title || "").toLowerCase().includes(q);
        const matchContent = (item.content || "").toLowerCase().includes(q);
        return matchTitle || matchContent;
      }

      return true;
    });
  }, [notifications, activeTab, selectedType, searchQuery]);

  const typeLabels: Record<string, string> = {
    system: "系统通知",
    task: "任务处理",
    security: "安全隔离"
  };

  const badgeStyles: Record<string, string> = {
    system: "bg-blue-50 text-blue-600 border-blue-100",
    task: "bg-emerald-50 text-emerald-600 border-emerald-100",
    security: "bg-amber-50 text-amber-600 border-amber-100"
  };

  // 根据消息内容推断对应的功能入口链接；没有对应功能时返回 null，不显示"进入功能"按钮
  const getActionLink = (item: NotificationItem): string | null => {
    if (item.link) return item.link;
    const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
    if (item.type === "task" || text.includes("任务")) return "/tasks";
    if (item.type === "security" || text.includes("安全") || text.includes("隔离")) return "/security";
    if (text.includes("资料")) return "/studio";
    if (text.includes("知识")) return "/knowledge";
    if (text.includes("组件") || text.includes("市场")) return "/market";
    if (text.includes("工作空间") || text.includes("空间")) return "/workspace-hub";
    if (text.includes("设置")) return "/settings";
    return null;
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 flex flex-col font-sans">
      <GlobalHeader />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 顶部 Hero Header 面板 */}
        <div className="bg-white border border-slate-200/80 p-5 sm:p-6 rounded-2xl shadow-xs text-left flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-slate-600 cursor-pointer"
              title="返回上一页"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[#3182ce]" /> 消息与通知中心
                </h1>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  未读 <strong className="text-red-600 font-mono">{unreadCount}</strong> 条 / 已读 <strong className="text-emerald-600 font-mono">{readCount}</strong> 条
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                实时接收工作台任务执行结果、系统关键变更与企业级物理安全隔离告警
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={loadNotifications}
              className="h-9 px-3 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>刷新</span>
            </button>
            {readCount > 0 && (
              <button
                type="button"
                onClick={handleClearRead}
                className="h-9 px-3 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                <span>清空已读</span>
              </button>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="h-9 px-4 text-xs font-black bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl shadow-xs hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckCheck className="w-4 h-4" />
                <span>全部标记为已读</span>
              </button>
            )}
          </div>
        </div>

        {/* 筛选与 Tab 操作区 */}
        <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs space-y-3 text-left">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            {/* 状态 Tab */}
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  activeTab === "all" ? "bg-white text-[#3182ce] shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                全部消息 ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("unread")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  activeTab === "unread" ? "bg-white text-red-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                未读消息 ({unreadCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("read")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  activeTab === "read" ? "bg-white text-emerald-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                已读消息 ({readCount})
              </button>
            </div>

            {/* 类别与关键字搜索 */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative min-w-[130px]">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs font-extrabold bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-700 cursor-pointer"
                >
                  <option value="ALL">所有消息类别</option>
                  <option value="system">系统通知</option>
                  <option value="task">任务处理</option>
                  <option value="security">安全隔离</option>
                </select>
              </div>

              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索消息标题或内容..."
                  className="w-full h-8 pl-8 pr-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-[#3182ce]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 消息列表主体 */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white border border-slate-200/80 p-12 rounded-2xl text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-[#3182ce] animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-semibold">正在同步加载通知消息数据...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="bg-white border border-slate-200/80 p-12 rounded-2xl text-center space-y-3">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-bold">暂无匹配的通知消息记录</p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.id}
                onClick={() => handleOpenDetail(item)}
                className={`bg-white border p-4 sm:p-5 rounded-2xl text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer relative ${
                  !item.isRead
                    ? "border-blue-200/90 shadow-xs bg-gradient-to-r from-blue-50/40 via-white to-white"
                    : "border-slate-200/80 opacity-80"
                }`}
              >
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badgeStyles[item.type] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {typeLabels[item.type] || "通用通知"}
                    </span>
                    <h3 className={`text-sm ${!item.isRead ? "font-black text-slate-900" : "font-bold text-slate-600"}`}>
                      {item.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-mono font-medium">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                    {!item.isRead ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-[#3182ce] rounded-full animate-pulse" /> 未读
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 已读
                      </span>
                    )}
                  </div>
                </div>

                <p className={`text-xs sm:text-sm leading-relaxed mt-1.5 line-clamp-2 ${!item.isRead ? "text-slate-700 font-medium" : "text-slate-500 font-normal"}`}>
                  {item.content}
                </p>

                <div className="mt-3 pt-2.5 border-t border-slate-100/70 flex justify-between items-center text-xs">
                  <span className="text-[11px] text-slate-400 font-bold">编号: {item.id}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(item);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" /> 查看详情
                    </button>
                    {getActionLink(item) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(getActionLink(item)!);
                        }}
                        className="px-2.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> 进入功能
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      className="px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-red-500 hover:bg-red-50 font-black rounded-lg transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* 消息长文本无损详情 Modal */}
      {detailNotify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 text-left">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-xl w-full p-6 text-left space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200 relative">
            <div className="flex justify-between items-center pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${badgeStyles[detailNotify.type] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {typeLabels[detailNotify.type] || "通用通知"}
                </span>
                <span className="text-xs text-slate-400 font-mono font-bold">{new Date(detailNotify.createdAt).toLocaleString()}</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailNotify(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-snug">
                {detailNotify.title}
              </h3>
              
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs sm:text-sm leading-relaxed text-slate-700 font-medium whitespace-pre-wrap select-text">
                {detailNotify.content}
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-[#2b6cb0] font-semibold flex items-center justify-between">
                <span>消息编号: <strong className="font-mono">{detailNotify.id}</strong></span>
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 已自动同步标记为已读
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              {getActionLink(detailNotify) && (
                <button
                  type="button"
                  onClick={() => {
                    setDetailNotify(null);
                    router.push(getActionLink(detailNotify)!);
                  }}
                  className="zg-btn zg-btn-primary h-9 px-4 text-xs font-bold flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> 进入功能
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailNotify(null)}
                className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                关闭窗口
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
