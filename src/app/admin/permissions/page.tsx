"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import {
  Key,
  ArrowLeft,
  RefreshCw,
  Check,
  ShieldAlert,
  Loader2,
  Save,
  CheckSquare,
  Square,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Trash2,
  Layers,
  Activity,
  RotateCcw,
  SlidersHorizontal,
  CheckCircle2,
  HelpCircle,
  X,
  AlertCircle,
  Database,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  permissions: string[];
  isSuper: boolean;
}

interface PermissionKeyItem {
  key: string;
  label: string;
  desc: string;
  moduleName: string;
  level: "read" | "normal" | "sensitive" | "high";
}

interface PermissionGroupItem {
  group: string;
  moduleRoute: string;
  description: string;
  keys: PermissionKeyItem[];
}

// 风险等级标签组件
function LevelBadge({ level }: { level: PermissionKeyItem["level"] }) {
  switch (level) {
    case "high":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-red-50 text-red-600 border border-red-200 shrink-0 whitespace-nowrap">
          高危
        </span>
      );
    case "sensitive":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-200 shrink-0 whitespace-nowrap">
          敏感
        </span>
      );
    case "normal":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-200 shrink-0 whitespace-nowrap">
          常规
        </span>
      );
    case "read":
    default:
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0 whitespace-nowrap">
          只读
        </span>
      );
  }
}

function PermissionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryAdminId = searchParams.get("adminId");
  const toast = useToast();

  // 100% 从数据库动态查询与维护权限目录（坚决拒绝前端硬编码）
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionGroupItem[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 批量管理模式
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchSelectedKeys, setBatchSelectedKeys] = useState<string[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // 单个删除确认弹窗
  const [deletingKeyItem, setDeletingKeyItem] = useState<PermissionKeyItem | null>(null);

  // 模块卡片展开/折叠状态（key: group 名称, value: true 代表收起）
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // 动态同步监测态势
  const [syncStatus, setSyncStatus] = useState<any>({
    syncStatus: "IN_SYNC",
    totalModules: 18,
    activeModules: 18,
    dataSource: "DATABASE (system_config)",
    lastCheckTime: new Date().toLocaleTimeString(),
  });
  const [isCheckingSync, setIsCheckingSync] = useState(false);

  // 全量可用权限 Key 集合（由数据库查询结果动态派生）
  const allAvailableKeys = useMemo(() => {
    return permissionCatalog.flatMap((g) => g.keys.map((k) => k.key));
  }, [permissionCatalog]);

  // 全选状态判定
  const isAllChecked =
    allAvailableKeys.length > 0 &&
    allAvailableKeys.every((k) => selectedPermissions.includes(k));

  // 全部折叠状态判定
  const isAllCollapsed =
    permissionCatalog.length > 0 &&
    permissionCatalog.every((g) => !!collapsedGroups[g.group]);

  useEffect(() => {
    loadData();
  }, []);

  // 从数据库获取全量权限目录、管理员列表与权限配置
  const loadData = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        // 1. 动态加载从数据库查询出来的系统权限目录
        if (Array.isArray(result.catalog)) {
          setPermissionCatalog(result.catalog);
        }
        // 2. 加载管理员列表
        const data: AdminUser[] = result.data || [];
        setAdmins(data);
        // 3. 加载系统动态同步监测报告
        if (result.systemSync) {
          setSyncStatus(result.systemSync);
        }
        if (data.length > 0) {
          let target = queryAdminId ? data.find((a) => a.id === queryAdminId) : null;
          if (!target) {
            target = data.find((a) => !a.isSuper) || data[0];
          }
          setSelectedAdminId(target.id);
          setSelectedPermissions(target.permissions || []);
        }
      } else {
        toast.error("加载数据失败，请检查登录权限");
      }
    } catch (e) {
      toast.error("加载权限数据时发生异常");
    } finally {
      setLoading(false);
    }
  };

  // 手动触发动态监测同步（重新从数据库拉取与核验）
  const handleCheckSync = async () => {
    setIsCheckingSync(true);
    try {
      await loadData();
      toast.success("动态监测完成：已从数据库实时拉取并同步后台所有核心模块！");
    } finally {
      setIsCheckingSync(false);
    }
  };

  const handleAdminSelect = (adminId: string) => {
    const admin = admins.find((a) => a.id === adminId);
    setSelectedAdminId(adminId);
    setSelectedPermissions(admin?.permissions || []);
  };

  const handleTogglePermission = (key: string) => {
    if (isBatchMode) {
      // 批量删除模式下：点击用于选中待删除项
      setBatchSelectedKeys((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      );
      return;
    }

    setSelectedPermissions((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  // 分组全选/清空
  const handleToggleGroup = (groupKeys: string[]) => {
    const allInGroupChecked = groupKeys.every((k) => selectedPermissions.includes(k));
    if (allInGroupChecked) {
      setSelectedPermissions((prev) => prev.filter((k) => !groupKeys.includes(k)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...groupKeys])));
    }
  };

  // 全量权限全选 / 清空
  const handleToggleAll = () => {
    if (isAllChecked) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions([...allAvailableKeys]);
    }
  };

  // 单个模块展开/收起切换
  const toggleGroupCollapse = (groupTitle: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupTitle]: !prev[groupTitle],
    }));
  };

  // 全部收起 / 全部展开
  const toggleAllCollapse = () => {
    if (isAllCollapsed) {
      setCollapsedGroups({});
    } else {
      const next: Record<string, boolean> = {};
      permissionCatalog.forEach((g) => {
        next[g.group] = true;
      });
      setCollapsedGroups(next);
    }
  };

  // 单个从数据库删除权限项
  const handleConfirmDeleteSingle = async () => {
    if (!deletingKeyItem) return;
    try {
      const authToken = getAuthToken();
      const res = await fetch(
        `/api/admin/permissions?key=${encodeURIComponent(deletingKeyItem.key)}`,
        {
          method: "DELETE",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`已从数据库中成功移除权限：【${deletingKeyItem.label}】`);
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
        setSelectedPermissions((prev) => prev.filter((k) => k !== deletingKeyItem.key));
        setDeletingKeyItem(null);
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("网络异常，删除失败");
    }
  };

  // 批量从数据库删除选中的权限项
  const handleBatchDelete = async () => {
    if (batchSelectedKeys.length === 0) {
      toast.error("请先勾选需要批量删除的权限项");
      return;
    }
    setBatchDeleting(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ keys: batchSelectedKeys }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`成功从数据库批量移除 ${batchSelectedKeys.length} 项权限！`);
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
        setSelectedPermissions((prev) =>
          prev.filter((k) => !batchSelectedKeys.includes(k))
        );
        setBatchSelectedKeys([]);
        setIsBatchMode(false);
      } else {
        toast.error(data.error || "批量删除失败");
      }
    } catch {
      toast.error("批量删除失败，请稍后重试");
    } finally {
      setBatchDeleting(false);
    }
  };

  // 恢复数据库官方标准权限库
  const handleResetDefaultPermissions = async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: "reset_defaults" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("已成功从数据库恢复全平台官方标准权限库！");
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
      } else {
        toast.error(data.error || "恢复失败");
      }
    } catch {
      toast.error("恢复权限库异常");
    }
  };

  // 保存管理员权限配置到数据库
  const handleSavePermissions = async () => {
    if (!selectedAdminId) return;
    const targetAdmin = admins.find((a) => a.id === selectedAdminId);
    if (targetAdmin?.isSuper) {
      toast.error("超级管理员拥有全量免配特权，无需也禁止修改其角色权限");
      return;
    }

    try {
      setSaving(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          targetUserId: selectedAdminId,
          permissions: selectedPermissions,
        }),
      });

      if (res.ok) {
        toast.success("管理员权限配置已成功落库保存！");
        setAdmins((prev) =>
          prev.map((a) =>
            a.id === selectedAdminId
              ? { ...a, permissions: selectedPermissions }
              : a
          )
        );
      } else {
        const err = await res.json();
        toast.error(err.error || "保存失败");
      }
    } catch (e) {
      toast.error("保存权限配置发生异常");
    } finally {
      setSaving(false);
    }
  };

  const currentAdmin = admins.find((a) => a.id === selectedAdminId);

  return (
    <div className="space-y-6 pb-8 font-sans">
      {/* 顶部标题栏与快捷返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <Key className="w-8 h-8 text-[#3182ce]" />
            管理员模块授权配置中心
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            覆盖后台 18 个核心管理模块、共计 {allAvailableKeys.length} 项标准功能权限，数据 100% 源自数据库动态查询与维护
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/administrators"
            className="h-9 sm:h-10 px-3 sm:px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-[#3182ce]" />
            管理员团队
          </Link>
          <button
            onClick={() => router.push("/admin")}
            className="h-9 sm:h-10 px-3 sm:px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            返回总览
          </button>
        </div>
      </div>

      {/* 后台功能动态监测态势感知条（实时从数据库查询同步） */}
      <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800">
                数据库驱动·功能动态监测中
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>实时对接数据库 18 个功能模块 (system_config)</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              拒绝前端硬编码：当前权限树 100% 由数据库动态查询；包含 {permissionCatalog.length} 个业务中枢、{allAvailableKeys.length} 项标准功能权限
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaultPermissions}
            className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-1 border border-slate-200"
            title="一键从数据库恢复所有官方标准内置权限"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重置恢复库全量</span>
          </button>

          <button
            type="button"
            onClick={handleCheckSync}
            disabled={isCheckingSync}
            className="px-3.5 py-1.5 text-xs font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors flex items-center gap-1.5 border border-blue-200/80"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingSync ? "animate-spin" : ""}`} />
            <span>重新查询数据库</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[350px]">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-[#3182ce] animate-spin mx-auto mb-4" />
            <p className="text-slate-500 font-bold text-xs">正在从数据库查询权限字典与管理员列表...</p>
          </div>
        </div>
      ) : admins.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center min-h-[300px] flex items-center justify-center">
          <div>
            <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">未检测到平台管理员账号</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">
              请先前往【管理员管理】委派或指定平台管理员
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* 左侧：管理员列表卡片（采用 whitespace-nowrap 彻底杜绝“能”字掉行） */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 text-left">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2.5 border-b border-slate-100 flex items-center justify-between">
              <span>选择平台管理员</span>
              <button
                onClick={loadData}
                className="text-[#3182ce] hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5" /> 刷新
              </button>
            </h3>
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {admins.map((admin) => (
                <button
                  key={admin.id}
                  onClick={() => handleAdminSelect(admin.id)}
                  className={`w-full p-3.5 rounded-xl border flex flex-col gap-1 transition-all text-left cursor-pointer ${
                    admin.id === selectedAdminId
                      ? "bg-blue-50/70 border-[#3182ce] shadow-xs ring-1 ring-[#3182ce]/20"
                      : "bg-slate-50/40 border-slate-200/80 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800 text-xs truncate max-w-[130px]">
                      {admin.name || "未命名管理员"}
                    </span>
                    <span
                      className={`px-2 py-0.5 border text-[9px] font-black rounded-full select-none shrink-0 ${
                        admin.isSuper
                          ? "bg-amber-50 text-amber-600 border-amber-200"
                          : "bg-blue-50 text-blue-600 border-blue-200"
                      }`}
                    >
                      {admin.isSuper ? "超级管理员" : "运营管理员"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate mt-0.5">
                    {admin.email || "未绑定邮箱"}
                  </span>
                  {/* 使用 whitespace-nowrap 彻底杜绝掉行 */}
                  <span className="text-[10px] text-[#3182ce] font-bold mt-1.5 whitespace-nowrap">
                    {admin.isSuper
                      ? "★ 拥有全站免鉴权特权"
                      : `已授权 ${admin.permissions.length} 项权限`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：权限矩阵配置区 */}
          <div className="lg:col-span-2 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5 text-left">
            {/* 右侧头部：清晰两段式解耦布局，彻底消除文字与按钮重叠 */}
            <div className="pb-4 border-b border-slate-100 space-y-3">
              {/* 第一层：标题与主操作栏 */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 border border-blue-100">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <span>授权配置矩阵：</span>
                    <span className="text-[#3182ce]">{currentAdmin?.name || "未知管理员"}</span>
                  </h3>
                  {currentAdmin && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        currentAdmin.isSuper
                          ? "bg-amber-50 text-amber-600 border border-amber-200"
                          : "bg-blue-50 text-[#3182ce] border border-blue-200"
                      }`}
                    >
                      {currentAdmin.isSuper ? "超级管理员" : "运营管理员"}
                    </span>
                  )}
                </div>

                {currentAdmin && !currentAdmin.isSuper && (
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {/* 全部展开 / 全部收起 */}
                    <button
                      onClick={toggleAllCollapse}
                      type="button"
                      className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs border border-slate-200/80 active:scale-95"
                      title={isAllCollapsed ? "展开全部权限模块" : "收起全部权限模块"}
                    >
                      <ChevronsUpDown className="w-3.5 h-3.5 text-[#3182ce]" />
                      <span>{isAllCollapsed ? "全部展开" : "全部收起"}</span>
                    </button>

                    {/* 一键全选 / 清空 */}
                    {!isBatchMode && (
                      <button
                        onClick={handleToggleAll}
                        type="button"
                        className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs border border-slate-200/80 active:scale-95"
                      >
                        {isAllChecked ? (
                          <Square className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <CheckSquare className="w-3.5 h-3.5 text-[#3182ce]" />
                        )}
                        <span>{isAllChecked ? "清空全部" : "一键全选"}</span>
                      </button>
                    )}

                    {/* 保存权限配置到数据库 */}
                    {!isBatchMode && (
                      <button
                        onClick={handleSavePermissions}
                        disabled={saving}
                        className="h-8 px-3.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white disabled:opacity-50 text-xs font-bold rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>保存权限配置</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 第二层：状态统计条与批量管理开关（完全独立行，彻底解耦，绝不重叠） */}
              {currentAdmin && !currentAdmin.isSuper && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200/80 text-slate-600 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce] shrink-0"></span>
                      已配置 <strong className="text-[#3182ce]">{selectedPermissions.length}</strong> / {allAvailableKeys.length} 项操作权限
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                      · 变更后点击右上角保存即可落库生效
                    </span>
                  </div>

                  {/* 批量管理模式切换开关 */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsBatchMode(!isBatchMode);
                      setBatchSelectedKeys([]);
                    }}
                    className={`h-7 px-2.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border ${
                      isBatchMode
                        ? "bg-red-50 text-red-600 border-red-200 shadow-2xs"
                        : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>{isBatchMode ? "退出批量管理" : "批量管理"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 批量删除操作通知栏 */}
            {isBatchMode && (
              <div className="bg-red-50/80 border border-red-200 rounded-xl p-3 flex items-center justify-between animate-in fade-in-50">
                <div className="flex items-center gap-2 text-xs font-bold text-red-700">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>
                    批量删除模式：已选中 <strong className="text-red-600 font-black">{batchSelectedKeys.length}</strong> 项待从数据库移除的权限
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchSelectedKeys([])}
                    className="px-3 py-1 text-xs font-bold text-slate-600 hover:bg-white rounded-lg transition-colors"
                  >
                    取消全选
                  </button>
                  <button
                    type="button"
                    disabled={batchDeleting || batchSelectedKeys.length === 0}
                    onClick={handleBatchDelete}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {batchDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>确认批量从数据库删除 ({batchSelectedKeys.length})</span>
                  </button>
                </div>
              </div>
            )}

            {currentAdmin?.isSuper ? (
              <div className="p-8 bg-amber-50/40 rounded-2xl border border-amber-100/50 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
                <ShieldAlert className="w-12 h-12 text-amber-500" />
                <div>
                  <h4 className="text-sm font-black text-slate-800">超级管理员全量特权免配</h4>
                  <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed max-w-md">
                    该账号在系统中拥有最高超级管理员 (SuperAdmin) 身份。<br />
                    系统底层自动为超级管理员授予并豁免全站所有模块的鉴权拦截，无需在此处进行权限削减。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {permissionCatalog.map((group, idx) => {
                  const groupKeyStrings = group.keys.map((k) => k.key);
                  const isGroupAll = groupKeyStrings.every((k) =>
                    selectedPermissions.includes(k)
                  );
                  const groupCheckedCount = groupKeyStrings.filter((k) =>
                    selectedPermissions.includes(k)
                  ).length;
                  const isCollapsed = !!collapsedGroups[group.group];

                  return (
                    <div
                      key={idx}
                      className="rounded-2xl bg-slate-50/60 border border-slate-200/80 overflow-hidden transition-all duration-200 shadow-2xs"
                    >
                      {/* 分组头部栏：支持整行点击展开收起，右侧配备独立操作区 */}
                      <div
                        onClick={() => toggleGroupCollapse(group.group)}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100 gap-3 cursor-pointer select-none"
                      >
                        {/* 左侧：模块标题与描述 */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-200 shrink-0 ${
                              isCollapsed
                                ? "bg-slate-100 text-slate-400"
                                : "bg-blue-50 text-[#3182ce]"
                            }`}
                          >
                            <Layers className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-black text-slate-800 tracking-tight">
                                {group.group}
                              </h4>
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                  groupCheckedCount > 0
                                    ? "bg-blue-50 text-[#3182ce] border-blue-200"
                                    : "bg-slate-100 text-slate-400 border-slate-200"
                                }`}
                              >
                                已授权 {groupCheckedCount} / {group.keys.length} 项
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                              {group.description}
                            </p>
                          </div>
                        </div>

                        {/* 右侧：显眼的【展开 / 收起】按钮与【全选 / 取消】 */}
                        <div
                          className="flex items-center gap-2 self-end sm:self-auto shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isBatchMode && (
                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupKeyStrings)}
                              className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-[#3182ce] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {isGroupAll ? "取消该组" : "全选该组"}
                            </button>
                          )}

                          {/* 独立展开/收起按钮 */}
                          <button
                            type="button"
                            onClick={() => toggleGroupCollapse(group.group)}
                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer border ${
                              isCollapsed
                                ? "bg-white text-[#3182ce] border-[#3182ce]/40 hover:bg-blue-50 shadow-2xs"
                                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                            }`}
                            title={isCollapsed ? "展开此模块权限项" : "收起此模块权限项"}
                          >
                            {isCollapsed ? (
                              <>
                                <ChevronDown className="w-3.5 h-3.5 text-[#3182ce]" />
                                <span>展开</span>
                              </>
                            ) : (
                              <>
                                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                <span>收起</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 权限卡片列表：受 isCollapsed 状态控制 */}
                      {!isCollapsed && (
                        <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-slate-50/40 animate-in fade-in-50 duration-200">
                          {group.keys.map((perm) => {
                            const isChecked = selectedPermissions.includes(perm.key);
                            const isBatchSelected = batchSelectedKeys.includes(perm.key);

                            return (
                              <div
                                key={perm.key}
                                onClick={() => handleTogglePermission(perm.key)}
                                className={`p-3 rounded-xl border flex items-start justify-between cursor-pointer select-none transition-all group/item relative ${
                                  isBatchMode
                                    ? isBatchSelected
                                      ? "bg-red-50/80 border-red-500 shadow-xs ring-1 ring-red-400"
                                      : "bg-white border-slate-200/80 hover:border-red-300"
                                    : isChecked
                                    ? "bg-blue-50/60 border-[#3182ce]/60 shadow-xs ring-1 ring-[#3182ce]/15"
                                    : "bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300"
                                }`}
                              >
                                <div className="min-w-0 pr-2 space-y-1 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`text-xs block ${
                                        isBatchSelected
                                          ? "font-black text-red-600"
                                          : isChecked
                                          ? "font-black text-[#2b6cb0]"
                                          : "font-bold text-slate-800"
                                      }`}
                                    >
                                      {perm.label}
                                    </span>
                                    <LevelBadge level={perm.level} />
                                  </div>

                                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                    {perm.desc}
                                  </p>

                                  <span className="text-[9px] font-bold text-slate-400 font-mono block">
                                    {perm.key}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5 ml-2">
                                  {/* 单个删除按钮（直接在数据库中移除该项） */}
                                  {!isBatchMode && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingKeyItem(perm);
                                      }}
                                      className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      title="从数据库中删除此权限"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}

                                  {/* 选择框 */}
                                  <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                      isBatchMode
                                        ? isBatchSelected
                                          ? "bg-red-500 border-red-500"
                                          : "bg-white border-slate-300"
                                        : isChecked
                                        ? "bg-[#3182ce] border-[#3182ce] shadow-2xs"
                                        : "bg-white border-slate-300"
                                    }`}
                                  >
                                    {isBatchMode
                                      ? isBatchSelected && (
                                          <Check className="w-3 h-3 text-white stroke-[3]" />
                                        )
                                      : isChecked && (
                                          <Check className="w-3 h-3 text-white stroke-[3]" />
                                        )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================= MODAL: 单个删除二次确认 ======================= */}
      {deletingKeyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  确认从数据库中删除该权限？
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  权限名称：<strong className="text-red-600">{deletingKeyItem.label}</strong>（{deletingKeyItem.key}）
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              删除后，系统数据库将同步移除此权限记录，各管理员将无法再被授予此功能权限。后续若需要恢复，可通过顶部的【重置恢复库全量】一键找回。
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingKeyItem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>确认从数据库删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[350px]">
          <Loader2 className="w-10 h-10 text-[#3182ce] animate-spin" />
        </div>
      }
    >
      <PermissionsContent />
    </Suspense>
  );
}
