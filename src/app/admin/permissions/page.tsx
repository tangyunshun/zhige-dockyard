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
  RotateCcw,
  SlidersHorizontal,
  X,
  AlertCircle,
  Database,
  Plus,
  Search,
  Pencil,
  Sparkles,
  BookOpen,
  Wand2,
  Cpu,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { confirm } from "@/components/GlobalConfirmProvider";
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
  level: string;
}

interface PermissionGroupItem {
  group: string;
  moduleRoute: string;
  description: string;
  keys: PermissionKeyItem[];
}

/** 风险等级字典项（value / label 全部由数据库下发，前端零硬编码） */
interface PermissionLevelItem {
  value: string;
  label: string;
  desc: string;
}

/** 动作规则模板定义（100% 由数据库下发，前端零硬编码） */
interface ActionRuleTemplate {
  action: string;
  labelSuffix: string;
  descTemplate: string;
  defaultLevel: string;
}

/** 扩展性规则配置对象（100% 由数据库下发） */
interface PlatformPermissionRulesConfig {
  version: string;
  autoGrantToSuperAdmin: boolean;
  autoGrantNewFeatureActionsToActiveAdmins: string[];
  actionRules: ActionRuleTemplate[];
}

/** 系统功能模块注册元数据（100% 由数据库下发） */
interface PlatformFeatureModuleItem {
  id: string;
  name: string;
  route: string;
  resourceKey: string;
  description: string;
  supportedActions: string[];
  isSystemCore?: boolean;
}

/** 风险等级配色（纯视觉映射，非业务数据；未知等级回落中性色） */
const LEVEL_COLOR: Record<string, string> = {
  read: "text-emerald-700 border-emerald-300 bg-emerald-50",
  normal: "text-[#2b6cb0] border-blue-300 bg-blue-50",
  sensitive: "text-amber-700 border-amber-300 bg-amber-50",
  high: "text-red-700 border-red-300 bg-red-50",
};
const LEVEL_COLOR_FALLBACK = "text-slate-700 border-slate-300 bg-slate-50";

/**
 * 风险等级徽章
 * 展示文案取数据库下发的 label；配色为纯视觉映射，对未知等级回落到中性样式。
 */
function LevelBadge({ level, label }: { level: string; label: string }) {
  switch (level) {
    case "high":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-red-50 text-red-600 border border-red-200 shrink-0 whitespace-nowrap">
          {label}
        </span>
      );
    case "sensitive":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-200 shrink-0 whitespace-nowrap">
          {label}
        </span>
      );
    case "normal":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-50 text-blue-600 border border-blue-200 shrink-0 whitespace-nowrap">
          {label}
        </span>
      );
    case "read":
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0 whitespace-nowrap">
          {label}
        </span>
      );
    default:
      return (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200 shrink-0 whitespace-nowrap">
          {label}
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
  const [levels, setLevels] = useState<PermissionLevelItem[]>([]);
  const [rulesConfig, setRulesConfig] = useState<PlatformPermissionRulesConfig | null>(null);
  const [featureModules, setFeatureModules] = useState<PlatformFeatureModuleItem[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 纯数据库驱动：新功能模块注册与自动派生模态框
  const [showRegisterModuleModal, setShowRegisterModuleModal] = useState(false);
  const [isRegisteringModule, setIsRegisteringModule] = useState(false);
  const [newModuleForm, setNewModuleForm] = useState<{
    name: string;
    route: string;
    resourceKey: string;
    description: string;
    supportedActions: string[];
  }>({
    name: "",
    route: "/admin/",
    resourceKey: "",
    description: "",
    supportedActions: ["read", "create", "update", "delete"],
  });

  // 扩展性架构与接入规范模态框
  const [showExtGuideModal, setShowExtGuideModal] = useState(false);

  // 批量管理模式
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchSelectedKeys, setBatchSelectedKeys] = useState<string[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // 单个删除确认弹窗
  const [deletingKeyItem, setDeletingKeyItem] = useState<PermissionKeyItem | null>(null);

  // 模块卡片展开/折叠状态（key: group 名称, value: true 代表收起）
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // 灵活补充 / 编辑 权限模态框状态与表单
  const [showAddModal, setShowAddModal] = useState(false);
  const [permModalMode, setPermModalMode] = useState<"add" | "edit">("add");
  const [editingPermKey, setEditingPermKey] = useState<string>("");
  const [isAddingPerm, setIsAddingPerm] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [isResettingCatalog, setIsResettingCatalog] = useState(false);
  const [newPermForm, setNewPermForm] = useState<{
    group: string;
    isNewGroup: boolean;
    customGroupName: string;
    moduleRoute: string;
    description: string;
    key: string;
    label: string;
    desc: string;
    level: string;
  }>({
    group: "",
    isNewGroup: false,
    customGroupName: "",
    moduleRoute: "/admin",
    description: "",
    key: "",
    label: "",
    desc: "",
    level: "",
  });

  // 动态同步监测态势（全部字段由后端实时下发，前端不写死任何数量）
  const [syncStatus, setSyncStatus] = useState<{
    totalModules?: number;
    totalKeys?: number;
    officialModules?: number;
    officialKeys?: number;
    customKeys?: number;
    lastCheckTime?: string;
    dataSource?: string;
  }>({});
  const [isCheckingSync, setIsCheckingSync] = useState(false);

  // 权限项检索与风险等级筛选（等级取值全部来自数据库字典）
  const [keyword, setKeyword] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");

  // 管理员名单检索
  const [adminKeyword, setAdminKeyword] = useState("");

  // 批量调整：移动所属模块 / 统一风险等级
  const [batchTargetGroup, setBatchTargetGroup] = useState<string>("");
  const [batchTargetLevel, setBatchTargetLevel] = useState<string>("");
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);

  // 全量可用权限 Key 集合（由数据库查询结果动态派生）
  const allAvailableKeys = useMemo(() => {
    return permissionCatalog.flatMap((g) => g.keys.map((k) => k.key));
  }, [permissionCatalog]);

  // 风险等级 value ➔ 中文名（由数据库字典派生，不再本地写死）
  const levelLabelMap = useMemo(() => {
    return levels.reduce<Record<string, string>>((acc, item) => {
      acc[item.value] = item.label;
      return acc;
    }, {});
  }, [levels]);

  // 按关键字 + 风险等级筛选后的权限目录（模块名/label/key/desc 均参与匹配）
  const filteredCatalog = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return permissionCatalog
      .map((g) => ({
        ...g,
        keys: g.keys.filter((k) => {
          if (levelFilter !== "ALL" && k.level !== levelFilter) return false;
          if (!kw) return true;
          return (
            k.label.toLowerCase().includes(kw) ||
            k.key.toLowerCase().includes(kw) ||
            (k.desc || "").toLowerCase().includes(kw) ||
            g.group.toLowerCase().includes(kw)
          );
        }),
      }))
      .filter((g) => g.keys.length > 0);
  }, [permissionCatalog, keyword, levelFilter]);

  // 当前可见（筛选后）的 Key 集合：全选/清空只作用于可见项，避免误改不可见权限
  const visibleKeys = useMemo(
    () => filteredCatalog.flatMap((g) => g.keys.map((k) => k.key)),
    [filteredCatalog]
  );

  const isFiltering = keyword.trim() !== "" || levelFilter !== "ALL";

  // 全选状态判定
  const isAllChecked =
    visibleKeys.length > 0 && visibleKeys.every((k) => selectedPermissions.includes(k));

  // 全部折叠状态判定
  const isAllCollapsed =
    permissionCatalog.length > 0 &&
    permissionCatalog.every((g) => !!collapsedGroups[g.group]);

  // 管理员名单按姓名 / 邮箱检索
  const filteredAdmins = useMemo(() => {
    const kw = adminKeyword.trim().toLowerCase();
    if (!kw) return admins;
    return admins.filter(
      (a) =>
        (a.name || "").toLowerCase().includes(kw) ||
        (a.email || "").toLowerCase().includes(kw)
    );
  }, [admins, adminKeyword]);

  useEffect(() => {
    loadData();
  }, []);

  // 从数据库获取全量权限目录、管理员列表与权限配置
  // preserveSelection = true 时保留当前选中的管理员（仅刷新其权限包）
  const loadData = async (preserveSelection: boolean = false) => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const result = await res.json();
        // 1. 动态加载从数据库查询出来的系统权限目录、风险等级、派生规则与模块注册表（100%数据库驱动）
        if (Array.isArray(result.catalog)) {
          setPermissionCatalog(result.catalog);
        }
        if (Array.isArray(result.levels)) {
          setLevels(result.levels);
        }
        if (result.rules) {
          setRulesConfig(result.rules);
        }
        if (Array.isArray(result.modules)) {
          setFeatureModules(result.modules);
        }
        // 2. 加载管理员列表
        const data: AdminUser[] = result.data || [];
        setAdmins(data);
        // 3. 加载系统动态同步监测报告
        if (result.systemSync) {
          setSyncStatus(result.systemSync);
        }
        if (data.length > 0) {
          if (preserveSelection) {
            const keep = data.find((a) => a.id === selectedAdminId);
            if (keep) {
              setSelectedPermissions(keep.permissions || []);
            }
          } else {
            let target = queryAdminId ? data.find((a) => a.id === queryAdminId) : null;
            if (!target) {
              target = data.find((a) => !a.isSuper) || data[0];
            }
            setSelectedAdminId(target.id);
            setSelectedPermissions(target.permissions || []);
          }
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

  // 手动触发数据库规则自检与动态自愈（纯数据库驱动对齐）
  const handleCheckSync = async () => {
    setIsCheckingSync(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: "sync_rules_healing" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "规则自愈完成！");
        await loadData(true);
      } else {
        await loadData(true);
        toast.success("动态监测完成：已从数据库实时拉取最新权限矩阵！");
      }
    } catch {
      await loadData(true);
      toast.error("规则自愈请求异常，已从数据库重新加载");
    } finally {
      setIsCheckingSync(false);
    }
  };

  // 纯数据库驱动：提交新功能模块注册（自动派生全套权限并按数据库策略自动赋权）
  const handleRegisterFeatureModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleForm.name.trim() || !newModuleForm.route.trim() || !newModuleForm.resourceKey.trim()) {
      toast.error("请完整填写模块名称、前端路由与资源前缀");
      return;
    }
    if (newModuleForm.supportedActions.length === 0) {
      toast.error("请至少勾选一项动作规则以派生权限");
      return;
    }

    try {
      setIsRegisteringModule(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "register_feature_module",
          moduleItem: {
            id: newModuleForm.resourceKey.trim().toLowerCase(),
            name: newModuleForm.name.trim(),
            route: newModuleForm.route.trim(),
            resourceKey: newModuleForm.resourceKey.trim().toLowerCase(),
            description: newModuleForm.description.trim(),
            supportedActions: newModuleForm.supportedActions,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "新功能模块已成功注册，自动生成权限并入库生效！");
        setShowRegisterModuleModal(false);
        setNewModuleForm({
          name: "",
          route: "/admin/",
          resourceKey: "",
          description: "",
          supportedActions: ["read", "create", "update", "delete"],
        });
        await loadData(true);
      } else {
        toast.error(data.error || "注册新功能模块失败");
      }
    } catch {
      toast.error("网络异常，注册新模块失败");
    } finally {
      setIsRegisteringModule(false);
    }
  };

  // 切换管理员前拦截未保存的勾选变更，避免辛苦配好的权限被静默丢弃
  const handleAdminSelect = async (adminId: string) => {
    if (adminId === selectedAdminId) return;

    const current = admins.find((a) => a.id === selectedAdminId);
    if (current && !current.isSuper) {
      const saved = current.permissions || [];
      const changed =
        selectedPermissions.length !== saved.length ||
        selectedPermissions.some((k) => !saved.includes(k));
      if (changed) {
        const ok = await confirm({
          title: "存在未保存的权限变更",
          message: `管理员【${current.name || "未命名"}】的权限勾选尚未保存，切换到其他管理员将丢弃这些变更。确定继续切换吗？`,
          type: "warning",
          confirmText: "丢弃并切换",
          cancelText: "返回继续编辑",
        });
        if (!ok) return;
      }
    }

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

  // 全选 / 清空（仅作用于当前筛选可见的权限项）
  const handleToggleAll = () => {
    if (isAllChecked) {
      setSelectedPermissions((prev) => prev.filter((k) => !visibleKeys.includes(k)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...visibleKeys])));
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
        setDeletingKeyItem(null);
        // 各管理员权限包中的失效授权已在服务端回收，重新拉取保持一致
        await loadData(true);
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

    const ok = await confirm({
      title: `确认批量删除 ${batchSelectedKeys.length} 项权限？`,
      message:
        "这些权限项将从数据库权限目录中永久移除，已获授权的管理员会同步被回收对应权限。删除后只能通过【恢复官方标准】补回内置项，自定义项将不可恢复。确定继续吗？",
      type: "danger",
      confirmText: "确认删除",
      cancelText: "取消",
    });
    if (!ok) return;

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
        setBatchSelectedKeys([]);
        setIsBatchMode(false);
        // 各管理员权限包中的失效授权已在服务端回收，重新拉取保持一致
        await loadData(true);
      } else {
        toast.error(data.error || "批量删除失败");
      }
    } catch {
      toast.error("批量删除失败，请稍后重试");
    } finally {
      setBatchDeleting(false);
    }
  };

  // 批量调整权限项（移动所属模块 / 统一风险等级；key 不变，授权关系不受影响）
  const handleBatchUpdate = async () => {
    if (batchSelectedKeys.length === 0) {
      toast.error("请先勾选需要批量调整的权限项");
      return;
    }
    if (!batchTargetGroup && !batchTargetLevel) {
      toast.error("请至少选择「移动到模块」或「设置风险等级」中的一项");
      return;
    }

    const ok = await confirm({
      title: `确认批量调整 ${batchSelectedKeys.length} 项权限？`,
      message: `将把这些权限项${
        batchTargetGroup ? `移动到【${batchTargetGroup}】` : "保持原模块"
      }${batchTargetLevel ? `，并统一风险等级为【${levelLabelMap[batchTargetLevel] || batchTargetLevel}】` : ""}。权限代号不变，各管理员已勾选的授权不受影响。确定继续吗？`,
      type: "warning",
      confirmText: "确认调整",
      cancelText: "取消",
    });
    if (!ok) return;

    setIsBatchUpdating(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: "batch_update_permissions",
          keys: batchSelectedKeys,
          targetGroup: batchTargetGroup || undefined,
          level: batchTargetLevel || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "批量调整成功！");
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
        setBatchSelectedKeys([]);
        setBatchTargetGroup("");
        setBatchTargetLevel("");
      } else {
        toast.error(data.error || "批量调整失败");
      }
    } catch {
      toast.error("批量调整失败，请稍后重试");
    } finally {
      setIsBatchUpdating(false);
    }
  };

  // 恢复数据库官方标准权限库（补齐缺失 + 修正标准项，保留自定义补充项）
  const handleResetDefaultPermissions = async () => {
    const ok = await confirm({
      title: "确认恢复官方标准权限库？",
      message:
        "该操作将按内置官方标准权限库补齐缺失的标准权限项，并把被改动过的标准项（名称 / 说明 / 风险等级）还原为官方定义。管理员自定义补充的权限项会被完整保留，各管理员已勾选的授权不受影响。确定继续吗？",
      type: "warning",
      confirmText: "确认恢复",
      cancelText: "取消",
    });
    if (!ok) return;

    setIsResettingCatalog(true);
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
        toast.success(data.message || "已成功从数据库恢复全平台官方标准权限库！");
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
        // 重新拉取一次保证列表与数据库完全一致
        await loadData(true);
      } else {
        toast.error(data.error || "恢复失败");
      }
    } catch {
      toast.error("恢复权限库异常");
    } finally {
      setIsResettingCatalog(false);
    }
  };

  // 打开灵活补充新权限模态框
  const handleOpenAddModal = (presetGroup?: string) => {
    // 默认归属取数据库目录中的第一个模块；目录为空时留空由用户登记新模块
    const defaultGroup = presetGroup || permissionCatalog[0]?.group || "";
    const matched = permissionCatalog.find((g) => g.group === defaultGroup);
    // 默认风险等级取数据库字典中的「常规」，字典变更时无需改前端
    const defaultLevel =
      levels.find((l) => l.value === "normal")?.value ?? levels[0]?.value ?? "";
    setPermModalMode("add");
    setEditingPermKey("");
    setNewPermForm({
      group: defaultGroup,
      isNewGroup: false,
      customGroupName: "",
      moduleRoute:
        matched?.moduleRoute || permissionCatalog[0]?.moduleRoute || "/admin",
      description: matched?.description || "",
      key: "",
      label: "",
      desc: "",
      level: defaultLevel,
    });
    setShowAddModal(true);
  };

  // 打开编辑已有权限项模态框（key 为唯一标识，编辑时只读，避免授权关系断裂）
  const handleOpenEditPermModal = (groupName: string, perm: PermissionKeyItem) => {
    setPermModalMode("edit");
    setEditingPermKey(perm.key);
    setNewPermForm({
      group: groupName,
      isNewGroup: false,
      customGroupName: "",
      moduleRoute:
        permissionCatalog.find((g) => g.group === groupName)?.moduleRoute || "/admin",
      description: "",
      key: perm.key,
      label: perm.label,
      desc: perm.desc || "",
      level: perm.level,
    });
    setShowAddModal(true);
  };

  // 提交灵活补充权限
  const handleAddPermissionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditMode = permModalMode === "edit";
    const finalGroupName = newPermForm.isNewGroup
      ? newPermForm.customGroupName.trim()
      : newPermForm.group.trim();

    if (!finalGroupName) {
      toast.error("请选择或输入功能所属的业务模块名称");
      return;
    }
    if (!isEditMode && !newPermForm.key.trim()) {
      toast.error("请输入权限代号 Key (如 module:action)");
      return;
    }
    if (!newPermForm.label.trim()) {
      toast.error("请输入权限中文名称 Label");
      return;
    }

    const payload = {
      group: finalGroupName,
      moduleRoute: newPermForm.moduleRoute.trim() || "/admin",
      description: newPermForm.description.trim(),
      key: newPermForm.key.trim(),
      label: newPermForm.label.trim(),
      desc: newPermForm.desc.trim() || newPermForm.label.trim(),
      level: newPermForm.level,
    };

    try {
      setIsAddingPerm(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(
          isEditMode
            ? { action: "edit_permission", originalKey: editingPermKey, permission: payload }
            : { action: "add_permission", permission: payload }
        ),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          data.message ||
            (isEditMode ? "权限项已成功更新并落库！" : "权限项已成功落库并补充至权限目录！")
        );
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
        setShowAddModal(false);
      } else {
        toast.error(data.error || (isEditMode ? "更新权限失败" : "补充权限失败"));
      }
    } catch {
      toast.error("操作发生异常，请稍后重试");
    } finally {
      setIsAddingPerm(false);
    }
  };

  // 一键全系统功能智能差量合并补充（将全系统24大模块缺失项补入数据库，不破坏已有配置）
  const handleSyncAllSystemModules = async () => {
    try {
      setIsSyncingCatalog(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: "sync_system_catalog" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "已成功与全系统 24 大模块完成对接与同步！");
        if (Array.isArray(data.catalog)) {
          setPermissionCatalog(data.catalog);
        }
      } else {
        toast.error(data.error || "同步全系统功能失败");
      }
    } catch {
      toast.error("同步异常，请稍后重试");
    } finally {
      setIsSyncingCatalog(false);
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
            覆盖后台 {permissionCatalog.length} 个核心管理模块、共计 {allAvailableKeys.length} 项标准功能权限，数据 100% 源自数据库动态查询与维护
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
      <div className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <Database className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap sm:flex-nowrap">
            <span className="text-xs font-bold text-slate-800 whitespace-nowrap shrink-0">
              系统权限实时监测中
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>已接入 {permissionCatalog.length} 个功能模块 · {allAvailableKeys.length} 项标准权限</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* 纯数据库驱动：注册新功能模块 */}
          <button
            type="button"
            onClick={() => setShowRegisterModuleModal(true)}
            className="px-3 py-1.5 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-[4px] shadow-xs hover:shadow transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
            title="纯数据库驱动：新增后台功能模块，自动根据数据库规则派生生成权限并入库"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-200" />
            <span>注册新功能模块</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-[4px] shadow-2xs hover:shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
            title="为现有模块灵活补充细粒度操作权限"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>灵活补充权限</span>
          </button>

          <button
            type="button"
            onClick={handleCheckSync}
            disabled={isCheckingSync}
            className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-[4px] transition-all flex items-center gap-1.5 border border-emerald-200/80 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            title="根据数据库中的模块注册表与派生规则，执行一次全量自检与自愈对齐"
          >
            <Layers className={`w-3.5 h-3.5 ${isCheckingSync ? "animate-spin" : ""}`} />
            <span>{isCheckingSync ? "自愈对齐中..." : "规则自检与动态自愈"}</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefaultPermissions}
            disabled={isResettingCatalog}
            className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-slate-100 rounded-[4px] transition-colors flex items-center gap-1 border border-slate-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
            title="按内置官方标准库补齐缺失权限项并还原标准项定义（保留自定义补充项）"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResettingCatalog ? "animate-spin" : ""}`} />
            <span>{isResettingCatalog ? "恢复中..." : "恢复官方标准"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExtGuideModal(true)}
            className="px-3 py-1.5 text-xs font-bold text-[#3182ce] bg-blue-50 hover:bg-blue-100 rounded-[4px] transition-colors flex items-center gap-1.5 border border-blue-200/80 cursor-pointer whitespace-nowrap shrink-0"
            title="查看全平台零硬编码、数据库驱动的高扩展性设计规范"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>扩展性机制指引</span>
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
                onClick={() => loadData()}
                className="text-[#3182ce] hover:underline flex items-center gap-0.5 cursor-pointer font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5" /> 刷新
              </button>
            </h3>

            {/* 管理员名单检索 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={adminKeyword}
                onChange={(e) => setAdminKeyword(e.target.value)}
                placeholder="搜索管理员姓名 / 邮箱"
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:border-[#3182ce] outline-none transition-all"
              />
            </div>

            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filteredAdmins.length === 0 && (
                <p className="text-[11px] font-bold text-slate-400 text-center py-6">
                  没有匹配的管理员
                </p>
              )}
              {filteredAdmins.map((admin) => (
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
                        title={
                          isFiltering
                            ? "仅作用于当前筛选出的权限项"
                            : "作用于全量权限项"
                        }
                        className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs border border-slate-200/80 active:scale-95"
                      >
                        {isAllChecked ? (
                          <Square className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <CheckSquare className="w-3.5 h-3.5 text-[#3182ce]" />
                        )}
                        <span>
                          {isFiltering
                            ? isAllChecked
                              ? "清空筛选结果"
                              : "全选筛选结果"
                            : isAllChecked
                            ? "清空全部"
                            : "一键全选"}
                        </span>
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
                      setBatchTargetGroup("");
                      setBatchTargetLevel("");
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

              {/* 第三层：权限项检索与风险等级筛选 */}
              {currentAdmin && !currentAdmin.isSuper && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="搜索权限名称 / 代号 / 说明 / 所属模块"
                      className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:border-[#3182ce] outline-none transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setLevelFilter("ALL")}
                      className={`h-7 px-2.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                        levelFilter === "ALL"
                          ? "bg-blue-50 text-[#3182ce] border-blue-200"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      全部等级
                    </button>
                    {levels.map((lv) => (
                      <button
                        key={lv.value}
                        type="button"
                        title={lv.desc}
                        onClick={() => setLevelFilter(lv.value)}
                        className={`h-7 px-2.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                          levelFilter === lv.value
                            ? "bg-blue-50 text-[#3182ce] border-blue-200"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {lv.label}
                      </button>
                    ))}
                  </div>
                  {isFiltering && (
                    <span className="text-[11px] font-bold text-slate-400">
                      筛选出 {visibleKeys.length} / {allAvailableKeys.length} 项
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 批量管理操作栏：批量调整（移动 / 改等级）与批量删除 */}
            {isBatchMode && (
              <div className="bg-red-50/80 border border-red-200 rounded-xl p-3 space-y-3 animate-in fade-in-50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-700">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>
                      批量管理模式：已选中 <strong className="text-red-600 font-black">{batchSelectedKeys.length}</strong> 项权限
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchSelectedKeys([])}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                    >
                      取消选择
                    </button>
                    <button
                      type="button"
                      disabled={batchDeleting || batchSelectedKeys.length === 0}
                      onClick={handleBatchDelete}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 ${
                        batchDeleting || batchSelectedKeys.length === 0
                          ? "bg-red-100/40 border border-red-200 text-red-300 cursor-not-allowed"
                          : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                      }`}
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

                {/* 批量调整：移动所属模块 / 统一风险等级 */}
                <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-red-200/70">
                  <span className="text-[11px] font-bold text-slate-600">批量调整：</span>

                  <select
                    value={batchTargetGroup}
                    onChange={(e) => setBatchTargetGroup(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:border-[#3182ce] outline-none cursor-pointer max-w-[220px]"
                  >
                    <option value="">移动到模块…</option>
                    {permissionCatalog.map((g) => (
                      <option key={g.group} value={g.group}>
                        {g.group}
                      </option>
                    ))}
                  </select>

                  <select
                    value={batchTargetLevel}
                    onChange={(e) => setBatchTargetLevel(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:border-[#3182ce] outline-none cursor-pointer"
                  >
                    <option value="">设置风险等级…</option>
                    {levels.map((lv) => (
                      <option key={lv.value} value={lv.value}>
                        {lv.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={isBatchUpdating || batchSelectedKeys.length === 0}
                    onClick={handleBatchUpdate}
                    className="h-8 px-3 rounded-lg bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBatchUpdating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>应用调整 ({batchSelectedKeys.length})</span>
                  </button>

                  <span className="text-[11px] font-medium text-slate-500">
                    仅调整权限目录归属与等级，权限代号不变，各管理员已勾选的授权不受影响
                  </span>
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
                {filteredCatalog.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">
                      没有匹配的权限项
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      试试更换关键字，或将风险等级切回「全部等级」
                    </p>
                  </div>
                ) : null}
                {filteredCatalog.map((group, idx) => {
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
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenAddModal(group.group)}
                                className="px-2.5 py-1 text-xs font-bold text-[#3182ce] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 border border-blue-200/60"
                                title={`为【${group.group}】灵活补充新权限`}
                              >
                                <Plus className="w-3 h-3" />
                                <span>补充权限</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleGroup(groupKeyStrings)}
                                className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-[#3182ce] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                              >
                                {isGroupAll ? "取消该组" : "全选该组"}
                              </button>
                            </>
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
                                    <LevelBadge
                                      level={perm.level}
                                      label={levelLabelMap[perm.level] || perm.level}
                                    />
                                  </div>

                                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                    {perm.desc}
                                  </p>

                                  <span className="text-[9px] font-bold text-slate-400 font-mono block">
                                    {perm.key}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 mt-0.5 ml-2">
                                  {/* 编辑按钮（修正名称 / 说明 / 风险等级 / 所属模块） */}
                                  {!isBatchMode && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditPermModal(group.group, perm);
                                      }}
                                      className="h-6 px-1.5 rounded-[4px] bg-blue-50 text-[#2b6cb0] border border-blue-200 hover:bg-[#3182ce] hover:text-white hover:border-[#3182ce] transition-all flex items-center gap-1 text-[10px] font-bold shadow-2xs active:scale-95 cursor-pointer"
                                      title="编辑此权限项"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                      <span>编辑</span>
                                    </button>
                                  )}

                                  {/* 单个删除按钮（直接在数据库中移除该项） */}
                                  {!isBatchMode && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingKeyItem(perm);
                                      }}
                                      className="h-6 px-1.5 rounded-[4px] bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all flex items-center gap-1 text-[10px] font-bold shadow-2xs active:scale-95 cursor-pointer"
                                      title="从数据库中删除此权限"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                      <span>删除</span>
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
              删除后，系统数据库将同步移除此权限记录，各管理员将无法再被授予此功能权限。若删除的是官方标准项，可通过顶部的【恢复官方标准】一键补回；自定义补充项删除后不可恢复。
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
      {/* 灵活补充新功能权限模态框（知阁·舟坊顶级规范设计系统） */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-blue-100 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in-50 zoom-in-95">
            {/* 弹窗头部 */}
            <div className="p-6 bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-white border-b border-blue-100/60 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#3182ce] text-white flex items-center justify-center shadow-md shadow-[#3182ce]/20 shrink-0">
                  {permModalMode === "edit" ? (
                    <Pencil className="w-5 h-5" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">
                    {permModalMode === "edit" ? "编辑功能权限项" : "灵活补充功能权限"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {permModalMode === "edit"
                      ? "可修正权限名称、职责说明、风险等级与所属模块；权限代号为唯一标识，不可修改"
                      : "根据后台全系统新增功能，灵活登记细粒度权限并落库生效"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗表单 */}
            <form onSubmit={handleAddPermissionSubmit} className="p-6 space-y-4 text-left max-h-[75vh] overflow-y-auto">
              {/* 所属模块模式切换 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    功能模块归属 <span className="text-red-500">*</span>
                  </span>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setNewPermForm((prev) => ({ ...prev, isNewGroup: false }))}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer font-bold ${
                        !newPermForm.isNewGroup
                          ? "bg-blue-50 text-[#3182ce] border border-blue-200"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      已有模块追加
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setNewPermForm((prev) => ({ ...prev, isNewGroup: true }))}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer font-bold ${
                        newPermForm.isNewGroup
                          ? "bg-blue-50 text-[#3182ce] border border-blue-200"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      + 登记新模块
                    </button>
                  </div>
                </label>

                {!newPermForm.isNewGroup ? (
                  <select
                    value={newPermForm.group}
                    onChange={(e) => {
                      const val = e.target.value;
                      const matched = permissionCatalog.find((g) => g.group === val);
                      setNewPermForm((prev) => ({
                        ...prev,
                        group: val,
                        moduleRoute: matched?.moduleRoute || "/admin",
                        description: matched?.description || "",
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs font-semibold text-slate-800 bg-white outline-hidden transition-all cursor-pointer"
                  >
                    {permissionCatalog.map((g, i) => (
                      <option key={i} value={g.group}>
                        {g.group} ({g.keys.length} 项已录入)
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div>
                      <span className="text-[11px] font-bold text-slate-600 block mb-1">
                        新模块名称与代号 <span className="text-red-500">*</span>
                      </span>
                      <input
                        type="text"
                        required={newPermForm.isNewGroup}
                        placeholder="如：知识图谱管理模块 (Knowledge Graph)"
                        value={newPermForm.customGroupName}
                        onChange={(e) =>
                          setNewPermForm((prev) => ({ ...prev, customGroupName: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-[#3182ce] text-xs text-slate-800 bg-white outline-hidden"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-600 block mb-1">
                        模块对应后台路由路径
                      </span>
                      <input
                        type="text"
                        placeholder="如：/admin/knowledge-graph"
                        value={newPermForm.moduleRoute}
                        onChange={(e) =>
                          setNewPermForm((prev) => ({ ...prev, moduleRoute: e.target.value }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:border-[#3182ce] text-xs text-slate-800 bg-white outline-hidden font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 权限标识 Key */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    权限唯一代号 (Key) <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {permModalMode === "edit"
                      ? "编辑模式下不可修改（避免已授权关系断裂）"
                      : "建议格式：module:action"}
                  </span>
                </label>
                <input
                  type="text"
                  required
                  readOnly={permModalMode === "edit"}
                  placeholder="例如：ai_pricing:custom_task 或 user:vip_grant"
                  value={newPermForm.key}
                  onChange={(e) => setNewPermForm((prev) => ({ ...prev, key: e.target.value }))}
                  className={`w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs font-mono font-bold text-slate-800 outline-hidden transition-all ${
                    permModalMode === "edit"
                      ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                      : ""
                  }`}
                />
              </div>

              {/* 权限中文名称 Label */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  权限中文名称 (Label) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：调整模型算力单价 或 导出用户清单"
                  value={newPermForm.label}
                  onChange={(e) => setNewPermForm((prev) => ({ ...prev, label: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs font-semibold text-slate-800 outline-hidden transition-all"
                />
              </div>

              {/* 详细职责说明 Desc */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  功能职责与权限说明 (Desc)
                </label>
                <textarea
                  rows={2}
                  placeholder="说明该功能权限具体控制的行为，如：允许管理员导出全站经营数据报表"
                  value={newPermForm.desc}
                  onChange={(e) => setNewPermForm((prev) => ({ ...prev, desc: e.target.value }))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs text-slate-700 outline-hidden transition-all resize-none"
                />
              </div>

              {/* 风险等级 Level */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  风险与敏感度等级 (Level)
                </label>
                {levels.length === 0 && (
                  <p className="text-[11px] font-bold text-amber-600">
                    尚未从数据库读取到风险等级字典，请先点击顶部【重新查询数据库】
                  </p>
                )}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.max(levels.length, 1)}, minmax(0, 1fr))` }}
                >
                  {levels.map((item) => {
                    const isSelected = newPermForm.level === item.value;
                    const color = LEVEL_COLOR[item.value] || LEVEL_COLOR_FALLBACK;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        title={item.desc}
                        onClick={() =>
                          setNewPermForm((prev) => ({ ...prev, level: item.value }))
                        }
                        className={`py-2 px-1 text-center rounded-xl border text-xs font-black transition-all cursor-pointer ${
                          isSelected
                            ? `${color} shadow-xs ring-2 ring-offset-1 ring-slate-400/20`
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isAddingPerm}
                  className="px-5 py-2.5 text-xs font-black text-white bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isAddingPerm ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isAddingPerm
                      ? permModalMode === "edit"
                        ? "正在更新落库..."
                        : "正在保存落库..."
                      : permModalMode === "edit"
                      ? "确认更新并保存数据库"
                      : "确认补充并保存数据库"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 纯数据库驱动：注册新功能模块模态框 */}
      {showRegisterModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-white to-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-[#3182ce] flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    注册新功能模块（纯数据库数据驱动）
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    仅需录入模块元数据，系统规则引擎将根据数据库规则字典全自动派生全套权限并入库
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterModuleModal(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗表单主体 */}
            <form onSubmit={handleRegisterFeatureModule} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 模块名称 */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    新模块名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例如：合同与签署管理模块"
                    value={newModuleForm.name}
                    onChange={(e) => setNewModuleForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs font-semibold text-slate-800 outline-hidden transition-all"
                  />
                </div>

                {/* 资源键前缀 */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    资源代号前缀 (resourceKey) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例如：contract 或 ai_eval"
                    value={newModuleForm.resourceKey}
                    onChange={(e) =>
                      setNewModuleForm((prev) => ({
                        ...prev,
                        resourceKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      }))
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs font-mono font-bold text-slate-800 outline-hidden transition-all"
                  />
                </div>
              </div>

              {/* 后台路由路径 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  模块前端访问路由 (Route) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：/admin/contracts"
                  value={newModuleForm.route}
                  onChange={(e) => setNewModuleForm((prev) => ({ ...prev, route: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs font-mono text-slate-800 outline-hidden transition-all"
                />
              </div>

              {/* 模块业务描述 */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  业务职责与定位描述
                </label>
                <textarea
                  rows={2}
                  placeholder="说明该模块的业务职责，例如：全生命周期合同归档、在线签名审批流与履约状态监控"
                  value={newModuleForm.description}
                  onChange={(e) =>
                    setNewModuleForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 text-xs text-slate-700 outline-hidden transition-all resize-none"
                />
              </div>

              {/* 动作规则勾选（100% 数据库驱动渲染） */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    选择启用的标准动作规则（源自数据库规则字典） <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[11px] text-[#3182ce] font-semibold">
                    已选 {newModuleForm.supportedActions.length} 种动作
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(rulesConfig?.actionRules || []).map((rule) => {
                    const isChecked = newModuleForm.supportedActions.includes(rule.action);
                    return (
                      <label
                        key={rule.action}
                        className={`p-2.5 rounded-xl border flex flex-col gap-1 transition-all cursor-pointer ${
                          isChecked
                            ? "bg-blue-50/80 border-[#3182ce] shadow-2xs text-[#2b6cb0]"
                            : "bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{rule.action}</span>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setNewModuleForm((prev) => ({
                                ...prev,
                                supportedActions: checked
                                  ? [...prev.supportedActions, rule.action]
                                  : prev.supportedActions.filter((a) => a !== rule.action),
                              }));
                            }}
                            className="rounded text-[#3182ce] focus:ring-0 cursor-pointer"
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 line-clamp-1">{rule.labelSuffix}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 数据库规则派生预览 */}
              {newModuleForm.resourceKey.trim() && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Cpu className="w-3.5 h-3.5 text-[#3182ce]" />
                    <span>规则引擎动态推导预览（预计自动入库权限）：</span>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {newModuleForm.supportedActions.map((act) => {
                      const matchedRule = rulesConfig?.actionRules.find((r) => r.action === act);
                      const key = `${newModuleForm.resourceKey.trim().toLowerCase()}:${act}`;
                      return (
                        <div
                          key={act}
                          className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1 rounded-lg border border-slate-200/60 font-mono"
                        >
                          <span className="text-slate-800 font-bold">{key}</span>
                          <span className="text-slate-500 font-sans">
                            {newModuleForm.name || "新模块"} - {matchedRule?.labelSuffix || act}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-emerald-600 font-semibold">
                    ✓ 模块注册成功后，系统还将根据数据库策略自动为活跃管理员配置基础只读权限
                  </p>
                </div>
              )}

              {/* 底部按钮 */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRegisterModuleModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isRegisteringModule}
                  className="px-5 py-2 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isRegisteringModule ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{isRegisteringModule ? "正在派生并入库..." : "确认注册并自动生成权限"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 扩展性架构与规范说明模态框 */}
      {showExtGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-white to-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-[#3182ce] flex items-center justify-center shadow-xs">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    系统高扩展性与数据库驱动权限治理规范
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    100% 数据库驱动，绝无硬编码，后期新增功能自动赋予对应权限与规则
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExtGuideModal(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-left text-xs leading-relaxed text-slate-600">
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/60 space-y-1">
                <span className="font-bold text-[#2b6cb0] block">
                  🌟 核心原则：坚决拒绝硬编码，全链路数据库驱动
                </span>
                <p className="text-[11px] text-slate-600">
                  系统所有的功能模块元数据、标准动作生成模板、风险等级映射以及角色赋权规则，全部存储在数据库 <code className="font-mono text-[#2b6cb0]">systemconfig</code> 表中。无论是前端还是后端，均从数据库动态获取执行。
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">1</span>
                  新功能接入全自动机制（Auto-Discovery & Auto-Registration）
                </h4>
                <p className="pl-6 text-[11px] text-slate-600">
                  后续开发新模块时，通过页面点击【注册新功能模块】或在数据库模块表中插入一条元数据，系统规则引擎会自动根据数据库中的动作规则模板，秒级派生出 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">read</code>、<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">create</code>、<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">update</code>、<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">delete</code> 等全套标准权限，并自动写入真实权限目录。
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">2</span>
                  自适应规则自动赋权（Auto-Grant Policy）
                </h4>
                <p className="pl-6 text-[11px] text-slate-600">
                  新功能一旦注册入库：① 平台超级管理员自动获得所有新权限；② 普通管理员将根据数据库配置的默认规则（如自动授予只读基线权限），自动在后台可见该新功能，免去每次上线后超管需逐一为数十位管理员手动打勾的繁琐操作。
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px]">3</span>
                  数据库驱动的核心数据表与键值
                </h4>
                <ul className="pl-6 space-y-1 text-[11px] font-mono text-slate-600">
                  <li>• <strong className="text-slate-800">PLATFORM_MODULE_REGISTRY_V1</strong>: 数据库系统模块元数据注册表</li>
                  <li>• <strong className="text-slate-800">PLATFORM_PERMISSION_RULES_V1</strong>: 动作推导模板与自动赋权策略配置</li>
                  <li>• <strong className="text-slate-800">PLATFORM_PERMISSION_CATALOG_V1</strong>: 数据库实时生效的细粒度权限目录</li>
                  <li>• <strong className="text-slate-800">PLATFORM_PERMISSION_LEVELS_V1</strong>: 数据库标准风险等级字典</li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExtGuideModal(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl transition-colors cursor-pointer"
              >
                我知道了
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
