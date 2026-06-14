"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  Lock,
  FileText,
  Zap,
  BarChart3,
  Users,
  Settings,
  Layout,
  Database,
  Code,
  Target,
  AlertTriangle,
  BookOpen,
  Wrench,
  TrendingUp,
  Shield,
  RefreshCw,
  Activity,
  Search,
  ClipboardCheck,
  MessageSquare,
  Calculator,
  Network,
  Radio,
  Mail,
  HardDrive,
  Smartphone,
  Monitor,
  FlaskConical,
  Weight,
  MousePointer,
  Container,
  Calendar,
  List,
  Library,
  HelpCircle,
  FileCheck,
  Presentation,
  Map,
  Grid3X3,
  ChevronDown,
  X,
  CreditCard,
  Crown,
  Trophy,
  Gem,
  Award,
  Building2,
  UserPlus,
  ArrowUp,
  Play,
  EyeOff,
  ArrowDown,
  Share2,
  FileText as FileTextIcon,
  Home,
} from "lucide-react";
import {
  COMPONENTS,
  COMPONENT_CATEGORIES,
  ComponentCategory,
  getComponentById,
} from "@/constants/components";
import { MEMBERSHIP_LEVELS, MembershipLevel } from "@/constants/membership";
import { useAppContext } from "@/contexts/AppContext";
import Footer from "@/components/Footer";
import { useToast } from "@/components/Toast";

const PRIMARY_COLOR = "#3182ce";
const PRIMARY_DARK = "#2b6cb0";
const PRIMARY_LIGHT = "#ebf8ff";
const TEXT_MAIN = "#0f172a";
const TEXT_SUB = "#64748b";
const TEXT_MUTED = "#94a3b8";
const BG_PAGE = "#f0f8ff";
const BG_CARD = "#ffffff";
const BORDER_COLOR = "#e2e8f0";
const RADIUS_CARD = "12px";
const RADIUS_BTN = "8px";

const ICON_MAP: Record<string, typeof FileText> = {
  document: FileText,
  shield: Shield,
  "bar-chart": BarChart3,
  "message-square": MessageSquare,
  calculator: Calculator,
  "trending-up": TrendingUp,
  "clipboard-list": List,
  network: Network,
  users: Users,
  database: Database,
  plug: Code,
  radio: Radio,
  mail: Mail,
  "hard-drive": HardDrive,
  lock: Lock,
  map: Map,
  zap: Zap,
  "refresh-cw": RefreshCw,
  layout: Layout,
  smartphone: Smartphone,
  monitor: Monitor,
  "check-circle": CheckCircle,
  "flask-conical": FlaskConical,
  weight: Weight,
  search: Search,
  "mouse-pointer": MousePointer,
  container: Container,
  activity: Activity,
  "file-text": FileText,
  "clipboard-check": ClipboardCheck,
  calendar: Calendar,
  "alert-triangle": AlertTriangle,
  "book-open": BookOpen,
  "message-circle": MessageSquare,
  library: Library,
  "help-circle": HelpCircle,
  "file-check": FileCheck,
  lightbulb: Target,
  wrench: Wrench,
  presentation: Presentation,
  default: Settings,
};

const MEMBERSHIP_ICONS: Record<string, typeof Crown> = {
  FREE: Building2,
  BRONZE: Trophy,
  SILVER: Award,
  GOLD: Crown,
  DIAMOND: Gem,
  CROWN: Crown,
};

const MEMBERSHIP_COLORS: Record<
  string,
  { primary: string; secondary: string; bg: string; border: string }
> = {
  FREE: {
    primary: "#64748b",
    secondary: "#94a3b8",
    bg: "#f1f5f9",
    border: "#e2e8f0",
  },
  BRONZE: {
    primary: "#cd7f32",
    secondary: "#daa06d",
    bg: "#fdf6e3",
    border: "#e6cb9a",
  },
  SILVER: {
    primary: "#6b7280",
    secondary: "#9ca3af",
    bg: "#f9fafb",
    border: "#d1d5db",
  },
  GOLD: {
    primary: "#d97706",
    secondary: "#f59e0b",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  DIAMOND: {
    primary: "#06b6d4",
    secondary: "#22d3ee",
    bg: "#ecfeff",
    border: "#67e8f9",
  },
  CROWN: {
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    bg: "#f5f3ff",
    border: "#c4b5fd",
  },
};

export default function CapabilitiesPage() {
  const router = useRouter();
  const { userState, isLoading, refreshUserState } = useAppContext();
  const toast = useToast();

  const [activeCategory, setActiveCategory] = useState<
    ComponentCategory | "ALL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null,
  );
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedMembership, setSelectedMembership] =
    useState<MembershipLevel | null>(null);
  const [expandedCategory, setExpandedCategory] =
    useState<ComponentCategory | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [highlightedMembership, setHighlightedMembership] = useState<
    string | null
  >(null);

  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [selectedComponentForRun, setSelectedComponentForRun] = useState<
    string | null
  >(null);
  const [displayedText, setDisplayedText] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [workspaces, setWorkspaces] = useState<
    {
      id: string;
      name: string;
      type: "personal" | "enterprise";
      hasComponentPermission?: boolean;
    }[]
  >([]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(progress);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 获取工作空间数据
  useEffect(() => {
    const fetchWorkspaces = async () => {
      if (!userState.isLoggedIn) {
        setWorkspaces([
          { id: "personal", name: "个人专属沙盒", type: "personal" as const },
        ]);
        return;
      }
      try {
        const userId = localStorage.getItem("userId");
        if (!userId) {
          setWorkspaces([
            { id: "personal", name: "个人专属沙盒", type: "personal" as const },
          ]);
          return;
        }
        const res = await fetch("/api/workspace/list", {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${userId}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          console.log("获取到的工作空间数据:", data);
          const workspaceList = data.workspaces.map((ws: any) => ({
            id: ws.id,
            name: ws.name,
            type: ws.type === "PERSONAL" ? "personal" : "enterprise",
            role: ws.role || "MEMBER",
            componentCount: ws.componentCount || 0,
            hasComponentPermission: ws.role === "OWNER" || ws.role === "ADMIN",
            description: ws.description,
            logo: ws.logo,
          }));
          setWorkspaces(workspaceList);
        } else {
          const errorText = await res.text();
          console.error("获取工作空间失败:", errorText);
          setWorkspaces([
            { id: "personal", name: "个人专属沙盒", type: "personal" as const },
          ]);
        }
      } catch (error) {
        console.error("获取工作空间异常:", error);
        setWorkspaces([
          { id: "personal", name: "个人专属沙盒", type: "personal" as const },
        ]);
      }
    };
    fetchWorkspaces();
  }, [userState.isLoggedIn]);

  // URL 参数解析：自动打开分享的组件
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const previewId = searchParams.get("preview");
    if (previewId && getComponentById(previewId)) {
      setSelectedComponent(previewId);
      // 平滑滚动到组件位置
      setTimeout(() => {
        const element = document.getElementById(`comp-${previewId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }, []);

  useEffect(() => {
    const hasModal = showUpgradeModal || showWorkspaceModal;
    if (hasModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showUpgradeModal, showWorkspaceModal]);

  const terminalLines = [
    "[系统日志] 初始化知阁解析引擎... 成功",
    "[执行流] 正在对齐工程规范与标书要素...",
    "[高危发现] 识别到 3 处隐蔽技术陷阱（涉及资质与排他性条款）",
    "[策略生成] 正在根据知识库生成应对策略与合规答复...",
  ];

  const fullTerminalText = terminalLines.join("\n");
  const [currentLineIndex, setCurrentLineIndex] = useState(0);

  useEffect(() => {
    if (!selectedComponent) return;
    setDisplayedText("");
    setIsTypingComplete(false);
    setCurrentLineIndex(0);
    let lineIndex = 0;
    let charIndex = 0;

    const timer = setInterval(() => {
      const currentLine = terminalLines[lineIndex];
      if (!currentLine) {
        setIsTypingComplete(true);
        clearInterval(timer);
        return;
      }

      const linesSoFar = terminalLines.slice(0, lineIndex).join("\n");
      const currentProgress =
        linesSoFar +
        (linesSoFar ? "\n" : "") +
        currentLine.slice(0, charIndex + 1);
      setDisplayedText(currentProgress);
      setCurrentLineIndex(lineIndex);

      charIndex++;
      if (charIndex > currentLine.length) {
        lineIndex++;
        charIndex = 0;
      }
    }, 50);
    return () => clearInterval(timer);
  }, [selectedComponent]);

  const filteredComponents = useMemo(() => {
    let filtered = COMPONENTS;

    if (activeCategory !== "ALL") {
      filtered = filtered.filter((comp) => comp.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (comp) =>
          comp.name.toLowerCase().includes(query) ||
          comp.description.toLowerCase().includes(query) ||
          comp.tags.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return filtered;
  }, [activeCategory, searchQuery]);

  const componentsByCategory = useMemo(() => {
    return COMPONENTS.reduce(
      (acc, comp) => {
        if (!acc[comp.category]) acc[comp.category] = [];
        acc[comp.category].push(comp);
        return acc;
      },
      {} as Record<ComponentCategory, typeof COMPONENTS>,
    );
  }, []);

  const categories = useMemo(() => {
    return Object.keys(COMPONENT_CATEGORIES) as ComponentCategory[];
  }, []);

  const currentMembership = useMemo(() => {
    if (!userState.isLoggedIn) return null;
    return MEMBERSHIP_LEVELS[0];
  }, [userState.isLoggedIn]);

  const showComponentLocked = (componentId: string): boolean => {
    return !userState.isLoggedIn;
  };

  const getUserMembershipTier = (): string => {
    if (!userState.isLoggedIn) return "GUEST";
    try {
      const stored = localStorage.getItem("userMembership");
      if (stored) return stored;
    } catch {}
    return "FREE";
  };

  const isVipUser = (): boolean => {
    const tier = getUserMembershipTier();
    return !["GUEST", "FREE"].includes(tier);
  };

  const FREE_COMPONENTS = ["C01", "C07", "C23"];

  const isAccessible = (componentId: string): boolean => {
    return isVipUser() || FREE_COMPONENTS.includes(componentId);
  };

  const getAccessibleCount = (): number => {
    if (isVipUser()) return COMPONENTS.length;
    return FREE_COMPONENTS.length;
  };

  const getEnterpriseSpaceLimit = (): number => {
    if (!isVipUser()) return 0;
    try {
      const stored = localStorage.getItem("enterpriseSpaceLimit");
      if (stored) return parseInt(stored);
    } catch {}
    return 5;
  };

  const getTokenBalance = (): { used: number; total: number } => {
    try {
      const stored = localStorage.getItem("tokenBalance");
      if (stored) return JSON.parse(stored);
    } catch {}
    return { used: 150, total: 1000 };
  };

  const getWorkspaces = (): {
    id: string;
    name: string;
    type: "personal" | "enterprise";
    hasComponentPermission?: boolean;
  }[] => {
    const workspaces: {
      id: string;
      name: string;
      type: "personal" | "enterprise";
      hasComponentPermission?: boolean;
    }[] = [{ id: "personal", name: "个人专属沙盒", type: "personal" }];
    if (isVipUser()) {
      try {
        const stored = localStorage.getItem("userWorkspaces");
        if (stored) {
          const enterpriseWorkspaces = JSON.parse(stored);
          workspaces.push(...enterpriseWorkspaces);
        }
      } catch {}
    }
    return workspaces;
  };

  const membershipTier = getUserMembershipTier();
  const membershipInfo =
    MEMBERSHIP_LEVELS.find((m) => m.id === membershipTier) ||
    MEMBERSHIP_LEVELS[0];

  const handleComponentClick = (componentId: string) => {
    const component = getComponentById(componentId);
    if (!component) return;

    // 不管是否登录，都显示详情面板，让用户先了解组件价值
    setSelectedComponent(componentId);
    if (component.isPremium) {
      setHighlightedMembership("GOLD");
    } else {
      setHighlightedMembership(null);
    }

    const element = document.getElementById(`comp-${componentId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleLoginClick = () => {
    router.push("/auth/login");
  };

  const handleRegisterClick = () => {
    router.push("/auth/register");
  };

  const handleUpgradeClick = (membership: MembershipLevel) => {
    setSelectedMembership(membership);
    setShowUpgradeModal(true);
  };

  const showToastNotification = (
    message: string,
    type: "success" | "error" | "info" = "info",
  ) => {
    if (type === "success") {
      toast.success(message);
    } else if (type === "error") {
      toast.error(message);
    } else {
      toast.info(message);
    }
  };

  const getIcon = (iconName: string) => {
    return ICON_MAP[iconName] || ICON_MAP["default"];
  };

  const toggleCategory = (category: ComponentCategory) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: BG_PAGE }}
      >
        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className="w-16 h-16 border-4 rounded-full animate-spin"
              style={{
                borderColor: PRIMARY_COLOR,
                borderTopColor: "transparent",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Grid3X3 className="w-6 h-6" style={{ color: PRIMARY_COLOR }} />
            </div>
          </div>
          <p className="mt-4 text-slate-600 font-medium">正在加载能力矩阵...</p>
        </div>
      </div>
    );
  }

  const hasModal = showUpgradeModal || showWorkspaceModal;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG_PAGE }}>
      {!hasModal && (
        <div
          className="fixed top-[60px] left-0 right-0 h-1 z-[60] transition-all duration-300"
          style={{
            backgroundColor: PRIMARY_COLOR,
            width: `${scrollProgress}%`,
          }}
        />
      )}

      {selectedComponent &&
        (() => {
          const comp = getComponentById(selectedComponent);
          if (!comp) return null;
          const Icon = getIcon(comp.icon);
          const isLocked = !userState.isLoggedIn;

          const handleShare = () => {
            navigator.clipboard.writeText(
              `https://zhige-dockyard.com/capabilities?preview=${comp.id}`,
            );
            showToastNotification(
              "🔗 专属演示链接已复制，同事打开后可直接观看沙盘推演！",
              "success",
            );
          };

          return (
            <aside
              className="hidden lg:block fixed right-0 top-[60px] bottom-0 w-[44%] overflow-y-auto shadow-2xl z-30 animate-slide-in-right"
              style={{
                backgroundColor: "#ffffff",
                borderLeft: `1px solid ${BORDER_COLOR}`,
              }}
            >
              <div className="p-8">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#2b6cb0] transition-colors px-2 py-1 rounded hover:bg-slate-50"
                  >
                    <Share2 className="w-4 h-4" />
                    分享给同事
                  </button>
                  <button
                    onClick={() => {
                      setSelectedComponent(null);
                      setHighlightedMembership(null);
                    }}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-4 h-4" style={{ color: TEXT_SUB }} />
                  </button>
                </div>

                <div className="flex items-start gap-5 mb-8">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: PRIMARY_LIGHT }}
                  >
                    <Icon className="w-8 h-8" style={{ color: PRIMARY_DARK }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs font-bold px-2 py-1 rounded"
                        style={{
                          backgroundColor: PRIMARY_LIGHT,
                          color: PRIMARY_COLOR,
                        }}
                      >
                        {comp.id}
                      </span>
                    </div>
                    <h2
                      className="text-xl font-bold"
                      style={{ color: TEXT_MAIN }}
                    >
                      {comp.name}
                    </h2>
                    <p
                      className="text-sm mt-2 leading-relaxed"
                      style={{ color: TEXT_SUB }}
                    >
                      {comp.description}
                    </p>
                  </div>
                </div>

                <div
                  className="mb-8 p-5 rounded-xl border"
                  style={{ borderColor: "#e2e8f0", backgroundColor: "#f8fafc" }}
                >
                  <h3
                    className="text-sm font-bold mb-3"
                    style={{ color: TEXT_MAIN }}
                  >
                    功能详情
                  </h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                        style={{ backgroundColor: PRIMARY_COLOR }}
                      ></span>
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: TEXT_SUB }}
                      >
                        支持多种文档格式上传，自动识别关键信息
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                        style={{ backgroundColor: PRIMARY_COLOR }}
                      ></span>
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: TEXT_SUB }}
                      >
                        智能分析处理，生成结构化输出结果
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                        style={{ backgroundColor: PRIMARY_COLOR }}
                      ></span>
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: TEXT_SUB }}
                      >
                        结果可导出为多种格式，便于后续使用
                      </span>
                    </li>
                  </ul>
                  <div
                    className="flex items-center gap-2 mt-4 pt-4 border-t"
                    style={{ borderColor: "#e2e8f0" }}
                  >
                    <Activity
                      className="w-4 h-4"
                      style={{ color: TEXT_MUTED }}
                    />
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>
                      每次调用预估消耗 {comp.estimatedTokens} Token
                    </span>
                  </div>
                </div>

                <div
                  className="mb-8 p-4 rounded-xl border"
                  style={{ borderColor: "#10b981", backgroundColor: "#f0fdf4" }}
                >
                  <div className="flex items-start gap-3">
                    <TrendingUp
                      className="w-5 h-5 mt-0.5 shrink-0"
                      style={{ color: "#10b981" }}
                    />
                    <div className="flex-1">
                      <h3
                        className="text-sm font-bold mb-2"
                        style={{ color: "#166534" }}
                      >
                        组件价值
                      </h3>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "#15803d" }}
                      >
                        {comp.previewData.roiText}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <h3
                    className="text-sm font-semibold mb-4"
                    style={{ color: TEXT_MAIN }}
                  >
                    沙盘运行预览
                  </h3>

                  <div className="space-y-4">
                    <div
                      className="p-5 rounded-xl border relative overflow-hidden"
                      style={{
                        borderColor: "#e2e8f0",
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowUp
                          className="w-4 h-4"
                          style={{ color: "#10b981" }}
                        />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: TEXT_SUB }}
                        >
                          输入参数
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                          <FileTextIcon className="w-8 h-8 text-gray-600" />
                          <div
                            className="absolute inset-x-2 h-0.5 bg-green-500 animate-pulse"
                            style={{
                              animation: "scanMove 2s ease-in-out infinite",
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 mb-1">
                            正在扫描文件...
                          </p>
                          <p
                            className="text-sm leading-relaxed"
                            style={{ color: TEXT_MAIN }}
                          >
                            {comp.previewData.inputMock}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className="relative p-5 rounded-xl border"
                      style={{
                        borderColor: "#e2e8f0",
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <ArrowDown
                          className="w-4 h-4"
                          style={{ color: PRIMARY_COLOR }}
                        />
                        <span
                          className="text-xs font-semibold"
                          style={{ color: TEXT_SUB }}
                        >
                          结构化输出
                        </span>
                      </div>
                      <div className="bg-slate-900 text-green-400 p-4 rounded-[4px] font-mono text-xs overflow-hidden relative min-h-[160px]">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <div className="w-3 h-3 rounded-full bg-yellow-500" />
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-xs text-slate-400 ml-2">
                            zhige-analyzer
                          </span>
                        </div>
                        <div className="min-h-[80px] whitespace-pre-line">
                          <span>{displayedText}</span>
                          <span className="animate-pulse">_</span>
                        </div>

                        {/* 高斯模糊拦截墙 - 在第 3 行后显示 */}
                        {currentLineIndex >= 2 && (
                          <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-white via-white/80 to-transparent backdrop-blur-md">
                            <div className="absolute inset-0 flex items-center justify-center">
                              {!userState.isLoggedIn ? (
                                <button
                                  onClick={() => router.push("/auth/login")}
                                  className="px-6 py-2.5 bg-[#2b6cb0] text-white text-sm font-semibold rounded-lg hover:bg-[#2c5282] transition-colors"
                                >
                                  🚀 登录知阁系统 查看完整分析与应对策略
                                </button>
                              ) : !isAccessible(comp.id) ? (
                                <button
                                  onClick={() =>
                                    handleUpgradeClick(MEMBERSHIP_LEVELS[2])
                                  }
                                  className="px-6 py-2.5 bg-[#d97706] text-white text-sm font-semibold rounded-lg hover:bg-[#b45309] transition-colors"
                                >
                                  您当前的 [社区尝鲜版]
                                  无此组件权限，立即升级专业版
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedComponentForRun(comp.id);
                                    setShowWorkspaceModal(true);
                                  }}
                                  className="px-6 py-2.5 bg-[#10b981] text-white text-sm font-semibold rounded-lg hover:bg-[#059669] transition-colors flex items-center gap-2"
                                >
                                  <Play className="w-4 h-4" />
                                  进入工作台运行此任务
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="mb-8 p-4 rounded-xl border"
                  style={{ borderColor: "#fcd34d", backgroundColor: "#fffbeb" }}
                >
                  <div className="flex items-start gap-2">
                    <TrendingUp
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "#d97706" }}
                    />
                    <p
                      className="text-sm font-medium"
                      style={{ color: "#92400e" }}
                    >
                      {comp.previewData.roiText}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {!userState.isLoggedIn ? (
                    <button
                      onClick={handleLoginClick}
                      className="w-full h-12 rounded-xl font-semibold transition-all cursor-pointer"
                      style={{
                        backgroundColor: PRIMARY_DARK,
                        color: "white",
                        boxShadow: "0 4px 12px rgba(43, 108, 176, 0.2)",
                        minHeight: "48px",
                      }}
                    >
                      立即使用
                    </button>
                  ) : !isAccessible(selectedComponent || "") ? (
                    <button
                      onClick={() => {
                        handleUpgradeClick(MEMBERSHIP_LEVELS[2]);
                        setHighlightedMembership("GOLD");
                      }}
                      className="w-full h-12 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        backgroundColor: PRIMARY_DARK,
                        color: "white",
                        boxShadow: "0 4px 12px rgba(43, 108, 176, 0.2)",
                        minHeight: "48px",
                      }}
                    >
                      开通专业版解锁此组件
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedComponentForRun(selectedComponent);
                        setShowWorkspaceModal(true);
                      }}
                      className="w-full h-12 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        backgroundColor: "#10b981",
                        color: "white",
                        boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
                        minHeight: "48px",
                      }}
                    >
                      <Play className="w-4 h-4" />
                      立即运行
                    </button>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  {comp.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 text-xs font-medium rounded-full"
                      style={{ backgroundColor: "#f1f5f9", color: TEXT_SUB }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </aside>
          );
        })()}

      {showUpgradeModal && selectedMembership && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowUpgradeModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-20 flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${MEMBERSHIP_COLORS[selectedMembership.id].primary} 0%, ${MEMBERSHIP_COLORS[selectedMembership.id].secondary} 100%)`,
              }}
            >
              {(() => {
                const Icon = MEMBERSHIP_ICONS[selectedMembership.id];
                return <Icon className="w-10 h-10 text-white" />;
              })()}
            </div>
            <div className="p-6 -mt-6 relative">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="absolute top-0 right-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
              <div className="text-center">
                <h2 className="text-xl font-bold mb-2">
                  {selectedMembership.displayName}
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  {selectedMembership.description}
                </p>
                <div className="text-3xl font-bold text-gray-800 mb-2">
                  ¥{selectedMembership.monthlyPrice}
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    /月
                  </span>
                </div>
              </div>
              <div className="space-y-2 mb-6">
                {selectedMembership.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {feature.included ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                        <X className="w-3 h-3 text-gray-400" />
                      </div>
                    )}
                    <span
                      className={
                        feature.included ? "text-gray-700" : "text-gray-400"
                      }
                    >
                      {feature.text}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  showToastNotification(
                    `正在跳转至${selectedMembership.displayName}升级页面`,
                    "info",
                  );
                  setShowUpgradeModal(false);
                }}
                className="w-full h-12 rounded-xl font-semibold text-white"
                style={{
                  backgroundColor:
                    MEMBERSHIP_COLORS[selectedMembership.id].primary,
                }}
              >
                {selectedMembership.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkspaceModal &&
        selectedComponentForRun &&
        (() => {
          const comp = getComponentById(selectedComponentForRun);
          if (!comp) return null;

          const personalWorkspaces = workspaces.filter(
            (ws) => ws.type === "personal",
          );
          const enterpriseWorkspaces = workspaces.filter(
            (ws) => ws.type === "enterprise",
          );

          const renderWorkspaceCard = (ws: any) => {
            const isDisabled =
              ws.type === "enterprise" && ws.hasComponentPermission === false;
            return (
              <button
                key={ws.id}
                disabled={isDisabled}
                onClick={() => {
                  setShowWorkspaceModal(false);
                  setSelectedComponent(null);
                  localStorage.setItem(
                    "runComponentId",
                    selectedComponentForRun || "",
                  );
                  router.push(`/workspace/${ws.id}`);
                }}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:border-[#2b6cb0] hover:shadow-md cursor-pointer"
                }`}
                style={{
                  borderColor: BORDER_COLOR,
                  backgroundColor: BG_CARD,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      ws.type === "personal" ? "bg-blue-100" : "bg-orange-100"
                    }`}
                  >
                    {ws.type === "personal" ? (
                      <Home className="w-5 h-5 text-blue-600" />
                    ) : (
                      <Building2 className="w-5 h-5 text-orange-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-semibold text-sm truncate"
                        style={{ color: TEXT_MAIN }}
                      >
                        {ws.name}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          ws.type === "personal"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {ws.type === "personal" ? "个人空间" : "企业空间"}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: TEXT_MUTED }}>
                      {ws.componentCount} 个组件
                    </div>
                    {isDisabled && (
                      <div
                        className="text-xs mt-1 flex items-center gap-1"
                        style={{ color: "#e53e3e" }}
                      >
                        <Lock className="w-3 h-3" />
                        无当前企业操作权限
                      </div>
                    )}
                  </div>
                  {!isDisabled && (
                    <ArrowRight
                      className="w-4 h-4 flex-shrink-0 mt-1"
                      style={{ color: TEXT_MUTED }}
                    />
                  )}
                </div>
              </button>
            );
          };

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(8px)",
              }}
              onClick={() => setShowWorkspaceModal(false)}
            >
              <div
                className="relative w-full max-w-lg rounded-2xl shadow-2xl flex flex-col"
                style={{
                  backgroundColor: BG_CARD,
                  maxHeight: "80vh",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="px-6 py-4 border-b flex-shrink-0"
                  style={{ borderColor: BORDER_COLOR }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2
                        className="text-lg font-bold"
                        style={{ color: TEXT_MAIN }}
                      >
                        选择运行空间
                      </h2>
                      <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
                        {comp.name}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowWorkspaceModal(false)}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                      style={{ backgroundColor: "#f1f5f9" }}
                    >
                      <X className="w-4 h-4" style={{ color: TEXT_SUB }} />
                    </button>
                  </div>
                </div>

                <div
                  className="flex-1 overflow-y-auto px-6 py-4 space-y-6"
                  style={{ maxHeight: "calc(80vh - 140px)" }}
                >
                  {workspaces.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      加载中...
                    </div>
                  ) : (
                    <>
                      {personalWorkspaces.length > 0 && (
                        <div>
                          <h3
                            className="text-sm font-semibold mb-3 flex items-center gap-2"
                            style={{ color: TEXT_MAIN }}
                          >
                            <Home className="w-4 h-4 text-blue-600" />
                            个人空间
                          </h3>
                          <div className="space-y-2">
                            {personalWorkspaces.map(renderWorkspaceCard)}
                          </div>
                        </div>
                      )}

                      {enterpriseWorkspaces.length > 0 && (
                        <div>
                          <h3
                            className="text-sm font-semibold mb-3 flex items-center gap-2"
                            style={{ color: TEXT_MAIN }}
                          >
                            <Building2 className="w-4 h-4 text-orange-600" />
                            企业空间
                          </h3>
                          <div className="space-y-2">
                            {enterpriseWorkspaces.map(renderWorkspaceCard)}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div
                  className="px-6 py-4 border-t flex-shrink-0"
                  style={{ borderColor: BORDER_COLOR }}
                >
                  <button
                    onClick={() => {
                      setShowWorkspaceModal(false);
                      router.push("/workspace-hub");
                    }}
                    className="w-full py-2.5 rounded-lg font-medium transition-colors"
                    style={{
                      backgroundColor: "#f1f5f9",
                      color: TEXT_MAIN,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#e2e8f0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#f1f5f9";
                    }}
                  >
                    管理空间
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ backgroundColor: PRIMARY_LIGHT }}
            >
              <Grid3X3 className="w-4 h-4" style={{ color: PRIMARY_COLOR }} />
              <span
                className="text-sm font-medium"
                style={{ color: PRIMARY_COLOR }}
              >
                产品能力中心
              </span>
            </div>

            <h1
              className="text-4xl md:text-5xl font-black mb-4"
              style={{ color: TEXT_MAIN }}
            >
              效能组件矩阵
            </h1>
            <p
              className="text-lg max-w-2xl mx-auto"
              style={{ color: TEXT_SUB }}
            >
              覆盖软件工程全生命周期的 53 个专业效能组件，助力团队高效研发
            </p>
          </div>

          {userState.isLoggedIn &&
            (() => {
              const tokenBalance = getTokenBalance();
              return (
                <div
                  className="bg-white rounded-2xl p-6 mb-12 shadow-sm border"
                  style={{ borderColor: BORDER_COLOR }}
                >
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                        style={{ backgroundColor: PRIMARY_DARK }}
                      >
                        {(userState.userInfo?.name || "用").charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="font-bold text-lg"
                            style={{ color: TEXT_MAIN }}
                          >
                            {userState.userInfo?.name || "用户"}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full ${isVipUser() ? "text-white" : "text-slate-600"}`}
                            style={{
                              backgroundColor: isVipUser()
                                ? "#2b6cb0"
                                : "#f1f5f9",
                            }}
                          >
                            {membershipInfo.displayName}
                          </span>
                        </div>
                        <p className="text-sm" style={{ color: TEXT_SUB }}>
                          当前可用组件：{getAccessibleCount()}/
                          {COMPONENTS.length} | 企业协作空间上限：
                          {getEnterpriseSpaceLimit()} 个
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm" style={{ color: TEXT_SUB }}>
                        Token 剩余
                      </div>
                      <div
                        className="text-lg font-bold"
                        style={{ color: TEXT_MAIN }}
                      >
                        {tokenBalance.used} / {tokenBalance.total}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <div
              className="bg-white rounded-xl p-6 shadow-sm border"
              style={{ borderColor: BORDER_COLOR }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: PRIMARY_LIGHT }}
                >
                  <Grid3X3
                    className="w-5 h-5"
                    style={{ color: PRIMARY_COLOR }}
                  />
                </div>
                <span
                  className="text-sm font-medium"
                  style={{ color: TEXT_SUB }}
                >
                  总组件数
                </span>
              </div>
              <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                53
              </div>
            </div>

            <div
              className="bg-white rounded-xl p-6 shadow-sm border"
              style={{ borderColor: BORDER_COLOR }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#f5f3ff" }}
                >
                  <Target className="w-5 h-5" style={{ color: "#8b5cf6" }} />
                </div>
                <span
                  className="text-sm font-medium"
                  style={{ color: TEXT_SUB }}
                >
                  工程阶段
                </span>
              </div>
              <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                10
              </div>
            </div>

            <div
              className="bg-white rounded-xl p-6 shadow-sm border"
              style={{ borderColor: BORDER_COLOR }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#ecfdf5" }}
                >
                  <Users className="w-5 h-5" style={{ color: "#10b981" }} />
                </div>
                <span
                  className="text-sm font-medium"
                  style={{ color: TEXT_SUB }}
                >
                  支持岗位
                </span>
              </div>
              <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                8
              </div>
            </div>

            <div
              className="bg-white rounded-xl p-6 shadow-sm border"
              style={{ borderColor: BORDER_COLOR }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#fffbeb" }}
                >
                  <Activity className="w-5 h-5" style={{ color: "#f59e0b" }} />
                </div>
                <span
                  className="text-sm font-medium"
                  style={{ color: TEXT_SUB }}
                >
                  活跃组件
                </span>
              </div>
              <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                48
              </div>
            </div>
          </div>

          <div className="w-full bg-gradient-to-r from-blue-50 to-white border border-blue-100 rounded-[8px] p-6 mb-8 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold" style={{ color: TEXT_MAIN }}>
                  🚀 最佳实践：架构师打单标准流
                </h3>
                <p className="text-sm mt-1" style={{ color: TEXT_SUB }}>
                  这几个组件连起来，能直接替你干完一天的活
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-2 bg-white rounded-lg border border-blue-200 shadow-sm flex items-center gap-2">
                    <FileText
                      className="w-4 h-4"
                      style={{ color: PRIMARY_DARK }}
                    />
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_MAIN }}
                    >
                      C01 标书解析
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-blue-400" />
                  <div className="px-3 py-2 bg-white rounded-lg border border-blue-200 shadow-sm flex items-center gap-2">
                    <List className="w-4 h-4" style={{ color: PRIMARY_DARK }} />
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_MAIN }}
                    >
                      C07 需求转 PRD
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-blue-400" />
                  <div className="px-3 py-2 bg-white rounded-lg border border-blue-200 shadow-sm flex items-center gap-2">
                    <Code className="w-4 h-4" style={{ color: PRIMARY_DARK }} />
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_MAIN }}
                    >
                      C23 Swagger 生成
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    router.push("/auth/login");
                  }}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1 px-4 py-2 bg-white rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  查看该工作流实战报告
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div
            className={`flex flex-col lg:flex-row gap-6 ${selectedComponent ? "lg:mr-[44%]" : ""} transition-all duration-300`}
          >
            <div className="lg:w-[20%] shrink-0">
              <div
                className="bg-white rounded-xl p-4 sticky top-[72px] shadow-sm border"
                style={{ borderColor: BORDER_COLOR }}
              >
                <h3
                  className="font-semibold mb-4 text-sm"
                  style={{ color: TEXT_MAIN }}
                >
                  工程阶段
                </h3>

                <button
                  onClick={() => setActiveCategory("ALL")}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-1`}
                  style={{
                    backgroundColor:
                      activeCategory === "ALL" ? PRIMARY_LIGHT : "transparent",
                    color: activeCategory === "ALL" ? PRIMARY_DARK : TEXT_SUB,
                    fontWeight: activeCategory === "ALL" ? "bold" : "500",
                  }}
                >
                  全部组件 ({COMPONENTS.length})
                </button>

                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setActiveCategory(category);
                      toggleCategory(category);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between mb-1`}
                    style={{
                      backgroundColor:
                        activeCategory === category
                          ? PRIMARY_LIGHT
                          : "transparent",
                      color:
                        activeCategory === category ? PRIMARY_DARK : TEXT_SUB,
                      fontWeight: activeCategory === category ? "bold" : "500",
                    }}
                  >
                    <span className="truncate">
                      {COMPONENT_CATEGORIES[category]}
                    </span>
                    <span
                      className="text-xs shrink-0 ml-1"
                      style={{ color: TEXT_MUTED }}
                    >
                      {componentsByCategory[category]?.length || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className="flex-1 lg:w-[80%]"
              style={{ maxWidth: selectedComponent ? "100%" : "100%" }}
            >
              <div
                className="bg-white rounded-xl p-4 shadow-sm border mb-6"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="relative">
                  <Search
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: TEXT_MUTED }}
                  />
                  <input
                    type="text"
                    placeholder="搜索组件名称、描述或标签..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 pl-12 pr-4 rounded-xl border outline-none transition-all text-sm"
                    style={{
                      backgroundColor: "#f8fafc",
                      borderColor: BORDER_COLOR,
                      color: TEXT_MAIN,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = PRIMARY_COLOR;
                      e.target.style.boxShadow = `0 0 0 3px rgba(43, 108, 176, 0.1)`;
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = BORDER_COLOR;
                      e.target.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>

              {filteredComponents.length === 0 ? (
                <div
                  className="text-center py-16 bg-white rounded-xl border"
                  style={{ borderColor: BORDER_COLOR }}
                >
                  <div
                    className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ backgroundColor: "#f1f5f9" }}
                  >
                    <Search
                      className="w-10 h-10"
                      style={{ color: TEXT_MUTED }}
                    />
                  </div>
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{ color: TEXT_MAIN }}
                  >
                    未找到匹配的组件
                  </h3>
                  <p className="text-slate-500">
                    请尝试其他搜索关键词或筛选条件
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(activeCategory === "ALL"
                    ? categories
                    : [activeCategory]
                  ).map((category) => (
                    <div
                      key={category}
                      className="bg-white rounded-xl border overflow-hidden"
                      style={{ borderColor: BORDER_COLOR }}
                    >
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: PRIMARY_DARK }}
                          />
                          <span
                            className="font-semibold text-sm"
                            style={{ color: TEXT_MAIN }}
                          >
                            {
                              COMPONENT_CATEGORIES[
                                category as ComponentCategory
                              ]
                            }
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "#f1f5f9",
                              color: TEXT_SUB,
                            }}
                          >
                            {componentsByCategory[category as ComponentCategory]
                              ?.length || 0}{" "}
                            个
                          </span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-300 ${expandedCategory === category || activeCategory !== "ALL" ? "rotate-180" : ""}`}
                          style={{ color: TEXT_SUB }}
                        />
                      </button>

                      {(expandedCategory === category ||
                        activeCategory !== "ALL") && (
                        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-3">
                          {componentsByCategory[
                            category as ComponentCategory
                          ]?.map((component) => {
                            if (
                              activeCategory !== "ALL" &&
                              !filteredComponents.find(
                                (c) => c.id === component.id,
                              )
                            )
                              return null;
                            const Icon = getIcon(component.icon);
                            const isSelected =
                              selectedComponent === component.id;
                            const isGuest = !userState.isLoggedIn;
                            const accessible = isAccessible(component.id);
                            const isInaccessibleLoggedIn =
                              userState.isLoggedIn && !accessible;

                            return (
                              <div
                                id={`comp-${component.id}`}
                                key={component.id}
                                onClick={() =>
                                  handleComponentClick(component.id)
                                }
                                className={`relative p-4 rounded-xl border transition-all duration-200 ${
                                  isSelected
                                    ? "border-[#2b6cb0] shadow-md bg-[#ebf8ff]/50"
                                    : ""
                                } ${
                                  isInaccessibleLoggedIn
                                    ? "opacity-60 bg-slate-50 cursor-not-allowed"
                                    : "bg-white cursor-pointer"
                                } ${
                                  accessible && !isGuest
                                    ? "hover:shadow-[0_0_16px_rgba(43,108,176,0.2)] hover:border-[#2b6cb0]"
                                    : ""
                                }`}
                                style={{
                                  borderColor: isSelected
                                    ? PRIMARY_DARK
                                    : BORDER_COLOR,
                                  backgroundColor: isSelected
                                    ? PRIMARY_LIGHT + "80"
                                    : isInaccessibleLoggedIn
                                      ? "#f8fafc"
                                      : "white",
                                }}
                                onMouseEnter={(e) => {
                                  if (isGuest) {
                                    e.currentTarget.style.transform =
                                      "translateY(-2px)";
                                    e.currentTarget.style.boxShadow =
                                      "0 4px 12px rgba(15, 23, 42, 0.08)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (isGuest) {
                                    e.currentTarget.style.transform =
                                      "translateY(0)";
                                    e.currentTarget.style.boxShadow = "none";
                                  }
                                }}
                              >
                                {accessible && !isGuest && (
                                  <div className="absolute top-3 right-3 z-10">
                                    <span
                                      className="text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1"
                                      style={{
                                        backgroundColor: "#ecfdf5",
                                        color: "#10b981",
                                      }}
                                    >
                                      <Play className="w-3 h-3" /> 可运行
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-start gap-3">
                                  <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: PRIMARY_LIGHT }}
                                  >
                                    <Icon
                                      className="w-5 h-5"
                                      style={{ color: PRIMARY_DARK }}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                        style={{
                                          backgroundColor: "#f1f5f9",
                                          color: PRIMARY_COLOR,
                                        }}
                                      >
                                        {component.id}
                                      </span>
                                      <h4
                                        className="font-semibold text-sm truncate"
                                        style={{ color: TEXT_MAIN }}
                                      >
                                        {component.name}
                                      </h4>
                                    </div>
                                    <p
                                      className="text-xs truncate mb-2"
                                      style={{ color: TEXT_SUB }}
                                    >
                                      {component.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                      {component.businessTags
                                        ?.slice(0, 2)
                                        .map((tag, index) => (
                                          <span
                                            key={index}
                                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        {component.tags
                                          .slice(0, 2)
                                          .map((tag, index) => (
                                            <span
                                              key={index}
                                              className="text-[10px] px-1.5 py-0.5 rounded"
                                              style={{
                                                backgroundColor: "#f1f5f9",
                                                color: TEXT_SUB,
                                              }}
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                      </div>
                                      <span
                                        className="text-[10px]"
                                        style={{ color: TEXT_MUTED }}
                                      >
                                        {component.estimatedTokens}T
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />

      {!hasModal && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="回到顶部"
          className={`fixed bottom-8 right-8 z-50 w-12 h-12 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center cursor-pointer ${
            scrollProgress > 5
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
          style={{ backgroundColor: PRIMARY_COLOR }}
        >
          <ArrowUp className="w-5 h-5 text-white" />
        </button>
      )}

      <style jsx global>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes scanMove {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          50% {
            transform: translateY(28px);
            opacity: 0.5;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.15)
            forwards;
        }
      `}</style>
    </div>
  );
}
