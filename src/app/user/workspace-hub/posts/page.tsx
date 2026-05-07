"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Plus, Edit2, Trash2, UserPlus, Shield, ArrowLeft, Building2 } from "lucide-react";

interface Post {
  id: string;
  name: string;
  description: string | null;
  color: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    userAvatar: string | null;
    assignedAt: string;
  }>;
}

interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: "OWNER" | "ADMIN" | "MEMBER";
}

export default function WorkspacePostsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  // 新建岗位表单
  const [newPostName, setNewPostName] = useState("");
  const [newPostDescription, setNewPostDescription] = useState("");
  const [newPostColor, setNewPostColor] = useState("#64748b");

  // 加载岗位列表
  useEffect(() => {
    loadWorkspace();
  }, []);

  const loadWorkspace = async () => {
    try {
      // 优先从 URL 参数获取 workspaceId
      const urlWorkspaceId = searchParams.get("workspaceId");
      let workspaceId = urlWorkspaceId || localStorage.getItem("currentWorkspaceId");
      
      if (!workspaceId) {
        // 尝试从用户信息中获取
        const userStr = localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          workspaceId = user.lastWorkspaceId;
        }
      }
      
      if (!workspaceId) {
        setLoading(false);
        return;
      }

      setCurrentWorkspaceId(workspaceId);

      // 获取工作空间信息
      const token = localStorage.getItem("token");
      const wsRes = await fetch(`/api/workspace/list`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (wsRes.ok) {
        const wsData = await wsRes.json();
        const ws = wsData.workspaces.find((w: any) => w.id === workspaceId);
        if (ws) {
          setWorkspace(ws);
        }
      }

      // 加载岗位列表
      const res = await fetch(`/api/admin/posts?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (error) {
      console.error("Load error:", error);
    } finally {
      setLoading(false);
    }
  };

  // 创建岗位
  const handleCreatePost = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          name: newPostName,
          description: newPostDescription,
          color: newPostColor,
        }),
      });

      if (res.ok) {
        await loadWorkspace();
        setShowCreateModal(false);
        setNewPostName("");
        setNewPostDescription("");
        setNewPostColor("#64748b");
      }
    } catch (error) {
      console.error("Create post error:", error);
    }
  };

  // 删除岗位
  const handleDeletePost = async (postId: string) => {
    if (!confirm("确定要删除这个岗位吗？")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/posts/${postId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        await loadWorkspace();
      }
    } catch (error) {
      console.error("Delete post error:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  if (!currentWorkspaceId || !workspace) {
    return (
      <div className="min-h-screen bg-[#f0f8ff]">
        {/* 顶部导航栏 */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-bold">返回</span>
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-black text-slate-800">岗位管理</h1>
                  <p className="text-xs text-slate-600">请先选择工作空间</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              请先选择工作空间
            </h3>
            <p className="text-slate-600 mb-6">
              您需要先选择一个企业空间才能管理岗位
            </p>
            <button
              onClick={() => router.push("/user/workspace-hub")}
              className="px-6 py-2.5 bg-[#3182ce] text-white rounded-lg font-bold hover:bg-[#2b6cb0] transition-colors"
            >
              返回工作台
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f8ff]">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold">返回</span>
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-black text-slate-800">岗位管理</h1>
                  <span className="text-xs text-slate-500">|</span>
                  <span className="text-sm text-slate-600">{workspace.name}</span>
                </div>
                <p className="text-xs text-slate-600">管理企业岗位、分配成员、配置权限</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 主要内容 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-800">企业岗位</h2>
            <p className="text-sm text-slate-600 mt-1">
              创建和管理企业岗位，配置岗位权限和成员
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg font-bold hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            创建岗位
          </button>
        </div>

        {/* 岗位列表 */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    岗位名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    描述
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    成员数量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                    创建时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-600 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                      <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p>暂无岗位，点击右上角创建第一个岗位</p>
                    </td>
                  </tr>
                ) : (
                  posts.map((post) => (
                    <tr key={post.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: post.color }}
                          ></div>
                          <div>
                            <div className="font-bold text-slate-800">{post.name}</div>
                            {post.isSystem && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                系统岗位
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                        {post.description || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-700">
                          {post.members?.length || 0} 人
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedPost(post);
                              setShowMemberModal(true);
                            }}
                            className="p-2 text-slate-600 hover:bg-slate-100 hover:text-[#3182ce] rounded-lg transition-colors"
                            title="分配成员"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPost(post);
                              setShowEditModal(true);
                            }}
                            className="p-2 text-slate-600 hover:bg-slate-100 hover:text-[#3182ce] rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => router.push(`/user/workspace-hub/matrix?workspaceId=${currentWorkspaceId}&postId=${post.id}`)}
                            className="p-2 text-slate-600 hover:bg-slate-100 hover:text-emerald-600 rounded-lg transition-colors"
                            title="配置权限"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          {!post.isSystem && (
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="p-2 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
