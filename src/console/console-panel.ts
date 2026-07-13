/**
 * In-app console panel.
 *
 * Captures console.log/info/warn/error/debug, uncaught errors, and
 * unhandled promise rejections, and renders them in a collapsible panel
 * below the preview — so artists can debug without opening DevTools.
 *
 * State (entries, wrapped console methods) lives on `window` so it
 * survives main.ts re-executing on every HMR update.
 */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface ConsoleEntry {
  level: ConsoleLevel;
  text: string;
  count: number;
}

interface ConsoleState {
  entries: ConsoleEntry[];
  installed: boolean;
  /** Reassigned on each init so stale capture wrappers reach the live UI. */
  notify: (entry: ConsoleEntry, isRepeat: boolean) => void;
}

declare global {
  interface Window {
    __drawAgentConsole?: ConsoleState;
  }
}

const MAX_ENTRIES = 500;
const MAX_TEXT_LENGTH = 4000;
const COLLAPSED_KEY = 'draw-agent:console-collapsed';

const state: ConsoleState = (window.__drawAgentConsole ??= {
  entries: [],
  installed: false,
  notify: () => {},
});

/**
 * Format a single console argument as display text.
 */
function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  if (arg instanceof Element) return `<${arg.tagName.toLowerCase()}> element`;
  if (typeof arg === 'function') return `[function ${arg.name || '(anonymous)'}]`;
  if (
    arg === null ||
    arg === undefined ||
    typeof arg === 'number' ||
    typeof arg === 'boolean' ||
    typeof arg === 'bigint' ||
    typeof arg === 'symbol'
  ) {
    return String(arg);
  }
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(
      arg,
      (_key, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[circular]';
          seen.add(value);
        }
        return value;
      },
      2
    );
    return json ?? String(arg);
  } catch {
    return String(arg);
  }
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH)}… (truncated)`
    : text;
}

/**
 * Record an entry, merging consecutive duplicates into a ×N counter.
 */
function record(level: ConsoleLevel, args: unknown[]): void {
  const text = truncate(args.map(formatArg).join(' '));
  const last = state.entries[state.entries.length - 1];

  if (last && last.level === level && last.text === text) {
    last.count++;
    state.notify(last, true);
    return;
  }

  const entry: ConsoleEntry = { level, text, count: 1 };
  state.entries.push(entry);
  if (state.entries.length > MAX_ENTRIES) {
    state.entries.shift();
  }
  state.notify(entry, false);
}

/**
 * Wrap console methods and window error events. Install once per page;
 * safe to call again after HMR re-execution.
 */
export function installConsoleCapture(): void {
  if (state.installed) return;
  state.installed = true;

  const levels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of levels) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      record(level, args);
    };
  }

  window.addEventListener('error', (event) => {
    record('error', [event.error ?? event.message]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    record('error', ['Unhandled promise rejection:', event.reason]);
  });
}

/**
 * Build the console panel UI inside the given container.
 * Rebuilds from the persisted entry buffer, so HMR re-runs keep history.
 */
export function initConsolePanel(container: HTMLElement): void {
  container.innerHTML = '';
  container.classList.toggle(
    'is-collapsed',
    localStorage.getItem(COLLAPSED_KEY) === 'true'
  );

  const header = document.createElement('div');
  header.className = 'console-header';

  const chevron = document.createElement('span');
  chevron.className = 'console-chevron';
  header.appendChild(chevron);

  const title = document.createElement('span');
  title.className = 'console-title';
  title.textContent = 'Console';
  header.appendChild(title);

  const errorBadge = document.createElement('span');
  errorBadge.className = 'console-badge console-badge-error';
  header.appendChild(errorBadge);

  const warnBadge = document.createElement('span');
  warnBadge.className = 'console-badge console-badge-warn';
  header.appendChild(warnBadge);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'console-clear';
  clearBtn.textContent = 'Clear';
  header.appendChild(clearBtn);

  const entriesEl = document.createElement('div');
  entriesEl.className = 'console-entries';

  container.appendChild(header);
  container.appendChild(entriesEl);

  function updateBadges(): void {
    const errors = state.entries.reduce(
      (n, e) => n + (e.level === 'error' ? e.count : 0),
      0
    );
    const warns = state.entries.reduce(
      (n, e) => n + (e.level === 'warn' ? e.count : 0),
      0
    );
    errorBadge.textContent = errors > 0 ? String(errors) : '';
    warnBadge.textContent = warns > 0 ? String(warns) : '';
  }

  function renderEntry(entry: ConsoleEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = `console-entry console-${entry.level}`;

    const text = document.createElement('pre');
    text.className = 'console-text';
    text.textContent = entry.text;
    row.appendChild(text);

    const count = document.createElement('span');
    count.className = 'console-count';
    if (entry.count > 1) count.textContent = `×${entry.count}`;
    row.appendChild(count);

    return row;
  }

  function isAtBottom(): boolean {
    return (
      entriesEl.scrollHeight - entriesEl.scrollTop - entriesEl.clientHeight < 12
    );
  }

  // Rebuild from persisted buffer
  for (const entry of state.entries) {
    entriesEl.appendChild(renderEntry(entry));
  }
  entriesEl.scrollTop = entriesEl.scrollHeight;
  updateBadges();

  state.notify = (entry, isRepeat) => {
    const stick = isAtBottom();

    if (isRepeat) {
      const lastRow = entriesEl.lastElementChild;
      const count = lastRow?.querySelector('.console-count');
      if (count) count.textContent = `×${entry.count}`;
    } else {
      entriesEl.appendChild(renderEntry(entry));
      while (entriesEl.childElementCount > state.entries.length) {
        entriesEl.firstElementChild?.remove();
      }
    }

    if (stick) entriesEl.scrollTop = entriesEl.scrollHeight;
    updateBadges();
  };

  header.onclick = () => {
    const collapsed = container.classList.toggle('is-collapsed');
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  };

  clearBtn.onclick = (event) => {
    event.stopPropagation();
    state.entries.length = 0;
    entriesEl.innerHTML = '';
    updateBadges();
  };
}
