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
  Star,
  Box,
  Grid3X3 as GridIcon,
  Clock,
  TrendingUp as TrendingUpIcon,
  ChevronRight,
  Heart,
  Trash2,
  ArrowLeft,
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

const FREE_COMPONENTS = ["C01", "C07", "C46"];

export default function CapabilitiesPage() {
  const router = useRouter();
  const { userState, isLoading, refreshUserState } = useAppContext();
  const toast = useToast();

  const [activeCategory, setActiveCategory] = useState<
    ComponentCategory | "ALL" | "FAVORITES" | "RECENT" | "FREE_TRIAL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null,
  );
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedMembership, setSelectedMembership] =
    useState<MembershipLevel | null>(null);
  const [expandedCategory, setExpandedCategory] =
    useState<ComponentCategory | "FAVORITES" | "RECENT" | "FREE_TRIAL" | null>(null);
  const [highlightedMembership, setHighlightedMembership] = useState<
    string | null
  >(null);
  const [runningTask, setRunningTask] = useState<{
    componentId: string;
    workspaceName: string;
    progress: number;
    statusText: string;
  } | null>(null);

  const [showDemoModal, setShowDemoModal] = useState(false);
  const [demoName, setDemoName] = useState("");
  const [demoContact, setDemoContact] = useState("");

  const handleRunInStudio = (componentId: string) => {
    const wsId = userState.currentWorkspaceId || workspaces[0]?.id || "";
    router.push(`/studio?componentId=${componentId}${wsId ? `&workspaceId=${wsId}` : ""}`);
  };

  const startWorkspaceTask = (componentId: string, workspaceName: string) => {
    setShowWorkspaceModal(false);
    setSelectedComponent(null);

    const comp = getComponentById(componentId);
    if (!comp) return;

    setRunningTask({
      componentId,
      workspaceName,
      progress: 0,
      statusText: "正在初始化沙盒环境...",
    });

    const statusSteps = [
      { progress: 20, text: "正在解析配置契约与输入参数..." },
      { progress: 50, text: "正在搭建微服务并部署执行引擎..." },
      { progress: 85, text: "正在生成结构化输出与沙盒推演..." },
      { progress: 100, text: "运行成功！已就绪。" },
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep >= statusSteps.length) {
        clearInterval(interval);
        
        // 实时向后端发送请求，在数据库中写入真实的使用和任务记录 (闭环流程)
        fetch("/api/studio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userState.userInfo?.id}`
          },
          body: JSON.stringify({
            action: "use",
            componentId,
            workspaceId: workspaces.find(w => w.name === workspaceName)?.id || "personal"
          })
        }).then(() => {
          fetchQuota(); // 实时从数据库刷新剩余Token及配额信息
          fetchRecentComponents(); // 刷新最近使用的组件列表
        }).catch(err => {
          console.error("Failed to register component usage in DB:", err);
        });

        if (!userState.isLoggedIn) {
          setRecentComponents((prev) => {
            const filtered = prev.filter((id) => id !== componentId);
            return [componentId, ...filtered].slice(0, 10);
          });
        }
        toast.success(`🎉 ${comp.name} 运行成功！已保存至最近使用并录入系统数据库`);
        setTimeout(() => {
          setRunningTask(null);
        }, 2000);
      } else {
        const step = statusSteps[currentStep];
        setRunningTask((prev) =>
          prev
             ? {
                 ...prev,
                 progress: step.progress,
                 statusText: step.text,
               }
             : null
        );
        currentStep++;
      }
    }, 800);
  };

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

  const [quotaData, setQuotaData] = useState<{
    membershipLevel: string;
    quotas: {
      enterpriseSlots: { total: number; used: number; available: number };
      maxTeamSize: number;
      maxStorage: number;
      maxApiCalls: number;
      tokenBalance: { total: number; used: number; available: number };
    };
    workspaces?: Array<{
      id: string;
      name: string;
      type: "PERSONAL" | "ENTERPRISE";
      role?: string;
      quota?: {
        usedSlots: number;
      } | null;
    }>;
  } | null>(null);

  const fetchQuota = async () => {
    if (!userState.isLoggedIn || !userState.userInfo?.id) {
      setQuotaData(null);
      return;
    }
    try {
      const res = await fetch("/api/user/workspace-hub/quota", {
        headers: {
          Authorization: `Bearer ${userState.userInfo.id}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setQuotaData(json.data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch quota data:", error);
    }
  };

  const fetchRecentComponents = async () => {
    if (!userState.isLoggedIn || !userState.userInfo?.id) return;
    try {
      const res = await fetch("/api/studio?action=recent", {
        headers: {
          Authorization: `Bearer ${userState.userInfo.id}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRecentComponents(Array.from(new Set(data.data)));
        }
      }
    } catch (e) {
      console.error("Failed to fetch recent components:", e);
    }
  };

  useEffect(() => {
    fetchQuota();
    fetchRecentComponents();
  }, [userState.isLoggedIn, userState.userInfo?.id]);

  // 收藏和最近使用功能
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentComponents, setRecentComponents] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [activeQuickTab, setActiveQuickTab] = useState<"recent" | "favorites">(
    "recent",
  );
  const [favoriteToast, setFavoriteToast] = useState<{
    message: string;
  } | null>(null);

  // 筛选和排序功能
  type SortType = "default" | "hot" | "successRate" | "newest";
  const [sortBy, setSortBy] = useState<SortType>("default");
  const [stageFilters, setStageFilters] = useState<Record<string, "all" | "hot" | "free" | "vip">>({});
  const [stageSorts, setStageSorts] = useState<Record<string, "default" | "success" | "new">>({});

  const getFreeCountInCat = (cat: ComponentCategory) => {
    return componentsByCategory[cat]?.filter(c => FREE_COMPONENTS.includes(c.id)).length || 0;
  };

  const [selectedFavorites, setSelectedFavorites] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // 模拟组件统计数据（实际项目中应从API获取）
  const getComponentStats = (componentId: string) => {
    const hash = componentId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
      calls30Days: Math.floor((hash * 1234) % 5000) + 100,
      calls180Days: Math.floor((hash * 5678) % 20000) + 500,
      successRate: 85 + (hash % 15),
      isNew: hash % 10 === 0,
    };
  };

  // 获取今日总调用数
  const getTodayCalls = () => {
    return COMPONENTS.reduce((sum, comp) => {
      const hash = comp.id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
      return sum + Math.floor((hash * 123) % 100);
    }, 0);
  };

  // 批量收藏操作
  const handleBulkFavorite = () => {
    setFavorites((prev) => [...new Set([...prev, ...selectedFavorites])]);
    setSelectedFavorites([]);
    setShowBulkActions(false);
    toast.success(`已添加 ${selectedFavorites.length} 个组件到收藏`);
  };

  const handleBulkUnfavorite = () => {
    setFavorites((prev) =>
      prev.filter((id) => !selectedFavorites.includes(id)),
    );
    setSelectedFavorites([]);
    setShowBulkActions(false);
    toast.info(`已取消收藏 ${selectedFavorites.length} 个组件`);
  };

  const toggleSelectFavorite = (componentId: string) => {
    setSelectedFavorites((prev) =>
      prev.includes(componentId)
        ? prev.filter((id) => id !== componentId)
        : [...prev, componentId],
    );
  };

  // 热门搜索
  const hotSearches = [
    "PRD 文档",
    "ER 图",
    "代码 Diff",
    "标书解析",
    "SQL 优化",
    "CSS 净化",
    "API 测试",
  ];


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

  // URL 参数解析：自动打开分享的组件与全局搜索
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
    const searchParam = searchParams.get("search");
    if (searchParam) {
      setSearchQuery(searchParam);
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

  // 加载用户偏好
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedViewMode = localStorage.getItem("capabilities_view_mode");
    const savedSearchHistory = localStorage.getItem(
      "capabilities_search_history",
    );

    if (savedViewMode) {
      setViewMode(savedViewMode as "grid" | "list");
    }
    if (savedSearchHistory) {
      try {
        setSearchHistory(JSON.parse(savedSearchHistory));
      } catch (e) {
        console.error("加载搜索历史失败", e);
      }
    }
  }, []);

  // 动态从数据库加载用户的收藏和最近使用的组件数据
  useEffect(() => {
    const fetchDbPreferences = async () => {
      if (!userState.isLoggedIn || !userState.userInfo?.id) {
        // 游客模式加载本地备用缓存
        const savedFavorites = localStorage.getItem("capabilities_favorites");
        const savedRecent = localStorage.getItem("capabilities_recent");
        if (savedFavorites) {
          try { setFavorites(JSON.parse(savedFavorites)); } catch (e) {}
        }
        if (savedRecent) {
          try { setRecentComponents(JSON.parse(savedRecent)); } catch (e) {}
        }
        return;
      }
      try {
        const headers = {
          Authorization: `Bearer ${userState.userInfo.id}`,
        };
        const favRes = await fetch("/api/studio?action=favorites", { headers });
        if (favRes.ok) {
          const data = await favRes.json();
          if (data.success) {
            setFavorites(data.data);
          }
        }
        const recRes = await fetch("/api/studio?action=recent", { headers });
        if (recRes.ok) {
          const data = await recRes.json();
          if (data.success) {
            setRecentComponents(Array.from(new Set(data.data)));
          }
        }
      } catch (error) {
        console.error("加载收藏和最近使用失败", error);
      }
    };
    fetchDbPreferences();
  }, [userState.isLoggedIn, userState.userInfo?.id]);

  // 保存用户偏好
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userState.isLoggedIn) {
      localStorage.setItem("capabilities_favorites", JSON.stringify(favorites));
      localStorage.setItem("capabilities_recent", JSON.stringify(recentComponents));
    }
    localStorage.setItem("capabilities_view_mode", viewMode);
    localStorage.setItem(
      "capabilities_search_history",
      JSON.stringify(searchHistory),
    );
  }, [favorites, recentComponents, viewMode, searchHistory]);

  // 处理收藏提示（避免 React 18 严格模式导致重复调用）
  useEffect(() => {
    if (favoriteToast) {
      if (favoriteToast.message === "已添加到收藏") {
        toast.success(favoriteToast.message);
      } else {
        toast.info(favoriteToast.message);
      }
      setFavoriteToast(null);
    }
  }, [favoriteToast, toast]);

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

    if (activeCategory === "FAVORITES") {
      filtered = COMPONENTS.filter((comp) => favorites.includes(comp.id));
    } else if (activeCategory === "RECENT") {
      filtered = recentComponents
        .map((id) => COMPONENTS.find((comp) => comp.id === id))
        .filter((comp) => comp !== undefined) as typeof COMPONENTS;
    } else if (activeCategory === "FREE_TRIAL") {
      filtered = COMPONENTS.filter((comp) => FREE_COMPONENTS.includes(comp.id));
    } else if (activeCategory !== "ALL") {
      filtered = filtered.filter((comp) => comp.category === (activeCategory as any));
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

    // 应用排序
    if (sortBy === "hot") {
      filtered = [...filtered].sort((a, b) => {
        const statsA = getComponentStats(a.id);
        const statsB = getComponentStats(b.id);
        return statsB.calls30Days - statsA.calls30Days;
      });
    } else if (sortBy === "successRate") {
      filtered = [...filtered].sort((a, b) => {
        const statsA = getComponentStats(a.id);
        const statsB = getComponentStats(b.id);
        return statsB.successRate - statsA.successRate;
      });
    } else if (sortBy === "newest") {
      filtered = [...filtered].sort((a, b) => {
        const statsA = getComponentStats(a.id);
        const statsB = getComponentStats(b.id);
        return statsB.isNew === statsA.isNew ? 0 : statsB.isNew ? 1 : -1;
      });
    }

    return filtered;
  }, [activeCategory, searchQuery, favorites, recentComponents, sortBy]);

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
    if (quotaData) return quotaData.membershipLevel;
    return userState.userInfo?.membershipLevel || "FREE";
  };

  const isVipUser = (): boolean => {
    const tier = getUserMembershipTier();
    return !["GUEST", "FREE"].includes(tier);
  };

  const isAccessible = (componentId: string): boolean => {
    return isVipUser() || FREE_COMPONENTS.includes(componentId);
  };

  const getAccessibleCount = (): number => {
    if (isVipUser()) return COMPONENTS.length;
    return FREE_COMPONENTS.length;
  };

  const getEnterpriseSpaceLimit = (): number => {
    if (quotaData) return quotaData.quotas.enterpriseSlots.total;
    if (!isVipUser()) return 0;
    return 5;
  };

  const getTokenBalance = (): { used: number; total: number } => {
    if (quotaData) {
      return {
        used: quotaData.quotas.tokenBalance.used,
        total: quotaData.quotas.tokenBalance.total,
      };
    }
    return { used: 0, total: 10000 };
  };

  const getWorkspaces = (): {
    id: string;
    name: string;
    type: "personal" | "enterprise";
    hasComponentPermission?: boolean;
  }[] => {
    const defaultList: {
      id: string;
      name: string;
      type: "personal" | "enterprise";
      hasComponentPermission?: boolean;
    }[] = [{ id: "personal", name: "个人专属沙盒", type: "personal" }];
    
    if (quotaData && quotaData.workspaces) {
      return quotaData.workspaces.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        type: ws.type === "PERSONAL" ? "personal" : "enterprise",
        hasComponentPermission: ws.role === "OWNER" || ws.role === "ADMIN",
        componentCount: ws.quota?.usedSlots || 0
      }));
    }

    if (workspaces && workspaces.length > 0) {
      return workspaces;
    }

    return defaultList;
  };

  const membershipTier = getUserMembershipTier();
  const membershipInfo =
    MEMBERSHIP_LEVELS.find((m) => m.id === membershipTier) ||
    MEMBERSHIP_LEVELS[0];

  const handleComponentClick = (componentId: string) => {
    const component = getComponentById(componentId);
    if (!component) return;

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

  // 切换收藏
  const toggleFavorite = (componentId: string) => {
    if (!userState.isLoggedIn) {
      router.push(`/auth/login?redirect=${encodeURIComponent(`/capabilities?preview=${componentId}`)}`);
      return;
    }
    setFavorites((prev) => {
      if (prev.includes(componentId)) {
        setFavoriteToast({ message: "已取消收藏" });
        return prev.filter((id) => id !== componentId);
      } else {
        setFavoriteToast({ message: "已添加到收藏" });
        return [...prev, componentId];
      }
    });
  };

  // 清空最近使用记录
  const clearRecentComponents = () => {
    setRecentComponents([]);
    setActiveQuickTab("favorites");
  };

  // 清空收藏
  const clearFavorites = () => {
    setFavorites([]);
    setActiveQuickTab("recent");
  };

  // 从最近使用中移除单个记录
  const removeFromRecent = async (componentId: string) => {
    setRecentComponents((prev) => prev.filter((id) => id !== componentId));
    try {
      const userId = localStorage.getItem("userId");
      await fetch(`/api/studio?action=remove-recent&componentId=${componentId}`, {
        method: "DELETE",
        headers: userId ? { Authorization: `Bearer ${userId}` } : {},
      });
    } catch (err) {
      console.error("Failed to delete recent component:", err);
    }
  };

  // 处理搜索
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() && !searchHistory.includes(query.trim())) {
      const newHistory = [query.trim(), ...searchHistory].slice(0, 10);
      setSearchHistory(newHistory);
    }
  };

  // 清除搜索历史
  const clearSearchHistory = () => {
    setSearchHistory([]);
  };

  // 删除单个搜索历史
  const removeSearchHistory = (term: string) => {
    setSearchHistory((prev) => prev.filter((item) => item !== term));
  };

  const handleLoginClick = () => {
    router.push(`/auth/login?redirect=${encodeURIComponent(`/capabilities?preview=${selectedComponent}`)}`);
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

  const toggleCategory = (category: ComponentCategory | "FAVORITES" | "RECENT" | "FREE_TRIAL") => {
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
    <div 
      className="min-h-screen" 
      style={{ 
        backgroundColor: BG_PAGE,
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.15) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px"
      }}
    >

      {selectedComponent &&
        (() => {
          const comp = getComponentById(selectedComponent);
          if (!comp) return null;
          const Icon = getIcon(comp.icon);
          const isLocked = !userState.isLoggedIn;

          const handleShare = () => {
            if (!userState.isLoggedIn) {
              router.push(`/auth/login?redirect=${encodeURIComponent(`/capabilities?preview=${comp.id}`)}`);
              return;
            }
            const userId = localStorage.getItem("userId") || userState.userInfo?.id || "";
            const shareUrl = `${window.location.origin}/capabilities?preview=${comp.id}${userId ? `&ref=${userId}` : ""}`;
            navigator.clipboard.writeText(shareUrl);
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
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-1 rounded" style={{ backgroundColor: PRIMARY_LIGHT, color: PRIMARY_COLOR }}>
                      {comp.id}
                    </span>
                    <span className="text-xs font-medium text-slate-500">组件详情</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleShare}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#2b6cb0] transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-50 border border-slate-100"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      分享给同事
                    </button>
                    <button
                      onClick={() => {
                        setSelectedComponent(null);
                        setHighlightedMembership(null);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors border border-slate-100"
                    >
                      <X className="w-4 h-4" style={{ color: TEXT_SUB }} />
                    </button>
                  </div>
                </div>

                {!userState.isLoggedIn ? (
                  <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-bold mb-1">游客预览模式</p>
                      <p className="leading-relaxed">当前仅展示输入输出预览。请登录或申请演示后使用完整工作空间运行此组件。</p>
                    </div>
                  </div>
                ) : (!FREE_COMPONENTS.includes(comp.id) && !isVipUser()) ? (
                  <div className="mb-6 p-4 rounded-xl border border-orange-200 bg-orange-50 text-orange-850 text-xs font-semibold flex items-start gap-2">
                    <Crown className="w-4 h-4 shrink-0 text-orange-600 mt-0.5" />
                    <div>
                      <p className="font-bold mb-1">VIP 会员专属组件</p>
                      <p className="leading-relaxed">此组件为高级会员专享能力，您当前为普通账户。请升级为 VIP 会员后部署运行。</p>
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 p-4 rounded-xl border border-green-200 bg-green-50 text-green-800 text-xs font-semibold flex items-start gap-2 animate-pulse">
                    <CheckCircle className="w-4 h-4 shrink-0 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-bold mb-1">已检测到登录状态</p>
                      <p className="leading-relaxed">
                        检测到您已登录，可直接在工作空间中使用此组件。点击下方“直接在工坊使用”一键直达物理运行中心。
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-5 mb-8">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: PRIMARY_LIGHT }}
                  >
                    <Icon className="w-8 h-8" style={{ color: PRIMARY_DARK }} />
                  </div>
                  <div className="flex-1">
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
                                  onClick={() => setShowDemoModal(true)}
                                  className="px-6 py-2.5 bg-[#2b6cb0] text-white text-sm font-semibold rounded-lg hover:bg-[#2c5282] transition-colors"
                                >
                                  🚀 申请免费演示/试用此组件
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
                                  onClick={() => handleRunInStudio(comp.id)}
                                  className="px-6 py-2.5 bg-[#10b981] text-white text-sm font-semibold rounded-lg hover:bg-[#059669] transition-colors flex items-center gap-2"
                                >
                                  <Play className="w-4 h-4" />
                                  直接在工坊使用
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
                      onClick={() => setShowDemoModal(true)}
                      className="w-full h-12 rounded-xl font-semibold transition-all cursor-pointer"
                      style={{
                        backgroundColor: PRIMARY_DARK,
                        color: "white",
                        boxShadow: "0 4px 12px rgba(43, 108, 176, 0.2)",
                        minHeight: "48px",
                      }}
                    >
                      申请免费演示/试用
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
                      onClick={() => handleRunInStudio(selectedComponent || "")}
                      className="w-full h-12 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        backgroundColor: "#10b981",
                        color: "white",
                        boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
                        minHeight: "48px",
                      }}
                    >
                      <Play className="w-4 h-4" />
                      直接在工坊使用
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
                  startWorkspaceTask(selectedComponentForRun || "", ws.name);
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

      <section className="relative pt-6 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-3"
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
              className="text-4xl md:text-5xl font-black mb-2"
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
              const personalCount = workspaces.filter((w) => w.type === "personal").length;
              const enterpriseCount = workspaces.filter((w) => w.type === "enterprise").length;
              return (
                <div
                  className="bg-white rounded-2xl p-6 mb-8 shadow-sm border"
                  style={{ borderColor: BORDER_COLOR }}
                >
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      {userState.userInfo?.avatar ? (
                        <img
                          src={userState.userInfo.avatar}
                          alt={userState.userInfo.name || "用户头像"}
                          className="w-14 h-14 rounded-full object-cover border border-slate-200 shadow-sm shrink-0"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-inner"
                          style={{ backgroundColor: PRIMARY_DARK }}
                        >
                          {(userState.userInfo?.name || "用").charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className="font-bold text-lg text-slate-800"
                          >
                            {userState.userInfo?.name || "用户"}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${isVipUser() ? "text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-sm" : "text-slate-600 bg-slate-100 border border-slate-200"}`}
                          >
                            {membershipInfo.displayName}
                          </span>
                        </div>
                        <div className="text-xs space-y-1" style={{ color: TEXT_SUB }}>
                          <div>
                            <span className="font-bold text-slate-600">当前可用组件：</span>
                            <span className="text-[#2b6cb0] font-black">{getAccessibleCount()}</span> / {COMPONENTS.length}
                          </div>
                          <div className="flex flex-wrap gap-x-4">
                            <span>个人空间: <span className="text-slate-800 font-bold">{personalCount}</span> / 1 个</span>
                            <span>企业空间: <span className="text-slate-800 font-bold">{enterpriseCount}</span> / {getEnterpriseSpaceLimit()} 个</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="w-full md:w-64 text-right flex flex-col items-end gap-1">
                      <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                        ⚡ 算力 Token 剩余
                      </div>
                      <div
                        className="text-xl font-black text-slate-800"
                      >
                        {(tokenBalance.total - tokenBalance.used).toLocaleString()} <span className="text-xs text-slate-400 font-medium">/ {tokenBalance.total.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/50 mt-1">
                        <div 
                          className="bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] h-full rounded-full transition-all duration-500" 
                          style={{ width: `${Math.min(100, Math.max(0, ((tokenBalance.total - tokenBalance.used) / tokenBalance.total) * 100))}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold mt-0.5">已消耗 {tokenBalance.used.toLocaleString()} 点 (运行组件即扣减)</span>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* 会员权限对比卡片 */}
          {userState.isLoggedIn && (
            <div className="grid md:grid-cols-2 gap-6 mb-12">
              {/* 免费体验组件 */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50/60 to-teal-50/30 border border-emerald-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 text-xs font-black flex items-center gap-1">
                      ⚡ 免费可用组件
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold">已登录专属福利</span>
                  </div>
                  <h3 className="text-base font-black text-slate-800 mb-2">
                    社区版核心免费体验
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium mb-4">
                    您当前可以免费使用以下 3 个核心组件，用于快速调研及工作流推演：
                  </p>
                  <div className="space-y-2.5">
                    {[
                      { name: "C01 标书智能解析", desc: "自动拆解资质与响应偏离条款" },
                      { name: "C07 需求转 PRD", desc: "会议纪要/对话快速生成需求规范" },
                      { name: "C46 多模型路由网关", desc: "统一调度本地及云端模型流量" }
                    ].map((c) => (
                      <div key={c.name} className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0">✓</span>
                        <span>{c.name} <span className="text-slate-400 font-medium">({c.desc})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 pt-3 border-t border-emerald-100 text-[10px] text-emerald-600 font-bold">
                  支持在个人沙箱工作空间直接运行
                </div>
              </div>

              {/* VIP 锁定组件 */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50/60 to-indigo-50/30 border border-blue-200/80 shadow-sm relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-[#2b6cb0]/10 text-[#2b6cb0] text-xs font-black flex items-center gap-1">
                      👑 升级解锁更多
                    </span>
                    <span className="text-[10px] text-indigo-500 font-black">待解锁 {COMPONENTS.length - getAccessibleCount()} 个组件</span>
                  </div>
                  <h3 className="text-base font-black text-slate-800 mb-2">
                    解锁 50+ 高级岗位增效组件
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium mb-4">
                     成为 VIP 订阅会员，立享微服务设计、慢 SQL 优化、日志根因分析等企业级效能套件：
                  </p>
                  <div className="space-y-2.5">
                    {[
                      { name: "C16 数据库逆向解析", desc: "一键反向生成数据字典与ER图" },
                      { name: "C17 慢 SQL 智能优化", desc: "自动分析执行计划并提供索引建议" },
                      { name: "C33 报错日志根因分析", desc: "聚合日志堆栈秒级定位软件故障" }
                    ].map((c) => (
                      <div key={c.name} className="flex items-center gap-2 text-xs font-bold text-slate-500">
                        <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-[10px] shrink-0">🔒</span>
                        <span>{c.name} <span className="text-slate-400 font-medium">({c.desc})</span></span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between gap-4 pt-3 border-t border-blue-100">
                  <span className="text-[10px] text-[#2b6cb0] font-bold">
                    解锁团队协同与多企业空间配额
                  </span>
                  <button 
                    onClick={() => router.push("/pricing")}
                    className="px-3 py-1 bg-[#2b6cb0] hover:bg-[#2c5282] text-white text-[10px] font-black rounded transition-all cursor-pointer shadow-sm shadow-blue-500/10 flex items-center gap-0.5"
                  >
                    立即升级解锁 <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {!userState.isLoggedIn ? (
            <div className="grid md:grid-cols-4 gap-4 mb-8">
              <div
                className="bg-white rounded-xl p-6 shadow-sm border"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
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
                </div>
                <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                  {COMPONENTS.length}
                </div>
                <div className="text-xs mt-2" style={{ color: TEXT_MUTED }}>
                  全生命周期覆盖
                </div>
              </div>

              <div
                className="bg-white rounded-xl p-6 shadow-sm border"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "#ecfdf5" }}
                    >
                      <CheckCircle className="w-5 h-5" style={{ color: "#10b981" }} />
                    </div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_SUB }}
                    >
                      免费体验组件
                    </span>
                  </div>
                </div>
                <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                  {FREE_COMPONENTS.length}
                </div>
                <div className="text-xs mt-2 font-semibold" style={{ color: "#10b981" }}>
                  登录后可免费试用
                </div>
                <div className="text-[10px] mt-0.5 text-slate-500 font-medium">
                  包含: 标书解析、需求转PRD、API生成
                </div>
              </div>

              <div
                className="bg-white rounded-xl p-6 shadow-sm border"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "#fef3c7" }}
                    >
                      <Zap className="w-5 h-5" style={{ color: "#f59e0b" }} />
                    </div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_SUB }}
                    >
                      注册即送 Token
                    </span>
                  </div>
                </div>
                <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                  1,000
                </div>
                <div className="text-xs mt-2" style={{ color: TEXT_MUTED }}>
                  新用户注册即送
                </div>
              </div>

              <div
                className="bg-white rounded-xl p-6 shadow-sm border"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
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
                      覆盖生命周期
                    </span>
                  </div>
                </div>
                <div className="text-3xl font-black" style={{ color: TEXT_MAIN }}>
                  {categories.length}
                </div>
                <div className="text-xs mt-2" style={{ color: TEXT_MUTED }}>
                  软件工程全生命周期
                </div>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-4 gap-4 mb-8">
              <div
                className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-md transition-shadow"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
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
                </div>
                <div className="text-3xl font-black mb-2" style={{ color: TEXT_MAIN }}>
                  {COMPONENTS.length}
                </div>
                <div className="text-[10px] leading-normal font-medium" style={{ color: TEXT_MUTED }}>
                  覆盖软件工程全生命周期10大阶段，包含商机捕获、架构设计、大前端、质量保障等全部效能工具。
                </div>
              </div>

              <div
                className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-md transition-shadow"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "#fef3c7" }}
                    >
                      <Star className="w-5 h-5" style={{ color: "#f59e0b" }} />
                    </div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_SUB }}
                    >
                      我的收藏
                    </span>
                  </div>
                </div>
                <div className="text-3xl font-black mb-2" style={{ color: TEXT_MAIN }}>
                  {favorites.length}
                </div>
                <div className="text-[10px] leading-normal font-medium" style={{ color: TEXT_MUTED }}>
                  您收藏的常用高频效能组件，方便在工作台中快速启动并一键配置到专属的沙盒空间。
                </div>
              </div>

              <div
                className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-md transition-shadow"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: "#ecfdf5" }}
                    >
                      <Clock className="w-5 h-5" style={{ color: "#10b981" }} />
                    </div>
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_SUB }}
                    >
                      最近使用
                    </span>
                  </div>
                </div>
                <div className="text-3xl font-black mb-2" style={{ color: TEXT_MAIN }}>
                  {recentComponents.length}
                </div>
                <div className="text-[10px] leading-normal font-medium" style={{ color: TEXT_MUTED }}>
                  您最近运行调试的组件记录，保留最近 6 次操作上下文，便于快速追溯与跨空间资产流转。
                </div>
              </div>

              <div
                className="bg-white rounded-xl p-6 shadow-sm border hover:shadow-md transition-shadow"
                style={{ borderColor: BORDER_COLOR }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
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
                </div>
                <div className="text-3xl font-black mb-2" style={{ color: TEXT_MAIN }}>
                  {categories.length}
                </div>
                <div className="text-[10px] leading-normal font-medium" style={{ color: TEXT_MUTED }}>
                  包含标书售前、需求设计、后端大前端、DevOps运维等核心工程环节，全面打通研发生态数据流。
                </div>
              </div>
            </div>
          )}

          {/* Glassmorphic Access Matrix & CTA Banner */}
          {!isVipUser() && (
            <div 
              className="mb-8 rounded-[20px] p-6 md:p-8 relative overflow-hidden border transition-all duration-300 hover:shadow-xl"
              style={{
                background: "rgba(255, 255, 255, 0.55)",
                backdropFilter: "blur(24px)",
                borderColor: "rgba(255, 255, 255, 0.7)",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.03)"
              }}
            >
              {/* Blur blobs */}
              <div className="absolute -top-12 -left-12 w-36 h-36 bg-blue-300/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-12 -right-12 w-36 h-36 bg-purple-300/10 rounded-full blur-2xl pointer-events-none" />
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
                {/* Left and Middle cols: Access Matrix */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2b6cb0] bg-blue-50/80 px-2.5 py-1 rounded-full border border-blue-100">
                      使用权限与功能指南
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800">
                    知阁·舟坊平台功能权限及尊享服务
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    {/* Guest Tier */}
                    <div 
                      className="p-5 rounded-[20px] bg-white/40 border border-slate-200/50 shadow-sm backdrop-blur-md flex flex-col justify-between"
                      style={{ transition: "all 0.3s ease" }}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                            👤 游客模式
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold">免登录</span>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 text-xs text-slate-700 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span>查看全站 53 个组件详情与 ROI 分析</span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-700 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span>完整观看高保真沙盘推演动画</span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-400 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">🔒</span>
                            <span>暂无法运行或添加收藏 (需登录)</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 pt-3 border-t border-slate-200/40 text-[10px] text-slate-400">
                        适合功能调研及方案预览
                      </div>
                    </div>

                    {/* Free Tier */}
                    <div 
                      className="p-5 rounded-[20px] bg-emerald-50/20 border border-emerald-100/50 shadow-sm backdrop-blur-md flex flex-col justify-between"
                      style={{ transition: "all 0.3s ease" }}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1">
                            ⚡ 普通开发者
                          </span>
                          <span className="text-[10px] text-emerald-600 font-bold font-mono">免费</span>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 text-xs text-slate-700 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span><b>免费运行 3 大核心体验组件</b></span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-700 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span>获取 1,000 点初始运行 Token</span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-400 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">🔒</span>
                            <span>其余 50 个高级效能组件锁定</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 pt-3 border-t border-emerald-200/20 text-[10px] text-emerald-600 font-medium">
                        可试用: C01/C07/C46
                      </div>
                    </div>

                    {/* VIP Tier */}
                    <div 
                      className="p-5 rounded-[20px] bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/50 border border-blue-100/60 shadow-sm backdrop-blur-md flex flex-col justify-between relative overflow-hidden"
                      style={{ transition: "all 0.3s ease" }}
                    >
                      <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
                      <div>
                        <div className="flex items-center justify-between mb-4 font-bold">
                          <span className="text-xs px-2.5 py-1 rounded-full bg-[#2b6cb0] text-white flex items-center gap-1">
                            👑 VIP 订阅会员
                          </span>
                          <span className="text-[10px] text-[#2b6cb0] font-bold">全解锁</span>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-start gap-2 text-xs text-slate-800 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span><b>解锁全部 53 个高效研发组件</b></span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-800 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span>高额 Token 及个人独立专属沙盒</span>
                          </div>
                          <div className="flex items-start gap-2 text-xs text-slate-800 leading-normal">
                            <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">✓</span>
                            <span>多人企业团队空间与细粒度权限</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 pt-3 border-t border-blue-200/40 text-[10px] text-[#2b6cb0] font-semibold">
                        个人与企业多人研发提效
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Right col: CTA action */}
                <div className="flex flex-col justify-center items-center lg:items-start lg:pl-6 lg:border-l border-slate-200/60">
                  <p className="text-xs text-slate-500 mb-4 text-center lg:text-left leading-relaxed font-semibold">
                    {!userState.isLoggedIn 
                      ? "您当前为游客模式。建议登录并配置您的工作空间以试用核心效能组件。" 
                      : isVipUser()
                      ? "您已开通尊享会员！全站 53 个高级研发组件均已解锁，请尽情体验您的效能操作系统。"
                      : "您当前为免费体验账户，仅限运行 3 个核心组件。建议升级至 VIP 会员解锁全部 53 个效能工具。"}
                  </p>
                  
                  {!userState.isLoggedIn ? (
                    <div className="w-full flex flex-col gap-2">
                      <button
                        onClick={() => router.push("/auth/login?redirect=/capabilities")}
                        className="w-full py-2.5 bg-[#2b6cb0] hover:bg-[#2c5282] text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-blue-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        立即登录体验免费组件
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : isVipUser() ? (
                    <div className="w-full flex flex-col gap-2">
                      <button
                        onClick={() => router.push("/studio")}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        进入组件开发工作室
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full flex flex-col gap-2">
                      <button
                        onClick={() => router.push("/pricing")}
                        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-blue-500/10 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        升级 VIP 解锁 50 个高级效能组件
                        <Crown className="w-4 h-4 text-yellow-300" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {userState.isLoggedIn && (recentComponents.length > 0 || favorites.length > 0) && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                  style={{
                    background:
                      "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  }}
                >
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-black" style={{ color: TEXT_MAIN }}>
                  快速访问
                </h3>

                <div
                  className="flex gap-2 ml-4 px-2 py-1 rounded-lg"
                  style={{ backgroundColor: "#f1f5f9" }}
                >
                  <button
                    onClick={() => setActiveQuickTab("recent")}
                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${
                      activeQuickTab === "recent"
                        ? "bg-[#10b981] text-white shadow-md"
                        : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    最近使用 ({recentComponents.length})
                  </button>
                  <button
                    onClick={() => setActiveQuickTab("favorites")}
                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${
                      activeQuickTab === "favorites"
                        ? "bg-[#f59e0b] text-white shadow-md"
                        : "text-slate-600 hover:bg-white/60"
                    }`}
                  >
                    我的收藏 ({favorites.length})
                  </button>
                </div>

                {activeQuickTab === "recent" && recentComponents.length > 0 && (
                  <button
                    onClick={clearRecentComponents}
                    className="ml-auto text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    清空记录
                  </button>
                )}
                {activeQuickTab === "favorites" && favorites.length > 0 && (
                  <button
                    onClick={clearFavorites}
                    className="ml-auto text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all"
                  >
                    <Star className="w-3.5 h-3.5" />
                    清空收藏
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeQuickTab === "recent"
                  ? recentComponents.slice(0, 6).map((componentId) => {
                      const component = getComponentById(componentId);
                      if (!component) return null;
                      const Icon = getIcon(component.icon);
                      const isFavorited = favorites.includes(componentId);

                      return (
                        <div
                          key={componentId}
                          className="group relative overflow-visible bg-white rounded-xl border-2 p-5 hover:-translate-y-1 transition-all duration-300 cursor-pointer text-left"
                          style={{
                            borderColor: "#10b98120",
                            backgroundColor: "rgba(255,255,255,0.8)",
                          }}
                          onClick={() => handleComponentClick(componentId)}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromRecent(componentId);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white border-2 flex items-center justify-center hover:scale-110 hover:border-red-400 transition-all z-20 opacity-0 group-hover:opacity-100"
                            title="删除此记录"
                          >
                            <X className="w-4 h-4 text-slate-400 hover:text-red-500" />
                          </button>

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
                              </div>
                              <h4
                                className="font-semibold text-sm truncate"
                                style={{ color: TEXT_MAIN }}
                              >
                                {component.name}
                              </h4>
                              <p
                                className="text-xs truncate mt-0.5"
                                style={{ color: TEXT_SUB }}
                              >
                                {component.description}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(componentId);
                            }}
                            className="absolute bottom-2 right-2 p-1.5 rounded-full transition-colors hover:bg-slate-100"
                          >
                            <Heart
                              className={`w-4 h-4 ${isFavorited ? "fill-yellow-400 text-yellow-500" : "text-slate-400"}`}
                            />
                          </button>
                        </div>
                      );
                    })
                  : favorites.slice(0, 6).map((componentId) => {
                      const component = getComponentById(componentId);
                      if (!component) return null;
                      const Icon = getIcon(component.icon);

                      return (
                        <div
                          key={componentId}
                          className="group relative overflow-visible bg-white rounded-xl border-2 p-5 hover:-translate-y-1 transition-all duration-300 cursor-pointer text-left"
                          style={{
                            borderColor: "#f59e0b20",
                            backgroundColor: "rgba(255,255,255,0.8)",
                          }}
                          onClick={() => handleComponentClick(componentId)}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: "#fef3c7" }}
                            >
                              <Icon
                                className="w-5 h-5"
                                style={{ color: "#f59e0b" }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: "#fef3c7",
                                    color: "#f59e0b",
                                  }}
                                >
                                  {component.id}
                                </span>
                              </div>
                              <h4
                                className="font-semibold text-sm truncate"
                                style={{ color: TEXT_MAIN }}
                              >
                                {component.name}
                              </h4>
                              <p
                                className="text-xs truncate mt-0.5"
                                style={{ color: TEXT_SUB }}
                              >
                                {component.description}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(componentId);
                            }}
                            className="absolute bottom-2 right-2 p-1.5 rounded-full transition-colors hover:bg-slate-100"
                          >
                            <Heart className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                          </button>
                        </div>
                      );
                    })}
              </div>
            </div>
          )}

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
                    <BookOpen className="w-4 h-4" style={{ color: PRIMARY_DARK }} />
                    <span
                      className="text-sm font-medium"
                      style={{ color: TEXT_MAIN }}
                    >
                      C46 API 文档生成
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

                <button
                  onClick={() => setActiveCategory("FREE_TRIAL")}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-1 flex items-center gap-2`}
                  style={{
                    backgroundColor:
                      activeCategory === "FREE_TRIAL" ? PRIMARY_LIGHT : "transparent",
                    color: activeCategory === "FREE_TRIAL" ? PRIMARY_DARK : TEXT_SUB,
                    fontWeight: activeCategory === "FREE_TRIAL" ? "bold" : "500",
                  }}
                >
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  免费试用 ({FREE_COMPONENTS.length})
                </button>

                {userState.isLoggedIn && (
                  <>
                    <button
                      onClick={() => setActiveCategory("FAVORITES")}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-1 flex items-center gap-2`}
                      style={{
                        backgroundColor:
                          activeCategory === "FAVORITES"
                            ? PRIMARY_LIGHT
                            : "transparent",
                        color:
                          activeCategory === "FAVORITES" ? PRIMARY_DARK : TEXT_SUB,
                        fontWeight: activeCategory === "FAVORITES" ? "bold" : "500",
                      }}
                    >
                      <Star className="w-4 h-4" />
                      我的收藏 ({favorites.length})
                    </button>

                    <button
                      onClick={() => setActiveCategory("RECENT")}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all mb-1 flex items-center gap-2`}
                      style={{
                        backgroundColor:
                          activeCategory === "RECENT"
                            ? PRIMARY_LIGHT
                            : "transparent",
                        color:
                          activeCategory === "RECENT" ? PRIMARY_DARK : TEXT_SUB,
                        fontWeight: activeCategory === "RECENT" ? "bold" : "500",
                      }}
                    >
                      <Clock className="w-4 h-4" />
                      最近使用 ({recentComponents.length})
                    </button>
                  </>
                )}

                <div className="border-t border-slate-200 my-3" />

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
                    <span className="truncate flex items-center gap-1.5">
                      {getFreeCountInCat(category) > 0 && (
                        <span className="text-emerald-500 font-bold shrink-0">🎁</span>
                      )}
                      <span>{COMPONENT_CATEGORIES[category]?.name || category}</span>
                    </span>
                    <span
                      className="text-xs shrink-0 ml-1 flex items-center gap-1.5"
                      style={{ color: TEXT_MUTED }}
                    >
                      {getFreeCountInCat(category) > 0 && (
                        <span className="text-emerald-600 font-semibold bg-emerald-50 px-1 py-0.5 rounded text-[10px] flex items-center">
                          试用 {getFreeCountInCat(category)}
                        </span>
                      )}
                      <span>{componentsByCategory[category]?.length || 0}</span>
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
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5"
                      style={{ color: TEXT_MUTED }}
                    />
                    <input
                      type="text"
                      placeholder="搜索组件名称、描述或标签..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSearch(searchQuery);
                        }
                      }}
                      className="w-full h-12 pl-12 pr-4 rounded-xl border outline-none transition-all text-sm"
                      style={{
                        backgroundColor: "#f8fafc",
                        borderColor: BORDER_COLOR,
                        color: TEXT_MAIN,
                      }}
                      onFocus={(e) => {
                        setShowSearchHistory(true);
                        e.target.style.borderColor = PRIMARY_COLOR;
                        e.target.style.boxShadow = `0 0 0 3px rgba(43, 108, 176, 0.1)`;
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = BORDER_COLOR;
                        e.target.style.boxShadow = "none";
                        setTimeout(() => setShowSearchHistory(false), 200);
                      }}
                    />
                    {showSearchHistory && searchHistory.length > 0 && (
                      <div
                        className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border z-50"
                        style={{ borderColor: BORDER_COLOR }}
                      >
                        <div
                          className="p-3 border-b"
                          style={{ borderColor: BORDER_COLOR }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs font-medium"
                              style={{ color: TEXT_SUB }}
                            >
                              搜索历史
                            </span>
                            <button
                              onClick={clearSearchHistory}
                              className="text-xs hover:underline"
                              style={{ color: TEXT_MUTED }}
                            >
                              清空
                            </button>
                          </div>
                        </div>
                        <div className="p-2">
                          {searchHistory.slice(0, 5).map((term, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                              onClick={() => {
                                setSearchQuery(term);
                                handleSearch(term);
                                setShowSearchHistory(false);
                              }}
                            >
                              <span
                                className="text-sm"
                                style={{ color: TEXT_MAIN }}
                              >
                                {term}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSearchHistory(term);
                                }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                        {hotSearches.length > 0 && (
                          <div
                            className="p-3 border-t"
                            style={{ borderColor: BORDER_COLOR }}
                          >
                            <span
                              className="text-xs font-medium"
                              style={{ color: TEXT_SUB }}
                            >
                              热门搜索
                            </span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {hotSearches.map((term, index) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    setSearchQuery(term);
                                    handleSearch(term);
                                    setShowSearchHistory(false);
                                  }}
                                  className="px-3 py-1 text-xs rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                                  style={{ color: TEXT_MAIN }}
                                >
                                  {term}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs px-3 py-1.5 rounded-full bg-green-50 text-green-700 font-bold">
                      今日调用: {getTodayCalls()} 次
                    </div>
                    <div className="h-6 w-px bg-slate-200" />
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded-lg transition-colors ${viewMode === "grid" ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:bg-slate-100"}`}
                    >
                      <GridIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded-lg transition-colors ${viewMode === "list" ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:bg-slate-100"}`}
                    >
                      <List className="w-5 h-5" />
                    </button>
                  </div>
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
                  {((activeCategory === "ALL"
                    ? categories
                    : activeCategory === "FAVORITES" ||
                      activeCategory === "RECENT" ||
                      activeCategory === "FREE_TRIAL"
                      ? [activeCategory]
                      : [activeCategory]
                  ) as any[]).map((category) => {
                    const displayComponents =
                      category === "FAVORITES"
                        ? filteredComponents
                        : category === "RECENT"
                          ? filteredComponents
                          : category === "FREE_TRIAL"
                            ? filteredComponents
                            : componentsByCategory[
                                category as ComponentCategory
                              ] || [];

                    return (
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
                              {category === "FAVORITES"
                                ? "我的收藏"
                                : category === "RECENT"
                                  ? "最近使用"
                                  : category === "FREE_TRIAL"
                                    ? "免费试用"
                                    : COMPONENT_CATEGORIES[
                                        category as ComponentCategory
                                      ]?.name || category}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: "#f1f5f9",
                                color: TEXT_SUB,
                              }}
                            >
                              {displayComponents.length} 个
                            </span>
                            {category !== "FAVORITES" && category !== "RECENT" && category !== "FREE_TRIAL" &&
                             componentsByCategory[category as ComponentCategory]?.some(comp => FREE_COMPONENTS.includes(comp.id)) && (
                              <span 
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm animate-pulse"
                                style={{
                                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                                  border: "1px solid rgba(16, 185, 129, 0.25)",
                                  color: "#10b981",
                                }}
                              >
                                🎁 包含免费体验组件
                              </span>
                            )}
                            {category === "FAVORITES" &&
                              displayComponents.length > 0 && (
                                <div className="ml-auto flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowBulkActions(!showBulkActions);
                                      if (!showBulkActions) {
                                        setSelectedFavorites(
                                          displayComponents.map((c) => c.id),
                                        );
                                      } else {
                                        setSelectedFavorites([]);
                                      }
                                    }}
                                    className="text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                  >
                                    {showBulkActions ? "取消选择" : "批量操作"}
                                  </button>
                                  {showBulkActions &&
                                    selectedFavorites.length > 0 && (
                                      <>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleBulkUnfavorite();
                                          }}
                                          className="text-xs px-3 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                        >
                                          取消收藏 ({selectedFavorites.length})
                                        </button>
                                      </>
                                    )}
                                </div>
                              )}
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-300 ${expandedCategory === category || activeCategory !== "ALL" ? "rotate-180" : ""}`}
                            style={{ color: TEXT_SUB }}
                          />
                        </button>

                        {(expandedCategory === category ||
                          activeCategory !== "ALL") && (
                          <div className="px-5 pb-5">
                            {/* Stage-level Filter and Sort Toolbars */}
                            <div className="flex items-center justify-start gap-x-6 mb-4 pb-3 border-b border-slate-100 relative z-20 overflow-x-auto whitespace-nowrap scrollbar-none flex-nowrap">
                              {category !== "FREE_TRIAL" && category !== "RECENT" && category !== "FAVORITES" && (
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1 shrink-0">
                                    🎯 筛选范围：
                                  </span>
                                  <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-100 shrink-0">
                                    {[
                                      { id: "all", name: "全部" },
                                      { id: "hot", name: "热门" },
                                      { id: "free", name: "免费试用" },
                                      { id: "vip", name: "会员专享" },
                                    ].map((opt) => (
                                      <button
                                        key={opt.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setStageFilters(prev => ({ ...prev, [category]: opt.id as any }));
                                        }}
                                        className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                          (stageFilters[category] || "all") === opt.id
                                            ? "bg-white text-[#2b6cb0] shadow-sm"
                                            : "text-slate-500 hover:text-slate-800"
                                        }`}
                                      >
                                        {opt.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-xs text-slate-500 font-medium flex items-center gap-1 shrink-0">
                                  📊 排序方式：
                                </span>
                                <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-100 shrink-0">
                                  {[
                                    { id: "default", name: "推荐" },
                                    { id: "success", name: "✓ 成功率" },
                                    { id: "new", name: "🆕 新组件" },
                                  ].map((opt) => (
                                    <button
                                      key={opt.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setStageSorts(prev => ({ ...prev, [category]: opt.id as any }));
                                      }}
                                      className={`text-xs px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                        (stageSorts[category] || "default") === opt.id
                                          ? "bg-white text-[#2b6cb0] shadow-sm"
                                          : "text-slate-500 hover:text-slate-800"
                                      }`}
                                    >
                                      {opt.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {(() => {
                              // Filter components locally
                              let list = [...displayComponents];
                              
                              if (searchQuery.trim()) {
                                const q = searchQuery.toLowerCase();
                                list = list.filter(
                                  (comp) =>
                                    comp.name.toLowerCase().includes(q) ||
                                    comp.description.toLowerCase().includes(q) ||
                                    comp.tags.some((tag) => tag.toLowerCase().includes(q))
                                );
                              }

                              const currentFilter = stageFilters[category] || "all";
                              const currentSort = stageSorts[category] || "default";

                              // Apply localFilter if applicable
                              if (category !== "FREE_TRIAL" && category !== "RECENT" && category !== "FAVORITES") {
                                if (currentFilter === "hot") {
                                  list = list.filter(comp => getComponentStats(comp.id).calls30Days >= 2500);
                                } else if (currentFilter === "free") {
                                  list = list.filter(comp => FREE_COMPONENTS.includes(comp.id));
                                } else if (currentFilter === "vip") {
                                  list = list.filter(comp => !FREE_COMPONENTS.includes(comp.id));
                                }
                              }

                              // Sort components locally
                              if (currentSort === "success") {
                                list.sort((a, b) => getComponentStats(b.id).successRate - getComponentStats(a.id).successRate);
                              } else if (currentSort === "new") {
                                list.sort((a, b) => {
                                  const isNewA = getComponentStats(a.id).isNew;
                                  const isNewB = getComponentStats(b.id).isNew;
                                  return isNewB === isNewA ? 0 : isNewB ? 1 : -1;
                                });
                              }

                              if (list.length === 0) {
                                return (
                                  <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                                    🔍 该筛选条件下，当前阶段无匹配的组件
                                  </div>
                                );
                              }

                              return (
                                <div
                                  className={viewMode === "grid" ? "grid sm:grid-cols-2 gap-3" : "space-y-2"}
                                >
                                  {list.map((component) => {
                                    if (
                                      category !== "FAVORITES" &&
                                      category !== "RECENT" &&
                                      category !== "FREE_TRIAL" &&
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
                                    const isFavorited = favorites.includes(
                                      component.id,
                                    );
                                    const isRecent = recentComponents.includes(
                                      component.id,
                                    );
                                    const stats = getComponentStats(component.id);

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
                                          FREE_COMPONENTS.includes(component.id)
                                            ? "hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] hover:border-emerald-500"
                                            : accessible && !isGuest
                                              ? "hover:shadow-[0_0_16px_rgba(43,108,176,0.2)] hover:border-[#2b6cb0]"
                                              : ""
                                        }`}
                                        style={{
                                          borderColor: isSelected
                                            ? PRIMARY_DARK
                                            : FREE_COMPONENTS.includes(component.id)
                                              ? "rgba(16, 185, 129, 0.25)"
                                              : BORDER_COLOR,
                                          backgroundColor: isSelected
                                            ? PRIMARY_LIGHT + "80"
                                            : isInaccessibleLoggedIn
                                              ? "#f8fafc"
                                              : FREE_COMPONENTS.includes(component.id)
                                                ? "rgba(236, 253, 245, 0.35)"
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
                                        {showBulkActions &&
                                          category === "FAVORITES" && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSelectFavorite(component.id);
                                              }}
                                              className={`absolute top-3 left-3 z-20 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                                selectedFavorites.includes(
                                                  component.id,
                                                )
                                                  ? "bg-blue-500 border-blue-500"
                                                  : "border-slate-300 bg-white hover:border-blue-400"
                                              }`}
                                            >
                                              {selectedFavorites.includes(
                                                component.id,
                                              ) && (
                                                <svg
                                                  className="w-3 h-3 text-white"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={3}
                                                    d="M5 13l4 4L19 7"
                                                  />
                                                </svg>
                                              )}
                                            </button>
                                          )}
                                        <div className="absolute top-3 right-3 z-10 flex gap-1.5">
                                          {stats.isNew && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                                              🆕 新
                                            </span>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleFavorite(component.id);
                                            }}
                                            className="p-1.5 rounded-full transition-colors hover:bg-slate-100"
                                          >
                                            <Heart
                                              className={`w-4 h-4 ${isFavorited ? "fill-yellow-400 text-yellow-500" : "text-slate-400"}`}
                                            />
                                          </button>
                                          {FREE_COMPONENTS.includes(component.id) ? (
                                            isGuest ? (
                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-600">
                                                试用组件
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-600 flex items-center gap-0.5">
                                                <Play className="w-2.5 h-2.5" /> 免费可用
                                              </span>
                                            )
                                          ) : isGuest ? (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-600">
                                              VIP 专享
                                            </span>
                                          ) : !isVipUser() ? (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-600">
                                              订阅解锁
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600 flex items-center gap-0.5">
                                              <Play className="w-2.5 h-2.5" /> 会员可用
                                            </span>
                                          )}
                                        </div>

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
                                              <div className="flex items-center gap-2 text-[10px]">
                                                <span className="text-orange-600 font-bold">
                                                  🔥 {stats.calls30Days}
                                                </span>
                                                <span className="text-green-600 font-bold">
                                                  ✓ {stats.successRate}%
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Floating Inline Progress Status Bar */}
      {runningTask && (() => {
        const comp = getComponentById(runningTask.componentId);
        if (!comp) return null;
        return (
          <div 
            className="fixed bottom-8 left-8 right-8 md:left-auto md:right-8 z-50 w-auto md:w-96 p-4 rounded-xl border shadow-2xl flex flex-col gap-2 transition-all duration-300 animate-slide-in-right"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(12px)",
              borderColor: BORDER_COLOR,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span className="text-xs font-bold text-slate-700">正在工作空间运行组件...</span>
              </div>
              <span className="text-xs font-black text-blue-600">{runningTask.progress}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                {(() => {
                  const Icon = getIcon(comp.icon);
                  return <Icon className="w-4 h-4 text-blue-600" />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-800 truncate">{comp.name}</h4>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{runningTask.statusText}</p>
              </div>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-500 ease-out"
                style={{ width: `${runningTask.progress}%` }}
              />
            </div>
          </div>
        );
      })()}


      {showDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* 渐变装饰 */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>
            
            <button
              onClick={() => setShowDemoModal(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-blue-500" />
                申请演示与免费试用
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                组件工坊物理环境需强绑定工作空间并消耗云算力。留下您的联系方式，我们的架构师团队将在 24 小时内为您开通专属的免费体验配额。
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">您的姓名/称呼</label>
                <input
                  type="text"
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  placeholder="如：张经理"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">联系方式 (微信/手机/邮箱)</label>
                <input
                  type="text"
                  value={demoContact}
                  onChange={(e) => setDemoContact(e.target.value)}
                  placeholder="如：13800000000 或 chat@zhige.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDemoModal(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!demoName.trim() || !demoContact.trim()) {
                    toast.error("请完整填写称呼和联系方式");
                    return;
                  }
                  toast.success("申请提交成功！知阁架构师将在 24 小时内与您取得联系。");
                  setShowDemoModal(false);
                  setDemoName("");
                  setDemoContact("");
                }}
                className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs rounded-lg hover:shadow-lg transition-all"
              >
                提交申请
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />

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
