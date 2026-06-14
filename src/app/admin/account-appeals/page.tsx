"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  FileText,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Phone,
  Mail,
  AlertCircle,
  Shield,
  Calendar,
} from "lucide-react";

interface Appeal {
  id: string;
  userId: string;
  userAccount: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  banReason: string;
  appealReason: string;
  appealEvidence?: string;
  contactInfo?: string;
  status: "pending" | "approved" | "rejected";
  adminId?: string;
  adminName?: string;
  adminComment?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AppealData {
  appeals: Appeal[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function AdminAccountAppealsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [appealData, setAppealData] = useState<AppealData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchAccount, setSearchAccount] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  // 加载申诉列表
  const loadAppeals = async (page: number, status?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (status) params.append("status", status);

      const res = await fetch(`/api/admin/account-appeals?${params}`);
      const data = await res.json();

      if (res.ok) {
        setAppealData(data.data);
      } else {
        toast.error(data.message || "加载失败");
      }
    } catch (error) {
      console.error("Load appeals error:", error);
      toast.error("加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppeals(currentPage, statusFilter === "all" ? undefined : statusFilter);
  }, [currentPage, statusFilter]);

  // 处理申诉
  const handleProcessAppeal = async (
    appealId: string,
    status: "approved" | "rejected",
    adminComment?: string,
  ) => {
    setConfirmDialog({
      isOpen: true,
      title: status === "approved" ? "批准申诉" : "驳回申诉",
      message: `确认要${status === "approved" ? "批准" : "驳回"}该申诉吗？`,
      type: "warning",
      onConfirm: async () => {
        setProcessing(appealId);
        try {
          // 获取当前管理员信息（从 localStorage 或 sessionStorage）
          const adminInfo = JSON.parse(
            localStorage.getItem("user") ||
              sessionStorage.getItem("user") ||
              "{}",
          );

          const res = await fetch("/api/admin/account-appeals/process", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              appealId,
              status,
              adminId: adminInfo.id || "admin",
              adminName: adminInfo.name || "管理员",
              adminComment: adminComment || null,
            }),
          });

          const data = await res.json();

          if (res.ok) {
            toast.success(
              status === "approved" ? "账号已解封" : "申诉已驳回",
            );
            loadAppeals(currentPage, statusFilter === "all" ? undefined : statusFilter);
          } else {
            toast.error(data.message || "处理失败");
          }
        } catch (error) {
          console.error("Process appeal error:", error);
          toast.error("处理失败，请重试");
        } finally {
          setProcessing(null);
        }
      },
    });
  };

  // 获取状态标签
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
            <Clock className="w-3 h-3" />
            待处理
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            已批准
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
            <XCircle className="w-3 h-3" />
            已驳回
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      {/* 头部 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">账号申诉管理</h1>
        <p className="text-sm text-slate-600">
          处理用户账号封禁申诉，审核并解封账号
        </p>
      </div>

      {/* 筛选栏 */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* 状态筛选 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-700 font-medium">状态：</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          >
            <option value="all">全部</option>
            <option value="pending">待处理</option>
            <option value="approved">已批准</option>
            <option value="rejected">已驳回</option>
          </select>
        </div>

        {/* 搜索账号 */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchAccount}
            onChange={(e) => setSearchAccount(e.target.value)}
            placeholder="搜索账号..."
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          />
          <button className="px-4 py-2 bg-[#3182ce] text-white rounded-lg text-sm font-medium hover:bg-[#2b6cb0] transition-colors">
            搜索
          </button>
        </div>

        {/* 统计信息 */}
        {appealData && (
          <div className="ml-auto text-sm text-slate-600">
            共 <span className="font-medium text-[#3182ce]">{appealData.pagination.total}</span> 条申诉
          </div>
        )}
      </div>

      {/* 申诉列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600">加载中...</p>
        </div>
      ) : !appealData || appealData.appeals.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">暂无申诉记录</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appealData.appeals.map((appeal) => (
            <div
              key={appeal.id}
              className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#3182ce] to-[#2563eb] rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {appeal.userName || appeal.userAccount}
                      </h3>
                      {getStatusBadge(appeal.status)}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {appeal.userAccount}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  {new Date(appeal.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>

              {/* 申诉内容 */}
              <div className="bg-slate-50 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-700 mb-1">
                      申诉原因
                    </p>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">
                      {appeal.appealReason}
                    </p>
                  </div>
                </div>

                {appeal.contactInfo && (
                  <div className="flex items-center gap-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-200">
                    <Phone className="w-3 h-3" />
                    <span>联系方式：{appeal.contactInfo}</span>
                  </div>
                )}
              </div>

              {/* 用户信息 */}
              <div className="flex items-center gap-4 text-xs text-slate-600 mb-3">
                {appeal.userPhone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>{appeal.userPhone}</span>
                  </div>
                )}
                {appeal.userEmail && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    <span>{appeal.userEmail}</span>
                  </div>
                )}
              </div>

              {/* 处理操作 */}
              {appeal.status === "pending" && (
                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() =>
                      handleProcessAppeal(appeal.id, "rejected")
                    }
                    disabled={processing === appeal.id}
                    className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    {processing === appeal.id ? "处理中..." : "驳回申诉"}
                  </button>
                  <button
                    onClick={() =>
                      handleProcessAppeal(appeal.id, "approved")
                    }
                    disabled={processing === appeal.id}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {processing === appeal.id ? "处理中..." : "批准申诉并解封账号"}
                  </button>
                </div>
              )}

              {/* 已处理信息 */}
              {appeal.status !== "pending" && (
                <div className="flex items-center gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                  <Shield className="w-4 h-4" />
                  <span>
                    管理员 {appeal.adminName || "未知"} 于{" "}
                    {appeal.processedAt
                      ? new Date(appeal.processedAt).toLocaleString("zh-CN")
                      : "未知时间"}{" "}
                    {appeal.status === "approved" ? "批准" : "驳回"}
                    了申诉
                  </span>
                  {appeal.adminComment && (
                    <div className="mt-2 p-2 bg-slate-50 rounded text-xs">
                      <p className="text-slate-600">备注：{appeal.adminComment}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {appealData && appealData.pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一页
          </button>
          <span className="px-4 py-2 text-sm text-slate-600">
            第 {currentPage} / {appealData.pagination.totalPages} 页
          </span>
          <button
            onClick={() =>
              setCurrentPage((p) => Math.min(appealData!.pagination.totalPages, p + 1))
            }
            disabled={currentPage === appealData.pagination.totalPages}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一页
          </button>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
