"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Plus, Edit2, Trash2, Save, X, UserPlus, Shield } from "lucide-react";

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
  permissions: Record<string, any>;
}

interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
}

export default function AdminPostsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);

  // 新建岗位表单
  const [newPostName, setNewPostName] = useState("");
  const [newPostDescription, setNewPostDescription] = useState("");
  const [newPostColor, setNewPostColor] = useState("#64748b");

  // 加载岗位列表
  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
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
        // 没有工作空间 ID，显示提示
        setLoading(false);
        return;
      }

      setCurrentWorkspaceId(workspaceId);

      const token = localStorage.getItem("token");
      
      const res = await fetch(`/api/admin/posts?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      } else {
        console.error("加载岗位列表失败");
      }
    } catch (error) {
      console.error("Load posts error:", error);
    } finally {
      setLoading(false);
    }
  };

  // 创建岗位
  const handleCreatePost = async () => {
    if (!newPostName.trim()) {
      alert("请输入岗位名称");
      return;
    }

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
          name: newPostName.trim(),
          description: newPostDescription.trim(),
          color: newPostColor,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message || "岗位创建成功");
        setShowCreateModal(false);
        setNewPostName("");
        setNewPostDescription("");
        setNewPostColor("#64748b");
        loadPosts();
      } else {
        const error = await res.json();
        alert(error.error || "创建失败");
      }
    } catch (error) {
      console.error("Create post error:", error);
      alert("创建失败");
    }
  };

  // 删除岗位
  const handleDeletePost = async (postId: string, postName: string) => {
    if (!confirm(`确定要删除岗位 "${postName}" 吗？`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/posts/${postId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        alert("岗位已删除");
        loadPosts();
      } else {
        const error = await res.json();
        alert(error.error || "删除失败");
      }
    } catch (error) {
      console.error("Delete post error:", error);
      alert("删除失败");
    }
  };

  // 打开成员管理弹窗
  const handleManageMembers = (post: Post) => {
    setSelectedPost(post);
    setShowMemberModal(true);
  };

  // 打开权限配置弹窗
  const handleManagePermissions = (post: Post) => {
    router.push(`/admin/matrix/${currentWorkspaceId}?postId=${post.id}`);
  };

  // 分配成员
  const handleAssignMembers = async (selectedUserIds: string[]) => {
    if (!selectedPost || selectedUserIds.length === 0) {
      alert("请选择用户");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/posts/${selectedPost.id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userIds: selectedUserIds,
          workspaceId: currentWorkspaceId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message || "成员分配成功");
        setShowMemberModal(false);
        loadPosts();
      } else {
        const error = await res.json();
        alert(error.error || "分配失败");
      }
    } catch (error) {
      console.error("Assign members error:", error);
      alert("分配失败");
    }
  };

  // 移除成员
  const handleRemoveMember = async (userId: string) => {
    if (!selectedPost) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/admin/posts/${selectedPost.id}/members?userId=${userId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.ok) {
        alert("成员已移除");
        loadPosts();
      } else {
        const error = await res.json();
        alert(error.error || "移除失败");
      }
    } catch (error) {
      console.error("Remove member error:", error);
      alert("移除失败");
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

  // 没有工作空间 ID 时显示提示
  if (!currentWorkspaceId) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">
          请先选择工作空间
        </h3>
        <p className="text-slate-600 mb-6">
          您需要先选择一个工作空间才能管理岗位
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => router.push("/admin/workspaces")}
            className="px-6 py-2.5 bg-[#3182ce] text-white rounded-lg font-bold hover:bg-[#2b6cb0] transition-colors"
          >
            管理工作空间
          </button>
          <button
            onClick={() => router.push("/user/workspace-hub")}
            className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200 transition-colors"
          >
            返回 Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f8ff] p-6">
      <div className="max-w-7xl mx-auto">
        {/* 页面头部 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">岗位管理</h1>
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
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          <span>{post.members?.length || 0} 人</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleManageMembers(post)}
                            className="p-2 text-slate-600 hover:text-[#3182ce] hover:bg-[#3182ce]/5 rounded-lg transition-colors"
                            title="管理成员"
                          >
                            <UserPlus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleManagePermissions(post)}
                            className="p-2 text-slate-600 hover:text-[#10b981] hover:bg-[#10b981]/5 rounded-lg transition-colors"
                            title="配置权限"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          {!post.isSystem && (
                            <button
                              onClick={() => handleDeletePost(post.id, post.name)}
                              className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除岗位"
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

        {/* 创建岗位弹窗 */}
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setShowCreateModal(false)}
            />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-white/90">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-800">创建岗位</h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      岗位名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newPostName}
                      onChange={(e) => setNewPostName(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] focus:border-transparent"
                      placeholder="例如：产品经理、技术总监"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      岗位描述
                    </label>
                    <textarea
                      value={newPostDescription}
                      onChange={(e) => setNewPostDescription(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] focus:border-transparent resize-none"
                      rows={3}
                      placeholder="描述岗位的职责和要求"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      岗位颜色
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={newPostColor}
                        onChange={(e) => setNewPostColor(e.target.value)}
                        className="w-12 h-10 border border-slate-200 rounded-lg cursor-pointer"
                      />
                      <span className="text-sm text-slate-600">
                        用于区分不同岗位的标识色
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-semibold"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg hover:shadow-md transition-all font-semibold"
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 成员管理弹窗 */}
        {showMemberModal && selectedPost && (
          <MemberManagementModal
            post={selectedPost}
            workspaceId={currentWorkspaceId}
            onClose={() => setShowMemberModal(false)}
            onAssignMembers={handleAssignMembers}
            onRemoveMember={handleRemoveMember}
          />
        )}
      </div>
    </div>
  );
}

// 成员管理弹窗组件
function MemberManagementModal({
  post,
  workspaceId,
  onClose,
  onAssignMembers,
  onRemoveMember,
}: {
  post: Post;
  workspaceId: string | null;
  onClose: () => void;
  onAssignMembers: (userIds: string[]) => void;
  onRemoveMember: (userId: string) => void;
}) {
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAvailableUsers();
  }, []);

  const loadAvailableUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/users?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        // 过滤掉已经在岗位中的用户
        const memberIds = post.members?.map((m) => m.userId) || [];
        const available = data.users.filter(
          (user: User) => !memberIds.includes(user.id)
        );
        setAvailableUsers(available);
      }
    } catch (error) {
      console.error("Load users error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = () => {
    if (selectedUserIds.length > 0) {
      onAssignMembers(selectedUserIds);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-white/90 max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                管理岗位成员
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                岗位：{post.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* 当前成员 */}
          <div className="mb-6">
            <h4 className="text-sm font-bold text-slate-700 mb-3">
              当前成员 ({post.members?.length || 0})
            </h4>
            {post.members && post.members.length > 0 ? (
              <div className="space-y-2">
                {post.members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      {member.userAvatar ? (
                        <img
                          src={member.userAvatar}
                          alt={member.userName}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#3182ce] flex items-center justify-center text-white text-sm font-bold">
                          {member.userName[0]}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-bold text-slate-800">
                          {member.userName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {member.userEmail || member.userId}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => onRemoveMember(member.userId)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="移除成员"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p>暂无成员</p>
              </div>
            )}
          </div>

          {/* 添加成员 */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 mb-3">
              添加成员
            </h4>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-[#3182ce] border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : availableUsers.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableUsers.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg border border-slate-200 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUserIds([...selectedUserIds, user.id]);
                        } else {
                          setSelectedUserIds(
                            selectedUserIds.filter((id) => id !== user.id)
                          );
                        }
                      }}
                      className="w-4 h-4 text-[#3182ce] border-slate-300 rounded focus:ring-[#3182ce]"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold">
                          {user.name?.[0] || user.email?.[0] || "U"}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800">
                          {user.name || "未命名"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {user.email || user.phone || user.id}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <p>没有可添加的用户</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-white transition-colors font-semibold"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={selectedUserIds.length === 0}
              className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg hover:shadow-md transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              添加选中用户 ({selectedUserIds.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
