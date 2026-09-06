"use client";

import { useState, useEffect } from "react";
import { UserCheck, ArrowLeft, Plus, Search, RefreshCw, Loader2, X, ShieldAlert, Trash2, Key, Shield, Users, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
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
      } else {
        toast.error("加载管理员列表失败");
      }
    } catch (e) {
      toast.error("加载列表异常");
    } finally {
      setLoading(false);
    }
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
        toast.success(`已成功委任运营管理员！已自动分配基础权限包。`);
        setShowModal(false);
        setSelectedUserId("");
        setCandidateSearch("");
        loadAdmins();
        loadUsers();
      } else {
        const err = await patchRes.json();
        toast.error(err.error || "任命管理员失败");
      }
    } catch (e) {
      toast.error("任命操作发生异常");
    } finally {
      setSubmitting(false);
    }
  };

  // 处理撤销管理员身份 (使用统一的 ConfirmDialog 弹窗代替原生 confirm)
  const handleRevokeAdmin = (targetAdmin: AdminUser) => {
    if (targetAdmin.isSuper) {
      toast.error("系统最高超级管理员，禁止撤销其管理员角色");
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "撤销管理员特权确认",
      message: `确定要撤销 ${targetAdmin.name || targetAdmin.email} 的管理员特权吗？撤销后该账号将降级为普通注册用户，且已分配的功能权限包将被自动重置。`,
      type: "danger",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
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

          if (res.ok) {
            toast.success("已成功撤销管理员身份，该用户已恢复为普通用户级别");
            loadAdmins();
            loadUsers();
          } else {
            const err = await res.json();
            toast.error(err.error || "撤销失败");
          }
        } catch (e) {
          toast.error("撤销管理员操作发生异常");
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
      {/* 顶部 Bento 标头导航区 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-xs">
                <UserCheck className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                管理员治理中心 (Administrators & Privileges)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80 select-none">
                RBAC 特权管控
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              管理平台各级管理员席位，委派任命新运营人员，配置功能授权矩阵，维护系统最高管理底座安全
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
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
              title="重新从数据库拉取最新管理员状态"
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
              委派新管理员
            </button>
            <button
              onClick={() => router.push("/admin")}
              className="h-10 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回大盘
            </button>
          </div>
        </div>
      </div>

      {/* 4 大 Bento 指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">在册特权账号</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-800 mt-2 tracking-tight">
            {loading ? "—" : admins.length}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">具备管理后台鉴权通行特权</div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">最高超级管理员 (Root)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600 mt-2 tracking-tight">
            {loading ? "—" : admins.filter(a => a.isSuper).length}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">底层锁定受保护，拥有全量豁免</div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">常规业务管理员</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 mt-2 tracking-tight">
            {loading ? "—" : admins.filter(a => !a.isSuper).length}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">按角色权限策略包受限开放</div>
        </div>

        <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">待分配普通用户</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-[#805ad5] flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-800 mt-2 tracking-tight">
            {users.length}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">可随时指派提拔为后台管理席位</div>
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
                超管 ({admins.filter(a => a.isSuper).length})
              </button>
              <button
                onClick={() => setRoleFilter("ADMIN")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  roleFilter === "ADMIN" ? "bg-white text-emerald-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                业务管 ({admins.filter(a => !a.isSuper).length})
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            共找到 <span className="font-bold text-slate-700">{filteredAdmins.length}</span> 位管理员
          </div>
        </div>

        {/* 管理员列表表格 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[360px] gap-3">
            <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500">正在调取特权席位数据...</span>
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
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">管理员账号画像</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">特权等级</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">授权策略概况</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">账号状态</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap text-left">任命生效时间</th>
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">操作治理</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="group hover:bg-slate-50/60 transition-colors">
                    {/* 用户头像与信息 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-xs ${
                          admin.isSuper 
                            ? "bg-gradient-to-br from-amber-400 to-amber-600" 
                            : "bg-gradient-to-br from-[#3182ce] to-[#2b6cb0]"
                        }`}>
                          {admin.name?.charAt(0).toUpperCase() || (admin.email?.charAt(0).toUpperCase() || "A")}
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
                        {admin.isSuper ? "最高超级管理员" : "运营业务管理员"}
                      </span>
                    </td>

                    {/* 权限包概况 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {admin.isSuper ? (
                        <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                          ● 全量无限制特权 (Full Access)
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[11px] font-bold rounded">
                            已赋权 {admin.permissions?.length || 0} 项
                          </span>
                          <Link
                            href={`/admin/permissions?adminId=${encodeURIComponent(admin.id)}`}
                            className="text-xs font-bold text-[#3182ce] hover:underline"
                          >
                            调整配额
                          </Link>
                        </div>
                      )}
                    </td>

                    {/* 账号状态 */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-black rounded text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        正常就绪
                      </span>
                    </td>

                    {/* 委任时间 */}
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
                          title="查看该管理员的历史审计日志"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>日志</span>
                        </Link>
                        {!admin.isSuper && (
                          <Link
                            href={`/admin/permissions?adminId=${encodeURIComponent(admin.id)}`}
                            className="h-8 px-2.5 bg-white border border-slate-200 hover:bg-purple-50 text-slate-600 hover:text-[#8b5cf6] rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs"
                            title="配置该管理员的权限包"
                          >
                            <Key className="w-3.5 h-3.5 text-[#8b5cf6]" />
                            <span>权限</span>
                          </Link>
                        )}
                        {!admin.isSuper ? (
                          <button
                            onClick={() => handleRevokeAdmin(admin)}
                            className="h-8 px-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                            title="撤销管理员身份"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>降级</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-semibold px-2">
                            受底层保护
                          </span>
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

      {/* 委派任命新管理员弹窗（增强型用户检索与卡片指派） */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 text-left animate-in fade-in zoom-in-95 duration-200">
            {/* 弹窗标头 */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    委派任命新运营管理员
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    从现有普通用户中选择一人升级为平台运营管理员
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="p-6 space-y-4">
              {/* 搜索候选人 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                  <span className="text-red-500 font-black text-sm">*</span>
                  选择待提拔的注册用户 (候选总数: {users.length} 人)
                </label>
                <div className="relative mb-3">
                  <input
                    type="text"
                    placeholder="输入用户名或邮箱模糊搜索候选人..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>

                {users.length === 0 ? (
                  <div className="text-xs text-amber-700 font-bold p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                    系统中当前未检测到可选的普通注册用户。
                  </div>
                ) : candidateUsers.length === 0 ? (
                  <div className="text-xs text-slate-500 font-medium p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    未找到包含「{candidateSearch}」的候选用户
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/40">
                    {candidateUsers.map((u) => {
                      const isSelected = selectedUserId === u.id;
                      return (
                        <div
                          key={u.id}
                          onClick={() => setSelectedUserId(u.id)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? "bg-blue-50/80 border-l-4 border-l-[#3182ce]" : "hover:bg-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0">
                              {(u.name || u.email || "U").charAt(0).toUpperCase()}
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
                🛡️ <strong>任命规则说明：</strong>
                被任命的成员将升级为“运营业务管理员”，可登录后台并查阅基础大盘。任命成功后，可进入「功能授权矩阵」为其自定义指派 18 个管理模块的具体读写权限。
              </div>
            </div>

            {/* 弹窗操作 */}
            <div className="flex gap-3 p-5 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 h-10 border border-slate-200 rounded-xl text-slate-700 font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleAppointAdmin}
                disabled={submitting || !selectedUserId}
                className="flex-1 h-10 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>确认委派任命</span>
              </button>
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

