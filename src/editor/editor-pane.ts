/**
 * In-browser code editor pane (CodeMirror 6).
 *
 * Edits the actual art/*.ts file on disk through the art-files Vite
 * plugin: save (Cmd+S) formats with Prettier and writes the file, and
 * Vite HMR re-renders the preview. The file stays the source of truth.
 *
 * The EditorView lives on `window` and survives main.ts re-executing on
 * every HMR update (which happens on every save) — otherwise each save
 * would reset cursor, scroll, and undo history. Keymaps and the update
 * listener dispatch through `window.__drawAgentEditor.ctl`, which each
 * module run replaces with fresh functions.
 */

import { basicSetup } from 'codemirror';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import type { SaveResponse } from '../vite-plugins/art-files';
import type { ControlDefinition } from '../controls/schema';
import { computeValuesDestructureEdits } from '../artwork-template';

export type ControlsBlockResult =
  | 'saved'
  | 'save-failed'
  | 'no-match'
  | 'unavailable';

export interface EditorPaneApi {
  /** Load an artwork's source into the editor. */
  setArtwork(name: string): Promise<void>;
  /** Called when a file in art/ changed on disk (HMR websocket event). */
  handleExternalChange(name: string): Promise<void>;
  /** Returns false if the user wants to keep unsaved changes. */
  confirmDiscard(): boolean;
  /**
   * Replace the `export const controls = [...]` block in the current
   * document with the given code, keep draw()'s values destructure in
   * sync when `controls` is provided, then save the file.
   */
  updateControlsBlock(
    code: string,
    controls?: readonly ControlDefinition[]
  ): Promise<ControlsBlockResult>;
}

interface EditorCtl extends EditorPaneApi {
  save(): Promise<boolean>;
  formatDoc(): Promise<void>;
  onUpdate(update: ViewUpdate): void;
}

interface EditorShared {
  view: EditorView;
  artworkName: string;
  /** The content we believe is currently on disk. */
  savedContent: string;
  /** False when the dev-server endpoint is unreachable (e.g. vite preview). */
  available: boolean;
  ctl: EditorCtl | null;
}

declare global {
  interface Window {
    __drawAgentEditor?: EditorShared;
  }
}

const COLLAPSED_KEY = 'draw-agent:editor-collapsed';
const WIDTH_KEY = 'draw-agent:editor-width';
const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 520;

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--bg-primary)',
  },
  '.cm-gutters': { backgroundColor: 'var(--bg-primary)' },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
});

/**
 * Extensions dispatch through window.__drawAgentEditor.ctl so behavior
 * stays current across HMR re-runs without recreating the view.
 */
function baseExtensions(): Extension[] {
  return [
    basicSetup,
    javascript({ typescript: true }),
    indentUnit.of('  '),
    keymap.of([indentWithTab]),
    Prec.high(
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            void window.__drawAgentEditor?.ctl?.save();
            return true;
          },
        },
        {
          key: 'Shift-Alt-f',
          run: () => {
            void window.__drawAgentEditor?.ctl?.formatDoc();
            return true;
          },
        },
      ])
    ),
    oneDark,
    editorTheme,
    EditorView.updateListener.of((update) => {
      window.__drawAgentEditor?.ctl?.onUpdate(update);
    }),
  ];
}

interface EditorRefs {
  strip: HTMLElement;
  collapseBtn: HTMLButtonElement;
  filename: HTMLElement;
  status: HTMLElement;
  formatBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  conflict: HTMLElement;
  conflictLoad: HTMLButtonElement;
  conflictKeep: HTMLButtonElement;
  cmHost: HTMLElement;
  unavailable: HTMLElement;
}

/**
 * Query existing editor DOM; null if not built (or structure changed).
 */
function getRefs(container: HTMLElement): EditorRefs | null {
  const q = (selector: string) => container.querySelector<HTMLElement>(selector);
  const strip = q('.editor-collapsed-strip');
  const collapseBtn = q('.editor-collapse');
  const filename = q('.editor-filename');
  const status = q('.editor-status');
  const formatBtn = q('.editor-format-btn');
  const saveBtn = q('.editor-save-btn');
  const conflict = q('.editor-conflict');
  const conflictLoad = q('.editor-conflict-load');
  const conflictKeep = q('.editor-conflict-keep');
  const cmHost = q('.editor-cm');
  const unavailable = q('.editor-unavailable');

  if (
    !strip ||
    !collapseBtn ||
    !filename ||
    !status ||
    !formatBtn ||
    !saveBtn ||
    !conflict ||
    !conflictLoad ||
    !conflictKeep ||
    !cmHost ||
    !unavailable
  ) {
    return null;
  }

  return {
    strip,
    collapseBtn: collapseBtn as HTMLButtonElement,
    filename,
    status,
    formatBtn: formatBtn as HTMLButtonElement,
    saveBtn: saveBtn as HTMLButtonElement,
    conflict,
    conflictLoad: conflictLoad as HTMLButtonElement,
    conflictKeep: conflictKeep as HTMLButtonElement,
    cmHost,
    unavailable,
  };
}

function buildDom(container: HTMLElement): EditorRefs {
  container.innerHTML = '';

  // Narrow strip shown when the pane is collapsed
  const strip = document.createElement('div');
  strip.className = 'editor-collapsed-strip';
  strip.title = 'Show code editor';
  const stripLabel = document.createElement('span');
  stripLabel.textContent = 'Code ›';
  strip.appendChild(stripLabel);

  const body = document.createElement('div');
  body.className = 'editor-body';

  const header = document.createElement('div');
  header.className = 'editor-header';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'editor-collapse';
  collapseBtn.textContent = '‹';
  collapseBtn.title = 'Hide code editor';

  const filename = document.createElement('span');
  filename.className = 'editor-filename';

  const dirtyDot = document.createElement('span');
  dirtyDot.className = 'editor-dirty-dot';
  dirtyDot.textContent = '●';
  dirtyDot.title = 'Unsaved changes';

  const status = document.createElement('span');
  status.className = 'editor-status';

  const actions = document.createElement('div');
  actions.className = 'editor-actions';

  const formatBtn = document.createElement('button');
  formatBtn.className = 'editor-format-btn';
  formatBtn.textContent = 'Format';
  formatBtn.title = 'Format with Prettier (Shift+Alt+F)';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'editor-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.title = 'Format and save to disk (Cmd+S)';

  actions.appendChild(formatBtn);
  actions.appendChild(saveBtn);

  header.appendChild(collapseBtn);
  header.appendChild(filename);
  header.appendChild(dirtyDot);
  header.appendChild(status);
  header.appendChild(actions);

  const conflict = document.createElement('div');
  conflict.className = 'editor-conflict';
  const conflictMsg = document.createElement('span');
  conflictMsg.className = 'editor-conflict-msg';
  conflictMsg.textContent = 'File changed on disk.';
  const conflictLoad = document.createElement('button');
  conflictLoad.className = 'editor-conflict-load';
  conflictLoad.textContent = 'Load disk version';
  const conflictKeep = document.createElement('button');
  conflictKeep.className = 'editor-conflict-keep';
  conflictKeep.textContent = 'Keep mine';
  conflict.appendChild(conflictMsg);
  conflict.appendChild(conflictLoad);
  conflict.appendChild(conflictKeep);

  const cmHost = document.createElement('div');
  cmHost.className = 'editor-cm';

  const unavailable = document.createElement('div');
  unavailable.className = 'editor-unavailable';
  unavailable.textContent =
    'The code editor needs the Vite dev server (npm run dev).';
  unavailable.style.display = 'none';

  body.appendChild(header);
  body.appendChild(conflict);
  body.appendChild(cmHost);
  body.appendChild(unavailable);

  container.appendChild(strip);
  container.appendChild(body);

  return {
    strip,
    collapseBtn,
    filename,
    status,
    formatBtn,
    saveBtn,
    conflict,
    conflictLoad,
    conflictKeep,
    cmHost,
    unavailable,
  };
}

async function fetchSource(name: string): Promise<string | null> {
  try {
    const res = await fetch(`/__art/${encodeURIComponent(name)}`);
    const type = res.headers.get('content-type') ?? '';
    // Without the plugin (build/preview), Vite's SPA fallback returns HTML
    if (!res.ok || !type.includes('text/plain')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? text;
}

export function initEditorPane(
  container: HTMLElement,
  resizer: HTMLElement
): EditorPaneApi {
  let refs = getRefs(container);
  if (!refs) {
    refs = buildDom(container);
  }
  const r = refs;

  let shared = window.__drawAgentEditor;
  if (!shared) {
    const view = new EditorView({
      state: EditorState.create({ doc: '', extensions: baseExtensions() }),
      parent: r.cmHost,
    });
    shared = window.__drawAgentEditor = {
      view,
      artworkName: '',
      savedContent: '',
      available: true,
      ctl: null,
    };
  } else if (!r.cmHost.contains(shared.view.dom)) {
    // DOM was rebuilt (editor code changed); re-attach the live view
    r.cmHost.appendChild(shared.view.dom);
  }
  const s = shared;
  const view = s.view;

  let statusTimer: number | undefined;

  function setStatus(text: string, kind: '' | 'ok' | 'err' = '', title = '') {
    r.status.textContent = text;
    r.status.title = title;
    r.status.classList.toggle('is-ok', kind === 'ok');
    r.status.classList.toggle('is-err', kind === 'err');
    window.clearTimeout(statusTimer);
    if (text && kind !== 'err') {
      statusTimer = window.setTimeout(() => {
        r.status.textContent = '';
      }, 2500);
    }
  }

  function isDirty(): boolean {
    return s.available && view.state.doc.toString() !== s.savedContent;
  }

  function refreshDirty(): void {
    container.classList.toggle('is-dirty', isDirty());
  }

  function replaceDoc(source: string): void {
    const cur = view.state;
    view.dispatch({
      changes: { from: 0, to: cur.doc.length, insert: source },
      selection: { anchor: Math.min(cur.selection.main.anchor, source.length) },
    });
  }

  function showConflict(): void {
    r.conflict.classList.add('is-visible');
  }

  function hideConflict(): void {
    r.conflict.classList.remove('is-visible');
  }

  function setAvailable(available: boolean): void {
    s.available = available;
    r.cmHost.style.display = available ? '' : 'none';
    r.unavailable.style.display = available ? 'none' : 'block';
    r.saveBtn.disabled = !available;
    r.formatBtn.disabled = !available;
    if (!available) {
      container.classList.remove('is-dirty');
      hideConflict();
    }
  }

  /**
   * Compare editor content against disk and reconcile:
   * same → mark clean; differs + editor clean → adopt disk version;
   * differs + editor dirty → surface a conflict bar.
   */
  async function syncFromDisk(name: string): Promise<void> {
    const source = await fetchSource(name);
    if (name !== s.artworkName) return;
    if (source === null) {
      setAvailable(false);
      return;
    }
    setAvailable(true);

    const doc = view.state.doc.toString();
    if (source === doc) {
      s.savedContent = source;
      refreshDirty();
      hideConflict();
      return;
    }
    if (doc === s.savedContent) {
      s.savedContent = source;
      replaceDoc(source);
      refreshDirty();
      hideConflict();
      setStatus('Reloaded from disk', 'ok');
    } else {
      s.savedContent = source;
      refreshDirty();
      showConflict();
    }
  }

  async function setArtwork(name: string): Promise<void> {
    r.filename.textContent = `art/${name}.ts`;

    // Same artwork (e.g. HMR re-run after our own save): keep the live
    // document, cursor, and undo history; just reconcile with disk.
    if (s.artworkName === name && s.available) {
      await syncFromDisk(name);
      return;
    }

    s.artworkName = name;
    const source = await fetchSource(name);
    if (name !== s.artworkName) return;
    if (source === null) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    s.savedContent = source;
    view.setState(EditorState.create({ doc: source, extensions: baseExtensions() }));
    hideConflict();
    refreshDirty();
    setStatus('');
  }

  async function handleExternalChange(name: string): Promise<void> {
    if (name !== s.artworkName) return;
    await syncFromDisk(name);
  }

  async function save(): Promise<boolean> {
    if (!s.artworkName || !s.available) return false;
    const content = view.state.doc.toString();
    setStatus('Saving…');
    try {
      const res = await fetch(`/__art/${encodeURIComponent(s.artworkName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: content,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SaveResponse;
      s.savedContent = data.source;
      if (data.source !== content) {
        replaceDoc(data.source);
      }
      refreshDirty();
      hideConflict();
      if (data.formatted) {
        setStatus('Saved', 'ok');
      } else {
        setStatus(
          'Saved (not formatted — syntax error)',
          'err',
          data.formatError ?? ''
        );
      }
      return true;
    } catch (e) {
      setStatus(
        `Save failed: ${e instanceof Error ? e.message : String(e)}`,
        'err'
      );
      return false;
    }
  }

  /**
   * Swap the controls block in the live document and save, so control
   * edits made in the UI land in the file (and its HMR reload). When
   * `controls` is provided, the `const { ... } = values;` line in draw()
   * is updated to match, so new control values are immediately usable.
   */
  async function updateControlsBlock(
    code: string,
    controls?: readonly ControlDefinition[]
  ): Promise<ControlsBlockResult> {
    if (!s.artworkName || !s.available) return 'unavailable';
    const doc = view.state.doc.toString();
    const match =
      /export const controls = \[[\s\S]*?\] as const satisfies ControlSchema;/.exec(
        doc
      );
    if (!match) return 'no-match';
    const changes = [
      { from: match.index, to: match.index + match[0].length, insert: code },
    ];
    if (controls) {
      changes.push(...computeValuesDestructureEdits(doc, controls));
    }
    view.dispatch({ changes });
    return (await save()) ? 'saved' : 'save-failed';
  }

  async function formatDoc(): Promise<void> {
    if (!s.artworkName || !s.available) return;
    const content = view.state.doc.toString();
    try {
      const res = await fetch(
        `/__art/${encodeURIComponent(s.artworkName)}?dry=1`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: content,
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as SaveResponse;
      if (!data.formatted) {
        setStatus(
          `Format error: ${firstLine(data.formatError ?? 'unknown')}`,
          'err',
          data.formatError ?? ''
        );
        return;
      }
      if (data.source !== content) {
        replaceDoc(data.source);
        refreshDirty();
        setStatus('Formatted', 'ok');
      } else {
        setStatus('Already formatted', 'ok');
      }
    } catch (e) {
      setStatus(
        `Format failed: ${e instanceof Error ? e.message : String(e)}`,
        'err'
      );
    }
  }

  function confirmDiscard(): boolean {
    if (!isDirty()) return true;
    return window.confirm(
      `Discard unsaved editor changes to art/${s.artworkName}.ts?`
    );
  }

  function onUpdate(update: ViewUpdate): void {
    if (update.docChanged) refreshDirty();
  }

  s.ctl = {
    setArtwork,
    handleExternalChange,
    confirmDiscard,
    updateControlsBlock,
    save,
    formatDoc,
    onUpdate,
  };

  // --- Collapse & resize ---

  function maxWidth(): number {
    return Math.round(window.innerWidth * 0.7);
  }

  function applyWidth(): void {
    if (container.classList.contains('is-collapsed')) {
      container.style.width = '';
      return;
    }
    const stored = Number(localStorage.getItem(WIDTH_KEY));
    const width =
      Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : DEFAULT_WIDTH;
    container.style.width = `${Math.min(width, maxWidth())}px`;
  }

  function setCollapsed(collapsed: boolean): void {
    container.classList.toggle('is-collapsed', collapsed);
    resizer.style.display = collapsed ? 'none' : '';
    applyWidth();
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }

  setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true');

  // Event handlers are assigned (not added) so HMR re-runs stay idempotent
  r.saveBtn.onclick = () => void save();
  r.formatBtn.onclick = () => void formatDoc();
  r.collapseBtn.onclick = () => setCollapsed(true);
  r.strip.onclick = () => setCollapsed(false);
  r.conflictLoad.onclick = () => {
    replaceDoc(s.savedContent);
    refreshDirty();
    hideConflict();
    setStatus('Loaded disk version', 'ok');
  };
  r.conflictKeep.onclick = () => hideConflict();

  resizer.onpointerdown = (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = container.getBoundingClientRect().width;
    resizer.classList.add('is-dragging');

    resizer.onpointermove = (ev) => {
      const width = Math.max(
        MIN_WIDTH,
        Math.min(maxWidth(), startWidth + (ev.clientX - startX))
      );
      container.style.width = `${width}px`;
    };
    resizer.onpointerup = (ev) => {
      resizer.classList.remove('is-dragging');
      resizer.onpointermove = null;
      resizer.onpointerup = null;
      resizer.releasePointerCapture(ev.pointerId);
      localStorage.setItem(
        WIDTH_KEY,
        String(Math.round(container.getBoundingClientRect().width))
      );
    };
  };

  return { setArtwork, handleExternalChange, confirmDiscard, updateControlsBlock };
}
