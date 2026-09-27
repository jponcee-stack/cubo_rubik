import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Group, Mesh, Quaternion, Vector3 } from 'three';
import type { MutableRefObject } from 'react';
import {
  DIR_KEYS, rotVecK, parseMove, invertMove,
  type Cubie, type ParsedMove, type V3,
} from '../cube/mapping';
import { COLOR_HEX } from '../vision/classify';

export interface ViewerHandle {
  forward(): void;
  back(): void;
  reset(): void;
  busy(): boolean;
}

interface Props {
  cubies: Cubie[];
  moves: string[];
  onApplied?(index: number): void;
}

const AXIS_VECS: Vector3[] = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const MOVE_SECONDS = 0.34;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface CubieSim { pos: V3; quat: Quaternion }
interface Anim { m: ParsedMove; t: number; starts: Map<number, Quaternion> }

interface SceneRefs {
  sim: MutableRefObject<Map<number, CubieSim>>;
  meshes: MutableRefObject<Map<number, Mesh>>;
  queue: MutableRefObject<ParsedMove[]>;
  anim: MutableRefObject<Anim | null>;
  group: MutableRefObject<Group | null>;
}

function Animator({ refs }: { refs: SceneRefs }) {
  const { sim, meshes, queue, anim, group } = refs;

  useFrame(({ clock }, dt) => {
    if (group.current) {
      const t = clock.elapsedTime;
      group.current.position.y = Math.sin(t * 0.9) * 0.07;
      group.current.rotation.y += dt * 0.12;
      group.current.rotation.x = Math.sin(t * 0.5) * 0.04;
    }

    if (!anim.current && queue.current.length > 0) {
      const m = queue.current.shift()!;
      const starts = new Map<number, Quaternion>();
      for (const [id, s] of sim.current) {
        if (s.pos[m.axis] === m.layer) starts.set(id, s.quat.clone());
      }
      anim.current = { m, t: 0, starts };
    }

    const a = anim.current;
    if (!a) return;
    a.t += dt / MOVE_SECONDS;
    const e = ease(Math.min(1, a.t));
    const qd = new Quaternion().setFromAxisAngle(AXIS_VECS[a.m.axis], (a.m.turns * Math.PI) / 2 * e);
    for (const [id, start] of a.starts) {
      const mesh = meshes.current.get(id);
      if (mesh) mesh.quaternion.copy(qd).multiply(start);
    }
    if (a.t >= 1) {
      const full = new Quaternion().setFromAxisAngle(AXIS_VECS[a.m.axis], (a.m.turns * Math.PI) / 2);
      for (const [id, start] of a.starts) {
        const s = sim.current.get(id)!;
        const mesh = meshes.current.get(id)!;
        s.quat.copy(full).multiply(start);
        s.pos = rotVecK(s.pos, a.m.axis, a.m.turns);
        mesh.position.set(...s.pos);
        mesh.quaternion.copy(s.quat);
      }
      anim.current = null;
    }
  });

  return null;
}

export const CubeViewer = forwardRef<ViewerHandle, Props>(function CubeViewer({ cubies, moves, onApplied }, ref) {
  const sim = useRef<Map<number, CubieSim>>(new Map());
  const meshes = useRef<Map<number, Mesh>>(new Map());
  const queue = useRef<ParsedMove[]>([]);
  const anim = useRef<Anim | null>(null);
  const applied = useRef(0);
  const movesRef = useRef(moves);
  const group = useRef<Group>(null);
  movesRef.current = moves;

  const rebuild = () => {
    sim.current.clear();
    for (const c of cubies) sim.current.set(c.id, { pos: [...c.pos] as V3, quat: new Quaternion() });
    for (const c of cubies) {
      const mesh = meshes.current.get(c.id);
      if (mesh) {
        mesh.position.set(...c.pos);
        mesh.quaternion.identity();
      }
    }
    queue.current = [];
    anim.current = null;
    applied.current = 0;
    onApplied?.(0);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(rebuild, [cubies]);

  const push = (m: ParsedMove, delta: number) => {
    queue.current.push(m);
    applied.current += delta;
    onApplied?.(applied.current);
  };

  useImperativeHandle(ref, () => ({
    forward() {
      if (applied.current < movesRef.current.length) push(parseMove(movesRef.current[applied.current]), 1);
    },
    back() {
      if (applied.current > 0) {
        push(invertMove(parseMove(movesRef.current[applied.current - 1])), -1);
      }
    },
    reset: rebuild,
    busy: () => queue.current.length > 0 || anim.current !== null,
  }));

  const refs: SceneRefs = { sim, meshes, queue, anim, group };

  return (
    <Canvas camera={{ position: [4.6, 3.8, 5.4], fov: 42 }} dpr={[1, 2]}>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 9, 7]} intensity={1.4} />
      <directionalLight position={[-7, -4, -6]} intensity={0.45} />
      <group ref={group}>
        {cubies.map((cb) => (
          <mesh
            key={cb.id}
            position={cb.pos}
            ref={(m) => {
              if (m) meshes.current.set(cb.id, m);
              else meshes.current.delete(cb.id);
            }}
          >
            <boxGeometry args={[0.96, 0.96, 0.96]} />
            {DIR_KEYS.map((k, i) => (
              <meshStandardMaterial
                key={k}
                attach={`material-${i}`}
                color={cb.colors[k] ? COLOR_HEX[cb.colors[k]!] : '#15151b'}
                roughness={0.35}
                metalness={0.05}
              />
            ))}
          </mesh>
        ))}
      </group>
      <Animator refs={refs} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={4.5} maxDistance={14} />
    </Canvas>
  );
});
