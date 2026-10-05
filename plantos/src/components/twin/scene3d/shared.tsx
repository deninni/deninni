"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Health } from "./types";
import { shortComponentLabel } from "@/lib/twin/layouts";

/** Materialparameter (PBR) – gebürsteter Edelstahl, Guss, Gummi, Lack. */
export const MAT = {
  stainless: { metalness: 0.92, roughness: 0.28 },
  brushed: { metalness: 0.88, roughness: 0.38 },
  cast: { metalness: 0.55, roughness: 0.55 },
  rubber: { metalness: 0.05, roughness: 0.92 },
  paint: { metalness: 0.15, roughness: 0.65 },
} as const;

export const ACCENT = "#5a8fa3";

export function metalColor(h: Health, selected: boolean) {
  if (selected) return "#9eb8d4";
  if (h === "FAULT") return "#b87a7a";
  if (h === "WARN") return "#c4a574";
  return "#b8c2cc";
}

export function emissiveFor(h: Health, selected: boolean): [string, number] {
  if (h === "FAULT") return ["#ef4444", 0.55];
  if (h === "WARN") return ["#f59e0b", 0.4];
  if (selected) return [ACCENT, 0.35];
  return ["#000000", 0];
}

export function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.28} color="#a8b4c4" />
      <directionalLight position={[7, 14, 5]} intensity={1.55} color="#f0f4fa" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <directionalLight position={[-6, 8, -3]} intensity={0.45} color="#9ec5e8" />
      <directionalLight position={[0, 5, -8]} intensity={0.35} />
      <pointLight position={[0, 5.5, 0]} intensity={6} distance={18} color="#dce6f2" />
      <pointLight position={[-5, 4, 2]} intensity={3} distance={12} color="#b8c8dc" />
    </>
  );
}

/** Pulsiert bei WARN/FAULT, Klick wählt, Bodenring bei Selektion. */
export function Selectable({ id, health, selected, onSelect, position, children, ringRadius = 0.6 }: {
  id: string; health: Health; selected: boolean; onSelect: (id: string) => void; position: [number, number, number]; children: ReactNode; ringRadius?: number;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const pulse = health === "WARN" || health === "FAULT";
    const s = pulse ? 1 + Math.sin(clock.elapsedTime * (health === "FAULT" ? 6 : 3)) * 0.012 : 1;
    g.current.scale.setScalar(s);
  });
  return (
    <group position={position}>
      <group ref={g} onClick={(e) => { e.stopPropagation(); onSelect(id); }} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        {children}
      </group>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <ringGeometry args={[ringRadius, ringRadius + 0.14, 48]} />
          <meshBasicMaterial color={ACCENT} transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}

export function NodeLabel({ text, y = 1.4, show }: { text: string; y?: number; show: boolean }) {
  if (!show) return null;
  return (
    <Html position={[0, y + 0.42, 0]} center distanceFactor={14} style={{ pointerEvents: "none" }}>
      <div style={{ fontSize: 8, fontWeight: 500, color: "rgba(232,238,246,.88)", background: "rgba(14,20,30,.22)", backdropFilter: "blur(4px)", border: "1px solid rgba(148,163,184,.2)", borderRadius: 3, padding: "1px 4px", maxWidth: 108, whiteSpace: "nowrap" }}>
        {shortComponentLabel(text)}
      </div>
    </Html>
  );
}

function epoxyTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "#1a1f28");
  g.addColorStop(1, "#12161e");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) {
    x.fillStyle = `rgba(${150 + Math.random() * 60},${160 + Math.random() * 60},${170 + Math.random() * 60},${Math.random() * 0.06})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  x.strokeStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i * 64); x.lineTo(512, i * 64); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function FloorPlate({ size = 30 }: { size?: number }) {
  const tex = useMemo(() => epoxyTexture(), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[size, size * 0.6]} />
        <meshPhysicalMaterial map={tex} color="#7d8794" roughness={0.82} metalness={0.05} clearcoat={0.2} clearcoatRoughness={0.5} />
      </mesh>
      <gridHelper args={[size, size, "#2a3344", "#1a2230"]} position={[0, 0.003, 0]} />
    </group>
  );
}

export function IndustrialBackdrop({ width = 60 }: { width?: number }) {
  const cols = [];
  for (let x = -width / 2 + 4; x <= width / 2 - 4; x += 8) cols.push(x);
  return (
    <group>
      <mesh position={[0, 15, -12]}>
        <planeGeometry args={[width, 30]} />
        <meshStandardMaterial color="#0a0e14" />
      </mesh>
      {cols.map((x) => (
        <group key={x}>
          <mesh position={[x, 4.5, -11.6]}>
            <boxGeometry args={[0.35, 9, 0.35]} />
            <meshStandardMaterial color="#8a949e" {...MAT.paint} />
          </mesh>
          <mesh position={[x + 4, 3, -11.85]}>
            <planeGeometry args={[7.4, 6]} />
            <meshStandardMaterial color="#1a222e" {...MAT.paint} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 9, -11.6]}>
        <boxGeometry args={[width, 0.4, 0.4]} />
        <meshStandardMaterial color="#6b7580" {...MAT.paint} />
      </mesh>
      {[-8, 0, 8].map((x) => (
        <mesh key={x} position={[x, 8.6, -4]}>
          <boxGeometry args={[5, 0.08, 0.3]} />
          <meshStandardMaterial color="#e8eef5" emissive="#e8eef5" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function rubberTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#16181b"; x.fillRect(0, 0, 128, 256);
  x.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); }
  x.strokeStyle = "rgba(255,255,255,0.07)";
  for (let y = 0; y < 256; y += 32) { x.beginPath(); x.moveTo(20, y + 12); x.lineTo(64, y); x.lineTo(108, y + 12); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function ConveyorBelt({ length, width = 0.9, height = 0.85, speed = 1, playing = true }: { length: number; width?: number; height?: number; speed?: number; playing?: boolean }) {
  const tex = useMemo(() => { const t = rubberTexture(); t.repeat.set(1, length * 2); return t; }, [length]);
  useFrame((_, dt) => { if (playing) tex.offset.y -= dt * speed * 0.6; });
  const legs = [];
  for (let x = -length / 2 + 0.3; x <= length / 2 - 0.3; x += Math.max(1.2, length / 3)) legs.push(x);
  return (
    <group>
      <mesh position={[0, height, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} receiveShadow castShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial map={tex} {...MAT.rubber} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[0, height - 0.06, side * (width / 2 + 0.04)]} castShadow>
            <boxGeometry args={[length, 0.16, 0.05]} />
            <meshStandardMaterial color="#b8c2cc" {...MAT.brushed} />
          </mesh>
          <mesh position={[0, height + 0.14, side * (width / 2 - 0.02)]}>
            <boxGeometry args={[length, 0.03, 0.02]} />
            <meshStandardMaterial color="#dce2ea" {...MAT.stainless} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * length / 2, height - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, width + 0.06, 16]} />
          <meshStandardMaterial color="#8a929c" {...MAT.brushed} />
        </mesh>
      ))}
      {legs.map((x) => [-1, 1].map((s) => (
        <mesh key={`${x}-${s}`} position={[x, (height - 0.1) / 2, s * (width / 2)]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, height - 0.1, 10]} />
          <meshStandardMaterial color="#9aa3ad" {...MAT.brushed} />
        </mesh>
      )))}
    </group>
  );
}

export function MotorBlock({ health, selected, pulseFault }: { health: Health; selected: boolean; pulseFault?: boolean }) {
  const [em, ei] = emissiveFor(health, selected);
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (ref.current && pulseFault && (health === "FAULT" || health === "WARN")) ref.current.emissiveIntensity = ei * (0.6 + 0.4 * Math.sin(clock.elapsedTime * 5));
  });
  const ribs = Array.from({ length: 8 }, (_, i) => i);
  return (
    <group position={[0, 0.42, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.85, 28]} />
        <meshStandardMaterial ref={ref} color={selected ? "#9eb8d4" : "#6b7280"} emissive={em} emissiveIntensity={ei} {...MAT.cast} />
      </mesh>
      {ribs.map((i) => (
        <mesh key={i} rotation={[(i / 8) * Math.PI, 0, 0]}>
          <boxGeometry args={[0.7, 0.7, 0.025]} />
          <meshStandardMaterial color="#5b6370" {...MAT.cast} />
        </mesh>
      ))}
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.28, 0.14, 0.24]} />
        <meshStandardMaterial color="#3f4650" {...MAT.paint} />
      </mesh>
      <mesh position={[0.55, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial color="#dce2ea" {...MAT.stainless} />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <boxGeometry args={[0.8, 0.08, 0.6]} />
        <meshStandardMaterial color="#4b5563" {...MAT.paint} />
      </mesh>
    </group>
  );
}

export function SensorStela({ health, selected }: { health: Health; selected: boolean }) {
  const led = health === "FAULT" ? "#ef4444" : health === "WARN" ? "#f59e0b" : health === "OFF" ? "#334155" : "#22c55e";
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.035, 1.0, 10]} />
        <meshStandardMaterial color="#9aa3ad" {...MAT.brushed} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.12]} />
        <meshPhysicalMaterial color={selected ? "#9eb8d4" : "#d8e0ea"} transmission={0.55} roughness={0.35} thickness={0.1} />
      </mesh>
      <mesh position={[0, 1.05, 0.065]}>
        <circleGeometry args={[0.035, 16]} />
        <meshStandardMaterial color="#0e131a" metalness={0.3} roughness={0.1} />
      </mesh>
      <mesh position={[0.05, 1.13, 0.05]}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshStandardMaterial color={led} emissive={led} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

export type BottleStatus = "ok" | "filling" | "filled" | "blocked" | "wobble";

/** InstancedMesh-Flaschen entlang einer Kurve (Budget nach Viewport). */
export function InstancedPathBottles({ curve, count, speed, playing, tipRisk, blockedFrom = 2, y = 0.85 }: {
  curve: THREE.Curve<THREE.Vector3>; count: number; speed: number; playing: boolean; tipRisk: number; blockedFrom?: number; y?: number;
}) {
  const body = useRef<THREE.InstancedMesh>(null);
  const cap = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const pc = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, dt) => {
    if (playing) t.current += dt * speed * 0.025;
    if (!body.current || !cap.current) return;
    for (let i = 0; i < count; i++) {
      const u = (i / count + t.current) % 1;
      curve.getPointAt(u, p);
      p.y = y;
      const wob = tipRisk > 25 && u > 0.55 && u < 0.7 ? Math.sin(clock.elapsedTime * 9 + i) * (tipRisk / 100) * 0.35 : 0;
      const blocked = tipRisk > 45 && i % 17 === blockedFrom;
      e.set(blocked ? 0.55 : wob, 0, blocked ? 0.2 : 0);
      q.setFromEuler(e);
      m.compose(p, q, s);
      body.current.setMatrixAt(i, m);
      pc.set(0, 0.25, 0).applyQuaternion(q).add(p);
      m.compose(pc, q, s);
      cap.current.setMatrixAt(i, m);
    }
    body.current.instanceMatrix.needsUpdate = true;
    cap.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, Math.max(1, count)]} castShadow frustumCulled={false}>
        <cylinderGeometry args={[0.088, 0.1, 0.44, 14]} />
        <meshPhysicalMaterial color="#a8d0e8" transmission={0.55} roughness={0.12} thickness={0.2} ior={1.45} transparent opacity={0.9} />
      </instancedMesh>
      <instancedMesh ref={cap} args={[undefined, undefined, Math.max(1, count)]} frustumCulled={false}>
        <cylinderGeometry args={[0.035, 0.035, 0.05, 10]} />
        <meshStandardMaterial color="#1e3a5f" {...MAT.paint} />
      </instancedMesh>
    </group>
  );
}

export function PackageMesh({ wrapped, blocked }: { wrapped?: boolean; blocked?: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[0.32, 0.24, 0.2]} />
        <meshStandardMaterial color={blocked ? "#b85c5c" : wrapped ? "#8b7355" : "#c4a574"} {...MAT.paint} />
      </mesh>
      {wrapped && (
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[0.34, 0.26, 0.22]} />
          <meshPhysicalMaterial color="#d4e8f5" transmission={0.45} roughness={0.15} transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

export function MicroLabel({ text, position }: { text: string; position: [number, number, number] }) {
  return (
    <Html position={position} center distanceFactor={14} style={{ pointerEvents: "none" }}>
      <div style={{ fontSize: 7, fontFamily: "var(--font-geist-mono)", color: "#7eb6c9", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{text}</div>
    </Html>
  );
}
