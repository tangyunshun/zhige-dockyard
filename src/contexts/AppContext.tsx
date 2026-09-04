"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { getAuthToken } from "@/utils/auth";
import type { ComponentDefinition, ComponentCategory, CategoryDetails } from "@/constants/components";
import type { PositionDefinition } from "@/constants/positions";

interface UserState {
  isLoggedIn: boolean;
  userInfo: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    avatar: string;
    role: "SuperAdmin" | "Admin" | "User";
    membershipLevel?: string | null;
    isOAuthUser?: boolean;
    hasCustomPassword?: boolean;
    needsProfileCompletion?: boolean;
  } | null;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  isCurrent: boolean;
  role?: string;
}

interface AppContextType {
  userState: UserState;
  setUserState: React.Dispatch<React.SetStateAction<UserState>>;
  refreshUserState: () => Promise<void>;
  isLoading: boolean;
  
  // 组件状态共享
  favorites: string[];
  recentUsed: string[];
  boundComponentIds: string[];
  // boundComponentIds 所属的工作空间 ID（空间归属校验）：
  // 切换空间瞬间旧空间的装配数据可能仍留在全局状态中，展示层据此判断
  // "装配数据不属于当前空间"时一律按空处理，杜绝旧空间数据残留误展示。
  boundComponentsWorkspaceId: string | null;
  
  // 组件目录（唯一数据源：数据库 component_catalog / component_category 表，经 /api/studio?action=catalog 加载）
  componentCatalog: ComponentDefinition[];
  componentCategories: Record<ComponentCategory, CategoryDetails>;
  defaultAllowedComponentIds: string[];
  // 系统内部引擎（AI_ENGINE 等，isPublished=false，不进用户组件目录，仅用于任务/绑定场景查询名称）
  internalComponentCatalog: ComponentDefinition[];
  // 预置岗位定义（唯一数据源：数据库 position 表，经 /api/studio?action=catalog 加载）
  presetPositions: PositionDefinition[];
  catalogLoaded: boolean;
  refreshComponentCatalog: () => Promise<void>;
  
  // 数据更新与网络同步函数
  refreshFavorites: () => Promise<void>;
  refreshRecentUsed: () => Promise<void>;
  refreshBoundComponents: (workspaceId: string) => Promise<void>;
  // 切换工作空间时同步清空空间级全局数据（当前为已装配组件列表），
  // 避免整页跳转/SPA 导航完成前旧空间数据残留展示
  resetWorkspaceData: () => void;
  toggleFavorite: (componentId: string) => Promise<boolean>;
  addRecentUsed: (componentId: string, workspaceId?: string) => Promise<void>;
  bindComponent: (componentId: string, workspaceId: string) => Promise<{ ok: boolean; error?: string }>;
  unbindComponent: (componentId: string, workspaceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export interface BindResult {
  ok: boolean;
  error?: string;
}

const AppContext = createContext<AppContextType | null>(null);

// 获取初始登录状态（从 localStorage 快速判断）
const getInitialLoginState = (): Pick<UserState, "isLoggedIn" | "userInfo"> => {
  if (typeof window === "undefined") {
    return { isLoggedIn: false, userInfo: null };
  }
  
  const userId = localStorage.getItem("userId");
  const userRole = localStorage.getItem("userRole");
  const authToken = localStorage.getItem("auth_token");
  
  // 获取有效的 cookie token（排除空值情况）
  const cookies = document.cookie.split(";");
  let hasValidToken = false;
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "auth_token" && value && value.length > 0) {
      hasValidToken = true;
      break;
    }
  }
  
  // 必须同时具备：userId、auth_token（localStorage 或 cookie）
  if (userId && (authToken || hasValidToken)) {
    let role: "SuperAdmin" | "Admin" | "User" = "User";
    if (userRole === "SuperAdmin" || userRole === "SUPER_ADMIN" || userRole === "super_admin") {
      role = "SuperAdmin";
    } else if (userRole === "Admin" || userRole === "ADMIN" || userRole === "admin") {
      role = "Admin";
    }
    
    return {
      isLoggedIn: true,
      userInfo: {
        id: userId,
        name: "用户",
        email: "",
        avatar: "",
        role,
        membershipLevel: "FREE",
      },
    };
  }
  
  return { isLoggedIn: false, userInfo: null };
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  // 初始状态在服务端与客户端首帧保持一致（均未登录），避免 hydration mismatch；
  // 登录态在挂载后通过 useEffect 从本地缓存快速恢复，再请求 /api/auth/me 刷新。
  const [userState, setUserState] = useState<UserState>({
    isLoggedIn: false,
    userInfo: null,
    workspaces: [],
    currentWorkspaceId: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // 组件全局状态
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentUsed, setRecentUsed] = useState<string[]>([]);
  const [boundComponentIds, setBoundComponentIds] = useState<string[]>([]);
  const [boundComponentsWorkspaceId, setBoundComponentsWorkspaceId] = useState<string | null>(null);

  // 组件目录（数据库唯一数据源）
  const [componentCatalog, setComponentCatalog] = useState<ComponentDefinition[]>([]);
  const [componentCategories, setComponentCategories] = useState<Record<ComponentCategory, CategoryDetails>>({} as Record<ComponentCategory, CategoryDetails>);
  const [defaultAllowedComponentIds, setDefaultAllowedComponentIds] = useState<string[]>([]);
  const [internalComponentCatalog, setInternalComponentCatalog] = useState<ComponentDefinition[]>([]);
  const [presetPositions, setPresetPositions] = useState<PositionDefinition[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const refreshComponentCatalog = useCallback(async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/studio?action=catalog", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setComponentCatalog(data.data.components || []);
          setInternalComponentCatalog(data.data.internalComponents || []);
          setDefaultAllowedComponentIds(data.data.defaultAllowedIds || []);
          setPresetPositions(data.data.presetPositions || []);
          const cats = {} as Record<ComponentCategory, CategoryDetails>;
          (data.data.categories || []).forEach((c: any) => {
            cats[c.key as ComponentCategory] = { name: c.name, color: c.color, range: c.range, sortOrder: c.sortOrder };
          });
          setComponentCategories(cats);
          setCatalogLoaded(true);
        }
      }
    } catch (err) {
      console.error("加载组件目录失败:", err);
    }
  }, []);

  const refreshFavorites = async () => {
    if (!getAuthToken()) return;
    try {
      const res = await fetch(`/api/studio?action=favorites&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFavorites(data.data || []);
        }
      }
    } catch (err) {
      console.error("加载收藏组件失败:", err);
    }
  };

  const refreshRecentUsed = async () => {
    if (!getAuthToken()) return;
    try {
      const res = await fetch(`/api/studio?action=recent&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        cache: "no-store"
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRecentUsed(data.data || []);
        }
      }
    } catch (err) {
      console.error("加载最近使用失败:", err);
    }
  };

  // 绑定组件请求序号守卫：切换工作空间时多个拉取并发，旧空间的响应可能后到覆盖新空间数据
  const boundReqSeqRef = useRef(0);

  // 切换工作空间时的空间级数据复位。
  // 注意：装配列表 boundComponentIds / boundComponentsWorkspaceId 不再在此清空！
  // 展示层通过 boundComponentsWorkspaceId 与当前 workspaceId 的归属校验，会自动将
  // 不属于当前空间的装配数据按"空"处理；若此处强制清空，会在"进入空间瞬间旧数据仍在、
  // 新数据尚未拉回"的窗口造成已装配数量 3→0 的错误跳变。数据切换由 refreshBoundComponents
  // 在目标空间拉取后整体覆盖完成，此处保留旧数据 + 归属校验即为最稳策略。
  const resetWorkspaceData = useCallback(() => {
    // 保留为空操作：装配数据归属校验兜底（见上方注释）
  }, []);

  const refreshBoundComponents = useCallback(async (workspaceId: string) => {
    if (!workspaceId) return;
    const seq = ++boundReqSeqRef.current;
    const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    // [临时诊断] 便于复现时核对刷新时序
    console.log(`[AppContext] refreshBoundComponents 发起: ws=${workspaceId} seq=${seq}`);

    // 8 秒超时控制，避免网络响应卡死
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const res = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}&_t=${Date.now()}`, {
        headers,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.success && seq === boundReqSeqRef.current) {
          const ids = (data.data || []).map((item: any) => (typeof item === "string" ? item : item?.id || item?.code || String(item)));
          console.log(`[AppContext] refreshBoundComponents 完成: ws=${workspaceId} seq=${seq} ids=[${ids.join(",")}]`);
          setBoundComponentIds(ids);
          // 同时记录装配数据所属空间，供展示层做空间归属校验
          setBoundComponentsWorkspaceId(workspaceId);
        } else {
          console.log(`[AppContext] refreshBoundComponents 被丢弃或失败: ws=${workspaceId} seq=${seq} success=${data?.success} 当前seq=${boundReqSeqRef.current}`);
        }
      } else {
        console.log(`[AppContext] refreshBoundComponents HTTP ${res.status}: ws=${workspaceId} seq=${seq}`);
      }
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name !== "AbortError") {
        console.error("加载绑定组件失败:", err);
      }
    }
  }, []);

  const toggleFavorite = async (componentId: string): Promise<boolean> => {
    if (!getAuthToken()) return false;
    const isFav = favorites.includes(componentId);
    const action = isFav ? "unfavorite" : "favorite";
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`
        },
        credentials: "include",
        body: JSON.stringify({ action, componentId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFavorites(prev => 
            isFav ? prev.filter(id => id !== componentId) : [...prev, componentId]
          );
          return true;
        }
      }
    } catch (err) {
      console.error("切换收藏失败:", err);
    }
    return false;
  };

  const addRecentUsed = async (componentId: string, workspaceId?: string) => {
    if (!getAuthToken()) return;
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`
        },
        credentials: "include",
        body: JSON.stringify({
          action: "use",
          componentId,
          workspaceId: workspaceId || userState.currentWorkspaceId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          await refreshRecentUsed();
        }
      }
    } catch (err) {
      console.error("添加最近使用失败:", err);
    }
  };

  const bindComponent = async (componentId: string, workspaceId: string): Promise<BindResult> => {
    if (!getAuthToken()) return { ok: false, error: "未登录，请先登录" };
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`
        },
        credentials: "include",
        body: JSON.stringify({ action: "bind", componentId, workspaceId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (workspaceId === userState.currentWorkspaceId) {
          setBoundComponentIds(prev => Array.from(new Set([...prev, componentId])));
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_workspace_components_updated", { detail: { workspaceId, componentId, action: "bind" } }));
        }
        return { ok: true };
      }
      return { ok: false, error: data.error || data.message || "装配失败，请稍后重试" };
    } catch (err) {
      console.error("绑定组件失败:", err);
      return { ok: false, error: "网络异常，请稍后重试" };
    }
  };

  const unbindComponent = async (componentId: string, workspaceId: string): Promise<BindResult> => {
    if (!getAuthToken()) return { ok: false, error: "未登录，请先登录" };
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`
        },
        credentials: "include",
        body: JSON.stringify({ action: "unbind", componentId, workspaceId })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (workspaceId === userState.currentWorkspaceId) {
          setBoundComponentIds(prev => prev.filter(id => id !== componentId));
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_workspace_components_updated", { detail: { workspaceId, componentId, action: "unbind" } }));
        }
        return { ok: true };
      }
      return { ok: false, error: data.error || data.message || "解除装配失败，请稍后重试" };
    } catch (err) {
      console.error("解绑组件失败:", err);
      return { ok: false, error: "网络异常，请稍后重试" };
    }
  };

  const refreshUserState = async () => {
    setIsLoading(true);
    
    // 检查是否正在退出登录
    const isLoggingOut = sessionStorage.getItem("is_logging_out") === "true";
    if (isLoggingOut) {
      setIsLoading(false);
      return;
    }
    
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/auth/me", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return;
        }
        const data = await res.json().catch(() => null);
        if (!data || !data.user) return;

        const workspacesRes = await fetch("/api/workspace/list", {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${getAuthToken()}`
          }
        });
        let workspaces: Workspace[] = [];
        let currentWorkspaceId: string | null = null;

        if (workspacesRes.ok) {
          const wsContentType = workspacesRes.headers.get("content-type");
          if (wsContentType && wsContentType.includes("application/json")) {
            const wsData = await workspacesRes.json().catch(() => null);
            if (wsData) {
              workspaces = wsData.workspaces || [];
              currentWorkspaceId = wsData.currentWorkspaceId || null;
            }
          }
        }

        let role: "SuperAdmin" | "Admin" | "User" = "User";
        const rawRole = data.user.role || "User";
        if (rawRole === "SuperAdmin" || rawRole === "SUPER_ADMIN" || rawRole === "super_admin") {
          role = "SuperAdmin";
        } else if (rawRole === "Admin" || rawRole === "ADMIN" || rawRole === "admin") {
          role = "Admin";
        }
        
        // 更新 localStorage
        localStorage.setItem("userId", data.user.id);
        localStorage.setItem("userRole", role);

        // 关键防御：当用户正停留在 /workspace/[id] 页面（已由 loadWorkspace 明确设置当前空间）时，
        // 保留 prev.currentWorkspaceId。否则 refreshUserState 晚到的响应用服务器 lastWorkspaceId
        // （可能停留在过期空间）覆盖 currentWorkspaceId，会触发 AppContext effect 拉取错误空间的
        // 绑定数据（如企业空间空数据）覆盖个人空间已装配组件，造成"已装配 3 个→0"的错误跳变。
        // 其余场景（组件大厅切换空间走 /api/workspace/switch 更新 lastWorkspaceId、配置页等）仍以服务器值为准。
        const isInWorkspaceRoute =
          typeof window !== "undefined" && /^\/workspace\//.test(window.location.pathname);
        setUserState((prev) => ({
          ...prev,
          isLoggedIn: true,
          userInfo: {
            id: data.user.id,
            name: data.user.name || "用户",
            email: data.user.email || "",
            phone: data.user.phone || null,
            avatar: data.user.avatar || "",
            role,
            membershipLevel: data.user.membershipLevel,
            isOAuthUser: data.user.isOAuthUser,
            hasCustomPassword: data.user.hasCustomPassword,
            needsProfileCompletion: data.user.needsProfileCompletion,
          },
          workspaces,
          currentWorkspaceId:
            isInWorkspaceRoute && prev.currentWorkspaceId ? prev.currentWorkspaceId : currentWorkspaceId,
        }));
      } else {
        // 登录状态失效，清除本地存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("auth_token");
        
        setUserState({
          isLoggedIn: false,
          userInfo: null,
          workspaces: [],
          currentWorkspaceId: null,
        });
      }
    } catch (error) {
      console.error("Refresh user state error:", error);
      // 网络错误时保持现有状态
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 先从本地缓存快速恢复登录态（此时已挂载，可安全访问 localStorage）
    const cached = getInitialLoginState();
    if (cached.isLoggedIn && cached.userInfo) {
      setUserState((prev) => ({
        ...prev,
        isLoggedIn: true,
        userInfo: cached.userInfo,
      }));
    }
    // 若当前位于 /workspace/[id] 页面，立即以 URL 中的空间初始化 currentWorkspaceId，
    // 使下方绑定数据 effect 立刻并发发起该空间的装配数据拉取（与 loadWorkspace 并行），
    // 避免刷新页面后 currentWorkspaceId 需等 refreshUserState 两次网络往返才确定、
    // 期间装配数据为空导致"已绑定 0 个"短暂误显示后再跳变真实数量。
    if (cached.isLoggedIn && typeof window !== "undefined") {
      const m = window.location.pathname.match(/^\/workspace\/([^/?]+)/);
      if (m && m[1]) {
        setUserState((prev) => ({ ...prev, currentWorkspaceId: m[1] }));
      }
    }
    // 再向服务端请求最新用户信息并校验登录态
    refreshUserState();
    // 加载系统组件目录（数据库唯一数据源）
    refreshComponentCatalog();
  }, []);

  // 监听登录态，自动拉取全局收藏和最近使用；
  // 若组件目录在挂载时因未带凭证而加载失败，登录后自动重试拉取，保证组件货架有数据
  useEffect(() => {
    if (userState.isLoggedIn && userState.userInfo?.id) {
      refreshFavorites();
      refreshRecentUsed();
      if (!catalogLoaded) {
        refreshComponentCatalog();
      }
    } else {
      setFavorites([]);
      setRecentUsed([]);
    }
  }, [userState.isLoggedIn, userState.userInfo?.id, catalogLoaded]);

  // 监听当前空间变化，自动拉取对应已绑定组件。
  // 空间归属校验兜底：切换瞬间旧空间的 boundComponentIds 即使尚未清空，
  // 展示层也会因 boundComponentsWorkspaceId 与当前空间不匹配而按空处理；
  // 因此这里直接拉取当前空间数据，不再先无条件清空（避免把刚拉取的正确数据误清成 0 再跳变）
  useEffect(() => {
    if (userState.isLoggedIn && userState.currentWorkspaceId) {
      refreshBoundComponents(userState.currentWorkspaceId);
    } else {
      setBoundComponentIds([]);
      setBoundComponentsWorkspaceId(null);
    }
  }, [userState.isLoggedIn, userState.currentWorkspaceId, refreshBoundComponents]);

  return (
    <AppContext.Provider
      value={{
        userState,
        setUserState,
        refreshUserState,
        isLoading,
        favorites,
        recentUsed,
        boundComponentIds,
        boundComponentsWorkspaceId,
        componentCatalog,
        componentCategories,
        defaultAllowedComponentIds,
        internalComponentCatalog,
        presetPositions,
        catalogLoaded,
        refreshComponentCatalog,
        refreshFavorites,
        refreshRecentUsed,
        refreshBoundComponents,
        resetWorkspaceData,
        toggleFavorite,
        addRecentUsed,
        bindComponent,
        unbindComponent
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
}
