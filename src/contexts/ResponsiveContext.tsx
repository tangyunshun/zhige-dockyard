"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface ResponsiveContextType {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean; // < 768px (md)
  isTablet: boolean; // >= 768px and < 1024px (lg)
  isDesktop: boolean; // >= 1024px
  isTouch: boolean;
  isMounted: boolean; // Useful to avoid SSR hydration mismatches
}

const ResponsiveContext = createContext<ResponsiveContextType>({
  width: 1200,
  height: 800,
  breakpoint: "xl",
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isTouch: false,
  isMounted: false,
});

const getBreakpoint = (w: number): Breakpoint => {
  if (w < 640) return "xs";
  if (w < 768) return "sm";
  if (w < 1024) return "md";
  if (w < 1280) return "lg";
  if (w < 1536) return "xl";
  return "2xl";
};

export const ResponsiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ResponsiveContextType>({
    width: 1200,
    height: 800,
    breakpoint: "xl",
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouch: false,
    isMounted: false,
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const bp = getBreakpoint(w);
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

      setState({
        width: w,
        height: h,
        breakpoint: bp,
        isMobile: w < 768,
        isTablet: w >= 768 && w < 1024,
        isDesktop: w >= 1024,
        isTouch: isTouchDevice,
        isMounted: true,
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <ResponsiveContext.Provider value={state}>
      {children}
    </ResponsiveContext.Provider>
  );
};

export const useResponsive = () => useContext(ResponsiveContext);
