# Changelog

## [Unreleased]

## [0.4.1] - 2026-04-21

### Fixed

- ffmpeg and ffprobe are now found on macOS when installed via Homebrew (`/opt/homebrew/bin`) and the app environment does not inherit the shell PATH
- Fix operation now uses format-specific encoder settings instead of generic H.264 for all formats
- Rotate operation (left/right) detects the original codec via ffprobe and applies matching lossless encoder settings

## [0.4.0] - 2026-04-20

### Added

- Video watcher: monitor a folder for new videos and automatically process them with ffmpeg
- Supported operations: rotate left, rotate right, fix encoding (re-encode to H.264 with fixed keyframes)

## [0.3.0] - 2026-04-19

### Added

- Move files to a target folder
- Dark mode

### Changed

- Reworked scan filters with improved filter options (e.g. exclude folders)

### Fixed

- Zoom out did not work correctly
- Update process did not complete correctly

### Performance

- Improved counting of empty directories

## [0.2.1] - 2026-04-02

### Fixed

- App did not reload after update on macOS
- Empty folder remover did not work when $HOME was not set (Windows)

## [0.2.0] - 2026-04-02

### Added

- Empty folder remover

## [0.1.0] - 2014-03-29

### Added

- Batch rename using match pattern (regex) and rename pattern with group references
- Insert captured groups into rename pattern via clickable buttons
- Filter files by name pattern
- Per-file ignore checkbox and override rename pattern
- Ignore system files
- Auto-updater: checks for new releases on launch and prompts to install
- Zoom in/out via keyboard shortcuts

[0.4.1]: https://github.com/yawnwest/file-manager/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/yawnwest/file-manager/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yawnwest/file-manager/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/yawnwest/file-manager/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/yawnwest/file-manager/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yawnwest/file-manager/releases/tag/v0.1.0
