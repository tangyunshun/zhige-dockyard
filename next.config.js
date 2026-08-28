/** @type {import('next').NextConfig} */
// Force Turbopack Reload Stamp: 2026-08-24-webhooks-fixed

// 自动生成并同步无变形的立体 1:1 比例 Icon 资源
try {
  require('./scripts/generate_real_icon.js');
} catch (e) {
  console.error("生成图标失败:", e);
}

const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig

