interface Props {
  moves: string[];
  applied: number;
  playing: boolean;
  onBack(): void;
  onForward(): void;
  onPlay(): void;
  onReset(): void;
  onRescan(): void;
}

export default function SolutionPanel({ moves, applied, playing, onBack, onForward, onPlay, onReset, onRescan }: Props) {
  return (
    <aside className="panel">
      <h3>{moves.length === 0 ? '¡Ya está resuelto!' : `Solución: ${moves.length} movimientos`}</h3>
      <div className="controls">
        <button className="btn" onClick={onBack} disabled={applied === 0}>◀ Atrás</button>
        <button className="btn primary" onClick={onForward} disabled={applied >= moves.length}>Siguiente ▶</button>
        <button className="btn" onClick={onPlay} disabled={moves.length === 0}>{playing ? '⏸ Pausar' : '⏵ Reproducir'}</button>
        <button className="btn ghost" onClick={onReset}>⟲ Reiniciar</button>
        <button className="btn ghost" onClick={onRescan}>← Nuevas fotos</button>
      </div>
      <div className="moves">
        {moves.map((m, i) => (
          <span key={i} className={`chip ${i < applied ? 'done' : ''} ${i === applied ? 'next' : ''}`}>{m}</span>
        ))}
      </div>
      <p className="hint">Arrastrá el cubo para girarlo · pinch o rueda para zoom</p>
    </aside>
  );
}
