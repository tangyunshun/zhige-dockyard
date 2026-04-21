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
  Check,
  Loader2,
} from "lucide-react";

export default function CreateEnterpriseWorkspace() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    teamSize: "",
    industry: "",
    contactEmail: "",
    contactPhone: "",
  });

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入企业或组织名称");
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
      
      // 跳转到企业空间工作台
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
      {/* 背景：科技感点阵 + 弥散光晕 */}
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
      <header className="relative z-10 flex items-center px-8 py-6">
        <button
          onClick={() => router.push("/workspace-hub")}
          className="group flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-bold">返回工作区</span>
        </button>
      </header>

      {/* 核心区 */}
      <main className="relative z-10 px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {/* 标题区 */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-2xl shadow-[#f59e0b]/30 mb-6">
              <Building2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-black text-slate-800 mb-3">
              创建企业或组织空间
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              解锁团队协作、成员管理、资源共享功能，获取全量 16 个高阶组件的使用权限
            </p>
          </div>

          {/* 功能亮点 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#f59e0b]/20">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center mb-3 shadow-lg shadow-[#f59e0b]/30">
                <Users className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">
                团队协作
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                邀请团队成员加入，分配不同角色权限，支持多人实时协作开发，提升团队效率
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#3182ce]/20">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center mb-3 shadow-lg shadow-[#3182ce]/30">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">
                全量组件
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                解锁全部 16 个高阶组件，包括商机分析、需求设计、后端 API 等完整开发流程工具
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-[#10b981]/20">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center mb-3 shadow-lg shadow-[#10b981]/30">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">
                资产共享
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                建立团队专属资源库，共享组件配置、API 密钥、项目模板等资产，避免重复劳动
              </p>
            </div>
          </div>

          {/* 创建表单 */}
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-8 border border-[#e2e8f0]/80 shadow-xl">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#f59e0b]" />
              填写企业或组织信息
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 左侧列 */}
              <div className="space-y-5">
                {/* 企业/组织名称 */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    企业或组织名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="请输入您的企业或组织全称"
                    className="w-full px-4 py-3 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    用于标识您的工作空间，后续可在设置中修改
                  </p>
                </div>

                {/* 空间描述 */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    空间描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                    placeholder="简要描述您的企业或组织的主要业务方向、团队目标等（选填）"
                    rows={3}
                    className="w-full px-4 py-3 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95 resize-none"
                  />
                </div>

                {/* 所属行业 */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    所属行业 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) =>
                      setFormData({ ...formData, industry: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
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
                    <option value="政府/非营利">政府/非营利</option>
                    <option value="其他">其他</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    选择您所在的主要行业领域
                  </p>
                </div>
              </div>

              {/* 右侧列 */}
              <div className="space-y-5">
                {/* 团队规模 */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    团队规模 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.teamSize}
                    onChange={(e) =>
                      setFormData({ ...formData, teamSize: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
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

                {/* 联系邮箱 */}
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
                    placeholder="请输入有效的联系邮箱"
                    className="w-full px-4 py-3 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    用于接收重要通知和系统更新
                  </p>
                </div>

                {/* 联系电话 */}
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
                    placeholder="请输入联系电话（选填）"
                    className="w-full px-4 py-3 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    方便我们与您联系，提供技术支持
                  </p>
                </div>
              </div>
            </div>

            {/* 温馨提示 */}
            <div className="mt-6 p-4 bg-[#3182ce]/5 rounded-xl border border-[#3182ce]/20">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#3182ce] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-white">i</span>
                </div>
                <div className="text-sm text-[#3182ce] leading-relaxed">
                  <p className="font-bold mb-1">温馨提示</p>
                  <ul className="space-y-1 text-xs">
                    <li>• 创建后可随时在设置中修改企业或组织信息</li>
                    <li>• 初始设置不会影响后续功能使用，请放心填写</li>
                    <li>• 创建成功后即可邀请团队成员加入协作</li>
                    <li>• 所有数据都将安全存储，仅团队成员可见</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-[#e2e8f0]/80">
              <button
                onClick={() => router.back()}
                className="px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={
                  loading || !formData.name.trim() || !formData.teamSize
                }
                className="inline-flex items-center justify-center h-[42px] px-6 rounded-lg text-sm font-bold bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    立即创建企业或组织空间
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
