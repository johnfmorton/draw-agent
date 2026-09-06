/**
 * Secondhand Cursive lettering helper.
 *
 * Typesets text through the Secondhand Cursive API
 * (docs/secondhand-cursive-api.md) and composes the returned stroke
 * geometry into an artwork's SVG.
 *
 * Because `draw()` must return synchronously, responses are cached per
 * request for the life of the module: the first render of a given
 * request appends its lettering when the fetch resolves, and every
 * later render embeds it synchronously from cache. The API is
 * deterministic per seed, so a cache hit is exact and repeat renders
 * never re-hit the 60/min throttle. A burst that does trip it (a big
 * variant pool, a few quick re-rolls) is retried after a pause rather
 * than dropped.
 *
 * The endpoint and API token come from `.env.local` via
 * src/secondhand-config.ts (shared with the plot-jobs client). Never
 * put the token in a control schema — control values are encoded into
 * shareable URLs.
 *
 * @example
 * ```typescript
 * import { cursiveInCircle } from '../src/secondhand-cursive';
 *
 * export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
 *   const { svg, draw } = createCanvas(canvasConfig);
 *   // ...draw a circle at (cx, cy) with the given radius...
 *   cursiveInCircle(
 *     svg,
 *     { text: 'test', seed: values.seed },
 *     { cx, cy, radius, penWidthMm: 0.3 },
 *   );
 *   return svg;
 * }
 * ```
 */

import {
  SECONDHAND_CURSIVE_URL as API_URL,
  requireSecondhandToken as requireToken,
} from './secondhand-config';

export const DEFAULT_CURSIVE_FONT = 'johnfmorton-cursive-v2-2';

/** Canvas px per response mm (the app maps physical units at 96 DPI). */
export const MM_TO_PX = 96 / 25.4;

export interface CursiveOptions {
  /** Text to typeset; `\n` is a hard line break. Max 200 chars. */
  text: string;
  /**
   * Pass the artwork seed through so the humanized lettering
   * reproduces from the URL alone. Clamped to the API's minimum of 1
   * (the 🎲 control can roll 0). Omitting it gets a random layout on
   * the first fetch, which the cache then pins for the session.
   */
  seed?: number;
  /** Font id or slug; defaults to DEFAULT_CURSIVE_FONT. */
  font?: string;
  /**
   * 'round' (the default) returns stroked centerlines — the pen's
   * actual travel paths, what the AxiDraw wants. 'calligraphy'
   * returns filled outline contours that need hatching before
   * plotting.
   */
  nib?: 'round' | 'calligraphy';
  /**
   * 100–900 stroke weight axis. For 'round' this only changes the
   * cosmetic stroke-width attribute, never the path geometry — prefer
   * `penWidthMm` in the placement options for an honest preview.
   */
  lineweight?: number;
  /** Nib angle in degrees (0–180); calligraphy only. */
  angle?: number;
  /** Pen-width base in x-heights (0.01–0.5). */
  width?: number;
  /** Only draw joins rated good; others become pen lifts. */
  approved_joins_only?: boolean;
  /** Physical x-height of the lettering (1–20mm). */
  x_height_mm?: number;
  /** Wrap width in mm (10–1000); omitted = one unwrapped line. */
  width_mm?: number;
}

export interface CursiveResponse {
  svg: string;
  width_mm: number;
  height_mm: number;
  /**
   * The x-height the lettering was set at, and every typeset line's
   * nominal baseline measured down from the ink box's top edge (mm).
   * Optional only because a server from before September 2026 omits
   * them; see xHeightCenterMm() for the fallback.
   */
  x_height_mm?: number;
  baselines_mm?: number[];
  warnings: string[];
  missing_letterforms: Array<{
    from: string;
    to: string;
    position: number;
    scope: string;
    count: number;
  }>;
  seed: number;
}

const responseCache = new Map<string, CursiveResponse>();
const pendingFetches = new Map<string, Promise<CursiveResponse>>();

/**
 * Rate-limit handling. Rejected (429) calls don't count against the
 * API's 60/min window, so a throttled request just waits and tries
 * again, keeping its place in pendingFetches so re-renders dedupe onto
 * it. Retry-After isn't readable cross-origin, so the pause is a flat
 * interval, shared across requests so a throttled burst sleeps and
 * retries as one wave.
 */
const RATE_LIMIT_RETRY_MS = 10_000;
const RATE_LIMIT_MAX_RETRIES = 8;
let rateLimitedUntil = 0;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function postRender(
  request: Record<string, unknown>,
  token: string,
): Promise<CursiveResponse> {
  for (let attempt = 0; ; attempt++) {
    const pause = rateLimitedUntil - Date.now();
    if (pause > 0) await sleep(pause);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      if (Date.now() >= rateLimitedUntil) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_RETRY_MS;
        console.warn(
          `Secondhand Cursive: rate limited (60 renders/min), retrying in ${
            RATE_LIMIT_RETRY_MS / 1000
          }s`,
        );
      }
      continue;
    }
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({ message: response.statusText }))) as {
        message?: string;
      };
      throw new Error(
        `Secondhand Cursive render failed (${response.status}): ${body.message}`,
      );
    }
    return response.json() as Promise<CursiveResponse>;
  }
}

/**
 * Fetch a render from the API, deduplicated and cached per request.
 * Returns the response synchronously on a cache hit, otherwise a
 * promise for it — see withCursive() for the pattern that hides this.
 */
export function fetchCursive(
  options: CursiveOptions,
): CursiveResponse | Promise<CursiveResponse> {
  const { seed, font, nib, ...rest } = options;
  const request = {
    ...rest,
    font: font ?? DEFAULT_CURSIVE_FONT,
    nib: nib ?? 'round',
    ...(seed !== undefined ? { seed: Math.max(1, seed) } : {}),
  };
  const key = JSON.stringify(request);

  const cached = responseCache.get(key);
  if (cached) return cached;

  let pending = pendingFetches.get(key);
  if (!pending) {
    const token = requireToken();
    pending = postRender(request, token).then(
      (result) => {
        responseCache.set(key, result);
        pendingFetches.delete(key);
        if (result.missing_letterforms.length > 0) {
          console.warn(
            'Secondhand Cursive: missing letterforms',
            result.missing_letterforms,
          );
        }
        for (const warning of result.warnings) {
          console.warn(`Secondhand Cursive: ${warning}`);
        }
        return result;
      },
      (error) => {
        pendingFetches.delete(key);
        throw error;
      },
    );
    pendingFetches.set(key, pending);
  }
  return pending;
}

/**
 * Run `place` with the rendered lettering: synchronously when cached,
 * otherwise once the fetch lands. The late call is skipped if `svg`
 * has been replaced in the preview by a newer render.
 *
 * Escape hatch for custom layouts; most artwork wants cursiveInCircle
 * or cursiveAt instead.
 */
export function withCursive(
  svg: SVGSVGElement,
  options: CursiveOptions,
  place: (rendered: CursiveResponse) => void,
): void {
  const result = fetchCursive(options);
  if (result instanceof Promise) {
    result
      .then((rendered) => {
        if (svg.isConnected) place(rendered);
      })
      .catch((error) => console.error(error));
  } else {
    place(result);
  }
}

/**
 * Distance (mm) from the ink box's top edge to the center of the first
 * line's x-height band — the point to anchor a word on when it sits
 * along a guide. The box's edges move with whatever ascenders and
 * descenders the word happens to have, so box-centering "happy" and
 * "peace" on the same line puts them a third of an x-height apart.
 * Falls back to the box's center for a response without baselines.
 */
export function xHeightCenterMm(rendered: CursiveResponse): number {
  const baseline = rendered.baselines_mm?.[0];
  const xHeight = rendered.x_height_mm;
  if (baseline === undefined || xHeight === undefined) {
    return rendered.height_mm / 2;
  }
  return baseline - xHeight / 2;
}

export interface CursivePlacement {
  /** Canvas-px position of the ink box's top-left corner. */
  x: number;
  y: number;
  /** Canvas px per response mm; MM_TO_PX renders true physical size. */
  scale: number;
  /**
   * Display strokes at this physical pen width (mm on paper, e.g. 0.3
   * for the standard plot pen) instead of the API's lineweight, so
   * the preview shows what the plotter will actually put down.
   */
  penWidthMm?: number | undefined;
  /**
   * Rotate the lettering this many degrees clockwise about `pivot`, or
   * the ink box's center. The x/y placement still positions the
   * unrotated box; the rotation then tilts it in place.
   */
  rotateDeg?: number | undefined;
  /**
   * Canvas-px point to rotate about. A word anchored on its x-height
   * center wants the rotation there too, or the tilt swings it off
   * the guide.
   */
  pivot?: { x: number; y: number } | undefined;
}

/**
 * Build a <g> of the rendered strokes, re-based into canvas px.
 *
 * The API's SVG is coordinate-space mm with a non-zero viewBox origin
 * (coordinates are never re-baked after cropping), so the paths are
 * lifted out and re-based: translate the ink box's origin away, scale
 * mm -> px, translate to the target position.
 */
export function cursiveGroup(
  rendered: CursiveResponse,
  placement: CursivePlacement,
): SVGGElement | null {
  const doc = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml');
  const inner = doc.documentElement;
  const viewBox = inner.getAttribute('viewBox');
  if (!viewBox) {
    console.error('Secondhand Cursive: response SVG has no viewBox');
    return null;
  }
  const [minX, minY] = viewBox.split(/[\s,]+/).map(Number);

  const { x, y, scale, penWidthMm, rotateDeg, pivot } = placement;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const pivotX = pivot?.x ?? x + (rendered.width_mm * scale) / 2;
  const pivotY = pivot?.y ?? y + (rendered.height_mm * scale) / 2;
  const rotate = rotateDeg ? `rotate(${rotateDeg} ${pivotX} ${pivotY}) ` : '';
  g.setAttribute(
    'transform',
    `${rotate}translate(${x} ${y}) scale(${scale}) translate(${-minX} ${-minY})`,
  );
  while (inner.firstChild) g.appendChild(inner.firstChild);

  if (penWidthMm !== undefined) {
    // penWidthMm on paper is penWidthMm * MM_TO_PX canvas px; divide
    // by the group scale to express it in the local mm coordinates.
    const local = (penWidthMm * MM_TO_PX) / scale;
    g.setAttribute('stroke-width', String(local));
    for (const el of g.querySelectorAll('[stroke-width]')) {
      el.setAttribute('stroke-width', String(local));
    }
  }

  return g;
}

export interface CircleFit {
  /** Circle center and radius, in canvas px. */
  cx: number;
  cy: number;
  radius: number;
  /**
   * Ink-box corners stay inside this fraction of the radius
   * (default 0.85 — a small margin).
   */
  margin?: number;
  /** See CursivePlacement.penWidthMm. */
  penWidthMm?: number;
  /**
   * Degrees clockwise about the circle center. The fit is sized by the
   * ink box's half-diagonal, so any rotation stays inside the circle.
   */
  rotateDeg?: number;
}

/**
 * Typeset text and scale it to fill a circle without crossing it:
 * the ink box is centered on the circle and sized so its half-diagonal
 * reaches radius * margin.
 */
export function cursiveInCircle(
  svg: SVGSVGElement,
  options: CursiveOptions,
  fit: CircleFit,
): void {
  const { cx, cy, radius, margin = 0.85, penWidthMm, rotateDeg } = fit;
  withCursive(svg, options, (rendered) => {
    const scale =
      (2 * radius * margin) / Math.hypot(rendered.width_mm, rendered.height_mm);
    const g = cursiveGroup(rendered, {
      x: cx - (rendered.width_mm * scale) / 2,
      y: cy - (rendered.height_mm * scale) / 2,
      scale,
      penWidthMm,
      rotateDeg,
    });
    if (g) svg.appendChild(g);
  });
}

export interface PointPlacement {
  /** Anchor point in canvas px. */
  x: number;
  y: number;
  /**
   * Which point of the lettering lands on (x, y). Default 'center' (of
   * the ink box). 'x-height' centers horizontally and puts the center
   * of the first line's x-height band on y — the anchor for words set
   * along a guide (see xHeightCenterMm) — and rotates about that point.
   */
  anchor?: 'center' | 'top-left' | 'x-height';
  /** Scale so the ink box is this many canvas px tall... */
  heightPx?: number;
  /** ...or this many wide. Omit both for true physical size. */
  widthPx?: number;
  /** See CursivePlacement.penWidthMm. */
  penWidthMm?: number;
  /** Degrees clockwise about the anchor point. */
  rotateDeg?: number;
}

/**
 * Typeset text at a point. With neither heightPx nor widthPx the
 * lettering lands at true physical size (x_height_mm in the request
 * controls how big that is).
 */
export function cursiveAt(
  svg: SVGSVGElement,
  options: CursiveOptions,
  placement: PointPlacement,
): void {
  withCursive(svg, options, (rendered) => {
    const scale =
      placement.heightPx !== undefined
        ? placement.heightPx / rendered.height_mm
        : placement.widthPx !== undefined
          ? placement.widthPx / rendered.width_mm
          : MM_TO_PX;
    const w = rendered.width_mm * scale;
    const h = rendered.height_mm * scale;
    const anchor = placement.anchor ?? 'center';
    const g = cursiveGroup(rendered, {
      x: anchor === 'top-left' ? placement.x : placement.x - w / 2,
      y:
        anchor === 'top-left'
          ? placement.y
          : anchor === 'x-height'
            ? placement.y - xHeightCenterMm(rendered) * scale
            : placement.y - h / 2,
      scale,
      penWidthMm: placement.penWidthMm,
      rotateDeg: placement.rotateDeg,
      pivot:
        anchor === 'x-height' ? { x: placement.x, y: placement.y } : undefined,
    });
    if (g) svg.appendChild(g);
  });
}
