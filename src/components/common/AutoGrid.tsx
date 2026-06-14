"use client";

import React from "react";

interface AutoGridProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: number; // Minimum width of each column item in pixels
  gap?: string; // Tailwind gap class or custom gap style
}

export const AutoGrid: React.FC<AutoGridProps> = ({
  children,
  className = "",
  minWidth = 280,
  gap = "var(--fluid-padding-sm)",
}) => {
  return (
    <div
      className={`grid w-full ${className}`}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minWidth}px), 1fr))`,
        gap: gap,
      }}
    >
      {children}
    </div>
  );
};

export default AutoGrid;
