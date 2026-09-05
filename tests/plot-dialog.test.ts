// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlotClient, PlotJob } from '../src/plot/plot-client';
import { openPlotDialog } from '../src/plot/plot-dialog';

const queuedJob: PlotJob = {
  id: 1,
  label: 'piece',
  source: 'draw-agent',
  mode: 'preview',
  status: 'queued',
  position: null,
  estimate: null,
  log_tail: 'Claimed by agent: studio-mac-app',
  created_at: '2026-09-05T12:00:00Z',
  started_at: null,
  finished_at: null,
  plot_allowed: false,
  agent: { name: 'studio-mac-app', online: true },
};

function fakeClient() {
  return {
    createPlotJob: vi.fn().mockResolvedValue({ id: 1, status: 'queued' }),
    getPlotJob: vi.fn().mockResolvedValue(queuedJob),
    listPlotJobs: vi.fn().mockResolvedValue({
      jobs: [],
      agent: { name: 'studio-mac-app', online: true },
    }),
    cancelPlotJob: vi.fn().mockResolvedValue({ ok: true, status: 'canceled' }),
  };
}

function open(client: ReturnType<typeof fakeClient>, onQueued = vi.fn()) {
  const done = openPlotDialog({
    artworkTitle: 'Snow Cursive Study 1',
    canvas: { width: 6, height: 4, unit: 'in' },
    defaultLabel: 'snow-cursive-study-1',
    buildSvg: () => '<svg/>',
    onQueued,
    client: client as unknown as PlotClient,
  });
  return { done, onQueued };
}

const $ = <T extends Element>(selector: string) =>
  document.querySelector(selector) as T;

function memoryStorage(): Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'clear'
> {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
}

describe('openPlotDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Node 26 defines an experimental global `localStorage` that is
    // undefined without --localstorage-file and shadows jsdom's, so
    // stand in a minimal Storage of our own.
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('opens on the form with the artwork, Preview and the export defaults', async () => {
    const client = fakeClient();
    open(client);

    expect($('.plot-summary').textContent).toBe(
      'Snow Cursive Study 1 — 6 × 4 in',
    );
    expect($<HTMLInputElement>('#plot-label').value).toBe(
      'snow-cursive-study-1',
    );
    expect($<HTMLInputElement>('#plot-mode-preview').checked).toBe(true);
    expect($<HTMLInputElement>('#plot-optimize').checked).toBe(true);
    expect($<HTMLInputElement>('#plot-reverse').checked).toBe(true);

    await vi.advanceTimersByTimeAsync(0);
    expect($('.plot-agent').textContent).toBe('studio-mac-app online');
    expect(client.listPlotJobs).toHaveBeenCalledTimes(1);
  });

  it('remembers the optimisation choices between opens', async () => {
    localStorage.setItem('draw-agent:plot-optimize', 'false');
    const client = fakeClient();
    open(client);

    expect($<HTMLInputElement>('#plot-optimize').checked).toBe(false);
    expect($<HTMLInputElement>('#plot-reverse').checked).toBe(true);
  });

  it('sends the built svg, polls the job, and stops polling on close', async () => {
    const client = fakeClient();
    const { done, onQueued } = open(client);
    await vi.advanceTimersByTimeAsync(0);

    $<HTMLButtonElement>('#plot-send').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.createPlotJob).toHaveBeenCalledWith({
      label: 'snow-cursive-study-1',
      svg: '<svg/>',
      mode: 'preview',
    });
    expect(onQueued).toHaveBeenCalledWith(1, 'preview');
    expect($('h2').textContent).toBe('Plot job #1');
    expect($('.plot-badge').textContent).toBe('Queued');
    expect($('.plot-log').textContent).toContain('studio-mac-app');
    expect($<HTMLButtonElement>('.plot-cancel-job').hidden).toBe(false);
    expect($<HTMLButtonElement>('.plot-now').hidden).toBe(true);
    expect(client.getPlotJob).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(client.getPlotJob).toHaveBeenCalledTimes(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await done;
    expect(document.querySelector('.dialog-overlay')).toBeNull();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getPlotJob).toHaveBeenCalledTimes(2);
  });

  it('offers Plot now once a preview has completed and reuses the same svg', async () => {
    const client = fakeClient();
    client.getPlotJob.mockResolvedValue({
      ...queuedJob,
      status: 'completed',
      plot_allowed: true,
      estimate: { time_text: '1 minute, 5 seconds', pendown_distance_m: 0.8 },
    });
    client.createPlotJob
      .mockResolvedValueOnce({ id: 1, status: 'queued' })
      .mockResolvedValueOnce({ id: 2, status: 'queued' });
    open(client);
    await vi.advanceTimersByTimeAsync(0);

    $<HTMLButtonElement>('#plot-send').click();
    await vi.advanceTimersByTimeAsync(0);

    expect($('.plot-badge').textContent).toBe('Completed');
    expect($('.plot-estimate').textContent).toBe(
      '1 minute, 5 seconds · 0.80 m pen-down',
    );
    expect($<HTMLButtonElement>('.plot-now').hidden).toBe(false);

    $<HTMLButtonElement>('.plot-now').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.createPlotJob).toHaveBeenLastCalledWith({
      label: 'snow-cursive-study-1',
      svg: '<svg/>',
      mode: 'plot',
    });
    expect($('h2').textContent).toBe('Plot job #2');
  });

  it('keeps the form and flips back to Preview when the server wants a preview first', async () => {
    const client = fakeClient();
    const { PlotApiError } = await import('../src/plot/plot-client');
    client.createPlotJob.mockRejectedValue(
      new PlotApiError(422, 'Run a preview of this SVG before plotting.'),
    );
    open(client);
    await vi.advanceTimersByTimeAsync(0);

    $<HTMLInputElement>('#plot-mode-plot').click();
    $<HTMLButtonElement>('#plot-send').click();
    await vi.advanceTimersByTimeAsync(0);

    expect($('.plot-error').textContent).toBe(
      'Run a preview of this SVG before plotting.',
    );
    expect($<HTMLInputElement>('#plot-mode-preview').checked).toBe(true);
    expect($<HTMLButtonElement>('#plot-send').disabled).toBe(false);
    expect($<HTMLButtonElement>('#plot-send').textContent).toBe(
      'Send to plotter',
    );
  });
});
