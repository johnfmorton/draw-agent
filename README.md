# Draw Agent

A web-based coding playground for creating generative art with pen plotters like the AxiDraw. Write TypeScript artwork files, tweak parameters in real-time, and export SVGs ready for plotting.

## Features

- **Live Preview** — See your artwork update instantly as you edit code or adjust controls
- **Type-Safe Controls** — Define strongly-typed parameters (sliders, toggles, dropdowns, 2D points, etc.)
- **Physical Units** — Configure canvas size in inches, millimeters, or centimeters for precise plotter output
- **Shareable URLs** — Every parameter state is encoded in the URL for easy bookmarking and sharing
- **Seeded Randomness** — Reproducible random generation ensures the same seed always produces the same artwork
- **Hot Module Reloading** — Edit your TypeScript files and see changes without losing your parameter tweaks
- **SVG.js Integration** — Optional chainable API for cleaner SVG generation (or use raw DOM)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Clone or download this repository
cd draw-agent

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open http://localhost:5173 in your browser.

## Creating Artwork

Artwork files live in the `art/` directory. Each file exports a few things:

```typescript
// art/my-artwork.ts
import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { createRandom } from '../src/random';
import { createCanvas } from '../src/svg-utils';

// Metadata (optional)
export const meta = {
  title: 'My Artwork',
  description: 'A brief description',
};

// Canvas size in physical units (optional, defaults to 8.5 × 11 inches)
export const canvas: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',  // 'in' | 'mm' | 'cm' | 'px'
};

// Define your controls
export const controls = [
  { type: 'slider', id: 'lineCount', label: 'Lines', min: 1, max: 100, default: 20 },
  { type: 'seed', id: 'seed', label: 'Seed', default: 12345 },
  { type: 'toggle', id: 'filled', label: 'Filled', default: false },
] as const satisfies ControlSchema;

// TypeScript will infer the correct types for your values
export type Values = InferValues<typeof controls>;

// The draw function receives current values and canvas config
export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  const { lineCount, seed, filled } = values;
  const random = createRandom(seed);  // Always use seeded random!

  // Create canvas with SVG.js
  const { svg, draw } = createCanvas(canvas);

  // Use SVG.js chainable API
  for (let i = 0; i < lineCount; i++) {
    draw.circle(random() * 50)
      .cx(random() * canvas.width)
      .cy(random() * canvas.height)
      .fill(filled ? 'black' : 'none')
      .stroke({ color: 'black', width: 0.5 });
  }

  return svg;
}
```

See the `art/` folder for complete examples:
- `grid-pattern.ts` and `flow-field.ts` — use **SVG.js** for cleaner code
- `spiral-study.ts` — uses **raw DOM** as an alternative approach

## SVG.js vs Raw DOM

You can choose between two approaches for generating SVG:

### SVG.js (Recommended)

```typescript
import { createCanvas } from '../src/svg-utils';

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  const { svg, draw } = createCanvas(canvas);

  // Chainable, readable API
  draw.circle(100).cx(50).cy(50).fill('none').stroke({ color: '#000', width: 0.5 });
  draw.line(0, 0, 100, 100).stroke('black');
  draw.path('M 0 0 L 50 50 Q 100 0 100 50').fill('none').stroke('black');

  // Groups for shared styles
  const group = draw.group().stroke({ color: 'red', width: 2 }).fill('none');
  group.rect(50, 50).move(10, 10);
  group.rect(50, 50).move(70, 70);

  return svg;
}
```

### Raw DOM (No Dependencies)

```typescript
import { createRawCanvas } from '../src/svg-utils';

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  const svg = createRawCanvas(canvas);

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '50');
  circle.setAttribute('cy', '50');
  circle.setAttribute('r', '100');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', '#000');
  svg.appendChild(circle);

  return svg;
}
```

## Control Types

| Type | Description | Value Type |
|------|-------------|------------|
| `slider` | Range slider with min/max/step | `number` |
| `numeric` | Number input field | `number` |
| `toggle` | On/off switch | `boolean` |
| `dropdown` | Select from options | Union of option values |
| `seed` | Number with randomize button | `number` |
| `point2d` | X/Y coordinates with optional pad | `{ x, y }` |
| `vector` | Direction/magnitude | `{ x, y }` |
| `rectangle` | Position and size | `{ x, y, width, height }` |

## Using the Interface

### Header Controls

- **Artwork Selector** — Switch between artwork files in the `art/` directory
- **Canvas Size** — Adjust width, height, and units; use presets for common paper sizes
- **Reset** — Restore all values to file defaults
- **Copy URL** — Copy the current state URL to clipboard for sharing

### Control Panel

- **Adjust Values** — Use sliders, inputs, and toggles to tweak parameters
- **Dirty Indicators** — Modified values are highlighted; shows the file default
- **Reset Individual** — Click the ↩ button to reset a single control
- **Edit Controls** — Click a control's label to edit or delete it
- **Add Control** — Click + to add new controls via the UI
- **Export** — Copy the control schema as TypeScript to paste into your file

### Keyboard Shortcuts

- Sliders respond to arrow keys when focused
- Tab through controls for quick adjustments

## Seeded Randomness

**Important**: Never use `Math.random()` in your artwork. Instead, use the seeded PRNG:

```typescript
import { createRandom } from '../src/random';

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  const random = createRandom(values.seed);

  // Use random() instead of Math.random()
  const angle = random() * Math.PI * 2;
  const radius = random() * 50;
  // ...
}
```

This ensures that sharing a URL with a specific seed will always produce the exact same output.

## URL State

All parameters are stored in the URL hash:

```
http://localhost:5173/#artwork=spiral-study&cw=8.5&ch=11&cu=in&lineCount=42&seed=98765
```

This means you can:
- Bookmark specific parameter combinations
- Share exact artwork states with others
- Use browser back/forward to navigate through changes

## Building for Production

```bash
npm run build
```

Output will be in the `dist/` directory.

## Project Structure

```
draw-agent/
├── art/                  # Your artwork files go here
├── src/
│   ├── main.ts           # App entry point
│   ├── random.ts         # Seeded PRNG
│   ├── svg-utils.ts      # SVG.js helpers (createCanvas, createRawCanvas)
│   ├── controls/         # Control system
│   └── styles/           # CSS
├── index.html
└── package.json
```

## License

MIT
