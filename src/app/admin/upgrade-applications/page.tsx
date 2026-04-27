"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  FileText,
  Phone,
  User,
  AlertCircle,
} from "lucide-react";

interface UpgradeApplication {
  id: string;
  workspaceId: string;
  userId: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  phone?: string | null;
  status: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: string;
    ownerId: string;
  };
}

interface ApplicationData {
  applications: UpgradeApplication[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminUpgradeApplicationsPage() {
  const [applicationData, setApplicationData] =
    useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  useEffect(() => {
    loadApplications(currentPage);
  }, [currentPage, filterStatus]);

  const loadApplications = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(filterStatus !== "all" && { status: filterStatus }),
      });

      const res = await fetch(`/api/admin/upgrade-applications?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) throw new Error("加载申请失败");

      const result = await res.json();
      setApplicationData(result.data);
    } catch (error) {
      console.error("Load applications error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (id: string, status: string) => {
    if (
      !confirm(`确定要${status === "APPROVED" ? "批准" : "拒绝"}这个申请吗？`)
    ) {
      return;
    }

    try {
      setReviewingId(id);
      const res = await fetch("/api/admin/upgrade-applications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
        body: JSON.stringify({ id, status }),
      });

      if (!res.ok) throw new Error("审核失败");

      await loadApplications(currentPage);
    } catch (error) {
      console.error("Review application error:", error);
      alert("审核失败，请重试");
    } finally {
      setReviewingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      PENDING: "bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white",
      APPROVED: "bg-gradient-to-r from-[#10b981] to-[#059669] text-white",
      REJECTED: "bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white",
    };

    const labels: Record<string, string> = {
      PENDING: "待审核",
      APPROVED: "已通过",
      REJECTED: "已拒绝",
    };

    return (
      <span
        className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg ${badges[status] || "bg-gradient-to-r from-slate-400 to-slate-500 text-white"}`}
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
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-[#3182ce]/10 via-[#10b981]/10 to-[#f59e0b]/10 rounded-2xl blur-xl"></div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-white/90 shadow-lg">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 bg-gradient-to-r from-[#3182ce] via-[#10b981] to-[#f59e0b] bg-clip-text text-transparent">
            升级审核管理
          </h1>
          <p className="text-sm text-slate-600 font-medium">
            工作空间升级为企业空间的申请审核
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#3182ce]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">总申请数</div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg">
                <FileText className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] bg-clip-text text-transparent">
              {applicationData?.total || 0}
            </div>
          </div>
        </div>
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#f59e0b]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">待审核</div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-lg">
                <Clock className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#f59e0b] to-[#d97706] bg-clip-text text-transparent">
              {applicationData?.applications.filter(
                (a) => a.status === "PENDING",
              ).length || 0}
            </div>
          </div>
        </div>
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#10b981]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">已通过</div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#10b981] to-[#059669] bg-clip-text text-transparent">
              {applicationData?.applications.filter(
                (a) => a.status === "APPROVED",
              ).length || 0}
            </div>
          </div>
        </div>
        <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#ef4444]/20 to-transparent rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-600 font-bold">已拒绝</div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ef4444] to-[#dc2626] flex items-center justify-center shadow-lg">
                <XCircle className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-3xl font-bold bg-gradient-to-r from-[#ef4444] to-[#dc2626] bg-clip-text text-transparent">
              {applicationData?.applications.filter(
                (a) => a.status === "REJECTED",
              ).length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-lg p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-[#3182ce]/5 via-[#10b981]/5 to-[#f59e0b]/5 rounded-2xl pointer-events-none"></div>
        <div className="relative flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索公司名、联系人..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-white/50 rounded-xl bg-white/60 backdrop-blur-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-300"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-5 py-3 border border-white/50 rounded-xl bg-white/60 backdrop-blur-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all duration-300 font-bold text-slate-700"
          >
            <option value="all">全部状态</option>
            <option value="PENDING">待审核</option>
            <option value="APPROVED">已通过</option>
            <option value="REJECTED">已拒绝</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-lg overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#3182ce]/5 via-[#10b981]/5 to-[#f59e0b]/5 pointer-events-none"></div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-bold">加载申请列表中...</p>
            </div>
          </div>
        ) : applicationData?.applications.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[#3182ce]/10 to-[#10b981]/10 flex items-center justify-center">
              <Building2 className="w-10 h-10 text-[#3182ce] opacity-50" />
            </div>
            <p className="text-slate-600 font-bold text-lg">暂无升级申请</p>
            <p className="text-slate-500 text-sm mt-2">
              工作空间升级申请将显示在这里
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/50">
            {applicationData?.applications.map((app) => (
              <div
                key={app.id}
                className="p-6 hover:bg-gradient-to-r hover:from-[#3182ce]/5 hover:to-transparent transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-bold text-slate-800">
                        {app.companyName}
                      </h3>
                      {getStatusBadge(app.status)}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-600">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">
                          联系人：{app.contactName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">
                          联系电话：{app.contactPhone}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">
                          工作空间：{app.workspace.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">
                          申请时间：{formatTimeAgo(app.submittedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {app.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(app.id, "APPROVED")}
                        disabled={reviewingId === app.id}
                        className="px-5 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] text-white rounded-xl hover:shadow-lg transition-all duration-300 disabled:opacity-50 flex items-center gap-2 font-bold"
                      >
                        <CheckCircle className="w-4 h-4" />
                        通过
                      </button>
                      <button
                        onClick={() => handleReview(app.id, "REJECTED")}
                        disabled={reviewingId === app.id}
                        className="px-5 py-2.5 bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white rounded-xl hover:shadow-lg transition-all duration-300 disabled:opacity-50 flex items-center gap-2 font-bold"
                      >
                        <XCircle className="w-4 h-4" />
                        拒绝
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {applicationData && applicationData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-white/50 bg-gradient-to-r from-[#3182ce]/5 via-[#10b981]/5 to-[#f59e0b]/5 flex items-center justify-between">
            <div className="text-sm text-slate-600 font-bold">
              共 <span className="text-[#3182ce]">{applicationData.total}</span>{" "}
              条记录，第{" "}
              <span className="text-[#3182ce]">{applicationData.page}</span> /{" "}
              <span className="text-[#3182ce]">
                {applicationData.totalPages}
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
                    Math.min(applicationData.totalPages, p + 1),
                  )
                }
                disabled={currentPage === applicationData.totalPages}
                className="px-5 py-2.5 text-sm font-bold border border-white/50 rounded-xl bg-white/60 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gradient-to-r hover:from-[#3182ce] hover:to-[#2b6cb0] hover:text-white hover:border-transparent hover:shadow-lg transition-all duration-300"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 审核说明 */}
      <div className="group relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-lg p-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-[#3182ce]/10 via-[#10b981]/10 to-[#f59e0b]/10 pointer-events-none"></div>
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg flex-shrink-0">
            <AlertCircle className="w-6 h-6 text-white" />
          </div>
          <div className="text-sm text-slate-700">
            <p className="font-bold text-slate-800 mb-2 text-base">审核说明</p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-600">
              <li>通过申请后，工作空间将升级为企业空间类型</li>
              <li>企业空间享有更多成员配额和高级功能</li>
              <li>审核前请仔细核实申请信息的真实性</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
