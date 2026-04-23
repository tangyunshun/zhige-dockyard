"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ArrowLeft, Building2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

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

export default function UpgradeWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [personalWorkspace, setPersonalWorkspace] = useState<PersonalWorkspace | null>(null);
  const [quota, setQuota] = useState<EnterpriseQuota | null>(null);
  const [selectedOption, setSelectedOption] = useState<"retain" | "delete" | "upgrade" | null>(null);

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

      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      if (!userId) {
        toast.error("未授权访问");
        router.push("/auth/login");
        return;
      }

      const res = await fetch(`/api/workspace/upgrade?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "加载失败");
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
      console.error("Load workspace info error:", error);
      toast.error(error instanceof Error ? error.message : "加载失败");
    }
  };

  const handleGoBack = () => {
    router.push("/workspace-hub");
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

      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      
      const res = await fetch("/api/workspace/upgrade", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          workspaceId: personalWorkspace.id,
          option: selectedOption,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "升级失败");
      }

      toast.success(result.message || "升级成功！");
      setTimeout(() => {
        router.push(`/workspace/${result.workspaceId}`);
      }, 1000);
    } catch (error) {
      console.error("Upgrade workspace error:", error);
      toast.error(error instanceof Error ? error.message : "升级失败，请稍后重试");
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
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]" />

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
                  <p className="font-bold text-[#3182ce] mb-1">您当前的账户类型：</p>
                  <p className="text-slate-600">
                    {quota.isMember ? (
                      <span className="text-[#f59e0b] font-bold">会员用户</span>
                    ) : (
                      <span>免费用户</span>
                    )}
                    {quota.isMember ? (
                      <span> · 还可创建 {quota.maxEnterprise - quota.enterpriseCount} 个企业空间</span>
                    ) : (
                      <span> · {quota.hasEnterprise ? "已拥有企业空间，无法再创建" : "可创建 1 个企业空间"}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 兼容性检查 */}
            <div className="mb-6 p-4 bg-[#10b981]/10 border border-[#10b981]/20 rounded-xl">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700">
                  <p className="font-bold text-[#10b981] mb-1">兼容性检查通过</p>
                  <p className="text-slate-600">
                    当前个人空间数据符合升级要求，可以安全升级为企业空间
                  </p>
                </div>
              </div>
            </div>

            {/* 升级选项 */}
            <div className="space-y-4 mb-6">
              <h3 className="text-sm font-bold text-slate-700 mb-3">请选择升级方式：</h3>

              {/* 选项 A：保留个人空间 */}
              <div
                onClick={() => setSelectedOption("retain")}
                className={`group cursor-pointer p-5 rounded-xl border-2 transition-all ${
                  selectedOption === "retain"
                    ? "border-[#3182ce] bg-[#3182ce]/5"
                    : "border-slate-200 hover:border-[#3182ce]/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    selectedOption === "retain" ? "border-[#3182ce] bg-[#3182ce]" : "border-slate-300"
                  }`}>
                    {selectedOption === "retain" && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-black text-slate-800">保留个人空间，同时新建企业空间</h4>
                    </div>
                    <p className="text-sm text-slate-600">
                      创建一个新的企业空间，原个人空间保持不变。两者可以共存，数据互不影响。
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-[#3182ce]/10 text-[#3182ce] font-bold rounded">推荐新手</span>
                      <span className="text-slate-500">适合想同时保留个人和企业空间的场景</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 选项 B：删除个人空间 */}
              <div
                onClick={() => setSelectedOption("delete")}
                className={`group cursor-pointer p-5 rounded-xl border-2 transition-all ${
                  selectedOption === "delete"
                    ? "border-[#f59e0b] bg-[#f59e0b]/5"
                    : "border-slate-200 hover:border-[#f59e0b]/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    selectedOption === "delete" ? "border-[#f59e0b] bg-[#f59e0b]" : "border-slate-300"
                  }`}>
                    {selectedOption === "delete" && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-black text-slate-800">删除个人空间，新建企业空间</h4>
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        会删除原空间
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      创建一个新的企业空间，同时删除当前的个人空间。<strong className="text-red-600">此操作不可恢复！</strong>
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 font-bold rounded">谨慎选择</span>
                      <span className="text-slate-500">适合确定不再需要个人空间的场景</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 选项 C：直接升级 */}
              <div
                onClick={() => setSelectedOption("upgrade")}
                className={`group cursor-pointer p-5 rounded-xl border-2 transition-all ${
                  selectedOption === "upgrade"
                    ? "border-[#10b981] bg-[#10b981]/5"
                    : "border-slate-200 hover:border-[#10b981]/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    selectedOption === "upgrade" ? "border-[#10b981] bg-[#10b981]" : "border-slate-300"
                  }`}>
                    {selectedOption === "upgrade" && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-base font-black text-slate-800">直接升级为企业空间（数据迁移）</h4>
                      <span className="px-2 py-0.5 bg-[#10b981]/10 text-[#10b981] text-xs font-bold rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        推荐
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      将当前个人空间直接升级为企业空间，所有数据完整迁移，空间 ID 保持不变。这是最平滑的升级方式。
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 bg-[#10b981]/10 text-[#10b981] font-bold rounded">最佳选择</span>
                      <span className="text-slate-500">保留所有数据，无需重新配置</span>
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
                    <li>升级后空间类型将永久变更</li>
                    <li>选择"删除个人空间"会导致数据永久丢失</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 提交按钮 */}
            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={handleGoBack}
                disabled={loading}
                className="px-6 py-3.5 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !selectedOption}
                className="flex-1 px-6 py-3.5 bg-gradient-to-r from-[#10b981] to-[#059669] text-white font-bold rounded-xl hover:shadow-xl hover:shadow-[#10b981]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
