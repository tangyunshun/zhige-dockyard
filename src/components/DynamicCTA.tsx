"use client";

import { useRouter } from "next/navigation";
import { useAppContext } from "@/contexts/AppContext";

interface DynamicCTAProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  type?: "primary" | "ghost";
}

export default function DynamicCTA({ className = "", size = "md", type = "primary" }: DynamicCTAProps) {
  const router = useRouter();
  const { userState } = useAppContext();

  const baseStyles = "inline-flex items-center justify-center gap-2 font-bold rounded-[4px] transition-all duration-200 hover:-translate-y-0.5";
  
  const sizeStyles = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const typeStyles = type === "primary" 
    ? "bg-[#2b6cb0] text-white hover:shadow-md" 
    : "border border-[#2b6cb0] text-[#2b6cb0] hover:bg-[#2b6cb0]/5";

  const handleClick = () => {
    if (userState.isLoggedIn) {
      router.push("/workspace-hub");
    } else {
      router.push("/auth/login");
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`${baseStyles} ${sizeStyles[size]} ${typeStyles} ${className}`}
    >
      {userState.isLoggedIn ? (
        <span>进入我的工作台</span>
      ) : (
        <span>免费体验工作台</span>
      )}
    </button>
  );
}