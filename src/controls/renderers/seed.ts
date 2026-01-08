import type { SeedControl } from '../schema';
import type { ControlChangeHandler } from './types';

export function renderSeed(
  control: SeedControl,
  value: number,
  onChange: ControlChangeHandler
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-seed';

  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = '0';
  input.max = '2147483647';

  const randomBtn = document.createElement('button');
  randomBtn.className = 'seed-randomize';
  randomBtn.textContent = '\u{1F3B2}'; // 🎲
  randomBtn.title = 'Randomize seed';
  randomBtn.type = 'button';

  input.addEventListener('change', () => {
    const newValue = parseInt(input.value, 10);
    if (!isNaN(newValue)) {
      onChange(control.id, newValue);
    }
  });

  randomBtn.addEventListener('click', () => {
    const newSeed = Math.floor(Math.random() * 2147483647);
    input.value = String(newSeed);
    onChange(control.id, newSeed);
  });

  container.append(input, randomBtn);
  return container;
}
