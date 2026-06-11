﻿"use client";

import React, { useState, useRef } from "react";
import { Mail } from "lucide-react";
import { getEmailSuggestions } from "@/lib/validators";

interface EmailInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  error?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export function EmailInput({
  id,
  value,
  onChange,
  className = "",
  error,
  label = "邮箱",
  placeholder = "请输入邮箱",
  required = false,
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
          prev < emailSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
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

  const handleBlur = () => {
    setTimeout(() => {
      setShowEmailSuggestions(false);
    }, 200);
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

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          ref={inputRef}
          id={id}
          type="email"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={`w-full pl-10 pr-4 py-3 rounded-xl border focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all ${
            error ? "border-red-500" : "border-slate-200"
          } ${className}`}
          placeholder={placeholder}
        />
      </div>
      {showEmailSuggestions && emailSuggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
          {emailSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleEmailSuggestionClick(suggestion)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                index === selectedIndex ? "bg-slate-100" : ""
              }`}
            >
              <Mail className="w-4 h-4 text-slate-400" />
              <span className="text-slate-700">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export default EmailInput;