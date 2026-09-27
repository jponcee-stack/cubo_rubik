export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
export const CAPTURE_ORDER: Face[] = ['F', 'R', 'B', 'L', 'U', 'D'];
export type V3 = [number, number, number];
export type ColorName = 'white' | 'yellow' | 'red' | 'orange' | 'blue' | 'green';
export const COLORS: ColorName[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green'];

export const FACE_LABELS: Record<Face, string> = {
  F: 'Frente', R: 'Derecha', B: 'Atrás', L: 'Izquierda', U: 'Arriba', D: 'Abajo',
};

// Standard Western scheme, used only for the demo scramble and the initial palette order.
export const FACE_COLORS: Record<Face, ColorName> = {
  U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue',
};

export function faceletIndex(face: Face, r: number, c: number): number {
  return FACES.indexOf(face) * 9 + r * 3 + c;
}

/**
 * Maps a facelet (face + row + col, row-major as seen looking straight at that
 * face with the conventional "up" reference) to its cubie position and outward
 * normal in cube coordinates: x = R(+)/L(-), y = U(+)/D(-), z = F(+)/B(-).
 * Up references: F/R/B/L photos have U on top; U photo has B on top; D photo
 * has F on top. This matches the Kociemba/Singmaster facelet ordering.
 */
export function faceletPosNormal(face: Face, r: number, c: number): { pos: V3; normal: V3 } {
  switch (face) {
    case 'U': return { pos: [c - 1, 1, r - 1], normal: [0, 1, 0] };
    case 'D': return { pos: [c - 1, -1, 1 - r], normal: [0, -1, 0] };
    case 'F': return { pos: [c - 1, 1 - r, 1], normal: [0, 0, 1] };
    case 'B': return { pos: [1 - c, 1 - r, -1], normal: [0, 0, -1] };
    case 'R': return { pos: [1, 1 - r, 1 - c], normal: [1, 0, 0] };
    case 'L': return { pos: [-1, 1 - r, c - 1], normal: [-1, 0, 0] };
  }
}

const key = (p: V3, n: V3) => `${p.join(',')}|${n.join(',')}`;
const IDX = new Map<string, number>();
for (const f of FACES)
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const { pos, normal } = faceletPosNormal(f, r, c);
      IDX.set(key(pos, normal), faceletIndex(f, r, c));
    }

export function faceletAt(pos: V3, normal: V3): number {
  return IDX.get(key(pos, normal))!;
}

/** Signed 90-degree rotation of an integer vector about +axis (right-hand rule). */
export function rotVec(v: V3, axis: 0 | 1 | 2, dir: 1 | -1): V3 {
  const [x, y, z] = v;
  if (axis === 0) return dir === 1 ? [x, -z, y] : [x, z, -y];
  if (axis === 1) return dir === 1 ? [z, y, -x] : [-z, y, x];
  return dir === 1 ? [-y, x, z] : [y, -x, z];
}

/** Applies k quarter-turns of +90deg about +axis to v (k may be negative). */
export function rotVecK(v: V3, axis: 0 | 1 | 2, k: number): V3 {
  let out = v;
  const n = ((k % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = rotVec(out, axis, 1);
  return out;
}

interface MoveSpec { axis: 0 | 1 | 2; layer: number; dir: 1 | -1 }
// dir is the signed quarter-turn about +axis that performs the face turn
// (clockwise as seen looking at that face from outside).
export const MOVES: Record<Face, MoveSpec> = {
  U: { axis: 1, layer: 1, dir: -1 },
  D: { axis: 1, layer: -1, dir: 1 },
  R: { axis: 0, layer: 1, dir: -1 },
  L: { axis: 0, layer: -1, dir: 1 },
  F: { axis: 2, layer: 1, dir: -1 },
  B: { axis: 2, layer: -1, dir: 1 },
};

export interface ParsedMove { axis: 0 | 1 | 2; layer: number; turns: number }

export function parseMove(token: string): ParsedMove {
  const spec = MOVES[token[0] as Face];
  const mult = token.includes('2') ? 2 : /['’]/.test(token) ? -1 : 1;
  return { axis: spec.axis, layer: spec.layer, turns: spec.dir * mult };
}

export function invertMove(m: ParsedMove): ParsedMove {
  return { ...m, turns: -m.turns };
}

/** Applies a move to a 54-entry facelet-color array (Kociemba ordering). */
export function applyMoveColors(colors: ColorName[], m: ParsedMove): ColorName[] {
  const next = colors.slice();
  for (const f of FACES)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const { pos, normal } = faceletPosNormal(f, r, c);
        if (pos[m.axis] !== m.layer) continue;
        const sp = rotVecK(pos, m.axis, -m.turns);
        const sn = rotVecK(normal, m.axis, -m.turns);
        next[faceletIndex(f, r, c)] = colors[faceletAt(sp, sn)];
      }
  return next;
}

export function solvedColors(): ColorName[] {
  const out = new Array<ColorName>(54);
  for (const f of FACES)
    for (let i = 0; i < 9; i++) out[faceletIndex(f, Math.floor(i / 3), i % 3)] = FACE_COLORS[f];
  return out;
}

/** Random legal cube state (colors in Kociemba order) for the demo button. */
export function scrambleColors(n = 25): ColorName[] {
  let colors = solvedColors();
  let prev: Face | null = null;
  for (let i = 0; i < n; i++) {
    let f = FACES[Math.floor(Math.random() * 6)];
    while (f === prev) f = FACES[Math.floor(Math.random() * 6)];
    prev = f;
    const suffix = ['', "'", '2'][Math.floor(Math.random() * 3)];
    colors = applyMoveColors(colors, parseMove(f + suffix));
  }
  return colors;
}

export const DIR_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;
export type DirKey = (typeof DIR_KEYS)[number];
const NORMAL_TO_KEY: Record<string, DirKey> = {
  '1,0,0': 'px', '-1,0,0': 'nx', '0,1,0': 'py',
  '0,-1,0': 'ny', '0,0,1': 'pz', '0,0,-1': 'nz',
};
const DIRS: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export interface Cubie {
  id: number;
  pos: V3;
  colors: Partial<Record<DirKey, ColorName>>;
}

/** Builds the 27 cubies (26 rendered) from 54 facelet colors in Kociemba order. */
export function buildCubies(colors: ColorName[]): Cubie[] {
  const cubies: Cubie[] = [];
  let id = 0;
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const pos: V3 = [x, y, z];
        const cs: Cubie['colors'] = {};
        for (const n of DIRS) {
          const ax = n.findIndex((v) => v !== 0);
          if (pos[ax] === n[ax]) cs[NORMAL_TO_KEY[n.join(',')]] = colors[faceletAt(pos, n)];
        }
        cubies.push({ id: id++, pos, colors: cs });
      }
  return cubies;
}
