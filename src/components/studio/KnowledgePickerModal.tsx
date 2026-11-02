"use client";

import { useState, useEffect, useMemo } from "react";
import { X as XIcon, Search as SearchIcon, FileText as FileIcon, Building2 as BuildingIcon, Loader2 as LoaderIcon, Tag as TagIcon } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

export interface KnowledgePickerEntry {
  id: string;
  title: string;
  content: string;
  charCount: number;
}

interface KnowledgePickerModalProps {
  workspaceId: string;
  onSelect: (entry: KnowledgePickerEntry) => void;
  onClose: () => void;
  /** 来自组件合同的 textConstraints.maxLength，0 = 不限制 */
  maxChars: number;
}

interface RawKnowledgeDoc {
  id: string;
  title: string;
  content?: string | null;
  componentName?: string;
  category?: string;
  tags?: string[] | null;
}

/**
 * 知识选择器：从当前执行所在空间的知识库中挑选条目带入执行。
 * 仅展示当前空间知识（复用 action=knowledges 的现有查询，该查询已强制 workspaceId + 成员校验）。
 * 选中后把条目内容回填入可编辑文本框（由调用方处理），知识本身走标准 text 通道。
 */
export function KnowledgePickerModal({ workspaceId, onSelect, onClose, maxChars }: KnowledgePickerModalProps) {
  const [items, setItems] = useState<RawKnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/studio?action=knowledges&workspaceId=${encodeURIComponent(workspaceId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (!res.ok) {
          setLoadError("知识库加载失败");
          return;
        }
        const data = await res.json();
        const list: RawKnowledgeDoc[] = data.data || data.knowledges || [];
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setLoadError("网络异常，无法加载知识库");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // 标签全集（优先 doc.tags，缺失时回退到 category）
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((d) => {
      const tags = Array.isArray(d.tags) && d.tags.length ? d.tags : d.category ? [d.category] : [];
      tags.forEach((t) => t && set.add(t));
    });
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((d) => {
      if (activeTag) {
        const tags = Array.isArray(d.tags) && d.tags.length ? d.tags : d.category ? [d.category] : [];
        if (!tags.includes(activeTag)) return false;
      }
      if (q) {
        const hay = `${d.title || ""} ${(d.content || "")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, keyword, activeTag]);

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-0 shadow-2xl border border-slate-200 text-left flex flex-col max-h-[88vh] overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <FileIcon className="w-5 h-5 text-[#3182ce]" />
            <h3 className="text-base font-black text-slate-900">引用空间知识带入执行</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
            title="关闭"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* 搜索 + 标签筛选 */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-2.5 shrink-0">
          <div className="relative">
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索知识标题或正文内容..."
              className="w-full pl-9 pr-3 h-9 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none placeholder:text-slate-400"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  activeTag === null ? "bg-[#3182ce] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                全部
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTag(t)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    activeTag === t ? "bg-[#3182ce] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <TagIcon className="w-3 h-3" />
                  <span>{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 no-scrollbar">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-xs font-bold">
              <LoaderIcon className="w-4 h-4 animate-spin" /> 正在加载空间知识库...
            </div>
          )}
          {!loading && loadError && (
            <div className="py-10 text-center text-xs font-bold text-red-500">{loadError}</div>
          )}
          {!loading && !loadError && filtered.length === 0 && (
            <div className="py-12 text-center text-xs font-bold text-slate-400">
              {items.length === 0 ? "当前空间暂无可用知识条目" : "未找到匹配的知识条目"}
            </div>
          )}

          {!loading &&
            !loadError &&
            filtered.map((d) => {
              const charCount = (d.content || "").length;
              const overLimit = maxChars > 0 && charCount > maxChars;
              const summary = (d.content || "").slice(0, 60);
              const tags = Array.isArray(d.tags) && d.tags.length ? d.tags : d.category ? [d.category] : [];
              return (
                <div
                  key={d.id}
                  className={`rounded-xl border p-3 transition-all ${
                    overLimit
                      ? "border-red-200 bg-red-50/40 opacity-70"
                      : "border-slate-200 bg-slate-50/60 hover:border-[#3182ce]/40 hover:bg-blue-50/30 cursor-pointer"
                  }`}
                  onClick={() => {
                    if (overLimit) return;
                    onSelect({ id: d.id, title: d.title || "未命名知识", content: d.content || "", charCount });
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center justify-center shrink-0">
                        <FileIcon className="w-4 h-4" />
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-sm truncate" title={d.title}>
                        {d.title || "未命名知识"}
                      </h4>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${overLimit ? "text-red-600 bg-red-100" : "text-slate-500 bg-slate-100"}`}>
                      {charCount} 字
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2 mt-1.5 min-h-[2rem]">
                    {summary || "该知识暂无正文内容。"}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 shrink-0">
                        <BuildingIcon className="w-3 h-3" />
                        <span className="truncate max-w-[120px]">{d.componentName || "空间研发任务"}</span>
                      </span>
                      {tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] font-bold text-[#2b6cb0] bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded shrink-0">
                          {t}
                        </span>
                      ))}
                    </div>
                    {overLimit && (
                      <span className="text-[10px] font-black text-red-600 shrink-0">超出当前组件输入上限</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* 底部取消 */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export default KnowledgePickerModal;
