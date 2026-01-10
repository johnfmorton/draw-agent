#!/usr/bin/env tsx
/**
 * Interactive CLI script to create a new artwork file.
 * Run with: npm run new
 */

import { input, select, confirm, number } from '@inquirer/prompts';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Types for controls
interface BaseControl {
  type: string;
  id: string;
  label: string;
}

interface SliderControl extends BaseControl {
  type: 'slider';
  min: number;
  max: number;
  step?: number;
  default: number;
}

interface NumericControl extends BaseControl {
  type: 'numeric';
  min?: number;
  max?: number;
  step?: number;
  default: number;
}

interface ToggleControl extends BaseControl {
  type: 'toggle';
  default: boolean;
}

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownControl extends BaseControl {
  type: 'dropdown';
  options: DropdownOption[];
  default: string;
}

interface SeedControl extends BaseControl {
  type: 'seed';
  default: number;
}

interface Point2DControl extends BaseControl {
  type: 'point2d';
  default: { x: number; y: number };
}

interface VectorControl extends BaseControl {
  type: 'vector';
  default: { x: number; y: number };
}

interface RectangleControl extends BaseControl {
  type: 'rectangle';
  default: { x: number; y: number; width: number; height: number };
}

type Control =
  | SliderControl
  | NumericControl
  | ToggleControl
  | DropdownControl
  | SeedControl
  | Point2DControl
  | VectorControl
  | RectangleControl;

// Helper to convert label to camelCase ID
function labelToId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

// Validate control ID
function isValidId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(id);
}

// Validate filename
function isValidFilename(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

// Generate destructuring statement for all controls
function generateValuesDestructuring(controls: Control[]): string {
  if (controls.length === 0) {
    return '';
  }
  const ids = controls.map((c) => c.id);
  return `  const { ${ids.join(', ')} } = values;`;
}

// Generate control definition as TypeScript
function controlToTypeScript(control: Control): string {
  const base = `    type: '${control.type}',\n    id: '${control.id}',\n    label: '${control.label}',`;

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
        .map((o) => `      { value: '${o.value}', label: '${o.label}' }`)
        .join(',\n');
      return `  {\n${base}\n    options: [\n${opts},\n    ],\n    default: '${control.default}',\n  }`;
    }
    case 'seed':
      return `  {\n${base}\n    default: ${control.default},\n  }`;
    case 'point2d':
      return `  {\n${base}\n    default: { x: ${control.default.x}, y: ${control.default.y} },\n  }`;
    case 'vector':
      return `  {\n${base}\n    default: { x: ${control.default.x}, y: ${control.default.y} },\n  }`;
    case 'rectangle':
      return `  {\n${base}\n    default: { x: ${control.default.x}, y: ${control.default.y}, width: ${control.default.width}, height: ${control.default.height} },\n  }`;
  }
}

// Prompt for a slider control
async function promptSliderControl(id: string, label: string): Promise<SliderControl> {
  const min = (await number({ message: 'Min value:', default: 0 })) ?? 0;
  const max = (await number({ message: 'Max value:', default: 100 })) ?? 100;
  const stepInput = await input({ message: 'Step (leave empty for auto):', default: '' });
  const step = stepInput ? parseFloat(stepInput) : undefined;
  const defaultVal = (await number({ message: 'Default value:', default: (min + max) / 2 })) ?? (min + max) / 2;

  return { type: 'slider', id, label, min, max, step, default: defaultVal };
}

// Prompt for a numeric control
async function promptNumericControl(id: string, label: string): Promise<NumericControl> {
  const minInput = await input({ message: 'Min value (leave empty for none):', default: '' });
  const maxInput = await input({ message: 'Max value (leave empty for none):', default: '' });
  const stepInput = await input({ message: 'Step (leave empty for auto):', default: '' });
  const defaultVal = (await number({ message: 'Default value:', default: 0 })) ?? 0;

  return {
    type: 'numeric',
    id,
    label,
    min: minInput ? parseFloat(minInput) : undefined,
    max: maxInput ? parseFloat(maxInput) : undefined,
    step: stepInput ? parseFloat(stepInput) : undefined,
    default: defaultVal,
  };
}

// Prompt for a toggle control
async function promptToggleControl(id: string, label: string): Promise<ToggleControl> {
  const defaultVal = await confirm({ message: 'Default value:', default: false });
  return { type: 'toggle', id, label, default: defaultVal };
}

// Prompt for a dropdown control
async function promptDropdownControl(id: string, label: string): Promise<DropdownControl> {
  const options: DropdownOption[] = [];

  console.log('\nAdd dropdown options (at least 2 required):');
  let addMore = true;
  while (addMore || options.length < 2) {
    const value = await input({ message: `Option ${options.length + 1} value:` });
    const optLabel = await input({ message: `Option ${options.length + 1} label:`, default: value });
    options.push({ value, label: optLabel });

    if (options.length >= 2) {
      addMore = await confirm({ message: 'Add another option?', default: false });
    }
  }

  const defaultVal = await select({
    message: 'Default option:',
    choices: options.map((o) => ({ name: o.label, value: o.value })),
  });

  return { type: 'dropdown', id, label, options, default: defaultVal };
}

// Prompt for a seed control
async function promptSeedControl(id: string, label: string): Promise<SeedControl> {
  const randomDefault = Math.floor(Math.random() * 2147483647);
  const defaultVal = (await number({ message: 'Default seed:', default: randomDefault })) ?? randomDefault;
  return { type: 'seed', id, label, default: defaultVal };
}

// Prompt for a point2d control
async function promptPoint2DControl(id: string, label: string): Promise<Point2DControl> {
  const x = (await number({ message: 'Default X:', default: 0 })) ?? 0;
  const y = (await number({ message: 'Default Y:', default: 0 })) ?? 0;
  return { type: 'point2d', id, label, default: { x, y } };
}

// Prompt for a vector control
async function promptVectorControl(id: string, label: string): Promise<VectorControl> {
  const x = (await number({ message: 'Default X:', default: 0 })) ?? 0;
  const y = (await number({ message: 'Default Y:', default: 0 })) ?? 0;
  return { type: 'vector', id, label, default: { x, y } };
}

// Prompt for a rectangle control
async function promptRectangleControl(id: string, label: string): Promise<RectangleControl> {
  const x = (await number({ message: 'Default X:', default: 0 })) ?? 0;
  const y = (await number({ message: 'Default Y:', default: 0 })) ?? 0;
  const width = (await number({ message: 'Default width:', default: 100 })) ?? 100;
  const height = (await number({ message: 'Default height:', default: 100 })) ?? 100;
  return { type: 'rectangle', id, label, default: { x, y, width, height } };
}

// Prompt for any control type
// Default labels for each control type
const defaultLabels: Record<string, string> = {
  slider: 'Value',
  numeric: 'Number',
  toggle: 'Enabled',
  dropdown: 'Option',
  seed: 'Seed',
  point2d: 'Position',
  vector: 'Direction',
  rectangle: 'Bounds',
};

// Convert ID to title case for label fallback
function idToLabel(id: string): string {
  return id
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

async function promptControl(): Promise<Control> {
  const type = await select({
    message: 'Control type:',
    choices: [
      { name: 'Slider (range input)', value: 'slider' },
      { name: 'Numeric (number input)', value: 'numeric' },
      { name: 'Toggle (boolean)', value: 'toggle' },
      { name: 'Dropdown (select)', value: 'dropdown' },
      { name: 'Seed (randomness)', value: 'seed' },
      { name: 'Point2D (x, y)', value: 'point2d' },
      { name: 'Vector (direction)', value: 'vector' },
      { name: 'Rectangle (x, y, w, h)', value: 'rectangle' },
    ],
  });

  const defaultLabel = defaultLabels[type] || 'Control';
  const labelInput = await input({ message: 'Label (display name):', default: defaultLabel });
  const label = labelInput.trim() || defaultLabel;

  const suggestedId = labelToId(label);
  const id = await input({
    message: 'ID (variable name):',
    default: suggestedId,
    validate: (val) => (isValidId(val) ? true : 'ID must start with a letter and contain only alphanumeric characters'),
  });

  switch (type) {
    case 'slider':
      return promptSliderControl(id, label);
    case 'numeric':
      return promptNumericControl(id, label);
    case 'toggle':
      return promptToggleControl(id, label);
    case 'dropdown':
      return promptDropdownControl(id, label);
    case 'seed':
      return promptSeedControl(id, label);
    case 'point2d':
      return promptPoint2DControl(id, label);
    case 'vector':
      return promptVectorControl(id, label);
    case 'rectangle':
      return promptRectangleControl(id, label);
    default:
      throw new Error(`Unknown control type: ${type}`);
  }
}

// Generate the artwork file content
function generateFileContent(
  title: string,
  description: string,
  width: number,
  height: number,
  unit: string,
  useSvgJs: boolean,
  controls: Control[]
): string {
  const controlsTs = controls.map(controlToTypeScript).join(',\n');
  const valuesDestructuring = generateValuesDestructuring(controls);

  // Find the seed control ID (if any)
  const seedControl = controls.find((c) => c.type === 'seed');
  // If seed control exists, use the destructured variable; otherwise fallback to values.seed
  const seedRef = seedControl ? seedControl.id : 'values.seed';

  const svgImport = useSvgJs
    ? "import { createCanvas } from '../src/svg-utils';"
    : "import { createRawCanvas } from '../src/svg-utils';";

  const svgSetup = useSvgJs
    ? '  const { svg, draw } = createCanvas(canvasConfig);'
    : '  const svg = createRawCanvas(canvasConfig);';

  // Generate console.log with all control values (using destructured variables)
  const controlIds = controls.map((c) => c.id);
  const consoleLogLine = controlIds.length > 0
    ? `  console.log({ ${controlIds.join(', ')}, width, height });`
    : `  console.log({ width, height });`;

  const todoComment = useSvgJs
    ? `  // TODO: Add your drawing code here
  // Example: draw.circle(50).cx(width / 2).cy(height / 2).fill('none').stroke('black');
${consoleLogLine}`
    : `  // TODO: Add your drawing code here
  // Example:
  // const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  // circle.setAttribute('cx', String(width / 2));
  // circle.setAttribute('cy', String(height / 2));
  // circle.setAttribute('r', '50');
  // circle.setAttribute('fill', 'none');
  // circle.setAttribute('stroke', 'black');
  // svg.appendChild(circle);
${consoleLogLine}`;

  const descLine = description ? `\n * ${description}` : '';
  const descExport = description ? `\n  description: '${description.replace(/'/g, "\\'")}',` : '';

  return `/**
 * ${title}${descLine}
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { createRandom } from '../src/random';
import { canvasToPixels } from '../src/controls/schema';
${svgImport}

export const meta = {
  title: '${title.replace(/'/g, "\\'")}',${descExport}
};

export const canvas: CanvasConfig = {
  width: ${width},
  height: ${height},
  unit: '${unit}',
};

export const controls = [
${controlsTs}
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
${valuesDestructuring}

  const random = createRandom(${seedRef});
  const { width, height } = canvasToPixels(canvasConfig);
${svgSetup}

${todoComment}

  return svg;
}
`;
}

// Main function
async function main() {
  console.log('\n=== Create New Artwork ===\n');

  // Get project root (one level up from scripts/)
  const projectRoot = join(import.meta.dirname, '..');
  const artDir = join(projectRoot, 'art');

  // 1. Filename
  const rawFilename = await input({
    message: 'Filename (without .ts):',
    validate: (val) => {
      const normalized = val.toLowerCase().replace(/\s+/g, '-').replace(/\.ts$/, '');
      if (!isValidFilename(normalized)) {
        return 'Filename must contain only lowercase letters, numbers, and hyphens';
      }
      const filepath = join(artDir, `${normalized}.ts`);
      if (existsSync(filepath)) {
        return `File already exists: ${filepath}`;
      }
      return true;
    },
    transformer: (val) => val.toLowerCase().replace(/\s+/g, '-').replace(/\.ts$/, ''),
  });
  const filename = rawFilename.toLowerCase().replace(/\s+/g, '-').replace(/\.ts$/, '');

  // 2. Title (default from filename)
  const defaultTitle = filename
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const title = await input({ message: 'Title:', default: defaultTitle });

  // 3. Description (optional)
  const description = await input({ message: 'Description (optional):', default: '' });

  // 4-6. Canvas configuration
  const width = (await number({ message: 'Canvas width:', default: 8.5 })) ?? 8.5;
  const height = (await number({ message: 'Canvas height:', default: 11 })) ?? 11;
  const unit = await select({
    message: 'Unit:',
    choices: [
      { name: 'Inches (in)', value: 'in' },
      { name: 'Millimeters (mm)', value: 'mm' },
      { name: 'Centimeters (cm)', value: 'cm' },
      { name: 'Pixels (px)', value: 'px' },
    ],
    default: 'in',
  });

  // 7. SVG approach
  const useSvgJs = await select({
    message: 'SVG generation approach:',
    choices: [
      { name: 'SVG.js (recommended - chainable API)', value: true },
      { name: 'Raw DOM (vanilla, no dependencies)', value: false },
    ],
    default: true,
  });

  // 8. Controls
  const controls: Control[] = [];
  console.log('\n--- Add Controls ---');
  console.log('(You can add controls now, or skip and add them later in the browser)\n');

  let addControls = await confirm({ message: 'Add a control?', default: true });
  while (addControls) {
    const control = await promptControl();
    controls.push(control);
    console.log(`\nAdded: ${control.type} "${control.label}" (${control.id})\n`);
    addControls = await confirm({ message: 'Add another control?', default: false });
  }

  // Ensure there's a seed control if using randomness
  const hasSeed = controls.some((c) => c.type === 'seed');
  if (!hasSeed) {
    const addSeed = await confirm({
      message: 'No seed control added. Add one for reproducible randomness?',
      default: true,
    });
    if (addSeed) {
      controls.push({
        type: 'seed',
        id: 'seed',
        label: 'Seed',
        default: Math.floor(Math.random() * 2147483647),
      });
      console.log('\nAdded: seed "Seed" (seed)\n');
    }
  }

  // 9. Generate file
  const content = generateFileContent(title, description, width, height, unit, useSvgJs, controls);
  const filepath = join(artDir, `${filename}.ts`);

  writeFileSync(filepath, content, 'utf-8');

  console.log('\n=== Success! ===');
  console.log(`Created: ${filepath}`);
  console.log('\nNext steps:');
  console.log('1. Run "npm run dev" to start the dev server');
  console.log(`2. Select "${title}" from the artwork dropdown`);
  console.log('3. Edit the draw() function to create your artwork\n');
}

main().catch(console.error);
