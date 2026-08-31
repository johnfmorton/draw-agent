/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Secondhand Cursive API token, set in .env.local (docs/secondhand-cursive-api.md). */
  readonly VITE_SECONDHAND_CURSIVE_TOKEN?: string;
  /** Optional override for the Secondhand Cursive endpoint. */
  readonly VITE_SECONDHAND_CURSIVE_URL?: string;
}
