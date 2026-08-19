"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";
import { Settings, Shield, Users, Save, RefreshCw, AlertTriangle, Upload, ArrowLeft, Copy } from "lucide-react";

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  
  // Danger Zone 控制状态
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [workspace, setWorkspace] = useState<any>({
    id: "",
    name: "",
    type: "PERSONAL",
    description: "",
    teamSize: "",
    industry: "",
    contactEmail: "",
    contactPhone: "",
    logo: "",
    createdAt: "",
  });

  const [errors, setErrors] = useState<any>({
    name: false,
    contactEmail: false,
    contactPhone: false,
  });

  const validateEmail = (email: string) => {
    if (!email?.trim()) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const validatePhone = (phone: string) => {
    if (!phone?.trim()) return true;
    return /^1[3-9]\d{9}$/.test(phone.trim());
  };

  const handleEmailBlur = () => {
    const isValid = validateEmail(workspace.contactEmail);
    setErrors((prev: any) => ({ ...prev, contactEmail: !isValid }));
  };

  const handlePhoneBlur = () => {
    const isValid = validatePhone(workspace.contactPhone);
    setErrors((prev: any) => ({ ...prev, contactPhone: !isValid }));
  };

  useEffect(() => {
    if (workspaceId) {
      loadWorkspaceInfo();
    }
  }, [workspaceId]);

  const loadWorkspaceInfo = async () => {
    try {
      setLoading(true);
      const authToken = localStorage.getItem("auth_token");
      const res = await fetch(`/api/workspace/update?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setWorkspace(data.workspace);
        }
      } else {
        const err = await res.json();
        throw new Error(err.error || "获取空间配置失败");
      }
    } catch (error: any) {
      console.error("加载空间配置失败:", error);
      toast.error(error.message || "加载失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 空间图标上传处理
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("图片大小不能超过 2MB");
      return;
    }

    try {
      setLogoUploading(true);
      const userId = localStorage.getItem("userId");
      const formData = new FormData();
      formData.append("icon", file);

      const res = await fetch("/api/workspace/upload-icon", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userId}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.iconUrl) {
          setWorkspace((prev: any) => ({ ...prev, logo: data.iconUrl }));
          toast.success("空间图标上传成功，请点击下方 “保存空间修改” 按钮生效");
        }
      } else {
        const err = await res.json();
        throw new Error(err.message || "上传图标失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "上传图标失败，请重试");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const nameValid = !!workspace.name?.trim();
    const emailValid = validateEmail(workspace.contactEmail);
    const phoneValid = validatePhone(workspace.contactPhone);

    setErrors({
      name: !nameValid,
      contactEmail: !emailValid,
      contactPhone: !phoneValid,
    });

    if (!nameValid) {
      toast.error("空间名称为必填项");
      return;
    }
    if (!emailValid) {
      toast.error("请输入正确的电子邮箱格式");
      return;
    }
    if (!phoneValid) {
      toast.error("请输入正确的 11 位手机号码");
      return;
    }

    try {
      setSaving(true);
      const userId = localStorage.getItem("userId");
      const res = await fetch(`/api/workspace/update?workspaceId=${workspaceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(workspace),
      });

      if (res.ok) {
        toast.success("空间设置保存成功");
        // 保存成功后，自动重定向返回当前空间控制台主页，优化路由返回体验
        router.push(`/workspace/${workspaceId}`);
      } else {
        const err = await res.json();
        throw new Error(err.error || "保存失败");
      }
    } catch (error: any) {
      console.error("保存失败:", error);
      toast.error(error.message || "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // 重置空间数据
  const handleClearData = async () => {
    if (clearConfirmText !== "确认重置") {
      toast.error("请输入 '确认重置' 以确认操作");
      return;
    }

    try {
      setClearing(true);
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/workspace/clear-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({ workspaceId, confirmText: "确认重置" }),
      });

      if (res.ok) {
        toast.success("空间数据已清空重置");
        setShowClearConfirm(false);
        setClearConfirmText("");
        router.push(`/workspace/${workspaceId}`);
      } else {
        const err = await res.json();
        throw new Error(err.error || "重置数据失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "清空工作空间数据失败，请重试");
    } finally {
      setClearing(false);
    }
  };

  // 停用工作空间
  const handleDeactivateWorkspace = async () => {
    if (deleteConfirmText !== "确认停用") {
      toast.error("请输入 '确认停用' 以确认操作");
      return;
    }

    try {
      setDeleting(true);
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/workspace/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({ workspaceId, action: "DEACTIVATE" }),
      });

      if (res.ok) {
        toast.success("工作空间已成功停用，正在返回中枢...");
        setShowDeleteConfirm(false);
        setDeleteConfirmText("");
        router.push("/workspace-hub");
      } else {
        const err = await res.json();
        throw new Error(err.error || "停用空间失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "停用空间失败，请重试");
    } finally {
      setDeleting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setWorkspace((prev: any) => ({ ...prev, [name]: value }));
    if (errors[name] !== undefined) {
      setErrors((prev: any) => ({ ...prev, [name]: false }));
    }
  };

  return (
    <WorkspaceInternalLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        
        {/* 顶部标题 */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/workspace/${workspaceId}`)}
              className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all shadow-sm cursor-pointer"
              title={workspace.type === "PERSONAL" ? "返回个人空间" : "返回工作空间"}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="text-left">
              <h2 className="text-base font-black text-slate-800">空间基本设置</h2>
              <p className="text-xs text-slate-500 font-semibold">修改工作空间元数据与管理其策略</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {workspace.type === "PERSONAL" ? (
              <span className="zg-tag bg-blue-50 text-[#3182ce] border border-blue-200 font-bold">
                个人自主空间
              </span>
            ) : (
              <span className="zg-tag bg-amber-50 text-[#d97706] border border-amber-200 font-bold">
                企业协作空间
              </span>
            )}
          </div>
        </div>

        {/* 空间元数据概览 */}
        {!loading && (
          <div className="bg-slate-50/50 rounded-xl border border-slate-200/60 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            <div>
              <span className="text-xs text-slate-400 font-bold block">工作空间 ID</span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm font-mono font-bold text-slate-800 truncate max-w-[120px]" title={workspaceId}>
                  {workspaceId}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(workspaceId ?? "");
                    toast.success("空间 ID 已复制到剪贴板");
                  }}
                  className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold block">空间类型</span>
              <span className="text-sm font-bold text-slate-800 mt-1.5 block">
                {workspace.type === "PERSONAL" ? "个人自主空间" : "企业协作空间"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold block">创建时间</span>
              <span className="text-sm font-mono font-bold text-slate-800 mt-1.5 block">
                {workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString("zh-CN") : "-"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 font-bold block">当前状态</span>
              <span className="text-sm font-bold text-green-600 mt-1.5 block flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                正常运行中
              </span>
            </div>
          </div>
        )}

        {/* 导航卡片区 */}
        {workspace?.type === "ENTERPRISE" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <button
              onClick={() => router.push(`/workspace/${workspaceId}/settings/permissions`)}
              className="text-left p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all shadow-sm flex items-start gap-3 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                  权限与角色配置大厅
                </div>
                <p className="text-xs text-slate-400 font-semibold mt-1">设置空间内 Owner、Admin、Member 各角色的细粒度组件访问控制策略</p>
              </div>
            </button>

            <button
              onClick={() => router.push(`/workspace/${workspaceId}/members`)}
              className="text-left p-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all shadow-sm flex items-start gap-3 cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                  成员与邀请管理
                </div>
                <p className="text-xs text-slate-400 font-semibold mt-1">邀请团队成员加入协作空间，生成一键链接，管理或物理移出协同成员</p>
              </div>
            </button>

          </div>
        )}

        {/* 空间图标上传区 */}
        {!loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-center gap-6 text-left">
            <div className="relative group shrink-0">
              {workspace.logo ? (
                <img
                  src={workspace.logo}
                  alt="空间Logo"
                  className="w-20 h-20 rounded-xl object-cover border border-slate-200 shadow-inner"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/60 border border-dashed border-blue-200 flex flex-col items-center justify-center text-blue-500 shadow-inner">
                  <span className="text-2xl">🏢</span>
                </div>
              )}
              <label className="absolute inset-0 bg-black/45 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-xs font-bold gap-1">
                <Upload className="w-3.5 h-3.5" />
                更换
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={logoUploading}
                  className="hidden"
                />
              </label>
            </div>
            <div className="space-y-1 text-center md:text-left flex-1">
              <h3 className="text-sm font-extrabold text-slate-800">空间标志 (Logo)</h3>
              <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                支持 JPG、PNG 格式的图片，大小不能超过 2MB。上传新图标后，请点击下方 “保存空间修改” 按钮生效。
              </p>
              {logoUploading && (
                <div className="text-xs text-[#3182ce] font-extrabold animate-pulse mt-1">
                  正在上传图片...
                </div>
              )}
            </div>
          </div>
        )}

        {/* 设置表单 */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 font-bold border">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            正在拉取配置信息...
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <form onSubmit={handleSave} className="space-y-4">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                
                {/* 空间名称 */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700 block zg-required mb-1.5">
                    空间名称
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="请输入简洁的工作空间名称（如：研发一组空间）"
                    value={workspace.name || ""}
                    onChange={handleInputChange}
                    className={`zg-input ${errors.name ? "is-error" : ""}`}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1 flex items-center font-bold gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>空间名称为必填项</span>
                    </p>
                  )}
                </div>

                {/* 空间说明 */}
                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-sm font-bold text-slate-700 block">空间描述说明</label>
                    <span className="text-xs text-slate-400 font-semibold">
                      {(workspace.description || "").length}/200
                    </span>
                  </div>
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={200}
                    placeholder="请输入空间的主要业务用途或团队描述..."
                    value={workspace.description || ""}
                    onChange={handleInputChange}
                    className="zg-input h-auto py-2"
                  />
                </div>

                {/* 联系邮箱 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">联系人邮箱</label>
                  <input
                    type="email"
                    name="contactEmail"
                    placeholder="请输入您的电子邮箱（如：user@example.com）"
                    value={workspace.contactEmail || ""}
                    onChange={handleInputChange}
                    onBlur={handleEmailBlur}
                    className={`zg-input ${errors.contactEmail ? "is-error" : ""}`}
                  />
                  {errors.contactEmail && (
                    <p className="text-xs text-red-500 mt-1 flex items-center font-bold gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>请输入正确的电子邮箱格式</span>
                    </p>
                  )}
                </div>

                {/* 联系电话 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">联系电话</label>
                  <input
                    type="text"
                    name="contactPhone"
                    placeholder="请输入您的 11 位联系手机"
                    value={workspace.contactPhone || ""}
                    onChange={handleInputChange}
                    onBlur={handlePhoneBlur}
                    className={`zg-input ${errors.contactPhone ? "is-error" : ""}`}
                  />
                  {errors.contactPhone && (
                    <p className="text-xs text-red-500 mt-1 flex items-center font-bold gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>请输入正确的 11 位手机号码</span>
                    </p>
                  )}
                </div>

                {/* 所属行业 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">所属主要行业</label>
                  <select
                    name="industry"
                    value={workspace.industry || ""}
                    onChange={handleInputChange}
                    className="zg-input cursor-pointer"
                  >
                    <option value="">请选择所属行业</option>
                    <option value="金融科技">金融科技</option>
                    <option value="跨境电商">跨境电商</option>
                    <option value="高新技术研发">高新技术研发</option>
                    <option value="传统制造业">传统制造业</option>
                    <option value="教育与科研">教育与科研</option>
                    <option value="文化与传媒">文化与传媒</option>
                    <option value="其它行业">其它行业</option>
                  </select>
                </div>

                {/* 团队规模 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">预估团队规模</label>
                  <select
                    name="teamSize"
                    value={workspace.teamSize || ""}
                    onChange={handleInputChange}
                    className="zg-input cursor-pointer"
                  >
                    <option value="">请选择团队规模</option>
                    <option value="少于 10 人">少于 10 人</option>
                    <option value="10 - 50 人">10 - 50 人</option>
                    <option value="50 - 100 人">50 - 100 人</option>
                    <option value="100 人以上">100 人以上</option>
                  </select>
                </div>

              </div>

              {/* 底部操作：双按钮并排布局，提升返回友好性 */}
              <div className="border-t border-slate-100 pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/workspace/${workspaceId}`)}
                  className="zg-btn zg-btn-default flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{workspace.type === "PERSONAL" ? "返回个人空间" : "返回工作空间"}</span>
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="zg-btn zg-btn-primary flex items-center gap-1.5 shadow-md shadow-[#3182ce]/20"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? "正在保存..." : "保存空间修改"}</span>
                </button>
              </div>

            </form>
          </div>
        )}

        {/* 危险操作区 Danger Zone */}
        {!loading && (
          <div className="bg-red-50/20 border border-red-200/60 rounded-2xl p-6 shadow-sm text-left space-y-4">
            <h3 className="text-sm font-extrabold text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
              <span>高危风险管理区域 (Danger Zone)</span>
            </h3>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">
              此区域的操作具有高风险性且不可逆，请在仔细阅读说明并确认无误后再执行。
            </p>
            
            <div className="divide-y divide-red-100/50">
              {/* 操作1：重置空间数据 */}
              <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-slate-800">重置清空当前空间效能数据</h4>
                  <p className="text-[11px] text-slate-400 font-bold leading-normal">
                    清空当前空间下绑定的所有岗位契约配置和仿真审计日志。该操作仅清空算力记录，不影响账号本身。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="px-3.5 py-2 text-xs border border-red-200 hover:border-red-300 text-red-600 hover:bg-red-50/50 rounded-lg transition-all font-bold cursor-pointer shrink-0 self-start sm:self-center"
                >
                  重置空间数据
                </button>
              </div>

              {/* 操作2：解散工作空间 (企业协作版专享) */}
              {workspace?.type === "ENTERPRISE" && (
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-black text-slate-800">解散并停用该企业协作空间</h4>
                    <p className="text-[11px] text-slate-400 font-bold leading-normal">
                      将工作空间状态标记为停用，移出所有协同成员，并禁用相关的组件调用权限。该操作将永久影响该空间的协作。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3.5 py-2 text-xs bg-red-600 hover:bg-red-750 text-white rounded-lg transition-all font-bold cursor-pointer shrink-0 self-start sm:self-center shadow-sm"
                  >
                    停用此工作空间
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 确认清空模态框 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 text-left space-y-4">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              确认清空空间数据？
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              此操作将清空当前空间下的所有岗位数据、契约关系及审计日志。此操作不可撤销，请输入 <span className="font-extrabold text-red-500">确认重置</span> 以执行。
            </p>
            <input
              type="text"
              placeholder="请输入 '确认重置'"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 font-semibold"
            />
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearConfirmText("");
                }}
                className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 rounded-lg border font-bold cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleClearData}
                disabled={clearing}
                className="px-4 py-2 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg font-bold cursor-pointer shadow-sm"
              >
                {clearing ? "正在重置..." : "确认清空"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认停用模态框 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 text-left space-y-4">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-1.5">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              确认停用该工作空间？
            </h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              停用后，空间的所有协同成员将被移出，且组件服务将被禁用。此操作不可逆，请输入 <span className="font-extrabold text-red-500">确认停用</span> 以执行。
            </p>
            <input
              type="text"
              placeholder="请输入 '确认停用'"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-red-500 font-semibold"
            />
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                className="px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 rounded-lg border font-bold cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleDeactivateWorkspace}
                disabled={deleting}
                className="px-4 py-2 text-xs text-white bg-red-600 hover:bg-red-750 rounded-lg font-bold cursor-pointer shadow-sm"
              >
                {deleting ? "正在停用..." : "确认停用"}
              </button>
            </div>
          </div>
        </div>
      )}
    </WorkspaceInternalLayout>
  );
}
