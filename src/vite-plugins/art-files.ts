import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Vite plugin exposing artwork source files to the in-browser editor.
 *
 * Dev-server endpoints (dev mode only):
 * - GET  /__art/<name>        → raw source of art/<name>.ts (text/plain)
 * - POST /__art/<name>        → format body with Prettier, write to disk,
 *                               respond with SaveResponse JSON
 * - POST /__art/<name>?dry=1  → format only, no write (for the Format button)
 *
 * Also notifies the client over the HMR websocket when a file in art/
 * changes on disk (event: 'art-file-changed', data: { name }), so the
 * editor can sync or flag a conflict.
 */

/** JSON shape returned by POST /__art/<name>. */
export interface SaveResponse {
  source: string;
  formatted: boolean;
  formatError?: string;
}

const NAME_RE = /^[\w-]+$/;

export function artFilesPlugin(): Plugin {
  let artDir = '';

  async function format(
    source: string,
    filepath: string
  ): Promise<SaveResponse> {
    try {
      const prettier = await import('prettier');
      const config = await prettier.resolveConfig(filepath);
      const formatted = await prettier.format(source, {
        ...config,
        parser: 'typescript',
      });
      return { source: formatted, formatted: true };
    } catch (e) {
      return {
        source,
        formatted: false,
        formatError: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    name: 'art-files',
    apply: 'serve',

    configResolved(config) {
      artDir = path.join(config.root, 'art');
    },

    configureServer(server) {
      server.middlewares.use('/__art', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const name = url.pathname.slice(1);

        const fail = (status: number, message: string) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'text/plain');
          res.end(message);
        };

        if (!NAME_RE.test(name)) {
          return fail(400, `Invalid artwork name: ${name}`);
        }
        const filepath = path.join(artDir, `${name}.ts`);

        try {
          if (req.method === 'GET') {
            const source = await fs.readFile(filepath, 'utf-8');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(source);
            return;
          }

          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk as Buffer);
            }
            const body = Buffer.concat(chunks).toString('utf-8');

            const result = await format(body, filepath);
            if (url.searchParams.get('dry') !== '1') {
              await fs.writeFile(filepath, result.source, 'utf-8');
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
            return;
          }

          fail(405, `Method not allowed: ${req.method}`);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            fail(404, `Artwork not found: ${name}`);
          } else {
            fail(500, e instanceof Error ? e.message : String(e));
          }
        }
      });
    },

    handleHotUpdate({ file, server }) {
      const rel = path.relative(artDir, file);
      if (!rel.startsWith('..') && !path.isAbsolute(rel) && rel.endsWith('.ts')) {
        server.ws.send({
          type: 'custom',
          event: 'art-file-changed',
          data: { name: rel.slice(0, -3) },
        });
      }
    },
  };
}
