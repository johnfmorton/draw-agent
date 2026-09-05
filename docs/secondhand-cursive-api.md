# Secondhand Cursive render API

Secondhand Cursive (<https://secondhand.morton.dev/>) is the app that
holds John's captured cursive handwriting fonts. It exposes one API
endpoint that typesets a word or phrase in one of those fonts and
returns a tight, self-sized SVG — real stroke geometry, sized in
millimeters, ready to compose into plotter artwork.

```
POST https://secondhand.morton.dev/api/v1/svg
Content-Type: application/json
Authorization: Bearer <token>
```

There is an interactive playground at
<https://secondhand.morton.dev/api-playground> — every field below has a
form control there, plus a live curl line and the rendered response.
Useful for eyeballing a font and pinning a seed before wiring it in.

## Authentication

Sanctum personal access tokens, sent as `Authorization: Bearer <token>`.
The token plaintext looks like `{uuid}|{secret}` — send the whole
string, pipe included.

- Mint and revoke keys at <https://secondhand.morton.dev/api-keys>
  (plaintext is shown exactly once, at creation), or headless via
  `artisan api:token {email} --name=…` on the server.
- The API is per-user: a token only sees its owner's fonts. Asking for
  someone else's font returns 404, indistinguishable from a font that
  doesn't exist.

**Token hygiene in this project:** Draw Agent encodes parameter state
into shareable URLs. The API token must never ride along — keep it out
of control schemas and query strings. Read it from an env var in
scripts, or from `localStorage` / a prompt in the browser (CORS on the
API is open, so direct `fetch` from `localhost:5173` works).

## Request

JSON body. Only `font` and `text` are required; everything else has a
sensible default (most defaults come from the font's own export pen
settings).

| field | type / bounds | default | meaning |
|---|---|---|---|
| `font` | string | required | Font id or slug (your own fonts only) |
| `text` | string, ≤ 200 chars, not whitespace-only | required | Text to typeset; `\n` is a hard line break |
| `lineweight` | integer 100–900 | 400 | CSS-font-weight-style stroke weight axis |
| `nib` | `round` \| `calligraphy` | the font's export pen | Pen model (see below) |
| `angle` | number 0–180 | font's, else 40 | Nib angle in degrees; ignored for `round` |
| `width` | number 0.01–0.5 | font's, else 0.075 | Pen-width base in x-heights |
| `seed` | integer ≥ 1 | random per call | Layout/humanization seed |
| `approved_joins_only` | boolean | false | Only draw joins rated good; unapproved letter boundaries become pen lifts |
| `x_height_mm` | number 1–20 | 4.0 | Physical x-height of the lettering |
| `width_mm` | number 10–1000 | absent | Wrap width; omitted = one unwrapped line |

The physical stroke width composes as
`width × weight_scale(lineweight) × x_height_mm`, where `weight_scale`
is piecewise linear through (100 → 0.4), (400 → 1.0), (900 → 2.4).
Defaults give a 0.3 mm stroke at 4 mm x-height — the app's standard
plot pen.

### Round vs calligraphy — this matters for plotting

- **`round`** returns *stroked centerlines*: open `<path>` elements
  with `stroke` and `fill="none"`. These are the pen's actual travel
  paths — exactly what an AxiDraw wants. **Use `nib: "round"` for
  anything headed to the plotter.**
- **`calligraphy`** returns *filled outline contours*: Z-closed
  subpaths of one nonzero-filled path (the ink's envelope, like a font
  glyph). Correct on screen, but plotting it raw traces the outline of
  each stroke instead of drawing it — it needs fill/hatch handling
  first.

## Response

`200`:

```json
{
  "svg": "<svg …>…</svg>",
  "width_mm": 61.482,
  "height_mm": 14.907,
  "warnings": ["…"],
  "missing_letterforms": [
    { "from": "o", "to": "z", "position": 4, "scope": "join", "count": 1 }
  ],
  "seed": 482913
}
```

- `svg` is a complete standalone document, cropped tight to the ink,
  with `width`/`height` in `mm` and a matching `viewBox`. **The viewBox
  origin is usually not 0,0** — coordinates are never re-baked after
  cropping. When embedding into a larger composition, either nest the
  whole `<svg>` element (position it with `x`/`y`), or if you lift the
  paths out, wrap them in a `<g transform="translate(-minX, -minY)">`
  using the viewBox origin. All coordinates are in millimeters, so it
  drops straight into Draw Agent's physical-unit canvases.
- `warnings` are the typesetter's diagnostics, verbatim.
- `missing_letterforms` reports transitions the font has no letterform
  or join for (`scope` tells you which). The render still succeeds —
  the gap becomes a pen lift — but the ink may look sparser than the
  text. The playground turns these reports into capture links if a gap
  needs fixing at the source.
- `seed` is always the seed actually used. **Rendering is
  deterministic**: identical inputs plus the same seed produce a
  byte-identical SVG. Omit `seed` to explore variations, then send the
  reported seed back to pin the render you like — the natural fit for
  Draw Agent's seeded-randomness model is to pass your artwork's seed
  (or a sub-seed) straight through.

### Errors

All errors are `{ "message": "…" }`:

| status | meaning |
|---|---|
| 401 | Missing or invalid token |
| 403 | Account suspended |
| 404 | Font not found (or not yours) |
| 422 | Validation failure; a font set to "font files only" (change its Outputs setting in the app); or nothing renderable for the text (`warnings` attached) |
| 429 | Rate limited — 60 requests/minute |

## Examples

curl:

```bash
curl -s https://secondhand.morton.dev/api/v1/svg \
  -H "Authorization: Bearer $SECONDHAND_CURSIVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"font": "my-cursive", "text": "hello, plotter", "seed": 42, "x_height_mm": 5}'
```

TypeScript helper:

```typescript
export interface RenderRequest {
  font: string;
  text: string;
  lineweight?: number;          // 100–900
  nib?: 'round' | 'calligraphy';
  angle?: number;               // 0–180, calligraphy only
  width?: number;               // 0.01–0.5, in x-heights
  seed?: number;                // >= 1
  approved_joins_only?: boolean;
  x_height_mm?: number;         // 1–20
  width_mm?: number;            // 10–1000, wrap width
}

export interface RenderResponse {
  svg: string;
  width_mm: number;
  height_mm: number;
  warnings: string[];
  missing_letterforms: Array<{
    from: string; to: string; position: number; scope: string; count: number;
  }>;
  seed: number;
}

export async function renderCursive(
  token: string,
  request: RenderRequest,
): Promise<RenderResponse> {
  const response = await fetch('https://secondhand.morton.dev/api/v1/svg', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Render failed (${response.status}): ${body.message}`);
  }
  return response.json();
}
```

Renders are live typesetting, not cached lookups — for artwork that
places many phrases, render each phrase once and reuse the result
rather than re-fetching per frame or per control tweak, and stay under
the 60/min throttle.

## Plot jobs

The same server runs the plot queue. CursivePlotter, the Mac app beside
the AxiDraw, polls it every few seconds, claims the next queued job,
runs `axicli` on the SVG and reports back — so Draw Agent never talks
to the Mac app. The Plot button (header, left of Export SVG) queues a
job here and then polls it for status. Spec: BUILD_SPEC §9.2 in the
Secondhand Cursive repo.

**Base URL**: the render endpoint's origin plus `/api/v1/plot-jobs`
(`plotJobsUrlFrom()` in `src/plot/plot-client.ts` derives it from
`VITE_SECONDHAND_CURSIVE_URL`). Same bearer token as rendering, with
`Accept: application/json`. The token's user must be the super admin
(the plotter is one person's), and the routes have their own 120/min
throttle so status polling never competes with lettering renders.

| Call | Body / query | Answer |
|---|---|---|
| `POST /plot-jobs` | `{label ≤120, svg, mode: "preview" or "plot", source: "draw-agent"}` | `201 {id, status: "queued"}` |
| `GET /plot-jobs/{id}` | — | `{id, label, source, mode, status, position, estimate, log_tail, created_at, started_at, finished_at, plot_allowed, agent}` |
| `GET /plot-jobs?source=draw-agent` | — | `{jobs: [row…] (latest 20), agent}` |
| `POST /plot-jobs/{id}/cancel` | — | `{ok: true, status: "canceled"}`; 422 unless queued |

- `status` runs `queued → running → completed`, `failed` or `canceled`.
- `estimate` (parsed from the axicli log on completion): `time_text`,
  `seconds`, `pendown_distance_m`, `total_distance_m`.
- `agent` is `{name, online}` — `online` means the Mac app has polled
  within the last 30 s; while it is offline, jobs simply wait in the
  queue. Null when the server plots locally.
- `plot_allowed`: a completed preview of this job's exact SVG exists.

**Guardrails** (422 with a `message`): a `plot` is refused until a
preview of the *byte-identical* SVG has completed — so rebuilding with
different optimization options needs a new preview, which is why "Plot
now" in the dialog re-sends the very string it previewed — and an
identical SVG already queued or running is refused as a duplicate.
Other errors: 401 bad token, 403 not the super admin, 429 throttled.

```bash
BASE=https://secondhand-cursive.ddev.site/api/v1
H=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/json")
curl -s "$BASE/plot-jobs?source=draw-agent" "${H[@]}"
curl -s "$BASE/plot-jobs" "${H[@]}" -H "Content-Type: application/json" \
  -d '{"label":"curl smoke","mode":"preview","source":"draw-agent","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10mm\" height=\"10mm\" viewBox=\"0 0 10 10\"><path d=\"M 1 1 L 9 9\" fill=\"none\" stroke=\"black\" stroke-width=\"0.3\"/></svg>"}'
curl -s "$BASE/plot-jobs/ID" "${H[@]}"
```

**Flow in Draw Agent**: `handlePlot()` in `src/main.ts` opens
`openPlotDialog()` (`src/plot/plot-dialog.ts`) with a `buildSvg`
callback that runs `buildExportSvg()` on the live preview at send time
— the same string Export SVG would download. The dialog posts a
preview, polls the job every 2 s while open, and offers Plot now once
`plot_allowed` is true. Pen speeds and heights are the server's
`config/plotter.php`; the dialog never sends them.
