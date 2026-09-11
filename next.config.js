/** @type {import('next').NextConfig} */
// Force Turbopack Reload Stamp: 2026-09-05-post-sync-v1

// 自动生成并同步无变形的立体 1:1 比例 Icon 资源
// 说明：脚本内部已做「内容一致则不写入」判断，不会因重写文件而触发整图重编译
try {
  require('./scripts/generate_real_icon.js');
} catch (e) {
  console.error("生成图标失败:", e);
}

const nextConfig = {
  // 开发态关闭严格模式：StrictMode 会把每个组件渲染 / effect 执行两次，
  // 本项目存在 7500 行级巨型页面，双渲染会显著拖慢开发环境响应速度。
  // 生产构建本身不会双渲染，关闭它不影响线上行为与安全校验。
  reactStrictMode: false,

  // Prisma 必须作为外部依赖交由 Node.js 运行时直接加载。
  // Next.js 16 默认使用 Turbopack，若将其打包会导致原生查询引擎无法解析，
  // 运行时报 "Cannot find module '@prisma/client-<hash>'"（表现为所有访问数据库的接口 500）。
  serverExternalPackages: ["@prisma/client", ".prisma/client"],

  experimental: {
    // lucide-react 包含上千个图标模块，开发态若走整体 barrel 解析会极大拖慢编译；
    // 开启后按图标按需引入，是本项目编译提速最明显的一项。
    optimizePackageImports: ["lucide-react"],
  },

  // 开发态保留已编译页面的时长与数量，避免来回切换菜单时反复重新编译
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60, // 1 小时内不再重复编译
    pagesBufferLength: 60,
  },
}

module.exports = nextConfig
