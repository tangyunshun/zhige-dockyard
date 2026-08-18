"use client";

import { useState } from "react";

interface ImportAssetModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (data: { title: string; content: string; type: string }) => void;
}

export default function ImportAssetModal({ open, onClose, onImport }: ImportAssetModalProps) {
  const [importAssetForm, setImportAssetForm] = useState({ title: "", content: "", type: "pdf" });

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importAssetForm.title.trim()) {
      alert("请输入文件标题");
      return;
    }
    onImport({
      title: importAssetForm.title,
      content: importAssetForm.content,
      type: importAssetForm.type.toUpperCase()
    });
    setImportAssetForm({ title: "", content: "", type: "pdf" });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4">
        <h3 className="text-xs font-bold text-slate-800">📥 导入原始开发文件资产</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">文件标题</label>
            <input 
              type="text" 
              value={importAssetForm.title}
              onChange={(e) => setImportAssetForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="例如：舟坊招标规格RFP_2026.pdf" 
              className="w-full p-2 border border-slate-200 rounded text-xs font-bold focus:outline-none focus:border-[#3182ce]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">文件内容文本</label>
            <textarea 
              value={importAssetForm.content}
              onChange={(e) => setImportAssetForm(prev => ({ ...prev, content: e.target.value }))}
              placeholder="在此贴入原始需求规格的全部核心文本，将自动转化为待解析的数据资产。" 
              className="w-full h-32 p-2 border border-slate-200 rounded text-xs font-bold focus:outline-none focus:border-[#3182ce]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">资产类型</label>
            <select 
              value={importAssetForm.type}
              onChange={(e) => setImportAssetForm(prev => ({ ...prev, type: e.target.value }))}
              className="w-full p-2 border border-slate-200 rounded text-xs font-bold focus:outline-none focus:border-[#3182ce]"
            >
              <option value="pdf">PDF 招标文件</option>
              <option value="markdown">Markdown 需求规格</option>
              <option value="txt">文本 交互规范</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">
            取消
          </button>
          <button type="submit" className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer">
            确认导入
          </button>
        </div>
      </form>
    </div>
  );
}
