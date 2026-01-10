# Draw Agent

A web-based coding playground for generative art created with an AxiDraw pen plotter. The generative artwork is produced as SVG and the authoring language is TypeScript.

## Tech Stack

- **Vite** for dev server, HMR, and bundling
- **TypeScript** for all code (no JavaScript)
- **Vanilla HTML/CSS** for UI (no framework)
- **SVG.js** for optional chainable SVG generation (artists can also use raw DOM)
- **localStorage** for working state persistence
- **File System** via Vite plugin for optional save-to-file

This is a local-only application. No backend, no database, no deployment.

## Project Structure

```
draw-agent/
├── index.html
├── art/                        # Artwork files (one per piece)
│   ├── spiral-study.ts
│   ├── grid-pattern.ts
│   ├── flow-field.ts
│   └── ...
├── src/
│   ├── main.ts                 # Entry point, app orchestration
│   ├── artwork-loader.ts       # Dynamic import of art/*.ts files
│   ├── random.ts               # Seeded PRNG (Mulberry32)
│   ├── svg-utils.ts            # SVG.js helpers (createCanvas, createRawCanvas)
│   ├── vite-env.d.ts           # Vite type declarations
│   ├── controls/
│   │   ├── schema.ts           # Control & canvas type definitions
│   │   ├── control-list.ts     # Renders list of controls with dirty state
│   │   ├── control-dialog.ts   # Add/edit/delete control modal
│   │   ├── canvas-controls.ts  # Canvas size UI (header)
│   │   └── renderers.ts        # UI renderers for each control type
│   ├── sync/
│   │   ├── url-state.ts        # URL hash encoding/decoding (includes canvas)
│   │   └── local-storage.ts    # Working values & canvas persistence
│   └── styles/
│       ├── main.css            # Layout, header, preview pane
│       ├── controls.css        # Control panel & individual controls
│       └── dialog.css          # Control editor dialog
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Core Concepts

### Artwork File

Each artwork is a TypeScript file in `art/` that exports:

```typescript
// art/example.ts
import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';

export const meta = {
  title: 'Example Artwork',
  description: 'Optional description',
};

// Optional: Define canvas size in physical units
export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',  // 'in' | 'mm' | 'cm' | 'px'
};

export const controls = [
  { type: 'slider', id: 'lineWidth', label: 'Line Width', min: 0.1, max: 5, default: 1 },
  { type: 'toggle', id: 'showGrid', label: 'Show Grid', default: false },
  // ...
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  // Generate and return SVG using canvas.width, canvas.height, canvas.unit
}
```

### Canvas Configuration

Artworks can define physical dimensions for the canvas, which is essential for pen plotter output where exact sizing matters.

**Units**:
- `in` — inches (default: 8.5 × 11 for US Letter)
- `mm` — millimeters (e.g., 210 × 297 for A4)
- `cm` — centimeters
- `px` — pixels (96 DPI for web display)

**Conversion**: All units convert to pixels at 96 DPI for browser display:
```typescript
const PIXELS_PER_UNIT = {
  px: 1,
  in: 96,
  mm: 96 / 25.4,  // ~3.78
  cm: 96 / 2.54,  // ~37.8
};
```

**UI Controls**: The header includes canvas size controls with:
- Width/height inputs with unit selector
- Preset dropdown (US Letter, A4, A3, Square 8")
- Reset button to restore file defaults

**In the draw function**, use the canvas parameter (see SVG Generation below).

### SVG Generation

Artists can choose between **SVG.js** (recommended) or **raw DOM** for creating SVG elements.

**SVG.js** — Chainable API, cleaner code:
```typescript
import { createCanvas } from '../src/svg-utils';

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  const { svg, draw } = createCanvas(canvas);

  // Chainable methods
  draw.circle(50).cx(100).cy(100).fill('none').stroke({ color: '#000', width: 0.5 });
  draw.line(0, 0, 100, 100).stroke('black');

  // Groups for shared styles
  const g = draw.group().stroke({ color: 'black', width: 1 }).fill('none');
  g.rect(50, 50).move(10, 10);
  g.rect(50, 50).move(70, 70);

  return svg;
}
```

**Raw DOM** — No dependencies, maximum control:
```typescript
import { createRawCanvas } from '../src/svg-utils';

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  const svg = createRawCanvas(canvas);

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '100');
  circle.setAttribute('cy', '100');
  circle.setAttribute('r', '50');
  svg.appendChild(circle);

  return svg;
}
```

See `grid-pattern.ts` and `flow-field.ts` for SVG.js examples, `spiral-study.ts` for raw DOM.

### Control Types

| Type | Value Type | UI |
|------|------------|-----|
| `slider` | `number` | Range input with value display |
| `numeric` | `number` | Number input with optional min/max |
| `toggle` | `boolean` | Toggle switch |
| `dropdown` | Literal union | Select element |
| `seed` | `number` | Number input + 🎲 randomize button |
| `point2d` | `{x, y}` | Two inputs + optional XY pad |
| `vector` | `{x, y}` | Two inputs, represents direction/magnitude |
| `rectangle` | `{x, y, width, height}` | Four inputs |
| `presets` | `string` | Preset selector, sets multiple values |

### Value Synchronization Model

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  artwork.ts     │───▶│      URL        │───▶│  localStorage   │───▶│   Browser UI    │
│  (file defaults)│    │  (shareable)    │    │  (working vals) │    │  (live tweaks)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
                              ▲                                               │
                              └───────────────────────────────────────────────┘
```

**Value priority** (highest to lowest):
1. **URL** — if present, overrides everything (enables shareable links)
2. **localStorage** — working state, persists across refresh
3. **File defaults** — baseline from the `.ts` file

When values change in the UI:
- URL is updated via `history.replaceState` (debounced)
- localStorage is updated for session persistence
- Dirty indicator shows diff from file defaults

### URL State Format

Values are stored in the URL hash for easy copy/paste:

```
http://localhost:5173/#artwork=spiral-study&cw=8.5&ch=11&cu=in&lineWidth=1.2&showGrid=true&seed=42&center=100,150
```

- `artwork` — which artwork file is loaded
- `cw`, `ch`, `cu` — canvas width, height, and unit
- Simple values — `key=value`
- Complex values — `point2d` as `x,y`, `rectangle` as `x,y,w,h`

This enables:
- Bookmarking specific parameter states
- Sharing exact artwork configurations with canvas size
- Browser back/forward to navigate parameter history (optional, via `pushState`)

### Seeded Randomness

**Critical**: All randomness in artwork must be deterministic and seed-based.

Since URL encodes the full state including seed, `Math.random()` would break reproducibility. The same URL must always produce the same output.

**PRNG Implementation**:

```typescript
// src/random.ts

export function createRandom(seed: number): () => number {
  // Mulberry32 PRNG - fast, good distribution, 32-bit state
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

**Usage in artwork**:

```typescript
// art/example.ts
import { createRandom } from '../src/random';

export function draw(values: Values): SVGElement {
  const random = createRandom(values.seed);

  // Use random() instead of Math.random()
  const angle = random() * Math.PI * 2;
  const radius = random() * 100;
  // ...
}
```

**Rules**:
- Never use `Math.random()` in artwork code
- Always create PRNG from `values.seed` at start of `draw()`
- Same seed = same artwork, guaranteed

**Seed Control Workflow**:

1. Click 🎲 → generates new random seed (0 to 2^31-1)
2. Preview updates instantly with new randomness
3. URL updates with new seed value
4. Like what you see? Copy the URL to "save" that exact output
5. Don't like it? Click 🎲 again to explore

This makes seed exploration fast: click until you find something interesting, then the URL is your bookmark.

When a control value differs from the file default:
- Row is highlighted as "dirty"
- Shows hint with file default value
- Reset button appears to revert to file default

### Type Inference

Controls use `as const satisfies ControlSchema` to enable TypeScript inference:

```typescript
type InferControlValue<C> =
  C extends { type: 'slider' | 'numeric' | 'seed' } ? number :
  C extends { type: 'toggle' } ? boolean :
  C extends { type: 'dropdown'; options: readonly { value: infer V }[] } ? V :
  C extends { type: 'point2d' | 'vector' } ? { x: number; y: number } :
  C extends { type: 'rectangle' } ? { x: number; y: number; width: number; height: number } :
  never;

type InferValues<Schema extends ControlSchema> = {
  [C in Schema[number] as C['id']]: InferControlValue<C>;
};
```

This ensures:
- Dropdown values are literal unions (e.g., `'solid' | 'dashed'`), not `string`
- Full autocomplete in `draw(values)` function
- Type errors if accessing non-existent control IDs

## UI Layout

Split pane layout:
- **Left**: Live SVG preview, updates on any value change
- **Right**: Control panel with:
  - Artwork selector dropdown (lists all `art/*.ts` files)
  - Control list with dirty indicators (click label to edit)
  - "+" button to add new controls
  - "Export" button to copy schema to clipboard
  - Reset button to restore all file defaults

**Header** (top):
- App title
- Artwork selector
- Canvas size controls (width × height with unit, preset dropdown, reset)
- Reset All and Copy URL buttons

## Key Workflows

### Artist Workflow

1. Create new file `art/my-piece.ts` with standard exports
2. Run `npm run dev` to start Vite
3. Select artwork in browser dropdown
4. Edit code in VS Code → HMR updates preview instantly
5. Tweak values in browser control panel
6. When happy, click Save to persist (clipboard or sidecar JSON)
7. Paste/commit values back to the `.ts` file

### Adding a Control (in browser)

1. Click "+" button in the control panel header
2. Select control type from dropdown
3. Fill in: ID (variable name), label, type-specific options, default
4. Click "Add" → control appears in panel
5. Click "Export" to copy TypeScript schema to clipboard

### Editing a Control

1. Click on any control's label (cursor changes to pointer)
2. Dialog opens with current control settings
3. Modify any field: ID, label, type, options, default
4. Click "Save" to apply changes

### Deleting a Control

1. Click on the control's label to open editor
2. Click "Delete" button (bottom-left of dialog)
3. Control is removed from the panel

### Exporting Controls

Click the "Export" button in the control panel header to copy the full TypeScript schema to your clipboard:

```typescript
export const controls = [
  { type: 'slider', id: 'lineWidth', label: 'Line Width', min: 0.1, max: 5, default: 1 },
  { type: 'seed', id: 'seed', label: 'Seed', default: 12345 },
  // ...
] as const satisfies ControlSchema;
```

Paste this directly into your artwork file to persist UI-created controls.

### Export Format

When saving/exporting, generate TypeScript:

```typescript
export const controls = [
  { type: 'slider', id: 'lineWidth', label: 'Line Width', min: 0.1, max: 5, default: 1.2 },
  // ...
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export const defaults: Values = {
  lineWidth: 1.2,
  // ...
};
```

## Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { saveValuesPlugin } from './src/vite-plugins/save-values';

export default defineConfig({
  plugins: [saveValuesPlugin()],
});
```

The `saveValuesPlugin` provides a dev server endpoint for writing values to sidecar JSON files.

## Design Principles

1. **TypeScript-first**: Strong typing throughout, no `any`, full inference
2. **File is truth**: The `.ts` file is the canonical source; browser state is ephemeral
3. **Minimal friction**: HMR for instant feedback, localStorage for session persistence
4. **Portable artwork**: Each artwork file is self-contained and runnable outside the playground
5. **No over-engineering**: Vanilla TS/HTML/CSS, no framework dependencies
6. **Local-only**: No server, no auth, no deployment concerns

## Versioning and Changelog

This project follows [Semantic Versioning](https://semver.org/) and maintains a changelog using the [Keep a Changelog](https://keepachangelog.com/) format.

### Updating the Changelog

When making changes to the codebase, document them in `CHANGELOG.md` under the `[Unreleased]` section. Group changes into these categories:

- **Added** — new features
- **Changed** — changes to existing functionality
- **Deprecated** — features that will be removed in future versions
- **Removed** — features that have been removed
- **Fixed** — bug fixes
- **Security** — vulnerability fixes

Example entry:
```markdown
## [Unreleased]

### Added

- New color picker control type
```

### Semantic Versioning

When releasing a new version, move items from `[Unreleased]` to a new version section and update `package.json`:

- **MAJOR** (x.0.0) — breaking changes that require users to modify their artwork files
- **MINOR** (0.x.0) — new features that are backwards-compatible (new control types, new exports, etc.)
- **PATCH** (0.0.x) — backwards-compatible bug fixes

### Release Process

1. Move `[Unreleased]` entries to a new version section with today's date
2. Update `version` in `package.json` to match
3. Commit with message: `chore: Release vX.Y.Z`

## Future Considerations

- SVG export for plotter (download button)
- Undo/redo for value changes
- Conditional control visibility (show control B only if control A is true)
- Control grouping (collapsible sections)
- Preset management UI (save/load named presets)
- Multiple artboards/variants
- Control reordering via drag-and-drop
- Color picker control type
