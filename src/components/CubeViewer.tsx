import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Group, Quaternion, Vector3, type Object3D } from 'three';
import type { MutableRefObject } from 'react';
import {
  DIR_KEYS, rotVecK, parseMove, invertMove,
  type Cubie, type DirKey, type ParsedMove, type V3,
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
const MOVE_SECONDS = 0.36;

// Ease-out with a small overshoot — layer turns settle with a physical "snap".
const ease = (t: number) => {
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const DIR_VEC: Record<DirKey, V3> = {
  px: [1, 0, 0], nx: [-1, 0, 0],
  py: [0, 1, 0], ny: [0, -1, 0],
  pz: [0, 0, 1], nz: [0, 0, -1],
};

interface CubieSim { pos: V3; quat: Quaternion }
interface Anim { m: ParsedMove; t: number; starts: Map<number, Quaternion> }

interface SceneRefs {
  sim: MutableRefObject<Map<number, CubieSim>>;
  meshes: MutableRefObject<Map<number, Object3D>>;
  queue: MutableRefObject<ParsedMove[]>;
  anim: MutableRefObject<Anim | null>;
  group: MutableRefObject<Group | null>;
}

function Animator({ refs }: { refs: SceneRefs }) {
  const { sim, meshes, queue, anim, group } = refs;

  useFrame(({ clock }, dt) => {
    if (group.current) {
      const t = clock.elapsedTime;
      group.current.position.y = Math.sin(t * 0.9) * 0.06;
      group.current.rotation.y += dt * 0.1;
      group.current.rotation.x = Math.sin(t * 0.5) * 0.03;
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

function CubieMesh({ cubie, register }: { cubie: Cubie; register(id: number, o: Object3D | null): void }) {
  return (
    <group position={cubie.pos} ref={(o) => register(cubie.id, o)}>
      {/* black ABS body with rounded edges */}
      <RoundedBox args={[0.97, 0.97, 0.97]} radius={0.06} smoothness={5} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#26262c"
          roughness={0.38}
          metalness={0.05}
          clearcoat={0.55}
          clearcoatRoughness={0.35}
        />
      </RoundedBox>
      {/* glossy sticker tiles floating just above each exposed face */}
      {DIR_KEYS.filter((k) => cubie.colors[k]).map((k) => {
        const n = DIR_VEC[k];
        return (
          <RoundedBox
            key={k}
            args={[0.82, 0.82, 0.045]}
            radius={0.035}
            smoothness={4}
            position={[n[0] * 0.51, n[1] * 0.51, n[2] * 0.51]}
            rotation={[
              n[1] === 1 ? -Math.PI / 2 : n[1] === -1 ? Math.PI / 2 : 0,
              n[0] === 1 ? Math.PI / 2 : n[0] === -1 ? -Math.PI / 2 : 0,
              0,
            ]}
            castShadow
          >
            <meshPhysicalMaterial
              color={COLOR_HEX[cubie.colors[k]!]}
              roughness={0.22}
              metalness={0}
              clearcoat={1}
              clearcoatRoughness={0.12}
            />
          </RoundedBox>
        );
      })}
    </group>
  );
}

export const CubeViewer = forwardRef<ViewerHandle, Props>(function CubeViewer({ cubies, moves, onApplied }, ref) {
  const sim = useRef<Map<number, CubieSim>>(new Map());
  const meshes = useRef<Map<number, Object3D>>(new Map());
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
    <Canvas
      shadows
      camera={{ position: [4.6, 3.8, 5.4], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.15; }}
    >
      {/* studio lighting: key light casts the shadow, fills kill the black look */}
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[6, 9, 7]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-far={30}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-7, -4, -6]} intensity={0.5} />
      <directionalLight position={[-4, 6, -7]} intensity={0.4} />

      {/* local environment map (softboxes) — glossy reflections on the stickers */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={5} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[9, 9, 1]} color="#ffffff" />
        <Lightformer intensity={1.6} position={[-5, 1.5, 2]} rotation-y={Math.PI / 2} scale={[5, 6, 1]} color="#cfdcff" />
        <Lightformer intensity={1.1} position={[5, 0.5, -3]} rotation-y={-Math.PI / 2} scale={[5, 5, 1]} color="#ffe9cf" />
        <Lightformer intensity={0.5} position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[9, 9, 1]} color="#3a3f55" />
      </Environment>

      <group ref={group}>
        {cubies.map((cb) => (
          <CubieMesh
            key={cb.id}
            cubie={cb}
            register={(id, o) => {
              if (o) meshes.current.set(id, o);
              else meshes.current.delete(id);
            }}
          />
        ))}
      </group>

      {/* soft contact shadow under the floating cube */}
      <ContactShadows position={[0, -2.9, 0]} opacity={0.62} scale={12} blur={2.4} far={4.5} resolution={512} frames={Infinity} />

      <Animator refs={refs} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} minDistance={4.5} maxDistance={14} />
    </Canvas>
  );
});
