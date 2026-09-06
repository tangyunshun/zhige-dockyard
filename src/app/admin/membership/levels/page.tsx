"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Crown,
  Users,
  Box,
  Database,
  TrendingUp,
  ArrowLeft,
  Check,
  X,
  Zap,
} from "lucide-react";
import SearchInput from "@/components/common/SearchInput";
import Pagination from "@/components/Pagination";
import MembershipNavHeader from "@/components/admin/membership/MembershipNavHeader";
import {
  POINT_RATE_HINT,
  POINT_RATE_TEXT,
  monthlyCentsFromPoints,
  formatDiscountLabel,
} from "@/lib/point-rate";

interface MembershipLevel {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  color: string;
  description: string;
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number;
  maxComponents: number;
  maxTeamSize: number;
  maxStorage: number;
  maxApiCalls: number;
  features: string[];
  tokenLimit: number;
  priceMonthly: number;
  priceYearly: number;
  tokenPackDiscount: number;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  isRecommended: boolean;
  isPopular: boolean;
}

interface LevelFormData {
  name: string;
  nameZh: string;
  icon: string;
  color: string;
  description: string;
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number;
  maxComponents: number;
  maxTeamSize: number;
  maxStorage: number;
  maxApiCalls: number;
  tokenLimit: number;
  features: string;
  priceMonthly: number;
  priceYearly: number;
  tokenPackDiscount: number;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
  isRecommended: boolean;
  isPopular: boolean;
}

const PAGE_SIZE = 10;

// 红色「禁止」鼠标指针（替换浏览器默认的黑色 not-allowed 圈）
const RED_NO_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%3E%3Ccircle%20cx='12'%20cy='12'%20r='9'%20fill='none'%20stroke='%23ef4444'%20stroke-width='2'/%3E%3Cline%20x1='5'%20y1='5'%20x2='19'%20y2='19'%20stroke='%23ef4444'%20stroke-width='2'/%3E%3C/svg%3E\") 12 12, not-allowed";

export default function AdminMembershipLevelsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<MembershipLevel[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<MembershipLevel | null>(
    null,
  );
  const [formData, setFormData] = useState<LevelFormData>({
    name: "",
    nameZh: "",
    icon: "👑",
    color: "#3182ce",
    description: "",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: 1,
    maxComponents: 100,
    maxTeamSize: 5,
    maxStorage: 1,
    maxApiCalls: 1000,
    tokenLimit: 1000,
    features: "",
    priceMonthly: 0,
    priceYearly: 0,
    tokenPackDiscount: 0,
    trialDays: 0,
    sortOrder: 0,
    isActive: true,
    isRecommended: false,
    isPopular: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPrice, setFilterPrice] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadLevels();
  }, [searchQuery, filterPrice, filterStatus, currentPage]);

  const loadLevels = async (isSilent: boolean = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const authToken = getAuthToken();

      console.log("Loading levels with authToken:", authToken);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: String(PAGE_SIZE),
        ...(searchQuery && { search: searchQuery }),
        ...(filterPrice !== "all" && { priceType: filterPrice }),
        ...(filterStatus !== "all" && { status: filterStatus }),
      });

      const res = await fetch(`/api/admin/membership/levels?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        credentials: "include",
      });

      console.log("Response status:", res.status, res.ok);

      if (res.ok) {
        const data = await res.json();
        console.log("Levels data:", data);
        setLevels(data.data);
        if (data.pagination) {
          setTotal(Number(data.pagination.total) || 0);
          const tp = Number(data.pagination.totalPages) || 1;
          // 当前页被删空/筛选后超出总页数时，回退到最后一页
          if (currentPage > tp) {
            setCurrentPage(tp);
            return;
          }
        } else {
          setTotal(Array.isArray(data.data) ? data.data.length : 0);
        }
      } else {
        const errorText = await res.text();
        console.error("Load levels error - Status:", res.status);
        console.error("Load levels error - Text:", errorText);
        try {
          const error = JSON.parse(errorText);
          console.error("Load levels error - Parsed:", error);
          toast.error(error.message || "加载会员等级失败");
        } catch {
          toast.error("加载会员等级失败: " + errorText);
        }
      }
    } catch (error) {
      console.error("Load levels error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      toast.error(
        "加载失败: " + (error instanceof Error ? error.message : "未知错误"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "删除会员等级",
      message: "确定要删除这个会员等级吗？",
      type: "warning",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch(`/api/admin/membership/levels/${encodeURIComponent(name)}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            credentials: "include",
          });

          if (res.ok) {
            toast.success("删除成功");
            // 1. 局部无缝物理移除节点
            setLevels((prev) => prev.filter((item) => item.name !== name && item.id !== name));
            // 2. 静默后台数据对齐，绝不上锁全屏闪烁
            loadLevels(true);
          } else {
            const error = await res.json();
            toast.error(error.message || "删除失败");
          }
        } catch (error) {
          console.error("Delete level error:", error);
          toast.error("删除失败");
        }
      },
    });
  };

  const handleToggleActive = async (name: string, isActive: boolean) => {
    // 1. 乐观局部更新组件 State (毫秒级无感知切换状态，拒绝白屏闪烁)
    setLevels((prev) =>
      prev.map((item) =>
        item.name === name || item.id === name
          ? { ...item, isActive: !isActive }
          : item
      )
    );

    try {
      const authToken = getAuthToken();
      const res = await fetch(`/api/admin/membership/levels/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          isActive: !isActive,
        }),
      });

      if (res.ok) {
        toast.success(!isActive ? "已启用" : "已禁用");
        // 2. 静默与后端数据库同频，绝不出骨架屏
        loadLevels(true);
      } else {
        // 请求失败回滚原状态
        setLevels((prev) =>
          prev.map((item) =>
            item.name === name || item.id === name
              ? { ...item, isActive }
              : item
          )
        );
        toast.error("操作失败");
      }
    } catch (error) {
      console.error("Toggle active error:", error);
      // 捕获异常回滚原状态
      setLevels((prev) =>
        prev.map((item) =>
          item.name === name || item.id === name
            ? { ...item, isActive }
            : item
        )
      );
      toast.error("操作失败");
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: "",
      nameZh: "",
      icon: "👑",
      color: "#3182ce",
      description: "",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 1,
      maxComponents: 100,
      maxTeamSize: 5,
      maxStorage: 1,
      maxApiCalls: 1000,
      tokenLimit: 1000,
      features: "",
      priceMonthly: 0,
      priceYearly: 0,
      tokenPackDiscount: 0,
      trialDays: 0,
      sortOrder: 0,
      isActive: true,
      isRecommended: false,
      isPopular: false,
    });
    setShowCreateModal(true);
  };

  const openEditModal = (level: MembershipLevel) => {
    setFormData({
      name: level.name,
      nameZh: level.nameZh,
      icon: level.icon || "👑",
      color: level.color,
      description: level.description || "",
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces),
      maxComponents: Number(level.maxComponents),
      maxTeamSize: Number(level.maxTeamSize),
      maxStorage: Number(level.maxStorage) / 1073741824, // GB
      maxApiCalls: Number(level.maxApiCalls),
      tokenLimit: Number(level.tokenLimit || 1000),
      features: Array.isArray(level.features) ? level.features.join("\n") : "",
      priceMonthly: level.priceMonthly,
      priceYearly: level.priceYearly,
      tokenPackDiscount: Number(level.tokenPackDiscount || 0),
      trialDays: level.trialDays,
      sortOrder: level.sortOrder,
      isActive: level.isActive,
      isRecommended: level.isRecommended,
      isPopular: level.isPopular,
    });
    setEditingLevel(level);
    setShowCreateModal(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // 等级标识验证
    if (!formData.name) {
      errors.name = "等级标识不能为空";
    } else if (!/^[A-Z_]+$/.test(formData.name)) {
      errors.name = "等级标识只能包含大写字母和下划线";
    }

    // 中文名称验证
    if (!formData.nameZh) {
      errors.nameZh = "中文名称不能为空";
    } else if (formData.nameZh.length < 2 || formData.nameZh.length > 20) {
      errors.nameZh = "中文名称长度必须在 2-20 个字符之间";
    }

    // 颜色验证
    if (!formData.color) {
      errors.color = "主题色不能为空";
    } else if (!/^#[0-9A-Fa-f]{6}$/.test(formData.color)) {
      errors.color = "颜色格式不正确，请使用 #RRGGBB 格式";
    }

    // 数值验证（-1 表示无限制）
    if (formData.maxPersonalWorkspaces < -1) {
      errors.maxPersonalWorkspaces = "个人空间数量不能小于 -1";
    } else if (formData.maxPersonalWorkspaces === -1) {
      // -1 表示无限制，允许
    } else if (formData.maxPersonalWorkspaces < 0) {
      errors.maxPersonalWorkspaces = "个人空间数量不能为负数";
    }

    if (formData.maxEnterpriseWorkspaces < -1) {
      errors.maxEnterpriseWorkspaces = "企业空间数量不能小于 -1";
    } else if (formData.maxEnterpriseWorkspaces === -1) {
      // -1 表示无限制，允许
    } else if (formData.maxEnterpriseWorkspaces < 0) {
      errors.maxEnterpriseWorkspaces = "企业空间数量不能为负数";
    }

    if (formData.maxComponents < -1) {
      errors.maxComponents = "组件数量不能小于 -1";
    } else if (formData.maxComponents === -1) {
      // -1 表示无限制，允许
    } else if (formData.maxComponents < 0) {
      errors.maxComponents = "组件数量不能为负数";
    }

    if (formData.maxTeamSize < -1) {
      errors.maxTeamSize = "团队规模不能小于 -1";
    } else if (formData.maxTeamSize === -1) {
      // -1 表示无限制，允许
    } else if (formData.maxTeamSize < 1) {
      errors.maxTeamSize = "团队规模至少为 1 人";
    }

    if (formData.maxStorage < -1) {
      errors.maxStorage = "存储空间不能小于 -1";
    } else if (formData.maxStorage === -1) {
      // -1 表示无限制，允许
    } else if (formData.maxStorage < 0) {
      errors.maxStorage = "存储空间不能为负数";
    }

    if (formData.maxApiCalls < -1) {
      errors.maxApiCalls = "API 调用次数不能小于 -1";
    } else if (formData.maxApiCalls === -1) {
      // -1 表示无限制，允许
    } else if (formData.maxApiCalls < 0) {
      errors.maxApiCalls = "API 调用次数不能为负数";
    }
    if (formData.priceMonthly < 0) {
      errors.priceMonthly = "月付价格不能为负数";
    }
    if (formData.priceYearly < 0) {
      errors.priceYearly = "年付价格不能为负数";
    }
    if (formData.trialDays < 0) {
      errors.trialDays = "试用天数不能为负数";
    }

    console.log("=== 表单验证结果 ===");
    console.log("表单数据:", formData);
    console.log("验证错误:", errors);
    console.log("错误数量:", Object.keys(errors).length);

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    // 验证表单
    if (!validateForm()) {
      toast.error("请修正表单中的错误");
      // 滚动到第一个错误字段
      const firstErrorField = document.querySelector('[data-error="true"]');
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: "smooth", block: "center" });
        (firstErrorField as HTMLElement).focus();
      }
      return;
    }

    // 调试：打印更新信息
    console.log("=== 提交更新 ===");
    console.log("editingLevel:", editingLevel);
    console.log("formData.name:", formData.name);
    console.log("is editing:", !!editingLevel);

    setSubmitting(true);

    const authToken = getAuthToken();
    const targetName = editingLevel ? (editingLevel.name || editingLevel.id) : "";
    const url = editingLevel
      ? `/api/admin/membership/levels/${encodeURIComponent(targetName)}`
      : "/api/admin/membership/levels";

    const method = editingLevel ? "PUT" : "POST";

    const requestBody = {
      name: formData.name,
      nameZh: formData.nameZh,
      icon: formData.icon,
      color: formData.color,
      description: formData.description,
      maxPersonalWorkspaces: Number(formData.maxPersonalWorkspaces),
      maxEnterpriseWorkspaces: Number(formData.maxEnterpriseWorkspaces),
      maxComponents: Number(formData.maxComponents),
      maxTeamSize: Number(formData.maxTeamSize),
      maxStorage: Number(formData.maxStorage * 1073741824),
      maxApiCalls: Number(formData.maxApiCalls),
      tokenLimit: Number(formData.tokenLimit),
      features: formData.features
        ? formData.features.split("\n").filter((f) => f.trim())
        : [],
      priceMonthly: Number(formData.priceMonthly),
      priceYearly: Number(formData.priceYearly),
      tokenPackDiscount: Number(formData.tokenPackDiscount || 0),
      trialDays: Number(formData.trialDays),
      sortOrder: Number(formData.sortOrder),
      isActive: formData.isActive,
      isRecommended: formData.isRecommended,
      isPopular: formData.isPopular,
    };

    console.log("发送请求:", url, method);
    console.log("请求体:", requestBody);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log("=== API 响应 ===");
      console.log("状态码:", res.status);
      console.log("响应 OK:", res.ok);
      
      // 先检查响应状态
      if (!res.ok) {
        // 尝试读取错误响应
        let errorData: any = {};
        try {
          errorData = await res.json();
          console.error("错误详情:", JSON.stringify(errorData));
          if (errorData.debug) {
            console.error("调试信息:", errorData.debug);
          }
        } catch (parseError) {
          // 如果解析失败，读取文本
          const errorText = await res.text();
          console.error("错误文本:", errorText);
          errorData = { message: errorText || "操作失败" };
        }
        const errMsg = errorData.message || errorData.error || "操作失败";
        toast.error(errMsg);
        setSubmitting(false);
        return;
      }
      
      // 成功响应
      const data = await res.json();
      console.log("响应数据:", data);
      console.log("✓ 保存成功");
      
      const updatedLevelItem = data.data;
      if (updatedLevelItem) {
        setLevels((prev) => {
          const exists = prev.some(
            (item) => item.id === updatedLevelItem.id || item.name === updatedLevelItem.name
          );
          if (exists) {
            return prev.map((item) =>
              item.id === updatedLevelItem.id || item.name === updatedLevelItem.name
                ? { ...item, ...updatedLevelItem }
                : item
            );
          }
          return [updatedLevelItem, ...prev];
        });
      }
      
      toast.success(editingLevel ? "更新成功" : "创建成功");
      setShowCreateModal(false);
      // 触发静默无感知后端对齐，绝不出全页骨架屏
      loadLevels(true);
    } catch (error) {
      console.error("=== 捕获异常 ===");
      console.error("错误:", error);
      console.error("错误消息:", error instanceof Error ? error.message : error);
      console.error("错误堆栈:", error instanceof Error ? error.stack : "N/A");
      toast.error("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 text-left font-sans">
      {/* 顶部统一面包屑与横向模块导航 */}
      <MembershipNavHeader
        title="会员等级管理"
        subtitle="定制与编排各级会员的资源配额（个人/企业空间、存储上限、月度算力点等）与价格阶梯"
      >
        <Link
          href="/admin/users"
          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
          title="前往用户管理查看全平台注册用户与等级分布"
        >
          <Users className="w-3.5 h-3.5 text-[#3182ce]" />
          <span>用户分布中枢</span>
        </Link>

        <button
          onClick={() => loadLevels(false)}
          disabled={loading}
          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Search className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
          <span>刷新列表</span>
        </button>

        <button
          onClick={openCreateModal}
          className="px-3.5 py-1.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-bold text-xs rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>新增会员等级</span>
        </button>
      </MembershipNavHeader>

      {/* 算力点统一定价规则极简提示条 */}
      <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex items-center gap-2 text-amber-900 font-bold shrink-0">
          <Zap className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-black text-amber-950">算力定价规则：</span>
          <span className="font-mono text-amber-800">100 算力点 = 1 元</span>
          <span className="text-amber-700 text-[11px] font-normal">(等值点仅作参考价；订阅月付独立设置，年付 = 月付 × 10)</span>
        </div>
        <div className="text-[11px] text-amber-700 font-medium shrink-0 hidden md:block">
          💡 价格、月算力点、加油包折扣均为独立配置，修改算力点数不会自动改写价格。启用中的等级不可编辑/删除，请先禁用。
        </div>
      </div>

      {/* 4 大 Bento 统计数据卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">会员等级总数</div>
            <div className="text-2xl font-black font-mono text-slate-900">{total || levels.length} <span className="text-xs font-normal text-slate-400">个方案</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
            <Crown className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">当前在用/已启用</div>
            <div className="text-2xl font-black font-mono text-emerald-600">{levels.filter((l) => l.isActive).length} <span className="text-xs font-normal text-slate-400">个激活</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Check className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">热门/推荐标记</div>
            <div className="text-2xl font-black font-mono text-amber-600">{levels.filter((l) => l.isPopular || l.isRecommended).length} <span className="text-xs font-normal text-slate-400">个热销</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">免费与付费梯队</div>
            <div className="text-2xl font-black font-mono text-purple-600">
              {levels.filter((l) => l.priceMonthly === 0).length} / {levels.filter((l) => l.priceMonthly > 0).length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Box className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 筛选与搜索控制栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="w-full md:w-80">
          <SearchInput
            value={searchQuery}
            onChange={(v) => {
              setSearchQuery(v);
              setCurrentPage(1);
            }}
            placeholder="搜索会员等级标识、中文名..."
            debounceMs={300}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
          <select
            value={filterPrice}
            onChange={(e) => {
              setFilterPrice(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="all">所有价格分类</option>
            <option value="free">仅看免费版</option>
            <option value="paid">仅看付费版</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="all">所有启用状态</option>
            <option value="active">已启用</option>
            <option value="inactive">已禁用</option>
          </select>
        </div>
      </div>

      {/* 会员等级数据表格 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-16 text-center text-xs font-bold text-slate-400">
          <div className="w-8 h-8 border-3 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          正在读取会员等级与权益配置文件...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="px-6 py-4 min-w-[200px] shrink-0">等级与标识</th>
                  <th className="px-6 py-4 min-w-[360px]">每月配额与参数</th>
                  <th className="px-6 py-4 min-w-[150px] shrink-0">价格阶梯 (CNY)</th>
                  <th className="px-6 py-4 w-28 shrink-0">状态</th>
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-6 py-4 text-right w-40 shrink-0 font-black shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {levels.map((level) => (
                  <tr
                    key={level.name}
                    className={`group hover:bg-slate-50/80 transition-colors ${
                      !level.isActive ? "opacity-60 bg-slate-50/30" : ""
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap min-w-[200px] shrink-0">
                      <div className="flex items-center gap-3.5 whitespace-nowrap">
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xs border shrink-0"
                          style={{ backgroundColor: `${level.color}15`, borderColor: `${level.color}30` }}
                        >
                          <span>{level.icon || "👤"}</span>
                        </div>
                        <div className="whitespace-nowrap">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="font-black text-slate-900 text-sm whitespace-nowrap">{level.nameZh}</span>
                            {level.isRecommended && (
                              <span className="px-2 py-0.5 bg-blue-50 text-[#3182ce] border border-blue-200 text-[10px] rounded-md font-black flex items-center gap-1 shrink-0 whitespace-nowrap">
                                <TrendingUp className="w-3 h-3 shrink-0" /> 推荐
                              </span>
                            )}
                            {level.isPopular && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] rounded-md font-black flex items-center gap-1 shrink-0 whitespace-nowrap">
                                <Crown className="w-3 h-3 shrink-0" /> 热门
                              </span>
                            )}
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(level.nameZh || level.name)}`}
                              className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 text-[10px] rounded-md font-bold flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors"
                              title="点击反查持有该等级的注册用户"
                            >
                              <Users className="w-3 h-3 text-slate-500 shrink-0" />
                              反查用户
                            </Link>
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 font-bold mt-0.5 whitespace-nowrap">
                            ID: {level.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 min-w-[360px]">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                        <div className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                          <span className="text-slate-500 font-bold whitespace-nowrap">⚡ 月算力:</span>
                          <strong className="font-mono text-slate-900 font-bold whitespace-nowrap">{Number(level.tokenLimit || 1000).toLocaleString()} 点</strong>
                          {Number(level.tokenLimit) !== -1 && (
                            <span className="font-mono text-[#3182ce] font-bold whitespace-nowrap">
                              （¥{(monthlyCentsFromPoints(level.tokenLimit) / 100).toFixed(2)}）
                            </span>
                          )}
                        </div>
                        <div className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                          <span className="text-slate-500 font-bold whitespace-nowrap">企业空间:</span>
                          <strong className="font-mono text-slate-900 font-bold whitespace-nowrap">
                            {Number(level.maxEnterpriseWorkspaces) === -1 ? "无限制" : `${level.maxEnterpriseWorkspaces} 个`}
                          </strong>
                        </div>
                        <div className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                          <span className="text-slate-500 font-bold whitespace-nowrap">组件上限:</span>
                          <strong className="font-mono text-slate-900 font-bold whitespace-nowrap">
                            {Number(level.maxComponents) === -1 ? "无限制" : `${level.maxComponents} 个`}
                          </strong>
                        </div>
                        <div className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">
                          <span className="text-slate-500 font-bold whitespace-nowrap">团队人数:</span>
                          <strong className="font-mono text-slate-900 font-bold whitespace-nowrap">
                            {Number(level.maxTeamSize) === -1 ? "无限制" : `${level.maxTeamSize} 人`}
                          </strong>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono whitespace-nowrap min-w-[150px] shrink-0">
                      <div className="space-y-0.5 whitespace-nowrap">
                        <div className="font-black text-slate-900 text-xs whitespace-nowrap">
                          月付: <span className="text-[#3182ce] whitespace-nowrap">¥&nbsp;{(Number(level.priceMonthly) / 100).toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-bold whitespace-nowrap">
                          年付: ¥&nbsp;{(Number(level.priceYearly) / 100).toFixed(2)}
                        </div>
                        <div className="text-[10px] font-bold whitespace-nowrap text-violet-600">
                          加油包折扣: {formatDiscountLabel(level.tokenPackDiscount) ?? "无"}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap w-28 shrink-0">
                      <button
                        onClick={() => handleToggleActive(level.name, level.isActive)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black inline-flex items-center justify-center gap-1 cursor-pointer transition-colors shrink-0 whitespace-nowrap ${
                          level.isActive
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                      >
                        {level.isActive ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
                        <span className="whitespace-nowrap">{level.isActive ? "已启用" : "已禁用"}</span>
                      </button>
                    </td>

                    <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-4 text-right whitespace-nowrap w-40 shrink-0 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <button
                          onClick={() => !level.isActive && openEditModal(level)}
                          disabled={level.isActive}
                          title={level.isActive ? "启用中的会员等级不可编辑，请先禁用" : "编辑"}
                          style={level.isActive ? { cursor: RED_NO_CURSOR } : undefined}
                          className={`px-3 py-1.5 font-bold text-xs rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1 shrink-0 whitespace-nowrap ${
                            level.isActive
                              ? "bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed"
                              : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          }`}
                        >
                          <Edit className="w-3.5 h-3.5 shrink-0" />
                          <span className="whitespace-nowrap">编辑</span>
                        </button>

                        <button
                          onClick={() => !level.isActive && handleDelete(level.name)}
                          disabled={level.isActive}
                          title={level.isActive ? "启用中的会员等级不可删除，请先禁用" : "删除"}
                          style={level.isActive ? { cursor: RED_NO_CURSOR } : undefined}
                          className={`px-3 py-1.5 font-bold text-xs rounded-xl shadow-2xs transition-all inline-flex items-center gap-1 shrink-0 whitespace-nowrap ${
                            level.isActive
                              ? "bg-red-100/40 border border-red-200 text-red-300 cursor-not-allowed hover:ring-2 hover:ring-red-300/40"
                              : "bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 cursor-pointer"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="whitespace-nowrap">删除</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 分页 */}
          {total > 0 && (
            <div className="px-6 py-4 border-t border-slate-200/80">
              <Pagination
                currentPage={currentPage}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={(p) => setCurrentPage(p)}
                itemLabel="个会员等级"
              />
            </div>
          )}
        </div>
      )}

      {/* 创建/编辑弹窗 (防护响应式防截断 max-h-[90vh] flex flex-col) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left font-sans">
            {/* Header 吸顶 */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-300 fill-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm">{editingLevel ? "编辑会员等级配置" : "新增会员等级配置"}</h3>
                  <p className="text-[11px] text-blue-100">配置底层资源权限配额与价格，提交后实时保存落库</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto bg-slate-50/40">
              {/* 1. 基本信息卡片 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-[#3182ce]" />
                  <span>基本信息配置</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      等级标识 (ID) <span className="text-red-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          name: e.target.value.toUpperCase(),
                        })
                      }
                      disabled={!!editingLevel}
                      placeholder="如：FREE, BRONZE, SILVER"
                      data-error={!!formErrors.name}
                      className={`w-full px-3.5 py-2.5 bg-slate-50/50 border rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] disabled:bg-slate-100 transition-all ${
                        formErrors.name ? "border-red-500" : "border-slate-200"
                      }`}
                    />
                    {formErrors.name && (
                      <p className="mt-1 text-[11px] text-red-500 font-bold">
                        {formErrors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      中文名称 <span className="text-red-500 font-bold">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.nameZh}
                      onChange={(e) =>
                        setFormData({ ...formData, nameZh: e.target.value })
                      }
                      placeholder="如：免费版，青铜会员"
                      data-error={!!formErrors.nameZh}
                      className={`w-full px-3.5 py-2.5 bg-slate-50/50 border rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] transition-all ${
                        formErrors.nameZh ? "border-red-500" : "border-slate-200"
                      }`}
                    />
                    {formErrors.nameZh && (
                      <p className="mt-1 text-[11px] text-red-500 font-bold">
                        {formErrors.nameZh}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      图标 Emoji / Icon
                    </label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) =>
                        setFormData({ ...formData, icon: e.target.value })
                      }
                      placeholder="👑"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      主题识别色 <span className="text-red-500 font-bold">*</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) =>
                          setFormData({ ...formData, color: e.target.value })
                        }
                        className="w-12 h-10 border border-slate-200 rounded-xl cursor-pointer p-1 bg-white shrink-0"
                      />
                      <input
                        type="text"
                        value={formData.color}
                        onChange={(e) =>
                          setFormData({ ...formData, color: e.target.value })
                        }
                        placeholder="#3182ce"
                        data-error={!!formErrors.color}
                        className={`flex-1 px-3.5 py-2.5 bg-slate-50/50 border rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] ${
                          formErrors.color ? "border-red-500" : "border-slate-200"
                        }`}
                      />
                    </div>
                    {formErrors.color && (
                      <p className="mt-1 text-[11px] text-red-500 font-bold">
                        {formErrors.color}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      方案描述说明
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="简短描述该会员等级适合人群或核心优势..."
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 2. 底层配额资源卡片 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>底层资源与权限配额</span>
                </h4>

                {/* 算力点单独高亮卡片 */}
                <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                      <span>⚡ 每月基础算力点配额 (tokenLimit)</span>
                    </label>
                    <span className="text-[10px] text-blue-600 font-bold bg-blue-100/80 px-2 py-0.5 rounded-md">自然月首日重置</span>
                  </div>
                  <input
                    type="number"
                    value={formData.tokenLimit || 0}
                    onChange={(e) => {
                      const pts = parseInt(e.target.value) || 0;
                      // 注：订阅月费与月算力点相互独立设置（月包价低于等值点折算、体现订阅优惠），
                      // 修改算力点数不再自动改写月付/年付，避免破坏数据库中的新阶梯订阅价。
                      setFormData({
                        ...formData,
                        tokenLimit: pts,
                      });
                    }}
                    placeholder="如：1000, 20000, 100000"
                    className="w-full px-3.5 py-2 bg-white border border-blue-300/80 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />

                  {/* 等值点参考折算（仅供定价参考，实际订阅价为独立设置值） */}
                  <div className="bg-white/80 border border-blue-200/70 rounded-lg px-2.5 py-2 text-[11px] font-bold text-blue-900 leading-relaxed">
                    {(() => {
                      const pts = Number(formData.tokenLimit) || 0;
                      if (pts === -1) {
                        return (
                          <span className="text-amber-600">
                            ⚠ 当前为「无限制」配额，请手动填写月付 / 年付价格
                          </span>
                        );
                      }
                      return (
                        <span>
                          等值点参考价：{pts.toLocaleString()} 点 ÷ 100 ={" "}
                          <strong className="text-[#3182ce]">
                            ¥{(monthlyCentsFromPoints(pts) / 100).toFixed(2)}
                          </strong>{" "}
                          /月。订阅月付建议在参考价以内设置（体现订阅优惠）；年付 = 月付 × 10。
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-blue-600 font-bold">{POINT_RATE_HINT}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 个人空间 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">个人空间数量</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 font-bold">
                        <input
                          type="checkbox"
                          checked={formData.maxPersonalWorkspaces === -1}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maxPersonalWorkspaces: e.target.checked ? -1 : 1,
                            })
                          }
                          className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                        />
                        <span>无限制</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      value={formData.maxPersonalWorkspaces === -1 ? "" : formData.maxPersonalWorkspaces}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxPersonalWorkspaces: parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={formData.maxPersonalWorkspaces === -1}
                      placeholder={formData.maxPersonalWorkspaces === -1 ? "无限制 (-1)" : "数量"}
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  {/* 企业空间 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">企业空间数量</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 font-bold">
                        <input
                          type="checkbox"
                          checked={formData.maxEnterpriseWorkspaces === -1}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maxEnterpriseWorkspaces: e.target.checked ? -1 : 1,
                            })
                          }
                          className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                        />
                        <span>无限制</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      value={formData.maxEnterpriseWorkspaces === -1 ? "" : formData.maxEnterpriseWorkspaces}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxEnterpriseWorkspaces: parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={formData.maxEnterpriseWorkspaces === -1}
                      placeholder={formData.maxEnterpriseWorkspaces === -1 ? "无限制 (-1)" : "数量"}
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  {/* 组件上限 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">组件上限 (个)</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 font-bold">
                        <input
                          type="checkbox"
                          checked={formData.maxComponents === -1}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maxComponents: e.target.checked ? -1 : 100,
                            })
                          }
                          className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                        />
                        <span>无限制</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      value={formData.maxComponents === -1 ? "" : formData.maxComponents}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxComponents: parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={formData.maxComponents === -1}
                      placeholder={formData.maxComponents === -1 ? "无限制 (-1)" : "数量"}
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  {/* 团队规模 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">团队规模 (人)</label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 font-bold">
                        <input
                          type="checkbox"
                          checked={formData.maxTeamSize === -1}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              maxTeamSize: e.target.checked ? -1 : 5,
                            })
                          }
                          className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                        />
                        <span>无限制</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      value={formData.maxTeamSize === -1 ? "" : formData.maxTeamSize}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxTeamSize: parseInt(e.target.value) || 0,
                        })
                      }
                      disabled={formData.maxTeamSize === -1}
                      placeholder={formData.maxTeamSize === -1 ? "无限制 (-1)" : "人数"}
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  {/* 存储空间 */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">存储空间 (GB)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.maxStorage}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxStorage: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  {/* 每月 API 调用 */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">每月 API 调用次数</label>
                    <input
                      type="number"
                      value={formData.maxApiCalls}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxApiCalls: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 3. 价格与策略卡片 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>价格阶梯与策略配置</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      月付价格 (元/月)
                    </label>
                    <input
                      type="number"
                      value={formData.priceMonthly / 100}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priceMonthly: (parseFloat(e.target.value) || 0) * 100,
                        })
                      }
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                    <p className="mt-1 text-[10px] font-bold text-slate-400">
                      订阅月付为独立设置值（可参考上方等值点参考价，定价不受算力点数硬约束）
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      年付价格 (元/年)
                    </label>
                    <input
                      type="number"
                      value={formData.priceYearly / 100}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priceYearly: (parseFloat(e.target.value) || 0) * 100,
                        })
                      }
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-slate-400">
                        会员年付规则：月付 × 10（相当于买 10 送 2 个月）
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            priceYearly: (Number(formData.priceMonthly) || 0) * 10,
                          })
                        }
                        className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-black rounded-md border border-amber-200 cursor-pointer shrink-0"
                      >
                        按 月付×10 填充
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      算力加油包折扣 (%) <span className="text-violet-500">新</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={formData.tokenPackDiscount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tokenPackDiscount: Math.max(
                            0,
                            Math.min(100, parseInt(e.target.value) || 0),
                          ),
                        })
                      }
                      placeholder="如 0, 10, 15, 20"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                    <p className="mt-1 text-[10px] font-bold text-slate-400">
                      该等级会员购买算力加油包立减百分比：10=9 折、15=8.5 折、20=8 折
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      免费试用天数
                    </label>
                    <input
                      type="number"
                      value={formData.trialDays}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          trialDays: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="如 0, 7, 14"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      排序权重 (数字越大越靠前)
                    </label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sortOrder: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 4. 功能权益列表 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>功能权益说明</span>
                </h4>
                <textarea
                  value={formData.features}
                  onChange={(e) =>
                    setFormData({ ...formData, features: e.target.value })
                  }
                  rows={3}
                  placeholder="每行一个权益描述（例如：支持导出高分辨率矢量图、专属客服一对一解答...）"
                  className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                />
              </div>

              {/* 5. 运营标记与状态 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>运营标记与状态</span>
                </h4>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.isRecommended}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isRecommended: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                    />
                    <span>推荐方案 (标记“推荐”标签)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.isPopular}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isPopular: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500"
                    />
                    <span>最受欢迎 (标记“热门”标签)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 border-l border-slate-200 pl-6">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-600"
                    />
                    <span className="text-emerald-700">立即启用该等级配置</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Action 按钮吸底 */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-2.5 text-slate-600 hover:bg-slate-200/60 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer active:scale-95"
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {editingLevel ? "保存更新" : "创建等级"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
