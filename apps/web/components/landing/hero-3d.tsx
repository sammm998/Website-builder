"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Image, Sparkles } from "@react-three/drei";
import type { Group } from "three";
import { MathUtils } from "three";

const PANES = [
  { url: "/showcase/directions/1.webp", position: [0.45, 0.75, 0.4] as const, rotation: 0.06, speed: 1.4 },
  { url: "/showcase/directions/0.webp", position: [1.25, -0.55, -0.8] as const, rotation: -0.05, speed: 1.1 },
  { url: "/showcase/directions/2.webp", position: [-0.55, -1.45, -1.8] as const, rotation: 0.04, speed: 0.9 },
];

function Panes({ progress }: { progress: { current: number } }) {
  const group = useRef<Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const p = progress.current;
    g.rotation.y = MathUtils.lerp(g.rotation.y, -0.42 + state.pointer.x * 0.18 + p * 0.5, 0.06);
    g.rotation.x = MathUtils.lerp(g.rotation.x, 0.12 - state.pointer.y * 0.1 - p * 0.2, 0.06);
    g.position.y = MathUtils.lerp(g.position.y, p * 1.6, 0.08);
    g.children.forEach((child, i) => {
      child.position.z = MathUtils.lerp(child.position.z, p * (i - 1) * 2.2, 0.08);
    });
  });
  return (
    <group ref={group}>
      {PANES.map((pane) => (
        <Float key={pane.url} speed={pane.speed} rotationIntensity={0.25} floatIntensity={0.6}>
          <group position={[pane.position[0], pane.position[1], pane.position[2]]} rotation={[0, 0, pane.rotation]}>
            <Image url={pane.url} scale={[2.9, 1.81]} radius={0.06} transparent toneMapped={false} />
          </group>
        </Float>
      ))}
      <Sparkles count={70} scale={[8, 5, 4]} size={2.2} speed={0.35} color="#d4ff3a" opacity={0.7} />
    </group>
  );
}

/** Floating 3D panes of real generated design directions; reacts to pointer and scroll. */
export default function Hero3D({ progress }: { progress: { current: number } }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 8], fov: 35 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} aria-hidden="true">
      <Panes progress={progress} />
    </Canvas>
  );
}
