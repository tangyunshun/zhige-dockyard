"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  ShieldCheck,
  X,
  ExternalLink,
  Edit2,
  Plus,
  Loader2,
  CheckCircle2,
  Sparkles,
  Layers,
  Users,
  Check,
  Zap,
} from "lucide-react";
import { PostIcon } from "./PostIcon";

export interface UsedWorkspaceInfo {
  id: string;
  name: string;
  type?: string;
  memberCount: number;
}

export interface StandardPostDetailData {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon?: string | null;
  status: "ACTIVE" | "DISABLED" | string;
  sortOrder?: number;
  usageCount?: number;
  totalAssignedMembers?: number;
  usedWorkspaces?: UsedWorkspaceInfo[];
  createdAt?: string;
  updatedAt?: string;
}

interface RecommendedComponent {
  code: string;
  name: string;
  description: string;
  tag: string;
}

interface RolePresetInfo {
  category: string;
  teamScope: string;
  tags: string[];
  roleAdvice: string;
  components: RecommendedComponent[];
}

// 针对全平台核心标准岗位的开箱即用组件赋权范式映射
const POST_PRESET_MAP: Record<string, RolePresetInfo> = {
  SECURITY_OFFICER: {
    category: "安全审计与合规治理",
    teamScope: "安全合规中心 / 审计治理组",
    tags: ["全域安全", "权限隔离", "等保密评", "漏洞治理", "静态审计"],
    roleAdvice: "适合企业安全架构师、合规审计员或 CSO 团队担任，统筹企业空间全域数据合规与攻防审计。",
    components: [
      { code: "C02", name: "方案安全合规体检", description: "深度扫描技术方案，判定是否符合等保与密评要求", tag: "安全合规" },
      { code: "C01", name: "招标文件智能解析", description: "自动提取关键合规资质要求与偏离风险项", tag: "风险管控" },
      { code: "C11", name: "后端数据接口自动开发", description: "生成严格遵循安全参数校验与鉴权签名的 API 代码", tag: "合规开发" },
      { code: "C28", name: "代码漏洞与敏感数据雷达", description: "排查硬编码凭据、未鉴权端点及数据越权风险", tag: "漏洞审计" },
    ],
  },
  QA_ENGINEER: {
    category: "质量工程与交付门禁",
    teamScope: "测试工程部 / QA 质量保障中心",
    tags: ["质量度量", "自动化测试", "并发压测", "发布门禁", "用例推演"],
    roleAdvice: "适合测试主管、自动化测试工程师与交付质量把控者担任，构建全流程防衰退门禁体系。",
    components: [
      { code: "C05", name: "全链路测试用例自动生成", description: "基于需求与接口契约自动衍生高覆盖度正异常用例", tag: "用例工程" },
      { code: "C09", name: "自动化回归测试流水线", description: "集成全量接口契约探测与端到端核心路径健康检查", tag: "自动化流水线" },
      { code: "C22", name: "并发性能与负载压测评估", description: "模拟海量并发突发流量，评估吞吐极限与延时水位", tag: "性能评测" },
      { code: "C02", name: "方案安全合规体检", description: "严格把关各迭代上线前的安全准入与漏洞规避标准", tag: "发布门禁" },
    ],
  },
  FULLSTACK_DEV: {
    category: "全栈开发与业务落地",
    teamScope: "核心研发部 / 业务交付团队",
    tags: ["全栈研发", "业务闭环", "接口契约", "数据驱动", "前端工程"],
    roleAdvice: "适合独立交付工程师、全栈研发专家担任，承揽端到端业务闭环与前后端数据流打通。",
    components: [
      { code: "C11", name: "后端数据接口自动开发", description: "输入实体模型即可自动输出带参数校验的高性能接口代码", tag: "接口工程" },
      { code: "C12", name: "接口数据关联设计", description: "快速梳理实体血缘关系，自动输出规范契约与关联图", tag: "数据设计" },
      { code: "C07", name: "会议纪要自动转需求(PRD)", description: "高效整理业务沟通记录，提炼为清晰敏捷的需求规范", tag: "需求沉淀" },
      { code: "C15", name: "响应式交互视图智能构建", description: "遵循企业统一设计系统，快速生成现代前端交互界面", tag: "前端交互" },
    ],
  },
  SRE_ENGINEER: {
    category: "集群运维与生产韧性",
    teamScope: "基础架构组 / SRE 运维中心",
    tags: ["高可用防护", "混沌工程", "容灾应急", "容量规划", "故障自愈"],
    roleAdvice: "适合基础运维主管、SRE 稳定性工程师担任，主导企业生产可用性防护与应急演练。",
    components: [
      { code: "C22", name: "并发性能与负载压测评估", description: "精准压测系统负载瓶颈，保障大促与流量高峰韧性", tag: "容量规划" },
      { code: "C02", name: "方案安全合规体检", description: "审查生产环境容器网络策略与高防配置合规性", tag: "合规扫描" },
      { code: "C11", name: "运维健康探针接口构建", description: "自动生成容器就绪与存活性自愈探针监控接口", tag: "韧性工程" },
    ],
  },
  FRONTEND_DEV: {
    category: "前端架构与交互体验",
    teamScope: "前端研发部 / 用户体验团队",
    tags: ["UI/UX工程", "状态管理", "响应式适配", "前端性能", "组件化沉淀"],
    roleAdvice: "适合资深前端开发、交互架构师担任，专注高信息密度界面呈现与组件库资产沉淀。",
    components: [
      { code: "C15", name: "响应式交互视图智能构建", description: "遵循知性蓝设计标准生成极简高保真页面", tag: "界面开发" },
      { code: "C12", name: "接口数据关联设计", description: "对齐前后端契约规范，提升数据联调与渲染效率", tag: "契约对齐" },
      { code: "C07", name: "会议纪要自动转需求(PRD)", description: "从需求溯源界面功能逻辑，确保体验闭环", tag: "需求分析" },
    ],
  },
  BACKEND_DEV: {
    category: "后端架构与数据引擎",
    teamScope: "后端研发部 / 分布式架构组",
    tags: ["服务架构", "高并发处理", "数据库调优", "分布式锁", "API设计"],
    roleAdvice: "适合后端工程师、架构师担任，统筹微服务接口开发、数据持久化与高并发治理。",
    components: [
      { code: "C11", name: "后端数据接口自动开发", description: "一键生成稳健的 RESTful API 与数据操作事务逻辑", tag: "核心接口" },
      { code: "C12", name: "接口数据关联设计", description: "构建实体关系模型与索引优化策略，杜绝性能瓶颈", tag: "架构设计" },
      { code: "C22", name: "并发性能与负载压测评估", description: "针对核心热点接口展开极限吞吐压测分析", tag: "接口压测" },
    ],
  },
};

// 智能获取岗位专属的企业预设画像
function getRolePreset(post: StandardPostDetailData): RolePresetInfo {
  const code = (post.code || "").toUpperCase();
  if (POST_PRESET_MAP[code]) {
    return POST_PRESET_MAP[code];
  }

  // 按名称关键词匹配
  const name = post.name || "";
  if (name.includes("安全") || name.includes("合规") || name.includes("审计")) {
    return POST_PRESET_MAP.SECURITY_OFFICER;
  }
  if (name.includes("测试") || name.includes("QA") || name.includes("质检")) {
    return POST_PRESET_MAP.QA_ENGINEER;
  }
  if (name.includes("全栈") || name.includes("独立开发")) {
    return POST_PRESET_MAP.FULLSTACK_DEV;
  }
  if (name.includes("运维") || name.includes("SRE") || name.includes("发布")) {
    return POST_PRESET_MAP.SRE_ENGINEER;
  }
  if (name.includes("前端") || name.includes("UI") || name.includes("交互")) {
    return POST_PRESET_MAP.FRONTEND_DEV;
  }
  if (name.includes("后端") || name.includes("服务端") || name.includes("架构")) {
    return POST_PRESET_MAP.BACKEND_DEV;
  }

  // 默认通用研发协同配置
  return {
    category: "研发效能与业务协同",
    teamScope: "工程研发生态组",
    tags: ["业务协同", "效能提升", "标准化交付", "敏捷迭代"],
    roleAdvice: "适合企业核心研发与业务骨干担任，承接项目关键组件调度与标准化业务交付。",
    components: [
      { code: "C07", name: "会议纪要自动转需求(PRD)", description: "快速沉淀沟通纪要为可落地的标准化需求", tag: "协同提效" },
      { code: "C11", name: "后端数据接口自动开发", description: "自动生成标准数据读写与参数校验接口代码", tag: "研发支撑" },
      { code: "C12", name: "接口数据关联设计", description: "规范业务实体关联，梳理流转契约", tag: "数据规范" },
    ],
  };
}

interface StandardPostDetailModalProps {
  post: StandardPostDetailData;
  onClose: () => void;
  // 企业空间场景回调与状态（当处于企业空间工作控制台时）
  onAdd?: () => void;
  isAdding?: boolean;
  // 超管管理场景回调（仅在超管后台管理页面传入）
  onToggleStatus?: (post: StandardPostDetailData) => void;
  onEdit?: (post: StandardPostDetailData) => void;
  /** 是否强制使用管理员视角（默认依据是否传入 onToggleStatus / onEdit 自动判断） */
  mode?: "admin" | "workspace";
}

export function StandardPostDetailModal({
  post,
  onClose,
  onAdd,
  isAdding = false,
  onToggleStatus,
  onEdit,
  mode,
}: StandardPostDetailModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (!mounted) return null;

  // 判断当前展示视角：管理员视角 vs 企业租户视角
  const isAdminMode = mode === "admin" || Boolean(onToggleStatus || onEdit);
  const preset = getRolePreset(post);

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in-50 duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ==================== 1. 弹窗头部 ==================== */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
              style={{ backgroundColor: post.color || "#3182ce" }}
            >
              <PostIcon iconKey={post.icon} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-800 truncate">
                  {post.name}
                </h3>
                {isAdminMode ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                      post.status === "ACTIVE"
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {post.status === "ACTIVE" ? "启用分发中" : "已停用"}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black border bg-emerald-50 text-emerald-700 border-emerald-200/80 shrink-0 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>官方标准库岗位</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-medium">
                <span className="font-mono font-bold text-slate-500">
                  代码: {post.code}
                </span>
                {!isAdminMode && (
                  <>
                    <span>·</span>
                    <span className="text-[#3182ce] font-bold">{preset.category}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ==================== 2. 弹窗主体内容 ==================== */}
        <div className="p-6 overflow-y-auto space-y-4.5 text-left flex-1">
          {/* A. 企业空间专属视角：核心指标三栏透视 */}
          {!isAdminMode ? (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
                <span className="text-[10px] text-slate-400 font-bold block">所属职能域</span>
                <span className="text-xs font-black text-slate-800 mt-1 block truncate" title={preset.category}>
                  {preset.category}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
                <span className="text-[10px] text-slate-400 font-bold block">推荐装配规模</span>
                <span className="text-xs font-black text-[#3182ce] mt-1 block">
                  {preset.components.length} 项核心组件
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-left">
                <span className="text-[10px] text-slate-400 font-bold block">岗位专属标识色</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                    style={{ backgroundColor: post.color || "#3182ce" }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-700 truncate">
                    {post.color || "#3182ce"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* 超管后台视角指标 */
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block">全网装配量</span>
                <span className="text-base font-black text-[#3182ce] mt-1 block">
                  {post.usageCount || 0} 个空间
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block">排序权重</span>
                <span className="text-base font-black text-slate-700 mt-1 block">
                  No. {post.sortOrder || 1}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold block">主题配色</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className="w-4 h-4 rounded-md shrink-0 shadow-2xs"
                    style={{ backgroundColor: post.color || "#3182ce" }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {post.color || "#3182ce"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* B. 岗位职责描述与业务定位 + 专业标签 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-[#3182ce]" />
                <span>岗位职责定位与专业范畴</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-semibold">{preset.teamScope}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs text-slate-700 leading-relaxed font-medium">
              {post.description || "暂未录入该岗位的详细业务定位与职责说明。"}
            </div>
            {/* 专业领域标签流 */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {preset.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50/70 text-[#2b6cb0] border border-blue-100/80"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* C. 企业空间专属视角：核心推荐预置授权组件清单（最符合权限页面痛点） */}
          {!isAdminMode ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#6b46c1]" />
                  <span>开箱即用推荐授权组件清单</span>
                </h4>
                <span className="text-[10px] text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200/60">
                  引入后自动预置基准特权
                </span>
              </div>
              <div className="space-y-1.5">
                {preset.components.map((comp) => (
                  <div
                    key={comp.code}
                    className="p-2.5 rounded-xl border border-slate-200/80 bg-white hover:bg-purple-50/20 transition-all flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200/80 text-[#6b46c1] font-mono font-black text-xs flex items-center justify-center shrink-0">
                        {comp.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {comp.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-bold shrink-0">
                            {comp.tag}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
                          {comp.description}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      <span>可查看与执行</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 px-0.5">
                💡 引入当前空间后，企业管理员可随时在主界面右侧「组件授权矩阵」中按需精细勾选增删。
              </p>
            </div>
          ) : (
            /* 超管后台视角：已装配企业空间透视清单 */
            <div>
              <h4 className="text-xs font-black text-slate-700 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>已装配此岗位的企业空间清单</span>
                </span>
                <span className="text-[11px] font-bold text-slate-500">
                  已装配 {post.usageCount || 0} 个空间 · 共 {post.totalAssignedMembers || 0} 位在编成员
                </span>
              </h4>

              {post.usedWorkspaces && post.usedWorkspaces.length > 0 ? (
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {post.usedWorkspaces.map((ws) => (
                    <div
                      key={ws.id}
                      className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                        <span className="font-black text-slate-700 truncate">{ws.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] font-bold shrink-0">
                          {ws.memberCount} 位在编成员
                        </span>
                      </div>
                      <Link
                        href={`/admin/matrix/${ws.id}`}
                        onClick={onClose}
                        className="text-[11px] font-bold text-[#3182ce] hover:underline flex items-center gap-1 shrink-0 ml-2"
                      >
                        <span>空间权限矩阵</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 text-xs text-slate-400 text-center font-medium">
                  全平台暂无企业空间装配此岗位。各空间负责人可在其企业权限矩阵中一键导入使用。
                </div>
              )}
            </div>
          )}

          {/* D. 团队协作与角色分配建议 */}
          <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100/80 text-xs text-slate-600 flex items-start gap-2.5">
            <Users className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-[#2b6cb0]">人员任职与协作建议：</span>
              <span className="text-[11px] text-slate-600 ml-1">{preset.roleAdvice}</span>
            </div>
          </div>
        </div>

        {/* ==================== 3. 弹窗底部操作区 ==================== */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
          {/* 左侧说明 */}
          <div className="text-xs text-slate-400 font-medium">
            {!isAdminMode ? (
              <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>知阁标准企业岗位体系</span>
              </span>
            ) : onToggleStatus ? (
              <button
                type="button"
                onClick={() => onToggleStatus(post)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                  post.status === "ACTIVE"
                    ? "text-slate-600 hover:bg-slate-200/70"
                    : "text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {post.status === "ACTIVE" ? "停用该岗位分发" : "启用该岗位分发"}
              </button>
            ) : null}
          </div>

          {/* 右侧动作 */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              取消
            </button>

            {/* 超管编辑按钮 */}
            {isAdminMode && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(post)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>编辑此岗位</span>
              </button>
            )}

            {/* 企业空间引入该岗位按钮（强化业务闭环） */}
            {onAdd && (
              <button
                type="button"
                disabled={isAdding}
                onClick={onAdd}
                className="px-5 py-2 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#2c5282] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isAdding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>引入到当前企业空间</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
