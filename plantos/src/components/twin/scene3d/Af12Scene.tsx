"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SceneProps } from "./types";
import type { Health } from "@/lib/twin/health";
import { FloorPlate, ConveyorBelt, MotorBlock, SensorStela, Selectable, NodeLabel, InstancedPathBottles, MicroLabel, MAT, metalColor, emissiveFor } from "./shared";

/** Weltpositionen der AF-12 (stilisiert, kein Aufmaß). */
export const AF12_WORLD: Record<string, [number, number, number]> = {
  "b-101": [-9.2, 0, 0], "sr-01": [-6.6, 0, 0], "rn-01": [-4.5, 0, 0], "sr-02": [-2.5, 0, 0], "fc-01": [0.2, 0, 0],
  "sr-03": [3.0, 0, 0], "cp-01": [5.0, 0, 0], "lb-01": [6.9, 0, 0], "rj-01": [8.2, 0, 1.35], "b-102": [8.4, 0, 0], "pk-01": [10.6, 0, 0],
  "m-001": [0.2, 0, 3.4], "p-2": [-1.6, 0, 3.4], "fv-01": [0.2, 0, -2.5], "e-stop": [10.8, 0, 2.8],
  "ls-17": [3.0, 0, -1.4], "s-speed": [1.9, 0, 2.2], "tt-214": [-1.3, 0, -2.3],
};

function Spinner({ speed, playing, children, y = 0 }: { speed: number; playing: boolean; children: React.ReactNode; y?: number }) {
  const r = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (playing && r.current) r.current.rotation.y += dt * speed; });
  return <group ref={r} position={[0, y, 0]}>{children}</group>;
}

function StarWheel({ h, sel, speed, playing, scale = 1 }: { h: Health; sel: boolean; speed: number; playing: boolean; scale?: number }) {
  const [em, ei] = emissiveFor(h, sel);
  return (
    <group scale={scale}>
      <mesh position={[0, 0.42, 0]} castShadow><cylinderGeometry args={[0.18, 0.24, 0.84, 16]} /><meshStandardMaterial color="#5c6570" {...MAT.cast} /></mesh>
      <Spinner speed={speed * 1.35} playing={playing} y={0.86}>
        <mesh castShadow><cylinderGeometry args={[0.88, 0.88, 0.04, 36]} /><meshStandardMaterial color={metalColor(h, sel)} emissive={em} emissiveIntensity={ei} {...MAT.stainless} /></mesh>
        <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.82, 0.82, 0.03, 36]} /><meshStandardMaterial color="#c5ced8" {...MAT.brushed} /></mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.74, 0.24, Math.sin(a) * 0.74]} castShadow>
              <cylinderGeometry args={[0.07, 0.08, 0.36, 10]} />
              <meshPhysicalMaterial color="#a8d0e8" transmission={0.5} roughness={0.15} transparent opacity={0.85} />
            </mesh>
          );
        })}
        <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.14, 0.14, 0.3, 16]} /><meshStandardMaterial color="#dce2ea" {...MAT.stainless} /></mesh>
      </Spinner>
    </group>
  );
}

function FillingCarousel({ h, sel, speed, playing, tipRisk }: { h: Health; sel: boolean; speed: number; playing: boolean; tipRisk: number }) {
  const [em, ei] = emissiveFor(h, sel);
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow><cylinderGeometry args={[1.9, 2.0, 0.8, 48]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>
      <Spinner speed={speed * 0.55} playing={playing} y={0.82}>
        <mesh castShadow><cylinderGeometry args={[1.72, 1.72, 0.05, 48]} /><meshStandardMaterial color={metalColor(h, sel)} emissive={em} emissiveIntensity={ei} {...MAT.stainless} /></mesh>
        <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.38, 0.08, 12, 48]} /><meshStandardMaterial color="#dce2ea" {...MAT.stainless} /></mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55;
          const status = tipRisk > 45 && i === 3 ? "blocked" : i % 3 === 0 ? "filling" : "filled";
          const liquid = status === "blocked" ? "#b45353" : status === "filling" ? "#5b9fd4" : "#3d8fc4";
          return (
            <group key={i} position={[x, 0, z]}>
              <mesh position={[0, 0.85, 0]}><cylinderGeometry args={[0.035, 0.035, 0.7, 8]} /><meshStandardMaterial color="#c5ced8" {...MAT.stainless} /></mesh>
              <mesh position={[0, 1.22, 0]}><boxGeometry args={[0.16, 0.14, 0.16]} /><meshStandardMaterial color="#b8c2cc" {...MAT.brushed} /></mesh>
              <mesh position={[0, 0.52, 0]}><coneGeometry args={[0.04, 0.08, 10]} /><meshStandardMaterial color="#dce2ea" {...MAT.stainless} /></mesh>
              <group rotation={[status === "blocked" ? 0.55 : 0, 0, 0]}>
                <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.088, 0.108, 0.44, 14]} /><meshPhysicalMaterial color="#cfe6f5" transmission={0.55} roughness={0.1} thickness={0.2} transparent opacity={0.6} /></mesh>
                <mesh position={[0, status === "filling" ? 0.15 : 0.2, 0]}><cylinderGeometry args={[0.08, 0.098, status === "filling" ? 0.22 : 0.34, 14]} /><meshStandardMaterial color={liquid} roughness={0.2} transparent opacity={0.85} /></mesh>
              </group>
            </group>
          );
        })}
        <mesh position={[0, 1.0, 0]} castShadow><cylinderGeometry args={[0.35, 0.4, 2.0, 24]} /><meshStandardMaterial color="#b8c2cc" {...MAT.stainless} /></mesh>
        <mesh position={[0, 2.05, 0]}><cylinderGeometry args={[0.55, 0.45, 0.25, 24]} /><meshStandardMaterial color="#dce2ea" {...MAT.stainless} /></mesh>
      </Spinner>
      {/* Produkt-Gantry */}
      <mesh position={[0, 2.95, 0]} castShadow><boxGeometry args={[3.8, 0.14, 0.18]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>
      {[-1.9, 1.9].map((x) => <mesh key={x} position={[x, 1.5, 0]} castShadow><boxGeometry args={[0.14, 2.95, 0.14]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>)}
      <mesh position={[0, 2.55, 0]}><cylinderGeometry args={[0.05, 0.05, 0.8, 10]} /><meshStandardMaterial color="#c5ced8" {...MAT.stainless} /></mesh>
      <mesh position={[1.2, 3.15, 0]}><sphereGeometry args={[0.28, 20, 20]} /><meshStandardMaterial color="#dce2ea" {...MAT.stainless} /></mesh>
    </group>
  );
}

function Station({ size, color = "#b8c2cc", h, sel, children }: { size: [number, number, number]; color?: string; h: Health; sel: boolean; children?: React.ReactNode }) {
  const [em, ei] = emissiveFor(h, sel);
  return (
    <group>
      <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={sel ? "#9eb8d4" : h === "WARN" ? "#c4a574" : h === "FAULT" ? "#b87a7a" : color} emissive={em} emissiveIntensity={ei} {...MAT.brushed} />
      </mesh>
      {children}
    </group>
  );
}

function TransferBelt({ from, to }: { from: number; to: number }) {
  const len = Math.abs(to - from);
  return (
    <mesh position={[(from + to) / 2, 0.83, 0]} receiveShadow>
      <boxGeometry args={[len, 0.04, 0.5]} />
      <meshStandardMaterial color="#1c1c1e" {...MAT.rubber} />
    </mesh>
  );
}

export function Af12Scene({ twin, selected, onSelect, showSensors, showLabels, bottleBudget, playing }: SceneProps) {
  const H = (id: string): Health => twin.components.find((c) => c.id === id)?.health ?? "OK";
  const L = (id: string) => twin.components.find((c) => c.id === id)?.label ?? id;
  const speed = (twin.speedPercent / 100) * 1.15;
  const sel = (id: string) => selected === id;
  const P = AF12_WORLD;

  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-10.2, 0, 0), new THREE.Vector3(-6, 0, 0.4), new THREE.Vector3(-2, 0, 0.6), new THREE.Vector3(0.2, 0, 1.6),
    new THREE.Vector3(2.4, 0, 0.6), new THREE.Vector3(6, 0, 0.3), new THREE.Vector3(10.2, 0, 0),
  ]), []);

  const sp = (id: string, node: React.ReactNode, y = 1.4, ring = 0.6) => (
    <Selectable key={id} id={id} health={H(id)} selected={sel(id)} onSelect={onSelect} position={P[id]} ringRadius={ring}>
      {node}
      <NodeLabel text={L(id)} y={y} show={showLabels} />
    </Selectable>
  );

  return (
    <group>
      <FloorPlate size={30} />
      <mesh position={[0, 0.005, 2.55]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[22, 0.1]} /><meshBasicMaterial color="#c9a227" transparent opacity={0.55} /></mesh>

      {sp("b-101", <ConveyorBelt length={3.2} speed={speed} playing={playing} />, 1.0, 1.0)}
      {sp("sr-01", <StarWheel h={H("sr-01")} sel={sel("sr-01")} speed={speed} playing={playing} />, 1.3, 1.0)}
      {sp("rn-01", (
        <Station size={[1.6, 1.3, 1.6]} h={H("rn-01")} sel={sel("rn-01")}>
          <Spinner speed={speed} playing={playing} y={1.3}><mesh castShadow><cylinderGeometry args={[0.95, 0.95, 0.12, 32]} /><meshStandardMaterial color="#c5ced8" {...MAT.stainless} /></mesh></Spinner>
          <mesh position={[0, 1.85, 0]}><cylinderGeometry args={[0.7, 0.95, 0.5, 32, 1, true]} /><meshPhysicalMaterial color="#88b4d0" transmission={0.4} roughness={0.2} transparent opacity={0.35} side={THREE.DoubleSide} /></mesh>
        </Station>
      ), 2.0, 1.1)}
      {sp("sr-02", <StarWheel h={H("sr-02")} sel={sel("sr-02")} speed={speed} playing={playing} scale={0.92} />, 1.3, 1.0)}
      {sp("fc-01", <FillingCarousel h={H("fc-01")} sel={sel("fc-01")} speed={speed} playing={playing} tipRisk={twin.tipRiskPct} />, 3.1, 2.1)}
      {sp("sr-03", <StarWheel h={H("sr-03")} sel={sel("sr-03")} speed={speed} playing={playing} scale={0.92} />, 1.3, 1.0)}
      {sp("cp-01", (
        <Station size={[1.3, 1.2, 1.3]} h={H("cp-01")} sel={sel("cp-01")}>
          <Spinner speed={speed * 1.1} playing={playing} y={1.6}>
            {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <mesh key={i} position={[Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48]}><cylinderGeometry args={[0.06, 0.06, 0.6, 10]} /><meshStandardMaterial color="#6b7580" {...MAT.cast} /></mesh>; })}
          </Spinner>
          <mesh position={[0.45, 2.3, -0.3]}><coneGeometry args={[0.35, 0.5, 20, 1, true]} /><meshStandardMaterial color="#b8c2cc" {...MAT.brushed} side={THREE.DoubleSide} /></mesh>
        </Station>
      ), 2.6, 0.9)}
      {sp("lb-01", (
        <Station size={[1.4, 1.1, 0.7]} h={H("lb-01")} sel={sel("lb-01")}>
          <mesh position={[0, 1.35, -0.45]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.3, 0.3, 0.12, 24]} /><meshStandardMaterial color="#d4c4a0" {...MAT.paint} /></mesh>
          <mesh position={[0.4, 1.2, 0.2]}><boxGeometry args={[0.6, 0.08, 0.08]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>
        </Station>
      ), 1.8, 0.9)}
      {sp("rj-01", (
        <Station size={[0.6, 0.9, 0.5]} h={H("rj-01")} sel={sel("rj-01")}>
          <mesh position={[0, 0.95, -0.35]}><boxGeometry args={[0.18, 0.1, 0.3]} /><meshStandardMaterial color="#c07040" {...MAT.paint} /></mesh>
          <mesh position={[0, 0.25, 0.45]}><boxGeometry args={[0.6, 0.5, 0.5]} /><meshStandardMaterial color="#4a5560" {...MAT.paint} /></mesh>
        </Station>
      ), 1.2, 0.6)}
      {sp("b-102", <ConveyorBelt length={2.6} speed={speed} playing={playing} />, 1.0, 1.0)}
      {sp("pk-01", (
        <Station size={[1.6, 1.4, 0.8]} h={H("pk-01")} sel={sel("pk-01")}>
          <mesh position={[0, 2.1, 0]}><boxGeometry args={[1.8, 0.1, 0.1]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>
          {[-0.85, 0.85].map((x) => <mesh key={x} position={[x, 1.75, 0]}><boxGeometry args={[0.08, 0.7, 0.08]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh>)}
        </Station>
      ), 2.4, 1.0)}

      {sp("m-001", <MotorBlock health={H("m-001")} selected={sel("m-001")} pulseFault />, 1.0, 0.7)}
      {sp("p-2", (<group><mesh position={[0, 0.3, 0]} castShadow><cylinderGeometry args={[0.26, 0.3, 0.55, 20]} /><meshStandardMaterial color={metalColor(H("p-2"), sel("p-2"))} {...MAT.cast} /></mesh><mesh position={[0, 0.65, 0]}><sphereGeometry args={[0.2, 16, 16]} /><meshStandardMaterial color="#8a949e" {...MAT.brushed} /></mesh></group>), 1.0, 0.5)}
      {sp("fv-01", <mesh position={[0, 0.33, 0]} castShadow><boxGeometry args={[0.4, 0.65, 0.35]} /><meshStandardMaterial color="#b8c2cc" emissive="#5a8fa3" emissiveIntensity={0.15} {...MAT.brushed} /></mesh>, 0.9, 0.45)}
      {sp("e-stop", (<group><mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.06, 0.06, 1.1, 10]} /><meshStandardMaterial color="#c9a227" {...MAT.paint} /></mesh><mesh position={[0, 1.15, 0]}><sphereGeometry args={[0.12, 16, 16]} /><meshStandardMaterial color="#dc2626" emissive="#ef4444" emissiveIntensity={0.5} /></mesh></group>), 1.3, 0.4)}

      {showSensors && ["ls-17", "s-speed", "tt-214"].map((id) => sp(id, <SensorStela health={H(id)} selected={sel(id)} />, 1.2, 0.3))}

      {[[-9.2 + 1.6, -6.6 - 0.9], [-6.6 + 0.9, -4.5 - 0.8], [-4.5 + 0.8, -2.5 - 0.8], [3.0 + 0.8, 5.0 - 0.65], [5.0 + 0.65, 6.9 - 0.7]].map(([a, b]) => <TransferBelt key={a} from={a} to={b} />)}

      <mesh>
        <tubeGeometry args={[curve, 120, 0.02, 6, false]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.1} />
      </mesh>
      <InstancedPathBottles curve={curve} count={Math.round(bottleBudget * 0.75)} speed={speed} playing={playing} tipRisk={twin.tipRiskPct} />
      <MicroLabel text={`AF-12 · ${twin.source} · ${twin.bottleFormat.replace(".", ",")} L`} position={[-9.5, 0.05, 2.2]} />
    </group>
  );
}
