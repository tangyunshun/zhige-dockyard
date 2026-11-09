"use client";

import { useState, useEffect, useMemo } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
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
  // KN-UI：查看→选中→确认带入（防误点，自查清单指令四）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEscapeKey(true, onClose);

  /** 内容净化：剥离控制字符/乱码，识别二进制（如 PDF 解析残留），杜绝乱码上屏 */
  const sanitizeContent = (raw: string): { text: string; isBinary: boolean } => {
    if (!raw) return { text: "", isBinary: false };
    const sample = raw.slice(0, 2000);
    let ctrl = 0;
    for (const ch of sample) {
      const c = ch.codePointAt(0) || 0;
      if (c < 9 || (c > 13 && c < 32) || c === 65533) ctrl++;
    }
    const isBinary = sample.includes("%PDF-") || ctrl / Math.max(1, sample.length) > 0.05;
    const text = raw
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { text, isBinary };
  };

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
              const sanitized = sanitizeContent(d.content || "");
              const charCount = sanitized.text.length;
              const overLimit = maxChars > 0 && charCount > maxChars;
              const binaryBlocked = sanitized.isBinary;
              const blocked = overLimit || binaryBlocked;
              const isSelected = selectedId === d.id;
              const summary = sanitized.text.slice(0, 60);
              const tags = Array.isArray(d.tags) && d.tags.length ? d.tags : d.category ? [d.category] : [];
              return (
                <div
                  key={d.id}
                  className={`rounded-xl border p-3 transition-all ${
                    binaryBlocked
                      ? "border-amber-200 bg-amber-50/40 opacity-80"
                      : overLimit
                        ? "border-red-200 bg-red-50/40 opacity-70"
                        : isSelected
                          ? "border-[#3182ce] bg-blue-50/50 ring-2 ring-[#3182ce]/20"
                          : "border-slate-200 bg-slate-50/60 hover:border-[#3182ce]/40 hover:bg-blue-50/30 cursor-pointer"
                  }`}
                  onClick={() => {
                    if (binaryBlocked || overLimit) return;
                    setSelectedId(isSelected ? null : d.id);
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
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${binaryBlocked ? "text-amber-700 bg-amber-100" : overLimit ? "text-red-600 bg-red-100" : isSelected ? "text-white bg-[#3182ce]" : "text-slate-500 bg-slate-100"}`}>
                      {binaryBlocked ? "非文本" : `${charCount} 字`}
                    </span>
                  </div>

                  {binaryBlocked ? (
                    <p className="text-xs text-amber-700 font-bold leading-relaxed mt-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      该知识内容为二进制/非文本格式（可能是文件解析残留），无法作为文本材料带入执行
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2 mt-1.5 min-h-[2rem]">
                      {summary || "该知识暂无正文内容。"}
                    </p>
                  )}
                  {isSelected && !binaryBlocked && !overLimit && (
                    <div className="mt-2 rounded-lg border border-[#3182ce]/30 bg-white p-2.5 max-h-40 overflow-y-auto">
                      <p className="text-[10px] font-black text-[#3182ce] mb-1">已选中 · 内容预览（点击「确定带入」后填入材料框，可编辑）</p>
                      <pre className="text-[11px] text-slate-600 whitespace-pre-wrap break-words font-sans leading-relaxed max-h-28 overflow-y-auto">
                        {sanitized.text || "（该知识暂无正文内容）"}
                      </pre>
                    </div>
                  )}

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

        {/* 底部：取消 / 确认带入（选中知识后才可用，防误点） */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 shrink-0">
          <span className="text-[11px] font-bold text-slate-400">
            {selectedId ? "已选中 1 条知识，点击「确定带入」填入材料框" : "请点击知识卡片查看内容并选中"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!selectedId}
              onClick={() => {
                const d = filtered.find((x) => x.id === selectedId);
                if (!d) return;
                const sanitized = sanitizeContent(d.content || "");
                if (sanitized.isBinary) return;
                onSelect({ id: d.id, title: d.title || "未命名知识", content: sanitized.text, charCount: sanitized.text.length });
              }}
              className={`px-5 py-2 text-xs font-black rounded-xl transition-all ${
                selectedId
                  ? "bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white shadow-md cursor-pointer"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              确定带入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KnowledgePickerModal;
