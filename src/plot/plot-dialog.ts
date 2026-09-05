/**
 * "Send to CursivePlotter" dialog.
 *
 * Queues the current artwork on the Secondhand Cursive plot queue (see
 * plot-client.ts) and then shows the job's status live. One overlay,
 * two views: the form (label, Preview or Plot, the export optimisation
 * options, whether the plot agent is online) and, once the server has
 * accepted a job, a status view that polls it while the dialog is
 * open. Closing the dialog never cancels a job — the queue is on the
 * server and CursivePlotter carries on.
 *
 * The SVG is built at submit time from the live preview, exactly as an
 * export would be, and only this dialog holds the string; it is
 * dropped on close.
 */

import { formatCanvasSize, type CanvasConfig } from '../controls/schema';
import type { ExportOptions } from '../export/svg-export';
import {
  createPlotClient,
  PlotApiError,
  type PlotClient,
  type PlotJob,
  type PlotMode,
} from './plot-client';

export interface PlotDialogOptions {
  artworkTitle: string;
  canvas: CanvasConfig;
  /** Default job label (the artwork's file name). */
  defaultLabel: string;
  /** Builds the SVG string from the live preview at submit time. */
  buildSvg: (options: ExportOptions) => string;
  /** Fired each time the server accepts a job (preview or plot). */
  onQueued?: (jobId: number, mode: PlotMode) => void;
  /** Injectable for tests; defaults to createPlotClient(). */
  client?: PlotClient;
}

const POLL_MS = 2000;
/** After a 429 — the plot-jobs throttle is generous, so this is rare. */
const POLL_BACKOFF_MS = 10_000;
const OPTIMIZE_KEY = 'draw-agent:plot-optimize';
const REVERSE_KEY = 'draw-agent:plot-reverse-strokes';

const STATUS_LABELS: Record<PlotJob['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
};

const FORM_HTML = `
  <h2>Send to CursivePlotter</h2>
  <p class="plot-summary"></p>

  <div class="dialog-field">
    <label for="plot-label">Label</label>
    <input type="text" id="plot-label" autocomplete="off" spellcheck="false" placeholder="artwork-name">
  </div>

  <div class="dialog-field">
    <label>Mode</label>
    <div class="checkbox-field">
      <input type="radio" name="plot-mode" id="plot-mode-preview" value="preview" checked>
      <label for="plot-mode-preview">Preview (estimate only, no ink)</label>
    </div>
    <div class="checkbox-field">
      <input type="radio" name="plot-mode" id="plot-mode-plot" value="plot">
      <label for="plot-mode-plot">Plot</label>
    </div>
  </div>

  <div class="dialog-field">
    <label>Optimization</label>
    <div class="checkbox-field">
      <input type="checkbox" id="plot-optimize">
      <label for="plot-optimize">Optimize path order for AxiDraw</label>
    </div>
    <div class="checkbox-field">
      <input type="checkbox" id="plot-reverse">
      <label for="plot-reverse">Allow stroke direction reversal</label>
    </div>
  </div>

  <p class="dialog-hint plot-agent">Checking plot agent…</p>
  <p class="dialog-hint is-error plot-error" hidden></p>

  <div class="dialog-actions">
    <div></div>
    <div class="dialog-actions-right">
      <button type="button" id="plot-cancel" class="dialog-btn-secondary">Cancel</button>
      <button type="button" id="plot-send" class="dialog-btn-primary">Send to plotter</button>
    </div>
  </div>
`;

const jobHtml = (jobId: number) => `
  <h2>Plot job #${jobId}</h2>
  <p class="plot-summary"></p>

  <div class="plot-status-row">
    <span class="plot-badge is-queued">Queued</span>
    <span class="dialog-hint plot-agent"></span>
  </div>
  <p class="plot-estimate" hidden></p>
  <pre class="plot-log"></pre>
  <p class="dialog-hint is-error plot-error" hidden></p>

  <div class="dialog-actions">
    <div><button type="button" class="dialog-btn-danger plot-cancel-job" hidden>Cancel job</button></div>
    <div class="dialog-actions-right">
      <button type="button" class="dialog-btn-secondary plot-close">Close</button>
      <button type="button" class="dialog-btn-primary plot-now" hidden>Plot now</button>
    </div>
  </div>
`;

/** The open dialog, if any: closed before another opens, and on HMR. */
let activeDialog: { close(): void } | null = null;
import.meta.hot?.dispose(() => activeDialog?.close());

type View =
  | { kind: 'form' }
  | {
      kind: 'job';
      jobId: number;
      label: string;
      /** Kept so "Plot now" re-sends exactly the bytes that were previewed. */
      svg: string;
      job: PlotJob | null;
    };

interface FormRefs {
  labelInput: HTMLInputElement;
  previewRadio: HTMLInputElement;
  plotRadio: HTMLInputElement;
  optimizeCb: HTMLInputElement;
  reverseCb: HTMLInputElement;
  agentEl: HTMLElement;
  errorEl: HTMLElement;
  sendBtn: HTMLButtonElement;
}

interface JobRefs {
  badge: HTMLElement;
  agentEl: HTMLElement;
  estimateEl: HTMLElement;
  logEl: HTMLElement;
  errorEl: HTMLElement;
  cancelBtn: HTMLButtonElement;
  plotNowBtn: HTMLButtonElement;
}

function describeError(e: unknown): string {
  if (e instanceof PlotApiError) {
    return e.status === 0
      ? 'Secondhand Cursive server unreachable — is the DDEV site running?'
      : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Default on, like the export dialog, unless explicitly turned off. */
function readPref(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // A convenience only; the send goes ahead regardless.
  }
}

function formatSeconds(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

function describeEstimate(job: PlotJob): string | null {
  const est = job.estimate;
  if (!est) return null;
  const parts: string[] = [];
  if (est.time_text) {
    parts.push(est.time_text);
  } else if (typeof est.seconds === 'number') {
    parts.push(formatSeconds(est.seconds));
  }
  if (typeof est.pendown_distance_m === 'number') {
    parts.push(`${est.pendown_distance_m.toFixed(2)} m pen-down`);
  }
  if (typeof est.total_distance_m === 'number') {
    parts.push(`${est.total_distance_m.toFixed(2)} m total travel`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function describeAgent(agent: PlotJob['agent']): string {
  if (!agent) return 'The server plots locally (no plot agent)';
  return agent.online
    ? `${agent.name ?? 'Plot agent'} online`
    : 'Plot agent offline — the job will wait in the queue';
}

function describeStatus(job: PlotJob): string {
  if (job.status === 'queued' && job.position !== null) {
    return `Queued · position ${job.position}`;
  }
  return STATUS_LABELS[job.status];
}

/**
 * Open the dialog. Resolves when it closes; queued jobs continue
 * server-side.
 */
export function openPlotDialog(options: PlotDialogOptions): Promise<void> {
  return new Promise((resolve) => {
    activeDialog?.close();

    const client = options.client ?? createPlotClient();

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'control-dialog plot-dialog';
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let view: View = { kind: 'form' };
    let closed = false;
    let pollTimer: number | null = null;
    let form: FormRefs | null = null;
    let jobRefs: JobRefs | null = null;

    const q = <T extends Element>(selector: string): T => {
      const el = dialog.querySelector<T>(selector);
      if (!el) throw new Error(`Plot dialog: missing ${selector}`);
      return el;
    };

    // ---- lifecycle -------------------------------------------------

    function stopPolling() {
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      stopPolling();
      document.removeEventListener('keydown', handleKeydown);
      overlay.remove();
      view = { kind: 'form' }; // drops the SVG string
      form = null;
      jobRefs = null;
      if (activeDialog === handle) activeDialog = null;
      resolve();
    }
    const handle = { close };
    activeDialog = handle;

    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
      } else if (
        e.key === 'Enter' &&
        form &&
        e.target === form.labelInput &&
        !form.sendBtn.disabled
      ) {
        void submit();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // ---- form view -------------------------------------------------

    function renderForm() {
      dialog.innerHTML = FORM_HTML;
      const refs: FormRefs = {
        labelInput: q('#plot-label'),
        previewRadio: q('#plot-mode-preview'),
        plotRadio: q('#plot-mode-plot'),
        optimizeCb: q('#plot-optimize'),
        reverseCb: q('#plot-reverse'),
        agentEl: q('.plot-agent'),
        errorEl: q('.plot-error'),
        sendBtn: q('#plot-send'),
      };
      form = refs;

      q('.plot-summary').textContent =
        `${options.artworkTitle} — ${formatCanvasSize(options.canvas)}`;
      refs.labelInput.value = options.defaultLabel;
      refs.optimizeCb.checked = readPref(OPTIMIZE_KEY);
      refs.reverseCb.checked = readPref(REVERSE_KEY);

      q<HTMLButtonElement>('#plot-cancel').addEventListener('click', close);
      refs.sendBtn.addEventListener('click', () => void submit());

      refs.labelInput.focus();
      refs.labelInput.select();
      void loadAgentStatus(refs);
    }

    async function loadAgentStatus(refs: FormRefs) {
      try {
        const { agent } = await client.listPlotJobs();
        if (closed || form !== refs) return;
        refs.agentEl.textContent = describeAgent(agent);
      } catch (e) {
        if (closed || form !== refs) return;
        refs.agentEl.textContent = '';
        showFormError(refs, describeError(e));
      }
    }

    function showFormError(refs: FormRefs, message: string | null) {
      refs.errorEl.textContent = message ?? '';
      refs.errorEl.hidden = !message;
    }

    function setBusy(refs: FormRefs, busy: boolean) {
      refs.sendBtn.disabled = busy;
      refs.sendBtn.textContent = busy ? 'Sending…' : 'Send to plotter';
    }

    async function submit() {
      const refs = form;
      if (!refs || refs.sendBtn.disabled) return;

      const label = refs.labelInput.value.trim();
      if (!label) {
        refs.labelInput.focus();
        return;
      }
      const mode: PlotMode = refs.plotRadio.checked ? 'plot' : 'preview';
      const exportOptions: ExportOptions = {
        optimize: refs.optimizeCb.checked,
        reverseStrokes: refs.reverseCb.checked,
      };
      writePref(OPTIMIZE_KEY, exportOptions.optimize);
      writePref(REVERSE_KEY, exportOptions.reverseStrokes);

      showFormError(refs, null);
      setBusy(refs, true);
      // Let "Sending…" paint before the synchronous SVG build.
      await new Promise<void>((r) => setTimeout(r, 0));
      if (closed) return;

      try {
        const svg = options.buildSvg(exportOptions);
        const { id } = await client.createPlotJob({ label, svg, mode });
        if (closed) return;
        options.onQueued?.(id, mode);
        view = { kind: 'job', jobId: id, label, svg, job: null };
        renderJob(mode);
        void pollOnce();
      } catch (e) {
        if (closed) return;
        setBusy(refs, false);
        showFormError(refs, describeError(e));
        // The server insists on a preview first; make that the choice.
        if (
          e instanceof PlotApiError &&
          e.status === 422 &&
          /preview/i.test(e.message)
        ) {
          refs.previewRadio.checked = true;
        }
      }
    }

    // ---- job view --------------------------------------------------

    function renderJob(mode: PlotMode) {
      if (view.kind !== 'job') return;
      form = null;
      dialog.innerHTML = jobHtml(view.jobId);
      const refs: JobRefs = {
        badge: q('.plot-badge'),
        agentEl: q('.plot-agent'),
        estimateEl: q('.plot-estimate'),
        logEl: q('.plot-log'),
        errorEl: q('.plot-error'),
        cancelBtn: q('.plot-cancel-job'),
        plotNowBtn: q('.plot-now'),
      };
      jobRefs = refs;

      q('.plot-summary').textContent =
        `${view.label} — ${mode === 'preview' ? 'Preview' : 'Plot'} · ` +
        'closing this dialog does not cancel the job';
      q<HTMLButtonElement>('.plot-close').addEventListener('click', close);
      refs.cancelBtn.addEventListener('click', () => void cancelJob());
      refs.plotNowBtn.addEventListener('click', () => void plotNow());
    }

    /** Mutates the job view in place so the log block keeps its scroll. */
    function updateJob(job: PlotJob | null, message: string | null) {
      const refs = jobRefs;
      if (!refs) return;
      if (job) {
        refs.badge.textContent = describeStatus(job);
        refs.badge.className = `plot-badge is-${job.status}`;
        refs.agentEl.textContent = describeAgent(job.agent);

        const estimate = describeEstimate(job);
        refs.estimateEl.textContent = estimate ?? '';
        refs.estimateEl.hidden = !estimate;

        const atBottom =
          refs.logEl.scrollTop + refs.logEl.clientHeight >=
          refs.logEl.scrollHeight - 4;
        refs.logEl.textContent = job.log_tail ?? '';
        if (atBottom) refs.logEl.scrollTop = refs.logEl.scrollHeight;

        refs.cancelBtn.hidden = job.status !== 'queued';
        refs.plotNowBtn.hidden = !(
          job.mode === 'preview' &&
          job.status === 'completed' &&
          job.plot_allowed
        );
      }
      refs.errorEl.textContent = message ?? '';
      refs.errorEl.hidden = !message;
    }

    function schedule(ms: number) {
      stopPolling();
      pollTimer = window.setTimeout(() => void pollOnce(), ms);
    }

    async function pollOnce() {
      if (closed || view.kind !== 'job') return;
      const { jobId } = view;
      try {
        const job = await client.getPlotJob(jobId);
        // A "Plot now" may have moved on to a new job meanwhile.
        if (closed || view.kind !== 'job' || view.jobId !== jobId) return;
        view.job = job;
        updateJob(job, null);
        if (job.status === 'queued' || job.status === 'running') {
          schedule(POLL_MS);
        }
      } catch (e) {
        if (closed || view.kind !== 'job' || view.jobId !== jobId) return;
        const fatal =
          e instanceof PlotApiError && [401, 403, 404].includes(e.status);
        updateJob(
          view.job,
          `Status refresh failed: ${describeError(e)}${fatal ? '' : ' — retrying'}`,
        );
        if (fatal) return;
        schedule(
          e instanceof PlotApiError && e.status === 429
            ? POLL_BACKOFF_MS
            : POLL_MS,
        );
      }
    }

    async function cancelJob() {
      const refs = jobRefs;
      if (closed || view.kind !== 'job' || !refs) return;
      refs.cancelBtn.disabled = true;
      try {
        await client.cancelPlotJob(view.jobId);
        if (closed) return;
        void pollOnce();
      } catch (e) {
        if (closed) return;
        updateJob(view.kind === 'job' ? view.job : null, describeError(e));
      } finally {
        if (!closed) refs.cancelBtn.disabled = false;
      }
    }

    async function plotNow() {
      const refs = jobRefs;
      if (closed || view.kind !== 'job' || !refs) return;
      const { label, svg } = view;
      refs.plotNowBtn.disabled = true;
      refs.plotNowBtn.textContent = 'Queuing…';
      try {
        const { id } = await client.createPlotJob({ label, svg, mode: 'plot' });
        if (closed) return;
        stopPolling();
        options.onQueued?.(id, 'plot');
        view = { kind: 'job', jobId: id, label, svg, job: null };
        renderJob('plot');
        void pollOnce();
      } catch (e) {
        if (closed) return;
        refs.plotNowBtn.disabled = false;
        refs.plotNowBtn.textContent = 'Plot now';
        updateJob(view.kind === 'job' ? view.job : null, describeError(e));
      }
    }

    renderForm();
  });
}
