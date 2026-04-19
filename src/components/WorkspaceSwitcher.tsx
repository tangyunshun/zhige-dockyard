"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Building, User, ChevronDown, Plus } from "lucide-react";
import { WorkspaceType } from "@/types/workspace";

interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    type: WorkspaceType;
    description?: string | null;
    logo?: string | null;
  };
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: "OWNER" | "ADMIN" | "MEMBER";
  logo?: string | null;
}

interface WorkspaceSwitcherProps {
  workspaces?: Workspace[];
  currentWorkspaceId?: string;
  onSwitch?: (workspaceId: string) => void;
  showCreateButton?: boolean;
}

export default function WorkspaceSwitcher({
  workspaces: externalWorkspaces,
  currentWorkspaceId,
  onSwitch,
  showCreateButton = true,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [internalWorkspaces, setInternalWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // 如果外部传入了 workspaces，使用外部的；否则自己获取
  const workspaces = externalWorkspaces || internalWorkspaces;
  const handleSwitch = onSwitch;

  // 获取当前用户 ID 和工作空间列表（仅当没有外部传入时）
  useEffect(() => {
    if (externalWorkspaces) {
      return; // 使用外部数据，不需要自己获取
    }

    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("auth_token="))
      ?.split("=")[1];

    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const uid = payload.userId;
      setUserId(uid);
      fetchWorkspaces(uid);
    } catch (error) {
      console.error("Token decode error:", error);
    }
  }, [externalWorkspaces]);

  const fetchWorkspaces = async (uid: string) => {
    try {
      const res = await fetch("/api/workspace/list");
      const data = await res.json();

      if (res.ok) {
        setInternalWorkspaces(data.workspaces);
      }
    } catch (error) {
      console.error("Fetch workspaces error:", error);
    }
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    if (handleSwitch) {
      // 使用外部传入的切换函数
      handleSwitch(workspaceId);
      return;
    }

    if (!userId) return;

    setLoading(true);
    setIsOpen(false);

    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("切换成功");
        window.location.reload();
      } else {
        toast.error(data.message || "切换失败");
      }
    } catch (error) {
      console.error("Switch workspace error:", error);
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // 找到当前工作空间
  const current = workspaces.find(w => w.id === currentWorkspaceId) || workspaces[0];

  return (
    <div className="relative">
      {/* 切换按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-white/60 hover:bg-white/80 backdrop-blur-sm rounded-lg border border-[#e2e8f0] hover:border-[#3182ce] transition-all"
      >
        <div className="w-6 h-6 rounded bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white text-xs">
          {current?.type === "PERSONAL" ? (
            <User className="w-3 h-3" />
          ) : (
            <Building className="w-3 h-3" />
          )}
        </div>
        <span className="text-sm font-bold text-slate-700 max-w-[150px] truncate">
          {current?.name || "选择空间"}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 下拉内容 */}
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-[#e2e8f0] z-50 overflow-hidden">
            {/* 标题 */}
            <div className="px-4 py-3 border-b border-[#e2e8f0] bg-slate-50">
              <p className="text-xs font-medium text-slate-500">工作空间</p>
            </div>

            {/* 空间列表 */}
            <div className="max-h-64 overflow-y-auto py-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => handleSwitchWorkspace(workspace.id)}
                  disabled={loading}
                  className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/80 transition-all disabled:opacity-50 rounded-lg"
                >
                  {/* 图标 */}
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white flex-shrink-0">
                    {workspace.type === "PERSONAL" ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Building className="w-4 h-4" />
                    )}
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-800 text-sm truncate">
                        {workspace.name}
                      </h4>
                      {workspace.type === "PERSONAL" ? (
                        <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-bold">
                          个人
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-bold">
                          企业
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                      {workspace.role === "OWNER" ? "所有者" : workspace.role === "ADMIN" ? "管理员" : "成员"}
                    </p>
                  </div>

                  {/* 选中标记 */}
                  {currentWorkspaceId === workspace.id && (
                    <div className="text-[#3182ce]">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* 创建空间按钮 */}
            {showCreateButton && (
              <div className="p-2 border-t border-[#e2e8f0]">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowCreateModal(true);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2 text-sm font-bold text-[#3182ce] hover:bg-blue-50 rounded-lg transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>创建/升级企业空间</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* TODO: 创建空间 Modal 弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              创建企业空间
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              此功能开发中，请联系管理员
            </p>
            <button
              onClick={() => setShowCreateModal(false)}
              className="w-full px-4 py-2 bg-[#3182ce] text-white rounded-lg hover:bg-[#2563eb] transition-all"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
