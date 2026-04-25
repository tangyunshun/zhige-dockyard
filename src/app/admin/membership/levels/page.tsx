"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
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
  Zap,
  TrendingUp,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";

interface MembershipLevel {
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
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
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
  features: string;
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  sortOrder: number;
  isActive: boolean;
}

export default function AdminMembershipLevelsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState<MembershipLevel[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<MembershipLevel | null>(null);
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
    features: "",
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 0,
    sortOrder: 0,
    isActive: true,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadLevels();
  }, []);

  const loadLevels = async () => {
    try {
      setLoading(true);
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      
      console.log("Loading levels with userId:", userId);
      
      const res = await fetch("/api/admin/membership/levels", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      
      console.log("Response status:", res.status, res.ok);
      
      if (res.ok) {
        const data = await res.json();
        console.log("Levels data:", data);
        setLevels(data.data);
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
      toast.error("加载失败: " + (error instanceof Error ? error.message : "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm("确定要删除这个会员等级吗？")) return;

    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch(`/api/admin/membership/levels/${name}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        toast.success("删除成功");
        loadLevels();
      } else {
        const error = await res.json();
        toast.error(error.message || "删除失败");
      }
    } catch (error) {
      console.error("Delete level error:", error);
      toast.error("删除失败");
    }
  };

  const handleToggleActive = async (name: string, isActive: boolean) => {
    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const res = await fetch(`/api/admin/membership/levels/${name}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          isActive: !isActive,
        }),
      });

      if (res.ok) {
        toast.success(isActive ? "已禁用" : "已启用");
        loadLevels();
      } else {
        toast.error("操作失败");
      }
    } catch (error) {
      console.error("Toggle active error:", error);
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
      features: "",
      priceMonthly: 0,
      priceYearly: 0,
      trialDays: 0,
      sortOrder: 0,
      isActive: true,
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
      features: Array.isArray(level.features) ? level.features.join("\n") : "",
      priceMonthly: level.priceMonthly,
      priceYearly: level.priceYearly,
      trialDays: level.trialDays,
      sortOrder: level.sortOrder,
      isActive: level.isActive,
    });
    setEditingLevel(level);
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    // 验证必填字段
    if (!formData.name || !formData.nameZh) {
      toast.error("请填写等级标识和中文名称");
      return;
    }

    // 验证等级标识格式
    if (!/^[A-Z_]+$/.test(formData.name)) {
      toast.error("等级标识只能包含大写字母和下划线");
      return;
    }

    setSubmitting(true);

    try {
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const url = editingLevel
        ? `/api/admin/membership/levels/${formData.name}`
        : "/api/admin/membership/levels";

      const method = editingLevel ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          ...formData,
          maxStorage: formData.maxStorage * 1073741824, // 转换为字节
          features: formData.features
            ? formData.features.split("\n").filter((f) => f.trim())
            : [],
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(editingLevel ? "更新成功" : "创建成功");
        setShowCreateModal(false);
        loadLevels();
      } else {
        toast.error(data.message || "操作失败");
      }
    } catch (error) {
      console.error("Submit level error:", error);
      toast.error("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">返回</span>
            </button>
            <h1 className="text-xl font-bold text-slate-800">会员等级管理</h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 操作栏 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索会员等级..."
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
              />
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg font-bold text-sm hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>新增会员等级</span>
          </button>
        </div>

        {/* 会员等级列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                    等级信息
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                    配额配置
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                    价格
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-bold text-slate-700">
                    状态
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-bold text-slate-700">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {levels.map((level) => (
                  <tr key={level.name} className="hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                          style={{ backgroundColor: `${level.color}20` }}
                        >
                          {level.icon || "👤"}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">
                            {level.nameZh}
                          </div>
                          <div className="text-xs text-slate-500">
                            {level.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-slate-600 space-y-1">
                        <div>企业空间：{Number(level.maxEnterpriseWorkspaces)}个</div>
                        <div>组件：{Number(level.maxComponents)}个</div>
                        <div>团队：{Number(level.maxTeamSize)}人</div>
                        <div>存储：{(Number(level.maxStorage) / 1073741824).toFixed(1)}GB</div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-slate-600">
                        <div>月付：¥{level.priceMonthly / 100}</div>
                        <div>年付：¥{level.priceYearly / 100}</div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <button
                        onClick={() => handleToggleActive(level.name, level.isActive)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                          level.isActive
                            ? "bg-[#10b981]/10 text-[#10b981]"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {level.isActive ? (
                          <>
                            <Check className="w-3 h-3" />
                            已启用
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3" />
                            已禁用
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(level)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(level.name)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* 创建/编辑弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">
                {editingLevel ? "编辑会员等级" : "新增会员等级"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      等级标识 *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value.toUpperCase() })
                      }
                      disabled={!!editingLevel}
                      placeholder="如：FREE, BRONZE, SILVER"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      中文名称 *
                    </label>
                    <input
                      type="text"
                      value={formData.nameZh}
                      onChange={(e) =>
                        setFormData({ ...formData, nameZh: e.target.value })
                      }
                      placeholder="如：免费版，青铜版"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      图标
                    </label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) =>
                        setFormData({ ...formData, icon: e.target.value })
                      }
                      placeholder="👑"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      主题色
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={formData.color}
                        onChange={(e) =>
                          setFormData({ ...formData, color: e.target.value })
                        }
                        className="w-12 h-10 border border-slate-200 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={formData.color}
                        onChange={(e) =>
                          setFormData({ ...formData, color: e.target.value })
                        }
                        placeholder="#3182ce"
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      描述
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      rows={2}
                      placeholder="会员等级描述"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 配额配置 */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">配额配置</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      个人空间数量
                    </label>
                    <input
                      type="number"
                      value={formData.maxPersonalWorkspaces}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxPersonalWorkspaces: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      企业空间数量
                    </label>
                    <input
                      type="number"
                      value={formData.maxEnterpriseWorkspaces}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxEnterpriseWorkspaces: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      组件数量上限
                    </label>
                    <input
                      type="number"
                      value={formData.maxComponents}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxComponents: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      团队规模上限（人）
                    </label>
                    <input
                      type="number"
                      value={formData.maxTeamSize}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxTeamSize: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      存储空间（GB）
                    </label>
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      每月 API 调用次数
                    </label>
                    <input
                      type="number"
                      value={formData.maxApiCalls}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxApiCalls: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 价格配置 */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">价格配置</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      月付价格（元）
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      年付价格（元）
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      试用天数
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      排序
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                </div>
              </div>

              {/* 功能权益 */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">功能权益</h3>
                <textarea
                  value={formData.features}
                  onChange={(e) =>
                    setFormData({ ...formData, features: e.target.value })
                  }
                  rows={4}
                  placeholder="每行一个功能权益描述"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                />
              </div>

              {/* 状态 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce]"
                  />
                  <span className="text-sm font-medium text-slate-700">启用该会员等级</span>
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg font-bold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {editingLevel ? "更新" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
