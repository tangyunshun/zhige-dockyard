"use client";

import React from "react";
import { 
  Box, 
  Code, 
  Database, 
  FileText, 
  Layout, 
  Settings, 
  Shield, 
  Zap, 
  BarChart3, 
  FolderOpen,
  Users,
  Palette,
  Target,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  FileSpreadsheet,
  FileCode,
  Wrench,
  CreditCard,
  Copy,
  MessageSquare,
  GitMerge,
  TestTube2,
  Package,
  Server,
  Lightbulb,
  TrendingUp
} from "lucide-react";

// 53 个组件定义
const COMPONENTS = [
  // 需求分析阶段 (C01-C04)
  { id: "C01", name: "标书解析", stage: "需求分析", icon: FileText, color: "#3182ce", description: "智能解析招标文件，提取关键需求和技术规格" },
  { id: "C02", name: "需求挖掘", stage: "需求分析", icon: Zap, color: "#2b6cb0", description: "深度挖掘用户痛点，梳理核心业务需求" },
  { id: "C03", name: "竞品分析", stage: "需求分析", icon: BarChart3, color: "#2c5282", description: "分析竞品功能特点，找出差异化优势" },
  { id: "C04", name: "用户画像", stage: "需求分析", icon: Users, color: "#2a4365", description: "构建目标用户画像，明确使用场景" },
  
  // 架构设计阶段 (C05-C08)
  { id: "C05", name: "技术选型", stage: "架构设计", icon: Settings, color: "#8b5cf6", description: "根据项目需求选择合适的技术栈" },
  { id: "C06", name: "架构图生成", stage: "架构设计", icon: Layout, color: "#7c3aed", description: "自动生成系统架构图和技术拓扑" },
  { id: "C07", name: "数据库设计", stage: "架构设计", icon: Database, color: "#6b46c1", description: "设计数据库结构和关系模型" },
  { id: "C08", name: "API 设计", stage: "架构设计", icon: Code, color: "#553c9a", description: "设计 RESTful API 接口规范" },
  
  // 界面设计阶段 (C09-C12)
  { id: "C09", name: "UI 设计", stage: "界面设计", icon: Layout, color: "#10b981", description: "用户界面视觉设计" },
  { id: "C10", name: "原型设计", stage: "界面设计", icon: FileText, color: "#059669", description: "快速生成产品原型" },
  { id: "C11", name: "交互设计", stage: "界面设计", icon: Zap, color: "#047857", description: "优化用户交互体验" },
  { id: "C12", name: "视觉设计", stage: "界面设计", icon: Palette, color: "#065f46", description: "品牌视觉元素设计" },
  
  // 开发实现阶段 (C13-C16)
  { id: "C13", name: "前端开发", stage: "开发实现", icon: Code, color: "#f59e0b", description: "前端页面和功能开发" },
  { id: "C14", name: "后端开发", stage: "开发实现", icon: Database, color: "#d97706", description: "后端业务逻辑开发" },
  { id: "C15", name: "接口对接", stage: "开发实现", icon: Settings, color: "#b45309", description: "第三方接口集成对接" },
  { id: "C16", name: "性能优化", stage: "开发实现", icon: Zap, color: "#92400e", description: "系统性能调优" },
  
  // 性能优化阶段 (C17)
  { id: "C17", name: "慢 SQL 优化", stage: "性能优化", icon: Database, color: "#ef4444", description: "分析和优化慢查询 SQL" },
  
  // 测试验证阶段 (C18-C21)
  { id: "C18", name: "代码审查", stage: "测试验证", icon: Code, color: "#8b5cf6", description: "代码质量审查和优化建议" },
  { id: "C19", name: "单元测试", stage: "测试验证", icon: Shield, color: "#7c3aed", description: "编写和执行单元测试" },
  { id: "C20", name: "集成测试", stage: "测试验证", icon: Settings, color: "#6b46c1", description: "系统集成测试验证" },
  { id: "C21", name: "安全测试", stage: "测试验证", icon: Shield, color: "#553c9a", description: "安全漏洞扫描和测试" },
  
  // 部署运维阶段 (C22-C25)
  { id: "C22", name: "部署上线", stage: "部署运维", icon: Zap, color: "#10b981", description: "自动化部署和发布" },
  { id: "C23", name: "监控告警", stage: "部署运维", icon: BarChart3, color: "#059669", description: "系统监控和告警配置" },
  { id: "C24", name: "日志分析", stage: "部署运维", icon: FileText, color: "#047857", description: "日志收集和分析" },
  { id: "C25", name: "镜像瘦身", stage: "部署运维", icon: Settings, color: "#065f46", description: "Docker 镜像优化瘦身" },
  
  // 项目管理阶段 (C26-C30)
  { id: "C26", name: "项目规划", stage: "项目管理", icon: Target, color: "#3182ce", description: "项目目标设定和路径规划" },
  { id: "C27", name: "任务分配", stage: "项目管理", icon: Users, color: "#2b6cb0", description: "团队成员任务分配和跟踪" },
  { id: "C28", name: "进度跟踪", stage: "项目管理", icon: TrendingUp, color: "#2c5282", description: "实时监控项目进度" },
  { id: "C29", name: "风险管理", stage: "项目管理", icon: AlertTriangle, color: "#ef4444", description: "识别和应对项目风险" },
  { id: "C30", name: "质量管理", stage: "项目管理", icon: CheckCircle2, color: "#10b981", description: "质量控制和保证" },
  
  // 文档管理阶段 (C31-C35)
  { id: "C31", name: "文档编写", stage: "文档管理", icon: FileText, color: "#8b5cf6", description: "技术文档编写和管理" },
  { id: "C32", name: "API 文档", stage: "文档管理", icon: Code, color: "#7c3aed", description: "自动生成 API 文档" },
  { id: "C33", name: "用户手册", stage: "文档管理", icon: BookOpen, color: "#6b46c1", description: "用户操作手册编写" },
  { id: "C34", name: "版本说明", stage: "文档管理", icon: FileSpreadsheet, color: "#f59e0b", description: "版本更新说明文档" },
  { id: "C35", name: "知识库", stage: "文档管理", icon: Database, color: "#d97706", description: "团队知识库建设" },
  
  // 代码质量阶段 (C36-C40)
  { id: "C36", name: "代码规范", stage: "代码质量", icon: FileCode, color: "#3182ce", description: "代码规范检查和修复" },
  { id: "C37", name: "代码重构", stage: "代码质量", icon: Wrench, color: "#2b6cb0", description: "代码重构和优化" },
  { id: "C38", name: "技术债务", stage: "代码质量", icon: CreditCard, color: "#f59e0b", description: "技术债务识别和管理" },
  { id: "C39", name: "代码复用", stage: "代码质量", icon: Copy, color: "#10b981", description: "提高代码复用率" },
  { id: "C40", name: "代码注释", stage: "代码质量", icon: MessageSquare, color: "#059669", description: "代码注释规范化" },
  
  // DevOps 阶段 (C41-C45)
  { id: "C41", name: "CI/CD", stage: "DevOps", icon: GitMerge, color: "#8b5cf6", description: "持续集成和持续部署" },
  { id: "C42", name: "自动化测试", stage: "DevOps", icon: TestTube2, color: "#7c3aed", description: "自动化测试流程" },
  { id: "C43", name: "容器化", stage: "DevOps", icon: Package, color: "#6b46c1", description: "应用容器化部署" },
  { id: "C44", name: "编排管理", stage: "DevOps", icon: Server, color: "#553c9a", description: "容器编排和管理" },
  { id: "C45", name: "配置管理", stage: "DevOps", icon: Settings, color: "#44337a", description: "配置中心化管理" },
  
  // 数据分析阶段 (C46-C50)
  { id: "C46", name: "数据采集", stage: "数据分析", icon: Database, color: "#3182ce", description: "业务数据采集和清洗" },
  { id: "C47", name: "数据可视化", stage: "数据分析", icon: BarChart3, color: "#2b6cb0", description: "数据可视化展示" },
  { id: "C48", name: "用户行为分析", stage: "数据分析", icon: Users, color: "#2c5282", description: "用户行为路径分析" },
  { id: "C49", name: "业务报表", stage: "数据分析", icon: FileSpreadsheet, color: "#f59e0b", description: "业务数据报表生成" },
  { id: "C50", name: "预测分析", stage: "数据分析", icon: TrendingUp, color: "#d97706", description: "数据趋势预测" },
  
  // AI 增强阶段 (C51-C53)
  { id: "C51", name: "智能推荐", stage: "AI 增强", icon: Lightbulb, color: "#8b5cf6", description: "AI 智能推荐系统" },
  { id: "C52", name: "自动化代码", stage: "AI 增强", icon: Code, color: "#7c3aed", description: "AI 辅助代码生成" },
  { id: "C53", name: "智能问答", stage: "AI 增强", icon: MessageSquare, color: "#6b46c1", description: "AI 智能问答助手" },
];

interface ComponentShowcaseProps {
  workspaceId?: string;
}

export default function ComponentShowcase({ workspaceId }: ComponentShowcaseProps) {
  // 按阶段分组组件
  const componentsByStage = COMPONENTS.reduce((acc, comp) => {
    if (!acc[comp.stage]) {
      acc[comp.stage] = [];
    }
    acc[comp.stage].push(comp);
    return acc;
  }, {} as Record<string, typeof COMPONENTS>);

  const stages = Object.keys(componentsByStage);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      {/* 头部 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shadow-xl">
            <Box className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              舟坊空间组件库
            </h2>
            <p className="text-sm text-slate-600">
              53 个高阶组件，覆盖软件开发全流程
            </p>
          </div>
        </div>
      </div>

      {/* 组件展示 */}
      {stages.map(stage => (
        <div key={stage} className="mb-6">
          {/* 阶段标题 */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
            <h3 className="text-base font-black text-slate-800">{stage}</h3>
          </div>

          {/* 组件网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {componentsByStage[stage].map(component => {
              const Icon = component.icon;
              
              return (
                <div
                  key={component.id}
                  className="group relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
                >
                  {/* 组件 ID 标签 */}
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-black rounded">
                    {component.id}
                  </div>

                  {/* 图标 */}
                  <div 
                    className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${component.color}20, ${component.color}10)`,
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: component.color }} />
                  </div>

                  {/* 名称 */}
                  <h4 className="text-sm font-bold text-slate-800 mb-1">
                    {component.name}
                  </h4>

                  {/* 描述 */}
                  <p className="text-xs text-slate-600 leading-relaxed mb-2">
                    {component.description}
                  </p>

                  {/* Hover 遮罩 */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* 底部说明 */}
      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-xs text-slate-600 text-center">
          ✨ 组件库持续更新中，更多专业组件敬请期待
        </p>
      </div>
    </div>
  );
}
