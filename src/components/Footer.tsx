"use client";

import { useState, useEffect } from "react";
import { Hexagon } from "lucide-react";
import Link from "next/link";

interface NavLinkItem {
  label: string;
  url: string;
}

interface NavColumnItem {
  title: string;
  links: NavLinkItem[];
}

export default function Footer() {
  // 保持用户现有的内容数据作为标准初始状态与默认底态
  const [footerData, setFooterData] = useState({
    siteName: "知阁·舟坊",
    subTitle: "ZhiGe Dockyard",
    logo: "/logo.png",
    slogan: "全球领先的软件工程效能操作系统，致力于消除研发链路中的低效瓶颈，释放创造力。",
    wechatQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/wechat",
    qqQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/qq",
    weiboQr: "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/weibo",
    policeIcp: "京公网安备 31000000000000 号",
    icpNumber: "京ICP备 2026000000 号-1",
    copyright: "© 2026 ZhiGe OS · 知阁·舟坊 · 京ICP备 2026000000 号-1 · 京公网安备 31000000000000 号",
    navColumns: [
      {
        title: "产品",
        links: [
          { label: "核心模块", url: "/capabilities" },
          { label: "组件大全", url: "/market" },
          { label: "更新日志", url: "/docs" },
          { label: "组件广场", url: "/market" },
        ],
      },
      {
        title: "资源",
        links: [
          { label: "帮助中心", url: "/help" },
          { label: "API 文档", url: "/docs" },
          { label: "最佳实践", url: "/knowledge" },
          { label: "开发者社区", url: "/developers" },
        ],
      },
      {
        title: "解决方案",
        links: [
          { label: "政务云", url: "/solutions" },
          { label: "军工科研", url: "/solutions" },
          { label: "金融信创", url: "/solutions" },
          { label: "智慧城市", url: "/solutions" },
        ],
      },
      {
        title: "公司",
        links: [
          { label: "关于我们", url: "/developers" },
          { label: "联系商务", url: "/help" },
          { label: "隐私条款", url: "/privacy-policy" },
          { label: "加入我们", url: "/developers" },
        ],
      },
    ] as NavColumnItem[],
  });

  // 挂载时从数据库真实公开接口获取最新页脚与导航数据
  useEffect(() => {
    fetch("/api/system/public-config")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.footer) {
          setFooterData((prev) => ({
            ...prev,
            siteName: data.siteName || prev.siteName,
            logo: data.logo || prev.logo,
            icpNumber: data.icpNumber || prev.icpNumber,
            slogan: data.footer.slogan || prev.slogan,
            subTitle: data.footer.subTitle || prev.subTitle,
            wechatQr: data.footer.wechatQr || prev.wechatQr,
            qqQr: data.footer.qqQr || prev.qqQr,
            weiboQr: data.footer.weiboQr || prev.weiboQr,
            policeIcp: data.footer.policeIcp || prev.policeIcp,
            copyright: data.footer.copyright || prev.copyright,
            navColumns:
              Array.isArray(data.footer.navColumns) && data.footer.navColumns.length > 0
                ? data.footer.navColumns
                : prev.navColumns,
          }));
        }
      })
      .catch((err) => {
        console.warn("获取页脚配置失败，使用既有配置:", err);
      });
  }, []);

  return (
    <footer className="relative pt-20 pb-10">
      <div className="absolute inset-0 bg-gradient-to-br from-[#2b6cb0] via-[#2b6cb0] to-[#1a365d]"></div>

      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      ></div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-12 mb-16">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-white/10 backdrop-blur-sm flex items-center justify-center rounded-xl border border-white/20 overflow-hidden p-1.5">
                {footerData.logo && footerData.logo !== "/logo.png" ? (
                  <img
                    src={footerData.logo}
                    alt={footerData.siteName}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "/logo.png";
                    }}
                  />
                ) : (
                  <Hexagon className="text-white w-6 h-6" />
                )}
              </div>
              <div>
                <span className="text-lg font-bold text-white">{footerData.siteName}</span>
                <div className="text-xs text-blue-200">{footerData.subTitle}</div>
              </div>
            </div>
            <p className="text-sm text-blue-100 max-w-xs leading-relaxed mb-8">
              {footerData.slogan}
            </p>

            {/* 社交媒体二维码浮窗 */}
            <div className="flex gap-4 relative">
              {/* 微信二维码 */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 hover:scale-110 cursor-pointer"
                  title="关注官方微信"
                >
                  <svg fill="currentColor" viewBox="0 0 1024 1024" className="w-5 h-5 text-emerald-300">
                    <path d="M682.666667 362.666667c14.933333 0 29.866667 0 42.666666 4.266666-42.666667-157.866667-200.533333-273.066667-396.8-273.066666C153.6 93.866667 12.8 217.6 12.8 371.2c0 89.6 46.933333 166.4 123.733333 226.133333L102.4 695.466667l102.4-55.466667c42.666667 12.8 85.333333 17.066667 123.733333 17.066667 12.8 0 25.6 0 38.4-4.266667-4.266667-17.066667-4.266667-34.133333-4.266666-51.2 0-132.266667 140.8-238.933333 315.733333-238.933333z m-264.533334-110.933334c21.333333 0 38.4 17.066667 38.4 38.4 0 21.333333-17.066667 38.4-38.4 38.4-21.333333 0-38.4-17.066667-38.4-38.4 0-21.333333 17.066667-38.4 38.4-38.4z m-162.133333 76.8c-21.333333 0-38.4-17.066667-38.4-38.4 0-21.333333 17.066667-38.4 38.4-38.4 21.333333 0 38.4 17.066667 38.4 38.4 0 21.333333-17.066667 38.4-38.4 38.4zM1006.933333 601.6c0-119.466667-119.466667-217.6-268.8-217.6s-268.8 98.133333-268.8 217.6c0 119.466667 119.466667 217.6 268.8 217.6 34.133333 0 64-8.533333 93.866667-17.066667l76.8 42.666667-25.6-72.533333c55.466667-46.933333 89.6-106.666667 89.6-170.666667z m-354.133333-34.133333c-17.066667 0-29.866667-12.8-29.866667-29.866667s12.8-29.866667 29.866667-29.866667c17.066667 0 29.866667 12.8 29.866667 29.866667s-12.8 29.866667-29.866667 29.866667z m170.666667 0c-17.066667 0-29.866667-12.8-29.866667-29.866667s12.8-29.866667 29.866667-29.866667 29.866667 12.8 29.866667 29.866667-12.8 29.866667-29.866667 29.866667z" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-0 mb-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out z-[100]">
                  <div className="bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] p-4 w-48">
                    <div className="bg-gradient-to-br from-emerald-50 to-transparent p-2 rounded-xl mb-3">
                      <img
                        src={footerData.wechatQr}
                        alt="微信二维码"
                        className="w-40 h-40 rounded-lg mx-auto object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/wechat";
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 mb-1">扫一扫</div>
                      <div className="text-[10px] text-slate-500">关注知阁·舟坊官方微信</div>
                    </div>
                    <div className="absolute -bottom-2 left-4 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              </div>

              {/* QQ 二维码 */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 hover:scale-110 cursor-pointer"
                  title="加入官方 QQ 群"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="currentColor" className="w-5 h-5 text-blue-300">
                    <path d="M824.8 613.2c-16-51.4-34.4-94.6-62.7-165.3C766.5 262.2 689.3 112 511.5 112 331.7 112 256.2 265.2 261 447.9c-28.4 70.8-46.7 113.8-62.7 165.3-22.6 72.2-32.6 142.1 16.5 177 19.4 13.8 41.5 20.6 66.2 20.6 8.4 0 17-0.9 25.8-2.6 15 26.6 40.5 48.9 76.8 66 40.8 19.2 92.1 30.1 146.4 31.9 44.5 1.5 91.1-6.1 135.5-22.3 35.5-13 65-31.5 86-53.9 14.5 4.6 29.8 6.9 45.4 6.9 23.3 0 44-5.8 62.3-17.1 50-31.1 41.5-103.7 16.3-175.7z" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out z-[100]">
                  <div className="bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] p-4 w-48">
                    <div className="bg-gradient-to-br from-blue-50 to-transparent p-2 rounded-xl mb-3">
                      <img
                        src={footerData.qqQr}
                        alt="QQ 二维码"
                        className="w-40 h-40 rounded-lg mx-auto object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/qq";
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 mb-1">扫一扫</div>
                      <div className="text-[10px] text-slate-500">加入知阁·舟坊官方 QQ 群</div>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              </div>

              {/* 微博二维码 */}
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-all duration-300 hover:scale-110 cursor-pointer"
                  title="关注官方微博"
                >
                  <svg fill="currentColor" viewBox="0 0 1024 1024" className="w-5 h-5 text-red-300">
                    <path d="M410.9 762.5c-102.3 11-192-34.5-200.3-101.5-8.2-67 68.3-130 170.6-141 102.3-11 192 34.5 200.3 101.5 8.2 67-68.3 130-170.6 141z m-45-126.9c-29.3-1.6-56.7 14.1-61.2 35.1-4.4 21 15.6 39.4 44.9 41.1 29.3 1.6 56.7-14.1 61.2-35.1 4.5-21.1-15.6-39.4-44.9-41.1z m16.9-39.8c-12-1.9-23.7 3.5-25.9 12-2.1 8.5 5.8 17 17.8 18.9 12 1.9 23.7-3.5 25.9-12 2.1-8.5-5.8-17-17.8-18.9zM786 384c-17.9-14-36.9-26.6-56.7-37.6 19.3-18.2 31.2-43.8 31.2-72 0-55.2-44.8-100-100-100-34.9 0-65.5 17.9-83.3 45.1C517 186.2 437.9 166.4 352 166.4c-194.4 0-352 119.4-352 266.7 0 71.2 36.3 135.8 95.5 183.6-9.7 20.3-15.1 42.9-15.1 66.7 0 88.4 71.6 160 160 160 21.4 0 41.8-4.2 60.5-11.8 64.9 36.4 142.3 57.6 225.1 57.6 247.4 0 448-155.2 448-346.7 0-66.2-22.9-128.1-62-178.5z m-356.5 452.8C245.9 854 84.1 771.5 67.3 652.8c-16.7-118.7 114.3-228.6 297.8-245.8 183.6-17.2 345.3 65.3 362.1 184 16.7 118.7-114.3 228.6-297.7 245.8z" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out z-[100]">
                  <div className="bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] p-4 w-48">
                    <div className="bg-gradient-to-br from-red-50 to-transparent p-2 rounded-xl mb-3">
                      <img
                        src={footerData.weiboQr}
                        alt="微博二维码"
                        className="w-40 h-40 rounded-lg mx-auto object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zhige-dockyard.com/weibo";
                        }}
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 mb-1">扫一扫</div>
                      <div className="text-[10px] text-slate-500">关注知阁·舟坊官方微博</div>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4 大分类导航链接（真实数据库驱动） */}
          {footerData.navColumns.map((col, colIdx) => (
            <div key={colIdx} className="space-y-4">
              <h4 className="font-bold text-sm text-white">{col.title}</h4>
              <ul className="text-sm text-blue-100 space-y-2">
                {col.links?.map((link, linkIdx) => (
                  <li key={linkIdx}>
                    <Link
                      href={link.url || "#/"}
                      className="hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 底部版权与备案资质行 */}
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-[13px] text-blue-200 text-center md:text-left">
            © 2026 ZhiGe OS · {footerData.siteName} · {footerData.icpNumber} · {footerData.policeIcp}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/privacy-policy" className="text-[13px] text-blue-200 hover:text-white transition-colors">
              隐私政策
            </Link>
            <Link href="/terms-of-service" className="text-[13px] text-blue-200 hover:text-white transition-colors">
              服务条款
            </Link>
            <div className="flex items-center gap-1.5 text-[13px] text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(74,222,128,0.6)] animate-pulse"></span>
              系统服务状态正常
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}