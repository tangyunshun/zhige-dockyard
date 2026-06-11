"use client";

import { useState } from "react";
import { Search, AlertTriangle, CheckCircle, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  COMPONENTS,
  COMPONENT_CATEGORIES,
  ComponentCategory,
} from "@/constants/components";

interface GlobalComponentConfig {
  id: string;
  name: string;
  status: "ONLINE" | "MAINTENANCE" | "OFFLINE";
  accessLevel: "FREE" | "PRO" | "ENTERPRISE";
}

export default function PlatformComponentsPage() {
  const toast = useToast();
  
  // 初始化组件配置
  const initialConfigs: GlobalComponentConfig[] = COMPONENTS.map((comp) => {
    // C01 和 C07 设置为免费，其余的根据 ID 位置
    const isFree = comp.id === "C01" || comp.id === "C07";
    return {
      id: comp.id,
      name: comp.name,
      status: "ONLINE",
      accessLevel: isFree ? "FREE" : "PRO",
    };
  });

  const [componentConfigs, setComponentConfigs] = useState<GlobalComponentConfig[]>(initialConfigs);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    id: string;
    type: "status" | "access";
    value: string;
  } | null>(null);

  const filteredConfigs = componentConfigs.filter((config) =>
    config.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    config.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 按分类分组组件
  const componentsByCategory: Record<ComponentCategory, GlobalComponentConfig[]> = {} as any;
  Object.keys(COMPONENT_CATEGORIES).forEach((category) => {
    componentsByCategory[category as ComponentCategory] = filteredConfigs.filter((config) =>
      COMPONENTS.find((c) => c.id === config.id)?.category === category
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ONLINE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-700 rounded-[4px]">
            上线
          </span>
        );
      case "MAINTENANCE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-[#f59e0b]/10 text-[#f59e0b] rounded-[4px]">
            维护中
          </span>
        );
      case "OFFLINE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-[4px]">
            下线
          </span>
        );
      default:
        return null;
    }
  };

  const getAccessBadge = (accessLevel: string) => {
    switch (accessLevel) {
      case "FREE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-700 rounded-[4px]">
            免费
          </span>
        );
      case "PRO":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-[#2b6cb0]/10 text-[#2b6cb0] rounded-[4px]">
            专业版
          </span>
        );
      case "ENTERPRISE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-purple-100 text-purple-700 rounded-[4px]">
            企业版
          </span>
        );
      default:
        return null;
    }
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    setPendingChange({ id, type: "status", value: newStatus });
    setShowConfirmModal(true);
  };

  const handleAccessLevelChange = (id: string, newLevel: string) => {
    setPendingChange({ id, type: "access", value: newLevel });
    setShowConfirmModal(true);
  };

  const confirmChange = () => {
    if (!pendingChange) return;

    setComponentConfigs((prev) =>
      prev.map((config) => {
        if (config.id === pendingChange.id) {
          return {
            ...config,
            ...(pendingChange.type === "status"
              ? { status: pendingChange.value as any }
              : { accessLevel: pendingChange.value as any }),
          };
        }
        return config;
      })
    );

    toast.success(
      pendingChange.type === "status" 
        ? "组件状态已更新"
        : "组件访问级别已更新"
    );
    setShowConfirmModal(false);
    setPendingChange(null);
  };

  const getPendingComponent = () => {
    if (!pendingChange) return null;
    return componentConfigs.find((c) => c.id === pendingChange.id);
  };

  const pendingComponent = getPendingComponent();

  return (
    <div className="space-y-6">
      {/* 页面标题和搜索 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">组件全局调度中枢</h1>
          <p className="text-sm text-slate-500 mt-1">
            控制 53 个原子组件的全局开关、权限级别和维护状态
          </p>
        </div>
        <div className="w-full sm:w-80">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索组件 ID 或名称"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-[8px] text-sm focus:outline-none focus:border-[#2b6cb0] focus:ring-2 focus:ring-[#2b6cb0]/20"
            />
          </div>
        </div>
      </div>

      {/* 组件列表 */}
      <div className="space-y-6">
        {Object.entries(COMPONENT_CATEGORIES).map(([category, categoryInfo]) => {
          const categoryComponents = componentsByCategory[category as ComponentCategory];
          if (categoryComponents.length === 0) return null;

          return (
            <div
              key={category}
              className="bg-white rounded-[8px] border border-slate-100 shadow-sm overflow-hidden"
            >
              {/* 分类标题 */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-[4px] flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: categoryInfo.color }}
                  >
                    {categoryInfo.range}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800">
                      {categoryInfo.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {categoryComponents.length} 个组件
                    </p>
                  </div>
                </div>
              </div>

              {/* 分类组件表格 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider py-3 px-6">
                        组件 ID
                      </th>
                      <th className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider py-3 px-6">
                        组件名称
                      </th>
                      <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3 px-6">
                        状态
                      </th>
                      <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3 px-6">
                        访问级别
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categoryComponents.map((config) => {
                      const originalComponent = COMPONENTS.find(
                        (c) => c.id === config.id
                      );
                      return (
                        <tr
                          key={config.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="py-4 px-6 text-sm font-bold text-slate-700">
                            {config.id}
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{originalComponent?.icon}</span>
                              <span className="text-sm font-bold text-slate-800">
                                {config.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {getStatusBadge(config.status)}
                              <select
                                value={config.status}
                                onChange={(e) =>
                                  handleStatusChange(config.id, e.target.value)
                                }
                                className="text-xs border border-slate-200 rounded-[4px] px-2 py-1 focus:outline-none focus:border-[#2b6cb0]"
                              >
                                <option value="ONLINE">上线</option>
                                <option value="MAINTENANCE">维护中</option>
                                <option value="OFFLINE">下线</option>
                              </select>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {getAccessBadge(config.accessLevel)}
                              <select
                                value={config.accessLevel}
                                onChange={(e) =>
                                  handleAccessLevelChange(config.id, e.target.value)
                                }
                                className="text-xs border border-slate-200 rounded-[4px] px-2 py-1 focus:outline-none focus:border-[#2b6cb0]"
                              >
                                <option value="FREE">免费</option>
                                <option value="PRO">专业版</option>
                                <option value="ENTERPRISE">企业版</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* 确认弹窗 */}
      {showConfirmModal && pendingComponent && pendingChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-[8px] shadow-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => {
                setShowConfirmModal(false);
                setPendingChange(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-12 h-12 rounded-[8px] flex items-center justify-center ${
                    pendingChange.type === "status" && pendingChange.value === "OFFLINE"
                      ? "bg-gradient-to-br from-red-400 to-red-600"
                      : "bg-gradient-to-br from-[#f59e0b] to-[#d97706]"
                  }`}
                >
                  {pendingChange.type === "status" && pendingChange.value === "OFFLINE" ? (
                    <AlertTriangle className="w-6 h-6 text-white" />
                  ) : (
                    <CheckCircle className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    {pendingChange.type === "status"
                      ? "确认修改组件状态？"
                      : "确认修改访问级别？"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {pendingComponent.id} - {pendingComponent.name}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    当前设置
                  </label>
                  <div className="p-3 bg-slate-50 rounded-[4px] text-sm text-slate-600">
                    {pendingChange.type === "status" ? (
                      getStatusBadge(pendingComponent.status)
                    ) : (
                      getAccessBadge(pendingComponent.accessLevel)
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    新设置
                  </label>
                  <div className="p-3 bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-[4px] text-sm font-bold text-[#f59e0b]">
                    {pendingChange.type === "status"
                      ? pendingChange.value === "ONLINE"
                        ? "上线"
                        : pendingChange.value === "MAINTENANCE"
                        ? "维护中"
                        : "下线"
                      : pendingChange.value === "FREE"
                      ? "免费"
                      : pendingChange.value === "PRO"
                      ? "专业版"
                      : "企业版"}
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  {pendingChange.type === "status" && pendingChange.value === "OFFLINE"
                    ? "此操作将使所有用户无法访问该组件，组件集市将显示为不可用状态。"
                    : pendingChange.type === "status" && pendingChange.value === "MAINTENANCE"
                    ? "此操作将使所有用户看到维护中提示，组件集市将显示维护状态。"
                    : "此操作将影响所有用户在组件集市中看到的该组件的访问权限标识。"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingChange(null);
                }}
                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={confirmChange}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-md transition-all"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
