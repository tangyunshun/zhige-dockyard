"use client";

import React, { useState, useRef } from "react";
import { Mail, AlertCircle } from "lucide-react";
import { getEmailSuggestions } from "@/lib/validators";

interface EmailInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  error?: string;
  label?: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  hideIcon?: boolean;
  size?: "sm" | "md" | "lg";
  autoFocus?: boolean;
  disabled?: boolean;
}

export function EmailInput({
  id,
  value,
  onChange,
  onBlur,
  className = "",
  error,
  label,
  placeholder = "请输入邮箱地址",
  required = false,
  hideIcon = false,
  size = "md",
  autoFocus = false,
  disabled = false,
}: EmailInputProps) {
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (newValue.includes("@")) {
      const suggestions = getEmailSuggestions(newValue);
      setEmailSuggestions(suggestions);
      setShowEmailSuggestions(suggestions.length > 0);
      setSelectedIndex(-1);
    } else {
      setEmailSuggestions([]);
      setShowEmailSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showEmailSuggestions || emailSuggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < emailSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : emailSuggestions.length - 1
        );
        break;
      case "Enter":
        if (selectedIndex >= 0 && selectedIndex < emailSuggestions.length) {
          e.preventDefault();
          onChange(emailSuggestions[selectedIndex]);
          setEmailSuggestions([]);
          setShowEmailSuggestions(false);
          setSelectedIndex(-1);
        }
        break;
      case "Tab":
        if (selectedIndex >= 0 && selectedIndex < emailSuggestions.length) {
          onChange(emailSuggestions[selectedIndex]);
          setEmailSuggestions([]);
          setShowEmailSuggestions(false);
          setSelectedIndex(-1);
        }
        break;
      case "Escape":
        setEmailSuggestions([]);
        setShowEmailSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => {
      setShowEmailSuggestions(false);
    }, 200);
    if (onBlur) {
      onBlur(e);
    }
  };

  const handleFocus = () => {
    if (value && value.includes("@")) {
      const suggestions = getEmailSuggestions(value);
      setEmailSuggestions(suggestions);
      setShowEmailSuggestions(suggestions.length > 0);
    }
  };

  const handleEmailSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setEmailSuggestions([]);
    setShowEmailSuggestions(false);
    setSelectedIndex(-1);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // 根据尺寸设定样式
  const sizeStyles = {
    sm: {
      input: hideIcon ? "px-3.5 h-10 text-xs" : "pl-9 pr-3.5 h-10 text-xs",
      icon: "left-3 w-4 h-4",
      item: "px-3 py-2 text-xs",
    },
    md: {
      input: hideIcon ? "px-4 py-2.5 text-sm" : "pl-10 pr-4 py-2.5 text-sm",
      icon: "left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5",
      item: "px-3.5 py-2.5 text-xs md:text-sm",
    },
    lg: {
      input: hideIcon ? "px-4 py-3 text-base" : "pl-11 pr-4 py-3 text-base",
      icon: "left-3.5 top-1/2 -translate-y-1/2 w-5 h-5",
      item: "px-4 py-3 text-sm",
    },
  }[size];

  return (
    <div className="relative w-full text-left">
      {label && (
        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
          {label} {required && <span className="text-rose-500 font-bold">*</span>}
        </label>
      )}
      <div className="relative w-full">
        {!hideIcon && (
          <Mail className={`absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${sizeStyles.icon}`} />
        )}
        <input
          ref={inputRef}
          id={id}
          type="email"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          className={`w-full rounded-xl border font-medium outline-none transition-all ${
            error
              ? "border-rose-400 bg-rose-50/20 text-rose-900 focus:border-rose-500 focus:ring-2 focus:ring-rose-400/20"
              : "border-slate-200 hover:border-slate-300 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20"
          } ${sizeStyles.input} ${className}`}
          placeholder={placeholder}
        />
      </div>

      {/* 邮箱补全下拉推荐菜单 */}
      {showEmailSuggestions && emailSuggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-[9999] bg-white/98 backdrop-blur-md rounded-xl border border-slate-200 shadow-[0_12px_28px_-6px_rgba(15,23,42,0.18),0_4px_10px_-2px_rgba(15,23,42,0.06)] overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="px-3 py-1.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>邮箱快捷补全建议</span>
            <span className="text-slate-400">回车 / 点击即可选定</span>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {emailSuggestions.map((suggestion, index) => {
              const atIndex = suggestion.indexOf("@");
              const prefixPart = atIndex !== -1 ? suggestion.substring(0, atIndex + 1) : suggestion;
              const domainPart = atIndex !== -1 ? suggestion.substring(atIndex + 1) : "";
              const isSelected = index === selectedIndex;

              return (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => {
                    // 使用 onMouseDown 避免在 input 的 onBlur 先触发而关闭菜单
                    e.preventDefault();
                    handleEmailSuggestionClick(suggestion);
                  }}
                  className={`w-full text-left transition-colors flex items-center justify-between group cursor-pointer ${
                    sizeStyles.item
                  } ${
                    isSelected
                      ? "bg-blue-50/90 text-[#2b6cb0]"
                      : "hover:bg-slate-50/80 text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Mail className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-[#3182ce]" : "text-slate-400 group-hover:text-[#3182ce]"}`} />
                    <span className="truncate">
                      <span className="text-slate-500 font-normal">{prefixPart}</span>
                      <span className={`font-bold ${isSelected ? "text-[#2b6cb0]" : "text-[#3182ce]"}`}>{domainPart}</span>
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                    Tab/回车
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-medium animate-in fade-in slide-in-from-top-1 duration-150">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default EmailInput;