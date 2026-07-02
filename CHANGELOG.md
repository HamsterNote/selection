# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1-beta] - 2026-07-02

### Added

- Mobile touch selection support with shared linked active range
- `markerStyle` and `selectionStyle` props with style snapshot persistence
- `overlayRectType` prop for px/percent overlay rendering
- Linked selection geometry and type extensions
- Support for linked item interactions
- Cross selection range capture
- Linked container registration
- Linked scoped geometry rendering
- Selection popover, drag handles, and new selection options
- Handle rendering, marker colors, and improved handle behavior
- Popover interaction and drag handle improvements

### Changed

- Replaced `hideHandlesOnSelection` with linked drag state sync
- Enhanced selection interaction and cross-container drag support
- Refined selection overlay rects and popover interaction
- Renamed `hideHandlesOnFirstSelection` to `hideHandlesOnSelection`

### Fixed

- Three mobile selection bugs: end callback, popover click, and tap deselect
- Hide active popover during reselection and improve drag handle handling
- Hide selection popovers while selecting text
- Use percent positioning for handles and popovers when `overlayRectType` is percent
- Selected highlight style handling and `overlayRectType` defaults
