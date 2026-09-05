import { describe, expect, it, vi } from 'vitest';
import {
  createPlotClient,
  PlotApiError,
  plotJobsUrlFrom,
} from '../src/plot/plot-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type FetchMock = ReturnType<typeof vi.fn>;

function clientWith(fetch: FetchMock) {
  return createPlotClient({
    baseUrl: 'https://x.test/api/v1/plot-jobs',
    token: () => 'tok',
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
}

describe('plotJobsUrlFrom', () => {
  it('derives the plot-jobs endpoint from the lettering endpoint origin', () => {
    expect(
      plotJobsUrlFrom('https://secondhand-cursive.ddev.site/api/v1/svg'),
    ).toBe('https://secondhand-cursive.ddev.site/api/v1/plot-jobs');
    expect(plotJobsUrlFrom('https://secondhand.morton.dev/api/v1/svg')).toBe(
      'https://secondhand.morton.dev/api/v1/plot-jobs',
    );
    expect(plotJobsUrlFrom('http://localhost:8000/api/v1/svg')).toBe(
      'http://localhost:8000/api/v1/plot-jobs',
    );
  });
});

describe('createPlotClient', () => {
  it('posts a job with the token, a JSON body and the draw-agent source', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ id: 7, status: 'queued' }, 201));

    const result = await clientWith(fetch).createPlotJob({
      label: 'piece',
      svg: '<svg/>',
      mode: 'preview',
    });

    expect(result).toEqual({ id: 7, status: 'queued' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.test/api/v1/plot-jobs');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      label: 'piece',
      svg: '<svg/>',
      mode: 'preview',
      source: 'draw-agent',
    });
  });

  it('reads, lists and cancels jobs at their routes', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 7, status: 'queued' }))
      .mockResolvedValueOnce(json({ jobs: [], agent: null }))
      .mockResolvedValueOnce(json({ ok: true, status: 'canceled' }));
    const client = clientWith(fetch);

    await client.getPlotJob(7);
    await client.listPlotJobs();
    await client.cancelPlotJob(7);

    const calls = fetch.mock.calls.map(([url, init]) => [
      url,
      (init as RequestInit).method,
    ]);
    expect(calls).toEqual([
      ['https://x.test/api/v1/plot-jobs/7', 'GET'],
      ['https://x.test/api/v1/plot-jobs?source=draw-agent', 'GET'],
      ['https://x.test/api/v1/plot-jobs/7/cancel', 'POST'],
    ]);
    expect((fetch.mock.calls[0][1] as RequestInit).body).toBeUndefined();
  });

  it("surfaces the server's message on a 422", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ message: 'Run a preview of this SVG before plotting.' }, 422),
      );

    await expect(
      clientWith(fetch).createPlotJob({
        label: 'p',
        svg: '<svg/>',
        mode: 'plot',
      }),
    ).rejects.toMatchObject({
      name: 'PlotApiError',
      status: 422,
      message: 'Run a preview of this SVG before plotting.',
    });
  });

  it('falls back to a token hint on a 401 without a JSON body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 401 }));

    const error = await clientWith(fetch)
      .listPlotJobs()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlotApiError);
    expect((error as PlotApiError).status).toBe(401);
    expect((error as PlotApiError).message).toContain(
      'VITE_SECONDHAND_CURSIVE_TOKEN',
    );
  });

  it('reports an unreachable server as status 0', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await clientWith(fetch)
      .listPlotJobs()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlotApiError);
    expect((error as PlotApiError).status).toBe(0);
    expect((error as PlotApiError).message).toContain('unreachable');
  });

  it('never calls fetch when no token is configured', async () => {
    const fetch = vi.fn();
    const client = createPlotClient({
      baseUrl: 'https://x.test/api/v1/plot-jobs',
      token: () => {
        throw new Error('set VITE_SECONDHAND_CURSIVE_TOKEN in .env.local');
      },
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(client.listPlotJobs()).rejects.toThrow('.env.local');
    expect(fetch).not.toHaveBeenCalled();
  });
});
