"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Save,
  X,
  Boxes,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
  const router = useRouter();
  const [plans, setPlans] = useState<WorkspacePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkspacePlan | null>(null);
  const [form, setForm] = useState<Partial<WorkspacePlan>>(DEFAULT_PLAN);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspacePlan | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  const { success, error } = useToast();

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/workspace-plans", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPlans(data.data || []);
      } else {
        error(data.message || "获取空间套餐失败");
      }
    } catch (err) {
      error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredPlans = plans.filter(
    (p) =>
      p.key.toLowerCase().includes(search.toLowerCase()) ||
      p.name.includes(search) ||
      p.description.includes(search)
  );

  const openCreate = () => {
    setEditingPlan(null);
    setForm({
      ...DEFAULT_PLAN,
      key: "",
      name: "",
      sortOrder: plans.length + 1,
    });
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
      error("套餐标识和名称为必填项");
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
        await fetchPlans();
      } else {
        error(data.message || "保存失败");
      }
    } catch (err) {
      error("网络错误，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: WorkspacePlan) => {
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
        await fetchPlans();
      } else {
        error(data.message || "操作失败");
      }
    } catch (err) {
      error("网络错误，请稍后重试");
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
        await fetchPlans();
      } else {
        error(data.message || "删除失败");
      }
    } catch (err) {
      error("网络错误，请稍后重试");
    }
  };

  const updateFeature = (idx: number, value: string) => {
    const next = [...(form.features || [])];
    next[idx] = value;
    setForm({ ...form, features: next });
  };

  const addFeature = () => {
    setForm({ ...form, features: [...(form.features || []), ""] });
  };

  const removeFeature = (idx: number) => {
    const next = [...(form.features || [])];
    next.splice(idx, 1);
    setForm({ ...form, features: next });
  };

  const formatPrice = (cents: number) => (cents > 0 ? `¥${(cents / 100).toFixed(2)}` : "免费");
  const formatLimit = (n: number) => (n === -1 ? "无限制" : n.toLocaleString());

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Boxes className="w-6 h-6 text-[#3182ce]" />
              空间套餐管理
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              配置企业空间的标准版、专业版、旗舰版等套餐及其价格与配额
            </p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-xl hover:shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            新增套餐
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索标识、名称或描述"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
              />
            </div>
            <button
              onClick={fetchPlans}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">套餐信息</th>
                  <th className="px-4 py-3">价格</th>
                  <th className="px-4 py-3">配额</th>
                  <th className="px-4 py-3">排序</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 flex items-center justify-center text-[#2b6cb0] font-black text-xs">
                          {plan.key.slice(0, 1)}
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                            {plan.name}
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">
                              {plan.key}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium line-clamp-1 max-w-[240px]">
                            {plan.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-black text-slate-800">
                        {formatPrice(plan.priceMonthly)}
                        <span className="text-[10px] text-slate-400 font-bold">/月</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {formatPrice(plan.priceYearly)}
                        <span className="font-bold">/年</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[11px] text-slate-600 font-medium space-y-0.5">
                        <div>席位 {formatLimit(plan.maxMembers)}</div>
                        <div>组件 {formatLimit(plan.maxComponents)}</div>
                        <div>存储 {formatLimit(plan.maxStorage)} MB</div>
                        <div>调用 {formatLimit(plan.maxApiCalls)}</div>
                        <div>算力 {formatLimit(plan.tokenLimit)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-black text-slate-700">{plan.sortOrder}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => handleToggleActive(plan)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-colors ${
                          plan.isActive
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {plan.isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> 启用
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> 停用
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEdit(plan)}
                          className="p-1.5 text-slate-500 hover:text-[#2b6cb0] hover:bg-[#3182ce]/10 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!SYSTEM_KEYS.includes(plan.key) && (
                          <button
                            onClick={() => setDeleteTarget(plan)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPlans.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400 font-medium">
                      {loading ? "加载中..." : "暂无空间套餐数据"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">
                {editingPlan ? "编辑空间套餐" : "新增空间套餐"}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1.5">套餐标识</label>
                  <input
                    value={form.key}
                    onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
                    disabled={!!editingPlan}
                    placeholder="如 PRO"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">大写英文，创建后不可修改</p>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1.5">排序</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1.5">套餐名称</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如 专业版"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1.5">描述</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="简短描述套餐适用场景"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1.5">月价（分）</label>
                  <input
                    type="number"
                    value={form.priceMonthly}
                    onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-700 mb-1.5">年价（分）</label>
                  <input
                    type="number"
                    value={form.priceYearly}
                    onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "最大席位", key: "maxMembers" },
                  { label: "最大组件", key: "maxComponents" },
                  { label: "存储上限(MB)", key: "maxStorage" },
                  { label: "调用上限", key: "maxApiCalls" },
                  { label: "算力额度", key: "tokenLimit" },
                ].map((item) => (
                  <div key={item.key}>
                    <label className="block text-[11px] font-black text-slate-700 mb-1.5">{item.label}</label>
                    <input
                      type="number"
                      value={(form as any)[item.key]}
                      onChange={(e) => setForm({ ...form, [item.key]: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-700 mb-1.5">特性列表（前端卡片展示）</label>
                <div className="space-y-2">
                  {(form.features || []).map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        value={feature}
                        onChange={(e) => updateFeature(idx, e.target.value)}
                        placeholder={`特性 ${idx + 1}`}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
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

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.purchasable}
                    onChange={(e) => setForm({ ...form, purchasable: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/20"
                  />
                  可在线购买
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/20"
                  />
                  启用
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white z-10 px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-xl hover:shadow-md transition-all disabled:opacity-50"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "保存中..." : "保存"}
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
