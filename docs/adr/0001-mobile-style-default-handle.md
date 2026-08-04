# 默认文本手柄替换为移动端样式（竖线+圆圈）

selection 库的内置默认 range handle 从「12px 粉色圆形（白色描边）」替换为移动端（iOS）风格：一根与文本行等高的竖线，start 手柄圆圈在竖线顶端、end 手柄圆圈在竖线底端，圆与线端相切。这样做的动机是让库的默认可用形态贴合以触屏为主的产品场景——圆形小点在触屏上既不像系统控件、也没有可利用的热区分离设计。

## Considered Options

- **新增 `handleVariant: 'mobile' | 'dot'` 而非直接替换** —— 否决。`renderHandle` 已是完全自定义的逃生舱，维护两套内置视觉和样式推导逻辑的长期成本不划算；需要旧样式时可经 `renderHandle` 复刻。
- **Android 风格（双圆圈均在竖线底端）** —— 否决。iOS 风格的 start/end 圆圈分居上下，角色可区分，且圆圈位于选区外侧、拖拽时手指不遮挡文本。
- **保留白色描边** —— 否决。采用线圆同色实心（颜色仍由 `deriveHandleVisualStyle` 的 `background` 推导），视觉更贴近真实 iOS 控件；文本手柄不再消费 `borderColor/borderWidth` 推导输出（rect 手柄不受影响）。

## Consequences

- **适用范围**：仅 `target: 'text'` 的手柄（active-selection 与 persisted-range）；rect 框选手柄锚在角点、无行高概念，保留圆形样式。
- **锚点语义不变**：现有文本手柄锚点本来就是「选区边缘 x + 行垂直中心 y」，竖线垂直居中于锚点即可，定位逻辑无需改动；但行高必须传入渲染层。
- **公开 API 增量**：`HandleRenderProps` 新增 `lineHeight?: number`（单位随 `positionUnit`；文本手柄必传，rect 手柄为 `undefined`），使外部自定义渲染能复刻等高竖线。向后兼容。
- **视觉与热区分离**：手柄根元素为约 28px 宽的透明热区（高 = 行高 + 圆圈外延），竖线 2px、圆圈直径 12px 实心，整体高 = 行高 + 12px。拖拽中的行为（`pointer-events: none`）维持现状。
- **破坏面**：默认手柄 DOM 从空 `<button>` 变为含线/圆子元素的结构；`.hsn-selection-handle` className、`--start/--end` 修饰类与 aria-label 保持不变以降低测试破坏面；依赖默认手柄内部 DOM 的测试与 `selection-qa.mjs` 需同步更新。

> Errata (2026-07-29)：根目录 selection-qa.mjs 已不存在（破坏面声明过时）；实际 QA 脚本 .omo/ulw-qa.mjs 无手柄选择器依赖，无需同步更新。热区宽 28px 为固定值（非近似）；自 0.2.0 起文本 render props 不再提供 style.background、borderColor、borderWidth、borderStyle，颜色改读 --hsn-handle-color，owner-derived border 由 renderer 自行提供；hsn-selection-handle-dot 仅恢复库内置、未带 owner 边框覆盖时的旧默认圆点视觉，不保证恢复任意旧 renderer 像素结果，严禁使用带 rect 拖拽路由语义的 hsn-selection-handle-rect；rect 手柄旧视觉逐像素完整保留。锚点 left/top 输入保持不变，但默认文本根必须 start 上移 6px、end 下移 6px，才能使单侧圆结构中的竖线中心继续对齐原锚点。
