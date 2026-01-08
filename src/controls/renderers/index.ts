import type { ControlDefinition } from '../schema';
import type { ControlChangeHandler } from './types';
import { renderSlider } from './slider';
import { renderToggle } from './toggle';
import { renderDropdown } from './dropdown';
import { renderSeed } from './seed';
import { renderNumeric } from './numeric';
import { renderPoint2D } from './point2d';
import { renderVector } from './vector';
import { renderRectangle } from './rectangle';

export type { ControlChangeHandler };

type ControlRenderer = (
  control: ControlDefinition,
  value: unknown,
  onChange: ControlChangeHandler
) => HTMLElement;

const renderers: Record<string, ControlRenderer> = {
  slider: renderSlider as ControlRenderer,
  toggle: renderToggle as ControlRenderer,
  dropdown: renderDropdown as ControlRenderer,
  seed: renderSeed as ControlRenderer,
  numeric: renderNumeric as ControlRenderer,
  point2d: renderPoint2D as ControlRenderer,
  vector: renderVector as ControlRenderer,
  rectangle: renderRectangle as ControlRenderer,
};

/**
 * Render a control based on its type.
 */
export function renderControl(
  control: ControlDefinition,
  value: unknown,
  onChange: ControlChangeHandler
): HTMLElement {
  const renderer = renderers[control.type];
  if (!renderer) {
    const fallback = document.createElement('div');
    fallback.className = 'control control-unknown';
    fallback.textContent = `Unknown control type: ${control.type}`;
    return fallback;
  }
  return renderer(control, value, onChange);
}
