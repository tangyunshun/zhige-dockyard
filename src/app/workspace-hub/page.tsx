"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import {
  User,
  Building2,
  Settings,
  BookOpen,
  LogOut,
  ArrowRight,
  Sparkles,
  Users,
  Zap,
  Shield,
  Mail,
  Smartphone,
} from "lucide-react";

interface UserInfo {
  id: string;
  name: string;
  avatar?: string;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
}

export default function WorkspaceHub() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [personalWorkspace, setPersonalWorkspace] = useState<Workspace | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    teamSize: "",
    industry: "",
    contactEmail: "",
    contactPhone: "",
  });

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login");
        return;
      }

      const data = await res.json();
      setUser(data.user);

      // 加载用户的工作空间
      const workspacesRes = await fetch("/api/workspace/list");
      if (workspacesRes.ok) {
        const workspacesData = await workspacesRes.json();
        // 查找个人空间
        const personal = workspacesData.workspaces.find(
          (w: Workspace) => w.type === "PERSONAL",
        );
        setPersonalWorkspace(personal || null);
      } else {
        // 如果获取工作空间失败，设置为 null
        setPersonalWorkspace(null);
      }
    } catch (error) {
      console.error("加载用户信息失败:", error);
      // 不显示任何错误提示，静默失败
      setPersonalWorkspace(null);
    }
  };

  const handleEnterPersonal = async () => {
    // 显示加载提示
    toast.info("正在加载个人空间信息...");
    // 等待 1 秒
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // 直接跳转到个人空间页面
    if (personalWorkspace) {
      router.push(`/dashboard?wid=${personalWorkspace.id}`);
    } else {
      // 如果没有个人空间，跳转到空页面（显示"此页面正在开发中"）
      router.push("/workspace-hub/personal");
    }
  };

  const handleCreateEnterprise = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入企业名称");
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
      setShowModal(false);

      // 跳转到企业空间工作台
      router.push(`/dashboard?wid=${data.workspace.id}`);
    } catch (error) {
      console.error("创建企业空间失败:", error);
      toast.error("创建企业空间失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        router.push("/");
      } else {
        toast.error("退出登录失败");
      }
    } catch (error) {
      console.error("退出登录失败:", error);
      toast.error("退出登录失败，请稍后重试");
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#f0f8ff]">
      {/* 背景：科技感点阵 + 弥散光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        {/* 点阵背景 */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* 弥散光晕 */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-[#f59e0b]/[0.06] rounded-full blur-[100px]" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <Logo variant="light" />

        <div className="flex items-center gap-4">
          {user?.avatar && (
            <img
              src={user.avatar}
              alt={user.name || "用户头像"}
              className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm"
            />
          )}
          <button
            onClick={handleLogout}
            className="group flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            退出登录
          </button>
        </div>
      </header>

      {/* 核心区：居中内容 */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8">
        {/* 欢迎语 */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-3 tracking-tight">
            欢迎回来，{user?.name || "用户"}
          </h1>
          <p className="text-lg text-slate-600 font-medium max-w-2xl">
            请选择您的目标工作区或进行设置
          </p>
        </div>

        {/* 卡片矩阵：4 个紧凑卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
          {/* 卡片 1：进入个人空间 */}
          <div
            onClick={handleEnterPersonal}
            className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90 hover:shadow-2xl hover:shadow-[#3182ce]/10 transition-all duration-300 hover:-translate-y-1"
            style={{
              transitionTimingFunction:
                "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#3182ce]/20">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  进入个人空间
                </h3>
                <p className="text-sm text-slate-600 mb-3 leading-snug">
                  我的私密空间 / 包含基础的组件体验，数据仅自己可见。
                </p>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#3182ce]">
                  <span>立即进入</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 卡片 2：升级为企业空间（高亮） */}
          <div
            onClick={() => setShowModal(true)}
            className="group cursor-pointer relative bg-white/90 backdrop-blur-xl rounded-xl p-6 border-2 border-[#3182ce]/30 hover:border-[#3182ce]/60 hover:shadow-2xl hover:shadow-[#3182ce]/15 transition-all duration-300 hover:-translate-y-1"
            style={{
              transitionTimingFunction:
                "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
            }}
          >
            {/* 推荐标识 */}
            <div className="absolute -top-2.5 right-4 px-3 py-1 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-xs font-black rounded-full shadow-lg shadow-[#f59e0b]/30">
              推荐
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#f59e0b]/20">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  升级为企业空间
                </h3>
                <p className="text-sm text-slate-600 mb-3 leading-snug">
                  创建团队与企业空间 / 解锁成员协作、邀请链接、全量 53
                  项高阶组件与资产共享。
                </p>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#f59e0b]">
                  <span>立即创建</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 卡片 3：空间与个人设置 */}
          <div
            onClick={() => router.push("/workspace-hub/settings")}
            className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90 hover:shadow-2xl hover:shadow-[#10b981]/10 transition-all duration-300 hover:-translate-y-1"
            style={{
              transitionTimingFunction:
                "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#10b981]/20">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  个人空间设置
                </h3>
                <p className="text-sm text-slate-600 mb-3 leading-snug">
                  空间配置与偏好 / 设置空间名称、描述、个性化 UI 与通知偏好。
                </p>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#10b981]">
                  <span>前往设置</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>

          {/* 卡片 4：帮助手册 */}
          <div
            onClick={() => router.push("/docs")}
            className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-xl p-6 border border-white/90 hover:shadow-2xl hover:shadow-[#f59e0b]/10 transition-all duration-300 hover:-translate-y-1"
            style={{
              transitionTimingFunction:
                "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#f59e0b]/20">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-800 mb-1">
                  帮助手册
                </h3>
                <p className="text-sm text-slate-600 mb-3 leading-snug">
                  系统使用指南 / 查看全链路研发组件的标准化操作手册。
                </p>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#f59e0b]">
                  <span>查看文档</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 创建企业弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 遮罩层 */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* 弹窗内容 */}
          <div className="relative bg-white/95 backdrop-blur-xl rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
            {/* 标题栏 */}
            <div className="px-8 py-6 border-b border-[#e2e8f0]/90 bg-gradient-to-r from-[#f59e0b]/5 to-[#d97706]/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center shadow-lg shadow-[#f59e0b]/20">
                  <Building2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800">
                    创建企业空间
                  </h2>
                  <p className="text-sm text-slate-600">
                    解锁团队协作与全量 53 项高阶组件
                  </p>
                </div>
              </div>

              {/* 功能亮点 */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="flex items-center gap-2 p-2.5 bg-white/80 rounded-lg border border-[#e2e8f0]/80">
                  <div className="w-8 h-8 rounded-lg bg-[#3182ce]/10 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-[#3182ce]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      成员协作
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      邀请与管理
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-white/80 rounded-lg border border-[#e2e8f0]/80">
                  <div className="w-8 h-8 rounded-lg bg-[#10b981]/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-[#10b981]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      全量组件
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      53 项高阶功能
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-white/80 rounded-lg border border-[#e2e8f0]/80">
                  <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-[#f59e0b]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      资产共享
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      团队资源库
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 表单区域 */}
            <div
              className="px-8 py-6 overflow-y-auto flex-1"
              style={{ maxHeight: "calc(90vh - 280px)" }}
            >
              <div className="grid grid-cols-2 gap-5">
                {/* 左侧列 */}
                <div className="space-y-5">
                  {/* 企业名称 */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      企业名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="请输入企业名称"
                      className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                    />
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
                      placeholder="简要描述您的企业空间用途（选填）"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95 resize-none"
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
                      className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
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
                      className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                    >
                      <option value="">请选择团队规模</option>
                      <option value="1-5">1-5 人（初创团队）</option>
                      <option value="6-20">6-20 人（小型团队）</option>
                      <option value="21-50">21-50 人（中型团队）</option>
                      <option value="51-100">51-100 人（大型团队）</option>
                      <option value="100+">100 人以上（企业级）</option>
                    </select>
                  </div>

                  {/* 联系邮箱 */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      联系邮箱 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contactEmail: e.target.value,
                          })
                        }
                        placeholder="请输入联系邮箱"
                        className="w-full pl-10 pr-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      />
                    </div>
                  </div>

                  {/* 联系电话 */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      联系电话
                    </label>
                    <div className="relative">
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
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
                        className="w-full pl-10 pr-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                      />
                    </div>
                  </div>

                  {/* 提示信息 */}
                  <div className="p-4 bg-[#3182ce]/5 rounded-xl border border-[#3182ce]/20">
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-[#3182ce] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-white">i</span>
                      </div>
                      <div className="text-xs text-[#3182ce] leading-relaxed">
                        <p className="font-bold mb-1">温馨提示</p>
                        <p>
                          创建后可随时修改企业信息，初始设置不会影响后续功能使用。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 按钮区域 - 固定在底部 */}
            <div className="px-8 py-6 border-t border-[#e2e8f0]/90 flex justify-end gap-3 bg-white/60 backdrop-blur-sm flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreateEnterprise}
                disabled={
                  loading || !formData.name.trim() || !formData.teamSize
                }
                className="inline-flex items-center justify-center h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "创建中..." : "立即创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
