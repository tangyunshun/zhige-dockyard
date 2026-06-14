"use client";

import { useState, useEffect } from "react";
import { useLogout } from "@/hooks/useLogout";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import SearchInput from "@/components/common/SearchInput";
import {
  BookOpen,
  ChevronRight,
  ExternalLink,
  FileText,
  Users,
  Settings,
  Shield,
  Rocket,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Search,
} from "lucide-react";
import Footer from "@/components/Footer";

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

interface User {
  id: string;
  name: string | null;
  avatar: string | null;
  email: string | null;
}

export default function DocsPage() {
  const router = useRouter();
  const handleLogout = useLogout();
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("quickstart");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error("加载用户信息失败:", error);
    }
  };

  const docSections: DocSection[] = [
    {
      id: "quickstart",
      title: "快速开始",
      icon: Rocket,
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
          summary: "自定义系统通知 and 提醒的接收方式",
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
    <div 
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.12) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Background radial blurs */}
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.06] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.06] rounded-full blur-[120px] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 bg-white/60 backdrop-blur-md border-b border-slate-200/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(user ? "/studio" : "/")}
            className="group flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl transition-all cursor-pointer border border-slate-200/40 shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            返回
          </button>
          <Logo variant="light" />
        </div>

        <div className="flex items-center gap-3">
          {user?.avatar && (
            <img
              src={user.avatar}
              alt={user.name || "用户头像"}
              className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm"
            />
          )}
          {user ? (
            <button
              onClick={handleLogout}
              className="group flex items-center gap-1.5 px-3 py-2 text-xs font-black text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              退出登录
            </button>
          ) : (
            <button
              onClick={() => router.push("/auth/login?redirect=/docs")}
              className="group flex items-center gap-1.5 px-4 py-2 text-xs font-black text-[#2b6cb0] bg-blue-50/50 border border-blue-200/30 hover:bg-[#3182ce] hover:text-white rounded-xl transition-all cursor-pointer shadow-sm"
            >
              登录
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-600 hover:bg-white/60 rounded-xl transition-all cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-7xl bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 overflow-hidden">
          
          {/* Top Searching Section */}
          <div className="px-6 py-10 border-b border-slate-100 bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-md shadow-[#2b6cb0]/20">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">
                系统帮助手册
              </h1>
              <p className="text-xs md:text-sm text-slate-600 max-w-xl mx-auto font-medium">
                查看全链路研发组件的标准化操作手册，快速掌握知阁舟坊的所有功能与沙箱配置。
              </p>
            </div>

            {/* Glowing Search Bar */}
            <div className="max-w-xl mx-auto">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="搜索文档要点或常见问题..."
                debounceMs={300}
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* Left Sidebar Category menu */}
            <div className="w-full lg:w-60 lg:border-r border-slate-100 p-5 shrink-0">
              <nav className="space-y-1.5">
                {docSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => {
                        setActiveSection(section.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-md shadow-[#2b6cb0]/25"
                          : "text-slate-600 hover:bg-slate-100/60"
                      }`}
                    >
                      <Icon className="w-4.5 h-4.5" />
                      {section.title}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Articles Details Panel */}
            <div className="flex-1 p-6 md:p-8">
              {filteredSections.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
                    <Search className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-base font-black text-slate-800 mb-1">
                    未找到匹配的手册文章
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    可以更换其他关键词，或联系技术支持团队。
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {filteredSections.map((section) => (
                    <div key={section.id} className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-sm text-white">
                          <section.icon className="w-4 h-4" />
                        </div>
                        <h2 className="text-base font-black text-slate-800">
                          {section.title}
                        </h2>
                      </div>

                      <div className="grid gap-3">
                        {section.articles.map((article) => (
                          <div
                            key={article.id}
                            className="group cursor-pointer p-5 bg-white/70 backdrop-blur-md rounded-[20px] border border-slate-100 hover:border-[#3182ce]/40 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-0.5"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center mb-2">
                                  <span className="px-2.5 py-0.5 bg-[#3182ce]/10 text-[#3182ce] text-[10px] font-black rounded-full">
                                    {article.category}
                                  </span>
                                </div>
                                <h3 className="text-sm font-black text-slate-800 mb-1.5 group-hover:text-[#3182ce] transition-colors">
                                  {article.title}
                                </h3>
                                <p className="text-xs text-slate-500 leading-relaxed font-bold">
                                  {article.summary}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom Support Actions banner */}
              <div className="mt-10 pt-8 border-t border-slate-100">
                <div className="bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5 rounded-[20px] p-6 text-center">
                  <h3 className="text-base font-black text-slate-800 mb-1">
                    需要更高级的专属保障？
                  </h3>
                  <p className="text-xs text-slate-500 mb-4 font-bold">
                    如果您需要定制化业务组件开发或驻场支持，欢迎联系我们的专家架构师。
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button 
                      onClick={() => router.push("/solutions")}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-black text-[#3182ce] hover:bg-[#3182ce]/10 rounded-xl transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      查看解决方案
                    </button>
                    <button 
                      onClick={() => router.push("/auth/login?redirect=/docs")}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-xl shadow-md shadow-blue-500/15 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                    >
                      联系专家技术支持
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>
      
      <Footer />
    </div>
  );
}
