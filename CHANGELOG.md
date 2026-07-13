# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- In-browser code editor (CodeMirror 6) that edits artwork files directly on disk — save with Cmd+S, collapsible and resizable pane, and conflict detection when a file changes externally (e.g. in VS Code)
- Console panel below the preview capturing `console.log`/`warn`/`error`, uncaught errors, and unhandled promise rejections, with duplicate-message collapsing and error/warning count badges
- Prettier formatting on save, plus a Format button (Shift+Alt+F) in the editor
- Vite dev-server endpoint (`/__art/*`) for reading and writing artwork source files
- Prettier configuration (`.prettierrc.json`) matching the project's single-quote style
- Favicon for browser tab

### Fixed

- HMR updates no longer stack duplicate event listeners or insert a duplicate canvas-controls container when `main.ts` re-executes

## [1.0.0] - 2026-01-10

### Added

- Live SVG preview with hot module reloading
- Control panel with support for slider, numeric, toggle, dropdown, seed, point2d, vector, and rectangle control types
- URL state synchronization for shareable artwork configurations
- localStorage persistence for working values
- Canvas size controls with physical units (inches, mm, cm, pixels) and presets
- SVG export with AxiDraw path optimization for pen plotter output
- SVG.js integration as optional chainable SVG generation library
- Seeded PRNG (Mulberry32) for deterministic randomness
- Interactive CLI script (`npm run new`) for creating new artworks
- Artwork metadata display (title/description) as caption below preview
- Dirty state indicators showing diff from file defaults
- Control editor dialog for adding, editing, and deleting controls
- Export button to copy TypeScript schema to clipboard
- Integration with @johnfmorton/generative-utils library
- Example artworks demonstrating various techniques

### Fixed

- Control inputs no longer overflow their containers
- Continuous slider dragging works correctly with dirty state updates

### Security

- Upgraded Vite to 6.4.1 to address esbuild vulnerability
