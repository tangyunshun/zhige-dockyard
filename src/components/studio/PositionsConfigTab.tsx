"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, ShieldCheck, Check, Lock, Edit3, Save, Crown } from "lucide-react";
import { useToast } from "@/components/Toast";

// 系统通用标准组件库字典 (当空间组件缺少描述时自动补齐)
const COMPONENT_DICT: Record<string, { name: string; description: string }> = {
  C37: { name: "网页防非法木马与广告植入", description: "自动扫描网页脚本，防止黑客在我们的网站恶意弹窗、强插小广告或窃取 Cookie" },
  C36: { name: "数据库防黑客窃取扫描", description: "自动检测代码中的数据库操作缺陷，堵死黑客通过注入参数篡改修改数据的死角" },
  C21: { name: "网页面积木生成(React)", description: "输入您的排版设计要求，自动生成 TypeScript 说明的 React 网页模块代码" },
  C20: { name: "跨数据库无缝导入与迁移", description: "自动适配不同数据库的语法差异，支持 Oracle/MySQL 等结构一键平移" },
  C18: { name: "数据表结构与关系图设计", description: "输入字段和示意图，自动设计表结构和关联逻辑并生成 ER 实体图" },
  C13: { name: "即时消息WebSocket开发", description: "生成 WebSocket 协议代码，实现客服聊天、多人协同编辑或实时数据更新" },
  C01: { name: "招投标标书自动生成引擎", description: "基于项目需求与商务条款，自动解析并产出符合规范的完整投标方案书" },
  C02: { name: "商务条款偏离度自动比对", description: "智能提取招标文件限制性条款，对比偏离风险并输出对比表格报告" },
  C03: { name: "商务合规与审计风险体检", description: "扫描投标方案中的合规隐患、排他性条款与资质漏洞" },
  C07: { name: "产品需求文档PRD智能分析", description: "解析会议纪要与需求草案，自动转化标准化 PRD 用户故事与验收标准" },
  C08: { name: "原型设计与交互节点生成", description: "基于业务流程自动构建大前端交互原型结构与状态推演说明" },
  C09: { name: "用户旅程与需求变更追踪", description: "全生命周期追溯需求演进、变更历史与影响面评估" },
  C15: { name: "RESTful API接口定义生成", description: "输入业务数据模型，一键导出 Swagger/OpenAPI 标准接口契约描述" },
  C25: { name: "大前端UI响应式组件库生成", description: "基于系统设计规范，生成适配 PC/移动端的 Tailwind 现代风格 UI 组件" },
  C31: { name: "Docker/K8s容器化部署编排", description: "自动生成 Dockerfile 与 Helm Chart 部署配置，支持一键流水线上线" },
  C32: { name: "自动化测试用例与脚本生成", description: "基于接口契约生成单元测试与 E2E 自动化测试用例，覆盖率 90%+" },
  C40: { name: "企业物理安全隔离审计网关", description: "对空间内资产、材料与任务日志进行物理安全隔离与权限边界实时审计" },
};

export interface PositionConfig {
  code: string;
  name: string;
  badge: string;
  colorCls: string;
  icon: string;
  description: string;
  isPreset: boolean;
  status: "ACTIVE" | "DISABLED";
  allowedComponentIds: string[];
}

interface PositionsConfigTabProps {
  workspaceId: string;
  boundComponentIds?: string[];
  boundComponents?: Array<{ id: string; name: string; description: string }>;
  customPositions?: PositionConfig[];
  setCustomPositions?: React.Dispatch<React.SetStateAction<PositionConfig[]>>;
  onSaveToServer?: (positions: PositionConfig[]) => Promise<void>;
}

export default function PositionsConfigTab({
  workspaceId,
  boundComponentIds = [],
  boundComponents = [],
  customPositions: externalPositions,
  setCustomPositions: setExternalPositions,
  onSaveToServer,
}: PositionsConfigTabProps) {
  const toast = useToast();

  // 1. 整理出的最终真实展示组件列表 (100% 无损保留空间装配的全部 15 个组件，绝不遗漏)
  const displayComponents = useMemo(() => {
    // 若外部传入了完整的组件对象数组
    if (boundComponents && boundComponents.length > 0) {
      return boundComponents.map((c) => ({
        id: c.id,
        name: c.name || COMPONENT_DICT[c.id]?.name || `组件 ${c.id}`,
        description: c.description || COMPONENT_DICT[c.id]?.description || "研发效能自动化工具组件",
      }));
    }
    // 若外部传入了 ID 列表
    if (boundComponentIds && boundComponentIds.length > 0) {
      return boundComponentIds.map((idStr) => {
        const cleanId = idStr.trim();
        const dictMeta = COMPONENT_DICT[cleanId.toUpperCase()] || COMPONENT_DICT[cleanId];
        return {
          id: cleanId,
          name: dictMeta?.name || `装配组件 ${cleanId}`,
          description: dictMeta?.description || "企业空间装配的自动化效能工具组件",
        };
      });
    }
    // 默认全量列表
    return Object.entries(COMPONENT_DICT).map(([id, meta]) => ({
      id,
      name: meta.name,
      description: meta.description,
    }));
  }, [boundComponents, boundComponentIds]);

  // 2. 8 大标准企业核心岗位 (包含【空间所有者 OWNER】与【空间管理员 ADMIN】)
  const presetPositions: PositionConfig[] = useMemo(
    () => [
      {
        code: "OWNER",
        name: "空间所有者 / 企业创始人",
        badge: "空间所有者",
        colorCls: "bg-amber-50 text-amber-700 border-amber-200",
        icon: "👑",
        description: "空间拥有者与企业最高决策者，具备全量项目资产与工具组件的最高管控权限",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "ADMIN",
        name: "空间管理员 / 研发总监",
        badge: "空间管理员",
        colorCls: "bg-blue-50 text-blue-700 border-blue-200",
        icon: "🛡️",
        description: "空间日常运维与部门管理总负责人，具备岗位授权与组件装配的管理权限",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "PROJECT_MANAGER",
        name: "项目经理 / 交付负责人",
        badge: "业务调度",
        colorCls: "bg-purple-50 text-purple-600 border-purple-200",
        icon: "💼",
        description: "项目进度、资源与工期排布负责人，具备核心业务与开发组件的调度全权",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "BIDDING_EXPERT",
        name: "投标专家 / 商务方案师",
        badge: "商务打单",
        colorCls: "bg-sky-50 text-sky-600 border-sky-200",
        icon: "📄",
        description: "商机前期对接、招标文件解析、投标偏离对比与商务安全体检",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "PRODUCT_MANAGER",
        name: "产品经理 / 需求分析师",
        badge: "需求设计",
        colorCls: "bg-emerald-50 text-emerald-600 border-emerald-200",
        icon: "🧩",
        description: "产品原型设计、会议纪要生成 PRD、需求变更追踪与生命周期规划",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "UI_UX_DESIGNER",
        name: "UI/UX 视觉设计师",
        badge: "界面视觉",
        colorCls: "bg-pink-50 text-pink-600 border-pink-200",
        icon: "📐",
        description: "大前端 UI 画布生成、视觉风格设计、交互规范与界面组件库维护",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "DEV_ENGINEER",
        name: "后端开发工程师",
        badge: "核心研发",
        colorCls: "bg-orange-50 text-orange-600 border-orange-200",
        icon: "💻",
        description: "核心业务 API 设计、数据库建模与微服务架构实现",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
      {
        code: "QA_TEST_ENGINEER",
        name: "测试与质量保障工程师",
        badge: "质量守门",
        colorCls: "bg-indigo-50 text-indigo-600 border-indigo-200",
        icon: "✅",
        description: "自动化测试用例生成、链路压测、漏洞防护与质量演练",
        isPreset: true,
        status: "ACTIVE",
        allowedComponentIds: displayComponents.map((c) => c.id),
      },
    ],
    [displayComponents]
  );

  const [internalPositions, setInternalPositions] = useState<PositionConfig[]>(presetPositions);

  // 组合父级与内部状态，确保自定义岗位不遗失
  const positions: PositionConfig[] = useMemo(() => {
    if (!externalPositions || externalPositions.length === 0) {
      return internalPositions;
    }
    // 确保 OWNER 和 ADMIN 始终位于列表最顶部
    const hasOwner = externalPositions.some((p) => p.code === "OWNER");
    const hasAdmin = externalPositions.some((p) => p.code === "ADMIN");

    if (!hasOwner || !hasAdmin) {
      const missingPresets = presetPositions.filter((p) => !externalPositions.some((ex) => ex.code === p.code));
      return [...missingPresets, ...externalPositions];
    }
    return externalPositions || internalPositions;
  }, [externalPositions, internalPositions, presetPositions]);

  const updatePositions = (newPosList: PositionConfig[]) => {
    if (setExternalPositions) {
      setExternalPositions(newPosList);
    }
    setInternalPositions(newPosList);
  };

  const [activePosCode, setActivePosCode] = useState<string>("OWNER");
  const [saving, setSaving] = useState(false);

  // 左侧岗位列表 10 条/页 分页控制
  const [posCurrentPage, setPosCurrentPage] = useState<number>(1);
  const [searchPosQuery, setSearchPosQuery] = useState("");

  // 右侧组件授权 10 条/页 分页控制 & 搜索
  const [compCurrentPage, setCompCurrentPage] = useState<number>(1);
  const [compSearchQuery, setCompSearchQuery] = useState("");

  // 模态框控制
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPosName, setNewPosName] = useState("");
  const [newPosBadge, setNewPosBadge] = useState("");
  const [newPosIcon, setNewPosIcon] = useState("🚀");
  const [newPosDesc, setNewPosDesc] = useState("");

  // 编辑岗位基础属性 Modal State
  const [editingPos, setEditingPos] = useState<PositionConfig | null>(null);
  const [editName, setEditName] = useState("");
  const [editBadge, setEditBadge] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // 切换岗位/搜索/过滤时自动重置页码为第 1 页
  useEffect(() => {
    setCompCurrentPage(1);
  }, [activePosCode, compSearchQuery]);

  // 获取当前选中的岗位
  const activePos = useMemo(() => {
    return positions.find((p) => p.code === activePosCode) || positions[0];
  }, [positions, activePosCode]);

  // 搜索过滤后的岗位列表
  const filteredPositions = useMemo(() => {
    if (!searchPosQuery.trim()) return positions;
    const q = searchPosQuery.toLowerCase();
    return positions.filter(
      (p) => p.name.toLowerCase().includes(q) || p.badge.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [positions, searchPosQuery]);

  // 岗位 10 条/页 切片 (精准计算页数)
  const totalPosPages = Math.ceil(filteredPositions.length / 10) || 1;
  const paginatedPositions = useMemo(() => {
    const start = (posCurrentPage - 1) * 10;
    return filteredPositions.slice(start, start + 10);
  }, [filteredPositions, posCurrentPage]);

  // 搜索过滤后的组件列表 (精确保留全部 15 个组件)
  const filteredComponents = useMemo(() => {
    if (!compSearchQuery.trim()) return displayComponents;
    const q = compSearchQuery.toLowerCase();
    return displayComponents.filter(
      (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
    );
  }, [displayComponents, compSearchQuery]);

  // 右侧组件授权打勾列表 10 条/页 切片 (第 1 页 10 条，第 2 页 5 条，精准全无损)
  const totalCompPages = Math.ceil(filteredComponents.length / 10) || 1;
  const paginatedComponents = useMemo(() => {
    const start = (compCurrentPage - 1) * 10;
    return filteredComponents.slice(start, start + 10);
  }, [filteredComponents, compCurrentPage]);

  // 超级特权岗位判定 (OWNER / ADMIN / PROJECT_MANAGER 默认获得最高全权)
  const isSuperPrivilegedPos = activePos?.code === "OWNER" || activePos?.code === "ADMIN" || activePos?.code === "PROJECT_MANAGER";

  // 当前选中岗位的允许组件 ID 列表 (包含全量判空保底)
  const activeAllowedIds = useMemo(() => {
    if (Array.isArray(activePos?.allowedComponentIds)) {
      return activePos.allowedComponentIds;
    }
    return displayComponents.map((c) => c.id);
  }, [activePos, displayComponents]);

  // 计算授权覆盖率
  const allowedCount = isSuperPrivilegedPos ? displayComponents.length : activeAllowedIds.length;
  const allowRate = displayComponents.length > 0 ? Math.round((allowedCount / displayComponents.length) * 100) : 100;

  // 切换某组件授权状态
  const handleToggleCompAllowed = (compItemId: string) => {
    if (isSuperPrivilegedPos) return;

    const nextPositions = positions.map((p) => {
      if (p.code !== activePosCode) return p;
      const currentList = Array.isArray(p.allowedComponentIds) ? p.allowedComponentIds : displayComponents.map((c) => c.id);
      const exist = currentList.includes(compItemId);
      const nextIds = exist
        ? currentList.filter((id) => id !== compItemId)
        : [...currentList, compItemId];
      return { ...p, allowedComponentIds: nextIds };
    });

    updatePositions(nextPositions);
  };

  // 一键全选当前过滤出的组件
  const handleSelectAllFiltered = () => {
    if (isSuperPrivilegedPos) return;
    const idsToAdd = filteredComponents.map((c) => c.id);
    const nextPositions = positions.map((p) => {
      if (p.code !== activePosCode) return p;
      const currentList = Array.isArray(p.allowedComponentIds) ? p.allowedComponentIds : displayComponents.map((c) => c.id);
      const merged = Array.from(new Set([...currentList, ...idsToAdd]));
      return { ...p, allowedComponentIds: merged };
    });

    updatePositions(nextPositions);
    toast.success("已开启当前筛选组件的授权");
  };

  // 一键清空当前过滤出的组件
  const handleClearAllFiltered = () => {
    if (isSuperPrivilegedPos) return;
    const idsToRemove = new Set(filteredComponents.map((c) => c.id));
    const nextPositions = positions.map((p) => {
      if (p.code !== activePosCode) return p;
      const currentList = Array.isArray(p.allowedComponentIds) ? p.allowedComponentIds : displayComponents.map((c) => c.id);
      return {
        ...p,
        allowedComponentIds: currentList.filter((id) => !idsToRemove.has(id)),
      };
    });

    updatePositions(nextPositions);
    toast.success("已取消当前筛选组件的授权");
  };

  // 切换岗位启用/禁用状态
  const handleTogglePosStatus = (code: string, posName: string) => {
    if (code === "OWNER" || code === "ADMIN" || code === "PROJECT_MANAGER") {
      toast.warning(`【${posName}】为核心管理岗位，禁止禁用`);
      return;
    }

    const nextPositions = positions.map((p) => {
      if (p.code !== code) return p;
      const nextStatus: "ACTIVE" | "DISABLED" = p.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      toast.info(`已将岗位「${posName}」状态切换为: ${nextStatus === "ACTIVE" ? "启用" : "禁用"}`);
      return { ...p, status: nextStatus };
    });

    updatePositions(nextPositions);
  };

  // 新增自定义岗位
  const handleCreatePosition = () => {
    if (!newPosName.trim()) {
      toast.warning("请输入自定义岗位名称");
      return;
    }

    const newCode = `CUSTOM_POS_${Date.now()}`;
    const newPosObj: PositionConfig = {
      code: newCode,
      name: newPosName.trim(),
      badge: newPosBadge.trim() || "自定义岗位",
      colorCls: "bg-slate-100 text-slate-700 border-slate-300",
      icon: newPosIcon || "🚀",
      description: newPosDesc.trim() || "团队自定义扩展研发效能岗位",
      isPreset: false,
      status: "ACTIVE",
      allowedComponentIds: displayComponents.map((c) => c.id),
    };

    const nextPositions = [...positions, newPosObj];
    updatePositions(nextPositions);

    setActivePosCode(newCode);
    setShowCreateModal(false);
    setNewPosName("");
    setNewPosBadge("");
    setNewPosIcon("🚀");
    setNewPosDesc("");

    toast.success(`已创建自定义岗位「${newPosObj.name}」，已默认继承全量授权`);
  };

  // 删除自定义岗位
  const handleDeletePosition = (code: string, name: string) => {
    const nextPositions = positions.filter((p) => p.code !== code);
    updatePositions(nextPositions);

    if (activePosCode === code) {
      setActivePosCode("OWNER");
    }
    toast.success(`已成功删除自定义岗位「${name}」`);
  };

  // 打开编辑 Modal
  const handleOpenEditModal = (pos: PositionConfig) => {
    setEditingPos(pos);
    setEditName(pos.name);
    setEditBadge(pos.badge);
    setEditIcon(pos.icon);
    setEditDesc(pos.description);
  };

  // 保存基础属性编辑
  const handleSaveEditPosition = () => {
    if (!editingPos) return;
    if (!editName.trim()) {
      toast.warning("岗位名称不能为空");
      return;
    }

    const nextPositions = positions.map((p) => {
      if (p.code !== editingPos.code) return p;
      return {
        ...p,
        name: editName.trim(),
        badge: editBadge.trim() || p.badge,
        icon: editIcon || p.icon,
        description: editDesc.trim() || p.description,
      };
    });

    updatePositions(nextPositions);
    setEditingPos(null);
    toast.success(`已保存岗位「${editName}」基础信息`);
  };

  // 保存整体岗位授权矩阵至后端
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      if (onSaveToServer) {
        await onSaveToServer(positions);
        return;
      }

      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          action: "save-positions",
          workspaceId,
          positions,
        }),
      });

      if (res.ok) {
        toast.success("已成功保存企业岗位与组件授权矩阵！规则已即时生效");
      } else {
        const json = await res.json();
        toast.error(json.error || "保存配置失败");
      }
    } catch (e) {
      toast.error("网络请求异常，保存失败");
    } finally {
      setSaving(false);
    }
  };

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
              企业岗位与组件授权配置中心
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              为团队岗位（空间所有者、空间管理员、项目经理、架构师、前端/后端、测试等）灵活分配装配工具的使用权限。
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>新增自定义岗位</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="px-3.5 py-1.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold rounded-lg transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? "保存中..." : "保存权限配置"}</span>
          </button>
        </div>
      </div>

      {/* 主体两栏布局：左侧岗位列表 + 右侧组件授权打勾矩阵 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* 左侧：岗位列表 (卡片固定 640px 高度，底栏 100% 水平对齐) */}
        <div className="md:col-span-5 bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs flex flex-col justify-between h-[640px]">
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                  岗位列表 ({filteredPositions.length})
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">
                  共 {positions.length} 个岗位
                </span>
              </div>

              {/* 岗位关键字搜索 */}
              <div className="relative w-full">
                <input
                  type="text"
                  value={searchPosQuery}
                  onChange={(e) => {
                    setSearchPosQuery(e.target.value);
                    setPosCurrentPage(1);
                  }}
                  placeholder="🔍 搜索岗位名称、Badge 标识..."
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

            {/* 岗位列表区 */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-1 py-1">
              {paginatedPositions.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  未找到匹配的岗位，可点击右上角新建。
                </div>
              ) : (
                paginatedPositions.map((pos) => {
                  const isActive = pos.code === activePosCode;
                  return (
                    <div
                      key={pos.code}
                      onClick={() => setActivePosCode(pos.code)}
                      className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex items-center justify-between gap-3 ${
                        isActive
                          ? "bg-[#3182ce]/10 border-[#3182ce] shadow-md ring-2 ring-[#3182ce]/20"
                          : "bg-white border-slate-200/80 hover:bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-2xl leading-none shrink-0">{pos.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-extrabold text-sm text-slate-900 truncate">{pos.name}</h4>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 ${pos.colorCls}`}>
                              {pos.badge}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium truncate mt-1">{pos.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(pos);
                          }}
                          title="编辑岗位基础属性信息"
                          className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePosStatus(pos.code, pos.name);
                          }}
                          title={pos.status === "DISABLED" ? "点击启用岗位" : "点击禁用岗位"}
                          className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                            pos.status === "DISABLED"
                              ? "bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          {pos.status === "DISABLED" ? "⏸️ 禁用" : "🟢 启用"}
                        </button>
                        {!pos.isPreset && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePosition(pos.code, pos.name);
                            }}
                            title="删除自定义岗位"
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

          {/* 左侧 10 条/页 分页控制 Bar (底部固定，水平齐平) */}
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

        {/* 右侧：组件授权矩阵表格 (与左侧固定 640px 高度并绝对水平对齐，完整渲染全部 15 个组件) */}
        <div className="md:col-span-7 bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs flex flex-col justify-between h-[640px]">
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="space-y-3 pb-3 border-b border-slate-100 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-2xl">{activePos?.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-slate-900 truncate">
                        【{activePos?.name}】组件授权配置
                      </h4>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${activePos?.colorCls}`}>
                        {activePos?.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                      {isSuperPrivilegedPos
                        ? "🛡️ 空间所有者/管理员/项目经理默认拥有全量工具最高使用权限"
                        : "勾选即可开启该岗位的使用权限，取消勾选即禁止使用"}
                    </p>
                  </div>
                </div>

                {/* 授权覆盖率进度 */}
                <div className="text-right shrink-0 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 block">权限开启覆盖率</span>
                  <span className="text-sm font-black font-mono text-[#3182ce]">
                    {allowRate}% <span className="text-[10px] font-normal text-slate-500">({allowedCount}/{displayComponents.length})</span>
                  </span>
                </div>
              </div>

              {/* 搜索框与快捷一键全选操作 Bar */}
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

                {!isSuperPrivilegedPos && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      全选当前
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllFiltered}
                      className="px-2.5 py-1 text-[11px] font-black bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      清空当前
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 组件授权组件列表 (100% 完整展示 15 个真实装配组件) */}
            <div className="space-y-2 flex-1 overflow-y-auto pr-1 py-1">
              {paginatedComponents.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs font-semibold">
                  未找到匹配的组件，请尝试更换搜索关键字。
                </div>
              ) : (
                paginatedComponents.map((comp) => {
                  const isAllowed = isSuperPrivilegedPos || activeAllowedIds.includes(comp.id);

                  return (
                    <div
                      key={comp.id}
                      onClick={() => !isSuperPrivilegedPos && handleToggleCompAllowed(comp.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isSuperPrivilegedPos
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
                        {isSuperPrivilegedPos ? (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-blue-50/90 text-[#3182ce] border border-blue-200/80 inline-flex items-center gap-1 shadow-2xs">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" /> 默认全员可用 (超管全权)
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

          {/* 右侧 10 条/页 分页控制 Bar (第 1 页 10 条，第 2 页 5 条，与左侧完全在同一水平线齐平对齐) */}
          <div className="pt-3 border-t border-slate-100 px-1 shrink-0 flex items-center justify-between h-9">
            <span className="text-[11px] text-slate-400 font-bold">
              第 {compCurrentPage} / {totalCompPages} 页 (共 {filteredComponents.length} 个组件，每页 10 条)
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

      {/* 新增自定义岗位 Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 text-left">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-6 text-left space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#3182ce]" /> 新增企业自定义岗位
              </h4>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">岗位名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newPosName}
                  onChange={(e) => setNewPosName(e.target.value)}
                  placeholder="如：标书解析专家 / API架构师..."
                  className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">岗位 Badge 标识</label>
                  <input
                    type="text"
                    value={newPosBadge}
                    onChange={(e) => setNewPosBadge(e.target.value)}
                    placeholder="如：商务专员"
                    className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">选择岗位图标</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5 max-w-full">
                    {["👑", "🛡️", "🚀", "💻", "🎨", "📊", "🔧", "📦", "👥", "📄"].map((iconStr) => (
                      <button
                        key={iconStr}
                        type="button"
                        onClick={() => setNewPosIcon(iconStr)}
                        className={`w-7 h-7 rounded-lg border text-sm flex items-center justify-center cursor-pointer transition-all ${
                          newPosIcon === iconStr
                            ? "bg-blue-50 border-[#3182ce] shadow-2xs font-bold scale-105"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {iconStr}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newPosIcon}
                    onChange={(e) => setNewPosIcon(e.target.value)}
                    placeholder="或自定义输入 Emoji"
                    className="w-full h-8 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                  />
                </div>
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
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreatePosition}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-blue-500/20"
              >
                创建岗位
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑岗位属性 Modal */}
      {editingPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-6 text-left space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>✏️ 编辑岗位属性 - [{editingPos.name}]</span>
              </h3>
              <button
                onClick={() => setEditingPos(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">岗位名称 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">分类 Badge 标识</label>
                  <input
                    type="text"
                    value={editBadge}
                    onChange={(e) => setEditBadge(e.target.value)}
                    className="w-full h-9 px-3 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">选择/修改岗位图标</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5 max-w-full">
                    {["👑", "🛡️", "💼", "📄", "🧩", "📐", "💻", "✅", "🚀", "📦"].map((iconStr) => (
                      <button
                        key={iconStr}
                        type="button"
                        onClick={() => setEditIcon(iconStr)}
                        className={`w-7 h-7 rounded-lg border text-sm flex items-center justify-center cursor-pointer transition-all ${
                          editIcon === iconStr
                            ? "bg-blue-50 border-[#3182ce] shadow-2xs font-bold scale-105"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {iconStr}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={editIcon}
                    onChange={(e) => setEditIcon(e.target.value)}
                    placeholder="或自定义输入 Emoji"
                    className="w-full h-8 px-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">岗位职责说明</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#3182ce]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPos(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEditPosition}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer shadow-md shadow-blue-500/20"
              >
                保存变更
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
