/**
 * Seeded pseudo-random number generator using Mulberry32 algorithm.
 * Fast, deterministic, and produces well-distributed values.
 */
export function createRandom(seed: number): () => number {
  let state = seed;
  return function random(): number {
    let t = (state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extended random utilities built on top of a seeded PRNG.
 */
export function createRandomUtils(seed: number) {
  const random = createRandom(seed);

  return {
    /** Raw random number between 0 and 1 */
    random,

    /** Random float between min and max */
    float(min: number, max: number): number {
      return min + random() * (max - min);
    },

    /** Random integer between min and max (inclusive) */
    int(min: number, max: number): number {
      return Math.floor(min + random() * (max - min + 1));
    },

    /** Random boolean with optional probability (default 0.5) */
    bool(probability = 0.5): boolean {
      return random() < probability;
    },

    /** Pick a random element from an array */
    pick<T>(array: readonly T[]): T {
      return array[Math.floor(random() * array.length)];
    },

    /** Shuffle an array (returns new array) */
    shuffle<T>(array: readonly T[]): T[] {
      const result = [...array];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    },

    /** Random point in a rectangle */
    point(
      minX: number,
      maxX: number,
      minY: number,
      maxY: number
    ): { x: number; y: number } {
      return {
        x: minX + random() * (maxX - minX),
        y: minY + random() * (maxY - minY),
      };
    },

    /** Gaussian (normal) distribution using Box-Muller transform */
    gaussian(mean = 0, stdDev = 1): number {
      const u1 = random();
      const u2 = random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return z0 * stdDev + mean;
    },
  };
}
