﻿﻿"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  ArrowLeft,
  Building2,
  AlertTriangle,
  CheckCircle,
  Layers,
  Shield,
  Database,
  FileText,
  Cpu,
  Users,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";

interface PersonalWorkspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

interface EnterpriseQuota {
  hasEnterprise: boolean;
  enterpriseCount: number;
  maxEnterprise: number;
  isMember: boolean;
}

function UpgradeWorkspaceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [personalWorkspace, setPersonalWorkspace] =
    useState<PersonalWorkspace | null>(null);
  const [quota, setQuota] = useState<EnterpriseQuota | null>(null);
  const [selectedOption, setSelectedOption] = useState<
    "retain" | "delete" | "upgrade" | null
  >(null);

  useEffect(() => {
    loadWorkspaceInfo();
  }, []);

  const loadWorkspaceInfo = async () => {
    try {
      const workspaceId = searchParams.get("workspaceId");
      if (!workspaceId) {
        toast.error("缺少工作空间 ID");
        router.push("/workspace-hub");
        return;
      }

      const authToken =
        typeof window !== "undefined" ? localStorage.getItem("auth_token") : "";
      if (!authToken) {
        toast.error("未授权访问");
        router.push("/auth/login");
        return;
      }

      // 先验证用户会话是否有效
      const authRes = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!authRes.ok) {
        toast.error("会话已过期，请重新登录");
        localStorage.removeItem("auth_token");
        router.push("/auth/login");
        return;
      }

      const res = await fetch(
        `/api/workspace/upgrade?workspaceId=${workspaceId}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || "加载失败";

        // 如果是企业空间，给出友好提示
        if (errorMsg.includes("企业空间")) {
          toast.error("此空间已经是企业空间，无需升级");
        } else {
          toast.error(errorMsg);
        }
        setTimeout(() => {
          router.push("/workspace-hub");
        }, 1000);
        return;
      }

      const result = await res.json();
      setPersonalWorkspace(result.workspace);
      setQuota(result.quota);

      // 检查是否已有企业空间且为免费用户
      if (result.quota.hasEnterprise && !result.quota.isMember) {
        toast.error("免费用户只能拥有一个企业空间");
        router.push("/workspace-hub");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    }
  };

  const handleGoBack = () => {
    router.push("/workspace-hub");
  };

  const handleOptionChange = (option: "retain" | "upgrade" | "delete") => {
    setSelectedOption(option);
  };

  const handleSubmit = async () => {
    if (!selectedOption) {
      toast.error("请选择升级方式");
      return;
    }

    if (!personalWorkspace) {
      toast.error("工作空间信息不存在");
      return;
    }

    try {
      setLoading(true);

      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : "";

      // 验证用户会话是否有效
      const authRes = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!authRes.ok) {
        toast.error("会话已过期，请重新登录");
        localStorage.removeItem("userId");
        router.push("/auth/login");
        return;
      }

      const res = await fetch("/api/workspace/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId: personalWorkspace.id,
          option: selectedOption,
        }),
      });

      const result = await res.json();

      console.log("[Upgrade] API Response:", { status: res.status, result });

      if (!res.ok) {
        console.error("[Upgrade] API returned error:", result);
        throw new Error(result.error || "升级失败");
      }

      console.log("[Upgrade] Success, showing toast and setting localStorage");
      toast.success(result.message || "升级成功！");

      // 根据选项写入客户端升级标记，并跳转回空间中枢
      if (selectedOption === "upgrade") {
        // 方式2：原地升级（个人空间直接转企业）
        localStorage.setItem("personalWorkspaceUpgraded", "true");
        localStorage.setItem("upgradeMode", "relabel");
        setTimeout(() => router.push("/workspace-hub"), 1000);
      } else if (selectedOption === "delete") {
        // 方式3：迁移升级（原个人空间转为只读归档）
        localStorage.setItem("personalWorkspaceUpgraded", "true");
        localStorage.setItem("personalWorkspaceArchived", "true");
        localStorage.setItem("upgradeMode", "migrate");
        setTimeout(() => router.push("/workspace-hub"), 1000);
      } else {
        // 方式1：并行创建（保留个人空间）
        localStorage.setItem("personalWorkspaceUpgraded", "true");
        localStorage.setItem("upgradeMode", "parallel");
        setTimeout(() => router.push("/workspace-hub"), 1000);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "升级失败，请稍后重试",
      );
      // 升级失败时，清除所有状态
      localStorage.setItem("personalWorkspaceDeleted", "false");
      localStorage.setItem("personalWorkspaceUpgraded", "false");
      localStorage.removeItem("upgradeMode");
    } finally {
      setLoading(false);
    }
  };

  if (!personalWorkspace || !quota) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f8ff]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">
      {/* 背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff]" />

      {/* 内容区 */}
      <main className="relative z-10 px-6 py-8">
        {/* 返回按钮 */}
        <div className="mb-6">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-[#3182ce] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回空间选择</span>
          </button>
        </div>

        {/* 升级表单 */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-8 border border-slate-200 shadow-xl">
            {/* 头部 */}
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-lg">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800">
                  个人空间升级为企业空间
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  当前空间：{personalWorkspace.name}
                </p>
              </div>
            </div>

            {/* 配额信息 */}
            <div className="mb-6 p-4 bg-[#3182ce]/10 border border-[#3182ce]/20 rounded-xl">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-[#3182ce] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700">
                  <p className="font-bold text-[#3182ce] mb-1">
                    您当前的账户类型：
                  </p>
                  <p className="text-slate-600">
                    {quota.isMember ? (
                      <span className="text-[#f59e0b] font-bold">会员用户</span>
                    ) : (
                      <span>免费用户</span>
                    )}
                    {quota.isMember ? (
                      <span>
                        {" "}
                        · 还可创建 {quota.maxEnterprise -
                          quota.enterpriseCount}{" "}
                        个企业空间
                      </span>
                    ) : (
                      <span>
                        {" "}
                        ·{" "}
                        {quota.hasEnterprise
                          ? "已拥有企业空间，无法再创建"
                          : "可创建 1 个企业空间"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 升级须知 */}
            <div className="mb-6 p-4 bg-[#3182ce]/5 border border-[#3182ce]/20 rounded-xl">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#3182ce] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-slate-700">
                  <p className="font-bold text-[#3182ce] mb-2">升级须知</p>
                  <ul className="space-y-1 text-slate-600">
                    <li className="flex items-start gap-1.5"><span className="text-[#3182ce] font-bold flex-shrink-0 mt-0.5">•</span><span>企业空间支持多角色协同：所有者、管理员、成员三级权限体系</span></li>
                    <li className="flex items-start gap-1.5"><span className="text-[#3182ce] font-bold flex-shrink-0 mt-0.5">•</span><span>可邀请团队成员加入，按岗位分配组件使用权限</span></li>
                    <li className="flex items-start gap-1.5"><span className="text-[#3182ce] font-bold flex-shrink-0 mt-0.5">•</span><span>共享算力额度与资产资源库，提升整体研发效能</span></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 升级选项 */}
            <div className="space-y-4 mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">
                请选择升级方式：<span className="text-red-500">*</span>
              </h3>

              {/* 选项 A：保留个人空间（并行创建） */}
              <div
                onClick={() => setSelectedOption("retain")}
                className={`zg-card cursor-pointer p-0 border-2 transition-all overflow-hidden hover:scale-[1.01] ${
                  selectedOption === "retain"
                    ? "border-[#3182ce] bg-[#3182ce]/5 shadow-lg shadow-[#3182ce]/20"
                    : "border-slate-200 hover:border-[#3182ce]/40 hover:shadow-md"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4 mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        selectedOption === "retain"
                          ? "bg-gradient-to-br from-[#3182ce] to-[#2b6cb0]"
                          : "bg-gradient-to-br from-slate-100 to-slate-200"
                      }`}
                    >
                      <Shield
                        className={`w-6 h-6 ${selectedOption === "retain" ? "text-white" : "text-slate-600"}`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-lg font-black text-slate-800">
                          并行创建
                        </h4>
                        <span className="px-2.5 py-1 bg-[#3182ce]/10 text-[#3182ce] text-xs font-bold rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          推荐新手
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        保留个人空间，新建一个独立的企业空间
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedOption === "retain"
                          ? "border-[#3182ce] bg-[#3182ce]"
                          : "border-slate-300"
                      }`}
                    >
                      {selectedOption === "retain" && (
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </div>

                  {/* 功能列表 */}
                  <div className="ml-16 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>个人空间继续保留</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>创建全新企业环境</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>双空间独立运行</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>消耗 1 个企业槽位</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 选项 B：原地升级（个人空间直接转企业） */}
              <div
                onClick={() => handleOptionChange("upgrade")}
                className={`zg-card cursor-pointer p-0 border-2 transition-all overflow-hidden hover:scale-[1.01] ${
                  selectedOption === "upgrade"
                    ? "border-[#f59e0b] bg-[#f59e0b]/5 shadow-lg shadow-[#f59e0b]/20"
                    : "border-slate-200 hover:border-[#f59e0b]/40 hover:shadow-md"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4 mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        selectedOption === "upgrade"
                          ? "bg-gradient-to-br from-[#f59e0b] to-[#d97706]"
                          : "bg-gradient-to-br from-slate-100 to-slate-200"
                      }`}
                    >
                      <Building2
                        className={`w-6 h-6 ${selectedOption === "upgrade" ? "text-white" : "text-slate-600"}`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-lg font-black text-slate-800">
                          原地升级
                        </h4>
                        <span className="px-2.5 py-1 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-bold rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          个人空间直接转企业
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        个人空间直接转为企业空间，原有数据原封不动保留
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedOption === "upgrade"
                          ? "border-[#f59e0b] bg-[#f59e0b]"
                          : "border-slate-300"
                      }`}
                    >
                      {selectedOption === "upgrade" && (
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </div>

                  {/* 功能列表 */}
                  <div className="ml-16 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#f59e0b]" />
                      <span>个人空间原地转为企业空间</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#f59e0b]" />
                      <span>所有数据无需迁移，直接保留</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#f59e0b]" />
                      <span>注册赠送算力点随空间一起保留</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#f59e0b]" />
                      <span>消耗 1 个企业槽位</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 选项 C：迁移升级（新建企业 + 搬运 + 归档） */}
              <div
                onClick={() => setSelectedOption("delete")}
                className={`zg-card cursor-pointer p-0 border-2 transition-all overflow-hidden hover:scale-[1.01] ${
                  selectedOption === "delete"
                    ? "border-[#10b981] bg-[#10b981]/5 shadow-lg shadow-[#10b981]/20"
                    : "border-slate-200 hover:border-[#10b981]/40 hover:shadow-md"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4 mb-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        selectedOption === "delete"
                          ? "bg-gradient-to-br from-[#10b981] to-[#059669]"
                          : "bg-gradient-to-br from-slate-100 to-slate-200"
                      }`}
                    >
                      <Database
                        className={`w-6 h-6 ${selectedOption === "delete" ? "text-white" : "text-slate-600"}`}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-lg font-black text-slate-800">
                          迁移升级
                        </h4>
                        <span className="px-2.5 py-1 bg-[#10b981]/10 text-[#10b981] text-xs font-bold rounded-full flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          资料完整搬迁
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        新建企业空间并完整搬运个人资料，原个人空间转为只读归档
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedOption === "delete"
                          ? "border-[#10b981] bg-[#10b981]"
                          : "border-slate-300"
                      }`}
                    >
                      {selectedOption === "delete" && (
                        <CheckCircle className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </div>

                  {/* 功能列表 */}
                  <div className="ml-16 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>新建独立企业空间</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>文档 / 项目 / 模型 / 对话等全部搬走</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>原个人空间只读归档，数据不丢</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="w-4 h-4 text-[#10b981]" />
                      <span>消耗 1 个企业槽位</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 警告提示 */}
            <div className="mb-6 p-4 bg-[#f59e0b]/10 border border-[#f59e0b]/20 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700">
                  <p className="font-bold text-[#f59e0b] mb-1">重要提示：</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    <li>升级操作不可逆，请谨慎选择</li>
                    <li>企业空间无法降级回个人空间</li>
                    <li>若选"原地升级"，个人空间将直接转为企业空间</li>
                    <li>若选"迁移升级"，原个人空间会转为只读归档（资料已搬至企业空间，数据不丢）</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 提交按钮 */}
            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={handleGoBack}
                disabled={loading}
                className="zg-btn zg-btn-default px-6 py-3.5 h-auto rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  loading ||
                  !selectedOption
                }
                className="zg-btn zg-btn-primary flex-1 px-6 py-3.5 h-auto rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] border-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>处理中...</span>
                  </>
                ) : (
                  <>
                    <Building2 className="w-5 h-5" />
                    <span>确认升级</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function UpgradeWorkspace() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <UpgradeWorkspaceForm />
    </Suspense>
  );
}
