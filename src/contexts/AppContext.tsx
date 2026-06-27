"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface UserState {
  isLoggedIn: boolean;
  userInfo: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    role: "SuperAdmin" | "Admin" | "User";
    membershipLevel?: string | null;
  } | null;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  isCurrent: boolean;
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
  
  // 数据更新与网络同步函数
  refreshFavorites: () => Promise<void>;
  refreshRecentUsed: () => Promise<void>;
  refreshBoundComponents: (workspaceId: string) => Promise<void>;
  toggleFavorite: (componentId: string) => Promise<boolean>;
  addRecentUsed: (componentId: string, workspaceId?: string) => Promise<void>;
  bindComponent: (componentId: string, workspaceId: string) => Promise<boolean>;
  unbindComponent: (componentId: string, workspaceId: string) => Promise<boolean>;
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
  const initialLoginState = getInitialLoginState();
  
  const [userState, setUserState] = useState<UserState>({
    isLoggedIn: initialLoginState.isLoggedIn,
    userInfo: initialLoginState.userInfo,
    workspaces: [],
    currentWorkspaceId: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // 组件全局状态
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentUsed, setRecentUsed] = useState<string[]>([]);
  const [boundComponentIds, setBoundComponentIds] = useState<string[]>([]);

  const refreshFavorites = async () => {
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return;
    try {
      const res = await fetch("/api/studio?action=favorites", {
        headers: { Authorization: `Bearer ${userId}` }
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
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return;
    try {
      const res = await fetch("/api/studio?action=recent", {
        headers: { Authorization: `Bearer ${userId}` }
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

  const refreshBoundComponents = async (workspaceId: string) => {
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return;
    try {
      const res = await fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`, {
        headers: { Authorization: `Bearer ${userId}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBoundComponentIds(data.data || []);
        }
      }
    } catch (err) {
      console.error("加载绑定组件失败:", err);
    }
  };

  const toggleFavorite = async (componentId: string): Promise<boolean> => {
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return false;
    const isFav = favorites.includes(componentId);
    const action = isFav ? "unfavorite" : "favorite";
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`
        },
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
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return;
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`
        },
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

  const bindComponent = async (componentId: string, workspaceId: string): Promise<boolean> => {
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return false;
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`
        },
        body: JSON.stringify({ action: "bind", componentId, workspaceId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (workspaceId === userState.currentWorkspaceId) {
            setBoundComponentIds(prev => Array.from(new Set([...prev, componentId])));
          }
          return true;
        }
      }
    } catch (err) {
      console.error("绑定组件失败:", err);
    }
    return false;
  };

  const unbindComponent = async (componentId: string, workspaceId: string): Promise<boolean> => {
    const userId = localStorage.getItem("userId") || userState.userInfo?.id;
    if (!userId) return false;
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`
        },
        body: JSON.stringify({ action: "unbind", componentId, workspaceId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (workspaceId === userState.currentWorkspaceId) {
            setBoundComponentIds(prev => prev.filter(id => id !== componentId));
          }
          return true;
        }
      }
    } catch (err) {
      console.error("解绑组件失败:", err);
    }
    return false;
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
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();

        const workspacesRes = await fetch("/api/workspace/list", {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${data.user.id}`
          }
        });
        let workspaces: Workspace[] = [];
        let currentWorkspaceId: string | null = null;

        if (workspacesRes.ok) {
          const wsData = await workspacesRes.json();
          workspaces = wsData.workspaces || [];
          currentWorkspaceId = wsData.currentWorkspaceId || null;
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

        setUserState({
          isLoggedIn: true,
          userInfo: {
            id: data.user.id,
            name: data.user.name || "用户",
            email: data.user.email || "",
            avatar: data.user.avatar || "",
            role,
            membershipLevel: data.user.membershipLevel,
          },
          workspaces,
          currentWorkspaceId,
        });
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
    refreshUserState();
  }, []);

  // 监听登录态，自动拉取全局收藏和最近使用
  useEffect(() => {
    if (userState.isLoggedIn && userState.userInfo?.id) {
      refreshFavorites();
      refreshRecentUsed();
    } else {
      setFavorites([]);
      setRecentUsed([]);
    }
  }, [userState.isLoggedIn, userState.userInfo?.id]);

  // 监听当前空间变化，自动拉取对应已绑定组件
  useEffect(() => {
    if (userState.isLoggedIn && userState.currentWorkspaceId) {
      refreshBoundComponents(userState.currentWorkspaceId);
    } else {
      setBoundComponentIds([]);
    }
  }, [userState.isLoggedIn, userState.currentWorkspaceId]);

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
        refreshFavorites,
        refreshRecentUsed,
        refreshBoundComponents,
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
