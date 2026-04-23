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
  const [applicationData, setApplicationData] = useState<ApplicationData | null>(null);
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
    if (!confirm(`确定要${status === "APPROVED" ? "批准" : "拒绝"}这个申请吗？`)) {
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
      PENDING: "bg-yellow-100 text-yellow-700",
      APPROVED: "bg-green-100 text-green-700",
      REJECTED: "bg-red-100 text-red-700",
    };

    const labels: Record<string, string> = {
      PENDING: "待审核",
      APPROVED: "已通过",
      REJECTED: "已拒绝",
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
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">升级审核管理</h1>
        <p className="text-sm text-slate-500">
          工作空间升级为企业空间的申请审核
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总申请数</div>
            <FileText className="w-5 h-5 text-[#3182ce]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {applicationData?.total || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">待审核</div>
            <Clock className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {applicationData?.applications.filter((a) => a.status === "PENDING").length || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">已通过</div>
            <CheckCircle className="w-5 h-5 text-[#10b981]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {applicationData?.applications.filter((a) => a.status === "APPROVED").length || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">已拒绝</div>
            <XCircle className="w-5 h-5 text-[#ef4444]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {applicationData?.applications.filter((a) => a.status === "REJECTED").length || 0}
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索公司名、联系人..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          >
            <option value="all">全部状态</option>
            <option value="PENDING">待审核</option>
            <option value="APPROVED">已通过</option>
            <option value="REJECTED">已拒绝</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载申请列表中...</p>
            </div>
          </div>
        ) : applicationData?.applications.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Building2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无升级申请</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {applicationData?.applications.map((app) => (
              <div key={app.id} className="p-6 hover:bg-slate-50">
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
                        <span>联系人：{app.contactName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <span>联系电话：{app.contactPhone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span>工作空间：{app.workspace.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>申请时间：{formatTimeAgo(app.submittedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {app.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReview(app.id, "APPROVED")}
                        disabled={reviewingId === app.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        通过
                      </button>
                      <button
                        onClick={() => handleReview(app.id, "REJECTED")}
                        disabled={reviewingId === app.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
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
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {applicationData.total} 条记录，第 {applicationData.page} /{" "}
              {applicationData.totalPages} 页
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
                    Math.min(applicationData.totalPages, p + 1)
                  )
                }
                disabled={currentPage === applicationData.totalPages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 审核说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-bold mb-1">审核说明</p>
            <ul className="list-disc list-inside space-y-1">
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
