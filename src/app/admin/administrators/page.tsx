"use client";

import { useState, useEffect } from "react";
import { UserCheck, ArrowLeft, Plus, Search, RefreshCw, Loader2, X, ShieldAlert, Trash2, Key } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
  isSuper: boolean;
}

export default function AdministratorsPage() {
  const router = useRouter();
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
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
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/admin/permissions", {
        headers: userId ? { Authorization: `Bearer ${userId}` } : {}
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
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/admin/users?limit=400", {
        headers: userId ? { Authorization: `Bearer ${userId}` } : {}
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

    // 前端防呆校验：限制系统中只能存在唯一一个普通运营管理员 (PlatformAdmin)
    const hasExistingAdmin = admins.some(a => !a.isSuper && (a.role === "admin" || (a.role || "").toLowerCase() === "platform_admin"));
    const isTargetAlreadyAdmin = admins.some(a => a.id === selectedUserId && !a.isSuper);
    
    if (isTargetAlreadyAdmin) {
      toast.error("任命失败：该成员当前已是运营管理员，请勿重复任命");
      return;
    }

    if (hasExistingAdmin && !isTargetAlreadyAdmin) {
      toast.error("任命失败：系统当前已存在一位运营管理员，请先撤销其管理员身份再执行新指派。");
      return;
    }

    try {
      setSubmitting(true);
      const userId = localStorage.getItem("userId");

      const patchRes = await fetch("/api/admin/user", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { Authorization: `Bearer ${userId}` } : {})
        },
        body: JSON.stringify({
          userId: selectedUserId,
          role: "admin",
          status: "active"
        })
      });

      if (patchRes.ok) {
        toast.success(`已成功任命/更改管理员角色！`);
        setShowModal(false);
        setSelectedUserId("");
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
      title: "撤销管理员特权",
      message: `确定要撤销 ${targetAdmin.name || targetAdmin.email} 的管理员特权吗？撤销后他将变回普通用户，且其被赋予的所有模块权限都将被自动清空。`,
      type: "danger",
      onConfirm: async () => {
        try {
          const userId = localStorage.getItem("userId");
          const res = await fetch("/api/admin/user", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(userId ? { Authorization: `Bearer ${userId}` } : {})
            },
            body: JSON.stringify({
              userId: targetAdmin.id,
              role: "user"
            })
          });

          if (res.ok) {
            toast.success("已成功撤销其管理员身份，用户已恢复为普通级别");
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
    return (
      admin.name?.toLowerCase().includes(term) ||
      admin.email?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* 头部面包屑与返回 */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <UserCheck className="w-8 h-8 text-[#10b981]" />
            管理员治理中心
          </h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">
            设置和管理平台管理员成员，委派任命新管理员，进行权限包更改分配，或取消管理员身份。
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

      {/* 搜索与快捷配置 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="根据姓名 / 邮箱搜索管理员..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:border-blue-500 outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button onClick={loadAdmins} className="h-10 px-3 bg-slate-100 hover:bg-slate-200/60 rounded-lg text-xs font-bold transition-all flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 刷新
          </button>
          <button
            onClick={() => {
              loadUsers();
              setShowModal(true);
            }}
            className="h-10 px-4 bg-[#10b981] hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            任命新管理员
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="w-10 h-10 text-[#10b981] animate-spin" />
        </div>
      ) : filteredAdmins.length === 0 ? (
        <div className="bg-white/80 border border-slate-200 rounded-2xl shadow-sm min-h-[300px] flex items-center justify-center p-8 text-center">
          <div>
            <ShieldAlert className="w-12 h-12 text-slate-350 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">未找到匹配的管理员记录</h3>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden text-left">
          <table className="w-full table-auto border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">管理员信息</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">管理级别</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">账号状态</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase whitespace-nowrap">委任时间</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdmins.map((admin) => (
                <tr key={admin.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white ${
                        admin.isSuper ? "bg-amber-500" : "bg-emerald-500"
                      }`}>
                        {admin.name?.charAt(0) || "A"}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">{admin.name || "运营成员"}</div>
                        <div className="text-xs text-slate-400 font-semibold mt-0.5">{admin.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 border text-[10px] font-black rounded-full select-none ${
                      admin.isSuper 
                        ? "bg-amber-50 text-amber-600 border-amber-100" 
                        : "bg-emerald-50 text-emerald-600 border-emerald-100"
                    }`}>
                      {admin.isSuper ? "最高超级管理员" : "运营管理员"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 bg-green-50 border border-green-100 text-green-600 font-black rounded text-[10px]">
                      正常活跃
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400 font-bold">
                    {new Date(admin.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="px-6 py-4 text-right flex items-center justify-end gap-1.5 pt-6">
                    {!admin.isSuper && (
                      <button
                        onClick={() => router.push("/admin/permissions")}
                        className="p-2 text-slate-400 hover:text-[#8b5cf6] hover:bg-purple-50 rounded-lg transition-all inline-flex items-center justify-center cursor-pointer"
                        title="更改模块权限配置"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                    )}
                    {!admin.isSuper && (
                      <button
                        onClick={() => handleRevokeAdmin(admin)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all inline-flex items-center justify-center cursor-pointer"
                        title="撤销管理员身份"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 任命新管理员弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] overflow-hidden border border-slate-100 text-left">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                委派任命新管理员成员
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-extrabold text-slate-700 mb-2 flex items-center gap-1.5">
                  <span className="text-red-500 font-black text-sm">*</span>
                  选择普通注册用户 (用户名 - 邮箱)
                </label>
                {users.length === 0 ? (
                  <div className="text-xs text-amber-600 font-bold p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    系统中当前未检测到可选的普通用户账号。
                  </div>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none cursor-pointer focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  >
                    <option value="">-- 请选择要任命的用户 --</option>
                    {users.map((u) => {
                      const isAlreadyAdmin = (u.role || "").toLowerCase() === "admin" || (u.role || "").toLowerCase() === "platform_admin";
                      const emailText = u.email ? u.email : "未绑定邮箱";
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name || "未命名"} ({emailText}) {isAlreadyAdmin ? " [已是管理员]" : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
                <p className="text-xs text-slate-400 font-semibold mt-2 leading-relaxed">
                  自动拉取数据库中的普通注册用户，默认提升为其“运营管理员”级别。
                </p>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 h-10 border border-slate-200 rounded-xl text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-all"
              >
                取消
              </button>
              <button
                onClick={handleAppointAdmin}
                disabled={submitting || !selectedUserId}
                className="flex-1 h-10 bg-[#10b981] hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>确认任命</span>
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
        onConfirm={confirmDialog.onConfirm}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
