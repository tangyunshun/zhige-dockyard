"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import {
  BookOpen,
  Search,
  ChevronRight,
  ExternalLink,
  FileText,
  Users,
  Settings,
  Shield,
  Zap,
  LogOut,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";

interface DocSection {
  id: string;
  title: string;
  icon: any;
  articles: DocArticle[];
}

interface DocArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
}

export default function DocsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("quickstart");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    } catch (error) {
      console.error("加载用户信息失败:", error);
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
      }
    } catch (error) {
      console.error("退出登录失败:", error);
    }
  };

  const docSections: DocSection[] = [
    {
      id: "quickstart",
      title: "快速开始",
      icon: Zap,
      articles: [
        {
          id: "1",
          title: "5 分钟快速上手",
          summary: "了解如何使用知阁舟坊的基础功能和核心工作流",
          category: "入门指南",
        },
        {
          id: "2",
          title: "工作空间切换指南",
          summary: "学习如何在个人空间和企业空间之间快速切换",
          category: "入门指南",
        },
        {
          id: "3",
          title: "邀请团队成员",
          summary: "通过邀请链接快速添加成员到企业空间",
          category: "团队协作",
        },
      ],
    },
    {
      id: "components",
      title: "组件库",
      icon: FileText,
      articles: [
        {
          id: "4",
          title: "53 项高阶组件总览",
          summary: "完整的企业级组件库使用说明和最佳实践",
          category: "组件文档",
        },
        {
          id: "5",
          title: "数据可视化组件",
          summary: "图表、仪表盘等数据展示组件的详细用法",
          category: "组件文档",
        },
        {
          id: "6",
          title: "表单与输入组件",
          summary: "高级表单控件、验证规则和提交逻辑",
          category: "组件文档",
        },
      ],
    },
    {
      id: "team",
      title: "团队管理",
      icon: Users,
      articles: [
        {
          id: "7",
          title: "成员角色与权限",
          summary: "OWNER、ADMIN、MEMBER 三种角色的权限说明",
          category: "权限管理",
        },
        {
          id: "8",
          title: "创建和管理企业空间",
          summary: "从创建到配置企业空间的完整流程",
          category: "空间管理",
        },
        {
          id: "9",
          title: "团队协作最佳实践",
          summary: "提升团队协作效率的技巧和工具使用建议",
          category: "团队协作",
        },
      ],
    },
    {
      id: "settings",
      title: "个人设置",
      icon: Settings,
      articles: [
        {
          id: "10",
          title: "账号安全管理",
          summary: "密码修改、第三方账号绑定等安全设置",
          category: "安全设置",
        },
        {
          id: "11",
          title: "个性化外观配置",
          summary: "主题切换、界面偏好等个性化设置指南",
          category: "外观设置",
        },
        {
          id: "12",
          title: "通知与提醒设置",
          summary: "自定义系统通知和提醒的接收方式",
          category: "通知设置",
        },
      ],
    },
    {
      id: "security",
      title: "安全与隐私",
      icon: Shield,
      articles: [
        {
          id: "13",
          title: "数据加密与隐私保护",
          summary: "了解我们如何保护您的数据安全",
          category: "安全说明",
        },
        {
          id: "14",
          title: "企业数据隔离机制",
          summary: "多租户架构下的数据隔离和安全保障",
          category: "安全说明",
        },
        {
          id: "15",
          title: "审计日志与操作记录",
          summary: "查看和管理企业空间的操作审计日志",
          category: "审计合规",
        },
      ],
    },
  ];

  const filteredSections = docSections.map((section) => ({
    ...section,
    articles: section.articles.filter(
      (article) =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.summary.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((section) => section.articles.length > 0);

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#f0f8ff]">
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
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="group flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white/60 rounded-lg transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            返回
          </button>
          <Logo variant="light" />
        </div>

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
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-600 hover:bg-white/60 rounded-lg transition-all cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="relative z-10 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-7xl bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/90 overflow-hidden">
          {/* 头部搜索区 */}
          <div className="px-8 py-10 border-b border-[#e2e8f0]/90 bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
                  <BookOpen className="w-8 h-8 text-white" />
                </div>
              </div>
              <h1 className="text-3xl font-black text-slate-800 mb-3">
                帮助手册
              </h1>
              <p className="text-base text-slate-600 max-w-2xl mx-auto">
                查看全链路研发组件的标准化操作手册，快速掌握知阁舟坊的所有功能
              </p>
            </div>

            {/* 搜索框 */}
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文档..."
                className="w-full pl-12 pr-4 py-3.5 border border-[#e2e8f0] rounded-xl text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95 shadow-lg shadow-slate-200/50"
              />
            </div>
          </div>

          <div className="flex">
            {/* 侧边导航 */}
            <div className="hidden lg:block w-64 border-r border-[#e2e8f0]/90 p-6">
              <nav className="space-y-2">
                {docSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white shadow-lg shadow-[#3182ce]/20"
                          : "text-slate-600 hover:bg-slate-100/80"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {section.title}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* 文档列表 */}
            <div className="flex-1 p-8">
              {filteredSections.length === 0 ? (
                <div className="text-center py-20">
                  <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
                    <Search className="w-10 h-10 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">
                    未找到相关文档
                  </h3>
                  <p className="text-slate-600">
                    请尝试其他关键词，或联系管理员获取帮助
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {filteredSections.map((section) => (
                    <div key={section.id}>
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
                          <section.icon className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800">
                          {section.title}
                        </h2>
                      </div>

                      <div className="grid gap-4">
                        {section.articles.map((article) => (
                          <div
                            key={article.id}
                            className="group cursor-pointer p-5 bg-white/60 backdrop-blur-sm rounded-xl border border-[#e2e8f0]/80 hover:border-[#3182ce]/50 hover:shadow-lg hover:shadow-[#3182ce]/10 transition-all duration-300 hover:-translate-y-0.5"
                            style={{
                              transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
                            }}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="px-2.5 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-xs font-black rounded-full">
                                    {article.category}
                                  </span>
                                </div>
                                <h3 className="text-base font-bold text-slate-800 mb-2 group-hover:text-[#3182ce] transition-colors">
                                  {article.title}
                                </h3>
                                <p className="text-sm text-slate-600 leading-relaxed">
                                  {article.summary}
                                </p>
                              </div>
                              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-[#3182ce] group-hover:translate-x-1 transition-all flex-shrink-0" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 底部帮助 */}
              <div className="mt-12 pt-8 border-t border-[#e2e8f0]/90">
                <div className="bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5 rounded-xl p-6 text-center">
                  <h3 className="text-lg font-bold text-slate-800 mb-2">
                    需要更多帮助？
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    如果文档没有找到您需要的内容，可以联系我们的技术支持团队
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-[#3182ce] hover:bg-[#3182ce]/10 rounded-lg transition-all cursor-pointer">
                      <ExternalLink className="w-4 h-4" />
                      查看常见问题
                    </button>
                    <button className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-[#4299e1] to-[#3182ce] rounded-lg shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer">
                      联系技术支持
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
