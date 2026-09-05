/** @type {import('next').NextConfig} */
// Force Turbopack Reload Stamp: 2026-09-05-post-sync-v1

// 自动生成并同步无变形的立体 1:1 比例 Icon 资源
try {
  require('./scripts/generate_real_icon.js');
} catch (e) {
  console.error("生成图标失败:", e);
}

const nextConfig = {
  reactStrictMode: true,
  // Prisma 必须作为外部依赖交由 Node.js 运行时直接加载。
  // Next.js 16 默认使用 Turbopack，若将其打包会导致原生查询引擎无法解析，
  // 运行时报 "Cannot find module '@prisma/client-<hash>'"（表现为所有访问数据库的接口 500）。
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
}

module.exports = nextConfig

