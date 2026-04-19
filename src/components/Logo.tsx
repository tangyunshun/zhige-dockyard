import React from "react";
import { useRouter } from "next/navigation";

interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: "light" | "dark";
}

export const Logo: React.FC<LogoProps> = ({
  className = "",
  showText = true,
  variant = "light",
}) => {
  const router = useRouter();
  const textColor = variant === "dark" ? "text-white" : "text-slate-800";
  const textSubColor = variant === "dark" ? "text-slate-300" : "text-slate-500";

  return (
    <div
      className={`flex items-center cursor-pointer select-none ${className}`}
      onClick={() => router.push("/")}
    >
      <svg
        className="w-8 h-8 mr-2.5 flex-shrink-0 transition-transform duration-300 hover:scale-110"
        viewBox="20 20 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="gradPrimary" x1="0" y1="0" x2="200" y2="200">
            <stop offset="0%" stopColor="#3182ce" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
          <linearGradient id="gradLight" x1="200" y1="0" x2="0" y2="200">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3182ce" />
          </linearGradient>
        </defs>
        <path d="M100 20 L25 65 L25 155 L100 105 Z" fill="url(#gradPrimary)" />
        <path
          d="M25 155 L100 195 L175 155 L100 105 Z"
          fill="#1e40af"
          opacity={0.8}
        />
        <path d="M100 20 L175 65 L175 115 L100 155 Z" fill="url(#gradLight)" />
        <circle cx="100" cy="105" r="14" fill="#bfdbfe" />
        <circle cx="100" cy="105" r="6" fill="#ffffff" />
      </svg>

      {showText && (
        <div className="flex flex-col justify-center">
          <span
            className={`text-lg font-bold tracking-tight leading-none ${textColor}`}
          >
            知阁·舟坊 <span className="text-[#2b6cb0]">ZhiGe Dockyard</span>
          </span>
        </div>
      )}
    </div>
  );
};
