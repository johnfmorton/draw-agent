/**
 * Control schema type definitions.
 * These types define the structure of control definitions used by artwork files.
 */

export type Point2D = { x: number; y: number };
export type Rectangle = { x: number; y: number; width: number; height: number };

/**
 * Canvas configuration for artwork dimensions.
 */
export type CanvasUnit = 'in' | 'mm' | 'cm' | 'px';

export interface CanvasConfig {
  width: number;
  height: number;
  unit: CanvasUnit;
}

/** Pixels per unit at 96 DPI (web standard) */
export const PIXELS_PER_UNIT: Record<CanvasUnit, number> = {
  px: 1,
  in: 96,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
};

/** Default canvas (US Letter) */
export const DEFAULT_CANVAS: CanvasConfig = {
  width: 8.5,
  height: 11,
  unit: 'in',
};

/** Common canvas presets */
export const CANVAS_PRESETS: Record<string, CanvasConfig> = {
  'US Letter': { width: 8.5, height: 11, unit: 'in' },
  'US Letter Landscape': { width: 11, height: 8.5, unit: 'in' },
  'A4': { width: 210, height: 297, unit: 'mm' },
  'A4 Landscape': { width: 297, height: 210, unit: 'mm' },
  'A3': { width: 297, height: 420, unit: 'mm' },
  'A3 Landscape': { width: 420, height: 297, unit: 'mm' },
  '6×6 in': { width: 6, height: 6, unit: 'in' },
  '8×8 in': { width: 8, height: 8, unit: 'in' },
  '12×12 in': { width: 12, height: 12, unit: 'in' },
};

/**
 * Convert canvas dimensions to pixels.
 */
export function canvasToPixels(canvas: CanvasConfig): { width: number; height: number } {
  const ppu = PIXELS_PER_UNIT[canvas.unit];
  return {
    width: canvas.width * ppu,
    height: canvas.height * ppu,
  };
}

/**
 * Format canvas dimensions for display.
 */
export function formatCanvasSize(canvas: CanvasConfig): string {
  const w = Number.isInteger(canvas.width) ? canvas.width : canvas.width.toFixed(1);
  const h = Number.isInteger(canvas.height) ? canvas.height : canvas.height.toFixed(1);
  return `${w} × ${h} ${canvas.unit}`;
}

type BaseControl<T extends string> = {
  type: T;
  id: string;
  label: string;
  description?: string;
};

export type SliderControl = BaseControl<'slider'> & {
  min: number;
  max: number;
  step?: number;
  default: number;
};

export type NumericControl = BaseControl<'numeric'> & {
  min?: number;
  max?: number;
  step?: number;
  default: number;
};

export type ToggleControl = BaseControl<'toggle'> & {
  default: boolean;
};

export type DropdownOption<T extends string = string> = {
  value: T;
  label: string;
};

export type DropdownControl<T extends string = string> = BaseControl<'dropdown'> & {
  options: readonly DropdownOption<T>[];
  default: T;
};

export type SeedControl = BaseControl<'seed'> & {
  default: number;
};

export type Point2DControl = BaseControl<'point2d'> & {
  default: Point2D;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
};

export type VectorControl = BaseControl<'vector'> & {
  default: Point2D;
  magnitude?: { min: number; max: number };
};

export type RectangleControl = BaseControl<'rectangle'> & {
  default: Rectangle;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
};

export type ControlDefinition =
  | SliderControl
  | NumericControl
  | ToggleControl
  | DropdownControl
  | SeedControl
  | Point2DControl
  | VectorControl
  | RectangleControl;

export type ControlSchema = readonly ControlDefinition[];

/**
 * Type inference utilities.
 * These allow TypeScript to infer the correct value types from a control schema.
 */

type InferControlValue<C> = C extends { type: 'slider' | 'numeric' | 'seed' }
  ? number
  : C extends { type: 'toggle' }
    ? boolean
    : C extends { type: 'dropdown'; options: readonly { value: infer V }[] }
      ? V
      : C extends { type: 'point2d' | 'vector' }
        ? Point2D
        : C extends { type: 'rectangle' }
          ? Rectangle
          : never;

export type InferValues<Schema extends ControlSchema> = {
  [C in Schema[number] as C['id']]: InferControlValue<C>;
};

/**
 * Extract default values from a control schema.
 */
export function getDefaults<S extends ControlSchema>(
  schema: S
): InferValues<S> {
  const defaults: Record<string, unknown> = {};
  for (const control of schema) {
    defaults[control.id] = control.default;
  }
  return defaults as InferValues<S>;
}

/**
 * Deep equality check for values (handles objects like Point2D, Rectangle).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (
      !keysB.includes(key) ||
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Format a value for display (handles complex types).
 */
export function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }
  if (typeof value === 'object' && value !== null) {
    if ('width' in value && 'height' in value) {
      const r = value as Rectangle;
      return `(${r.x}, ${r.y}, ${r.width}×${r.height})`;
    }
    if ('x' in value && 'y' in value) {
      const p = value as Point2D;
      return `(${p.x}, ${p.y})`;
    }
  }
  return String(value);
}
