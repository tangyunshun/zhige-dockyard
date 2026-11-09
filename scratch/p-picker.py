# -*- coding: utf-8 -*-
# KnowledgePickerModal 重构：查看→选中→确认带入（防误点）+ 乱码/二进制内容过滤 + Esc
import io

P = "src/components/studio/KnowledgePickerModal.tsx"
s = io.open(P, encoding="utf-8").read()

# 1. imports
old = 'import { useState, useEffect, useMemo } from "react";'
new = 'import { useState, useEffect, useMemo } from "react";\nimport { useEscapeKey } from "@/hooks/useEscapeKey";'
assert old in s
s = s.replace(old, new, 1)

# 2. 内容净化工具 + 选中态 + Esc
old = """export function KnowledgePickerModal({ workspaceId, onSelect, onClose, maxChars }: KnowledgePickerModalProps) {
  const [items, setItems] = useState<RawKnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);"""
new = """export function KnowledgePickerModal({ workspaceId, onSelect, onClose, maxChars }: KnowledgePickerModalProps) {
  const [items, setItems] = useState<RawKnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // KN-UI：查看→选中→确认带入（防误点，自查清单指令四）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEscapeKey(!!selectedId || true, onClose);

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
      .replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F\\uFFFD]/g, "")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
    return { text, isBinary };
  };"""
assert old in s, "state block"
s = s.replace(old, new, 1)

# 3. 列表卡片：点击→选中展开预览；底部确认带入
old = """          {!loading &&
            !loadError &&
            filtered.map((d) => {
              const charCount = (d.content || "").length;
              const overLimit = maxChars > 0 && charCount > maxChars;
              const summary = (d.content || "").slice(0, 60);"""
new = """          {!loading &&
            !loadError &&
            filtered.map((d) => {
              const sanitized = sanitizeContent(d.content || "");
              const charCount = sanitized.text.length;
              const overLimit = maxChars > 0 && charCount > maxChars;
              const binaryBlocked = sanitized.isBinary;
              const blocked = overLimit || binaryBlocked;
              const isSelected = selectedId === d.id;
              const summary = sanitized.text.slice(0, 60);"""
assert old in s, "card head"
s = s.replace(old, new, 1)

old = """                <div
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
                >"""
new = """                <div
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
                >"""
assert old in s, "card click"
s = s.replace(old, new, 1)

# 4. 摘要渲染：二进制提示
old = """                  <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2 mt-1.5 min-h-[2rem]">
                    {summary || "该知识暂无正文内容。"}
                  </p>"""
new = """                  {binaryBlocked ? (
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
                  )}"""
assert old in s, "summary"
s = s.replace(old, new, 1)

# 5. 选中态角标
old = """                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${overLimit ? "text-red-600 bg-red-100" : "text-slate-500 bg-slate-100"}`}>
                      {charCount} 字
                    </span>"""
new = """                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${binaryBlocked ? "text-amber-700 bg-amber-100" : overLimit ? "text-red-600 bg-red-100" : isSelected ? "text-white bg-[#3182ce]" : "text-slate-500 bg-slate-100"}`}>
                      {binaryBlocked ? "非文本" : `${charCount} 字`}
                    </span>"""
assert old in s, "char badge"
s = s.replace(old, new, 1)

# 6. 底部：确认带入按钮（选中才可用）
old = """        {/* 底部取消 */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
          >
            取消
          </button>
        </div>"""
new = """        {/* 底部：取消 / 确认带入（选中知识后才可用，防误点） */}
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
        </div>"""
assert old in s, "footer"
s = s.replace(old, new, 1)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("picker refactor OK")
