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

  // F-03：弹窗展示后自动跳转中控台。
  // 独立 effect 绑定 showModal 状态，避免异步 fetch 竞态（StrictMode 下 effect 双执行）
  // 导致"弹窗显示但跳转定时器丢失、永不返回"的问题。
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
        // API 约定：仍为成员返回 200 + isMember:true；
        // 已被移出空间返回 403 + { isMember:false, code:"W-001" }，必须解析 body 判断，不能只看 res.ok。
        // 仅 403 且带明确的"已移出"标记才触发 F-03；401（会话失效）/500（服务器错误）等其他状态一律忽略，
        // 避免把会话问题误判为"被移出空间"。
        if (res.status !== 200 && res.status !== 403) return;
        const data = await res.json();
        const removed =
          res.status === 403 &&
          (data.isMember === false ||
            data.code === SESSION_ERROR_CODES.W_001 ||
            data.error === "WORKSPACE_REMOVED");

        if (removed && !handledRef.current) {
          handledRef.current = true;
          // F-03：清空本地空间缓存，回中控台后重新拉取空间列表
          setUserState((prev) =>
            prev.currentWorkspaceId ? { ...prev, currentWorkspaceId: null } : prev
          );
          refreshWorkspaces();
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.74 20h18.52a1 1 0 00.87-1.44L13.71 3.86a1 1 0 00-1.42 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">您已被移出该空间</h3>
        <p className="text-sm text-slate-500 mb-6">
          您的工作空间成员身份已被管理员移除，正在返回中控台…
        </p>
        <button
          onClick={() => router.push("/workspace-hub")}
          className="px-6 py-2.5 bg-[#3182ce] text-white rounded-xl font-semibold hover:bg-[#2b6cb0] transition-colors"
        >
          立即返回
        </button>
      </div>
    </div>
  );
}
