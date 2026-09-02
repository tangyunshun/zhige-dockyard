"use client";

import React from "react";
import { 
  Box, 
  FileText, 
  Shield, 
  BarChart3, 
  MessageSquare, 
  Calculator, 
  TrendingUp, 
  ClipboardList, 
  Network, 
  Users, 
  Database, 
  Plug, 
  Radio, 
  Mail, 
  HardDrive, 
  Lock, 
  Map, 
  RefreshCw, 
  Layout, 
  Smartphone, 
  Monitor, 
  CheckCircle2, 
  Weight, 
  Search, 
  MousePointer, 
  Container, 
  Activity, 
  ClipboardCheck, 
  List, 
  Calendar, 
  AlertTriangle, 
  MessageCircle, 
  Library, 
  HelpCircle, 
  FileCheck, 
  Lightbulb, 
  Wrench, 
  Presentation,
  ShieldCheck,
  BarChart2,
  Link,
  Repeat,
  PieChart,
  CheckSquare,
  Layers,
  GitPullRequest,
  Bell,
  EyeOff,
  SearchCode,
  UserCheck,
  ListChecks,
  UserPlus,
  FileSearch,
  Compass,
  FileCode,
  Server,
  ShieldAlert,
  BookOpen,
  Award
} from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";

export const iconMap: Record<string, React.ComponentType<any>> = {
  "document": FileText,
  "shield": Shield,
  "shield-check": ShieldCheck,
  "bar-chart": BarChart3,
  "bar-chart-2": BarChart2,
  "message-square": MessageSquare,
  "calculator": Calculator,
  "trending-up": TrendingUp,
  "clipboard-list": ClipboardList,
  "network": Network,
  "users": Users,
  "database": Database,
  "plug": Plug,
  "link": Link,
  "radio": Radio,
  "mail": Mail,
  "hard-drive": HardDrive,
  "lock": Lock,
  "file-code": FileCode,
  "map": Map,
  "refresh-cw": RefreshCw,
  "repeat": Repeat,
  "layout": Layout,
  "box": Box,
  "smartphone": Smartphone,
  "pie-chart": PieChart,
  "monitor": Monitor,
  "check-circle": CheckCircle2,
  "check-circle-2": CheckCircle2,
  "check-square": CheckSquare,
  "weight": Weight,
  "search": Search,
  "mouse-pointer": MousePointer,
  "container": Container,
  "layers": Layers,
  "git-pull-request": GitPullRequest,
  "bell": Bell,
  "activity": Activity,
  "file-text": FileText,
  "eye-off": EyeOff,
  "search-code": SearchCode,
  "clipboard-check": ClipboardCheck,
  "user-check": UserCheck,
  "list-checks": ListChecks,
  "list": List,
  "calendar": Calendar,
  "alert-triangle": AlertTriangle,
  "user-plus": UserPlus,
  "file-check": FileCheck,
  "book-open": BookOpen,
  "message-circle": MessageCircle,
  "library": Library,
  "help-circle": HelpCircle,
  "award": Award,
  "compass": Compass,
  "wrench": Wrench,
  "presentation": Presentation,
  "server": Server,
  "code": FileCode,
  "shield-alert": ShieldAlert,
  "file-search": FileSearch,
  "sparkles": BarChart3,
  "zap": RefreshCw,
};

const categoryEmojis: Record<string, string> = {
  BID_PREP: "",
  REQ_DESIGN: "",
  BACKEND_CORE: "",
  DATABASE_ENG: "",
  FRONTEND_DEV: "",
  TEST_QA: "",
  DEVOPS: "",
  SECURITY: "",
  PROJ_MGMT: "",
  KNOWLEDGE: "",
};

interface ComponentShowcaseProps {
  workspaceId?: string;
}

export default function ComponentShowcase({ workspaceId }: ComponentShowcaseProps) {
  // 组件信息与分类均来自数据库（component_catalog / component_category 表，经 AppContext 加载）
  const { componentCatalog, componentCategories } = useAppContext();
  const COMPONENTS = componentCatalog;
  const COMPONENT_CATEGORIES = componentCategories;

  // 按照 category 分组，并保留原始类别顺序
  const categoriesList = Object.keys(COMPONENT_CATEGORIES) as Array<keyof typeof COMPONENT_CATEGORIES>;
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-xl">
            <Box className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">
              舟坊空间组件库
            </h2>
            <p className="text-sm text-slate-600">
              {COMPONENTS.length} 个高阶研发资产组件，覆盖软件开发全生命周期
            </p>
          </div>
        </div>
      </div>

      {categoriesList.map(cat => {
        const catInfo = COMPONENT_CATEGORIES[cat];
        const catComponents = COMPONENTS.filter(c => c.category === cat);
        if (catComponents.length === 0) return null;

        return (
          <div key={cat} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div 
                className="w-1 h-5 rounded-full"
                style={{ backgroundColor: catInfo.color }}
              ></div>
              <h3 className="text-base font-black text-slate-800">
                {catInfo.name} <span className="text-xs text-slate-500 font-bold ml-1">({catInfo.range})</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {catComponents.map(component => {
                const IconComponent = iconMap[component.icon] || Box;
                
                return (
                  <div
                    key={component.id}
                    className="group relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
                  >
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-black rounded">
                      {component.id}
                    </div>

                    <div 
                      className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center bg-blue-50 text-[#3182ce] border border-blue-100 shadow-2xs"
                    >
                      {(() => { const Ico = iconMap[component.icon || ""] || Box; return <Ico className="w-5 h-5" />; })()}
                    </div>

                    <h4 className="text-sm font-bold text-slate-800 mb-1">
                      {component.name}
                    </h4>

                    <p className="text-xs text-slate-655 leading-relaxed mb-2 min-h-[32px]" title={component.description}>
                      {component.description}
                    </p>

                    <div className="absolute inset-0 bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-xs text-slate-600 text-center">
          舟坊协作资产库持续更新中，更多专业组件敬请期待
        </p>
      </div>
    </div>
  );
}