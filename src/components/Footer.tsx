"use client";

import { Hexagon } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-50 pt-20 pb-10 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-12 mb-16">
          {/* Brand & Contact Icons */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-slate-900 flex items-center justify-center rounded-8">
                <Hexagon className="text-white w-5 h-5" />
              </div>
              <span className="text-lg font-bold">知阁·舟坊</span>
            </div>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-8">
              全球领先的软件研发效能操作系统，致力于通过 AI
              消除研发链路中的低效熵值，释放创造力。
            </p>

            {/* 社交媒体与联系方式互动矩阵 */}
            <div className="flex gap-6 items-center">
              {/* 1. 微信 */}
              <div className="relative group cursor-pointer">
                <div className="text-slate-400 hover:text-[#07C160] transition-all duration-300 transform group-hover:scale-110 flex items-center justify-center w-7 h-7">
                  <svg
                    fill="currentColor"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6"
                  >
                    <path d="M682.666667 362.666667c14.933333 0 29.866667 0 42.666666 4.266666-42.666667-157.866667-200.533333-273.066667-396.8-273.066666C153.6 93.866667 12.8 217.6 12.8 371.2c0 89.6 46.933333 166.4 123.733333 226.133333L102.4 695.466667l102.4-55.466667c42.666667 12.8 85.333333 17.066667 123.733333 17.066667 12.8 0 25.6 0 38.4-4.266667-4.266667-17.066667-4.266667-34.133333-4.266666-51.2 0-132.266667 140.8-238.933333 315.733333-238.933333z m-264.533334-110.933334c21.333333 0 38.4 17.066667 38.4 38.4 0 21.333333-17.066667 38.4-38.4 38.4-21.333333 0-38.4-17.066667-38.4-38.4 0-21.333333 17.066667-38.4 38.4-38.4z m-162.133333 76.8c-21.333333 0-38.4-17.066667-38.4-38.4 0-21.333333 17.066667-38.4 38.4-38.4 21.333333 0 38.4 17.066667 38.4 38.4 0 21.333333-17.066667 38.4-38.4 38.4zM1006.933333 601.6c0-119.466667-119.466667-217.6-268.8-217.6s-268.8 98.133333-268.8 217.6c0 119.466667 119.466667 217.6 268.8 217.6 34.133333 0 64-8.533333 93.866667-17.066667l76.8 42.666667-25.6-72.533333c55.466667-46.933333 89.6-106.666667 89.6-170.666667z m-354.133333-34.133333c-17.066667 0-29.866667-12.8-29.866667-29.866667s12.8-29.866667 29.866667-29.866667c17.066667 0 29.866667 12.8 29.866667 29.866667s-12.8 29.866667-29.866667 29.866667z m170.666667 0c-17.066667 0-29.866667-12.8-29.866667-29.866667s12.8-29.866667 29.866667-29.866667 29.866667 12.8 29.866667 29.866667-12.8 29.866667-29.866667 29.866667z" />
                  </svg>
                </div>
                {/* Popover: Wechat QR */}
                <div className="absolute bottom-full left-0 mb-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out transform group-hover:-translate-y-1">
                  <div className="bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] rounded-12 p-4 w-44">
                    <div className="bg-gradient-to-br from-[#07C160]/5 to-transparent p-1 rounded-8 mb-3">
                      <img
                        src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=WechatQR_Placeholder"
                        alt="微信二维码"
                        className="w-36 h-36 rounded-6 mx-auto"
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 mb-0.5">
                        扫一扫
                      </div>
                      <div className="text-[10px] text-slate-500">
                        关注知阁·舟坊官方微信
                      </div>
                    </div>
                    <div className="absolute -bottom-2 left-4 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              </div>

              {/* 2. QQ */}
              <div className="relative group cursor-pointer">
                <div className="text-slate-400 hover:text-[#12B7F5] transition-all duration-300 transform group-hover:scale-110 flex items-center justify-center w-7 h-7">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 1024 1024"
                    fill="currentColor"
                    className="w-6 h-6"
                  >
                    <path d="M824.8 613.2c-16-51.4-34.4-94.6-62.7-165.3C766.5 262.2 689.3 112 511.5 112 331.7 112 256.2 265.2 261 447.9c-28.4 70.8-46.7 113.8-62.7 165.3-22.6 72.2-32.6 142.1 16.5 177 19.4 13.8 41.5 20.6 66.2 20.6 8.4 0 17-0.9 25.8-2.6 15 26.6 40.5 48.9 76.8 66 40.8 19.2 92.1 30.1 146.4 31.9 44.5 1.5 91.1-6.1 135.5-22.3 35.5-13 65-31.5 86-53.9 14.5 4.6 29.8 6.9 45.4 6.9 23.3 0 44-5.8 62.3-17.1 50-31.1 41.5-103.7 16.3-175.7z" />
                  </svg>
                </div>
                {/* Popover: QQ QR */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out transform group-hover:-translate-y-1">
                  <div className="bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] rounded-12 p-4 w-44">
                    <div className="bg-gradient-to-br from-[#12B7F5]/5 to-transparent p-1 rounded-8 mb-3">
                      <img
                        src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=QQ_Placeholder"
                        alt="QQ 二维码"
                        className="w-36 h-36 rounded-6 mx-auto"
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 mb-0.5">
                        扫一扫
                      </div>
                      <div className="text-[10px] text-slate-500">
                        关注知阁·舟坊官方 QQ
                      </div>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              </div>

              {/* 3. 微博 */}
              <div className="relative group cursor-pointer">
                <div className="text-slate-400 hover:text-[#E6162D] transition-all duration-300 transform group-hover:scale-110 flex items-center justify-center w-7 h-7">
                  <svg
                    fill="currentColor"
                    viewBox="0 0 1024 1024"
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6"
                  >
                    <path d="M410.9 762.5c-102.3 11-192-34.5-200.3-101.5-8.2-67 68.3-130 170.6-141 102.3-11 192 34.5 200.3 101.5 8.2 67-68.3 130-170.6 141z m-45-126.9c-29.3-1.6-56.7 14.1-61.2 35.1-4.4 21 15.6 39.4 44.9 41.1 29.3 1.6 56.7-14.1 61.2-35.1 4.5-21.1-15.6-39.4-44.9-41.1z m16.9-39.8c-12-1.9-23.7 3.5-25.9 12-2.1 8.5 5.8 17 17.8 18.9 12 1.9 23.7-3.5 25.9-12 2.1-8.5-5.8-17-17.8-18.9zM786 384c-17.9-14-36.9-26.6-56.7-37.6 19.3-18.2 31.2-43.8 31.2-72 0-55.2-44.8-100-100-100-34.9 0-65.5 17.9-83.3 45.1C517 186.2 437.9 166.4 352 166.4c-194.4 0-352 119.4-352 266.7 0 71.2 36.3 135.8 95.5 183.6-9.7 20.3-15.1 42.9-15.1 66.7 0 88.4 71.6 160 160 160 21.4 0 41.8-4.2 60.5-11.8 64.9 36.4 142.3 57.6 225.1 57.6 247.4 0 448-155.2 448-346.7 0-66.2-22.9-128.1-62-178.5z m-356.5 452.8C245.9 854 84.1 771.5 67.3 652.8c-16.7-118.7 114.3-228.6 297.8-245.8 183.6-17.2 345.3 65.3 362.1 184 16.7 118.7-114.3 228.6-297.7 245.8z" />
                  </svg>
                </div>
                {/* Popover: Weibo QR */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out transform group-hover:-translate-y-1">
                  <div className="bg-white border border-slate-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] rounded-12 p-4 w-44">
                    <div className="bg-gradient-to-br from-[#E6162D]/5 to-transparent p-1 rounded-8 mb-3">
                      <img
                        src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=Weibo_Placeholder"
                        alt="微博二维码"
                        className="w-36 h-36 rounded-6 mx-auto"
                      />
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-slate-700 mb-0.5">
                        扫一扫
                      </div>
                      <div className="text-[10px] text-slate-500">
                        关注知阁·舟坊官方微博
                      </div>
                    </div>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r border-b border-slate-200 transform rotate-45"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-900">产品</h4>
            <ul className="text-sm text-slate-500 space-y-2">
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  核心模块
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  组件大全
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  更新日志
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  模型广场
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-900">资源</h4>
            <ul className="text-sm text-slate-500 space-y-2">
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  帮助中心
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  API 文档
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  最佳实践
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  开发者社区
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-900">解决方案</h4>
            <ul className="text-sm text-slate-500 space-y-2">
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  政务云
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  军工科研
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  金融信创
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  智慧城市
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-900">公司</h4>
            <ul className="text-sm text-slate-500 space-y-2">
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  关于我们
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  联系商务
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  隐私条款
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-[#2b6cb0]">
                  加入我们
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* 底部版权与合规信息区 */}
        <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-[13px] text-slate-500 text-center md:text-left">
            © 2026 ZhiGe OS · 知阁·舟坊 · 陕 ICP 备 2026000000 号 -1 ·
            陕公网安备 31000000000000 号
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a
              href="#"
              className="text-[13px] text-slate-500 hover:text-[#2b6cb0] transition-colors"
            >
              隐私政策
            </a>
            <a
              href="#"
              className="text-[13px] text-slate-500 hover:text-[#2b6cb0] transition-colors"
            >
              服务条款
            </a>
            {/* 服务状态指示器 */}
            <a
              href="#"
              className="flex items-center gap-1.5 text-[13px] text-[#38a169] hover:opacity-80 transition-opacity md:ml-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#38a169] shadow-[0_0_4px_rgba(56,161,105,0.6)]"></span>
              系统服务状态正常
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
