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

## Generative Utils Library

This project includes [`@johnfmorton/generative-utils`](https://github.com/johnfmorton/generative-utils), a collection of utility functions designed for generative art. The library provides seeded randomness, curves, vector math, spatial sampling, and more.

### Example Artworks

Seven example artworks demonstrate how to use the generative-utils functions. Each example focuses on a specific category of utilities:

| Artwork | Functions Demonstrated |
|---------|------------------------|
| `gu-random-study.ts` | `seedPRNG`, `random`, `randomBias`, `randomSnap` — Compare uniform, biased, and snapped random distributions |
| `gu-value-mapping.ts` | `map`, `lerp`, `clamp` — Smooth transitions and value interpolation |
| `gu-shapes.ts` | `polygon`, `star`, `pointsToPath`, `distToSegment` — Regular polygons, stars, and distance calculations |
| `gu-spatial.ts` | `poissonDisc` — Evenly-distributed point sampling with organic mesh connections |
| `gu-spline-paths.ts` | `spline`, `pointsInPath`, `pointsToPath` — Smooth Catmull-Rom curves and path point extraction |
| `gu-vectors.ts` | `vec2.*` (22 functions) — Vector math with particle physics visualization |
| `gu-grids.ts` | `createNoiseGrid`, `createQtGrid`, `createVoronoiDiagram` — Procedural grids and Voronoi tessellation |

### Using Generative Utils

Import functions directly from the library:

```typescript
import { seedPRNG, random, spline, map, vec2 } from '@johnfmorton/generative-utils';

export function draw(values: Values, canvas: CanvasConfig): SVGElement {
  // Seed the PRNG for reproducibility (use instead of createRandom)
  seedPRNG(values.seed.toString());

  // Generate random values
  const x = random(0, 100);           // Uniform random
  const y = randomBias(0, 100, 50, 0.7); // Biased toward 50

  // Create smooth curves from points
  const pathString = spline(points, 0.5, false);

  // Vector math
  const velocity = vec2.fromAngle(angle, speed);
  const reflected = vec2.reflect(velocity, normal);

  // ...
}
```

> **Note**: When using generative-utils, call `seedPRNG(seed)` at the start of your draw function instead of `createRandom()`. Both approaches ensure reproducible randomness, but generative-utils functions use their own shared PRNG.

### Function Reference

**Random Generation**
- `seedPRNG(seed)` — Seed the random number generator
- `random(min, max)` or `random(array)` — Uniform random number or array pick
- `randomBias(min, max, bias, influence)` — Random weighted toward a value
- `randomSnap(min, max, snapInc)` — Random snapped to intervals

**Value Mapping**
- `map(n, inMin, inMax, outMin, outMax)` — Remap value between ranges
- `lerp(a, b, t)` — Linear interpolation
- `clamp(value, min, max)` — Constrain to range

**Curves & Paths**
- `spline(points, tension, close)` — Smooth Catmull-Rom spline as SVG path
- `pointsInPath(svgPath, count)` — Extract points along an SVG path
- `pointsToPath(points, close)` — Convert points to SVG path string

**Shapes**
- `polygon({sides, radius, cx, cy, rotation})` — Regular polygon vertices
- `star({points, outerRadius, innerRadius, cx, cy, rotation})` — Star vertices

**Spatial**
- `poissonDisc({width, height, radius})` — Evenly-distributed points

**Grids & Voronoi**
- `createNoiseGrid({width, height, resolution, xInc, yInc})` — Simplex noise grid
- `createQtGrid({width, height, points, maxQtLevels})` — Quadtree adaptive grid
- `createVoronoiDiagram({width, height, points, relaxIterations})` — Voronoi cells

**Vector Math (`vec2.*`)**
- `create`, `add`, `subtract`, `multiply`, `divide`
- `magnitude`, `normalize`, `distance`
- `dot`, `cross`, `rotate`, `rotateAround`
- `fromAngle`, `angle`, `angleBetween`
- `perpendicular`, `reflect`, `limit`, `setMagnitude`, `vecLerp`

**Distance**
- `distToSegment(point, v, w)` — Distance from point to line segment

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
