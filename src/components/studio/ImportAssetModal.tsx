"use client";

import { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, X, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";

interface ImportAssetModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (data: { title: string; content: string; type: string }) => void;
}

export default function ImportAssetModal({ open, onClose, onImport }: ImportAssetModalProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importAssetForm, setImportAssetForm] = useState({ title: "", content: "", type: "pdf" });
  const [uploadedMeta, setUploadedMeta] = useState<{ name: string; size: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!open) return null;

  // 自动根据文件拓展名推断资产类型
  const inferTypeFromExt = (fileName: string): string => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "pdf";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (ext === "json") return "json";
    if (ext === "doc" || ext === "docx") return "word";
    return "txt";
  };

  // 读取处理选中的本地文件
  const processSelectedFile = (file: File) => {
    if (!file) return;
    const sizeStr = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(file.size / 1024)} KB`;
    setUploadedMeta({ name: file.name, size: sizeStr });

    // 自动填充文件标题与类型
    setImportAssetForm(prev => ({
      ...prev,
      title: file.name,
      type: inferTypeFromExt(file.name)
    }));

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setImportAssetForm(prev => ({ ...prev, content: text }));
        toast.success(`已成功读入本地文件 [${file.name}]`);
      }
    };
    reader.onerror = () => {
      toast.error("读取本地文件失败");
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importAssetForm.title.trim()) {
      toast.warning("请输入文件标题");
      return;
    }
    onImport({
      title: importAssetForm.title.trim(),
      content: importAssetForm.content,
      type: importAssetForm.type.toUpperCase()
    });
    setImportAssetForm({ title: "", content: "", type: "pdf" });
    setUploadedMeta(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl text-left border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-[#3182ce] flex items-center justify-center font-bold">
              📥
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">导入原始开发文件资产</h3>
              <p className="text-[11px] text-slate-500 font-medium">支持点击/拖拽本地文件上传，或手动贴入文本</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 text-xs font-bold text-slate-700">
          {/* 本地文件点击 / 拖拽上传核心区域 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              📁 选择或拖拽本地文件上传
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.txt,.md,.markdown,.json,.ts,.js,.java,.py,.sql"
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`p-4 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-[#3182ce] bg-blue-50/80 scale-[1.01]"
                  : uploadedMeta
                  ? "border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50"
                  : "border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-[#3182ce]/60"
              }`}
            >
              {uploadedMeta ? (
                <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="truncate">已选择本地文件: {uploadedMeta.name} ({uploadedMeta.size})</span>
                  <span className="text-[10px] text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full font-mono shrink-0">点击重选</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 text-[#3182ce] mx-auto" />
                  <p className="text-xs text-slate-700 font-bold">
                    点击此处选择文件，或将本地文件拖拽至此区域
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    支持 .pdf / .docx / .md / .txt / .json / 源码文件 (自动读取标题与格式)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 文件标题 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              文件标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={importAssetForm.title}
              onChange={(e) => setImportAssetForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="例如：舟坊招标规格RFP_2026.pdf"
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-medium"
            />
          </div>

          {/* 文件内容文本 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              文件内容文本
            </label>
            <textarea
              value={importAssetForm.content}
              onChange={(e) => setImportAssetForm((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="文件选择后将自动读取文本，或在此贴入原始需求规格的全部核心文本..."
              rows={4}
              className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-mono leading-relaxed"
            />
          </div>

          {/* 资产类型 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              资产类型
            </label>
            <select
              value={importAssetForm.type}
              onChange={(e) => setImportAssetForm((prev) => ({ ...prev, type: e.target.value }))}
              className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] font-extrabold text-slate-700 cursor-pointer"
            >
              <option value="pdf">📄 PDF 招标文件与规范</option>
              <option value="markdown">📝 Markdown 需求规格书</option>
              <option value="txt">📑 文本 交互/条款文件</option>
              <option value="json">💻 JSON 接口契约文件</option>
              <option value="word">📄 Word 办公规范文档</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 cursor-pointer transition-all"
          >
            确认导入
          </button>
        </div>
      </form>
    </div>
  );
}
