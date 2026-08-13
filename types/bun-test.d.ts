declare module 'bun:test' {
  interface Matchers {
    toBe(expected: unknown): void;
    toBeCloseTo(expected: number): void;
    toEqual(expected: unknown): void;
  }

  export function describe(name: string, callback: () => void): void;
  export function expect(actual: unknown): Matchers;
  export function test(name: string, callback: () => void | Promise<void>): void;
}
