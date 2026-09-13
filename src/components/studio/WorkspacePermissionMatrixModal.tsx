"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Shield,
  X,
  Building2,
  Users,
  Check,
  Lock,
  Loader2,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronRight,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { PostIcon } from "./PostIcon";

export interface WorkspacePermissionMatrixModalProps {
  workspace: {
    id: string;
    name: string;
    memberCount?: number;
    type?: string;
  };
  initialPostName?: string;
  onClose: () => void;
}

interface WorkspacePost {
  id: string;
  name: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  isDefault?: boolean;
  memberCount?: number;
}

interface CatalogComponent {
  id: string;
  name: string;
  description?: string;
  category?: string;
}

export function WorkspacePermissionMatrixModal({
  workspace,
  initialPostName,
  onClose,
}: WorkspacePermissionMatrixModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [posts, setPosts] = useState<WorkspacePost[]>([]);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [components, setComponents] = useState<CatalogComponent[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // 加载该企业空间的岗位与权限真实数据
  useEffect(() => {
    if (!workspace?.id) return;
    let isCancelled = false;

    const fetchMatrixData = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = getAuthToken();
        const res = await fetch(
          `/api/user/workspace-hub/posts?workspaceId=${encodeURIComponent(workspace.id)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          }
        );

        const data = await res.json();
        if (isCancelled) return;

        if (res.ok && data.success) {
          const rawPosts: any[] = data.data?.posts || [];
          const rawPermissions: Record<string, Record<string, any>> =
            data.data?.permissions || {};
          const rawComponents: any[] = data.data?.components || [];

          const formattedPosts: WorkspacePost[] = rawPosts.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description || "",
            color: p.color || "#3182ce",
            icon: p.icon || null,
            isDefault: Boolean(p.isDefault),
            memberCount: Array.isArray(p.members) ? p.members.length : 0,
          }));

          setPosts(formattedPosts);
          setPermissions(rawPermissions);
          setComponents(
            rawComponents.map((c) => ({
              id: c.id,
              name: c.name || c.id,
              description: c.description || "",
              category: c.category || "常用组件",
            }))
          );

          // 优先定位到当前查看的标准岗位
          if (formattedPosts.length > 0) {
            const matched = initialPostName
              ? formattedPosts.find(
                  (p) =>
                    p.name.trim().toLowerCase() ===
                    initialPostName.trim().toLowerCase()
                )
              : null;
            setSelectedPostId(matched ? matched.id : formattedPosts[0].id);
          }
        } else {
          setError(data.error || "获取企业空间权限信息失败");
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Fetch workspace matrix error:", err);
          setError("网络异常，无法加载企业权限信息");
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchMatrixData();
    return () => {
      isCancelled = true;
    };
  }, [workspace?.id, initialPostName]);

  // 当前选中的岗位
  const currentPost = useMemo(() => {
    return posts.find((p) => p.id === selectedPostId) || posts[0] || null;
  }, [posts, selectedPostId]);

  // 当前选中岗位实际已授权的组件列表
  const grantedComponents = useMemo(() => {
    if (!currentPost) return [];
    const postPerms = permissions[currentPost.id] || {};
    return components.filter((c) => Boolean(postPerms[c.id]));
  }, [currentPost, permissions, components]);

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50 duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ==================== 1. 紧凑头部 ==================== */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-2xs shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-slate-800 truncate">
                【{workspace.name}】权限信息
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">
                企业空间 · 共 {workspace.memberCount || 0} 位在编成员
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0 cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ==================== 2. 核心信息主体 ==================== */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 text-[#3182ce] animate-spin mb-2" />
              <p className="text-slate-400 text-xs">加载空间权限中...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-center space-y-1">
              <AlertCircle className="w-5 h-5 mx-auto text-amber-500" />
              <p className="font-bold">{error}</p>
            </div>
          ) : (
            <>
              {/* 当前关注岗位卡片 */}
              {currentPost && (
                <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-2xs shrink-0"
                        style={{ backgroundColor: currentPost.color || "#3182ce" }}
                      >
                        <PostIcon iconKey={currentPost.icon} className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="font-black text-slate-800 text-xs">
                          {currentPost.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono ml-2">
                          ({currentPost.memberCount || 0} 位成员)
                        </span>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#3182ce] border border-blue-200/80 shadow-2xs">
                      已授权 {grantedComponents.length} / {components.length} 项组件
                    </span>
                  </div>

                  {/* 已授权的组件标签（直接一览） */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block mb-1.5">
                      该岗位在空间内已开通的操作与业务组件：
                    </span>
                    {grantedComponents.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {grantedComponents.map((comp) => (
                          <span
                            key={comp.id}
                            className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-700 text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                            title={comp.description || comp.name}
                          >
                            <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{comp.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-white/80 border border-slate-200/60 text-slate-400 text-[11px] flex items-center gap-1.5">
                        <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>暂未在该空间中为该岗位分配任何组件操作权限</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 空间内其余岗位权限概览（紧凑列表） */}
              {posts.length > 1 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400 text-[11px] font-bold px-1">
                    <span>空间已装配的其他岗位权限分布：</span>
                    <span>点击切换查看</span>
                  </div>

                  <div className="rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100 max-h-44 overflow-y-auto bg-slate-50/50">
                    {posts.map((post) => {
                      const isCurrent = post.id === currentPost?.id;
                      const postPerms = permissions[post.id] || {};
                      const count = Object.values(postPerms).filter(Boolean).length;

                      return (
                        <div
                          key={post.id}
                          onClick={() => setSelectedPostId(post.id)}
                          className={`p-2 px-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isCurrent
                              ? "bg-white text-[#3182ce] font-bold"
                              : "hover:bg-white text-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: post.color || "#3182ce" }}
                            />
                            <span className="truncate max-w-[180px]">{post.name}</span>
                            {post.memberCount !== undefined && post.memberCount > 0 && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                ({post.memberCount}人)
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-[11px] font-mono shrink-0">
                            <span className={count > 0 ? "text-slate-700 font-bold" : "text-slate-400"}>
                              {count} 项组件
                            </span>
                            <ChevronRight className="w-3 h-3 text-slate-400" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ==================== 3. 极简底部 ==================== */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default WorkspacePermissionMatrixModal;
