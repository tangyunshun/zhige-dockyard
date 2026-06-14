"use client";

import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  fluid?: boolean; // If true, ignore max-width limit and span full viewport
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  className = "",
  fluid = false,
}) => {
  return (
    <div
      className={`w-full mx-auto transition-all duration-300 ${
        fluid ? "max-w-full" : "max-w-[var(--max-content-width)]"
      } ${className}`}
      style={{
        paddingLeft: "var(--fluid-padding-md)",
        paddingRight: "var(--fluid-padding-md)",
      }}
    >
      {children}
    </div>
  );
};

export default PageContainer;
