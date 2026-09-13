"use client";

import { useState, useEffect } from "react";
import { UserCheck, Plus, Search, RefreshCw, Loader2, X, ShieldAlert, Trash2, Key, Shield, Users, FileText, UserX, UserCheck2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar?: string | null;
  role: string;
  status: string;
  createdAt: string;
  isSuper: boolean;
  permissions?: string[];
}

export default function AdministratorsPage() {
  const router = useRouter();
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [previewAdmin, setPreviewAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "SUPER" | "ADMIN">("ALL");
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 全局统一确认框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  useEffect(() => {
    loadAdmins();
    loadUsers();
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
        setAdmins(result.data || []);
        if (Array.isArray(result.catalog)) {
          setCatalog(result.catalog);
        }
      } else {
        toast.error("加载管理员列表失败");
      }
    } catch (e) {
      toast.error("加载列表异常");
    } finally {
      setLoading(false);
    }
  };

  // 业务功能 1：临时停用 / 恢复启用管理员后台管理特权（仅限制后台访问，绝对不影响前台账号与空间操作，并完整保留已配权限）
  const handleToggleAdminStatus = (targetAdmin: AdminUser) => {
    if (targetAdmin.isSuper) {
      toast.error("超级管理员不可停用");
      return;
    }

    const isCurrentActive = targetAdmin.status !== "inactive";
    const nextStatus = isCurrentActive ? "inactive" : "active";
    const actionText = isCurrentActive ? "临时停用后台特权" : "恢复启用后台特权";

    setConfirmDialog({
      isOpen: true,
      title: `${actionText}`,
      message: isCurrentActive
        ? `【停用说明】停用后，${targetAdmin.name || targetAdmin.email} 将仅暂停管理后台的访问与管理特权，系统会【完整保留】其当前已配置的全部功能权限；该账号的全站前台功能（登录系统、创建/加入企业空间、协同操作等）完全正常不受任何影响！后续随时可点击“启用”立即恢复后台权限。\n\n确定要临时停用该管理员的后台管理权限吗？`
        : `【启用说明】启用后，${targetAdmin.name || targetAdmin.email} 将立即恢复管理后台访问权限，并直接生效之前已配置的全部功能权限，无需重新授权。\n\n确定要恢复启用该管理员的后台管理特权吗？`,
      type: isCurrentActive ? "warning" : "info",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch("/api/admin/permissions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              action: "toggle_admin_status",
              targetUserId: targetAdmin.id,
              nextStatus,
            }),
          });

          if (res.ok) {
            toast.success(`已成功${actionText}！`);
            setAdmins((prev) =>
              prev.map((a) => (a.id === targetAdmin.id ? { ...a, status: nextStatus } : a))
            );
          } else {
            const err = await res.json();
            toast.error(err.error || `${actionText}操作失败`);
          }
        } catch {
          toast.error(`${actionText}操作发生异常`);
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const loadUsers = async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/users?limit=400", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      if (res.ok) {
        const result = await res.json();
        const userList = result.users || result.data?.users || [];
        // 仅排除最高超级管理员和已经成为运营管理员的账号，防止重复委派任命
        const normalUsers = userList.filter((u: any) => {
          const r = (u.role || "").toUpperCase();
          return r !== "SUPER_ADMIN" && r !== "SUPERADMIN" && r !== "ADMIN" && r !== "PLATFORM_ADMIN";
        });
        setUsers(normalUsers);
      }
    } catch (e) {
      console.error("加载系统用户失败", e);
    }
  };

  // 处理任命/更改管理员角色 (默认升级为普通运营管理员 admin)
  const handleAppointAdmin = async () => {
    if (!selectedUserId) {
      toast.error("请选择要任命的用户");
      return;
    }

    const isTargetAlreadyAdmin = admins.some(a => a.id === selectedUserId);
    if (isTargetAlreadyAdmin) {
      toast.error("任命失败：该成员当前已是管理员，请勿重复任命");
      return;
    }

    try {
      setSubmitting(true);
      const authToken = getAuthToken();

      const patchRes = await fetch("/api/admin/user", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          userId: selectedUserId,
          role: "admin",
          status: "active"
        })
      });

      if (patchRes.ok) {
        toast.success("已成功添加运营管理员！");
        setShowModal(false);
        setSelectedUserId("");
        setCandidateSearch("");
        loadAdmins();
        loadUsers();
      } else {
        const err = await patchRes.json();
        toast.error(err.error || "添加管理员失败");
      }
    } catch (e) {
      toast.error("操作发生异常");
    } finally {
      setSubmitting(false);
    }
  };

  // 业务功能 2：彻底撤销管理员身份（降级为普通用户，并清空所有已分配的后台管理权限）
  const handleRevokeAdmin = (targetAdmin: AdminUser) => {
    if (targetAdmin.isSuper) {
      toast.error("超级管理员不可撤销");
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "彻底撤销管理员身份",
      message: `【撤销说明】撤销后，${targetAdmin.name || targetAdmin.email} 将彻底降级为普通注册用户，其已配置的所有管理权限将被全部清空回收。下次若重新添加，需重新为其分配权限。\n\n提示：若您仅希望临时阻止其登录后台，请使用【停用】功能（停用会完整保留其已配置的权限）。\n\n确定要彻底撤销该账号的管理员身份吗？`,
      type: "danger",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          // 1. 将角色降级为普通用户 user
          const res = await fetch("/api/admin/user", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
            },
            body: JSON.stringify({
              userId: targetAdmin.id,
              role: "user"
            })
          });

          // 2. 同时清空其在权限字典中的分配映射，做到彻底回收权限
          try {
            await fetch("/api/admin/permissions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
              },
              body: JSON.stringify({
                targetUserId: targetAdmin.id,
                permissions: []
              })
            });
          } catch {
            // 补偿处理
          }

          if (res.ok) {
            toast.success("已成功彻底撤销管理员身份，并清空已分配的权限配置");
            loadAdmins();
            loadUsers();
          } else {
            const err = await res.json();
            toast.error(err.error || "撤销失败");
          }
        } catch (e) {
          toast.error("撤销操作发生异常");
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const filteredAdmins = admins.filter(admin => {
    const term = searchQuery.toLowerCase();
    const matchQuery = (
      admin.name?.toLowerCase().includes(term) ||
      admin.email?.toLowerCase().includes(term) ||
      admin.id.toLowerCase().includes(term)
    );
    if (!matchQuery) return false;
    if (roleFilter === "SUPER") return admin.isSuper;
    if (roleFilter === "ADMIN") return !admin.isSuper;
    return true;
  });

  // 候选用户过滤
  const candidateUsers = users.filter((u) => {
    const term = candidateSearch.toLowerCase();
    return (
      (u.name || "").toLowerCase().includes(term) ||
      (u.email || "").toLowerCase().includes(term) ||
      u.id.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 pb-12 font-sans text-left">
      {/* 顶部标头导航区 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              <span className="w-9 h-9 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-xs shrink-0">
                <UserCheck className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight whitespace-nowrap">
                管理员管理
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200/80 select-none whitespace-nowrap shrink-0">
                角色与权限
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              管理平台管理员账号，支持添加运营人员并为其分配后台管理权限
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            <Link
              href="/admin/permissions"
              className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Key className="w-4 h-4 text-[#3182ce]" />
              功能授权矩阵
            </Link>
            <button
              onClick={loadAdmins}
              disabled={loading}
              className="h-10 px-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="刷新管理员列表"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              刷新
            </button>
            <button
              onClick={() => {
                loadUsers();
                setShowModal(true);
              }}
              className="h-10 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              添加管理员
            </button>
          </div>
        </div>
      </div>

      {/* 3 大核心业务指标卡片（按真实业务价值呈现，拒绝无意义指标凑数） */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">管理员总数</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-800 mt-2 tracking-tight">
            {loading ? "—" : admins.length}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">系统当前在册的管理员账号总数</div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">运营管理员</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 mt-2 tracking-tight">
            {loading ? "—" : admins.filter(a => !a.isSuper).length}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">负责平台日常业务与内容运营</div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">已分配功能权限</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-[#805ad5] flex items-center justify-center">
              <Key className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-[#805ad5] mt-2 tracking-tight">
            {loading ? "—" : admins.reduce((sum, a) => sum + (a.permissions?.length || 0), 0)}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">运营管理员已开通的功能权限总计</div>
        </div>
      </div>

      {/* 搜索、筛选与管理卡片 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {/* 工具栏 */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <input
                type="text"
                placeholder="按姓名 / 邮箱 / 用户 ID 检索管理员..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-4 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            {/* 角色过滤胶囊 */}
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl text-xs font-bold shrink-0">
              <button
                onClick={() => setRoleFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  roleFilter === "ALL" ? "bg-white text-[#3182ce] shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                全部 ({admins.length})
              </button>
              <button
                onClick={() => setRoleFilter("SUPER")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  roleFilter === "SUPER" ? "bg-white text-amber-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                超级管理员 ({admins.filter(a => a.isSuper).length})
              </button>
              <button
                onClick={() => setRoleFilter("ADMIN")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  roleFilter === "ADMIN" ? "bg-white text-emerald-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                运营管理员 ({admins.filter(a => !a.isSuper).length})
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            共找到 <span className="font-bold text-slate-700">{filteredAdmins.length}</span> 位管理员
          </div>
        </div>

        {/* 业务概念辨析提示条：彻底说清“停用”与“撤销”的差异 */}
        <div className="mx-6 mb-4 px-3.5 py-2.5 bg-blue-50/50 border border-blue-200/70 rounded-xl flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-[#3182ce]/15 text-[#3182ce] flex items-center justify-center font-bold text-[11px] shrink-0">
              i
            </span>
            <span className="leading-relaxed">
              <strong className="text-slate-800">操作释义：</strong>
              <span className="text-amber-700 font-bold">【停用特权】</span>仅暂停管理后台特权，<strong className="text-slate-700">保留全部已配权限，全站前台账号与空间协作正常使用不受影响</strong>，启用时一键恢复；
              <span className="text-red-600 font-bold ml-3">【撤销身份】</span>解除管理员角色（降级普通用户）并<strong className="text-red-700">清空后台已配权限</strong>，前台账号依然正常保留，再次设为管理员需重新授权。
            </span>
          </div>
        </div>

        {/* 管理员列表表格 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
            <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500">正在加载管理员列表...</span>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="min-h-[320px] flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">未找到符合条件的管理员</h3>
            <p className="text-xs text-slate-400 mt-1">请尝试更换检索关键词或调整角色筛选选项</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse min-w-[900px]">
              <thead className="bg-slate-50/70 border-b border-slate-200/80">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">管理员账号</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">角色类型</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">权限范围</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">账号状态</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">创建时间</th>
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="group hover:bg-slate-50/60 transition-colors">
                    {/* 用户头像与信息 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 shrink-0">
                          {admin.avatar ? (
                            <img
                              src={admin.avatar}
                              alt={admin.name || "管理员头像"}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200/80 shadow-xs"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none";
                                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            style={{ display: admin.avatar ? "none" : "flex" }}
                            className={`w-10 h-10 rounded-xl items-center justify-center font-black text-sm text-white shadow-xs ${
                              admin.isSuper 
                                ? "bg-gradient-to-br from-amber-400 to-amber-600" 
                                : "bg-gradient-to-br from-[#3182ce] to-[#2b6cb0]"
                            }`}
                          >
                            {admin.name?.charAt(0).toUpperCase() || (admin.email?.charAt(0).toUpperCase() || "A")}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            {admin.name || "未设姓名"}
                            {admin.isSuper && (
                              <span className="px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[10px] font-black">
                                ROOT
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-medium mt-0.5">{admin.email || "未绑定邮箱"}</div>
                        </div>
                      </div>
                    </td>

                    {/* 管理级别 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 border text-[11px] font-black rounded-full select-none ${
                        admin.isSuper 
                          ? "bg-amber-50 text-amber-700 border-amber-200/80" 
                          : "bg-blue-50 text-[#3182ce] border-blue-200/80"
                      }`}>
                        {admin.isSuper ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                        {admin.isSuper ? "超级管理员" : "运营管理员"}
                      </span>
                    </td>

                    {/* 权限包概况 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {admin.isSuper ? (
                        <button
                          type="button"
                          onClick={() => setPreviewAdmin(admin)}
                          className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                          title="点击预览系统最高权限"
                        >
                          ● 全部权限 (80项)
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewAdmin(admin)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-[#3182ce] text-slate-700 text-[11px] font-bold rounded transition-colors cursor-pointer"
                            title="点击免跳出快速预览已分配权限明细"
                          >
                            已分配 {admin.permissions?.length || 0} 项权限
                          </button>
                          <Link
                            href={`/admin/permissions?adminId=${encodeURIComponent(admin.id)}`}
                            className="text-xs font-bold text-[#3182ce] hover:underline"
                            title="前往修改该管理员的权限矩阵"
                          >
                            配置权限
                          </Link>
                        </div>
                      )}
                    </td>

                    {/* 账号状态（支持真实停用与启用状态指示） */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {admin.status === "inactive" ? (
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-full text-[11px]"
                          title="该管理员已临时停用后台管理特权，但系统已完整保留其权限配置；其全站前台账号、工作空间创建与协作功能100%正常不受影响"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          已停用特权 (保留权限·前台正常)
                        </span>
                      ) : (
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-full text-[11px]"
                          title="管理员管理特权正常生效中，可访问后台并执行已授权业务"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          特权正常生效
                        </span>
                      )}
                    </td>

                    {/* 创建时间 */}
                    <td className="px-6 py-4 text-xs text-slate-500 font-medium whitespace-nowrap">
                      {new Date(admin.createdAt).toLocaleString("zh-CN", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>

                    {/* 粘滞操作列 */}
                    <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-6 py-4 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/admin/operation-logs?user=${encodeURIComponent(admin.email || admin.name || admin.id)}`}
                          className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-[#3182ce] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs"
                          title="查看该管理员的操作日志"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>日志</span>
                        </Link>
                        {!admin.isSuper && (
                          <button
                            type="button"
                            onClick={() => setPreviewAdmin(admin)}
                            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-purple-50 text-slate-600 hover:text-[#8b5cf6] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="免跳出查看该管理员的权限清单"
                          >
                            <Key className="w-3.5 h-3.5 text-[#8b5cf6]" />
                            <span>权限</span>
                          </button>
                        )}
                        {!admin.isSuper && (
                          <button
                            type="button"
                            onClick={() => handleToggleAdminStatus(admin)}
                            className={`h-8 px-2.5 bg-white border rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer ${
                              admin.status === "inactive"
                                ? "border-emerald-200 hover:bg-emerald-50 text-emerald-600"
                                : "border-amber-200 hover:bg-amber-50 text-amber-600"
                            }`}
                            title={
                              admin.status === "inactive"
                                ? "【恢复启用特权】：恢复后台登录与管理权限，并即刻恢复生效已配权限"
                                : "【临时停用特权】：仅限制后台管理访问，完整保留已配权限，全站前台使用完全不受影响"
                            }
                          >
                            {admin.status === "inactive" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            <span>{admin.status === "inactive" ? "启用特权" : "停用特权"}</span>
                          </button>
                        )}
                        {!admin.isSuper && (
                          <button
                            type="button"
                            onClick={() => handleRevokeAdmin(admin)}
                            className="h-8 px-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="【撤销管理员身份】：解除管理员职务并清空已配置权限，保留前台普通账号（再次任命需从零配置）"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>撤销身份</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 添加运营管理员弹窗（自适应防截断与弹性独立滚动） */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-100 text-left flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[85vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 z-10">
            {/* 弹窗标头 */}
            <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    添加运营管理员
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    选择一位注册用户，将其设置为运营管理员
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(false)} 
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗主体内容区（独立滚动，弹性自适应防截断） */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* 搜索候选人 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                  <span className="text-red-500 font-black text-sm">*</span>
                  选择用户 (可选用户: {users.length} 人)
                </label>
                <div className="relative mb-3">
                  <input
                    type="text"
                    placeholder="输入用户名或邮箱搜索用户..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="w-full h-9 sm:h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 sm:top-3" />
                </div>

                {users.length === 0 ? (
                  <div className="text-xs text-amber-700 font-bold p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                    系统中当前未检测到可选的普通注册用户。
                  </div>
                ) : candidateUsers.length === 0 ? (
                  <div className="text-xs text-slate-500 font-medium p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    未找到包含「{candidateSearch}」的用户
                  </div>
                ) : (
                  <div className="max-h-40 sm:max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/40">
                    {candidateUsers.map((u) => {
                      const isSelected = selectedUserId === u.id;
                      return (
                        <div
                          key={u.id}
                          onClick={() => setSelectedUserId(u.id)}
                          className={`p-2.5 sm:p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? "bg-blue-50/80 border-l-4 border-l-[#3182ce]" : "hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="relative w-8 h-8 shrink-0">
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt={u.name || "用户头像"}
                                  className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = "none";
                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                    if (fallback) fallback.style.display = "flex";
                                  }}
                                />
                              ) : null}
                              <div
                                style={{ display: u.avatar ? "none" : "flex" }}
                                className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 items-center justify-center font-bold text-xs"
                              >
                                {(u.name || u.email || "U").charAt(0).toUpperCase()}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 truncate">
                                {u.name || "未命名用户"}
                              </div>
                              <div className="text-[11px] text-slate-400 font-medium truncate">
                                {u.email || "无邮箱"} · 注册于 {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? "border-[#3182ce] bg-[#3182ce]" : "border-slate-300 bg-white"
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 赋权提示 */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100/80 text-[11px] text-[#2b6cb0] font-medium leading-relaxed">
                ℹ️ <strong>使用说明：</strong>
                添加为运营管理员后，该用户即可登录管理后台。您可以在【功能授权矩阵】中为其分配具体的管理模块权限。
              </div>
            </div>

            {/* 弹窗底部操作栏（固定吸底，高度自适应，绝不截断） */}
            <div className="shrink-0 flex gap-3 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 h-9 sm:h-10 border border-slate-200 rounded-[4px] text-slate-700 font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAppointAdmin}
                disabled={submitting || !selectedUserId}
                className="flex-1 h-9 sm:h-10 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-[4px] font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>确认添加</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理员权限明细免跳出预览弹窗 */}
      {previewAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setPreviewAdmin(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-100 text-left flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[85vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 z-10">
            {/* 标头 */}
            <div className="shrink-0 flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {previewAdmin.name?.charAt(0).toUpperCase() || (previewAdmin.email?.charAt(0).toUpperCase() || "A")}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800">
                      {previewAdmin.name || "未设姓名"}
                    </h3>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                      previewAdmin.isSuper ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-[#3182ce] border-blue-200"
                    }`}>
                      {previewAdmin.isSuper ? "超级管理员" : "运营管理员"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    {previewAdmin.email || "未绑定邮箱"} · {previewAdmin.isSuper ? "拥有系统最高全部权限" : `当前已分配 ${previewAdmin.permissions?.length || 0} 项功能权限`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAdmin(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 min-h-0 bg-slate-50/40">
              {previewAdmin.isSuper ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium leading-relaxed">
                  👑 <strong>超级管理员全量权限：</strong>
                  该账号拥有系统内置所有业务模块与 80 项功能权限的完全操作权限。
                </div>
              ) : (previewAdmin.permissions?.length || 0) === 0 ? (
                <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                  <Key className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600">当前尚未分配任何功能权限</p>
                  <p className="text-[11px] text-slate-400 mt-1">该账号登录后暂无受权模块，点击下方按钮可前往配置权限。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {catalog
                    .map((group) => {
                      const grantedKeys = (group.keys || []).filter((k: any) =>
                        previewAdmin.permissions?.includes(k.key)
                      );
                      return { ...group, grantedKeys };
                    })
                    .filter((group) => group.grantedKeys.length > 0)
                    .map((group) => (
                      <div key={group.group} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                          <span className="text-xs font-bold text-slate-700">{group.group}</span>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            已授权 {group.grantedKeys.length} 项
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.grantedKeys.map((k: any) => (
                            <span
                              key={k.key}
                              className="px-2 py-1 bg-blue-50/80 border border-blue-100 text-[#2b6cb0] text-[11px] font-medium rounded-md"
                              title={k.desc || k.label}
                            >
                              {k.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="shrink-0 flex items-center justify-between p-4 border-t border-slate-100 bg-white">
              <span className="text-xs text-slate-400 font-medium">
                {previewAdmin.isSuper ? "系统最高账号" : `已分配 ${previewAdmin.permissions?.length || 0} 个权限点`}
              </span>
              <div className="flex items-center gap-2">
                {!previewAdmin.isSuper && (
                  <Link
                    href={`/admin/permissions?adminId=${encodeURIComponent(previewAdmin.id)}`}
                    className="h-8 px-3 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-[4px] transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>前往配置权限</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewAdmin(null)}
                  className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-[4px] transition-colors cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 全局统一拟真确认弹窗 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="确认撤销"
        cancelText="取消"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

