"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneProps } from "./types";
import type { Health } from "@/lib/twin/health";
import { FloorPlate, ConveyorBelt, MotorBlock, SensorStela, Selectable, NodeLabel, PackageMesh, MicroLabel, MAT, metalColor, emissiveFor } from "./shared";

const P: Record<string, [number, number, number]> = {
  "vl-in": [-5.0, 0, 0], "vl-wrap": [-1.6, 0, 0], "vl-tunnel": [1.8, 0, 0], "vl-out": [5.2, 0, 0],
  "vl-gear": [-1.6, 0, 1.9], "vl-motor": [-3.2, 0, 2.4], "vl-enc": [-4.0, 0, -1.3], "vl-l1": [4.4, 0, -1.3],
};

function Packages({ count, speed, playing, blocked }: { count: number; speed: number; playing: boolean; blocked: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (playing && !blocked) t.current += dt * speed * 0.08;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const u = (i / count + t.current) % 1;
      const x = -7 + u * 14;
      g.position.set(x, 0.85 + (Math.abs(x - 1.8) < 1.4 ? 0.05 : 0), 0);
    });
  });
  return <>{Array.from({ length: count }, (_, i) => <group key={i} ref={(el) => { refs.current[i] = el; }}><PackageMesh wrapped={i % 3 === 0} blocked={blocked && i === 2} /></group>)}</>;
}

function Tunnel({ h, sel, hot }: { h: Health; sel: boolean; hot: boolean }) {
  const core = useRef<THREE.MeshStandardMaterial>(null);
  const [em, ei] = emissiveFor(h, sel);
  useFrame(({ clock }) => { if (core.current) core.current.emissiveIntensity = (hot ? 1.4 : 0.7) + Math.sin(clock.elapsedTime * (hot ? 4 : 1.5)) * 0.25; });
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[2.8, 1.7, 1.6]} />
        <meshStandardMaterial color={metalColor(h, sel)} emissive={em} emissiveIntensity={ei} transparent opacity={0.94} {...MAT.brushed} />
      </mesh>
      <mesh position={[0, 1.05, 0.81]}>
        <planeGeometry args={[2.4, 0.5]} />
        <meshStandardMaterial ref={core} color="#7c2d12" emissive="#f97316" emissiveIntensity={0.8} />
      </mesh>
      {[-0.8, 0, 0.8].map((x) => <mesh key={x} position={[x, 2.15, 0]}><cylinderGeometry args={[0.22, 0.22, 0.2, 18]} /><meshStandardMaterial color="#6b7580" {...MAT.cast} /></mesh>)}
    </group>
  );
}

export function Vl3Scene({ twin, selected, onSelect, showSensors, showLabels, bottleBudget, playing }: SceneProps) {
  const H = (id: string): Health => twin.components.find((c) => c.id === id)?.health ?? "OK";
  const L = (id: string) => twin.components.find((c) => c.id === id)?.label ?? id;
  const sel = (id: string) => selected === id;
  const speed = (twin.speedPercent / 100) * 1.15;
  const hot = twin.predictedTempC > 55 || H("vl-tunnel") !== "OK";
  const gear = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (playing && gear.current) gear.current.rotation.z += dt * speed * 2; });

  const sp = (id: string, node: React.ReactNode, y = 1.4, ring = 0.6) => (
    <Selectable key={id} id={id} health={H(id)} selected={sel(id)} onSelect={onSelect} position={P[id]} ringRadius={ring}>
      {node}
      <NodeLabel text={L(id)} y={y} show={showLabels} />
    </Selectable>
  );

  return (
    <group>
      <FloorPlate size={22} />
      {sp("vl-in", <ConveyorBelt length={4.5} width={1.0} speed={speed} playing={playing} />, 1.0, 1.2)}
      {sp("vl-wrap", (
        <group>
          <mesh position={[0, 1.0, -0.7]}><boxGeometry args={[1.6, 2.0, 0.12]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>
          <mesh position={[0, 1.8, -0.4]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.35, 0.35, 1.2, 24]} /><meshStandardMaterial color="#2a3038" {...MAT.rubber} /></mesh>
          <mesh position={[0, 1.8, -0.4]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.08, 0.08, 1.3, 12]} /><meshStandardMaterial color="#fde68a" metalness={0.6} roughness={0.3} /></mesh>
          <ConveyorBelt length={1.8} width={1.0} speed={speed} playing={playing} />
        </group>
      ), 2.3, 1.0)}
      {sp("vl-tunnel", <Tunnel h={H("vl-tunnel")} sel={sel("vl-tunnel")} hot={hot} />, 2.3, 1.6)}
      {sp("vl-out", <ConveyorBelt length={4.0} width={1.0} speed={speed} playing={playing} />, 1.0, 1.2)}
      {sp("vl-gear", (<group><mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.0, 0.9, 0.85]} /><meshStandardMaterial color={metalColor(H("vl-gear"), sel("vl-gear"))} {...MAT.cast} /></mesh><mesh ref={gear} position={[0, 0.55, 0.45]}><torusGeometry args={[0.25, 0.06, 8, 12]} /><meshStandardMaterial color="#dce2ea" {...MAT.stainless} /></mesh></group>), 1.2, 0.7)}
      {sp("vl-motor", <MotorBlock health={H("vl-motor")} selected={sel("vl-motor")} pulseFault />, 1.0, 0.7)}
      {showSensors && ["vl-enc", "vl-l1"].map((id) => sp(id, <SensorStela health={H(id)} selected={sel(id)} />, 1.2, 0.3))}
      <mesh position={[1.8, 0.85, 0]}><boxGeometry args={[2.8, 0.04, 0.9]} /><meshStandardMaterial color="#1c1c1e" {...MAT.rubber} /></mesh>
      <Packages count={Math.min(bottleBudget, Math.max(6, Math.round(twin.speedPercent / 8)))} speed={speed} playing={playing} blocked={twin.tipRiskPct > 35} />
      <MicroLabel text={`VL-3 · ${twin.source}`} position={[-6.5, 0.05, 1.6]} />
    </group>
  );
}
