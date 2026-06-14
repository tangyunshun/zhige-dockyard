# 📱 织歌码头响应式与多端自动适配开发指南 (Developer Guide)

本指南旨在指导开发人员在**后续开发新页面、新功能或新组件时**，如何利用系统内置的自动适配基建，编写“天然自适应”的代码，避免为每个分辨率单独书写大量媒体查询。

---

## 🚀 一、 核心适配基建一览

### 1. 流式排版与间距 (Fluid Sizing)
我们在 [globals.css](file:///d:/Project%20Development/ZhiGe-Dockyard/zhige-dockyard-web/src/app/globals.css) 中定义了自适应的字号和边距 CSS 变量，这些变量使用 `clamp()` 计算，会随着浏览器窗口大小平滑改变，无需手动添加断点（如 `sm:`, `md:`, `lg:`）。

**常用变量：**
* 字体大小：`var(--fluid-text-xs)` 至 `var(--fluid-text-4xl)`
* 容器内边距：`var(--fluid-padding-xs)` 至 `var(--fluid-padding-xl)`
* 示例用法：
  ```tsx
  <div style={{ padding: 'var(--fluid-padding-md)' }}>
    <h2 style={{ fontSize: 'var(--fluid-text-xl)' }}>流式标题</h2>
  </div>
  ```

### 2. 原子自适应布局组件
所有新页面**严禁**手写顶层带有固定宽度的 `div`。应统一使用以下两个组件：

* **`PageContainer`**：自动处理页面最大安全宽度（如限制 4K 屏过宽）和两边安全内边距。
  ```tsx
  import { PageContainer } from "@/components/common";

  export default function NewPage() {
    return (
      <PageContainer>
        <h1>我的新页面内容</h1>
      </PageContainer>
    );
  }
  ```
* **`AutoGrid`**：**极力推荐**。无需编写媒体查询即可实现完全自动的分栏折行。只需指定 `minWidth`（每个卡片占用的最小像素宽度），容器就会根据当前视口宽度自动计算并平铺最合适的列数。
  ```tsx
  import { AutoGrid } from "@/components/common";

  <AutoGrid minWidth={300}>
    <Card />
    <Card />
    <Card />
  </AutoGrid>
  ```

---

## 💡 二、 React 逻辑层适配 (React Hooks)

如果新页面的交互逻辑在不同设备下有差异（例如：移动端隐藏大型 Canvas、缩短文案或替换为轻量级列表），可以通过 Hook 获取当前状态：

```tsx
import { useResponsive } from "@/contexts/ResponsiveContext";

export default function MyFeature() {
  const { isMobile, isTablet, isTouch, breakpoint } = useResponsive();

  return (
    <div>
      {/* 自动适配：移动端渲染简洁版，大屏渲染高级版 */}
      {isMobile ? <MobileVersion /> : <FullInteractiveCanvas />}
      
      {/* 根据触控特性优化点击区域 */}
      <button className={isTouch ? "p-4" : "p-2"}>
        保存
      </button>
    </div>
  );
}
```

---

## ⚠️ 三、 新增页面适配“军规”

为了保证后期新增的功能长久保持自适应，请在 Code Review 时严格执行以下规则：

1. **绝对禁止硬编码宽度**
   * ❌ 错误：`className="w-[1200px]"` 或 `style={{ width: '800px' }}`
   *  正确：`className="w-full max-w-4xl"` 或 `className="w-1/2 min-w-[320px]"`
2. **移动端优先与 Flex Wrap 布局**
   * 在使用 Flex 布局时，务必考虑溢出折行。
   * 示例：`className="flex flex-wrap gap-4"`
3. **保证按钮的可点区域**
   * 在移动端（触屏）上，按钮的物理尺寸最好不要小于 `44px x 44px`。建议利用 `isTouch` 或 Tailwind 的响应式内边距对移动端进行适当增大。
4. **表格与大图的横向滚动保护**
   * 遇到复杂大图或大表格，一定要外包一层 `overflow-x-auto` 容器，防止把整个页面撑宽，导致手机端左右晃动。
