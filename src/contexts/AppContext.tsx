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

  return (
    <AppContext.Provider
      value={{
        userState,
        setUserState,
        refreshUserState,
        isLoading,
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
