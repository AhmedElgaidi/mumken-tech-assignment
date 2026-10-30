import { MULBERRY32_INCREMENT, UINT32_RANGE } from "../constants/mock-classifier/seeded-random.constant";

/** Small seedable PRNG (mulberry32), so mock latency and failures are reproducible. */
export class SeededRandomUtil {
  /**
   * Creates a generator that repeats the same sequence for the same seed.
   *
   * @param seed - Any integer; it is reduced to an unsigned 32-bit value.
   * @returns A function that returns the next number in `[0, 1)` on each call.
   */
  public static create(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + MULBERRY32_INCREMENT) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
    };
  }
}
