#!/usr/bin/env tsx
/**
 * Interactive CLI script to create a new artwork file.
 * Run with: npm run new
 *
 * File generation is shared with the in-browser "New Artwork" wizard
 * via src/artwork-template.ts — keep prompts here, templates there.
 */

import { input, select, confirm, number, checkbox } from '@inquirer/prompts';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import {
  generateArtworkSource,
  makeSeedControl,
  isValidArtworkName,
  normalizeArtworkName,
  titleFromName,
  HELPER_GROUPS,
  type ArtworkApi,
  type HelperGroupId,
} from '../src/artwork-template';
import type {
  ControlDefinition,
  SliderControl,
  NumericControl,
  ToggleControl,
  DropdownControl,
  DropdownOption,
  SeedControl,
  Point2DControl,
  VectorControl,
  RectangleControl,
  CanvasUnit,
} from '../src/controls/schema';

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

// Prompt for a slider control
async function promptSliderControl(id: string, label: string): Promise<SliderControl> {
  const min = (await number({ message: 'Min value:', default: 0 })) ?? 0;
  const max = (await number({ message: 'Max value:', default: 100 })) ?? 100;
  const stepInput = await input({ message: 'Step (leave empty for auto):', default: '' });
  const defaultVal = (await number({ message: 'Default value:', default: (min + max) / 2 })) ?? (min + max) / 2;

  const control: SliderControl = { type: 'slider', id, label, min, max, default: defaultVal };
  if (stepInput) control.step = parseFloat(stepInput);
  return control;
}

// Prompt for a numeric control
async function promptNumericControl(id: string, label: string): Promise<NumericControl> {
  const minInput = await input({ message: 'Min value (leave empty for none):', default: '' });
  const maxInput = await input({ message: 'Max value (leave empty for none):', default: '' });
  const stepInput = await input({ message: 'Step (leave empty for auto):', default: '' });
  const defaultVal = (await number({ message: 'Default value:', default: 0 })) ?? 0;

  const control: NumericControl = { type: 'numeric', id, label, default: defaultVal };
  if (minInput) control.min = parseFloat(minInput);
  if (maxInput) control.max = parseFloat(maxInput);
  if (stepInput) control.step = parseFloat(stepInput);
  return control;
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

async function promptControl(): Promise<ControlDefinition> {
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
      const normalized = normalizeArtworkName(val);
      if (!isValidArtworkName(normalized)) {
        return 'Filename must contain only lowercase letters, numbers, and hyphens';
      }
      const filepath = join(artDir, `${normalized}.ts`);
      if (existsSync(filepath)) {
        return `File already exists: ${filepath}`;
      }
      return true;
    },
    transformer: (val) => normalizeArtworkName(val),
  });
  const filename = normalizeArtworkName(rawFilename);

  // 2. Title (default from filename)
  const title = await input({ message: 'Title:', default: titleFromName(filename) });

  // 3. Description (optional)
  const description = await input({ message: 'Description (optional):', default: '' });

  // 4-6. Canvas configuration
  const width = (await number({ message: 'Canvas width:', default: 8.5 })) ?? 8.5;
  const height = (await number({ message: 'Canvas height:', default: 11 })) ?? 11;
  const unit = (await select({
    message: 'Unit:',
    choices: [
      { name: 'Inches (in)', value: 'in' },
      { name: 'Millimeters (mm)', value: 'mm' },
      { name: 'Centimeters (cm)', value: 'cm' },
      { name: 'Pixels (px)', value: 'px' },
    ],
    default: 'in',
  })) as CanvasUnit;

  // 7. SVG approach
  const api = (await select({
    message: 'SVG generation approach:',
    choices: [
      { name: 'SVG.js (recommended - chainable API)', value: 'svgjs' },
      { name: 'Raw DOM (vanilla, no dependencies)', value: 'raw' },
    ],
    default: 'svgjs',
  })) as ArtworkApi;

  // 8. Optional helpers
  const helpers = (await checkbox({
    message: 'Optional helpers to include as commented examples:',
    choices: HELPER_GROUPS.map((g) => ({
      name: `${g.label} — ${g.hint} (${g.pkg})`,
      value: g.id,
    })),
  })) as HelperGroupId[];

  // 9. Controls
  const controls: ControlDefinition[] = [];
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
      controls.push(makeSeedControl(Math.floor(Math.random() * 2147483647)));
      console.log('\nAdded: seed "Seed" (seed)\n');
    }
  }

  // 10. Generate file (Prettier-formatted, same as wizard-created files)
  const source = generateArtworkSource({
    title,
    canvas: { width, height, unit },
    api,
    helpers,
    controls,
    ...(description ? { description } : {}),
  });
  const filepath = join(artDir, `${filename}.ts`);
  const prettierConfig = await resolveConfig(filepath);
  const content = await format(source, {
    ...prettierConfig,
    parser: 'typescript',
  });

  writeFileSync(filepath, content, 'utf-8');

  console.log('\n=== Success! ===');
  console.log(`Created: ${filepath}`);
  console.log('\nNext steps:');
  console.log('1. Run "npm run dev" to start the dev server');
  console.log(`2. Select "${title}" from the artwork dropdown`);
  console.log('3. Edit the draw() function to create your artwork\n');
}

main().catch(console.error);
