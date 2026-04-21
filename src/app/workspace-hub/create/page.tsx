"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Building2,
  ArrowLeft,
  Sparkles,
  Users,
  Zap,
  Shield,
  Loader2,
  Tag,
  FileText,
  Upload,
  Eye,
} from "lucide-react";

export default function CreateEnterpriseWorkspace() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "",
    teamSize: "",
    industry: "",
    spaceType: "standard",
    visibility: "private",
    contactEmail: "",
    contactPhone: "",
  });

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入空间名称");
      return;
    }

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

    setLoading(true);
    try {
      const res = await fetch("/api/workspace/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("创建失败");
      }

      const data = await res.json();
      toast.success("企业空间创建成功！");

      router.push(`/workspace/${data.workspace.id}`);
    } catch (error) {
      console.error("创建企业空间失败:", error);
      toast.error("创建失败，请稍后重试");
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
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-1.5">
              创建企业或组织空间
            </h1>
            <p className="text-sm text-slate-600 max-w-xl mx-auto">
              解锁团队协作、成员管理、资源共享功能，获取全量 16
              个高阶组件的使用权限
            </p>
          </div>

          {/* 左右布局：左侧功能亮点 + 右侧表单 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：功能亮点（占 1 列） */}
            <div className="space-y-4">
              <h2 className="text-base font-black text-slate-800 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#f59e0b]" />
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
            </div>

            {/* 右侧：创建表单（占 2 列） */}
            <div className="lg:col-span-2">
              <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-5 border border-[#e2e8f0]/80 shadow-xl">
                <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#f59e0b]" />
                  填写企业或组织空间信息
                </h2>

                <div className="grid grid-cols-1 gap-4">
                  {/* 空间图标上传 */}
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-lg flex-shrink-0">
                      <Building2 className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-slate-800 mb-2">
                        空间图标
                      </h3>
                      <p className="text-sm text-slate-600 mb-3">
                        上传自定义图标，让空间更具辨识度
                      </p>
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e2e8f0] text-sm font-bold text-slate-700 rounded-lg hover:bg-slate-50 transition-all cursor-pointer">
                        <Upload className="w-4 h-4" />
                        上传图标
                      </button>
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
                        <option value="1-5">1-5 人（初创团队）</option>
                        <option value="6-20">6-20 人（小型团队）</option>
                        <option value="21-50">21-50 人（中型团队）</option>
                        <option value="51-100">51-100 人（大型团队）</option>
                        <option value="100+">100 人以上（企业级）</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        帮助您选择适合的套餐方案
                      </p>
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
                          <option value="standard">标准空间（免费）</option>
                          <option value="pro">专业空间（付费）</option>
                          <option value="enterprise">企业空间（定制）</option>
                        </select>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        选择适合您的空间套餐
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
                          <option value="private">私有（仅成员可见）</option>
                          <option value="public">公开（所有人可见）</option>
                        </select>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        控制空间的访问权限
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
                        !formData.slug.trim() ||
                        !formData.teamSize
                      }
                      className="inline-flex items-center justify-center h-[40px] px-6 rounded-lg text-sm font-bold bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          创建中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          立即创建空间
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
