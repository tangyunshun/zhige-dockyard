"use client";

import { Search, X } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

export default function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = "搜索...",
  className = "",
  debounceMs = 300,
}: SearchInputProps) {
  const handleClear = () => {
    onChange("");
    if (onSearch) {
      onSearch("");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // 实时搜索（防抖）
    if (onSearch) {
      const timeoutId = setTimeout(() => {
        onSearch(newValue);
      }, debounceMs);

      return () => clearTimeout(timeoutId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      onSearch(value);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* 搜索图标 */}
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />

      {/* 输入框 */}
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-11 pr-10 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
      />

      {/* 清除按钮 - 仅在有值时显示 */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          title="清除搜索"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
