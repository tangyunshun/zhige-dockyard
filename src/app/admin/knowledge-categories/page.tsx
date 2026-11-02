"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Tags, Plus, Trash2, ShieldCheck, Users, Search, RotateCcw, Inbox, FileText, Database, User, Pencil } from "lucide-react";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";
import { getAuthToken } from "@/utils/auth";

// KN-CAT-V5：知识分类管理——标准数据列表 + 新增弹窗 + 编辑/单个删除/批量删除
// 限制条件：系统分类下仍有知识条目时，删除被拦截；编辑重命名时条目自动迁移到新名称（确认后执行）
// 用户自建分类：仅查看（创建人/创建时间/使用条数），删除权归创建人本人

interface CatRow {
  name: string;
  type: "system" | "personal";
  creatorName: string | null;
  createdAt: string | null;
  count: number;
}

interface CatStats {
  systemCount: number;
  personalCount: number;
  totalEntries: number;
}

interface BatchResult {
  name: string;
  success: boolean;
  error?: string;
}

const PAGE_SIZE = 10;

export default function KnowledgeCategoriesPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<CatStats>({ systemCount: 0, personalCount: 0, totalEntries: 0 });

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "system" | "personal">("ALL");

  // 新增弹窗
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<CatRow | null>(null);
  const [editName, setEditName] = useState("");

  // 单个删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<CatRow | null>(null);

  // 批量删除确认弹窗
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const authHeaders = (): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view: "categories",
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
        type: typeFilter,
      });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      const res = await fetch(`/api/admin/documents?${params.toString()}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(data.rows || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setStats(data.stats || { systemCount: 0, personalCount: 0, totalEntries: 0 });
        // 当前页行变化后清掉不在本页的选中项，避免跨页误删
        const pageNames = new Set((data.rows || []).map((r: CatRow) => r.name));
        setSelectedNames((prev) => prev.filter((n) => pageNames.has(n)));
        if (showToast) toast.success("分类数据已刷新");
      } else {
        toast.error(data.error || "加载分类数据失败");
      }
    } catch {
      toast.error("网络异常，无法加载分类数据");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // 新增系统分类（弹窗提交）
  const handleCreateCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "add_knowledge_category", categoryName: name, workspaceId: "" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "分类已添加");
        setShowCreateModal(false);
        setNewCatName("");
        load();
      } else {
        toast.error(data.error || "添加失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setCatBusy(false);
    }
  };

  // 编辑（重命名）：分类下有知识时后端自动迁移
  const handleRenameCategory = async () => {
    if (!editTarget) return;
    const newName = editName.trim();
    if (!newName || newName === editTarget.name) {
      setEditTarget(null);
      return;
    }
    setCatBusy(true);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "rename_knowledge_category", oldName: editTarget.name, newName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "分类已重命名");
        setEditTarget(null);
        load();
      } else {
        toast.error(data.error || "重命名失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setCatBusy(false);
    }
  };

  // 单个删除（后端拦截有条目的分类）
  const handleDeleteCategory = async (name: string) => {
    setCatBusy(true);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "remove_knowledge_category", categoryName: name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "分类已删除");
        setDeleteTarget(null);
        load();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setCatBusy(false);
    }
  };

  // 批量删除（后端逐个检测条目，逐项返回结果）
  const handleBatchDelete = async () => {
    if (selectedNames.length === 0) return;
    setCatBusy(true);
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "batch_remove_knowledge_categories", names: selectedNames }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const results: BatchResult[] = data.data || [];
        const failed = results.filter((r) => !r.success);
        if (failed.length === 0) {
          toast.success(data.message || "批量删除完成");
        } else {
          // 逐项失败原因必须展示，不得静默
          toast.warning(`成功 ${results.length - failed.length} 个；失败 ${failed.length} 个：${failed.map((f) => `${f.name}（${f.error}）`).join("、")}`, 8000);
        }
        setShowBatchConfirm(false);
        setSelectedNames([]);
        load();
      } else {
        toast.error(data.error || "批量删除失败");
      }
    } catch {
      toast.error("网络异常");
    } finally {
      setCatBusy(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelectedNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  const systemRowsOnPage = rows.filter((r) => r.type === "system");
  const allSystemSelected = systemRowsOnPage.length > 0 && systemRowsOnPage.every((r) => selectedNames.includes(r.name));
  const selectedWithEntries = rows.filter((r) => selectedNames.includes(r.name) && r.count > 0);

  const formatTime = (v: string | null) => {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleString("zh-CN", { hour12: false });
    } catch {
      return "—";
    }
  };

  const hasActiveFilter = searchTerm.trim() !== "" || typeFilter !== "ALL";

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Tags className="w-5 h-5 text-[#3182ce]" />
            知识分类管理
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            管理知识库的系统内置分类（全员可见，支持下新增/编辑/删除），并查看全部用户自建分类（仅创建人可见，删除权归创建人本人）。
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400">系统内置分类</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{stats.systemCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400">用户自建分类</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{stats.personalCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400">挂载知识条目</p>
            <p className="text-2xl font-black font-mono text-slate-900 mt-0.5">{stats.totalEntries}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 搜索与操作栏 */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="搜索分类名称 / 创建人..."
            className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 类型筛选 */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as "ALL" | "system" | "personal");
              setCurrentPage(1);
            }}
            className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
          >
            <option value="ALL">全部分类类型</option>
            <option value="system">系统内置分类</option>
            <option value="personal">用户自建分类</option>
          </select>

          {/* 重置筛选 */}
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearchTerm("");
                setTypeFilter("ALL");
                setCurrentPage(1);
              }}
              className="h-10 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1"
              title="重置所有筛选"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>
          )}

          {/* 批量删除（选中系统分类后可用） */}
          {selectedNames.length > 0 && (
            <button
              onClick={() => setShowBatchConfirm(true)}
              disabled={catBusy}
              className="h-10 px-4 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-200 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title={`批量删除选中的 ${selectedNames.length} 个系统分类（分类下有知识的将被拦截）`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              批量删除（{selectedNames.length}）
            </button>
          )}

          {/* 新增分类（弹窗） */}
          <button
            onClick={() => { setNewCatName(""); setShowCreateModal(true); }}
            className="h-10 px-4 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            新增分类
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={() => load(true)}
            className="h-10 px-4 border border-slate-200 bg-white hover:border-[#3182ce] hover:text-[#2b6cb0] text-slate-600 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 数据列表 */}
      {loading ? (
        <div className="bg-white p-16 rounded-2xl text-center border border-slate-200/80 shadow-xs text-xs text-slate-400 font-bold">
          <RefreshCw className="w-7 h-7 animate-spin text-[#3182ce] mx-auto mb-3" />
          正在加载知识分类数据...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto text-[#3182ce] mb-3">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">暂无符合条件的知识分类</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">当前筛选条件下没有分类记录，可调整筛选或新增分类。</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[940px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-black text-slate-600 whitespace-nowrap">
                  <th className="py-3.5 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSystemSelected}
                      onChange={() => {
                        if (allSystemSelected) {
                          setSelectedNames((prev) => prev.filter((n) => !systemRowsOnPage.some((r) => r.name === n)));
                        } else {
                          setSelectedNames((prev) => Array.from(new Set([...prev, ...systemRowsOnPage.map((r) => r.name)])));
                        }
                      }}
                      className="cursor-pointer accent-[#3182ce]"
                      title="全选本页系统分类"
                    />
                  </th>
                  <th className="py-3.5 px-4">分类名称</th>
                  <th className="py-3.5 px-4">类型</th>
                  <th className="py-3.5 px-4">创建人</th>
                  <th className="py-3.5 px-4">知识数量</th>
                  <th className="py-3.5 px-4">创建时间</th>
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 py-3.5 px-4 text-right font-black shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {rows.map((row) => {
                  const canManage = row.type === "system";
                  return (
                    <tr key={row.type + "-" + row.name} className="group hover:bg-slate-50/60 transition-colors">
                      {/* 选择框（仅系统分类可选中批量删除） */}
                      <td className="py-3.5 px-4">
                        {canManage ? (
                          <input
                            type="checkbox"
                            checked={selectedNames.includes(row.name)}
                            onChange={() => toggleSelect(row.name)}
                            className="cursor-pointer accent-[#3182ce]"
                            title="选中以批量删除"
                          />
                        ) : (
                          <span className="text-slate-200">—</span>
                        )}
                      </td>
                      {/* 分类名称 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                            row.type === "system"
                              ? "bg-blue-50 text-[#3182ce] border-blue-100"
                              : "bg-purple-50 text-purple-600 border-purple-100"
                          }`}>
                            {row.type === "system" ? <Database className="w-4 h-4" /> : <User className="w-4 h-4" />}
                          </div>
                          <span className="font-extrabold text-slate-900" title={row.name}>{row.name}</span>
                        </div>
                      </td>
                      {/* 类型 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {row.type === "system" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200">
                            <ShieldCheck className="w-3 h-3" />
                            系统内置
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                            <Users className="w-3 h-3" />
                            用户自建
                          </span>
                        )}
                      </td>
                      {/* 创建人 */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-bold text-slate-600">
                        {row.creatorName || <span className="text-slate-300 font-medium">系统</span>}
                      </td>
                      {/* 知识数量 */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-black text-slate-900">{row.count}</span>
                        <span className="text-slate-400 font-bold ml-1">篇</span>
                      </td>
                      {/* 创建时间 */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {row.createdAt ? formatTime(row.createdAt) : <span className="font-sans font-bold text-slate-300">—</span>}
                      </td>
                      {/* 操作（固定右侧） */}
                      <td className="sticky right-0 bg-white group-hover:bg-slate-50/95 z-10 py-3.5 px-4 text-right whitespace-nowrap border-l border-slate-100 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.04)]">
                        {canManage ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => { setEditTarget(row); setEditName(row.name); }}
                              disabled={catBusy}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 text-[#2b6cb0] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer disabled:opacity-40"
                              title={row.count > 0 ? `编辑名称（该分类下有 ${row.count} 篇知识，重命名后将同步迁移）` : "编辑分类名称"}
                            >
                              <Pencil className="w-3 h-3" />
                              编辑
                            </button>
                            <button
                              onClick={() => setDeleteTarget(row)}
                              disabled={catBusy}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                              title={row.count > 0 ? `该分类下有 ${row.count} 篇知识，须先移动后才能删除` : "删除此系统分类"}
                            >
                              <Trash2 className="w-3 h-3" />
                              删除
                            </button>
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold text-slate-300 select-none"
                            title="个人分类仅创建人自己可见，删除权归创建人本人，后台不支持代删"
                          >
                            仅查看
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setCurrentPage(p)}
              itemLabel="个分类"
            />
          </div>
        </div>
      )}

      {/* ── 新增分类弹窗 ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">新增系统分类</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">×</button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">系统内置分类对全体用户可见，普通用户不可删除或编辑。名称不得与现有分类或用户自建分类重名。</p>
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateCategory(); }}
              maxLength={30}
              autoFocus
              placeholder="输入分类名（1~30 字）"
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-bold"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleCreateCategory}
                disabled={!newCatName.trim() || catBusy}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50"
              >
                {catBusy ? "添加中…" : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 编辑分类弹窗 ── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-800">编辑分类名称</h3>
              <button onClick={() => setEditTarget(null)} className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer">×</button>
            </div>
            {editTarget.count > 0 && (
              <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                  ⚠️ 该分类下有 <strong>{editTarget.count}</strong> 篇知识。重命名后这些知识将自动同步迁移到新分类名下。
                </p>
              </div>
            )}
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRenameCategory(); }}
              maxLength={30}
              autoFocus
              placeholder="输入新分类名（1~30 字）"
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-bold"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setEditTarget(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleRenameCategory}
                disabled={!editName.trim() || editName.trim() === editTarget.name || catBusy}
                className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50"
              >
                {catBusy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 单个删除确认弹窗（限制条件检测） ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-800">删除系统分类「{deleteTarget.name}」？</h3>
            {deleteTarget.count > 0 ? (
              <>
                <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[11px] font-bold text-red-700 leading-relaxed">
                    ⛔ 无法删除：该分类下有 <strong>{deleteTarget.count}</strong> 篇知识。请先在知识库中将这些知识移动到其他分类，或删除这些知识后再试。
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    我知道了
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500 leading-relaxed">该分类下没有知识条目，可安全删除。删除后前台分类 tab 将不再展示该分类。</p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(deleteTarget.name)}
                    disabled={catBusy}
                    className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {catBusy ? "删除中…" : "确认删除"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 批量删除确认弹窗（逐项限制条件预检） ── */}
      {showBatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowBatchConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-800">批量删除 {selectedNames.length} 个系统分类？</h3>
            {selectedWithEntries.length > 0 ? (
              <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                  ⚠️ 其中 {selectedWithEntries.length} 个分类下仍有知识条目，这些分类将被拦截删除，其余分类正常删除：
                </p>
                <p className="text-[11px] font-bold text-amber-800 mt-1">
                  {selectedWithEntries.map((r) => `${r.name}（${r.count} 篇）`).join("、")}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">所选分类下均无知识条目，可安全删除。</p>
            )}
            <p className="text-[11px] text-slate-400">至少保留一个系统分类；删除操作不可撤销。</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowBatchConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={catBusy}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50"
              >
                {catBusy ? "删除中…" : "确认批量删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
