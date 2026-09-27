import type { ColorName } from '../cube/mapping';

export const COLOR_HEX: Record<ColorName, string> = {
  white: '#f5f5f5',
  yellow: '#ffd500',
  red: '#c41e3a',
  orange: '#ff8800',
  blue: '#0051ba',
  green: '#009e60',
};

export const COLOR_NAMES_ES: Record<ColorName, string> = {
  white: 'blanco', yellow: 'amarillo', red: 'rojo',
  orange: 'naranja', blue: 'azul', green: 'verde',
};

type RGB = [number, number, number];

const CANONICAL: Record<ColorName, RGB> = {
  white: [245, 245, 245],
  yellow: [255, 213, 0],
  red: [196, 30, 58],
  orange: [255, 136, 0],
  blue: [0, 81, 186],
  green: [0, 158, 96],
};

/** Chromaticity coordinates — robust to overall brightness/exposure changes. */
function chroma(rgb: RGB): RGB {
  const s = rgb[0] + rgb[1] + rgb[2] || 1;
  return [rgb[0] / s, rgb[1] / s, rgb[2] / s];
}

function dist(a: RGB, b: RGB): number {
  const ca = chroma(a);
  const cb = chroma(b);
  const luma = Math.abs(a[0] + a[1] + a[2] - (b[0] + b[1] + b[2])) / (3 * 255);
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) + luma * 0.15;
}

/**
 * Classifies a sampled sticker color. When `centers` (rgb anchors taken from the
 * six face-center stickers, which never move) is complete it is used as the
 * palette — lighting-robust — otherwise a canonical palette is used.
 */
export function classifyColor(
  rgb: RGB,
  centers?: Partial<Record<ColorName, RGB>>,
): ColorName {
  const useCenters = centers && Object.keys(centers).length === 6;
  const palette = (useCenters ? centers : CANONICAL) as Record<ColorName, RGB>;
  let best: ColorName = 'white';
  let bestD = Infinity;
  for (const name of Object.keys(palette) as ColorName[]) {
    const d = dist(rgb, palette[name]);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export function sampleRegion(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius = 5,
): RGB {
  const d = ctx.getImageData(
    Math.max(0, Math.round(x - radius)),
    Math.max(0, Math.round(y - radius)),
    radius * 2 + 1,
    radius * 2 + 1,
  ).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    // skip very dark pixels — usually grid lines / gaps between stickers
    if (d[i] + d[i + 1] + d[i + 2] < 60) continue;
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
  }
  if (n === 0) return [0, 0, 0];
  return [r / n, g / n, b / n];
}
