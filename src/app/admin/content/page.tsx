"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Search,
  Settings,
  Tag,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
} from "lucide-react";

interface Component {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  } | null;
}

interface ComponentData {
  components: Component[];
  total: number;
  page: number;
  totalPages: number;
  types: string[];
}

export default function AdminContentPage() {
  const [activeTab, setActiveTab] = useState<
    "components" | "phases" | "documents"
  >("components");
  const [componentData, setComponentData] = useState<ComponentData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadComponents(currentPage);
  }, [currentPage, filterStatus, filterType]);

  const loadComponents = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(filterStatus !== "all" && { status: filterStatus }),
        ...(filterType !== "all" && { type: filterType }),
      });

      const res = await fetch(`/api/admin/components?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) throw new Error("加载组件失败");

      const result = await res.json();
      setComponentData(result.data);
    } catch (error) {
      console.error("Load components error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      completed: "bg-green-100 text-green-700",
      pending: "bg-yellow-100 text-yellow-700",
      processing: "bg-blue-100 text-blue-700",
      failed: "bg-red-100 text-red-700",
    };

    const labels: Record<string, string> = {
      completed: "已上线",
      pending: "开发中",
      processing: "测试中",
      failed: "已下线",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-bold ${badges[status] || "bg-slate-100 text-slate-700"}`}
      >
        {labels[status] || status}
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
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          内容管理
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          组件管理、阶段管理、文档管理 · 知阁·舟坊
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">
                总组件数
              </div>
              <FileText className="w-6 h-6 text-[#3182ce]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {componentData?.total || 0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">已上线</div>
              <CheckCircle className="w-6 h-6 text-[#10b981]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {componentData?.components.filter((c) => c.status === "completed")
                .length || 0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">开发中</div>
              <Clock className="w-6 h-6 text-[#f59e0b]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {componentData?.components.filter((c) => c.status === "pending")
                .length || 0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">
                阶段类型
              </div>
              <Tag className="w-6 h-6 text-[#8b5cf6]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {componentData?.types.length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

        <div className="relative flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("components")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "components"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="w-4 h-4" />
            组件管理
          </button>
          <button
            onClick={() => setActiveTab("phases")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "phases"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Settings className="w-4 h-4" />
            阶段管理
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "documents"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="w-4 h-4" />
            文档管理
          </button>
        </div>

        {/* 组件管理 */}
        {activeTab === "components" && (
          <div className="relative p-6 space-y-4">
            {/* 筛选栏 */}
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索组件名称..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
              >
                <option value="all">全部状态</option>
                <option value="completed">已上线</option>
                <option value="pending">开发中</option>
                <option value="processing">测试中</option>
                <option value="failed">已下线</option>
              </select>
              {componentData?.types && (
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                >
                  <option value="all">全部阶段</option>
                  {componentData.types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 组件列表 */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-slate-600 font-medium">
                    加载组件列表中...
                  </p>
                </div>
              </div>
            ) : componentData?.components.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium text-sm">
                  暂无组件数据
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        组件信息
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        阶段
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        进度
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        更新时间
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {componentData?.components.map((component) => (
                      <tr
                        key={component.id}
                        className="group hover:bg-white/60 transition-all duration-300"
                      >
                        <td className="px-6 py-4">
                          <div>
                            <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                              {component.name}
                            </div>
                            {component.description && (
                              <div className="text-xs text-slate-500 font-medium mt-1">
                                {component.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full">
                            {component.type}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(component.status)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden w-24">
                              <div
                                className="h-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] rounded-full"
                                style={{ width: `${component.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-slate-600 w-8">
                              {component.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatTimeAgo(component.updatedAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-[#3182ce] hover:bg-[#3182ce]/10 rounded-lg transition-colors">
                            <Settings className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 分页 */}
            {componentData && componentData.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  共 {componentData.total} 条记录，第 {componentData.page} /{" "}
                  {componentData.totalPages} 页
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
                      setCurrentPage((p) =>
                        Math.min(componentData.totalPages, p + 1),
                      )
                    }
                    disabled={currentPage === componentData.totalPages}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 阶段管理 */}
        {activeTab === "phases" && (
          <div className="p-6">
            <div className="text-center py-20 text-slate-400">
              <Settings className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>阶段管理功能开发中</p>
              <p className="text-sm mt-2">管理组件的开发阶段和标签</p>
            </div>
          </div>
        )}

        {/* 文档管理 */}
        {activeTab === "documents" && (
          <div className="p-6">
            <div className="text-center py-20 text-slate-400">
              <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>文档管理功能开发中</p>
              <p className="text-sm mt-2">管理系统文档和使用教程</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
