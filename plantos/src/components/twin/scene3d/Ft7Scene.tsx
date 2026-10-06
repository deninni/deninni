"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneProps } from "./types";
import type { Health } from "@/lib/twin/health";
import { FloorPlate, ConveyorBelt, MotorBlock, SensorStela, Selectable, NodeLabel, PackageMesh, MicroLabel } from "./shared";

const P: Record<string, [number, number, number]> = {
  "ft-seg-a": [-5.2, 0, 0], "ft-seg-b": [0.2, 0, 0], "ft-seg-c": [5.6, 0, 0],
  "ft-m-a": [-5.2, 0, 2.4], "ft-m-b": [0.2, 0, 2.4], "ft-m-c": [5.6, 0, 2.4],
  "ft-ls1": [-2.5, 0, -1.3], "ft-ls2": [2.9, 0, -1.3],
};

function Packages({ count, speed, playing, blocked }: { count: number; speed: number; playing: boolean; blocked: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(0);
  useFrame((_, dt) => {
    if (playing) t.current += dt * speed * 0.07;
    refs.current.forEach((g, i) => {
      if (!g) return;
      let u = (i / count + t.current) % 1;
      if (blocked && u > 0.45 && u < 0.6) u = 0.45 + (i % 3) * 0.02;
      const x = -7.5 + u * 15;
      g.position.set(x, 0.85, Math.abs(x - 0.2) < 1.5 ? Math.sin(x * 2.2) * 0.22 : 0);
    });
  });
  return <>{Array.from({ length: count }, (_, i) => <group key={i} ref={(el) => { refs.current[i] = el; }}><PackageMesh blocked={blocked && i % 5 === 0} /></group>)}</>;
}

export function Ft7Scene({ twin, selected, onSelect, showSensors, showLabels, bottleBudget, playing }: SceneProps) {
  const H = (id: string): Health => twin.components.find((c) => c.id === id)?.health ?? "OK";
  const L = (id: string) => twin.components.find((c) => c.id === id)?.label ?? id;
  const sel = (id: string) => selected === id;
  const speed = (twin.speedPercent / 100) * 1.15;
  const sp = (id: string, node: React.ReactNode, y = 1.4, ring = 0.6) => (
    <Selectable key={id} id={id} health={H(id)} selected={sel(id)} onSelect={onSelect} position={P[id]} ringRadius={ring}>
      {node}
      <NodeLabel text={L(id)} y={y} show={showLabels} />
    </Selectable>
  );
  const jam = H("ft-seg-b") !== "OK" || twin.tipRiskPct > 40;
  return (
    <group>
      <FloorPlate size={24} />
      {sp("ft-seg-a", <ConveyorBelt length={4.2} width={1.05} speed={speed} playing={playing} />, 1.0, 1.2)}
      {sp("ft-seg-b", <ConveyorBelt length={4.6} width={1.15} speed={speed * 1.05} playing={playing && !jam} />, 1.0, 1.3)}
      {sp("ft-seg-c", <ConveyorBelt length={4.2} width={1.05} speed={speed} playing={playing} />, 1.0, 1.2)}
      {(["ft-m-a", "ft-m-b", "ft-m-c"] as const).map((id) => sp(id, <MotorBlock health={H(id)} selected={sel(id)} pulseFault />, 1.0, 0.7))}
      {showSensors && ["ft-ls1", "ft-ls2"].map((id) => sp(id, <SensorStela health={H(id)} selected={sel(id)} />, 1.2, 0.3))}
      <Packages count={Math.min(bottleBudget, 18)} speed={speed} playing={playing} blocked={jam} />
      <MicroLabel text={`FT-7 · ${twin.source} · Retrofit`} position={[-7, 0.05, 1.7]} />
    </group>
  );
}
