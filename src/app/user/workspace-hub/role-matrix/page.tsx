"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useToast } from "@/components/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  Users,
  Box,
  Check,
  X,
  Plus,
  Copy,
  Save,
  ChevronRight,
  Search,
  Filter,
} from "lucide-react";
import { COMPONENTS, COMPONENT_CATEGORIES, getComponentsByCategory, ComponentCategory } from "@/constants/components";
import { POST_PERMISSION_TEMPLATES, PostType } from "@/constants/roles";

interface WorkspacePost {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  color: string;
  isDefault: boolean;
  isSystem: boolean;
  createdBy: string;
  members?: any[];
  permissionCount?: number;
}

interface ComponentPermission {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExecute: boolean;
}

interface PermissionMatrix {
  [postId: string]: {
    [componentId: string]: ComponentPermission;
  };
}

interface MatrixData {
  posts: WorkspacePost[];
  components: typeof COMPONENTS;
  permissions: PermissionMatrix;
}

export default function RoleMatrixPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [newPostName, setNewPostName] = useState("");
  const [newPostDescription, setNewPostDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<PostType | "CUSTOM">("CUSTOM");

  const fetchMatrixData = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const response = await fetch(`/api/user/workspace-hub/posts?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("获取权限矩阵失败");
      }

      const data = await response.json();
      if (data.success) {
        setMatrixData(data.data);
        if (data.data.posts.length > 0) {
          setSelectedPostId(data.data.posts[0].id);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error("加载权限矩阵失败:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchMatrixData();
  }, [fetchMatrixData]);

  // 处理权限变更
  const handlePermissionChange = useCallback(
    (componentId: string, permissionType: keyof ComponentPermission, value: boolean) => {
      if (!selectedPostId || !matrixData) return;

      setMatrixData((prev) => {
        if (!prev) return null;

        return {
          ...prev,
          permissions: {
            ...prev.permissions,
            [selectedPostId]: {
              ...prev.permissions[selectedPostId],
              [componentId]: {
                ...prev.permissions[selectedPostId]?.[componentId],
                [permissionType]: value,
              },
            },
          },
        };
      });
    },
    [selectedPostId, matrixData]
  );

  // 批量设置阶段权限
  const handleCategoryPermissions = useCallback(
    (category: ComponentCategory, permissionType: keyof ComponentPermission, value: boolean) => {
      if (!selectedPostId || !matrixData) return;

      const categoryComponents = getComponentsByCategory(category);
      const componentIds = categoryComponents.map((c) => c.id);

      setMatrixData((prev) => {
        if (!prev) return null;

        const newPermissions = { ...prev.permissions[selectedPostId] };

        componentIds.forEach((componentId) => {
          newPermissions[componentId] = {
            ...newPermissions[componentId],
            [permissionType]: value,
          };
        });

        return {
          ...prev,
          permissions: {
            ...prev.permissions,
            [selectedPostId]: newPermissions,
          },
        };
      });
    },
    [selectedPostId, matrixData]
  );

  // 复制岗位权限
  const handleCopyPermissions = useCallback(async () => {
    if (!selectedPostId || !matrixData) return;

    const permissionsToCopy = matrixData.permissions[selectedPostId];
    if (!permissionsToCopy) return;

    // 将权限数据复制到剪贴板
    const dataToCopy = JSON.stringify(permissionsToCopy, null, 2);
    await navigator.clipboard.writeText(dataToCopy);

    // 显示提示
    toast.success("权限配置已复制到剪贴板，可在其他岗位粘贴使用");
  }, [selectedPostId, matrixData]);

  // 保存权限配置
  const handleSavePermissions = useCallback(async () => {
    if (!selectedPostId || !matrixData) return;

    setSaving(true);
    try {
      const permissions = matrixData.components.map((component) => ({
        componentId: component.id,
        ...matrixData.permissions[selectedPostId]?.[component.id],
      }));

      const response = await fetch(`/api/user/workspace-hub/posts/${selectedPostId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          postId: selectedPostId,
          permissions,
        }),
      });

      if (!response.ok) {
        throw new Error("保存权限配置失败");
      }

      const data = await response.json();
      if (data.success) {
        toast.success("权限配置已保存");
        fetchMatrixData();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast.error(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }, [selectedPostId, matrixData, fetchMatrixData]);

  // 创建新岗位
  const handleCreatePost = useCallback(async () => {
    if (!workspaceId || !newPostName.trim()) return;

    try {
      const templatePermissions = selectedTemplate !== "CUSTOM" ? POST_PERMISSION_TEMPLATES[selectedTemplate] : {};

      const response = await fetch("/api/user/workspace-hub/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          workspaceId,
          name: newPostName,
          description: newPostDescription,
          templatePermissions,
        }),
      });

      if (!response.ok) {
        throw new Error("创建岗位失败");
      }

      const data = await response.json();
      if (data.success) {
        toast.success("岗位创建成功");
        setShowCreatePostModal(false);
        setNewPostName("");
        setNewPostDescription("");
        setSelectedTemplate("CUSTOM");
        fetchMatrixData();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast.error(`创建失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }, [workspaceId, newPostName, newPostDescription, selectedTemplate, fetchMatrixData]);

  // 过滤组件
  const filteredComponents = useMemo(() => {
    let filtered = COMPONENTS;

    // 按分类过滤
    if (selectedCategory !== "ALL") {
      filtered = filtered.filter((c) => c.category === selectedCategory);
    }

    // 按搜索词过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.id.toLowerCase().includes(term) ||
          c.name.toLowerCase().includes(term) ||
          c.description.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [selectedCategory, searchTerm]);

  // 获取当前岗位的权限配置
  const currentPermissions = useMemo(() => {
    if (!selectedPostId || !matrixData) return {};
    return matrixData.permissions[selectedPostId] || {};
  }, [selectedPostId, matrixData]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
          <span className="text-sm font-medium text-slate-500">加载权限矩阵中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/50">
      {/* 顶部导航栏 */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 sticky top-16 z-40">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => router.push("/user/workspace-hub")}
                className="text-slate-500 hover:text-[#3182ce] font-medium transition-colors"
              >
                空间中枢
              </button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button
                onClick={() => router.push(`/user/workspaces?workspaceId=${workspaceId}`)}
                className="text-slate-500 hover:text-[#3182ce] font-medium transition-colors"
              >
                企业管理
              </button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <span className="text-slate-800 font-bold">岗位权限矩阵</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyPermissions}
                className="zg-btn zg-btn-default px-4 py-2 text-sm"
              >
                <Copy className="w-4 h-4 mr-2" />
                复制权限
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={saving}
                className="zg-btn zg-btn-primary px-4 py-2 text-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "保存中..." : "保存配置"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* 左侧岗位列表 */}
        <div className="w-64 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">岗位列表</h3>
              <button
                onClick={() => setShowCreatePostModal(true)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                title="创建新岗位"
              >
                <Plus className="w-4 h-4 text-[#3182ce]" />
              </button>
            </div>
          </div>

          <div className="p-2 space-y-1">
            {matrixData?.posts.map((post) => (
              <button
                key={post.id}
                onClick={() => setSelectedPostId(post.id)}
                className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                  selectedPostId === post.id
                    ? "bg-[#3182ce]/10 border border-[#3182ce]/30 shadow-sm"
                    : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: post.color }}
                  />
                  <span className="font-bold text-sm text-slate-800 truncate">
                    {post.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Users className="w-3 h-3" />
                  <span>{post.members?.length || 0} 人</span>
                  <span className="ml-auto">{post.permissionCount || 0} 权限</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 右侧权限矩阵表 */}
        <div className="flex-1 bg-white overflow-hidden flex flex-col">
          {/* 工具栏 */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索组件..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                >
                  <option value="ALL">全部分类</option>
                  {(Object.keys(COMPONENT_CATEGORIES) as ComponentCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {COMPONENT_CATEGORIES[cat].name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 矩阵表格 */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="bg-slate-50/80 sticky top-0 z-10">
                <tr>
                  <th className="w-32 px-4 py-3 text-left text-xs font-bold text-slate-600 border-b border-slate-200 sticky left-0 bg-slate-50/80">
                    组件
                  </th>
                  <th className="w-20 px-4 py-3 text-center text-xs font-bold text-slate-600 border-b border-slate-200">
                    查看
                  </th>
                  <th className="w-20 px-4 py-3 text-center text-xs font-bold text-slate-600 border-b border-slate-200">
                    编辑
                  </th>
                  <th className="w-20 px-4 py-3 text-center text-xs font-bold text-slate-600 border-b border-slate-200">
                    删除
                  </th>
                  <th className="w-20 px-4 py-3 text-center text-xs font-bold text-slate-600 border-b border-slate-200">
                    执行
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredComponents.map((component, index) => {
                  const perm = currentPermissions[component.id];
                  const isEven = index % 2 === 0;

                  return (
                    <tr
                      key={component.id}
                      className={`hover:bg-slate-50/80 transition-colors ${isEven ? "bg-white" : "bg-slate-50/30"}`}
                    >
                      <td className="px-4 py-3 border-b border-slate-100 sticky left-0 bg-inherit">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{component.icon}</span>
                          <div>
                            <div className="text-sm font-bold text-slate-800">{component.name}</div>
                            <div className="text-xs text-slate-500">{component.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center">
                        <input
                          type="checkbox"
                          checked={perm?.canView || false}
                          onChange={(e) =>
                            handlePermissionChange(component.id, "canView", e.target.checked)
                          }
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/20"
                        />
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center">
                        <input
                          type="checkbox"
                          checked={perm?.canEdit || false}
                          onChange={(e) =>
                            handlePermissionChange(component.id, "canEdit", e.target.checked)
                          }
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/20"
                        />
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center">
                        <input
                          type="checkbox"
                          checked={perm?.canDelete || false}
                          onChange={(e) =>
                            handlePermissionChange(component.id, "canDelete", e.target.checked)
                          }
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/20"
                        />
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-center">
                        <input
                          type="checkbox"
                          checked={perm?.canExecute || false}
                          onChange={(e) =>
                            handlePermissionChange(component.id, "canExecute", e.target.checked)
                          }
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/20"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 创建岗位弹窗 */}
      {showCreatePostModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">创建新岗位</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  岗位名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPostName}
                  onChange={(e) => setNewPostName(e.target.value)}
                  placeholder="如：售前专家、测试经理"
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  岗位描述
                </label>
                <textarea
                  value={newPostDescription}
                  onChange={(e) => setNewPostDescription(e.target.value)}
                  placeholder="描述该岗位的职责和权限范围..."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  权限模板
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as PostType | "CUSTOM")}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                >
                  <option value="CUSTOM">自定义（空白模板）</option>
                  <option value="SALES_EXPERT">售前专家</option>
                  <option value="QA_MANAGER">测试经理</option>
                  <option value="TECH_LEAD">技术负责人</option>
                  <option value="PRODUCT_MANAGER">产品经理</option>
                  <option value="DEVOPS_ENGINEER">运维工程师</option>
                  <option value="SECURITY_EXPERT">安全专家</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreatePostModal(false);
                  setNewPostName("");
                  setNewPostDescription("");
                  setSelectedTemplate("CUSTOM");
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreatePost}
                disabled={!newPostName.trim()}
                className="flex-1 py-2.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建岗位
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
