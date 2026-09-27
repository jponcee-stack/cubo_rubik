import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS, FACE_LABELS, type ColorName, type Face } from '../cube/mapping';
import { COLOR_HEX, COLOR_NAMES_ES, classifyColor, sampleRegion } from '../vision/classify';

type RGB = [number, number, number];

interface Props {
  face: Face;
  hint: string;
  cells: (ColorName | null)[];
  centers: Partial<Record<ColorName, RGB>>;
  onCells(cells: (ColorName | null)[], centerRgb?: RGB): void;
}

interface Grid { x: number; y: number; size: number }

export default function FaceCapture({ face, hint, cells, centers, onCells }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [paint, setPaint] = useState<ColorName | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const srcCanvas = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !srcCanvas.current) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(srcCanvas.current, 0, 0);
  }, []);

  useEffect(draw, [draw, dims]);

  const onFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 520;
      const scale = Math.min(1, max / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      off.getContext('2d')!.drawImage(img, 0, 0, w, h);
      srcCanvas.current = off;
      setDims({ w, h });
      const size = Math.min(w, h) * 0.6;
      setGrid({ x: (w - size) / 2, y: (h - size) / 2, size });
      setImgUrl(url);
      requestAnimationFrame(draw);
    };
    img.src = url;
  };

  const detect = () => {
    if (!srcCanvas.current || !grid) return;
    const ctx = srcCanvas.current.getContext('2d')!;
    const out: (ColorName | null)[] = [];
    const cell = grid.size / 3;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        const rgb = sampleRegion(ctx, grid.x + cell * (c + 0.5), grid.y + cell * (r + 0.5), Math.max(3, cell * 0.12));
        out.push(classifyColor(rgb, centers));
      }
    const cx = grid.x + cell * 1.5;
    const cy = grid.y + cell * 1.5;
    onCells(out, sampleRegion(ctx, cx, cy, Math.max(3, cell * 0.12)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!grid) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - grid.x, dy: e.clientY - grid.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !grid || !dims) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = dims.w / rect.width;
    const sy = dims.h / rect.height;
    const x = (e.clientX - rect.left) * sx - drag.current.dx;
    const y = (e.clientY - rect.top) * sy - drag.current.dy;
    setGrid({ ...grid, x: Math.max(0, Math.min(dims.w - grid.size, x)), y: Math.max(0, Math.min(dims.h - grid.size, y)) });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <section className="card">
      <h3>{FACE_LABELS[face]} <span className="muted">({face})</span></h3>
      <p className="hint">{hint}</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {!imgUrl ? (
        <button className="btn ghost big" onClick={() => fileRef.current?.click()}>
          📷 Subir o sacar foto
        </button>
      ) : (
        <div className="photo-wrap">
          <div
            className="photo-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <canvas ref={canvasRef} width={dims?.w} height={dims?.h} />
            {grid && dims && (
              <div
                className="grid-overlay"
                style={{
                  left: `${(grid.x / dims.w) * 100}%`,
                  top: `${(grid.y / dims.h) * 100}%`,
                  width: `${(grid.size / dims.w) * 100}%`,
                  height: `${(grid.size / dims.h) * 100}%`,
                }}
              >
                {Array.from({ length: 9 }).map((_, i) => <div key={i} />)}
              </div>
            )}
          </div>
          <label className="size-row">
            Tamaño grilla
            <input
              type="range"
              min={dims ? Math.min(dims.w, dims.h) * 0.15 : 40}
              max={dims ? Math.min(dims.w, dims.h) : 300}
              value={grid?.size ?? 0}
              onChange={(e) => grid && setGrid({ ...grid, size: Number(e.target.value) })}
            />
          </label>
          <div className="row">
            <button className="btn" onClick={detect}>Detectar colores</button>
            <button className="btn ghost" onClick={() => { setImgUrl(null); setGrid(null); srcCanvas.current = null; }}>
              Cambiar foto
            </button>
          </div>
        </div>
      )}

      <div className="swatches">
        {cells.map((cell, i) => (
          <button
            key={i}
            className="swatch"
            style={{ background: cell ? COLOR_HEX[cell] : '#26262e' }}
            title={cell ? COLOR_NAMES_ES[cell] : 'sin color'}
            onClick={() => {
              if (!paint) return;
              const next = cells.slice();
              next[i] = paint;
              onCells(next);
            }}
          />
        ))}
      </div>

      <div className="palette">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`dot ${paint === c ? 'sel' : ''}`}
            style={{ background: COLOR_HEX[c] }}
            title={COLOR_NAMES_ES[c]}
            onClick={() => setPaint(paint === c ? null : c)}
          />
        ))}
        <span className="muted small">{paint ? `pintando ${COLOR_NAMES_ES[paint]}` : 'elegí un color para corregir'}</span>
      </div>
    </section>
  );
}
