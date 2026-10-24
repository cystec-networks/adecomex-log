// Test-runner declarations only; do not include Bun runtime globals in the app.
declare module "bun:test" {
  export const mock: { module: (path: string, factory: () => unknown) => void };
  export function test(name: string, run: () => void | Promise<void>): void;
  export function beforeEach(run: () => void): void;
  export function expect(value: unknown): {
    toHaveLength(length: number): void;
    toBe(value: unknown): void;
    toContain(value: unknown): void;
    toEqual(value: unknown): void;
    rejects: { toThrow(message: string): Promise<void> };
  };
}