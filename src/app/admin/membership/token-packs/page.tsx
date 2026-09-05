"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { confirm } from "@/components/GlobalConfirmProvider";
import { getAuthToken } from "@/utils/auth";
import { pointsToYuan, formatYuanFromPoints, POINT_RATE_HINT, POINT_RATE_TEXT, isPriceMatchingRule } from "@/lib/point-rate";
import { Zap, Plus, Edit2, Trash2, ShieldAlert, Sparkles, CheckCircle2, XCircle, ArrowLeft, RefreshCw, X, Coins, ClipboardList } from "lucide-react";

interface TokenPack {
  id: string;
  name: string;
  points: number;
  price: number;
  icon: string;
  color: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

export default function AdminTokenPacksPage() {
  const router = useRouter();
  const toast = useToast();

  const [packs, setPacks] = useState<TokenPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPack, setEditingPack] = useState<TokenPack | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    points: 1000,
    price: 99,
    icon: "⚡",
    color: "#3182ce",
    description: "",
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  });

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const res = await fetch(`/api/admin/token-packs?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      if (res.ok) {
        const data = await res.json();
        setPacks(data.packs || []);
      } else {
        const err = await res.json();
        toast.error(err.error || "获取算力包失败");
      }
    } catch (error) {
      console.error("加载算力加油包失败:", error);
      toast.error("网络异常，无法拉取算力包");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingPack(null);
    setFormData({
      name: "",
      points: 1000,
      price: 99,
      icon: "⚡",
      color: "#3182ce",
      description: "",
      isPopular: false,
      isActive: true,
      sortOrder: (packs.length + 1),
    });
    setShowModal(true);
  };

  const handleOpenEdit = (pack: TokenPack) => {
    setEditingPack(pack);
    setFormData({
      name: pack.name,
      points: pack.points,
      price: pack.price,
      icon: pack.icon || "⚡",
      color: pack.color || "#3182ce",
      description: pack.description || "",
      isPopular: pack.isPopular,
      isActive: pack.isActive,
      sortOrder: pack.sortOrder,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.points <= 0 || formData.price < 0) {
      toast.error("请填入有效的包名、正数算力点数与价格");
      return;
    }

    try {
      setSubmitting(true);
      const token = getAuthToken();
      const url = editingPack ? `/api/admin/token-packs/${editingPack.id}` : "/api/admin/token-packs";
      const method = editingPack ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "操作成功");
        setShowModal(false);
        loadPacks();
      } else {
        toast.error(data.error || "提交失败");
      }
    } catch (error) {
      console.error("保存算力包失败:", error);
      toast.error("网络异常，无法保存");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({ title: "确认删除", message: `确定要删除算力加油包 [${name}] 吗？`, type: "danger" }))) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/token-packs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast.success(`已删除加油包 [${name}]`);
        loadPacks();
      } else {
        const err = await res.json();
        toast.error(err.error || "删除失败");
      }
    } catch (error) {
      toast.error("删除处理失败");
    }
  };

  const handleToggleActive = async (pack: TokenPack) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/token-packs/${pack.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !pack.isActive }),
      });

      if (res.ok) {
        toast.success(pack.isActive ? "已下架该算力包" : "已上架该算力包");
        loadPacks();
      }
    } catch (error) {
      toast.error("上下架切换失败");
    }
  };

  return (
    <div className="space-y-6 pb-8 text-left font-sans">
      
      {/* 顶部标题导航 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center border border-amber-200/60 shadow-xs">
            <Zap className="w-5 h-5 fill-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">算力加油包运营维护中心</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              动态配置与上架前端工作控制台充值弹窗可选的算力包，修改价格、点数与推荐标记
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/admin/orders"
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="直达订单中枢查看用户实际算力充值流水"
          >
            <ClipboardList className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>充值交易账单</span>
          </Link>

          <button
            onClick={loadPacks}
            disabled={loading}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>刷新</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>新增算力加油包</span>
          </button>
        </div>
      </div>

      {/* 4 大 Bento 统计数据卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">加油包方案总数</div>
            <div className="text-2xl font-black font-mono text-slate-900">{packs.length} <span className="text-xs font-normal text-slate-400">个档位</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">当前在售/上架中</div>
            <div className="text-2xl font-black font-mono text-emerald-600">{packs.filter((p) => p.isActive).length} <span className="text-xs font-normal text-slate-400">个在售</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">热门推荐标记</div>
            <div className="text-2xl font-black font-mono text-amber-600">{packs.filter((p) => p.isPopular).length} <span className="text-xs font-normal text-slate-400">个推荐</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">基准换算率</div>
            <div className="text-2xl font-black font-mono text-violet-600">100 点 / 元</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 统一换算规则提示条 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center border border-amber-200/60 shrink-0">
          <Coins className="w-4.5 h-4.5" />
        </div>
        <div className="text-xs text-amber-900 leading-relaxed">
          <div className="font-black text-sm mb-0.5">算力点统一定价与赠送规则</div>
          <div>{POINT_RATE_HINT}</div>
          <div className="mt-1 text-blue-700 font-bold flex items-center gap-1">
            <span>🎁 新开通空间福利：</span>
            <span>每个新开通/创建的工作空间，系统将自动免费赠送 100 算力点启动额度。</span>
          </div>
          <div className="mt-0.5 text-amber-700 font-bold">
            售价不符合规则的加油包会在卡片上标红显示。
          </div>
        </div>
      </div>

      {/* 算力加油包数据卡片阵列 */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl text-center border text-xs text-slate-400 font-bold">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
          正在拉取算力加油包配置数据库...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packs.map((pack) => (
            <div
              key={pack.id}
              className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md relative ${
                !pack.isActive ? "opacity-60 border-slate-200 bg-slate-50/50" : "border-slate-200"
              }`}
            >
              {pack.isPopular && (
                <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-400 text-slate-950 font-black text-[10px] px-3 py-1 rounded-bl-xl shadow-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3 fill-slate-950" />
                  <span>热销推荐</span>
                </div>
              )}

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-xs border"
                    style={{ backgroundColor: `${pack.color}15`, borderColor: `${pack.color}30` }}
                  >
                    <span>{pack.icon}</span>
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">{pack.name}</h3>
                    <span className="text-[10px] font-bold text-slate-400 font-mono">ID: {pack.id}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 font-medium min-h-[36px] line-clamp-2">
                  {pack.description || "暂无描述说明"}
                </p>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">算力点配额:</span>
                    <strong className="font-mono text-slate-900 text-sm font-black">{pack.points.toLocaleString()} 点</strong>
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-slate-200/60 pt-2 gap-2">
                    <span className="text-slate-500 font-bold shrink-0">划拨售价 <span className="text-[11px] text-slate-400 font-normal">(应售 {formatYuanFromPoints(pack.points)})</span>:</span>
                    <strong className={`font-mono text-base font-black shrink-0 whitespace-nowrap ${
                      isPriceMatchingRule(pack.points, pack.price) ? "text-[#3182ce]" : "text-red-500"
                    }`}>
                      ¥&nbsp;{Number(pack.price).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-bold border-t border-slate-200/40 pt-2">
                    <span className="text-slate-500 font-bold">定价规则判定:</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 whitespace-nowrap ${
                      isPriceMatchingRule(pack.points, pack.price)
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-red-100 text-red-700 border border-red-200"
                    }`}>
                      {isPriceMatchingRule(pack.points, pack.price) ? "✓ 符合规则" : "⚠ 价格不符"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleToggleActive(pack)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    pack.isActive
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {pack.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  <span>{pack.isActive ? "已上架" : "已下架"}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(pack)}
                    className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer transition-colors"
                    title="编辑算力包"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(pack.id, pack.name)}
                    className="p-1.5 bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 rounded-lg cursor-pointer transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑 Modal 弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-left font-sans">
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm">{editingPack ? "编辑算力加油包" : "创建全新算力加油包"}</h3>
                  <p className="text-[11px] text-blue-100">数据库持久化配置，更新后将直接在前端充值弹窗生效</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    加油包名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="如：标准算力包、企业加油包"
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    包含算力点数 (Points) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                    placeholder="如：1000, 10000"
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    划拨售价 (元 CNY) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={0.01}
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    placeholder="如：10, 100"
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold leading-tight ${
                      isPriceMatchingRule(formData.points, formData.price) ? "text-emerald-600" : "text-amber-600"
                    }`}>
                      {POINT_RATE_TEXT} ➔ 应售 {formatYuanFromPoints(formData.points)}
                      {isPriceMatchingRule(formData.points, formData.price) ? "（符合）" : "（不符）"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, price: pointsToYuan(formData.points) })}
                      className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-black rounded-md border border-amber-200 cursor-pointer shrink-0"
                    >
                      按规则填入
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">展示图标 (Emoji)</label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    placeholder="⚡, 👑, 🚀"
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">排序权重 (数字小靠前)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.sortOrder}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setFormData({ ...formData, sortOrder: isNaN(val) ? 0 : Math.max(0, val) });
                    }}
                    className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-black text-slate-700 mb-1">加油包描述说明</label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="针对该算力包的特点与优惠提示"
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.isPopular}
                      onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                      className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                    />
                    <span>🔥 设为热门推荐包</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                    />
                    <span>✅ 上架可用</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {submitting ? "正在保存..." : "保存落库"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
