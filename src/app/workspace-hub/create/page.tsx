"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Building2,
  ArrowLeft,
  Star,
  Users,
  Zap,
  Shield,
  Loader2,
  Tag,
  FileText,
  Upload,
  Eye,
  AlertTriangle,
  CheckCircle,
  Edit,
  TrendingUp,
  Crown,
  ArrowRight,
  Award,
  Lightbulb,
} from "lucide-react";
import {
  getAvailableTeamSizeOptions,
  TEAM_SIZE_OPTIONS,
  type MembershipLevel,
  MEMBERSHIP_CONFIGS,
} from "@/lib/membership";

interface WorkspaceInfo {
  id: string;
  name: string;
  description?: string;
  teamSize?: string;
  industry?: string;
  contactEmail?: string;
  contactPhone?: string;
}

function CreateEnterpriseWorkspaceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"create" | "edit" | "expand">("create");
  const [editingWorkspace, setEditingWorkspace] =
    useState<WorkspaceInfo | null>(null);
  const [quota, setQuota] = useState<{
    hasEnterprise: boolean;
    enterpriseCount: number;
    maxEnterprise: number;
    isMember: boolean;
  } | null>(null);
  const [membershipLevel, setMembershipLevel] =
    useState<MembershipLevel>("FREE");
  const [uploadedIcon, setUploadedIcon] = useState<string | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "",
    teamSize: "",
    industry: "",
    spaceType: "STANDARD",
    visibility: "PRIVATE",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    loadQuota();
    loadWorkspaceInfo();
    loadUserInfo();
  }, []);

  const loadQuota = async () => {
    try {
      const res = await fetch("/api/workspace/quota");
      if (res.ok) {
        const data = await res.json();
        setQuota(data.quota);
      }
    } catch (error) {
      console.error("Load quota error:", error);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return;
    }

    // 验证文件大小（最大 2MB）
    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      return;
    }

    setUploadingIcon(true);
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      if (!userId) {
        toast.error("请先登录");
        return;
      }

      const formDataUpload = new FormData();
      formDataUpload.append("icon", file);

      const res = await fetch("/api/workspace/upload-icon", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userId}`,
        },
        body: formDataUpload,
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedIcon(data.iconUrl);
        toast.success("图标上传成功");
      } else {
        const error = await res.json();
        toast.error(error.message || "上传失败，请重试");
      }
    } catch (error) {
      console.error("Upload icon error:", error);
      toast.error("上传失败，请重试");
    } finally {
      setUploadingIcon(false);
      // 清空 input，允许重复上传同一文件
      e.target.value = "";
    }
  };

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        // 自动填充用户的邮箱和手机号
        setFormData((prev) => ({
          ...prev,
          contactEmail: data.user.email || "",
          contactPhone: data.user.phone || "",
        }));
        // 获取会员等级
        setMembershipLevel(
          (data.user.membershipLevel || "FREE") as MembershipLevel,
        );
      }
    } catch (error) {
      console.error("Load user info error:", error);
    }
  };

  const loadWorkspaceInfo = async () => {
    const workspaceId = searchParams.get("workspaceId");
    const action = searchParams.get("action");

    if (action === "edit" || action === "expand") {
      setMode(action as "edit" | "expand");

      if (workspaceId) {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";
          const res = await fetch(
            `/api/workspace/info?workspaceId=${workspaceId}`,
            {
              headers: {
                Authorization: `Bearer ${userId}`,
              },
            },
          );

          if (res.ok) {
            const data = await res.json();
            setEditingWorkspace(data.workspace);
            setFormData({
              ...formData,
              name: data.workspace.name || "",
              description: data.workspace.description || "",
              teamSize: data.workspace.teamSize || "",
              industry: data.workspace.industry || "",
              contactEmail: data.workspace.contactEmail || "",
              contactPhone: data.workspace.contactPhone || "",
            });
          }
        } catch (error) {
          console.error("Load workspace info error:", error);
        }
      }
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入空间名称");
      return;
    }

    // 创建模式下需要更多验证
    if (mode === "create") {
      if (!formData.slug.trim()) {
        toast.error("请输入空间标识");
        return;
      }

      if (!formData.teamSize) {
        toast.error("请选择团队规模");
        return;
      }

      if (!formData.industry) {
        toast.error("请选择所属行业");
        return;
      }

      if (!formData.contactEmail.trim()) {
        toast.error("请输入联系邮箱");
        return;
      }

      // 邮箱格式验证
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.contactEmail)) {
        toast.error("请输入正确的邮箱格式");
        return;
      }

      // 检查配额
      if (quota && quota.enterpriseCount >= quota.maxEnterprise) {
        toast.error(`您当前最多可创建${quota.maxEnterprise}个企业空间`);
        return;
      }
    }

    // 编辑或扩容模式下的验证
    if (mode === "edit" || mode === "expand") {
      if (!formData.contactEmail.trim()) {
        toast.error("请输入联系邮箱");
        return;
      }

      // 邮箱格式验证
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.contactEmail)) {
        toast.error("请输入正确的邮箱格式");
        return;
      }
    }

    setLoading(true);
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      if (mode === "create") {
        // 创建新空间
        const res = await fetch("/api/workspace/create-enterprise", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userId}`,
          },
          body: JSON.stringify({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            teamSize: formData.teamSize,
            industry: formData.industry,
            contactEmail: formData.contactEmail.trim(),
            contactPhone: formData.contactPhone.trim() || null,
            logo: uploadedIcon || null,
          }),
        });

        const result = await res.json();
        console.log("API Response:", result);

        if (!res.ok) {
          const errorMsg = result.details
            ? `${result.error}: ${result.details}`
            : result.error || "创建失败";
          console.error("Create failed:", errorMsg, result);
          throw new Error(errorMsg);
        }

        toast.success("企业空间创建成功！");
        router.push(`/workspace/${result.workspace.id}`);
      } else if (mode === "edit" || mode === "expand") {
        // 编辑或扩容空间
        if (!editingWorkspace) {
          throw new Error("工作空间信息不存在");
        }

        const res = await fetch(
          `/api/workspace/update?workspaceId=${editingWorkspace.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({
              name: formData.name.trim(),
              description: formData.description.trim() || null,
              teamSize: formData.teamSize,
              industry: formData.industry,
              contactEmail: formData.contactEmail.trim(),
              contactPhone: formData.contactPhone.trim() || null,
            }),
          },
        );

        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.error || "更新失败");
        }

        toast.success(mode === "expand" ? "扩容成功！" : "保存成功！");
        router.push(`/workspace-hub`);
      }
    } catch (error) {
      console.error("Workspace operation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "操作失败，请稍后重试";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative bg-[#f0f8ff]">
      {/* 背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.08] rounded-full blur-[120px]" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center px-4 py-4">
        <button
          onClick={() => router.push("/workspace-hub")}
          className="group flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all text-sm font-bold"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回工作区</span>
        </button>
      </header>

      {/* 核心区 */}
      <main className="relative z-10 px-4 py-6">
        <div className="max-w-6xl mx-auto">
          {/* 标题区 */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-2xl shadow-[#f59e0b]/30 mb-3">
              {mode === "create" ? (
                <Building2 className="w-7 h-7 text-white" />
              ) : mode === "edit" ? (
                <Edit className="w-7 h-7 text-white" />
              ) : (
                <TrendingUp className="w-7 h-7 text-white" />
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-1.5">
              {mode === "create"
                ? "创建企业或组织空间"
                : mode === "edit"
                  ? "编辑企业空间信息"
                  : "扩容企业空间"}
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              {mode === "create"
                ? "解锁团队协作、成员管理、资源共享功能，获取全量高阶组件的使用权限"
                : mode === "edit"
                  ? "修改空间名称、描述等基础信息"
                  : "升级团队规模，解锁更多成员席位"}
            </p>
            {/* 配额信息 */}
            {quota && mode === "create" && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-full">
                <CheckCircle className="w-4 h-4 text-[#10b981]" />
                <span className="text-sm font-bold text-slate-700">
                  当前可创建：
                  <span className="text-[#f59e0b]">
                    {quota.maxEnterprise - quota.enterpriseCount} 个
                  </span>
                </span>
                {!quota.isMember && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded">
                    免费用户
                  </span>
                )}
                {quota.isMember && (
                  <span className="px-2 py-0.5 bg-[#f59e0b]/10 text-[#f59e0b] text-xs font-bold rounded">
                    会员用户
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 左右布局：左侧功能亮点 + 右侧表单 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：功能亮点（占 1 列） */}
            <div className="space-y-4">
              <h2 className="text-base font-black text-slate-800 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#f59e0b]" />
                企业空间功能亮点
              </h2>

              <div className="bg-white/80 backdrop-blur-xl rounded-xl p-4 border border-[#f59e0b]/20">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mb-3 shadow-lg shadow-[#f59e0b]/30">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-black text-slate-800 mb-2">
                  团队协作
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  邀请团队成员加入，分配不同角色权限，支持多人实时协作开发
                </p>
              </div>

              <div className="bg-white/80 backdrop-blur-xl rounded-xl p-4 border border-[#3182ce]/20">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center mb-3 shadow-lg shadow-[#3182ce]/30">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-black text-slate-800 mb-2">
                  全量组件
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  解锁全部 16 个高阶组件，包括商机分析、需求设计、后端 API
                  等工具
                </p>
              </div>

              <div className="bg-white/80 backdrop-blur-xl rounded-xl p-4 border border-[#10b981]/20">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-3 shadow-lg shadow-[#10b981]/30">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-sm font-black text-slate-800 mb-2">
                  资产共享
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  建立团队专属资源库，共享组件配置、API 密钥、项目模板等资产
                </p>
              </div>

              {/* 提示信息 */}
              <div className="bg-gradient-to-br from-[#3182ce]/10 to-[#2563eb]/10 backdrop-blur-xl rounded-xl p-4 border border-[#3182ce]/20">
                <h3 className="text-sm font-black text-[#3182ce] mb-2">
                  温馨提示
                </h3>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-[#3182ce] font-bold">•</span>
                    <span>创建后可在设置中修改大部分信息</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#3182ce] font-bold">•</span>
                    <span>空间标识唯一，创建后不可修改</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#3182ce] font-bold">•</span>
                    <span>创建成功后即可邀请团队成员协作</span>
                  </li>
                </ul>
              </div>

              {/* 配额限制提示 */}
              {quota && quota.enterpriseCount >= quota.maxEnterprise && (
                <div className="bg-gradient-to-br from-[#f59e0b]/10 to-[#d97706]/10 backdrop-blur-xl rounded-xl p-4 border border-[#f59e0b]/30">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-[#f59e0b] flex-shrink-0 mt-0.5" />
                    <h3 className="text-sm font-black text-[#f59e0b]">
                      配额已达上限
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    您当前最多可创建{" "}
                    <span className="font-bold text-[#f59e0b]">
                      {quota.maxEnterprise}
                    </span>{" "}
                    个企业空间， 已创建{" "}
                    <span className="font-bold text-[#f59e0b]">
                      {quota.enterpriseCount}
                    </span>{" "}
                    个。
                    {quota.isMember ? (
                      <span className="block mt-1">
                        如需更多空间，请联系客服升级。
                      </span>
                    ) : (
                      <span className="block mt-1">
                        升级会员可创建最多 3 个企业空间。
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* 右侧：创建表单（占 2 列） */}
            <div className="lg:col-span-2">
              <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-5 border border-[#e2e8f0]/80 shadow-xl">
                <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#3182ce]" />
                  填写企业或组织空间信息
                </h2>

                <div className="grid grid-cols-1 gap-4">
                  {/* 空间图标上传 */}
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden">
                      {uploadedIcon ? (
                        <img
                          src={uploadedIcon}
                          alt="空间图标"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center">
                          <Building2 className="w-7 h-7 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-slate-800 mb-2">
                        空间图标
                      </h3>
                      <p className="text-sm text-slate-600 mb-3">
                        上传自定义图标，让空间更具辨识度
                      </p>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e2e8f0] text-sm font-bold text-slate-700 rounded-lg hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                          <Upload className="w-4 h-4" />
                          {uploadingIcon
                            ? "上传中..."
                            : uploadedIcon
                              ? "重新上传"
                              : "上传图标"}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleIconUpload}
                            disabled={uploadingIcon}
                            className="hidden"
                          />
                        </label>
                        <span className="text-xs text-slate-500">
                          支持 JPG、PNG、SVG 格式，最大 2MB
                        </span>
                      </div>
                      {uploadedIcon && (
                        <button
                          onClick={() => setUploadedIcon(null)}
                          className="mt-2 inline-flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          删除图标
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 第一行：空间名称 + 空间标识 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        空间名称 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="例如：知阁研发中心"
                        className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        用于标识您的工作空间，后续可修改
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        空间标识 <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={formData.slug}
                          onChange={(e) =>
                            setFormData({ ...formData, slug: e.target.value })
                          }
                          placeholder="zhige-research"
                          className="w-full pl-9 pr-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        唯一标识，用于 URL 和 API 调用，创建后不可修改
                      </p>
                    </div>
                  </div>

                  {/* 第二行：团队规模 + 所属行业 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        团队规模 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.teamSize}
                        onChange={(e) =>
                          setFormData({ ...formData, teamSize: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      >
                        <option value="">请选择团队规模</option>
                        {getAvailableTeamSizeOptions(membershipLevel).map(
                          (option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ),
                        )}
                      </select>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Crown className="w-3 h-3" />
                          <span>
                            当前{MEMBERSHIP_CONFIGS[membershipLevel].nameZh}：
                            最多支持{" "}
                            {MEMBERSHIP_CONFIGS[membershipLevel].maxTeamSize ===
                            -1
                              ? "无限"
                              : MEMBERSHIP_CONFIGS[membershipLevel]
                                  .maxTeamSize}{" "}
                            人团队
                          </span>
                        </div>
                        {membershipLevel === "FREE" && (
                          <button
                            onClick={() => router.push("/pricing")}
                            className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-[#f59e0b]/30 transition-all hover:-translate-y-0.5"
                          >
                            <Crown className="w-3.5 h-3.5" />
                            <span>升级会员</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        所属行业 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.industry}
                        onChange={(e) =>
                          setFormData({ ...formData, industry: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      >
                        <option value="">请选择所属行业</option>
                        <option value="互联网/软件">互联网/软件</option>
                        <option value="金融/保险">金融/保险</option>
                        <option value="教育/培训">教育/培训</option>
                        <option value="医疗/健康">医疗/健康</option>
                        <option value="制造业">制造业</option>
                        <option value="零售/电商">零售/电商</option>
                        <option value="媒体/广告">媒体/广告</option>
                        <option value="建筑/房地产">建筑/房地产</option>
                        <option value="服务业">服务业</option>
                        <option value="其他">其他</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        选择您所在的主要行业领域
                      </p>
                    </div>
                  </div>

                  {/* 第三行：空间类型 + 空间可见性 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        空间类型
                      </label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                          value={formData.spaceType}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              spaceType: e.target.value,
                            })
                          }
                          className="w-full pl-9 pr-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                        >
                          <option value="STANDARD">标准空间（免费）</option>
                          <option value="PRO">专业空间（¥299/月）</option>
                          <option value="ENTERPRISE">
                            企业空间（¥999/月）
                          </option>
                        </select>
                      </div>
                      {/* 空间类型说明 */}
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        {formData.spaceType === "STANDARD" && (
                          <div className="text-xs text-slate-600 space-y-1">
                            <p className="font-bold text-slate-700">
                              📦 标准空间 - 适合个人和小型团队
                            </p>
                            <p>✓ 最多 3个组件</p>
                            <p>✓ 最多 5 名成员</p>
                            <p>✓ 1GB 存储空间</p>
                            <p>✓ 基础组件库权限</p>
                            <p>✓ 标准技术支持</p>
                            {membershipLevel === "FREE" && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <p className="text-[#f59e0b] font-bold text-xs mb-2 flex items-center gap-1">
                                  <Crown className="w-3.5 h-3.5" />
                                  <span>升级解锁更多权益：</span>
                                </p>
                                <button
                                  onClick={() => router.push("/pricing")}
                                  className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-[#f59e0b]/30 transition-all hover:-translate-y-0.5"
                                >
                                  <Crown className="w-4 h-4" />
                                  <span>查看会员套餐</span>
                                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {formData.spaceType === "PRO" && (
                          <div className="text-xs text-slate-600 space-y-1">
                            <p className="font-bold text-[#3182ce]">
                              🚀 专业空间 - 适合成长型团队
                            </p>
                            <p>✓ 最多 25 个组件</p>
                            <p>✓ 最多 20 名成员</p>
                            <p>✓ 10GB 存储空间</p>
                            <p>✓ 全量组件库权限</p>
                            <p>✓ 优先技术支持</p>
                            <p>✓ 数据分析报表</p>
                            <p>✓ 自定义主题</p>
                            {membershipLevel !== "GOLD" &&
                              membershipLevel !== "DIAMOND" &&
                              membershipLevel !== "CROWN" && (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                  <p className="text-[#f59e0b] font-bold text-xs mb-2 flex items-center gap-1">
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    <span>升级到黄金会员解锁更高配额：</span>
                                  </p>
                                  <button
                                    onClick={() => router.push("/pricing")}
                                    className="group w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-[#f59e0b]/30 transition-all hover:-translate-y-0.5"
                                  >
                                    <Crown className="w-4 h-4" />
                                    <span>查看黄金会员</span>
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                  </button>
                                </div>
                              )}
                          </div>
                        )}
                        {formData.spaceType === "ENTERPRISE" && (
                          <div className="text-xs text-slate-600 space-y-1">
                            <p className="font-bold text-[#f59e0b]">
                              🏢 企业空间 - 适合大型企业
                            </p>
                            <p>✓ 无限组件数量</p>
                            <p>✓ 无限成员数量</p>
                            <p>✓ 100GB 存储空间</p>
                            <p>✓ 全量 + 专属组件库</p>
                            <p>✓ 7×24 专属技术支持</p>
                            <p>✓ 高级数据分析 + 导出</p>
                            <p>✓ 完全自定义主题</p>
                            <p>✓ SLA 服务保障</p>
                            <p>✓ 专属客户经理</p>
                            {membershipLevel !== "CROWN" && (
                              <div className="mt-2 pt-2 border-t border-slate-200">
                                <p className="text-[#f59e0b] font-bold text-xs mb-1">
                                  💡 升级到皇冠会员享受顶级服务：
                                </p>
                                <button
                                  onClick={() => router.push("/pricing")}
                                  className="text-xs font-bold text-[#3182ce] hover:text-[#2563eb] flex items-center gap-1 transition-colors w-full justify-center"
                                >
                                  <Award className="w-3 h-3" />
                                  <span>查看皇冠会员</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        不同空间类型对应不同的配额和权益，创建后可升级
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        空间可见性
                      </label>
                      <div className="relative">
                        <Eye className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                          value={formData.visibility}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              visibility: e.target.value,
                            })
                          }
                          className="w-full pl-9 pr-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                        >
                          <option value="PRIVATE">私有（仅成员可见）</option>
                          <option value="PUBLIC">公开（所有人可见）</option>
                        </select>
                      </div>
                      {/* 可见性说明 */}
                      <div className="mt-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        {formData.visibility === "PRIVATE" && (
                          <div className="text-xs text-slate-600">
                            <p className="font-bold text-slate-700 mb-1">
                              🔒 私有空间
                            </p>
                            <p>• 仅空间成员可以访问和查看</p>
                            <p>• 适合内部团队协作</p>
                            <p>• 数据完全私密</p>
                          </div>
                        )}
                        {formData.visibility === "PUBLIC" && (
                          <div className="text-xs text-slate-600">
                            <p className="font-bold text-slate-700 mb-1">
                              🌍 公开空间
                            </p>
                            <p>• 所有人都可以浏览空间内容</p>
                            <p>• 适合开源项目或公开分享</p>
                            <p>• 仅成员可以编辑和管理</p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        控制空间的访问权限，创建后可修改
                      </p>
                    </div>
                  </div>

                  {/* 空间描述 */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      空间描述
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <textarea
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        placeholder="简要描述空间用途（选填）"
                        rows={3}
                        className="w-full pl-9 pr-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95 resize-none"
                      />
                    </div>
                  </div>

                  {/* 联系信息 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        联系邮箱 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contactEmail: e.target.value,
                          })
                        }
                        placeholder="name@company.com"
                        className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        用于接收重要通知和系统更新
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">
                        联系电话
                      </label>
                      <input
                        type="tel"
                        value={formData.contactPhone}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contactPhone: e.target.value,
                          })
                        }
                        placeholder="选填"
                        className="w-full px-3 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        方便我们与您联系，提供技术支持
                      </p>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-[#e2e8f0]/80 mt-2">
                    <button
                      onClick={() => router.back()}
                      className="px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={
                        loading ||
                        !formData.name.trim() ||
                        (mode === "create" && !formData.slug.trim()) ||
                        (mode === "create" && !formData.teamSize) ||
                        (mode === "create" && !formData.industry) ||
                        !formData.contactEmail.trim()
                      }
                      className="inline-flex items-center justify-center h-[40px] px-6 rounded-lg text-sm font-bold bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {mode === "create"
                            ? "创建中..."
                            : mode === "expand"
                              ? "扩容中..."
                              : "保存中..."}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          {mode === "create"
                            ? "立即创建空间"
                            : mode === "expand"
                              ? "确认扩容"
                              : "保存修改"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CreateEnterpriseWorkspace() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <CreateEnterpriseWorkspaceForm />
    </Suspense>
  );
}
