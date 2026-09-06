"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  LogOut, 
  Shield, 
  Settings, 
  User, 
  Lock, 
  CreditCard, 
  Code, 
  HelpCircle, 
  Sliders 
} from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { useLogout } from "@/hooks/useLogout";

interface AvatarDropdownProps {
  workspaceId?: string | null;
  workspaceType?: "PERSONAL" | "ENTERPRISE";
  userRole?: "Owner" | "Admin" | "Member" | "Viewer" | "ComponentAdmin" | "KnowledgeAdmin";
  onUpgradeClick?: () => void;
}

export default function AvatarDropdown({
  workspaceId,
  workspaceType,
  userRole,
  onUpgradeClick,
}: AvatarDropdownProps) {
  const router = useRouter();
  const { userState, setUserState } = useAppContext();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { logout: handleLogout, confirmDialog } = useLogout();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!userState.isLoggedIn || !userState.userInfo) {
    return null;
  }

  const { userInfo } = userState;

  // === 权限与多管理身份判定逻辑 (全栈互斥算法) ===
  const isSuperAdmin = !!(
    userInfo.role?.toUpperCase() === "SUPER_ADMIN" || 
    userInfo.role?.toUpperCase() === "SUPERADMIN"
  );
  
  const isPlatformAdmin = !!(
    userInfo.role?.toUpperCase() === "ADMIN" || 
    userInfo.role?.toUpperCase() === "PLATFORM_ADMIN"
  );
  
  const isEnterpriseAdmin = workspaceType === "ENTERPRISE" && (userRole === "Owner" || userRole === "Admin");
  const isComponentAdmin = userRole === "ComponentAdmin";
  const isKnowledgeAdmin = userRole === "KnowledgeAdmin";

  // 当前身份标签计算
  const getRoleLabel = () => {
    if (isSuperAdmin) return "超级管理员";
    if (isPlatformAdmin) return "平台管理员";
    if (isEnterpriseAdmin) return "企业管理员";
    if (isComponentAdmin) return "组件管理员";
    if (isKnowledgeAdmin) return "知识库管理员";
    if (workspaceType === "ENTERPRISE") return "企业成员";
    return "免费用户";
  };

  const getRoleBadgeClass = () => {
    if (isSuperAdmin) return "bg-amber-50 text-amber-600 border-amber-100";
    if (isPlatformAdmin) return "bg-red-50 text-red-500 border-red-100";
    if (isEnterpriseAdmin) return "bg-blue-50 text-blue-600 border-blue-100";
    if (isComponentAdmin) return "bg-indigo-50 text-indigo-600 border-indigo-100";
    if (isKnowledgeAdmin) return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (workspaceType === "ENTERPRISE") return "bg-slate-100 text-slate-500 border-slate-200/60";
    return "bg-slate-105 text-slate-500 border-slate-200/60";
  };

  // 计算管理入口
  const adminIdentities = [];
  if (isSuperAdmin || isPlatformAdmin) adminIdentities.push({ label: "平台后台", path: "/admin", icon: Shield });
  if (isComponentAdmin) adminIdentities.push({ label: "组件管理", path: "/workspace-hub?filter=component-managed", icon: Sliders });
  if (isKnowledgeAdmin) adminIdentities.push({ label: "知识库管理", path: "/workspace-hub?filter=knowledge-managed", icon: Sliders });

  let adminEntry = null;
  if (adminIdentities.length > 1) {
    adminEntry = { label: "管理中心", path: "/management", icon: Sliders };
  } else if (adminIdentities.length === 1) {
    adminEntry = adminIdentities[0];
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer select-none"
      >
        {userInfo.avatar ? (
          <img
            src={userInfo.avatar}
            alt={userInfo.name}
            className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
            {userInfo.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-left hidden lg:flex flex-col leading-tight">
          <span className="text-sm font-bold text-slate-800">
            {userInfo.name || "用户"}
          </span>
          <span className="text-xs text-slate-400 font-semibold mt-0.5">
            {userInfo.email || "未绑定邮箱"}
          </span>
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            showDropdown ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2.5 w-48 bg-white/98 backdrop-blur-xl rounded-[20px] shadow-[0_10px_25px_-5px_rgba(15,23,42,0.12)] border border-slate-200/60 p-2 z-50 text-left animate-in fade-in slide-in-from-top-1 duration-200 space-y-1.5">
          
          {/* 精致的身份标识区 (不再重复显示姓名与邮箱) */}
          <div className="px-2.5 pt-1.5 pb-2 border-b border-slate-100/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">账户身份</span>
            <span className={`px-2.5 py-0.5 border text-[9px] font-black rounded-full select-none shadow-sm ${getRoleBadgeClass()}`}>
              {getRoleLabel()}
            </span>
          </div>

          {/* 第三方快捷登录用户未设独立密码或未绑定邮箱手机的提示卡片 */}
          {userInfo.needsProfileCompletion && (
            <div
              onClick={() => {
                router.push("/user/security");
                setShowDropdown(false);
              }}
              className="mx-1.5 mb-1 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Shield className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-amber-900">建议设置独立密码</span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full group-hover:bg-amber-200 transition-colors">
                      去完善
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-800/80 mt-1 leading-relaxed">
                    第三方登录尚未绑定独立账号密码，设置后可在任意设备直接登录
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 菜单项区块一：管理入口（优先置顶于个人中心前方） */}
          {adminEntry && (
            <>
              <div className="space-y-0.5">
                <button
                  onClick={() => { router.push(adminEntry.path); setShowDropdown(false); }}
                  className="group w-full flex items-center justify-between px-2.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50/70 hover:text-[#3182ce] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <adminEntry.icon className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:scale-105 transition-all" />
                    <span className="group-hover:translate-x-0.5 transition-transform">{adminEntry.label}</span>
                  </div>
                  {adminEntry.label === "平台后台" && (
                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-black shrink-0 select-none border shadow-sm ${
                      isSuperAdmin 
                        ? "bg-amber-50 text-amber-600 border-amber-100" 
                        : "bg-red-50 text-red-500 border-red-100"
                    }`}>
                      {isSuperAdmin ? "超管" : "管理"}
                    </span>
                  )}
                </button>
              </div>
              <div className="h-px bg-slate-100/80 my-1" />
            </>
          )}

          {/* 菜单项区块二：个人中心与设置 */}
          <div className="space-y-0.5">
            <button
              onClick={() => { router.push("/user/profile"); setShowDropdown(false); }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50/70 hover:text-slate-800 transition-all cursor-pointer"
            >
              <User className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:scale-105 transition-all" />
              <span className="group-hover:translate-x-0.5 transition-transform">个人中心</span>
            </button>
            <button
              onClick={() => { router.push("/user/security"); setShowDropdown(false); }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50/70 hover:text-slate-800 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:scale-105 transition-all" />
              <span className="group-hover:translate-x-0.5 transition-transform">账号安全</span>
            </button>
            <button
              onClick={() => { router.push("/user/billing-center"); setShowDropdown(false); }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50/70 hover:text-[#3182ce] transition-all cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:scale-105 transition-all" />
              <span className="group-hover:translate-x-0.5 transition-transform">套餐与计费</span>
            </button>
            <button
              onClick={() => { router.push("/user/developer"); setShowDropdown(false); }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50/70 hover:text-[#3182ce] transition-all cursor-pointer"
            >
              <Code className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:scale-105 transition-all" />
              <span className="group-hover:translate-x-0.5 transition-transform">开发者设置</span>
            </button>
          </div>

          <div className="h-px bg-slate-100/80 my-1" />

          {/* 菜单项区块三：帮助与退出 */}
          <div className="space-y-0.5">
            <button
              onClick={() => { router.push("/help"); setShowDropdown(false); }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50/70 hover:text-slate-800 transition-all cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:scale-105 transition-all" />
              <span className="group-hover:translate-x-0.5 transition-transform">帮助与反馈</span>
            </button>
            <button
              onClick={() => { handleLogout(); setShowDropdown(false); }}
              className="group w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50/60 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-red-500 group-hover:translate-x-0.5 transition-transform" />
              <span>退出登录</span>
            </button>
          </div>

        </div>
      )}

      {/* 退出登录二次确认弹窗 */}
      {confirmDialog}
    </div>
  );
}