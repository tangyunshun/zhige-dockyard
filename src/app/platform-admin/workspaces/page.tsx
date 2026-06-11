"use client";

import { useState } from "react";
import {
  Search,
  Ban,
  Settings,
  AlertTriangle,
  CheckCircle,
  X,
} from "lucide-react";
import { useToast } from "@/components/Toast";

interface Workspace {
  id: string;
  name: string;
  ownerEmail: string;
  memberCount: number;
  version: "FREE" | "PRO" | "ENTERPRISE";
  tokenBalance: number;
  status: "ACTIVE" | "BANNED";
  createdAt: string;
}

const mockWorkspaces: Workspace[] = [
  {
    id: "ws_1",
    name: "创新科技有限公司",
    ownerEmail: "admin@tech.com",
    memberCount: 32,
    version: "ENTERPRISE",
    tokenBalance: 48200,
    status: "ACTIVE",
    createdAt: "2024-01-15",
  },
  {
    id: "ws_2",
    name: "明华科技集团",
    ownerEmail: "contact@minghua.com",
    memberCount: 87,
    version: "ENTERPRISE",
    tokenBalance: 125600,
    status: "ACTIVE",
    createdAt: "2023-11-20",
  },
  {
    id: "ws_3",
    name: "个人实验空间",
    ownerEmail: "user@example.com",
    memberCount: 1,
    version: "FREE",
    tokenBalance: 500,
    status: "BANNED",
    createdAt: "2024-02-10",
  },
  {
    id: "ws_4",
    name: "智慧医疗科技",
    ownerEmail: "info@smartmed.com",
    memberCount: 15,
    version: "PRO",
    tokenBalance: 12500,
    status: "ACTIVE",
    createdAt: "2024-01-28",
  },
];

export default function PlatformWorkspacesPage() {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(mockWorkspaces);
  const [searchQuery, setSearchQuery] = useState("");
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [newTokenBalance, setNewTokenBalance] = useState("");
  const [showBanModal, setShowBanModal] = useState(false);

  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ws.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBanWorkspace = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setShowBanModal(true);
  };

  const handleQuotaIntervention = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setNewTokenBalance(workspace.tokenBalance.toString());
    setShowQuotaModal(true);
  };

  const confirmBan = () => {
    if (!selectedWorkspace) return;
    
    setWorkspaces((prev) =>
      prev.map((ws) =>
        ws.id === selectedWorkspace.id
          ? {
              ...ws,
              status: ws.status === "ACTIVE" ? "BANNED" : "ACTIVE",
            }
          : ws
      )
    );

    toast.success(
      selectedWorkspace.status === "ACTIVE" ? "工作空间已封禁" : "工作空间已恢复"
    );
    setShowBanModal(false);
    setSelectedWorkspace(null);
  };

  const confirmQuotaChange = () => {
    if (!selectedWorkspace) return;
    
    setWorkspaces((prev) =>
      prev.map((ws) =>
        ws.id === selectedWorkspace.id
          ? {
              ...ws,
              tokenBalance: parseInt(newTokenBalance),
            }
          : ws
      )
    );

    toast.success("Token 配额已更新");
    setShowQuotaModal(false);
    setSelectedWorkspace(null);
  };

  const getVersionBadge = (version: string) => {
    switch (version) {
      case "FREE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-700 rounded-[4px]">
          免费版
        </span>
        );
      case "PRO":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-[#2b6cb0]/10 text-[#2b6cb0] rounded-[4px]">
          专业版
        </span>
        );
      case "ENTERPRISE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-purple-100 text-purple-700 rounded-[4px]">
          企业版
        </span>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-700 rounded-[4px]">
          正常
        </span>
        );
      case "BANNED":
        return (
          <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-700 rounded-[4px]">
          已封禁
        </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题和搜索 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">租户与空间管控</h1>
          <p className="text-sm text-slate-500 mt-1">
            管理全网所有工作空间，执行封禁、配额干预等操作
          </p>
        </div>
        <div className="w-full sm:w-80">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索工作空间名称或所有者邮箱"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-[8px] text-sm focus:outline-none focus:border-[#2b6cb0] focus:ring-2 focus:ring-[#2b6cb0]/20"
            />
          </div>
        </div>
      </div>

      {/* 工作空间表格 */}
      <div className="bg-white rounded-[8px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  工作空间
                </th>
                <th className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  所有者
                </th>
                <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  成员数
                </th>
                <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  版本
                </th>
                <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  Token 余额
                </th>
                <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  状态
                </th>
                <th className="text-center text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  创建时间
                </th>
                <th className="text-right text-xs font-bold text-slate-600 uppercase tracking-wider py-3.5 px-4">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWorkspaces.map((workspace) => (
                <tr
                  key={workspace.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-[4px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold text-xs">
                        {workspace.name.charAt(0)}
                      </div>
                      <span className="text-sm font-bold text-slate-800">
                        {workspace.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm text-slate-600">
                    {workspace.ownerEmail}
                  </td>
                  <td className="py-4 px-4 text-center text-sm text-slate-600">
                    {workspace.memberCount}
                  </td>
                  <td className="py-4 px-4 text-center">
                    {getVersionBadge(workspace.version)}
                  </td>
                  <td className="py-4 px-4 text-center text-sm font-bold text-slate-800">
                    {workspace.tokenBalance.toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-center">
                    {getStatusBadge(workspace.status)}
                  </td>
                  <td className="py-4 px-4 text-center text-sm text-slate-500">
                    {workspace.createdAt}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleQuotaIntervention(workspace)}
                        className="p-1.5 text-[#2b6cb0] hover:bg-[#2b6cb0]/10 rounded-[4px] transition-all"
                        title="配额干预"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleBanWorkspace(workspace)}
                        className={`p-1.5 rounded-[4px] transition-all ${
                          workspace.status === "ACTIVE"
                            ? "text-red-600 hover:bg-red-100"
                            : "text-green-600 hover:bg-green-100"
                        }`}
                        title={workspace.status === "ACTIVE" ? "封禁" : "恢复"}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 封禁确认弹窗 */}
      {showBanModal && selectedWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-[8px] shadow-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => {
                setShowBanModal(false);
                setSelectedWorkspace(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-[8px] bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-2">
                {selectedWorkspace.status === "ACTIVE"
                  ? "确认封禁此工作空间？"
                  : "确认恢复此工作空间？"}
              </h2>
              <p className="text-sm text-slate-600">
                {selectedWorkspace.status === "ACTIVE"
                  ? "此操作将立即停止该空间的所有功能，相关用户无法访问。"
                  : "此操作将恢复该空间的所有功能，恢复正常访问。"}
              </p>
              <p className="text-sm font-bold text-slate-700 mt-2">
                工作空间：{selectedWorkspace.name}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setSelectedWorkspace(null);
                }}
                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={confirmBan}
                className={`flex-1 px-4 py-3 text-white text-sm font-bold rounded-[4px] hover:shadow-md transition-all ${
                  selectedWorkspace.status === "ACTIVE"
                    ? "bg-gradient-to-r from-red-500 to-red-600"
                    : "bg-gradient-to-r from-green-500 to-green-600"
                }`}
              >
                {selectedWorkspace.status === "ACTIVE" ? "确认封禁" : "确认恢复"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 配额干预弹窗 */}
      {showQuotaModal && selectedWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-[8px] shadow-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => {
                setShowQuotaModal(false);
                setSelectedWorkspace(null);
              }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-12 h-12 rounded-[8px] bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800">配额干预</h2>
                  <p className="text-sm text-slate-500">
                    {selectedWorkspace.name}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    当前 Token 余额
                  </label>
                  <div className="p-3 bg-slate-50 rounded-[4px] text-sm font-bold text-slate-700">
                    {selectedWorkspace.tokenBalance.toLocaleString()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    新 Token 余额
                  </label>
                  <input
                    type="number"
                    value={newTokenBalance}
                    onChange={(e) => setNewTokenBalance(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-[4px] text-sm focus:outline-none focus:border-[#2b6cb0] focus:ring-2 focus:ring-[#2b6cb0]/20"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowQuotaModal(false);
                  setSelectedWorkspace(null);
                }}
                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-[4px] hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={confirmQuotaChange}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-md transition-all"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
