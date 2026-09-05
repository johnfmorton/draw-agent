/**
 * Client for the Secondhand Cursive plot-jobs API
 * (docs/secondhand-cursive-api.md, "Plot jobs").
 *
 * The plot queue lives on the Secondhand Cursive server. CursivePlotter,
 * the Mac app beside the AxiDraw, polls that server every few seconds
 * and runs whatever it claims — so Draw Agent never talks to the Mac
 * app: it queues a job here and polls the job for its status.
 */

import {
  SECONDHAND_CURSIVE_URL,
  requireSecondhandToken,
} from '../secondhand-config';

export type PlotMode = 'preview' | 'plot';

export type PlotJobStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'canceled';

/** Parsed from the axicli log when a job completes. */
export interface PlotEstimate {
  time_text?: string | null;
  seconds?: number | null;
  pendown_distance_m?: number | null;
  total_distance_m?: number | null;
}

export interface PlotAgent {
  name: string | null;
  online: boolean;
}

export interface PlotJobRow {
  id: number;
  label: string;
  source: string;
  mode: PlotMode;
  status: PlotJobStatus;
  /** Explicit queue position from a reorder in CursivePlotter; else null. */
  position: number | null;
  estimate: PlotEstimate | null;
  log_tail: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface PlotJob extends PlotJobRow {
  /** A completed preview of this job's exact SVG exists. */
  plot_allowed: boolean;
  /** Null under the server's local driver (no agent to be online). */
  agent: PlotAgent | null;
}

export interface PlotJobList {
  jobs: PlotJobRow[];
  agent: PlotAgent | null;
}

export interface CreatePlotJobResponse {
  id: number;
  status: 'queued';
}

/** Identifies Draw Agent's jobs in the shared queue. */
export const PLOT_SOURCE = 'draw-agent';

/**
 * A failed API call. `status` is the HTTP status, or 0 when the server
 * could not be reached at all.
 */
export class PlotApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlotApiError';
  }
}

/** The plot-jobs endpoint on the same origin as the render endpoint. */
export function plotJobsUrlFrom(letteringUrl: string): string {
  return `${new URL(letteringUrl).origin}/api/v1/plot-jobs`;
}

export interface PlotClientOptions {
  /** Defaults to the plot-jobs URL derived from the lettering URL. */
  baseUrl?: string;
  /** Called per request; defaults to the `.env.local` token. */
  token?: () => string;
  fetch?: typeof globalThis.fetch;
}

export interface PlotClient {
  createPlotJob(input: {
    label: string;
    svg: string;
    mode: PlotMode;
  }): Promise<CreatePlotJobResponse>;
  getPlotJob(id: number): Promise<PlotJob>;
  listPlotJobs(): Promise<PlotJobList>;
  cancelPlotJob(id: number): Promise<{ ok: true; status: 'canceled' }>;
}

/** Used when the server's error body carries no message of its own. */
const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Secondhand Cursive rejected the API token — check VITE_SECONDHAND_CURSIVE_TOKEN in .env.local',
  403: 'This API token may not queue plot jobs (the plotter is super-admin only)',
  404: 'Plot job not found',
  429: 'Rate limited by Secondhand Cursive — wait a moment and try again',
};

export function createPlotClient(options: PlotClientOptions = {}): PlotClient {
  const baseUrl = options.baseUrl ?? plotJobsUrlFrom(SECONDHAND_CURSIVE_URL);
  const getToken = options.token ?? requireSecondhandToken;
  // Looked up per call, so a stubbed global fetch is honoured.
  const fetchImpl =
    options.fetch ??
    ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  async function request<T>(
    url: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<T> {
    // Resolved here, not at import, so a missing token surfaces as a
    // caught error in the dialog with its .env.local guidance.
    const token = getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new PlotApiError(0, 'Secondhand Cursive server unreachable');
    }

    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as {
        message?: unknown;
      };
      const message =
        typeof parsed.message === 'string' && parsed.message
          ? parsed.message
          : (FALLBACK_MESSAGES[response.status] ??
            `Request failed (${response.status})`);
      throw new PlotApiError(response.status, message);
    }
    return (await response.json()) as T;
  }

  return {
    createPlotJob: (input) =>
      request(baseUrl, 'POST', { ...input, source: PLOT_SOURCE }),
    getPlotJob: (id) => request(`${baseUrl}/${id}`, 'GET'),
    listPlotJobs: () => request(`${baseUrl}?source=${PLOT_SOURCE}`, 'GET'),
    cancelPlotJob: (id) => request(`${baseUrl}/${id}/cancel`, 'POST'),
  };
}
