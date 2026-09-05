/**
 * Secondhand Cursive server settings, shared by the lettering helper
 * (src/secondhand-cursive.ts) and the plot-jobs client (src/plot/).
 *
 * Both read `.env.local` (gitignored): `VITE_SECONDHAND_CURSIVE_URL`
 * names the render endpoint — the plot client derives its own URL from
 * that origin — and `VITE_SECONDHAND_CURSIVE_TOKEN` is the personal API
 * key. Never put the token in a control schema: control values are
 * encoded into shareable URLs.
 */

export const SECONDHAND_CURSIVE_URL =
  import.meta.env.VITE_SECONDHAND_CURSIVE_URL ??
  'https://secondhand-cursive.ddev.site/api/v1/svg';

export function requireSecondhandToken(): string {
  const token = import.meta.env.VITE_SECONDHAND_CURSIVE_TOKEN;
  if (!token) {
    throw new Error(
      'Secondhand Cursive: set VITE_SECONDHAND_CURSIVE_TOKEN in .env.local ' +
        '(see docs/secondhand-cursive-api.md), then restart the dev server',
    );
  }
  return token;
}
