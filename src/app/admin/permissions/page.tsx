"use client";

import { useState, useEffect, Suspense } from "react";
import { Key, ArrowLeft, RefreshCw, Check, ShieldAlert, Loader2, Save, CheckSquare, Square, Users, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

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

function PermissionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryAdminId = searchParams.get("adminId");
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
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      if (res.ok) {
        const result = await res.json();
        const data: AdminUser[] = result.data || [];
        setAdmins(data);
        if (data.length > 0) {
          // 如果 URL 指定了 adminId，则优先选中目标管理员
          let target = queryAdminId ? data.find(a => a.id === queryAdminId) : null;
          if (!target) {
            target = data.find(a => !a.isSuper) || data[0];
          }
          setSelectedAdminId(target.id);
          setSelectedPermissions(target.permissions || []);
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

  // 分组全选/清空
  const handleToggleGroup = (groupKeys: string[]) => {
    const allInGroupChecked = groupKeys.every(k => selectedPermissions.includes(k));
    if (allInGroupChecked) {
      setSelectedPermissions(prev => prev.filter(k => !groupKeys.includes(k)));
    } else {
      setSelectedPermissions(prev => Array.from(new Set([...prev, ...groupKeys])));
    }
  };

  // 全量全选 / 全量清空
  const allAvailableKeys = AVAILABLE_PERMISSIONS.flatMap(g => g.keys.map(k => k.key));
  const isAllChecked = allAvailableKeys.length > 0 && allAvailableKeys.every(k => selectedPermissions.includes(k));

  const handleToggleAll = () => {
    if (isAllChecked) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions([...allAvailableKeys]);
    }
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
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
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
    <div className="space-y-6 pb-8">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Key className="w-8 h-8 text-[#3182ce]" />
            管理员模块授权中心
          </h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">
            为平台运营管理员分配、细化核心业务模块的读写或高危操作授权。超级管理员自动拥有全站所有特权。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/administrators"
            className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Users className="w-4 h-4 text-[#3182ce]" />
            管理员成员列表
          </Link>
          <button
            onClick={() => router.push("/admin")}
            className="h-10 px-4 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            返回大盘
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[350px]">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-[#3182ce] animate-spin mx-auto mb-4" />
            <p className="text-slate-500 font-bold text-xs">正在拉取平台管理员及授权数据...</p>
          </div>
        </div>
      ) : admins.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center min-h-[300px] flex items-center justify-center">
          <div>
            <ShieldAlert className="w-12 h-12 text-slate-400 mx-auto mb-3" />
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
              <button onClick={loadAdmins} className="text-[#3182ce] hover:underline flex items-center gap-0.5">
                <RefreshCw className="w-3.5 h-3.5" /> 刷新
              </button>
            </h3>
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {admins.map((admin) => (
                <button
                  key={admin.id}
                  onClick={() => handleAdminSelect(admin.id)}
                  className={`w-full p-3.5 rounded-xl border flex flex-col gap-1 transition-all text-left cursor-pointer ${
                    admin.id === selectedAdminId
                      ? "bg-blue-50/60 border-[#3182ce] shadow-sm ring-1 ring-[#3182ce]/20"
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
                        : "bg-blue-50 text-blue-600 border-blue-100"
                    }`}>
                      {admin.isSuper ? "超级管理员" : "运营管理员"}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate mt-0.5">{admin.email}</span>
                  <span className="text-[9px] text-[#3182ce] font-bold mt-1.5">
                    {admin.isSuper ? "★ 拥有全量免鉴特权" : `已授权 ${admin.permissions.length} 项功能`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：权限包勾选矩阵 */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-left space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#3182ce]" />
                  授权配置矩阵：{currentAdmin?.name || "未知管理员"}
                </h3>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  已配置 <span className="text-[#3182ce] font-bold">{selectedPermissions.length}</span> 项细粒度权限，实时持久化到数据库
                </p>
              </div>
              {currentAdmin && !currentAdmin.isSuper && (
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={handleToggleAll}
                    type="button"
                    className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {isAllChecked ? <Square className="w-3.5 h-3.5 text-slate-500" /> : <CheckSquare className="w-3.5 h-3.5 text-[#3182ce]" />}
                    {isAllChecked ? "全部清空" : "一键全选"}
                  </button>
                  <button
                    onClick={handleSavePermissions}
                    disabled={saving}
                    className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white disabled:bg-slate-100 disabled:text-slate-400 text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>保存权限包</span>
                  </button>
                </div>
              )}
            </div>

            {currentAdmin?.isSuper ? (
              <div className="p-8 bg-amber-50/40 rounded-2xl border border-amber-100/50 flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
                <ShieldAlert className="w-12 h-12 text-amber-500" />
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800">超级管理员免配置提示</h4>
                  <p className="text-xs font-semibold text-slate-500 mt-2 leading-relaxed max-w-sm">
                    该账号在数据库中拥有最高超级管理员 (SuperAdmin) 身份。<br />
                    系统架构自动为超级管理员授予并豁免全站所有模块的鉴权拦截，无需也禁止在此处手动缩权或配置更改。
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {AVAILABLE_PERMISSIONS.map((group, idx) => {
                  const groupKeyStrings = group.keys.map(k => k.key);
                  const isGroupAll = groupKeyStrings.every(k => selectedPermissions.includes(k));
                  const groupCheckedCount = groupKeyStrings.filter(k => selectedPermissions.includes(k)).length;

                  return (
                    <div key={idx} className="space-y-3 p-4 rounded-xl bg-slate-50/40 border border-slate-100">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black text-slate-700 tracking-wider">
                            {group.group}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-bold">
                            ({groupCheckedCount}/{group.keys.length})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleGroup(groupKeyStrings)}
                          className="text-[11px] text-[#3182ce] hover:underline font-bold cursor-pointer"
                        >
                          {isGroupAll ? "取消该组" : "全选该组"}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {group.keys.map((perm) => {
                          const isChecked = selectedPermissions.includes(perm.key);
                          return (
                            <div
                              key={perm.key}
                              onClick={() => handleTogglePermission(perm.key)}
                              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer select-none transition-all ${
                                isChecked
                                  ? "bg-blue-50/40 border-[#3182ce]/50 shadow-xs"
                                  : "bg-white border-slate-200/80 hover:bg-slate-50"
                              }`}
                            >
                              <div className="min-w-0 pr-3">
                                <span className={`text-xs block truncate ${isChecked ? "font-bold text-[#2b6cb0]" : "font-semibold text-slate-700"}`}>
                                  {perm.label}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 font-mono block mt-0.5">
                                  {perm.key}
                                </span>
                              </div>
                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isChecked ? "bg-[#3182ce] border-[#3182ce]" : "bg-white border-slate-300"
                              }`}>
                                {isChecked && <Check className="w-3 h-3 text-white stroke-[3]" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PermissionsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[350px]">
        <Loader2 className="w-10 h-10 text-[#3182ce] animate-spin" />
      </div>
    }>
      <PermissionsContent />
    </Suspense>
  );
}
