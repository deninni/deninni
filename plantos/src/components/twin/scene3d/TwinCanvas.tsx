"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SceneLights, IndustrialBackdrop } from "./shared";
import { Af12Scene } from "./Af12Scene";
import { Vl3Scene } from "./Vl3Scene";
import { Ft7Scene } from "./Ft7Scene";
import type { SceneProps } from "./types";

/** Lokales PMREM aus RoomEnvironment – kein CDN-HDRI (CSP-konform, offline-fähig). */
function LocalEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.75;
    return () => { env.dispose(); pmrem.dispose(); scene.environment = null; };
  }, [gl, scene]);
  return null;
}

function useBottleBudget() {
  const [b, setB] = useState(120);
  useEffect(() => {
    const f = () => setB(window.innerWidth < 640 ? 48 : window.innerWidth < 1024 ? 80 : 120);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return b;
}

export default function TwinCanvas(props: Omit<SceneProps, "bottleBudget">) {
  const budget = useBottleBudget();
  const scene = useMemo(() => {
    const p = { ...props, bottleBudget: budget };
    if (props.twin.machineId === "m-af12") return <Af12Scene {...p} />;
    if (props.twin.machineId === "m-vl3") return <Vl3Scene {...p} />;
    return <Ft7Scene {...p} />;
  }, [props, budget]);

  return (
    <div className="relative h-full w-full" style={{ background: "radial-gradient(ellipse at 50% 30%, #1a2434 0%, #0a0e14 60%, #06080c 100%)" }}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [8.5, 7.2, 11.5], fov: 36, near: 0.1, far: 90 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
        onPointerMissed={() => props.onSelect("")}
      >
        <color attach="background" args={["#0a0e14"]} />
        <fog attach="fog" args={["#0a0e14", 26, 55]} />
        <Suspense fallback={null}>
          <LocalEnvironment />
          <SceneLights />
          <IndustrialBackdrop />
          {scene}
          <ContactShadows position={[0, 0.01, 0]} opacity={0.45} scale={34} blur={2.2} far={6} />
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.08} minPolarAngle={0.28} maxPolarAngle={Math.PI / 2.12} minDistance={4} maxDistance={28} target={[0.8, 0.55, 0]} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-stainless-dim">
        3D · Industrial PBR · Orbit · Klick = Detail
        <div>Prozedurale Stilisierung · keine Maßkoordinaten · kein 1:1</div>
      </div>
      {props.twin.tipRiskPct > 25 && (
        <div className="pointer-events-none absolute right-3 top-3 rounded border border-status-warn/40 bg-status-warn/10 px-2 py-1 text-[11px] font-medium text-status-warn">TipRisk {props.twin.tipRiskPct}%</div>
      )}
    </div>
  );
}
