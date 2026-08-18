"use client";

import { useState, useEffect } from "react";
import { Key, ArrowLeft, RefreshCw, Check, ShieldAlert, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  permissions: string[];
  isSuper: boolean;
}

const AVAILABLE_PERMISSIONS = [
  { group: "用户管理模块 (user)", keys: [
    { key: "user:read", label: "查看用户列表" },
    { key: "user:update", label: "修改用户状态" },
    { key: "user:ban", label: "执行用户封禁" },
    { key: "user:reset_session", label: "强制用户下线" }
  ]},
  { group: "企业空间与订单 (workspace/order)", keys: [
    { key: "workspace:read", label: "查看企业空间" },
    { key: "order:read", label: "查看管理订单" }
  ]},
  { group: "研发组件模块 (component)", keys: [
    { key: "component:read", label: "查看组件列表" },
    { key: "component:create", label: "创建上架新组件" },
    { key: "component:update", label: "修改编辑组件" },
    { key: "component:publish", label: "组件发布/下架" },
    { key: "component:delete", label: "强制删除组件" }
  ]},
  { group: "内容与公告 (content/announcement)", keys: [
    { key: "content:read", label: "查看开发阶段" },
    { key: "content:update", label: "编辑开发阶段" },
    { key: "content:publish", label: "发布开发大纲" },
    { key: "document:read", label: "管理系统文档" },
    { key: "announcement:read", label: "发布通知公告" }
  ]},
  { group: "审计与系统 (audit/system)", keys: [
    { key: "audit:read", label: "查看只读审计日志" },
    { key: "system:health_read", label: "监控系统健康度" },
    { key: "membership:manage", label: "财务特许套餐管理" }
  ]}
];

export default function PermissionsPage() {
  const router = useRouter();
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      setLoading(true);
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/admin/permissions", {
        headers: userId ? { Authorization: `Bearer ${userId}` } : {}
      });
      if (res.ok) {
        const result = await res.json();
        setAdmins(result.data || []);
        if (result.data && result.data.length > 0) {
          // 默认选中第一个非超级管理员
          const firstNormalAdmin = result.data.find((a: AdminUser) => !a.isSuper);
          const defaultSelect = firstNormalAdmin || result.data[0];
          setSelectedAdminId(defaultSelect.id);
          setSelectedPermissions(defaultSelect.permissions || []);
        }
      } else {
        toast.error("加载管理员列表失败，请检查登录角色");
      }
    } catch (e) {
      toast.error("加载管理员列表时发生异常");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSelect = (adminId: string) => {
    const admin = admins.find(a => a.id === adminId);
    setSelectedAdminId(adminId);
    setSelectedPermissions(admin?.permissions || []);
  };

  const handleTogglePermission = (key: string) => {
    setSelectedPermissions(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedAdminId) return;
    const targetAdmin = admins.find(a => a.id === selectedAdminId);
    if (targetAdmin?.isSuper) {
      toast.error("超级管理员拥有全量特权，无需也禁止修改其角色权限");
      return;
    }

    try {
      setSaving(true);
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { Authorization: `Bearer ${userId}` } : {})
        },
        body: JSON.stringify({
          targetUserId: selectedAdminId,
          permissions: selectedPermissions
        })
      });

      if (res.ok) {
        toast.success("管理员权限配置已成功更新并落库！");
        // 更新本地状态列表
        setAdmins(prev => prev.map(a => a.id === selectedAdminId ? { ...a, permissions: selectedPermissions } : a));
      } else {
        const err = await res.json();
        toast.error(err.error || "保存失败");
      }
    } catch (e) {
      toast.error("保存权限配置发生异常");
    } finally {
      setSaving(false);
    }
  };

  const currentAdmin = admins.find(a => a.id === selectedAdminId);

  return (
    <div className="p-6 space-y-6">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Key className="w-8 h-8 text-[#8b5cf6]" />
            管理员模块授权中心
          </h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">
            为平台运营管理员分配、细化核心业务模块的读写或高危操作授权。
          </p>
        </div>
        <button
          onClick={() => router.push("/admin")}
          className="h-10 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          返回大盘
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[350px]">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-[#8b5cf6] animate-spin mx-auto mb-4" />
            <p className="text-slate-500 font-bold text-xs">正在拉取平台管理员及授权数据...</p>
          </div>
        </div>
      ) : admins.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center min-h-[300px] flex items-center justify-center">
          <div>
            <ShieldAlert className="w-12 h-12 text-slate-350 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">未检测到平台管理员账号</h3>
            <p className="text-xs text-slate-400 font-semibold mt-1">请先前往【管理员管理】委派或指定平台管理员</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* 左侧：管理员列表 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 text-left">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-2.5 border-b border-slate-100 flex items-center justify-between">
              <span>选择平台管理员</span>
              <button onClick={loadAdmins} className="text-[#8b5cf6] hover:underline flex items-center gap-0.5">
                <RefreshCw className="w-3.5 h-3.5" /> 刷新
              </button>
            </h3>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {admins.map((admin) => (
                <button
                  key={admin.id}
                  onClick={() => handleAdminSelect(admin.id)}
                  className={`w-full p-3.5 rounded-xl border flex flex-col gap-1 transition-all text-left cursor-pointer ${
                    admin.id === selectedAdminId
                      ? "bg-purple-50/50 border-[#8b5cf6] shadow-sm"
                      : "bg-slate-50/30 border-slate-200/80 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-800 text-xs truncate max-w-[120px]">
                      {admin.name || "未设置姓名"}
                    </span>
                    <span className={`px-2 py-0.5 border text-[9px] font-black rounded-full select-none ${
                      admin.isSuper 
                        ? "bg-amber-50 text-amber-600 border-amber-100" 
                        : "bg-purple-50 text-purple-600 border-purple-100"
                    }`}>
                      {admin.isSuper ? "超级管理员" : "平台管理员"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate mt-0.5">{admin.email}</span>
                  <span className="text-[9px] text-[#8b5cf6] font-bold mt-1.5">
                    {admin.isSuper ? "★ 完整所有特权" : `已分发 ${admin.permissions.length} 项权限`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：权限包勾选矩阵 */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left space-y-6">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">
                  权限配置控制台：{currentAdmin?.name || "未知管理员"}
                </h3>
                <p className="text-[11px] text-slate-400 font-semibold mt-1">
                  正在为普通管理员配置并更新模块持久化授权包
                </p>
              </div>
              {currentAdmin && !currentAdmin.isSuper && (
                <button
                  onClick={handleSavePermissions}
                  disabled={saving}
                  className="h-10 px-4 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white disabled:bg-slate-100 disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>保存权限包</span>
                </button>
              )}
            </div>

            {currentAdmin?.isSuper ? (
              <div className="p-8 bg-amber-50/40 rounded-2xl border border-amber-100/50 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
                <ShieldAlert className="w-12 h-12 text-amber-500" />
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800">超级管理员免配置提示</h4>
                  <p className="text-xs font-semibold text-slate-400 mt-2 leading-relaxed max-w-sm">
                    该账号在数据库中为系统最高超级管理员 (SuperAdmin)。<br />
                    系统自动为超级管理员授予并豁免一切后台模块权限检验，无需也禁止在此处手动进行缩权或配置更改。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {AVAILABLE_PERMISSIONS.map((group, idx) => (
                  <div key={idx} className="space-y-3">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                      {group.group}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {group.keys.map((perm) => {
                        const isChecked = selectedPermissions.includes(perm.key);
                        return (
                          <div
                            key={perm.key}
                            onClick={() => handleTogglePermission(perm.key)}
                            className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer select-none transition-all ${
                              isChecked
                                ? "bg-purple-50/20 border-[#8b5cf6]/50 shadow-sm"
                                : "bg-slate-50/20 border-slate-200/80 hover:bg-slate-50/50"
                            }`}
                          >
                            <div className="min-w-0 pr-3">
                              <span className="font-extrabold text-slate-700 text-xs block truncate">
                                {perm.label}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400 font-mono block mt-1">
                                {perm.key}
                              </span>
                            </div>
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isChecked ? "bg-[#8b5cf6] border-[#8b5cf6]" : "bg-white border-slate-350"
                            }`}>
                              {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
