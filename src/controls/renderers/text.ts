import type { TextControl } from '../schema';
import type { ControlChangeHandler } from './types';

/**
 * A single-line text input. The value is reported on change (blur or
 * Enter) rather than per keystroke, so an artwork that sends its text
 * to Secondhand Cursive fetches the finished words, not every prefix.
 */
export function renderText(
  control: TextControl,
  value: string,
  onChange: ControlChangeHandler,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-text';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.autocomplete = 'off';
  if (control.placeholder) input.placeholder = control.placeholder;

  input.addEventListener('change', () => {
    onChange(control.id, input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
  });

  container.appendChild(input);
  return container;
}
