import { useCallback, useMemo, useRef, useState } from 'react';
import FaceCapture from './components/FaceCapture';
import { CubeViewer, type ViewerHandle } from './components/CubeViewer';
import SolutionPanel from './components/SolutionPanel';
import {
  CAPTURE_ORDER, COLORS, FACES, FACE_LABELS, faceletIndex, scrambleColors, solvedColors,
  buildCubies, type ColorName, type Cubie, type Face,
} from './cube/mapping';
import { solveFaceletString } from './cube/solver';
import { COLOR_NAMES_ES } from './vision/classify';

type RGB = [number, number, number];
type Cells = (ColorName | null)[];

const CAPTURE_HINTS: Record<Face, string> = {
  F: 'Con el cubo en la mano, la cara que mira hacia vos.',
  R: 'Girá el cubo hacia la izquierda: la cara derecha mira a la cámara.',
  B: 'Girá una vez más: la cara de atrás mira a la cámara.',
  L: 'Última cara lateral. La de arriba sigue siendo la misma.',
  U: 'Incliná el cubo hacia vos: arriba mira a la cámara (lo de arriba en la foto = cara de atrás).',
  D: 'Incliná el cubo hacia atrás: abajo mira a la cámara (lo de arriba en la foto = cara de frente).',
};

const empty = () => Array<ColorName | null>(9).fill(null);

export default function App() {
  const [slots, setSlots] = useState<Record<Face, Cells>>(
    () => Object.fromEntries(FACES.map((f) => [f, empty()])) as Record<Face, Cells>,
  );
  const [centers, setCenters] = useState<Partial<Record<ColorName, RGB>>>({});
  const [phase, setPhase] = useState<'capture' | 'solve'>('capture');
  const [cubies, setCubies] = useState<Cubie[] | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [applied, setAppliedState] = useState(0);
  const appliedRef = useRef(0);
  const setApplied = useCallback((i: number) => {
    appliedRef.current = i;
    setAppliedState(i);
  }, []);
  const [playing, setPlaying] = useState(false);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewer = useRef<ViewerHandle>(null);
  const timer = useRef<number | null>(null);

  const onCells = useCallback((face: Face) => (cells: Cells, centerRgb?: RGB) => {
    setSlots((s) => ({ ...s, [face]: cells }));
    if (centerRgb && cells[4]) {
      setCenters((c) => ({ ...c, [cells[4] as ColorName]: centerRgb }));
    }
  }, []);

  const loadColors = (colors54: ColorName[]) => {
    const next = Object.fromEntries(FACES.map((f) => [
      f,
      Array.from({ length: 9 }, (_, i) => colors54[faceletIndex(f, Math.floor(i / 3), i % 3)]),
    ])) as Record<Face, Cells>;
    setSlots(next);
    setCubies(buildCubies(colors54));
  };

  const solve = async () => {
    setError(null);
    const counts = new Map<ColorName, number>();
    let missing = false;
    for (const f of FACES)
      for (const cell of slots[f]) {
        if (!cell) missing = true;
        else counts.set(cell, (counts.get(cell) ?? 0) + 1);
      }
    if (missing) return setError('Faltan stickers por completar. Subí fotos o corregí los colores en cada cara.');
    const bad = [...counts.entries()].filter(([, n]) => n !== 9);
    if (bad.length)
      return setError(
        'Cada color tiene que aparecer exactamente 9 veces. Ahora: ' +
          COLORS.map((c) => `${COLOR_NAMES_ES[c]}: ${counts.get(c) ?? 0}`).join(', ') + '.',
      );

    const colorToLetter = {} as Record<ColorName, Face>;
    for (const f of FACES) colorToLetter[slots[f][4]!] = f;

    const facelets = FACES.map((f) => slots[f].map((c) => colorToLetter[c!]).join('')).join('');
    const colors54 = FACES.flatMap((f) => slots[f]) as ColorName[];

    setSolving(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const sol = solveFaceletString(facelets);
      setMoves(sol);
      setCubies(buildCubies(colors54));
      setApplied(0);
      setPhase('solve');
    } catch {
      setError('Ese estado no es un cubo resoluble — probablemente algún sticker se leyó mal. Revisá los colores.');
    } finally {
      setSolving(false);
    }
  };

  const demo = () => loadColors(scrambleColors());
  const demoSolved = () => loadColors(solvedColors());

  const play = () => {
    if (playing) {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
      setPlaying(false);
      return;
    }
    setPlaying(true);
    timer.current = window.setInterval(() => {
      if (!viewer.current) return;
      if (appliedRef.current >= moves.length) {
        window.clearInterval(timer.current!);
        timer.current = null;
        setPlaying(false);
        return;
      }
      viewer.current.forward();
    }, 480);
  };

  const rescan = () => {
    setPhase('capture');
    setMoves([]);
    setApplied(0);
    setError(null);
  };

  const summary = useMemo(
    () => FACES.map((f) => `${FACE_LABELS[f]}: ${slots[f].filter(Boolean).length}/9`).join(' · '),
    [slots],
  );

  if (phase === 'solve' && cubies) {
    return (
      <main className="solve-layout">
        <div className="viewer">
          <CubeViewer ref={viewer} cubies={cubies} moves={moves} onApplied={setApplied} />
        </div>
        <SolutionPanel
          moves={moves}
          applied={applied}
          playing={playing}
          onBack={() => viewer.current?.back()}
          onForward={() => viewer.current?.forward()}
          onPlay={play}
          onReset={() => { viewer.current?.reset(); setApplied(0); }}
          onRescan={rescan}
        />
      </main>
    );
  }

  return (
    <main className="capture-layout">
      <header>
        <h1>Rubik Vision</h1>
        <p className="muted">
          Sacale una foto a cada cara del cubo girándolo siempre alrededor del mismo eje
          (la cara de arriba queda arriba en las 4 laterales). Después ajustá la grilla y tocá
          “Detectar colores”. También podés cargar los colores a mano o probar con un cubo demo.
        </p>
        <p className="muted small">{summary}</p>
        <div className="row center">
          <button className="btn primary" onClick={solve} disabled={solving}>
            {solving ? 'Resolviendo…' : 'Resolver cubo'}
          </button>
          <button className="btn ghost" onClick={demo}>🎲 Cubo aleatorio (demo)</button>
          <button className="btn ghost" onClick={demoSolved}>Cubo resuelto</button>
        </div>
        {error && <p className="error">{error}</p>}
      </header>
      <div className="grid">
        {CAPTURE_ORDER.map((f) => (
          <FaceCapture key={f} face={f} hint={CAPTURE_HINTS[f]} cells={slots[f]} centers={centers} onCells={onCells(f)} />
        ))}
      </div>
      <footer className="muted small">
        Los colores los fijan los centros de cada cara, así que funciona con cualquier esquema de colores.
      </footer>
    </main>
  );
}
