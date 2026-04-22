"use client";

import { useState, useEffect } from "react";
import { Search, Filter, MoreVertical, Edit2, Trash2, Shield, UserCheck, UserX } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  status: "ACTIVE" | "INACTIVE" | "BANNED";
  avatar?: string;
  createdAt: string;
  lastLoginAt?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      // TODO: 调用 API 获取真实数据
      // 模拟数据
      const mockUsers: User[] = [
        {
          id: "1",
          name: "Admin User",
          email: "admin@zhige.os",
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          createdAt: "2024-01-01",
          lastLoginAt: "2024-01-15",
        },
        {
          id: "2",
          name: "张三",
          email: "zhangsan@example.com",
          phone: "13800138000",
          role: "USER",
          status: "ACTIVE",
          createdAt: "2024-01-05",
          lastLoginAt: "2024-01-14",
        },
        {
          id: "3",
          name: "李四",
          email: "lisi@example.com",
          role: "ADMIN",
          status: "ACTIVE",
          createdAt: "2024-01-10",
          lastLoginAt: "2024-01-15",
        },
      ];
      setUsers(mockUsers);
    } catch (error) {
      console.error("Load users error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = filterRole === "all" || user.role === filterRole;
    const matchStatus = filterStatus === "all" || user.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
            超级管理员
          </span>
        );
      case "ADMIN":
        return (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
            管理员
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
            普通用户
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            活跃
          </span>
        );
      case "INACTIVE":
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            未激活
          </span>
        );
      case "BANNED":
        return (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            已封禁
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">用户管理</h1>
        <p className="text-sm text-slate-500">管理系统用户、分配权限、审核用户</p>
      </div>

      {/* 筛选工具栏 */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索用户名、邮箱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-sm"
          >
            <option value="all">所有角色</option>
            <option value="SUPER_ADMIN">超级管理员</option>
            <option value="ADMIN">管理员</option>
            <option value="USER">普通用户</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-sm"
          >
            <option value="all">所有状态</option>
            <option value="ACTIVE">活跃</option>
            <option value="INACTIVE">未激活</option>
            <option value="BANNED">已封禁</option>
          </select>
          <button className="px-4 py-2 bg-[#3182ce] text-white rounded-lg hover:bg-[#2563eb] transition-colors flex items-center gap-2">
            <Filter className="w-4 h-4" />
            筛选
          </button>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  用户
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  角色
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  注册时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  最后登录
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">
                          {user.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {user.email}
                        </div>
                        {user.phone && (
                          <div className="text-xs text-slate-400">
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                  <td className="px-6 py-4">{getStatusBadge(user.status)}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {user.createdAt}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {user.lastLoginAt || "从未登录"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={() =>
                          setShowActionMenu(
                            showActionMenu === user.id ? null : user.id
                          )
                        }
                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-600" />
                      </button>

                      {showActionMenu === user.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowActionMenu(null)}
                          />
                          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-20">
                            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                              <Edit2 className="w-4 h-4" />
                              编辑用户
                            </button>
                            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                              <Shield className="w-4 h-4" />
                              分配权限
                            </button>
                            {user.status === "ACTIVE" ? (
                              <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                <UserX className="w-4 h-4" />
                                封禁用户
                              </button>
                            ) : (
                              <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors">
                                <UserCheck className="w-4 h-4" />
                                解封用户
                              </button>
                            )}
                            <hr className="my-2 border-slate-200" />
                            <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-4 h-4" />
                              删除用户
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            显示 {filteredUsers.length} 个用户
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              上一页
            </button>
            <button className="px-4 py-2 bg-[#3182ce] text-white rounded-lg text-sm hover:bg-[#2563eb] transition-colors">
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
