# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-12

### Added

- Rect tool mode with cross-tool selection compatibility
- New test suites: `demo.app.test.tsx`, expanded `Selection.rect.test.tsx`

### Changed

- Refactored `Selection.tsx` core rendering and interaction logic (+1031/-531 lines)
- Updated `styleUtils.ts` and `useTextSelection.ts` for rect tool support
- Expanded test coverage across all selection modules

### Fixed

- Rect tool handle rendering and linked-mode cross-container guard
- Mobile selection: token-based click skip, multi-finger guard, blank-click clear
- Selection overlay recomputation on scroll
- Log key duplicates in demo App
- CI configuration: added test step, ignore `.omo/`, alias package for vitest

## [0.0.2-beta.1] - 2026-07-02

### 变更

- 版本号迭代更新，无功能性变更

## [0.0.1-beta.2] - 2026-07-02

### 变更

- 版本号迭代更新，无功能性变更

## [0.0.1-beta] - 2026-07-02

### 新增

- 移动端触摸选区支持，包含共享联动激活范围
- `markerStyle` 和 `selectionStyle` 属性，支持样式快照持久化
- `overlayRectType` 属性，支持 px/百分比 覆盖层渲染
- 联动选区几何图形和类型扩展
- 联动项交互支持
- 跨选区范围捕获
- 联动容器注册
- 联动作用域几何图形渲染
- 选区弹窗、拖拽手柄和新选区选项
- 手柄渲染、标记颜色和手柄行为优化
- 弹窗交互和拖拽手柄改进

### 变更

- 将 `hideHandlesOnSelection` 替换为联动拖拽状态同步
- 增强选区交互和跨容器拖拽支持
- 优化选区覆盖矩形和弹窗交互
- 将 `hideHandlesOnFirstSelection` 重命名为 `hideHandlesOnSelection`

### 修复

- 三个移动端选区 bug：结束回调、弹窗点击和点击取消选中
- 重新选择期间隐藏激活弹窗，改进拖拽手柄处理
- 选择文本时隐藏选区弹窗
- 当 `overlayRectType` 为百分比时，使用百分比定位手柄和弹窗
- 选中高亮样式处理和 `overlayRectType` 默认值
