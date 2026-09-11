"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  Settings,
  FolderOpen,
  Box,
  CreditCard,
  Shield,
  X,
  Eye,
  Info,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface UserActivity {
  id: string;
  action: string;
  description: string;
  resourceType?: string | null;
  resourceId?: string | null;
  createdAt: string;
  metadata?: any;
}

export default function UserActivitiesPage() {
  const toast = useToast();
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | string>("ALL");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<UserActivity | null>(null);
  const [copiedMetadata, setCopiedMetadata] = useState(false);

  useEffect(() => {
    loadActivities(false);
  }, []);

  const loadActivities = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const authToken = getAuthToken();

      const res = await fetch("/api/user/activities?limit=100", {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        setActivities(data.data || []);
        if (isManual) {
          toast.success("操作日志已刷新");
        }
      } else {
        if (isManual) toast.error("加载日志失败，请重试");
      }
    } catch (error) {
      console.error("Load activities error:", error);
      if (isManual) toast.error("网络异常，无法加载日志");
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  const copyMetadata = (data: any) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedMetadata(true);
      toast.success("元数据 JSON 已复制到剪贴板");
      setTimeout(() => setCopiedMetadata(false), 2000);
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const filteredActivities = activities.filter((activity) => {
    const matchesSearch = activity.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "ALL" || activity.resourceType === filterType;
    return matchesSearch && matchesType;
  });

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  const getActivityIcon = (resourceType: string | null | undefined) => {
    switch (resourceType) {
      case "workspace":
        return FolderOpen;
      case "component":
        return Box;
      case "membership":
        return CreditCard;
      case "profile":
        return User;
      case "security":
        return Shield;
      default:
        return Settings;
    }
  };

  const getActivityColor = (resourceType: string | null | undefined) => {
    switch (resourceType) {
      case "workspace":
        return "bg-[#3182ce]";
      case "component":
        return "bg-[#10b981]";
      case "membership":
        return "bg-[#f59e0b]";
      case "profile":
        return "bg-[#8b5cf6]";
      case "security":
        return "bg-[#ef4444]";
      default:
        return "bg-slate-400";
    }
  };

  const handleViewDetail = (activity: UserActivity) => {
    setSelectedActivity(activity);
    setShowDetailModal(true);
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
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
            操作日志
          </h1>
          <p className="text-sm text-slate-500 font-medium truncate">
            查看您的全链路操作审计与活动历史记录
          </p>
        </div>
        <button
          onClick={() => loadActivities(true)}
          disabled={refreshing}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:border-[#3182ce] hover:text-[#3182ce] hover:bg-[#3182ce]/5 transition-all shadow-xs disabled:opacity-50"
          title="刷新操作日志"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
          <span>{refreshing ? "刷新中..." : "刷新日志"}</span>
        </button>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-4 shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索活动记录..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 transition-all outline-none bg-white"
          >
            <option value="ALL">全部类型</option>
            <option value="workspace">工作空间</option>
            <option value="component">组件</option>
            <option value="membership">会员</option>
            <option value="profile">个人资料</option>
            <option value="security">账号安全</option>
          </select>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 shrink-0">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                <Activity className="w-7 h-7 text-[#3182ce]" />
              </div>
              <Clock className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {activities.length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">总活动数</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                <FolderOpen className="w-7 h-7 text-[#10b981]" />
              </div>
              <Calendar className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {activities.filter((a) => a.resourceType === "workspace").length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">空间相关</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/20 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center">
                <Box className="w-7 h-7 text-[#f59e0b]" />
              </div>
              <Activity className="w-5 h-5 text-purple-500" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1">
              {activities.filter((a) => a.resourceType === "component").length}
            </div>
            <div className="text-sm text-slate-500 font-semibold">组件相关</div>
          </div>
        </div>
      </div>

      {/* 活动列表 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
              活动记录
            </h2>
            <span className="text-sm text-slate-500 font-medium">
              共 {filteredActivities.length} 条记录
            </span>
          </div>

          {filteredActivities.length > 0 ? (
            <div className="space-y-2">
              {filteredActivities.map((activity) => {
                const Icon = getActivityIcon(activity.resourceType);
                const color = getActivityColor(activity.resourceType);

                return (
                  <div
                    key={activity.id}
                    className="group flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-all duration-300 hover:-translate-x-1"
                  >
                    <div className={`w-11 h-11 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(activity.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-400 font-medium bg-slate-100 px-3 py-1.5 rounded-full">
                      {formatTimeAgo(activity.createdAt)}
                    </div>
                    <button
                      onClick={() => handleViewDetail(activity)}
                      className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Activity className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-2">暂无活动记录</h3>
              <p className="text-slate-500">您的操作活动将显示在这里</p>
            </div>
          )}
        </div>
      </div>

      {/* 详情查看模态框 */}
      {showDetailModal && selectedActivity && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setShowDetailModal(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-full ${getActivityColor(selectedActivity.resourceType)} flex items-center justify-center text-white font-bold shadow-md`}>
                  {getActivityIcon(selectedActivity.resourceType)({ className: "w-6 h-6" })}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">活动详情</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {new Date(selectedActivity.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#3182ce]" />
                  活动描述
                </h4>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-4">
                  {selectedActivity.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">活动类型</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    {getActivityIcon(selectedActivity.resourceType)({ className: "w-5 h-5 text-[#3182ce]" })}
                    <span className="text-sm font-bold text-slate-800">
                      {selectedActivity.resourceType || "其他"}
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">活动操作</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Activity className="w-5 h-5 text-[#10b981]" />
                    <span className="text-sm font-bold text-slate-800">{selectedActivity.action}</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">创建时间</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Calendar className="w-5 h-5 text-[#f59e0b]" />
                    <span className="text-sm font-bold text-slate-800">
                      {new Date(selectedActivity.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">时间戳</h4>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Clock className="w-5 h-5 text-[#8b5cf6]" />
                    <span className="text-xs font-mono text-slate-600">
                      {new Date(selectedActivity.createdAt).toLocaleTimeString("zh-CN")}
                    </span>
                  </div>
                </div>
              </div>

              {selectedActivity.metadata && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-slate-700">元数据 (Metadata)</h4>
                    <button
                      type="button"
                      onClick={() => copyMetadata(selectedActivity.metadata)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#3182ce] bg-[#3182ce]/10 hover:bg-[#3182ce]/20 rounded-lg transition-colors"
                    >
                      {copiedMetadata ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedMetadata ? "已复制" : "复制 JSON"}</span>
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-700 bg-slate-900/5 border border-slate-200 rounded-xl p-4 overflow-auto max-h-48 leading-relaxed">
                    {JSON.stringify(selectedActivity.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
