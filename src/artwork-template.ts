/**
 * Shared artwork file template generator.
 *
 * Single source of truth for generated art/*.ts files, used by both the
 * CLI scaffolder (scripts/new-artwork.ts) and the in-browser "New
 * Artwork" wizard. Pure module — no Node or DOM APIs — so it runs under
 * tsx and in the browser alike.
 *
 * Generated files must pass the project's strict tsc run (noUnusedLocals
 * over art/), so helper groups emit commented example blocks (including
 * their commented import line) rather than live unused imports. Only
 * symbols the starter drawing actually uses are imported live.
 */

import type {
  CanvasConfig,
  ControlDefinition,
  SeedControl,
} from './controls/schema';

export type ArtworkApi = 'svgjs' | 'raw';

export type HelperGroupId =
  | 'gu-randomness'
  | 'gu-mapping'
  | 'gu-splines'
  | 'gu-shapes'
  | 'gu-spatial'
  | 'gu-grids'
  | 'gu-vectors'
  | 'pkg-simplex-noise'
  | 'pkg-polygon-clipping'
  | 'pkg-bezier';

export interface HelperGroup {
  id: HelperGroupId;
  /** Short name shown next to the checkbox / CLI choice. */
  label: string;
  /** One-line description of what the group is for. */
  hint: string;
  /** Package the symbols come from. */
  pkg: string;
  /** Key symbols the example block demonstrates. */
  symbols: readonly string[];
}

export const HELPER_GROUPS: readonly HelperGroup[] = [
  {
    id: 'gu-randomness',
    label: 'Randomness',
    hint: 'Seeded random ranges, biased values, snapping',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['seedPRNG', 'random', 'randomBias', 'randomSnap'],
  },
  {
    id: 'gu-mapping',
    label: 'Value mapping',
    hint: 'Remap, interpolate, and clamp number ranges',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['map', 'lerp', 'clamp'],
  },
  {
    id: 'gu-splines',
    label: 'Splines & paths',
    hint: 'Smooth curves through points, path conversions',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['spline', 'pointsToPath', 'pointsInPath'],
  },
  {
    id: 'gu-shapes',
    label: 'Shapes',
    hint: 'Polygon and star point generators',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['polygon', 'star', 'pointsToPath'],
  },
  {
    id: 'gu-spatial',
    label: 'Spatial sampling',
    hint: 'Evenly-spread random points (Poisson disc)',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['poissonDisc'],
  },
  {
    id: 'gu-grids',
    label: 'Grids',
    hint: 'Noise grids, quadtrees, and Voronoi tessellations',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['createNoiseGrid', 'createQtGrid', 'createVoronoiDiagram'],
  },
  {
    id: 'gu-vectors',
    label: 'Vector math',
    hint: '2D vector operations (vec2)',
    pkg: '@johnfmorton/generative-utils',
    symbols: ['vec2'],
  },
  {
    id: 'pkg-simplex-noise',
    label: 'Flow-field noise',
    hint: 'Seedable 2D/3D simplex noise for flow fields and textures',
    pkg: 'simplex-noise',
    symbols: ['createNoise2D'],
  },
  {
    id: 'pkg-polygon-clipping',
    label: 'Polygon clipping',
    hint: 'Boolean ops (union/intersect/difference) for occlusion and hatching',
    pkg: 'polygon-clipping',
    symbols: ['polygonClipping'],
  },
  {
    id: 'pkg-bezier',
    label: 'Curve math',
    hint: 'Split, measure, and offset Bézier curves for multi-pass strokes',
    pkg: 'bezier-js',
    symbols: ['Bezier'],
  },
];

export interface ArtworkTemplateOptions {
  title: string;
  description?: string;
  canvas: CanvasConfig;
  api: ArtworkApi;
  helpers?: readonly HelperGroupId[];
  /** Controls for the generated schema; usually includes a seed control. */
  controls: readonly ControlDefinition[];
}

/** Validate an artwork filename (kebab-case, no extension). */
export function isValidArtworkName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

/** Normalize raw input into an artwork filename. */
export function normalizeArtworkName(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '-').replace(/\.ts$/, '');
}

/** Derive a Title Case title from a kebab-case filename. */
export function titleFromName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The standard seed control included in generated artworks. */
export function makeSeedControl(defaultSeed: number): SeedControl {
  return { type: 'seed', id: 'seed', label: 'Seed', default: defaultSeed };
}

/** Escape a string for use inside a single-quoted TS literal. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Collapse whitespace/newlines for one-line contexts (meta strings). */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Serialize one control definition as TypeScript source.
 */
function controlToTypeScript(control: ControlDefinition): string {
  const desc = control.description
    ? `\n    description: '${esc(control.description)}',`
    : '';
  const base = `    type: '${control.type}',\n    id: '${control.id}',\n    label: '${esc(control.label)}',${desc}`;

  switch (control.type) {
    case 'slider': {
      const step = control.step !== undefined ? `\n    step: ${control.step},` : '';
      return `  {\n${base}\n    min: ${control.min},\n    max: ${control.max},${step}\n    default: ${control.default},\n  }`;
    }
    case 'numeric': {
      let extras = '';
      if (control.min !== undefined) extras += `\n    min: ${control.min},`;
      if (control.max !== undefined) extras += `\n    max: ${control.max},`;
      if (control.step !== undefined) extras += `\n    step: ${control.step},`;
      return `  {\n${base}${extras}\n    default: ${control.default},\n  }`;
    }
    case 'toggle':
      return `  {\n${base}\n    default: ${control.default},\n  }`;
    case 'dropdown': {
      const opts = control.options
        .map((o) => `      { value: '${esc(o.value)}', label: '${esc(o.label)}' }`)
        .join(',\n');
      return `  {\n${base}\n    options: [\n${opts},\n    ],\n    default: '${esc(control.default)}',\n  }`;
    }
    case 'seed':
      return `  {\n${base}\n    default: ${control.default},\n  }`;
    case 'point2d':
    case 'vector':
      return `  {\n${base}\n    default: { x: ${control.default.x}, y: ${control.default.y} },\n  }`;
    case 'rectangle':
      return `  {\n${base}\n    default: { x: ${control.default.x}, y: ${control.default.y}, width: ${control.default.width}, height: ${control.default.height} },\n  }`;
  }
}

/**
 * Serialize a full controls block, e.g. for writing back into an
 * artwork file. Also used by the Export button and the file template.
 */
export function generateControlsBlock(
  controls: readonly ControlDefinition[]
): string {
  if (controls.length === 0) {
    return 'export const controls = [] as const satisfies ControlSchema;';
  }
  const body = controls.map(controlToTypeScript).join(',\n');
  return `export const controls = [\n${body},\n] as const satisfies ControlSchema;`;
}

/**
 * Serialize the `const { ... } = values;` line that opens draw(), making
 * every control value available as a local. Empty string when there are
 * no controls.
 */
export function generateValuesDestructure(
  controls: readonly ControlDefinition[]
): string {
  if (controls.length === 0) return '';
  return `const { ${controls.map((c) => c.id).join(', ')} } = values;`;
}

/** A minimal text edit: replace [from, to) with insert. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/**
 * Compute the edits that keep draw()'s values destructure in sync with
 * the controls — the counterpart to generateControlsBlock when writing
 * control changes back into an artwork file. Returns non-overlapping
 * edits against `source`; empty when nothing needs to change or draw()
 * can't be found.
 */
export function computeValuesDestructureEdits(
  source: string,
  controls: readonly ControlDefinition[]
): TextEdit[] {
  const edits: TextEdit[] = [];
  const line = generateValuesDestructure(controls);

  // The first destructure from `values` — the one the template places at
  // the top of draw(). May span multiple lines after Prettier wraps it.
  const destructure = /const\s*\{[^}]*\}\s*=\s*values\s*;/.exec(source);
  const signature = /export function draw\s*\((_?values)\b[^)]*\)[^{]*\{/.exec(
    source
  );

  if (line === '') {
    // Last control removed: drop the destructure and mark the values
    // parameter unused so noUnusedParameters stays happy.
    if (destructure) {
      const lineStart = source.lastIndexOf('\n', destructure.index) + 1;
      let end = destructure.index + destructure[0].length;
      if (source[end] === '\n') end += 1;
      edits.push({ from: lineStart, to: end, insert: '' });
    }
    if (signature && signature[1] === 'values') {
      const paramStart = signature.index + signature[0].indexOf('values');
      edits.push({ from: paramStart, to: paramStart, insert: '_' });
    }
    return edits;
  }

  if (destructure) {
    if (destructure[0] !== line) {
      edits.push({
        from: destructure.index,
        to: destructure.index + destructure[0].length,
        insert: line,
      });
    }
  } else if (signature) {
    // No destructure yet: make it the first statement of draw().
    const bodyStart = signature.index + signature[0].length;
    edits.push({ from: bodyStart, to: bodyStart, insert: `\n  ${line}\n` });
  }

  if (signature && signature[1] === '_values') {
    const paramStart = signature.index + signature[0].indexOf('_values');
    edits.push({ from: paramStart, to: paramStart + 1, insert: '' });
  }

  return edits;
}

/** How the generated draw() obtains randomness. */
type SeedMode =
  | { kind: 'gu'; seedId: string } // seedPRNG + gen-utils random()
  | { kind: 'project'; seedId: string } // createRandom from src/random
  | { kind: 'none' }; // no seed control → fixed values

interface TemplateContext {
  api: ArtworkApi;
  seedMode: SeedMode;
}

/**
 * Commented example block for a selected helper group.
 * Includes its own commented import line so uncommenting is one step,
 * without tripping noUnusedLocals in the meantime.
 */
function helperBlock(id: HelperGroupId, ctx: TemplateContext): string[] {
  const group = HELPER_GROUPS.find((g) => g.id === id)!;
  const c = (line: string) => (line ? `  // ${line}` : '  //');
  const lines: string[] = [`  // --- ${group.label} (${group.pkg}) ---`];

  // Reminder for groups whose functions consume the library's shared
  // PRNG, when the file isn't already seeding it.
  const seedNote =
    ctx.seedMode.kind === 'gu'
      ? []
      : ctx.seedMode.kind === 'project'
        ? [
            `import { seedPRNG } from '@johnfmorton/generative-utils';`,
            `seedPRNG(${ctx.seedMode.seedId}.toString()); // this helper uses the library's own PRNG`,
          ]
        : [`import { seedPRNG } from '@johnfmorton/generative-utils';`];

  const drawPath = (dVar: string): string[] =>
    ctx.api === 'svgjs'
      ? [`draw.path(${dVar}).fill('none').stroke('#000');`]
      : [
          `const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');`,
          `path.setAttribute('d', ${dVar});`,
          `path.setAttribute('fill', 'none');`,
          `path.setAttribute('stroke', '#000');`,
          `svg.appendChild(path);`,
        ];

  switch (id) {
    case 'gu-randomness':
      // seedPRNG/random are imported live in this mode; show the extras.
      lines.push(
        c(`import { randomBias, randomSnap } from '@johnfmorton/generative-utils';`),
        c(`const clustered = randomBias(0, width, width / 2); // values cluster near the bias point`),
        c(`const stepped = randomSnap(0, 360, 15); // random angle snapped to 15° increments`)
      );
      break;
    case 'gu-mapping':
      lines.push(
        c(`import { map, lerp, clamp } from '@johnfmorton/generative-utils';`),
        c(`const y = map(3, 0, 10, 0, height); // remap 0-10 → canvas height`),
        c(`const mid = lerp(0, width, 0.5); // interpolate between two values`),
        c(`const safe = clamp(y, 0, height); // keep a value in range`)
      );
      break;
    case 'gu-splines':
      lines.push(
        c(`import { spline } from '@johnfmorton/generative-utils';`),
        c(`const pts = [`),
        c(`  { x: width * 0.2, y: height * 0.5 },`),
        c(`  { x: width * 0.5, y: height * 0.3 },`),
        c(`  { x: width * 0.8, y: height * 0.5 },`),
        c(`];`),
        c(`const d = spline(pts, 1, false); // smooth curve through points`),
        ...drawPath('d').map(c)
      );
      break;
    case 'gu-shapes':
      lines.push(
        c(`import { polygon, pointsToPath } from '@johnfmorton/generative-utils';`),
        c(`const hex = polygon({ sides: 6, radius: width * 0.2, cx: width / 2, cy: height / 2 });`),
        c(`const d = pointsToPath(hex); // also: star({ points, outerRadius, innerRadius })`),
        ...drawPath('d').map(c)
      );
      break;
    case 'gu-spatial':
      lines.push(
        c(`import { poissonDisc } from '@johnfmorton/generative-utils';`),
        ...seedNote.map(c),
        c(`const points = poissonDisc({ width, height, radius: 40 }); // evenly-spread points`),
        ...(ctx.api === 'svgjs'
          ? [c(`points.forEach((p) => draw.circle(4).cx(p.x).cy(p.y).fill('none').stroke('#000'));`)]
          : [c(`// draw each { x, y } point, e.g. as small circles`)])
      );
      break;
    case 'gu-grids':
      lines.push(
        c(`import { createNoiseGrid } from '@johnfmorton/generative-utils';`),
        ...seedNote.map(c),
        c(`const grid = createNoiseGrid({ width, height, resolution: 12 });`),
        c(`grid.cells.forEach((cell) => { /* cell.x, cell.y, cell.noiseValue */ });`),
        c(`// also: createVoronoiDiagram({ width, height, points }), createQtGrid(...)`)
      );
      break;
    case 'gu-vectors':
      lines.push(
        c(`import { vec2 } from '@johnfmorton/generative-utils';`),
        c(`const v = vec2.fromAngle(Math.PI / 4, 100); // direction + magnitude`),
        c(`const w = vec2.add(v, vec2.create(10, 0)); // add, rotate, normalize, lerp, ...`)
      );
      break;
    case 'pkg-simplex-noise':
      lines.push(
        c(`import { createNoise2D } from 'simplex-noise';`),
        ...(ctx.seedMode.kind === 'project'
          ? [c(`const noise2D = createNoise2D(random); // seeded with this artwork's PRNG`)]
          : ctx.seedMode.kind === 'gu'
            ? [
                c(`import { createRandom } from '../src/random';`),
                c(`const noise2D = createNoise2D(createRandom(${ctx.seedMode.seedId})); // seeded`),
              ]
            : [c(`const noise2D = createNoise2D(); // pass a seeded PRNG for reproducibility`)]),
        c(`const n = noise2D(width * 0.005, height * 0.005); // -1..1, sample per coordinate`)
      );
      break;
    case 'pkg-polygon-clipping':
      lines.push(
        c(`import polygonClipping from 'polygon-clipping';`),
        c(`const a: [number, number][][] = [[[0, 0], [width, 0], [width, height], [0, height]]];`),
        c(`const b: [number, number][][] = [[[50, 50], [width - 50, 50], [width / 2, height - 50]]];`),
        c(`const clipped = polygonClipping.intersection(a, b); // also union, difference, xor`),
        c(`// Great for occlusion culling and clipping hatch lines to shapes.`)
      );
      break;
    case 'pkg-bezier':
      lines.push(
        c(`import { Bezier } from 'bezier-js';`),
        c(`const curve = new Bezier(0, height / 2, width / 2, 0, width, height / 2);`),
        c(`const points = curve.getLUT(50); // points along the curve`),
        c(`const offset = curve.offset(10); // parallel curve(s) for multi-pass strokes`)
      );
      break;
  }

  return lines;
}

/**
 * Generate the full source of a new artwork file.
 */
export function generateArtworkSource(options: ArtworkTemplateOptions): string {
  const { title, canvas, api, controls } = options;
  const helpers = options.helpers ?? [];
  const description = options.description ? oneLine(options.description) : '';

  const seedControl = controls.find((c) => c.type === 'seed');
  const seedMode: SeedMode = seedControl
    ? helpers.includes('gu-randomness')
      ? { kind: 'gu', seedId: seedControl.id }
      : { kind: 'project', seedId: seedControl.id }
    : { kind: 'none' };
  const ctx: TemplateContext = { api, seedMode };

  // --- Imports ---
  const imports: string[] = [
    `import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';`,
    `import { canvasToPixels } from '../src/controls/schema';`,
  ];
  if (seedMode.kind === 'project') {
    imports.splice(1, 0, `import { createRandom } from '../src/random';`);
  }
  if (seedMode.kind === 'gu') {
    imports.push(`import { seedPRNG, random } from '@johnfmorton/generative-utils';`);
  }
  imports.push(
    api === 'svgjs'
      ? `import { createCanvas } from '../src/svg-utils';`
      : `import { createRawCanvas } from '../src/svg-utils';`
  );

  // --- draw() body ---
  const body: string[] = [];

  const ids = controls.map((c) => c.id);
  if (ids.length > 0) {
    body.push(`  ${generateValuesDestructure(controls)}`, '');
  }

  if (seedMode.kind === 'gu') {
    body.push(`  seedPRNG(${seedMode.seedId}.toString());`);
  } else if (seedMode.kind === 'project') {
    body.push(`  const random = createRandom(${seedMode.seedId});`);
  }
  body.push(`  const { width, height } = canvasToPixels(canvasConfig);`);
  body.push(
    api === 'svgjs'
      ? `  const { svg, draw } = createCanvas(canvasConfig);`
      : `  const svg = createRawCanvas(canvasConfig);`
  );
  body.push('');

  // Starter shape: a centered circle (stroke only — plotter-friendly).
  // The seed drives the radius so the seed control demonstrably works.
  const radiusExpr =
    seedMode.kind === 'gu'
      ? `random(0.15, 0.3) * Math.min(width, height)`
      : seedMode.kind === 'project'
        ? `(0.15 + random() * 0.15) * Math.min(width, height)`
        : `0.25 * Math.min(width, height)`;
  body.push(`  // A starter shape — replace with your drawing code`);
  body.push(`  const radius = ${radiusExpr};`);
  if (api === 'svgjs') {
    body.push(
      `  draw`,
      `    .circle(radius * 2)`,
      `    .cx(width / 2)`,
      `    .cy(height / 2)`,
      `    .fill('none')`,
      `    .stroke({ color: '#000', width: 1 });`
    );
  } else {
    body.push(
      `  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');`,
      `  circle.setAttribute('cx', String(width / 2));`,
      `  circle.setAttribute('cy', String(height / 2));`,
      `  circle.setAttribute('r', String(radius));`,
      `  circle.setAttribute('fill', 'none');`,
      `  circle.setAttribute('stroke', '#000');`,
      `  circle.setAttribute('stroke-width', '1');`,
      `  svg.appendChild(circle);`
    );
  }

  // Keep non-seed control values "used" so noUnusedLocals passes until
  // the artist wires them into the drawing.
  const seedUsed = seedMode.kind !== 'none';
  const unusedIds = ids.filter((id) => !(seedUsed && id === seedControl?.id));
  if (unusedIds.length > 0) {
    body.push(
      '',
      `  // Remove once these values are used in your drawing`,
      `  console.log({ ${unusedIds.join(', ')} });`
    );
  }

  for (const helperId of helpers) {
    body.push('', ...helperBlock(helperId, ctx));
  }

  body.push('', `  return svg;`);

  // --- Assemble file ---
  const descLine = description ? `\n * ${description}` : '';
  const descExport = description ? `\n  description: '${esc(description)}',` : '';
  const valuesParam = ids.length > 0 ? 'values' : '_values';

  return `/**
 * ${oneLine(title)}${descLine}
 */

${imports.join('\n')}

export const meta = {
  title: '${esc(oneLine(title))}',${descExport}
};

export const canvas: CanvasConfig = {
  width: ${canvas.width},
  height: ${canvas.height},
  unit: '${canvas.unit}',
};

${generateControlsBlock(controls)}

export type Values = InferValues<typeof controls>;

export function draw(${valuesParam}: Values, canvasConfig: CanvasConfig): SVGElement {
${body.join('\n')}
}
`;
}
