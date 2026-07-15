# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- "New Artwork" wizard dialog in the header (dev server only): filename/title, paper-size presets, SVG.js or raw DOM, and optional helper starter examples — creates a ready-to-run artwork file that draws a seeded starter shape
- Shared artwork file template (`src/artwork-template.ts`) used by both the wizard and `npm run new`, eliminating template drift
- Optional helpers prompt in the `npm run new` CLI matching the wizard's choices
- Create-safe artwork endpoint: `POST /__art/<name>?create=1` returns 409 instead of overwriting an existing file
- New helper dependencies for plotter work: `simplex-noise` (seedable flow-field noise), `polygon-clipping` (boolean polygon ops for occlusion/hatching), `bezier-js` (curve splitting, measuring, offsets) with local type declarations for bezier-js

- "Write to art/&lt;name&gt;.ts" option in the control dialog (on by default, dev server only): adding, editing, or deleting a control rewrites the `controls` block in the artwork file and saves it, so UI-created controls persist without the copy/paste round-trip
- Writing controls to the artwork file also keeps the `const { ... } = values;` line in `draw()` in sync — newly added control values are immediately usable in code, and renamed/deleted controls don't leave stale bindings behind
- Drag-and-drop control reordering via a grip handle on each row; the new order persists to the artwork file (honors the same write-to-file preference)

### Fixed

- Generated artwork template no longer references `values.seed` (a type error) when no seed control exists
- Exported controls code now escapes apostrophes in labels/descriptions correctly (previously produced invalid TypeScript)

## [1.1.0] - 2026-07-13

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
