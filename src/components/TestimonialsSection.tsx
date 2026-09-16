"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Quote,
  ShieldCheck,
  Star,
  User,
} from "lucide-react";
import {
  TESTIMONIAL_CATEGORY_LABEL,
  TESTIMONIAL_STATS,
  TESTIMONIALS as FALLBACK_TESTIMONIALS,
  type Testimonial,
  type TestimonialCategory,
} from "@/lib/testimonials";

interface TestimonialsSectionProps {
  /** 点击「申请产品演示」时的回调（与 HeroSection / CTA 共用同一弹窗） */
  onDemoRequest?: () => void;
}

const CATEGORY_ORDER: TestimonialCategory[] = ["personal", "enterprise"];

/** 移动端自动轮播间隔 */
const AUTO_PLAY_INTERVAL_MS = 5000;
/** 用户手动滑动后暂停自动轮播的时长 */
const RESUME_AFTER_INTERACTION_MS = 8000;

export default function TestimonialsSection({ onDemoRequest }: TestimonialsSectionProps) {
  const [category, setCategory] = useState<TestimonialCategory>("personal");
  const [items, setItems] = useState<Testimonial[]>(FALLBACK_TESTIMONIALS);
  const [activeDot, setActiveDot] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 真实数据：拉取后端当前展示组；失败时保留内置兜底数据，保证首页始终有内容
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/testimonials", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data?.success && Array.isArray(data.testimonials) && data.testimonials.length > 0) {
          setItems(data.testimonials as Testimonial[]);
        }
      } catch {
        // 静默降级：使用内置评价数据
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo(() => {
    const filtered = items.filter((t) => t.category === category);
    return filtered.length > 0 ? filtered : items.filter((t) => t.category === "personal");
  }, [items, category]);

  // 切换人群后复位轮播位置
  useEffect(() => {
    setActiveDot(0);
    scrollRef.current?.scrollTo({ left: 0 });
  }, [category]);

  // 卡片步进宽度（卡片宽度 + gap）
  const getStep = () => {
    const el = scrollRef.current;
    if (!el) return 0;
    const card = el.querySelector<HTMLElement>("[data-card]");
    return card ? card.offsetWidth + 16 : el.clientWidth;
  };

  // 移动端自动轮播（桌面为网格布局，不轮播）
  useEffect(() => {
    if (list.length <= 1) return;
    const timer = setInterval(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (typeof window !== "undefined" && window.innerWidth >= 768) return;
      if (pausedRef.current) return;

      const step = getStep();
      if (!step) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const nextLeft = el.scrollLeft + step;
      el.scrollTo({ left: nextLeft > maxScroll + 8 ? 0 : nextLeft, behavior: "smooth" });
    }, AUTO_PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [list]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const step = getStep();
    if (!step) return;
    setActiveDot(Math.max(0, Math.round(el.scrollLeft / step)));
  };

  const pauseAutoPlay = () => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_AFTER_INTERACTION_MS);
  };

  const scrollByCard = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = getStep();
    if (!step) return;
    pauseAutoPlay();
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden">
      {/* 装饰性光晕（与首页其它区块保持一致的柔和质感） */}
      <div className="absolute top-[-10%] left-[-8%] w-[32%] h-[32%] bg-[#3182ce]/[0.05] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-8%] w-[32%] h-[32%] bg-[#10b981]/[0.05] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative">
        {/* 标题区 */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-sm font-medium text-[#2b6cb0] bg-blue-50/60 border border-blue-100 rounded-full shadow-sm">
            <ShieldCheck className="w-4 h-4" />
            真实用户评价
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-slate-900 leading-tight">
            个人与企业客户的
            <span className="bg-gradient-to-r from-[#2b6cb0] to-indigo-500 text-transparent bg-clip-text">
              使用评价
            </span>
          </h2>
          <p className="text-lg text-slate-500 mx-auto whitespace-nowrap overflow-x-auto text-center">
            从独立开发者到规模化研发团队，看看他们如何用知阁·舟坊把想法变成可交付的系统。
          </p>
        </div>

        {/* 口碑汇总指标 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto mb-12">
          {TESTIMONIAL_STATS.map((stat) => (
            <div key={stat.label} className="bento-card rounded-12 px-6 py-5 text-center">
              <div className="text-2xl font-black text-[#2b6cb0] tracking-tight">
                {stat.value}
                {stat.sub && <span className="text-sm font-bold text-slate-400 ml-1">{stat.sub}</span>}
              </div>
              <div className="text-xs font-bold text-slate-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* 人群切换：个人用户 / 企业客户 */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="inline-flex items-center gap-1 bg-white/70 backdrop-blur-md rounded-full p-1 border border-slate-200/60 shadow-sm">
            {CATEGORY_ORDER.map((key) => {
              const active = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-black transition-all cursor-pointer ${
                    active
                      ? "bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-sm"
                      : "text-slate-500 hover:text-[#2b6cb0]"
                  }`}
                >
                  {key === "personal" ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                  {TESTIMONIAL_CATEGORY_LABEL[key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 评价卡片：移动端横向滑动轮播，桌面端三列网格 */}
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            onPointerDown={pauseAutoPlay}
            onTouchStart={pauseAutoPlay}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-6 px-6 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {list.map((item) => (
              <article
                key={item.id}
                data-card
                className="bento-card rounded-12 p-6 flex flex-col relative h-full snap-center shrink-0 w-[85%] sm:w-[60%] md:w-auto md:shrink"
              >
                <Quote className="absolute top-5 right-5 w-9 h-9 text-blue-100 pointer-events-none" />

                {/* 星级 */}
                <div className="flex items-center gap-0.5 mb-4" aria-label={`评分 ${item.rating} / 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${
                        i < item.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"
                      }`}
                    />
                  ))}
                </div>

                {/* 正文 */}
                <p className="text-sm text-slate-600 leading-relaxed flex-1">“{item.content}”</p>

                {/* 成效指标 */}
                {item.highlight && (
                  <div className="mt-4 flex items-center justify-between rounded-8 bg-[#ebf8ff] border border-blue-100 px-3 py-2">
                    <span className="text-[11px] font-bold text-[#2b6cb0]">{item.highlight.label}</span>
                    <span className="text-sm font-black text-[#2b6cb0] font-mono">{item.highlight.value}</span>
                  </div>
                )}

                {/* 能力标签 */}
                {item.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 评价者信息（头像 + 姓名 + 身份） */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-3">
                  {item.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.avatar}
                      alt={item.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-xs font-black flex items-center justify-center shrink-0">
                      {item.avatarText}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-800 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {item.org ? `${item.org} · ${item.role}` : item.role}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* 移动端轮播控制：左右按钮 + 圆点（桌面隐藏） */}
          {list.length > 1 && (
            <div className="md:hidden flex items-center justify-center gap-3 mt-4">
              <button
                type="button"
                onClick={() => scrollByCard(-1)}
                aria-label="上一条评价"
                className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-500 active:scale-95 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {list.map((item, i) => (
                  <span
                    key={item.id}
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeDot ? "w-4 bg-[#3182ce]" : "w-1.5 bg-slate-300"
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => scrollByCard(1)}
                aria-label="下一条评价"
                className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-500 active:scale-95 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 底部 CTA */}
        <div className="mt-12 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onDemoRequest}
              className="zg-btn zg-btn-primary text-sm font-black inline-flex items-center gap-2"
            >
              申请产品演示
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            想了解同行怎么落地？我们可以按您的行业与合规要求做一次针对性演示。
          </p>
        </div>
      </div>

    </section>
  );
}
