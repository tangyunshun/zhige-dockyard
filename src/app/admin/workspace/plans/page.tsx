"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  Boxes,
  Coins,
  ShoppingBag,
  Users,
  Package,
  Database,
  Zap,
  Tag,
} from "lucide-react";

interface WorkspacePlan {
  id: string;
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  maxComponents: number;
  maxMembers: number;
  maxStorage: number;
  maxApiCalls: number;
  tokenLimit: number;
  features: string[];
  sortOrder: number;
  purchasable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PLAN: Partial<WorkspacePlan> = {
  key: "",
  name: "",
  description: "",
  priceMonthly: 0,
  priceYearly: 0,
  maxComponents: 100,
  maxMembers: 10,
  maxStorage: 1024,
  maxApiCalls: 1000,
  tokenLimit: 20000,
  features: [],
  sortOrder: 0,
  purchasable: true,
  isActive: true,
};

const SYSTEM_KEYS = ["STANDARD", "PRO", "ENTERPRISE", "CUSTOM"];

export default function WorkspacePlansAdminPage() {
  const { success, error: toastError } = useToast();

  const [plans, setPlans] = useState<WorkspacePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPrice, setFilterPrice] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPurchasable, setFilterPurchasable] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkspacePlan | null>(null);
  const [form, setForm] = useState<Partial<WorkspacePlan>>(DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspacePlan | null>(null);

  const token = getAuthToken();

  const fetchPlans = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/workspace-plans", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlans(data.data || []);
      } else {
        toastError(data.message || "获取空间套餐失败");
      }
    } catch (err) {
      toastError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPlans = plans.filter((p) => {
    const matchSearch =
      p.key.toLowerCase().includes(search.toLowerCase()) ||
      p.name.includes(search) ||
      p.description.includes(search);
    const matchPrice =
      filterPrice === "all" ||
      (filterPrice === "free" ? p.priceMonthly === 0 : p.priceMonthly > 0);
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" ? p.isActive : !p.isActive);
    const matchPurchase =
      filterPurchasable === "all" ||
      (filterPurchasable === "purchasable" ? p.purchasable : !p.purchasable);
    return matchSearch && matchPrice && matchStatus && matchPurchase;
  });

  const openCreate = () => {
    setEditingPlan(null);
    setForm({ ...DEFAULT_PLAN, key: "", name: "", sortOrder: plans.length + 1 });
    setModalOpen(true);
  };

  const openEdit = (plan: WorkspacePlan) => {
    setEditingPlan(plan);
    setForm({ ...plan });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPlan(null);
    setForm(DEFAULT_PLAN);
  };

  const handleSave = async () => {
    if (!form.key || !form.name) {
      toastError("套餐标识和名称为必填项");
      return;
    }
    setSaving(true);
    try {
      const url = editingPlan
        ? `/api/admin/workspace-plans/${editingPlan.key}`
        : "/api/admin/workspace-plans";
      const method = editingPlan ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        success(editingPlan ? "更新成功" : "创建成功");
        closeModal();
        await fetchPlans(true);
      } else {
        toastError(data.message || "保存失败");
      }
    } catch (err) {
      toastError("网络错误，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: WorkspacePlan) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === plan.id ? { ...p, isActive: !p.isActive } : p))
    );
    try {
      const res = await fetch(`/api/admin/workspace-plans/${plan.key}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        success(plan.isActive ? "已停用" : "已启用");
        await fetchPlans(true);
      } else {
        setPlans((prev) =>
          prev.map((p) =>
            p.id === plan.id ? { ...p, isActive: plan.isActive } : p
          )
        );
        toastError(data.message || "操作失败");
      }
    } catch (err) {
      setPlans((prev) =>
        prev.map((p) =>
          p.id === plan.id ? { ...p, isActive: plan.isActive } : p
        )
      );
      toastError("网络错误，请稍后重试");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/workspace-plans/${deleteTarget.key}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        success("删除成功");
        setDeleteTarget(null);
        await fetchPlans(true);
      } else {
        toastError(data.message || "删除失败");
      }
    } catch (err) {
      toastError("网络错误，请稍后重试");
    }
  };

  const updateFeature = (idx: number, value: string) => {
    const next = [...(form.features || [])];
    next[idx] = value;
    setForm({ ...form, features: next });
  };
  const addFeature = () => setForm({ ...form, features: [...(form.features || []), ""] });
  const removeFeature = (idx: number) => {
    const next = [...(form.features || [])];
    next.splice(idx, 1);
    setForm({ ...form, features: next });
  };

  const fmtPrice = (cents: number) =>
    cents > 0 ? `¥${(cents / 100).toFixed(2)}` : "免费";
  const fmtLimit = (n: number) => (n === -1 ? "无限制" : n.toLocaleString());

  return (
    <div className="min-h-screen bg-[#f0f8ff] p-6 max-w-7xl mx-auto space-y-6 text-left font-sans">
      {/* 顶部 Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs relative overflow-hidden">
        <div className="flex items-center gap-3.5 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center border border-blue-400/40 shadow-xs shrink-0">
            <Boxes className="w-5 h-5 fill-white/20" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">空间套餐配置中心</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              编排企业空间的套餐价格阶梯与底层资源配额（席位、组件、存储、调用、算力）
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 relative z-10">
          <button
            onClick={() => fetchPlans(false)}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>刷新列表</span>
          </button>
          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>新增套餐</span>
          </button>
        </div>
      </div>

      {/* 提示条 */}
      <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs shadow-2xs">
        <Tag className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-amber-900 font-bold">配置说明：</span>
        <span className="text-amber-800 font-medium">
          价格单位均为「分」（如 ¥199/月 请输入 <span className="font-mono">19900</span>）；配额填写
          <span className="font-mono"> -1 </span>
          表示「无限制」；系统默认套餐不可删除，仅可停用。
        </span>
      </div>

      {/* 4 个 Bento 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">套餐总数</div>
            <div className="text-2xl font-black font-mono text-slate-900">
              {plans.length} <span className="text-xs font-normal text-slate-400">个方案</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
            <Boxes className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">当前已启用</div>
            <div className="text-2xl font-black font-mono text-emerald-600">
              {plans.filter((p) => p.isActive).length}{" "}
              <span className="text-xs font-normal text-slate-400">个激活</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">可在线购买</div>
            <div className="text-2xl font-black font-mono text-amber-600">
              {plans.filter((p) => p.purchasable).length}{" "}
              <span className="text-xs font-normal text-slate-400">个上架</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">免费 / 付费</div>
            <div className="text-2xl font-black font-mono text-purple-600">
              {plans.filter((p) => p.priceMonthly === 0).length}{" "}
              <span className="text-slate-400">/</span>{" "}
              {plans.filter((p) => p.priceMonthly > 0).length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 筛选与搜索控制栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索套餐标识、名称或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
          <select
            value={filterPrice}
            onChange={(e) => setFilterPrice(e.target.value)}
            className="h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="all">所有价格分类</option>
            <option value="free">仅看免费版</option>
            <option value="paid">仅看付费版</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="all">所有启用状态</option>
            <option value="active">已启用</option>
            <option value="inactive">已停用</option>
          </select>
          <select
            value={filterPurchasable}
            onChange={(e) => setFilterPurchasable(e.target.value)}
            className="h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
          >
            <option value="all">全部售卖方式</option>
            <option value="purchasable">可在线购买</option>
            <option value="not">线下定制</option>
          </select>
        </div>
      </div>

      {/* 数据表格 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-16 text-center text-xs font-bold text-slate-400">
          <div className="w-8 h-8 border-3 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          正在读取空间套餐配置文件...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[920px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  <th className="px-6 py-4 min-w-[200px]">套餐与标识</th>
                  <th className="px-6 py-4 min-w-[420px]">配额与参数</th>
                  <th className="px-6 py-4 min-w-[160px]">价格阶梯 (CNY)</th>
                  <th className="px-6 py-4 w-28">状态</th>
                  <th className="px-6 py-4 text-right w-40">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredPlans.map((plan) => (
                  <tr
                    key={plan.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      !plan.isActive ? "opacity-60 bg-slate-50/30" : ""
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center text-lg font-black shadow-xs border border-blue-400/40 shrink-0">
                          {plan.key.slice(0, 1)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-sm">{plan.name}</span>
                            {plan.purchasable && (
                              <span className="px-2 py-0.5 bg-blue-50 text-[#3182ce] border border-blue-200 text-[10px] rounded-md font-black flex items-center gap-1">
                                <ShoppingBag className="w-3 h-3" /> 可购买
                              </span>
                            )}
                            {SYSTEM_KEYS.includes(plan.key) && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 border border-slate-200 text-[10px] rounded-md font-black">
                                默认
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400 font-bold mt-0.5">
                            ID: {plan.key}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                        <span className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0">
                          <Users className="w-3 h-3 text-slate-400" />
                          <strong className="font-mono text-slate-900">{fmtLimit(plan.maxMembers)}</strong> 席位
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0">
                          <Package className="w-3 h-3 text-slate-400" />
                          <strong className="font-mono text-slate-900">{fmtLimit(plan.maxComponents)}</strong> 组件
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0">
                          <Database className="w-3 h-3 text-slate-400" />
                          <strong className="font-mono text-slate-900">{fmtLimit(plan.maxStorage)}</strong> MB
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0">
                          <Zap className="w-3 h-3 text-slate-400" />
                          <strong className="font-mono text-slate-900">{fmtLimit(plan.maxApiCalls)}</strong> 调用
                        </span>
                        <span className="inline-flex items-center gap-1 bg-slate-100/80 px-2.5 py-1 rounded-lg shrink-0">
                          <Coins className="w-3 h-3 text-slate-400" />
                          <strong className="font-mono text-slate-900">{fmtLimit(plan.tokenLimit)}</strong> 算力
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono whitespace-nowrap">
                      <div className="space-y-0.5">
                        <div className="font-black text-slate-900 text-xs">
                          月付: <span className="text-[#3182ce]">{fmtPrice(plan.priceMonthly)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-bold">
                          年付: {fmtPrice(plan.priceYearly)}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400">
                          {plan.purchasable ? "在线售卖" : "线下定制"}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(plan)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black inline-flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                          plan.isActive
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                            : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                      >
                        {plan.isActive ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {plan.isActive ? "已启用" : "已停用"}
                      </button>
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => !plan.isActive && openEdit(plan)}
                          disabled={plan.isActive}
                          title={plan.isActive ? "启用中的套餐不可编辑，请先停用" : "编辑套餐"}
                          className={`px-3 py-1.5 font-bold text-xs rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1 ${
                            plan.isActive
                              ? "bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed"
                              : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          编辑
                        </button>

                        {(() => {
                          const isSystem = SYSTEM_KEYS.includes(plan.key);
                          let disabled = false;
                          let title = "删除套餐";
                          if (plan.isActive) {
                            disabled = true;
                            title = "启用中的套餐不可删除，请先停用";
                          } else if (isSystem) {
                            disabled = true;
                            title = "系统默认套餐不可删除，仅可停用";
                          }
                          return (
                            <button
                              onClick={() => !disabled && setDeleteTarget(plan)}
                              disabled={disabled}
                              title={title}
                              className={`px-3 py-1.5 font-bold text-xs rounded-xl shadow-2xs transition-colors inline-flex items-center gap-1 ${
                                disabled
                                  ? "bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed"
                                  : "bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 cursor-pointer"
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              删除
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlans.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400 font-medium">
                      {plans.length === 0 ? "暂无空间套餐数据" : "没有符合筛选条件的套餐"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Boxes className="w-5 h-5 fill-white/20" />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    {editingPlan ? "编辑空间套餐配置" : "新增空间套餐配置"}
                  </h3>
                  <p className="text-[11px] text-blue-100">配置资源配额与价格，提交后实时保存落库</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto bg-slate-50/40">
              {/* 基本信息 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-[#3182ce]" />
                  基本信息
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      套餐标识 (ID) <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.key}
                      onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
                      disabled={!!editingPlan}
                      placeholder="如 STANDARD, PRO, ENTERPRISE"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <p className="mt-1 text-[10px] text-slate-400 font-medium">大写英文，创建后不可修改</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      套餐名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="如 专业版"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">排序权重</label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                      placeholder="数字越大越靠前"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">方案描述</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={2}
                      placeholder="简短描述套餐适用场景..."
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 资源配额 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  底层资源配额（填 -1 为无限制）
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "最大席位 (人)", key: "maxMembers", icon: Users },
                    { label: "最大组件数量 (个)", key: "maxComponents", icon: Package },
                    { label: "存储上限 (MB)", key: "maxStorage", icon: Database },
                    { label: "每月 API 调用次数", key: "maxApiCalls", icon: Zap },
                    { label: "算力额度 (token)", key: "tokenLimit", icon: Coins },
                  ].map((item) => {
                    const Icon = item.icon;
                    const val = (form as any)[item.key];
                    const isUnlimited = val === -1;
                    return (
                      <div className="space-y-1.5" key={item.key}>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-slate-400" />
                            {item.label}
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 font-bold">
                            <input
                              type="checkbox"
                              checked={isUnlimited}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  [item.key]: e.target.checked ? -1 : 0,
                                })
                              }
                              className="w-3.5 h-3.5 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                            />
                            无限制
                          </label>
                        </div>
                        <input
                          type="number"
                          value={isUnlimited ? "" : val}
                          onChange={(e) =>
                            setForm({ ...form, [item.key]: Number(e.target.value) })
                          }
                          disabled={isUnlimited}
                          placeholder={isUnlimited ? "无限制 (-1)" : "数量"}
                          className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 价格与策略 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  价格与市场策略（单位：元）
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">月付价格 (元/月)</label>
                    <input
                      type="number"
                      value={form.priceMonthly != null ? form.priceMonthly / 100 : 0}
                      onChange={(e) =>
                        setForm({ ...form, priceMonthly: (parseFloat(e.target.value) || 0) * 100 })
                      }
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">年付价格 (元/年)</label>
                    <input
                      type="number"
                      value={form.priceYearly != null ? form.priceYearly / 100 : 0}
                      onChange={(e) =>
                        setForm({ ...form, priceYearly: (parseFloat(e.target.value) || 0) * 100 })
                      }
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={!!form.purchasable}
                      onChange={(e) => setForm({ ...form, purchasable: e.target.checked })}
                      className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                    />
                    可在线购买（前端展示并支持升级）
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 border-l border-slate-200 pl-6">
                    <input
                      type="checkbox"
                      checked={!!form.isActive}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-600"
                    />
                    <span className="text-emerald-700">立即启用该套餐</span>
                  </label>
                </div>
              </div>

              {/* 特性说明 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  特性说明（前端卡片展示）
                </h4>
                <div className="space-y-2">
                  {(form.features || []).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        value={feature}
                        onChange={(e) => updateFeature(idx, e.target.value)}
                        placeholder={`特性 ${idx + 1}`}
                        className="flex-1 px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                      />
                      <button
                        onClick={() => removeFeature(idx)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addFeature}
                    className="text-[11px] font-bold text-[#2b6cb0] hover:text-[#3182ce] transition-colors"
                  >
                    + 添加特性
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={closeModal}
                className="px-5 py-2.5 text-slate-600 hover:bg-slate-200/60 rounded-xl font-bold text-xs transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95"
              >
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                {editingPlan ? "保存更新" : "创建套餐"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="确认删除空间套餐"
        message={`确定要删除套餐「${deleteTarget?.name || ""}」吗？删除后将无法恢复，且引用该套餐的空间可能无法正确显示。`}
        type="danger"
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
