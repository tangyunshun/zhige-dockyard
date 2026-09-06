"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getAuthToken } from "@/utils/auth";
import { dedupeFetch } from "@/lib/requestDedupe";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  avatar: string;
  status: string;
  membershipLevel?: string;
  isPendingDeletion?: boolean;
  daysRemaining?: number;
  deletionDeadline?: string;
}

interface UserContextType {
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<UserInfo>) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserFromAPI = useCallback(async () => {
    if (typeof window === "undefined") return;
    
    setLoading(true);
    setError(null);
    
    try {
      const authToken = getAuthToken();
      const res = await dedupeFetch("/api/auth/me", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
        cache: "no-store", // 强制不缓存，每次从数据库查询最新数据
      });
      
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json().catch(() => null);
          if (data && data.user) {
            setUser(data.user);
          }
        }
      } else if (res.status === 401 || res.status === 403) {
        setUser(null);
      }
    } catch (err) {
      setError("获取用户信息失败");
      console.error("Fetch user error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserFromAPI();
  }, [fetchUserFromAPI]);

  const refreshUser = useCallback(async () => {
    await fetchUserFromAPI(); // 每次都从数据库实时查询
  }, [fetchUserFromAPI]);

  const updateUser = useCallback((updates: Partial<UserInfo>) => {
    setUser((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, error, refreshUser, updateUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export default UserProvider;
