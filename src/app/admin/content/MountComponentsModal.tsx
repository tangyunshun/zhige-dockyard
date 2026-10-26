"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Check, Package, AlertTriangle, Loader2 } from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";

interface StageRef {
  key?: string;
  name: string;
}

interface CatalogComponent {
  id: string;
  name: string;
  category?: string | null;
}

interface MountComponentsModalProps {
  stageKey: string;
  stageName: string;
  /** 全部阶段（用于把组件当前归属 key 翻译成名字） */
  stages: StageRef[];
  onClose: () => void;
  onMounted: (count: number) => void;
}

/**
 * 阶段挂载组件弹窗：列出全部组件，勾选后批量挂载到当前阶段。
   * 已挂在其它阶段的组件也可勾选——挂载即「转移到本阶段」，原阶段随之腾空。
   */
export default function MountComponentsModal({
  stageKey,
  stageName,
  stages,
  onClose,
  onMounted,
}: MountComponentsModalProps) {
  const toast = useToast();
  const [list, setList] = useState<CatalogComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const categoryNameMap = useMemo(() => {
    const m = new Map<string, string>();
    stages.forEach((s) => {
      if (s.key) m.set(s.key, s.name);
    });
    return m;
  }, [stages]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/components?limit=5000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const r = await res.json();
      const items: CatalogComponent[] = r?.data?.components || [];
      setList(items);
    } catch (e) {
      console.error("加载组件失败", e);
      toast.error("加载组件列表失败");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // 占用判断：组件已归属其它阶段
  const isOccupied = (c: CatalogComponent) => !!c.category && c.category !== stageKey;

  const q = search.trim().toLowerCase();
  const view = list.filter((c) => {
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.category || "").toLowerCase().includes(q)
    );
  });

  // 已挂载到其它阶段的组件也可选择（挂载=转移到本阶段，原阶段腾空）
  const allSelected = view.length > 0 && view.every((c) => selected.has(c.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        view.forEach((c) => next.delete(c.id));
      } else {
        view.forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      toast.error("请先勾选要挂载的组件");
      return;
    }
    setSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/stages/${stageKey}/components`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ componentIds: [...selected] }),
      });
      const r = await res.json();
      if (res.ok) {
        toast.success(r.message || "组件挂载成功");
        onMounted(r.mounted || selected.size);
      } else {
        toast.error(r.error || "挂载失败");
      }
    } catch (e) {
      console.error("挂载失败", e);
      toast.error("挂载失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 用 Portal 渲染到 body：页面外层容器带 backdrop-blur（毛玻璃）会使内部 fixed 定位
  // 以该容器为包含块，导致弹窗嵌在列表中间而非覆盖全屏；挂到 body 可彻底规避。
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/60">
          <div>
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#3182ce]" />
              移动组件到阶段「{stageName}」
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              勾选组件将其移动到本阶段；已挂其它阶段的组件会被转移过来（原阶段随之腾空）。
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer border border-slate-200/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索组件名称 / 标识码（C10）..."
              className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl text-xs focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none bg-white"
            />
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载组件中...
            </div>
          ) : view.length === 0 ? (
            <div className="text-center py-16 text-xs text-slate-400">没有匹配的组件</div>
          ) : (
            <ul className="space-y-1">
              {/* 全选（当前列表全部组件，含已挂载到其它阶段的） */}
              <li>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={view.length === 0}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      allSelected
                        ? "bg-[#3182ce] border-[#3182ce] text-white"
                        : "border-slate-300"
                    }`}
                  >
                    {allSelected && <Check className="w-3 h-3" />}
                  </span>
                  全选当前列表组件（{view.length}）
                </button>
              </li>

              {view.map((c) => {
                const occupied = isOccupied(c);
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <div
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                        occupied ? "bg-amber-50/40" : "hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-[#3182ce] border-[#3182ce] text-white"
                            : "border-slate-300 cursor-pointer"
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                            {c.id}
                          </span>
                          <span className="text-xs font-bold text-slate-800 truncate">{c.name}</span>
                        </div>
                        {occupied && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-600">
                            <AlertTriangle className="w-3 h-3" />
                            将转移至本阶段（原阶段「{categoryNameMap.get(c.category as string) || c.category}」随之腾空）
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 底部操作 */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200/80 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            已选 <strong className="text-[#3182ce]">{selected.size}</strong> 个组件
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-9 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selected.size === 0}
              className={`px-5 h-9 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                submitting || selected.size === 0
                  ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] hover:from-[#3182ce] hover:to-[#4299e1] text-white shadow-xs cursor-pointer"
              }`}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              确认移动（{selected.size}）
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
