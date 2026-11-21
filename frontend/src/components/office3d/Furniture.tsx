"use client";

import React, { useEffect, useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { drawRoomSign, useDynamicCanvasTexture } from "./textures";

// Shared static geometries (never disposed per-instance)
const CHAIR_SEAT_GEO = new THREE.BoxGeometry(0.75, 0.12, 0.7);
const CHAIR_BACK_GEO = new THREE.BoxGeometry(0.75, 0.75, 0.1);
const CHAIR_POLE_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10);
const CHAIR_LEG_GEO = new THREE.BoxGeometry(0.4, 0.05, 0.07);

const LAPTOP_BASE_GEO = new THREE.BoxGeometry(0.72, 0.04, 0.5);
const LAPTOP_LID_GEO = new THREE.BoxGeometry(0.72, 0.48, 0.03);
const LAPTOP_SCREEN_GEO = new THREE.BoxGeometry(0.66, 0.42, 0.006);

const GLASS_GEO = new THREE.CylinderGeometry(0.07, 0.06, 0.22, 14);

const POT_GEO = new THREE.CylinderGeometry(0.28, 0.22, 0.5, 16);
const LEAF_GEO = new THREE.SphereGeometry(0.3, 12, 10);

const RACK_BODY_GEO = new THREE.BoxGeometry(1.05, 2.25, 0.85);
const RACK_SLOT_GEO = new THREE.BoxGeometry(0.88, 0.18, 0.04);
const RACK_LED_GEO = new THREE.BoxGeometry(0.07, 0.05, 0.03);

const CHAIR_METAL_MAT = new THREE.MeshStandardMaterial({
  color: "#777c86",
  metalness: 0.6,
  roughness: 0.3,
});
const CHAIR_BASE_MAT = new THREE.MeshStandardMaterial({
  color: "#555a63",
  roughness: 0.7,
});
const LAPTOP_METAL_MAT = new THREE.MeshStandardMaterial({
  color: "#b9bec6",
  metalness: 0.7,
  roughness: 0.3,
});
const WATER_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: "#cfe8ff",
  transparent: true,
  opacity: 0.45,
  roughness: 0.05,
});
const POT_MAT = new THREE.MeshStandardMaterial({
  color: "#c9b79c",
  roughness: 0.8,
});
const LEAF_MATS = [
  new THREE.MeshStandardMaterial({ color: "#2e7d32", roughness: 0.75 }),
  new THREE.MeshStandardMaterial({ color: "#3b8f3e", roughness: 0.75 }),
  new THREE.MeshStandardMaterial({ color: "#256d2a", roughness: 0.75 }),
];
const RACK_MAT = new THREE.MeshStandardMaterial({
  color: "#1b1f29",
  roughness: 0.45,
  metalness: 0.35,
});
const RACK_SLOT_MAT = new THREE.MeshStandardMaterial({
  color: "#293040",
  roughness: 0.5,
  metalness: 0.3,
});
const GLASS_WALL_MAT = new THREE.MeshStandardMaterial({
  color: "#bfe3ff",
  transparent: true,
  opacity: 0.18,
  roughness: 0.06,
  metalness: 0.1,
  depthWrite: false,
});
const GLASS_FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#313744",
  roughness: 0.5,
  metalness: 0.4,
});

export function OfficeChair({
  position,
  rotationY = 0,
  color = "#30343e",
}: {
  position: [number, number, number];
  rotationY?: number;
  color?: string;
}) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
    [color]
  );

  useEffect(() => {
    return () => {
      mat.dispose();
    };
  }, [mat]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        geometry={CHAIR_SEAT_GEO}
        material={mat}
        position={[0, 0.72, 0]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={CHAIR_BACK_GEO}
        material={mat}
        position={[0, 1.12, -0.33]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={CHAIR_POLE_GEO}
        material={CHAIR_METAL_MAT}
        position={[0, 0.38, 0]}
        castShadow
      />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={CHAIR_LEG_GEO}
            material={CHAIR_BASE_MAT}
            position={[Math.cos(a) * 0.2, 0.07, Math.sin(a) * 0.2]}
            rotation={[0, -a, 0]}
            castShadow
          />
        );
      })}
    </group>
  );
}

export function Laptop({
  position,
  rotationY = 0,
  glowColor = "#9fc6ff",
}: {
  position: [number, number, number];
  rotationY?: number;
  glowColor?: string;
}) {
  const screenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#000000",
        emissive: glowColor,
        emissiveIntensity: 1.35,
      }),
    [glowColor]
  );

  useEffect(() => {
    return () => {
      screenMat.dispose();
    };
  }, [screenMat]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        geometry={LAPTOP_BASE_GEO}
        material={LAPTOP_METAL_MAT}
        position={[0, 0.02, 0]}
        castShadow
        receiveShadow
      />
      <group position={[0, 0.04, -0.25]} rotation={[-0.25, 0, 0]}>
        <mesh
          geometry={LAPTOP_LID_GEO}
          material={LAPTOP_METAL_MAT}
          position={[0, 0.24, 0]}
          castShadow
        />
        <mesh
          geometry={LAPTOP_SCREEN_GEO}
          material={screenMat}
          position={[0, 0.24, 0.018]}
        />
      </group>
    </group>
  );
}

export function WaterGlass({ position }: { position: [number, number, number] }) {
  return (
    <mesh
      geometry={GLASS_GEO}
      material={WATER_GLASS_MAT}
      position={position}
      castShadow
    />
  );
}

const LEAF_OFFSETS: ReadonlyArray<{ angle: number; h: number }> = [
  { angle: 0, h: 0.95 },
  { angle: 0.9, h: 1.18 },
  { angle: 1.8, h: 0.88 },
  { angle: 2.7, h: 1.24 },
  { angle: 3.6, h: 0.98 },
  { angle: 4.5, h: 1.15 },
  { angle: 5.4, h: 0.92 },
];

export function Plant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh
        geometry={POT_GEO}
        material={POT_MAT}
        position={[0, 0.3, 0]}
        castShadow
        receiveShadow
      />
      {LEAF_OFFSETS.map((leaf, i) => (
        <mesh
          key={i}
          geometry={LEAF_GEO}
          material={LEAF_MATS[i % 3]}
          position={[
            Math.cos(leaf.angle) * 0.22,
            leaf.h,
            Math.sin(leaf.angle) * 0.22,
          ]}
          scale={[1, 1.38, 1]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

export function PendantLamp({
  position,
  lightIntensity = 0.8,
}: {
  position: [number, number, number];
  lightIntensity?: number;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 2.5, 6]} />
        <meshStandardMaterial color="#111111" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow>
        <coneGeometry args={[0.42, 0.38, 24, 1, true]} />
        <meshStandardMaterial
          color="#22252c"
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, -0.14, 0]}>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial
          color="#000000"
          emissive="#ffd9a0"
          emissiveIntensity={2.8}
        />
      </mesh>
      <pointLight
        color="#ffcf8a"
        intensity={lightIntensity}
        distance={9}
        decay={1.6}
        position={[0, -0.35, 0]}
      />
    </group>
  );
}

export function ServerRack({
  position,
  rotationY = 0,
  active,
  seed = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
  active: boolean;
  seed?: number;
}) {
  const ledMaterials = useMemo(() => {
    return Array.from({ length: 6 }).map((_, idx) => {
      return new THREE.MeshStandardMaterial({
        color: "#0b0f17",
        emissive: idx % 2 === 0 ? "#34d399" : "#f59e0b",
        emissiveIntensity: 0.4,
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      ledMaterials.forEach((m) => m.dispose());
    };
  }, [ledMaterials]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ledMaterials.forEach((mat, idx) => {
      if (active) {
        const wave = Math.sin(t * (5.5 + idx * 1.3) + seed * 2.1 + idx * 1.7);
        mat.emissive.set(idx % 3 === 0 ? "#38bdf8" : "#f59e0b");
        mat.emissiveIntensity = wave > 0.1 ? 2.8 : 0.35;
      } else {
        mat.emissive.set("#34d399");
        mat.emissiveIntensity = 0.55 + 0.15 * Math.sin(t * 1.5 + idx + seed);
      }
    });
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        geometry={RACK_BODY_GEO}
        material={RACK_MAT}
        position={[0, 1.125, 0]}
        castShadow
        receiveShadow
      />
      {[0, 1, 2, 3, 4, 5].map((slot) => {
        const y = 0.38 + slot * 0.3;
        return (
          <group key={slot}>
            <mesh
              geometry={RACK_SLOT_GEO}
              material={RACK_SLOT_MAT}
              position={[0, y, 0.42]}
            />
            <mesh
              geometry={RACK_LED_GEO}
              material={ledMaterials[slot]}
              position={[0.32, y, 0.45]}
            />
          </group>
        );
      })}
    </group>
  );
}

export function GlassPartition({
  position,
  width,
  height = 2.35,
  rotationY = 0,
}: {
  position: [number, number, number];
  width: number;
  height?: number;
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={GLASS_WALL_MAT} position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, 0.05]} />
      </mesh>
      {/* Top & bottom sleek aluminum rails */}
      <mesh material={GLASS_FRAME_MAT} position={[0, height, 0]}>
        <boxGeometry args={[width, 0.06, 0.09]} />
      </mesh>
      <mesh material={GLASS_FRAME_MAT} position={[0, 0.04, 0]}>
        <boxGeometry args={[width, 0.08, 0.09]} />
      </mesh>
      {/* Vertical end mullions */}
      <mesh material={GLASS_FRAME_MAT} position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[0.07, height, 0.09]} />
      </mesh>
      <mesh material={GLASS_FRAME_MAT} position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[0.07, height, 0.09]} />
      </mesh>
    </group>
  );
}

export function RoomSignSprite({
  label,
  position,
  accent,
  active,
  onClick,
}: {
  label: string;
  position: [number, number, number];
  accent: string;
  active: boolean;
  onClick?: () => void;
}) {
  const texture = useDynamicCanvasTexture(
    512,
    128,
    (ctx, w, h) => drawRoomSign(ctx, w, h, label, accent, active),
    [label, accent, active]
  );

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  };

  return (
    <sprite
      position={position}
      scale={[3.4, 0.85, 1]}
      onClick={handleClick}
    >
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}
