// cubejs (Kociemba two-phase) is vendored as a classic script in
// public/vendor/cubejs.js — its UMD pattern needs `this === window`, so it is
// loaded via a plain <script> tag in index.html rather than imported.
interface CubeJs {
  initSolver(): void;
  fromString(facelets: string): { solve(): string };
}

declare global {
  interface Window { Cube: CubeJs }
}

let initialized = false;

/**
 * Solves a cube given as a 54-char facelet string (Kociemba ordering U,R,F,D,L,B).
 * Returns move tokens like ["R", "U'", "F2"]. Throws when the state is invalid.
 */
export function solveFaceletString(facelets: string): string[] {
  if (!initialized) {
    window.Cube.initSolver();
    initialized = true;
  }
  const solution = window.Cube.fromString(facelets).solve().trim();
  return solution ? solution.split(/\s+/) : [];
}
