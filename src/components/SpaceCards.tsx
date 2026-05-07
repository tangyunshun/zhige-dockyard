"use client";

import React from "react";
import { 
  ArrowRight, 
  Building2, 
  User, 
  Settings, 
  Users,
  PlusCircle,
  Zap,
  Shield,
  TrendingUp,
  CheckCircle2
} from "lucide-react";
import { useRouter } from "next/navigation";

interface SpaceCardsProps {
  hasPersonalSpace: boolean;
  hasEnterpriseSpace: boolean;
  canCreateEnterprise: boolean;
  maxEnterprise: number;
  enterpriseCount: number;
  isMember: boolean;
  onEnterPersonal: () => void;
  onUpgradePersonal: () => void;
  onPersonalSettings: () => void;
  onJoinSpace: () => void;
  onCreateEnterprise: () => void;
  onEnterEnterprise: (id: string) => void;
}

export default function SpaceCards({
  hasPersonalSpace,
  hasEnterpriseSpace,
  canCreateEnterprise,
  maxEnterprise,
  enterpriseCount,
  isMember,
  onEnterPersonal,
  onUpgradePersonal,
  onPersonalSettings,
  onJoinSpace,
  onCreateEnterprise,
  onEnterEnterprise,
}: SpaceCardsProps) {
  const router = useRouter();

  // 卡片 A: 进入个人空间
  const PersonalSpaceCard = () => (
    <div className="group relative overflow-hidden bg-gradient-to-br from-[#3182ce]/5 to-[#2b6cb0]/5 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#3182ce]/30 hover:border-[#3182ce]/50 hover:shadow-2xl hover:shadow-[#3182ce]/20 transition-all duration-300 hover:-translate-y-1">
      <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-[10px] font-black rounded-full shadow-lg">
        个人沙盒
      </div>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#3182ce]/30">
          <User className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-slate-800 mb-1">
            进入个人空间
          </h3>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            进入私密研发沙盒，数据绝对隔离，不支持团队协作，适合个人独立开发
          </p>
          
          {/* 特性列表 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#3182ce]" />
              <span className="text-[10px] text-slate-600">数据隔离</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#3182ce]" />
              <span className="text-[10px] text-slate-600">私密环境</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#3182ce]" />
              <span className="text-[10px] text-slate-600">独立开发</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#3182ce]" />
              <span className="text-[10px] text-slate-600">快速启动</span>
            </div>
          </div>

          <button
            onClick={onEnterPersonal}
            className="flex items-center gap-1 text-sm font-bold text-[#3182ce] hover:text-[#2b6cb0] transition-colors cursor-pointer"
          >
            <span>立即进入</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );

  // 卡片 B: 创建/升级企业空间
  const CreateUpgradeCard = () => (
    <div className="group relative overflow-hidden bg-gradient-to-br from-[#f59e0b]/5 to-[#d97706]/5 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#f59e0b]/30 hover:border-[#f59e0b]/50 hover:shadow-2xl hover:shadow-[#f59e0b]/20 transition-all duration-300 hover:-translate-y-1">
      <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-[10px] font-black rounded-full shadow-lg">
        {hasEnterpriseSpace ? "扩容" : canCreateEnterprise ? "创建" : "升级"}
      </div>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#d97706] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#f59e0b]/30">
          <Building2 className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-slate-800 mb-1">
            {hasEnterpriseSpace ? "扩容企业空间" : canCreateEnterprise ? "创建企业空间" : "升级企业空间"}
          </h3>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            {hasEnterpriseSpace 
              ? "增加企业空间数量，扩展团队协作规模" 
              : canCreateEnterprise
                ? "创建企业协作空间，支持多人团队协作"
                : "升级会员，解锁更多企业空间槽位"}
          </p>

          {/* 配额信息 */}
          <div className="mb-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-600">企业空间配额</span>
              <span className="text-xs font-black text-slate-800">
                {enterpriseCount}/{maxEnterprise}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] transition-all duration-500"
                style={{ width: `${Math.min((enterpriseCount / maxEnterprise) * 100, 100)}%` }}
              />
            </div>
            {!canCreateEnterprise && !isMember && (
              <p className="text-[9px] text-[#f59e0b] mt-1 font-bold">
                已达上限，升级会员可解锁更多槽位
              </p>
            )}
          </div>

          <button
            onClick={hasEnterpriseSpace ? onCreateEnterprise : onUpgradePersonal}
            disabled={!canCreateEnterprise && !isMember}
            className="flex items-center gap-1 text-sm font-bold text-[#f59e0b] hover:text-[#d97706] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{hasEnterpriseSpace ? "创建新空间" : "立即升级"}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );

  // 卡片 C: 个人空间配置
  const PersonalSettingsCard = () => (
    <div className="group relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 backdrop-blur-xl rounded-2xl p-5 border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center flex-shrink-0 shadow-lg">
          <Settings className="w-6 h-6 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-slate-800 mb-1">
            个人空间配置
          </h3>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            配置 AI 引擎、System Prompt、数据清理策略，打造个性化研发环境
          </p>

          {/* 功能列表 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-2.5 h-2.5 text-[#3182ce]" />
                <span className="text-[10px] font-bold text-slate-700">
                  AI 引擎
                </span>
              </div>
              <p className="text-[9px] text-slate-500">模型选择</p>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-2.5 h-2.5 text-[#10b981]" />
                <span className="text-[10px] font-bold text-slate-700">
                  System Prompt
                </span>
              </div>
              <p className="text-[9px] text-slate-500">提示词调优</p>
            </div>
          </div>

          <button
            onClick={onPersonalSettings}
            className="flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer"
          >
            <span>管理配置</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );

  // 卡片 D: 加入已有空间
  const JoinSpaceCard = () => (
    <div className="group relative overflow-hidden bg-gradient-to-br from-[#10b981]/5 to-[#059669]/5 backdrop-blur-xl rounded-2xl p-5 border-2 border-[#10b981]/30 hover:border-[#10b981]/50 hover:shadow-2xl hover:shadow-[#10b981]/20 transition-all duration-300 hover:-translate-y-1">
      <div className="absolute top-2 right-2 px-2 py-1 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-[10px] font-black rounded-full shadow-lg">
        团队协作
      </div>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#10b981]/30">
          <Users className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-slate-800 mb-1">
            加入已有空间
          </h3>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            通过邀请码或分享链接加入企业空间，开启团队协作
          </p>

          {/* 使用场景 */}
          <div className="mb-3 p-2.5 bg-[#10b981]/5 rounded-lg border border-[#10b981]/20">
            <ul className="space-y-1">
              <li className="flex items-start gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                <span className="text-[9px] text-slate-500">输入 8 位邀请码</span>
              </li>
              <li className="flex items-start gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                <span className="text-[9px] text-slate-500">点击分享链接</span>
              </li>
              <li className="flex items-start gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1 flex-shrink-0"></div>
                <span className="text-[9px] text-slate-500">支持加入多个空间</span>
              </li>
            </ul>
          </div>

          <button
            onClick={onJoinSpace}
            className="flex items-center gap-1 text-sm font-bold text-[#10b981] hover:text-[#059669] transition-colors cursor-pointer"
          >
            <span>立即加入</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {/* 第一行：进入个人空间 + 创建/升级企业空间 */}
      {hasPersonalSpace && <PersonalSpaceCard />}
      <CreateUpgradeCard />
      
      {/* 第二行：个人空间配置 + 加入已有空间 */}
      {hasPersonalSpace && <PersonalSettingsCard />}
      <JoinSpaceCard />
    </div>
  );
}
