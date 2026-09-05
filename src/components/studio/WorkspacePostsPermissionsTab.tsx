"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, ShieldCheck, Check, Lock, Save, Download, Crown, Users, RefreshCw, AlertTriangle, RotateCcw, AlertCircle, ArrowUp, ArrowDown, GripVertical, Eye, Sparkles, CheckCircle2, Globe } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { PostIcon, POST_ICON_MAP, DEFAULT_POST_ICON, isValidPostIcon } from "./PostIcon";
import { StandardPostDetailModal } from "./StandardPostDetailModal";

// 单个空间岗位（workspacepost）
interface WorkspacePostItem {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string | null;
  isDefault: boolean;
  isSystem: boolean;
  permissionCount: number;
  memberCount: number;
}

// 官方标准岗位库条目（platformstandardpost）
interface StandardPostItem {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon: string | null;
  status: string;
  sortOrder?: number;
  usageCount?: number;
  totalAssignedMembers?: number;
  usedWorkspaces?: Array<{ id: string; name: string; type?: string; memberCount: number }>;
  isWorkspaceDefault?: boolean;
  isSystemReserved?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface CompRow {
  id: string;
  name: string;
  description: string;
}

// 平台岗位商务图标库条目（posticonlibrary）
interface PostIconLibraryItem {
  iconKey: string;
  name: string;
  category: string;
}

interface WorkspacePostsPermissionsTabProps {
  workspaceId: string;
  /** 当前空间真实装配（空间枢纽绑定）的组件 ID，矩阵只在这些组件范围内授权 */
  boundComponentIds?: string[];
}

const COLOR_PALETTE = ["#3182ce", "#6b46c1", "#dd6b20", "#2f855a", "#d53f8c", "#0e7490", "#ca8a04", "#c53030"];

export default function WorkspacePostsPermissionsTab({
  workspaceId,
  boundComponentIds = [],
}: WorkspacePostsPermissionsTabProps) {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posts, setPosts] = useState<WorkspacePostItem[]>([]);
  // 岗位 id -> 已勾选授权的组件 ID 列表（本地编辑态）
  const [matrix, setMatrix] = useState<Record<string, string[]>>({});
  // 岗位 id -> 已保存至数据库的授权组件 ID 列表（基准状态）
  const [savedMatrix, setSavedMatrix] = useState<Record<string, string[]>>({});
  const [allComps, setAllComps] = useState<CompRow[]>([]);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const pendingActiveIdRef = useRef<string | null>(null);

  // 左侧岗位列表分页/搜索
  const [posCurrentPage, setPosCurrentPage] = useState(1);
  const [searchPosQuery, setSearchPosQuery] = useState("");
  // 右侧组件分页/搜索
  const [compCurrentPage, setCompCurrentPage] = useState(1);
  const [compSearchQuery, setCompSearchQuery] = useState("");

  // 添加岗位（系统库）Modal
  const [showAddStandardModal, setShowAddStandardModal] = useState(false);
  const [loadingStandard, setLoadingStandard] = useState(false);
  const [standardPosts, setStandardPosts] = useState<StandardPostItem[]>([]);
  const [standardQuery, setStandardQuery] = useState("");
  const [addingPostId, setAddingPostId] = useState<string | null>(null);
  const [selectedStandardIds, setSelectedStandardIds] = useState<string[]>([]);
  const [batchAdding, setBatchAdding] = useState(false);
  // 查看官方标准岗位全息详情 Modal 状态
  const [viewingStandardPost, setViewingStandardPost] = useState<StandardPostItem | null>(null);

  // 平台岗位商务图标库（来自数据库 posticonlibrary）
  const [iconLibrary, setIconLibrary] = useState<PostIconLibraryItem[]>([]);
  const [iconLibraryLoading, setIconLibraryLoading] = useState(true);

  // 新建自定义岗位 Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPosName, setNewPosName] = useState("");
  const [newPosCode, setNewPosCode] = useState("");
  const [newPosIcon, setNewPosIcon] = useState("");
  const [newPosDesc, setNewPosDesc] = useState("");
  // 同步至系统岗位库确认 二次确认 Modal
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState(false);

  // 移除确认 Modal
  const [postToRemove, setPostToRemove] = useState<WorkspacePostItem | null>(null);
  const [removing, setRemoving] = useState(false);

  // 客户端挂载标记（确保 createPortal 仅在浏览器端运行）
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 岗位列表拖拽与排序状态
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverPostId, setDragOverPostId] = useState<string | null>(null);

  // ========== 数据加载 ==========
  const loadPosts = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/workspace-hub/posts?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || `岗位数据加载失败（HTTP ${res.status}）`);
        return;
      }
      const rawPosts: any[] = data.data?.posts || [];
      const permMap: Record<string, Record<string, any>> = data.data?.permissions || {};
      const catalogComps: any[] = data.data?.components || [];

      const nextPosts: WorkspacePostItem[] = rawPosts.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || "",
        color: p.color || "#3182ce",
        icon: p.icon || null,
        isDefault: Boolean(p.isDefault),
        isSystem: Boolean(p.isSystem),
        permissionCount: p.permissionCount || 0,
        memberCount: Array.isArray(p.members) ? p.members.length : 0,
      }));

      // 组件目录以空间枢纽真实装配为基准，缺少元数据的组件直接以 ID 展示
      const catMap = new Map<string, CompRow>();
      (catalogComps || []).forEach((c) =>
        catMap.set(c.id, { id: c.id, name: c.name || c.id, description: c.description || "" })
      );
      let rowIds: string[] = [];
      if (boundComponentIds && boundComponentIds.length > 0) {
        // 保留空间装配顺序，目录中缺失元数据的组件仍以 ID 展示
        const seen = new Set<string>();
        boundComponentIds.forEach((id) => {
          const clean = (id || "").trim();
          if (clean && !seen.has(clean)) {
            seen.add(clean);
            rowIds.push(clean);
          }
        });
        // 目录中但未装配的组件不参与授权勾选（避免误配无意义权限）
      } else {
        rowIds = Array.from(catMap.keys());
      }
      const rows: CompRow[] = rowIds.map((id) => {
        const meta = catMap.get(id);
        return meta || { id, name: id, description: "" };
      });

      const nextMatrix: Record<string, string[]> = {};
      nextPosts.forEach((p) => {
        const pm = permMap[p.id] || {};
        nextMatrix[p.id] = Object.entries(pm)
          .filter(([, v]: [string, any]) => v?.canView || v?.canExecute)
          .map(([cid]) => cid);
      });

      setPosts(nextPosts);
      setAllComps(rows);
      setMatrix(nextMatrix);
      setSavedMatrix(JSON.parse(JSON.stringify(nextMatrix)));
      const ownerPost = nextPosts.find((p) => p.isSystem);
      const targetId = pendingActiveIdRef.current || ownerPost?.id || nextPosts[0]?.id || null;
      pendingActiveIdRef.current = null;
      setActivePostId((prev) => (prev && nextPosts.some((p) => p.id === prev) ? prev : targetId));
      setPosCurrentPage(1);
      setCompCurrentPage(1);
    } catch (err) {
      console.error("加载空间岗位失败", err);
      toast.error("加载空间岗位失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, boundComponentIds, toast]);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPosts]);

  // 岗位图标库（posticonlibrary）挂载即查询，供岗位图标展示与选择使用
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/user/workspace-hub/post-icons", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: "include",
        });
        const data = await res.json();
        if (alive && res.ok && data.success) {
          setIconLibrary(Array.isArray(data.icons) ? data.icons : []);
        }
      } catch (err) {
        console.error("加载岗位图标库失败", err);
      } finally {
        if (alive) setIconLibraryLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setCompCurrentPage(1);
  }, [activePostId, compSearchQuery]);

  // ========== 派生数据 ==========
  const filteredPositions = useMemo(() => {
    if (!searchPosQuery.trim()) return posts;
    const q = searchPosQuery.toLowerCase();
    return posts.filter((p) => p.name.toLowerCase().includes(q));
  }, [posts, searchPosQuery]);

  const totalPosPages = Math.ceil(filteredPositions.length / 10) || 1;
  const paginatedPositions = useMemo(() => {
    const start = (posCurrentPage - 1) * 10;
    return filteredPositions.slice(start, start + 10);
  }, [filteredPositions, posCurrentPage]);

  const activePost = useMemo(() => posts.find((p) => p.id === activePostId) || null, [posts, activePostId]);

  const isLockedPost = Boolean(activePost?.isSystem); // 空间所有者：系统锁定 + 全量授权

  const filteredComps = useMemo(() => {
    if (!compSearchQuery.trim()) return allComps;
    const q = compSearchQuery.toLowerCase();
    return allComps.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
  }, [allComps, compSearchQuery]);

  const totalCompPages = Math.ceil(filteredComps.length / 10) || 1;
  const paginatedComps = useMemo(() => {
    const start = (compCurrentPage - 1) * 10;
    return filteredComps.slice(start, start + 10);
  }, [filteredComps, compCurrentPage]);

  const activeAllowedIds = useMemo(() => (activePost && !isLockedPost ? matrix[activePost.id] || [] : allComps.map((c) => c.id)), [activePost, isLockedPost, matrix, allComps]);
  const allowedCount = isLockedPost || !activePost ? allComps.length : activeAllowedIds.length;
  const allowRate = allComps.length > 0 ? Math.round((allowedCount / allComps.length) * 100) : 100;

  const membersByPost = useMemo(() => {
    const map: Record<string, number> = {};
    posts.forEach((p) => (map[p.id] = p.memberCount));
    return map;
  }, [posts]);

  // 动态读取每个岗位当前的已授权组件数量（响应本地 matrix 编辑态与系统锁定态，实现毫秒级实时联动）
  const getPostPermissionCount = useCallback(
    (p: WorkspacePostItem) => {
      if (p.isSystem) return allComps.length;
      if (matrix[p.id] !== undefined) {
        return matrix[p.id].length;
      }
      return p.permissionCount || 0;
    },
    [allComps.length, matrix]
  );

  // 从数据库图标库挑选当前空间尚未使用的一个商务图标（避免岗位图标重复）
  const pickDefaultPostIcon = useCallback(() => {
    const used = new Set(posts.map((p) => p.icon).filter((v): v is string => !!v));
    const candidate = iconLibrary.find((i) => !used.has(i.iconKey) && i.iconKey in POST_ICON_MAP);
    return candidate?.iconKey || DEFAULT_POST_ICON;
  }, [posts, iconLibrary]);

  // ========== 未保存变更检测与安全拦截机制 ==========
  const hasUnsavedChanges = useMemo(() => {
    return posts.some((p) => {
      if (p.isSystem) return false;
      const cur = (matrix[p.id] || []).slice().sort();
      const saved = (savedMatrix[p.id] || []).slice().sort();
      if (cur.length !== saved.length) return true;
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] !== saved[i]) return true;
      }
      return false;
    });
  }, [posts, matrix, savedMatrix]);

  const unsavedPostsCount = useMemo(() => {
    let count = 0;
    posts.forEach((p) => {
      if (p.isSystem) return;
      const cur = (matrix[p.id] || []).slice().sort();
      const saved = (savedMatrix[p.id] || []).slice().sort();
      if (cur.length !== saved.length || cur.some((id, i) => id !== saved[i])) {
        count++;
      }
    });
    return count;
  }, [posts, matrix, savedMatrix]);

  const isCurrentPostModified = useMemo(() => {
    if (!activePost || activePost.isSystem) return false;
    const cur = (matrix[activePost.id] || []).slice().sort();
    const saved = (savedMatrix[activePost.id] || []).slice().sort();
    if (cur.length !== saved.length) return true;
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] !== saved[i]) return true;
    }
    return false;
  }, [activePost, matrix, savedMatrix]);

  // 浏览器窗口/标签页刷新或关闭拦截防丢
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "检测到有尚未保存的岗位组件权限配置，离开或刷新页面后修改将丢失，确认离开吗？";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // 放弃未保存修改并还原至最近保存版本
  const handleDiscardChanges = () => {
    setMatrix(JSON.parse(JSON.stringify(savedMatrix)));
    toast.info("已放弃本次所有未保存的权限变动，已恢复至最新保存状态");
  };

  // ========== 授权勾选 ==========
  const toggleComp = (compId: string) => {
    if (!activePost || isLockedPost) return;
    const current = matrix[activePost.id] || [];
    const nextIds = current.includes(compId) ? current.filter((id) => id !== compId) : [...current, compId];
    setMatrix((prev) => ({ ...prev, [activePost.id]: nextIds }));
  };

  const selectAllFiltered = () => {
    if (!activePost || isLockedPost) return;
    const ids = filteredComps.map((c) => c.id);
    setMatrix((prev) => ({ ...prev, [activePost.id]: Array.from(new Set([...(prev[activePost.id] || []), ...ids])) }));
    toast.success("已开启当前筛选组件的授权");
  };

  const clearAllFiltered = () => {
    if (!activePost || isLockedPost) return;
    const ids = new Set(filteredComps.map((c) => c.id));
    setMatrix((prev) => ({ ...prev, [activePost.id]: (prev[activePost.id] || []).filter((id) => !ids.has(id)) }));
    toast.success("已取消当前筛选组件的授权");
  };

  // ========== 保存授权矩阵 ==========
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      const permissionMatrix: Record<string, string[]> = {};
      posts.forEach((p) => {
        if (p.isSystem) return; // 空间所有者全量特权，不参与勾选覆盖
        permissionMatrix[p.id] = matrix[p.id] || [];
      });
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        body: JSON.stringify({ workspaceId, permissionMatrix }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "权限配置已成功保存至数据库！");
        setSavedMatrix(JSON.parse(JSON.stringify(matrix)));
        await loadPosts();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("workspace-permissions-updated", { detail: { workspaceId } }));
        }
      } else {
        toast.error(data.error || "保存失败，请重试");
      }
    } catch (err) {
      console.error("保存授权矩阵失败", err);
      toast.error("网络异常，保存权限失败");
    } finally {
      setSaving(false);
    }
  };

  // ========== 岗位列表排序与持久化 ==========
  const persistPostsOrder = async (orderedList: WorkspacePostItem[]) => {
    try {
      const orderedPostIds = orderedList.map((p) => p.id);
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          orderedPostIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "保存岗位排序失败");
        await loadPosts();
      }
    } catch (err) {
      console.error("保存岗位排序失败", err);
      toast.error("网络异常，保存岗位排序失败");
      await loadPosts();
    }
  };

  const handleMovePostUp = async (postId: string) => {
    const currentIndex = posts.findIndex((p) => p.id === postId);
    // 前两名（空间所有者与空间管理员）固定不动，第 3 名（index === 2）不能再向上移动
    if (currentIndex <= 2) return;
    const targetIndex = currentIndex - 1;
    const nextPosts = [...posts];
    const [moved] = nextPosts.splice(currentIndex, 1);
    nextPosts.splice(targetIndex, 0, moved);
    setPosts(nextPosts);
    await persistPostsOrder(nextPosts);
  };

  const handleMovePostDown = async (postId: string) => {
    const currentIndex = posts.findIndex((p) => p.id === postId);
    // 前两名固定不动，最后一名不能再向下移动
    if (currentIndex < 2 || currentIndex >= posts.length - 1) return;
    const targetIndex = currentIndex + 1;
    const nextPosts = [...posts];
    const [moved] = nextPosts.splice(currentIndex, 1);
    nextPosts.splice(targetIndex, 0, moved);
    setPosts(nextPosts);
    await persistPostsOrder(nextPosts);
  };

  const handleDragStart = (e: React.DragEvent, postId: string) => {
    const post = posts.find((p) => p.id === postId);
    const isFixed = Boolean(post?.isSystem || post?.name === "空间所有者" || post?.name === "空间管理员");
    if (isFixed) {
      e.preventDefault();
      return;
    }
    setDraggingPostId(postId);
    e.dataTransfer.setData("text/plain", postId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, postId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverPostId !== postId) {
      setDragOverPostId(postId);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetPostId: string) => {
    e.preventDefault();
    setDragOverPostId(null);
    const sourceId = draggingPostId || e.dataTransfer.getData("text/plain");
    setDraggingPostId(null);
    if (!sourceId || sourceId === targetPostId) return;

    const sourceIndex = posts.findIndex((p) => p.id === sourceId);
    if (sourceIndex < 2) return; // 空间所有者和空间管理员固定不动，不参与拖拽排序

    const targetIndex = posts.findIndex((p) => p.id === targetPostId);
    if (targetIndex === -1) return;

    // 若拖拽到前两位固定岗位区域，自动吸附在空间管理员之后的第 3 位（index === 2）
    const effectiveTargetIndex = Math.max(2, targetIndex);

    const nextPosts = [...posts];
    const [moved] = nextPosts.splice(sourceIndex, 1);
    nextPosts.splice(effectiveTargetIndex, 0, moved);

    setPosts(nextPosts);
    await persistPostsOrder(nextPosts);
  };

  const handleDragEnd = () => {
    setDraggingPostId(null);
    setDragOverPostId(null);
  };

  // ========== 从系统官方岗位库添加 ==========
  const openAddStandardModal = async () => {
    setShowAddStandardModal(true);
    setStandardQuery("");
    setLoadingStandard(true);
    try {
      const res = await fetch("/api/admin/posts/standard", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "加载官方岗位库失败");
        setStandardPosts([]);
        return;
      }
      const raw: any[] = data.posts || [];
      const existingNames = new Set(posts.map((p) => p.name.trim().toLowerCase()));
      const list: StandardPostItem[] = raw
        .filter((p) => p.status !== "DISABLED" && !p.isSystemReserved && !existingNames.has((p.name || "").trim().toLowerCase()))
        .map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          description: p.description || "",
          color: p.color || "#3182ce",
          icon: p.icon || null,
          status: p.status,
          sortOrder: p.sortOrder || 1,
          usageCount: p.usageCount || 0,
          totalAssignedMembers: p.totalAssignedMembers || 0,
          usedWorkspaces: p.usedWorkspaces || [],
          isWorkspaceDefault: Boolean(p.isWorkspaceDefault),
          isSystemReserved: Boolean(p.isSystemReserved),
          createdAt: p.createdAt || "",
          updatedAt: p.updatedAt || "",
        }));
      setStandardPosts(list);
    } catch (err) {
      console.error("加载官方岗位库失败", err);
      toast.error("网络异常，无法获取系统标准岗位库");
      setStandardPosts([]);
    } finally {
      setLoadingStandard(false);
    }
  };

  const addStandardPost = async (item: StandardPostItem) => {
    setAddingPostId(item.id);
    try {
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          name: item.name,
          code: item.code,
          description: item.description,
          color: item.color,
          icon: item.icon || undefined,
          syncToSystem: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`官方岗位【${item.name}】已成功引入当前企业空间！`);
        await loadPosts();
        setStandardPosts((prev) => prev.filter((p) => p.id !== item.id));
        // 单个添加成功后自动关闭弹窗闭环
        setShowAddStandardModal(false);
        setSelectedStandardIds([]);
      } else {
        toast.error(data.error || "引入岗位失败");
      }
    } catch (err) {
      console.error("引入官方岗位失败", err);
      toast.error("网络异常，引入岗位失败");
    } finally {
      setAddingPostId(null);
    }
  };

  // 切换单项选择
  const toggleSelectStandard = (id: string) => {
    setSelectedStandardIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 批量引入已勾选的标准岗位
  const handleBatchAddStandards = async () => {
    if (selectedStandardIds.length === 0) {
      toast.warning("请先勾选需要引入的官方标准岗位");
      return;
    }
    const targetItems = standardPosts.filter((p) => selectedStandardIds.includes(p.id));
    if (targetItems.length === 0) return;

    setBatchAdding(true);
    try {
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          items: targetItems.map((item) => ({
            name: item.name,
            code: item.code,
            description: item.description,
            color: item.color,
            icon: item.icon || undefined,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const addedCount = data.data?.count || targetItems.length;
        toast.success(`已成功批量引入 ${addedCount} 个官方标准岗位到当前企业空间！`);
        await loadPosts();
        setStandardPosts((prev) => prev.filter((p) => !selectedStandardIds.includes(p.id)));
        // 批量引入成功后自动关闭弹窗闭环
        setShowAddStandardModal(false);
        setSelectedStandardIds([]);
      } else {
        toast.error(data.error || "批量引入岗位失败");
      }
    } catch (err) {
      console.error("批量引入官方岗位失败", err);
      toast.error("网络异常，批量引入岗位失败");
    } finally {
      setBatchAdding(false);
    }
  };

  const filteredStandards = useMemo(() => {
    if (!standardQuery.trim()) return standardPosts;
    const q = standardQuery.toLowerCase();
    return standardPosts.filter((p) => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
  }, [standardPosts, standardQuery]);

  // ========== 新建自定义岗位流程 ==========
  // 第一步：点击【保存并下一步】
  const handlePreCreatePosition = () => {
    if (!newPosName.trim()) {
      toast.warning("请输入自定义岗位名称");
      return;
    }
    if (!newPosCode.trim()) {
      toast.warning("请输入岗位标识/代号（大写英文标识，如 QUANT_STRATEGIST）");
      return;
    }
    setShowCreateModal(false);
    setShowSyncConfirmModal(true);
  };

  // 第二步：二次确认（选择是否同步至全平台系统标准岗位集合）
  const handleConfirmCreatePosition = async (syncToSystem: boolean) => {
    try {
      setSaving(true);
      const res = await fetch("/api/user/workspace-hub/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          name: newPosName.trim(),
          code: newPosCode.trim().toUpperCase(),
          description: newPosDesc.trim(),
          color: COLOR_PALETTE[posts.length % COLOR_PALETTE.length],
          icon: isValidPostIcon(newPosIcon) ? newPosIcon : DEFAULT_POST_ICON,
          syncToSystem,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (syncToSystem) {
          toast.success(`自定义岗位「${newPosName.trim()}」创建成功，并已同步提报至全平台官方标准岗位审核池等待超管审核！`);
        } else {
          toast.success(`自定义岗位「${newPosName.trim()}」创建成功（仅在当前企业空间自治使用）`);
        }
        if (data.data?.id) pendingActiveIdRef.current = data.data.id;
        setShowSyncConfirmModal(false);
        setNewPosName("");
        setNewPosCode("");
        setNewPosDesc("");
        setNewPosIcon("");
        await loadPosts();
      } else {
        toast.error(data.error || "创建岗位失败");
      }
    } catch (err) {
      console.error("创建自定义岗位失败", err);
      toast.error("网络异常，创建岗位失败");
    } finally {
      setSaving(false);
    }
  };

  // ========== 移除岗位 ==========
  const requestRemovePost = (post: WorkspacePostItem) => {
    if (post.isSystem || post.name.trim() === "空间所有者") {
      toast.error("【空间所有者】为空间最高权限根基岗位，系统强制锁定，不可移除！");
      return;
    }
    setPostToRemove(post);
  };

  const confirmRemovePost = async () => {
    if (!postToRemove) return;
    setRemoving(true);
    try {
      // 先清空该岗位已勾选的组件权限（满足后端“零权限方可移除”门禁），再执行删除
      const localPerms = (matrix[postToRemove.id] || []).length;
      if (localPerms > 0) {
        await fetch("/api/user/workspace-hub/posts", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          credentials: "include",
          body: JSON.stringify({ workspaceId, permissionMatrix: { [postToRemove.id]: [] } }),
        });
      }
      const res = await fetch(
        `/api/user/workspace-hub/posts/${encodeURIComponent(postToRemove.id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: "include",
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || `岗位【${postToRemove.name}】已从企业空间移除`);
        setPostToRemove(null);
        await loadPosts();
      } else {
        toast.error(data.error || "移除岗位失败");
      }
    } catch (err) {
      console.error("移除岗位失败", err);
      toast.error("网络异常，移除岗位失败");
    } finally {
      setRemoving(false);
    }
  };

  // ========== 渲染 ==========
  return (
    <div className="space-y-6 text-left font-sans">
      {/* 顶部 Header 与功能介绍 */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-[#3182ce] shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              企业空间岗位与组件授权配置中心
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              新企业空间默认装配 空间所有者 / 空间管理员 / 空间审计员 三个基石岗位；其余岗位通过「添加岗位 (系统库)」从全平台官方岗位库引入，也可随时移除或新建。
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={openAddStandardModal}
            className="px-3 py-1.5 bg-gradient-to-r from-[#6b46c1] to-[#805ad5] text-white text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>添加岗位 (系统库)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setNewPosName("");
              setNewPosCode("");
              setNewPosDesc("");
              setNewPosIcon(pickDefaultPostIcon());
              setShowCreateModal(true);
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>新建自定义岗位</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className={`px-3.5 py-1.5 text-white text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 relative ${
              hasUnsavedChanges
                ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] ring-2 ring-amber-400 ring-offset-1 shadow-md shadow-blue-500/25 hover:shadow-lg"
                : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:shadow"
            }`}
            title={hasUnsavedChanges ? "检测到未保存变更，点击即可同步至数据库" : "保存当前权限配置"}
          >
            {hasUnsavedChanges && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border-2 border-white" />
              </span>
            )}
            <Save className="w-3.5 h-3.5" />
            <span>
              {saving
                ? "保存中..."
                : hasUnsavedChanges
                ? `保存权限配置 (${unsavedPostsCount} 处变更)`
                : "保存权限配置"}
            </span>
          </button>
        </div>
      </div>

      {/* 未保存变更强提醒横幅 (带呼吸灯与一键保存/还原保护) */}
      {hasUnsavedChanges && (
        <div className="bg-amber-50/95 border border-amber-300/90 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-amber-900 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  提示：当前有未保存的岗位组件授权变动！
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.2 bg-amber-200/80 text-amber-900 rounded">
                  {unsavedPostsCount} 个岗位受影响
                </span>
              </div>
              <p className="text-[11px] text-amber-800 font-medium mt-0.5 leading-normal">
                组件授权打勾修改目前仅在本地暂存，离开本页、切换页签或刷新浏览器后未保存的变动将丢失，请记得点击右上角<span className="font-bold underline ml-0.5">「保存权限配置」</span>同步云端。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-100/80 hover:bg-amber-200/90 border border-amber-300/80 rounded-lg cursor-pointer transition-all inline-flex items-center gap-1 hover:shadow-2xs"
              title="放弃本次编辑的所有未保存修改，恢复至最近一次已保存状态"
            >
              <RotateCcw className="w-3 h-3" />
              <span>放弃本次修改</span>
            </button>
          </div>
        </div>
      )}

      {/* 主体两栏布局：左侧岗位列表 + 右侧组件授权打勾矩阵 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* 左侧：岗位列表 */}
        <div className="md:col-span-5 bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs flex flex-col justify-between h-[640px]">
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  岗位列表 ({filteredPositions.length})
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">共 {posts.length} 个空间岗位</span>
              </div>
              <div className="relative w-full">
                <input
                  type="text"
                  value={searchPosQuery}
                  onChange={(e) => {
                    setSearchPosQuery(e.target.value);
                    setPosCurrentPage(1);
                  }}
                  placeholder="🔍 搜索岗位名称..."
                  className="w-full h-8 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-[#3182ce] outline-none font-medium transition-all"
                />
                {searchPosQuery && (
                  <button
                    onClick={() => setSearchPosQuery("")}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1 py-1">
              {loading ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">岗位数据加载中...</div>
              ) : paginatedPositions.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  当前空间暂无岗位，点击右上角「添加岗位 (系统库)」从官方岗位库引入。
                </div>
              ) : (
                paginatedPositions.map((post) => {
                  const isActive = post.id === activePostId;
                  const isOwner = post.isSystem;
                  const isFixed = Boolean(post.isSystem || post.name === "空间所有者" || post.name === "空间管理员");
                  const globalIndex = posts.findIndex((p) => p.id === post.id);
                  const canMoveUp = !isFixed && globalIndex > 2;
                  const canMoveDown = !isFixed && globalIndex >= 2 && globalIndex < posts.length - 1;
                  const isDragging = draggingPostId === post.id;
                  const isDragOver = dragOverPostId === post.id && !isDragging;

                  return (
                    <div
                      key={post.id}
                      draggable={!isFixed}
                      onDragStart={(e) => handleDragStart(e, post.id)}
                      onDragOver={(e) => handleDragOver(e, post.id)}
                      onDrop={(e) => handleDrop(e, post.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setActivePostId(post.id)}
                      className={`p-3 rounded-2xl border text-left cursor-pointer transition-all flex items-center justify-between gap-2.5 select-none ${
                        isDragging
                          ? "opacity-40 scale-[0.98] border-dashed border-slate-300"
                          : isDragOver
                          ? "border-2 border-dashed border-[#3182ce] bg-blue-50/50 shadow-sm"
                          : isActive
                          ? "bg-[#3182ce]/10 border-[#3182ce] shadow-md ring-2 ring-[#3182ce]/20"
                          : "bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {!isFixed ? (
                          <div
                            title="按住卡片或把手可上下拖动排序"
                            className="p-1 -ml-1 text-slate-300 hover:text-[#3182ce] cursor-grab active:cursor-grabbing rounded transition-colors shrink-0"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-2 shrink-0" />
                        )}
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 text-white shadow-sm"
                          style={{ backgroundColor: post.color || "#3182ce" }}
                        >
                          <PostIcon iconKey={post.icon} className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-slate-900 truncate">{post.name}</h4>
                            {isOwner && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 shrink-0 inline-flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" /> 系统锁定
                              </span>
                            )}
                            {!isOwner && post.isDefault && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded border bg-blue-50 text-[#3182ce] border-blue-200 shrink-0">
                                基石岗位
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-1">{post.description || "未填写岗位职责说明"}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-400">
                            {membersByPost[post.id] > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Users className="w-3 h-3" /> {membersByPost[post.id]} 人在编
                              </span>
                            )}
                            <span>已授 {getPostPermissionCount(post)} 项组件</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* 上下排序微调箭头按钮（空间所有者与空间管理员固定不显示） */}
                        {!isFixed && (
                          <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200/80 rounded-lg p-0.5 shadow-2xs">
                            <button
                              type="button"
                              disabled={!canMoveUp}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMovePostUp(post.id);
                              }}
                              title={canMoveUp ? "将此岗位上移一位" : "已在可排首位（不可超越空间管理员）"}
                              className={`p-1 rounded transition-colors ${
                                canMoveUp
                                  ? "text-slate-500 hover:text-[#3182ce] hover:bg-white cursor-pointer shadow-2xs"
                                  : "text-slate-300 cursor-not-allowed"
                              }`}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={!canMoveDown}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMovePostDown(post.id);
                              }}
                              title={canMoveDown ? "将此岗位下移一位" : "已在最末位"}
                              className={`p-1 rounded transition-colors ${
                                canMoveDown
                                  ? "text-slate-500 hover:text-[#3182ce] hover:bg-white cursor-pointer shadow-2xs"
                                  : "text-slate-300 cursor-not-allowed"
                              }`}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {!isOwner && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestRemovePost(post);
                            }}
                            title="从当前企业空间移除该岗位"
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 px-1 shrink-0 flex items-center justify-between h-9">
            <span className="text-[11px] text-slate-400 font-bold">
              第 {posCurrentPage} / {totalPosPages} 页 (共 {filteredPositions.length} 个岗位)
            </span>
            {totalPosPages > 1 ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={posCurrentPage === 1}
                  onClick={() => setPosCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  ◀ 上一页
                </button>
                <button
                  type="button"
                  disabled={posCurrentPage === totalPosPages}
                  onClick={() => setPosCurrentPage((p) => Math.min(totalPosPages, p + 1))}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  下一页 ▶
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-300 font-medium font-mono">1/1 单页全量</span>
            )}
          </div>
        </div>

        {/* 右侧：组件授权矩阵 */}
        <div className="md:col-span-7 bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs flex flex-col justify-between h-[640px]">
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="space-y-3 pb-3 border-b border-slate-100 shrink-0">
              {!activePost ? (
                <p className="text-xs text-slate-400 font-semibold py-6 text-center">请在左侧选择岗位以配置组件授权</p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 text-white shadow-sm"
                      style={{ backgroundColor: activePost.color || "#3182ce" }}
                    >
                      <PostIcon iconKey={activePost.icon} className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900 truncate">【{activePost.name}】组件授权配置</h4>
                        {isLockedPost && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0 inline-flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5" /> 系统锁定全量授权
                          </span>
                        )}
                        {!isLockedPost && isCurrentPostModified && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100/90 text-amber-800 border border-amber-300 shrink-0 inline-flex items-center gap-1 animate-pulse">
                            <AlertCircle className="w-2.5 h-2.5 text-amber-600" /> 本岗位有未保存改动
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                        {isLockedPost
                          ? "空间所有者默认拥有全部组件的最高使用权限，不可修改"
                          : isCurrentPostModified
                          ? "⚠️ 当前岗位已有改动（未保存），勾选调整后请务必点击上方「保存权限配置」同步云端"
                          : "勾选即可开启该岗位对应成员的使用权限，取消勾选即禁止使用"}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 block">权限开启覆盖率</span>
                    <span className="text-sm font-black font-mono text-[#3182ce]">
                      {allowRate}% <span className="text-[10px] font-normal text-slate-500">({allowedCount}/{allComps.length})</span>
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={compSearchQuery}
                    onChange={(e) => setCompSearchQuery(e.target.value)}
                    placeholder="🔍 搜索组件名称、ID 或功能描述..."
                    className="w-full h-8 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-[#3182ce] outline-none font-medium transition-all"
                  />
                  {compSearchQuery && (
                    <button
                      onClick={() => setCompSearchQuery("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {activePost && !isLockedPost && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      全选当前
                    </button>
                    <button
                      type="button"
                      onClick={clearAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-black bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      清空当前
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1 py-1">
              {loading ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">组件数据加载中...</div>
              ) : paginatedComps.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">未找到匹配的组件，请尝试更换搜索关键字。</div>
              ) : (
                paginatedComps.map((comp) => {
                  const isAllowed = isLockedPost || (matrix[activePost?.id || ""] || []).includes(comp.id);
                  return (
                    <div
                      key={comp.id}
                      onClick={() => !isLockedPost && toggleComp(comp.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isLockedPost
                          ? "bg-slate-50/50 border-slate-200/60 cursor-default opacity-90 select-none"
                          : isAllowed
                          ? "bg-emerald-50/50 border-emerald-200/80 hover:shadow-xs cursor-pointer"
                          : "bg-slate-50/70 border-slate-200/80 hover:bg-white hover:shadow-xs cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded font-mono font-black shrink-0">
                          {comp.id}
                        </span>
                        <div className="min-w-0">
                          <h5 className="font-bold text-xs text-slate-900 truncate">{comp.name}</h5>
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{comp.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isLockedPost ? (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-blue-50/90 text-[#3182ce] border border-blue-200/80 inline-flex items-center gap-1 shadow-2xs">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" /> 全量授权
                          </span>
                        ) : isAllowed ? (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-600 text-white shadow-2xs inline-flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> 🟢 已允许使用
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-200 text-slate-500 inline-flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" /> 🔒 暂无使用权限
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 px-1 shrink-0 flex items-center justify-between h-9">
            <span className="text-[11px] text-slate-400 font-bold">
              第 {compCurrentPage} / {totalCompPages} 页 (共 {filteredComps.length} 个组件，每页 10 条)
            </span>
            {totalCompPages > 1 ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={compCurrentPage === 1}
                  onClick={() => setCompCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  ◀ 上一页
                </button>
                <button
                  type="button"
                  disabled={compCurrentPage === totalCompPages}
                  onClick={() => setCompCurrentPage((p) => Math.min(totalCompPages, p + 1))}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  下一页 ▶
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-300 font-medium font-mono">1/1 单页全量</span>
            )}
          </div>
        </div>
      </div>

      {/* 添加岗位 (系统库) Modal (通过 createPortal 挂载至 document.body，彻底杜绝层叠上下文与截断问题) */}
      {mounted && typeof document !== "undefined" && showAddStandardModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 text-left overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddStandardModal(false);
          }}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl max-w-2xl w-full max-h-[min(86vh,660px)] p-5 text-left flex flex-col gap-3 overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 shrink-0">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Download className="w-5 h-5 text-[#6b46c1]" /> 从官方岗位库添加岗位
              </h4>
              <button
                type="button"
                onClick={() => setShowAddStandardModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium shrink-0">
              以下为全平台官方标准岗位库（已过滤系统保留岗位及当前空间已装配岗位），点击「添加」即可引入当前企业空间。
            </p>
            <div className="relative w-full shrink-0">
              <input
                type="text"
                value={standardQuery}
                onChange={(e) => setStandardQuery(e.target.value)}
                placeholder="🔍 搜索官方岗位名称或职责..."
                className="w-full h-8 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-[#6b46c1] outline-none font-medium transition-all"
              />
              {standardQuery && (
                <button
                  onClick={() => setStandardQuery("")}
                  className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 批量操作与统计控制条 */}
            <div className="flex items-center justify-between px-1 text-xs shrink-0 pt-0.5">
              <span className="text-slate-500 font-medium text-[11px]">
                共 <strong className="text-slate-700 font-bold">{filteredStandards.length}</strong> 个可选官方岗位
                {selectedStandardIds.length > 0 && (
                  <span className="ml-2 text-[#6b46c1] font-bold">
                    · 已勾选 {selectedStandardIds.length} 项
                  </span>
                )}
              </span>
              {filteredStandards.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const visibleIds = filteredStandards.map((item) => item.id);
                    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedStandardIds.includes(id));
                    if (allSelected) {
                      setSelectedStandardIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
                    } else {
                      setSelectedStandardIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
                    }
                  }}
                  className="text-xs font-bold text-[#6b46c1] hover:text-[#553c9a] hover:underline cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {filteredStandards.length > 0 && filteredStandards.every((item) => selectedStandardIds.includes(item.id))
                      ? "取消全选"
                      : "全选当前"}
                  </span>
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
              {loadingStandard ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 官方岗位库加载中...
                </div>
              ) : filteredStandards.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  没有可添加的官方岗位（已全部引入或搜索无结果）。
                </div>
              ) : (
                filteredStandards.map((item) => {
                  const isSelected = selectedStandardIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleSelectStandard(item.id)}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 cursor-pointer select-none ${
                        isSelected
                          ? "border-[#6b46c1] bg-purple-50/70 shadow-xs ring-1 ring-purple-300"
                          : "border-slate-200/80 bg-white hover:border-purple-200 hover:bg-slate-50/60 hover:shadow-xs"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* 复选勾选框 */}
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? "bg-[#6b46c1] border-[#6b46c1] text-white shadow-2xs"
                              : "border-slate-300 bg-white hover:border-[#6b46c1]"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 text-white shadow-sm"
                          style={{ backgroundColor: item.color || "#3182ce" }}
                        >
                          <PostIcon iconKey={item.icon} className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="font-extrabold text-sm text-slate-900 truncate">{item.name}</h5>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                              {item.code}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{item.description || "官方标准岗位"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* 岗位全息详情查看按钮（复用超管后台岗位详情组件） */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingStandardPost(item);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-purple-50 text-slate-600 hover:text-[#6b46c1] border border-slate-200 hover:border-purple-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                          title="查看该官方岗位的职责定位与全网装配全息详情"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#6b46c1]" />
                          <span>详情</span>
                        </button>

                        <button
                          type="button"
                          disabled={addingPostId === item.id || batchAdding}
                          onClick={(e) => {
                            e.stopPropagation();
                            addStandardPost(item);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#6b46c1] to-[#805ad5] text-white text-xs font-bold shadow-xs hover:shadow transition-all shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          title="单独引入该岗位并关闭弹窗"
                        >
                          {addingPostId === item.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          {addingPostId === item.id ? "添加中..." : "添加"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 弹窗底部操作区：单项/批量引入与取消闭环 */}
            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                {selectedStandardIds.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-[#6b46c1] animate-pulse" />
                    已勾选 <span className="text-[#6b46c1] font-black text-sm">{selectedStandardIds.length}</span> 个官方岗位
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">💡 可勾选多张卡片批量引入，或点击卡片右侧直接单项添加</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStandardModal(false);
                    setSelectedStandardIds([]);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={selectedStandardIds.length === 0 || batchAdding}
                  onClick={handleBatchAddStandards}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 ${
                    selectedStandardIds.length > 0 && !batchAdding
                      ? "bg-gradient-to-r from-[#6b46c1] to-[#805ad5] text-white shadow-md shadow-purple-500/25 hover:shadow-lg cursor-pointer active:scale-95"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {batchAdding ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {batchAdding
                      ? "正在引入..."
                      : selectedStandardIds.length > 0
                      ? `确认引入 (${selectedStandardIds.length})`
                      : "确认添加"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 官方标准岗位全息详情 Modal（100% 复用超管后台岗位详情组件，支持在此直接决定引入当前空间） */}
      {viewingStandardPost && (
        <StandardPostDetailModal
          post={viewingStandardPost as any}
          onClose={() => setViewingStandardPost(null)}
          onAdd={() => {
            const target = viewingStandardPost;
            setViewingStandardPost(null);
            addStandardPost(target);
          }}
          isAdding={addingPostId === viewingStandardPost.id}
        />
      )}

      {/* 新建自定义岗位 Modal */}
      {mounted && typeof document !== "undefined" && showCreateModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 text-left overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 text-left space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#3182ce]" /> 新建企业自定义岗位
              </h4>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium -mt-1">自定义岗位仅在当前企业空间内部生效，创建后可在右侧矩阵为其配置组件授权。</p>
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  岗位名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPosName}
                  onChange={(e) => setNewPosName(e.target.value)}
                  placeholder="如：量化策略分析师 / 标书解析专家..."
                  className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  岗位标识 / 代号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newPosCode}
                  onChange={(e) => setNewPosCode(e.target.value.toUpperCase())}
                  placeholder="如：QUANT_STRATEGIST（大写英文标识与下划线）"
                  className="w-full h-9 px-3 text-xs font-mono font-bold uppercase border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  大写英文与下划线，用于系统底层识别与标准化映射
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">选择岗位图标</label>
                  {newPosIcon && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#3182ce] bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                      <PostIcon iconKey={newPosIcon} className="w-3 h-3" />
                      已选择
                    </span>
                  )}
                </div>
                {iconLibraryLoading ? (
                  <div className="py-4 text-center text-xs font-semibold text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 商务图标库加载中...
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                    {iconLibrary.filter((i) => i.iconKey in POST_ICON_MAP).length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400 font-semibold">图标库暂无可用图标</div>
                    ) : (
                      iconLibrary
                        .filter((i) => i.iconKey in POST_ICON_MAP)
                        .map((item) => (
                          <button
                            key={item.iconKey}
                            type="button"
                            title={`${item.name || item.iconKey}`}
                            onClick={() => setNewPosIcon(item.iconKey)}
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                              newPosIcon === item.iconKey
                                ? "bg-blue-50 border-[#3182ce] shadow-2xs scale-105"
                                : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            <PostIcon iconKey={item.iconKey} className="w-4 h-4 text-slate-600" />
                          </button>
                        ))
                    )}
                  </div>
                )}
                <p className="text-[10px] text-slate-400 font-medium mt-1">图标来自平台商务图标库（数据库），与全站岗位图标规范保持一致。</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">岗位职责说明</label>
                <textarea
                  value={newPosDesc}
                  onChange={(e) => setNewPosDesc(e.target.value)}
                  placeholder="简述该岗位的协同职责与技能范畴..."
                  rows={2}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handlePreCreatePosition}
                className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                <span>保存并下一步</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ======================= MODAL: 同步至系统岗位库确认（二次确认模态框） ======================= */}
      {mounted && typeof document !== "undefined" && showSyncConfirmModal && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 text-left overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSyncConfirmModal(false);
          }}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl max-w-lg w-full p-6 text-left space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5 pb-2 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900">
                  同步至系统岗位库确认
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  是否将此岗位信息同步至系统岗位集合？
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {/* 即将提报的岗位预览卡片 */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-2xs shrink-0"
                  style={{ backgroundColor: COLOR_PALETTE[posts.length % COLOR_PALETTE.length] }}
                >
                  <PostIcon iconKey={isValidPostIcon(newPosIcon) ? newPosIcon : DEFAULT_POST_ICON} className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-slate-900 truncate">{newPosName}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white text-slate-600 border border-slate-200">
                      {newPosCode}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {newPosDesc || "专注于高频算法策略与金融工程风控建模的专业岗位"}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-100/80 text-xs text-slate-600 leading-relaxed space-y-1.5">
              <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>提报至全平台官方标准岗位池</span>
              </p>
              <p className="text-[11px] text-slate-500">
                同步至系统集合后，该岗位将作为全网候选标准岗位提报至超级管理员审核池。审核通过后将正式纳入全平台官方标准库，供其他企业空间直接装配引用。空间内部敏感数据绝不会被泄露。
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowSyncConfirmModal(false);
                  setShowCreateModal(true);
                }}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                返回修改
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleConfirmCreatePosition(false)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  否，仅在当前空间使用
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleConfirmCreatePosition(true)}
                  className="px-4 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>是，同步至系统集合（推荐）</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 移除岗位确认 Modal */}
      {mounted && typeof document !== "undefined" && postToRemove && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 text-left overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPostToRemove(null);
          }}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 text-left space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" /> 确认移除岗位
              </h3>
              <button
                onClick={() => setPostToRemove(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-black cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="rounded-xl bg-red-50/60 border border-red-100 p-3.5 space-y-1.5">
              <p className="text-sm font-black text-slate-800">
                即将从当前企业空间移除岗位【{postToRemove.name}】
              </p>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                {postToRemove.memberCount > 0
                  ? `该岗位当前有 ${postToRemove.memberCount} 名成员在编，移除后将同步解绑成员岗位挂载。`
                  : "该岗位当前没有在编成员。"}
                {(matrix[postToRemove.id] || []).length > 0
                  ? `其 ${(matrix[postToRemove.id] || []).length} 项组件授权将自动清空。`
                  : "该岗位未配置组件授权，可直接移除。"}
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPostToRemove(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={confirmRemovePost}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-red-500/20 disabled:opacity-50"
              >
                {removing ? "移除中..." : "确认移除"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
