import type { ControlSchema, CanvasConfig } from './controls/schema';
import { DEFAULT_CANVAS } from './controls/schema';

/**
 * Metadata about an artwork.
 */
export interface ArtworkMeta {
  title: string;
  description?: string;
}

/**
 * The shape of an artwork module.
 * Each artwork file in art/*.ts must export these.
 */
export interface ArtworkModule {
  meta: ArtworkMeta;
  canvas?: CanvasConfig;
  controls: ControlSchema;
  draw: (values: Record<string, unknown>, canvas: CanvasConfig) => SVGElement;
}

/**
 * Get the canvas config from an artwork, with fallback to default.
 */
export function getArtworkCanvas(artwork: ArtworkModule): CanvasConfig {
  return artwork.canvas ?? DEFAULT_CANVAS;
}

/**
 * Dynamically import all artwork files from the art/ directory.
 * Vite resolves this at build time.
 */
const artworkModules = import.meta.glob<ArtworkModule>('../art/*.ts', {
  eager: false,
});

/**
 * Get list of available artworks.
 */
export function getAvailableArtworks(): { path: string; name: string }[] {
  return Object.keys(artworkModules)
    .map((path) => ({
      path,
      name: path.replace('../art/', '').replace('.ts', ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load an artwork module by its path.
 */
export async function loadArtwork(path: string): Promise<ArtworkModule> {
  const loader = artworkModules[path];
  if (!loader) {
    throw new Error(`Artwork not found: ${path}`);
  }
  return loader();
}

/**
 * Get artwork path from name.
 */
export function getArtworkPath(name: string): string {
  return `../art/${name}.ts`;
}

/**
 * Get artwork name from path.
 */
export function getArtworkName(path: string): string {
  return path.replace('../art/', '').replace('.ts', '');
}
