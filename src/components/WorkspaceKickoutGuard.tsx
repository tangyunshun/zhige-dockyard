"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppContext } from "@/contexts/AppContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { SESSION_ERROR_CODES } from "@/lib/session-constants";
import { getAuthToken } from "@/utils/auth";

// 空间级别踢出（Workspace Kickout，PRD F-03）：
// 当用户在某个工作空间内被移除成员身份时，不踢出整个系统，
// 而是清空本地空间缓存、自动重定向到 Workspace Hub 中控台，并弹出提示。
export default function WorkspaceKickoutGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { setUserState } = useAppContext();
  const { refreshWorkspaces } = useWorkspace();
  const [showModal, setShowModal] = useState(false);
  const handledRef = useRef(false);

  // 仅工作空间内部页面生效
  const match = pathname?.match(/^\/workspace\/([^/]+)/);
  const workspaceId = match ? match[1] : null;

  const [modalType, setModalType] = useState<"kicked" | "disabled">("kicked");

  // F-03：弹窗展示后自动跳转中控台
  useEffect(() => {
    if (!showModal) return;
    const timer = setTimeout(() => {
      router.push("/workspace-hub");
    }, 2500);
    return () => clearTimeout(timer);
  }, [showModal, router]);

  useEffect(() => {
    if (!workspaceId) return;
    handledRef.current = false;

    const check = async () => {
      try {
        const authToken = getAuthToken();
        const res = await fetch(`/api/workspace/${workspaceId}/my-membership`, {
          method: "GET",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          credentials: "include",
        });
        if (res.status !== 200 && res.status !== 403) return;
        const data = await res.json();

        // 1. 检测空间是否已被管理员停用管控
        if (data.workspaceStatus === "DISABLED" && !handledRef.current) {
          handledRef.current = true;
          setUserState((prev) =>
            prev.currentWorkspaceId ? { ...prev, currentWorkspaceId: null } : prev
          );
          refreshWorkspaces();
          setModalType("disabled");
          setShowModal(true);
          return;
        }

        // 2. 检测是否已被移出空间
        const removed =
          res.status === 403 &&
          (data.isMember === false ||
            data.code === SESSION_ERROR_CODES.W_001 ||
            data.error === "WORKSPACE_REMOVED");

        if (removed && !handledRef.current) {
          handledRef.current = true;
          setUserState((prev) =>
            prev.currentWorkspaceId ? { ...prev, currentWorkspaceId: null } : prev
          );
          refreshWorkspaces();
          setModalType("kicked");
          setShowModal(true);
        }
      } catch {
        /* 忽略网络抖动 */
      }
    };

    // 进入即检 + 定时轮询 + 窗口聚焦时检查
    check();
    const interval = setInterval(check, 15000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [workspaceId, router, setUserState, refreshWorkspaces]);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in-50 duration-200">
      <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
          modalType === "disabled" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
        }`}>
          {modalType === "disabled" ? (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          ) : (
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.74 20h18.52a1 1 0 00.87-1.44L13.71 3.86a1 1 0 00-1.42 0z" />
            </svg>
          )}
        </div>
        <h3 className="text-lg font-black text-slate-800 mb-2">
          {modalType === "disabled" ? "空间已被管控停用" : "您已被移出该空间"}
        </h3>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          {modalType === "disabled"
            ? "该企业工作空间已被平台管理员实施安全管控停用，所有功能与算力服务已冻结。正在返回中控台…"
            : "您的工作空间成员身份已被管理员移除，正在返回中控台…"}
        </p>
        <button
          onClick={() => router.push("/workspace-hub")}
          className="w-full px-6 py-2.5 bg-[#3182ce] text-white rounded-xl font-bold text-xs hover:bg-[#2b6cb0] transition-colors cursor-pointer"
        >
          立即返回工作台中枢
        </button>
      </div>
    </div>
  );
}
