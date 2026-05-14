"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: "OWNER" | "ADMIN" | "MEMBER";
  logo?: string | null;
  description?: string | null;
  emoji?: string | null;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspaceId: string | undefined;
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
  updateWorkspaces: (newWorkspaces: Workspace[]) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const fetchWorkspacesFromAPI = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/workspace/list", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces || []);
        setCurrentWorkspaceId(data.currentWorkspaceId);
      }
    } catch (error) {
      console.error("Fetch workspaces error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspacesFromAPI();
  }, [fetchWorkspacesFromAPI]);

  const refreshWorkspaces = useCallback(async () => {
    await fetchWorkspacesFromAPI();
  }, [fetchWorkspacesFromAPI]);

  const updateWorkspaces = useCallback((newWorkspaces: Workspace[]) => {
    setWorkspaces(newWorkspaces);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspaceId,
        loading,
        refreshWorkspaces,
        updateWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

export default WorkspaceProvider;
