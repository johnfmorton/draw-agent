import type { RandomizerControl } from '../schema';
import type { ControlChangeHandler } from './types';
import { randomPhrase } from '../randomize';

/**
 * A phrase input with a 🎲 button. Reporting the phrase is all it does;
 * the app re-rolls the group when it sees a randomizer change. Enter
 * re-applies the current phrase even when unchanged, so a group that
 * was tweaked by hand can be rolled back to the phrase's values.
 */
export function renderRandomizer(
  control: RandomizerControl,
  value: string,
  onChange: ControlChangeHandler,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'control control-randomizer';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = 'phrase or number';
  input.spellcheck = false;
  input.autocomplete = 'off';

  const randomBtn = document.createElement('button');
  randomBtn.className = 'seed-randomize';
  randomBtn.textContent = '\u{1F3B2}'; // 🎲
  randomBtn.title = 'New phrase: re-roll every control in this group';
  randomBtn.type = 'button';

  let applied = value;
  const apply = () => {
    const phrase = input.value.trim();
    if (phrase === '') {
      input.value = applied;
      return;
    }
    input.value = phrase;
    applied = phrase;
    onChange(control.id, phrase);
  };

  input.addEventListener('change', () => {
    if (input.value.trim() !== applied) apply();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    }
  });
  randomBtn.addEventListener('click', () => {
    input.value = randomPhrase();
    apply();
  });

  container.append(input, randomBtn);
  return container;
}
