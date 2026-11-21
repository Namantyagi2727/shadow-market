"use client";

import React, { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GlassPartition, Plant, RoomSignSprite } from "./Furniture";
import {
  createPlankTexture,
  createRugTexture,
  createSkylineTexture,
  createWhiteboardTexture,
} from "./textures";
import { ROOM_TABS, type RoomId } from "./types";

interface BuildingProps {
  focusedRoom: RoomId;
  onSelectRoom: (room: RoomId) => void;
}

const ROOM_SIGN_POSITIONS: Record<Exclude<RoomId, "overview">, [number, number, number]> = {
  pitch: [-10.6, 5.2, -7.2],
  boardroom: [-0.3, 4.4, -7.2],
  lab: [10.3, 4.2, -7.2],
  server: [-11.8, 4.7, 5.6],
  market: [-3.7, 4.2, 5.6],
  verdict: [4.3, 4.2, 5.6],
  judges: [12.0, 4.2, 5.6],
};

export function Building({ focusedRoom, onSelectRoom }: BuildingProps) {
  const textures = useMemo(() => {
    return {
      plank: createPlankTexture(),
      skyline1: createSkylineTexture(42),
      skyline2: createSkylineTexture(99),
      skyline3: createSkylineTexture(177),
      devRug: createRugTexture("#3a4a5c", "#5b6e85"),
      boardRug: createRugTexture("#363d4d", "#4f5b72"),
      labSlab: createRugTexture("#2a3a40", "#3d555e"),
      marketSlab: createRugTexture("#2b2f42", "#474f6b"),
      verdictSlab: createRugTexture("#342a37", "#534157"),
      judgesSlab: createRugTexture("#37322d", "#574c42"),
      whiteboard: createWhiteboardTexture(),
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(textures).forEach((t) => t.dispose());
    };
  }, [textures]);

  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e9e3d8", roughness: 0.8 }),
    []
  );
  const baseboardMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.7 }),
    []
  );
  const plinthMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#23262e", roughness: 0.78 }),
    []
  );
  const windowFrameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2b2e36", roughness: 0.55 }),
    []
  );

  useEffect(() => {
    return () => {
      wallMat.dispose();
      baseboardMat.dispose();
      plinthMat.dispose();
      windowFrameMat.dispose();
    };
  }, [wallMat, baseboardMat, plinthMat, windowFrameMat]);

  const roomTabMap = useMemo(() => {
    const map = new Map<RoomId, { label: string; accent: string }>();
    ROOM_TABS.forEach((tab) => map.set(tab.id, { label: tab.label, accent: tab.accent }));
    return map;
  }, []);

  return (
    <group>
      {/* Heavy Architectural Base Plinth */}
      <mesh
        material={plinthMat}
        position={[0, -0.35, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[33.0, 0.62, 23.0]} />
      </mesh>

      {/* Main Warm Wood Plank Floor */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[32.0, 0.1, 22.0]} />
        <meshStandardMaterial map={textures.plank} roughness={0.62} />
      </mesh>

      {/* Distinct Soft-Coloured Room Floor Slabs / Rugs */}
      {/* Boardroom Rug */}
      <mesh position={[-0.3, 0.06, -6.2]} receiveShadow>
        <boxGeometry args={[8.6, 0.025, 7.6]} />
        <meshStandardMaterial map={textures.boardRug} roughness={0.85} />
      </mesh>
      {/* Usability Lab Floor Slab */}
      <mesh position={[10.35, 0.06, -6.2]} receiveShadow>
        <boxGeometry args={[10.0, 0.025, 8.2]} />
        <meshStandardMaterial map={textures.labSlab} roughness={0.75} />
      </mesh>
      {/* Server Room / Dev Pit Woven Rug */}
      <mesh position={[-11.8, 0.06, 5.8]} receiveShadow>
        <boxGeometry args={[6.8, 0.025, 8.2]} />
        <meshStandardMaterial map={textures.devRug} roughness={0.85} />
      </mesh>
      {/* Market Floor Slab */}
      <mesh position={[-3.7, 0.06, 5.8]} receiveShadow>
        <boxGeometry args={[7.4, 0.025, 8.2]} />
        <meshStandardMaterial map={textures.marketSlab} roughness={0.8} />
      </mesh>
      {/* Verdict Room Slab */}
      <mesh position={[4.3, 0.06, 5.8]} receiveShadow>
        <boxGeometry args={[6.6, 0.025, 8.2]} />
        <meshStandardMaterial map={textures.verdictSlab} roughness={0.8} />
      </mesh>
      {/* Judges' Room Slab */}
      <mesh position={[12.0, 0.06, 5.8]} receiveShadow>
        <boxGeometry args={[6.8, 0.025, 8.2]} />
        <meshStandardMaterial map={textures.judgesSlab} roughness={0.8} />
      </mesh>

      {/* Outer Cut-Away Warm Back Wall (z = -11) & Left Wall (x = -16) */}
      <mesh
        material={wallMat}
        position={[0, 2.85, -11.0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[32.2, 5.6, 0.3]} />
      </mesh>
      <mesh
        material={wallMat}
        position={[-16.0, 2.85, 0]}
        receiveShadow
        castShadow
      >
        <boxGeometry args={[0.3, 5.6, 22.0]} />
      </mesh>

      {/* Warm Wood Baseboards */}
      <mesh material={baseboardMat} position={[0, 0.14, -10.82]} receiveShadow>
        <boxGeometry args={[32.0, 0.24, 0.1]} />
      </mesh>
      <mesh material={baseboardMat} position={[-15.82, 0.14, 0]} receiveShadow>
        <boxGeometry args={[0.1, 0.24, 21.8]} />
      </mesh>

      {/* Dusk Skyline Windows along the Back Wall */}
      {[
        { x: -2.4, tex: textures.skyline1 },
        { x: 2.3, tex: textures.skyline2 },
        { x: 10.3, tex: textures.skyline3 },
      ].map((win, idx) => (
        <group key={idx} position={[win.x, 3.35, -10.82]}>
          <mesh>
            <boxGeometry args={[4.1, 3.0, 0.08]} />
            <meshBasicMaterial map={win.tex} />
          </mesh>
          {/* Window Frame Top, Bottom, Sides & Center Mullion */}
          <mesh material={windowFrameMat} position={[0, 1.55, 0.05]}>
            <boxGeometry args={[4.3, 0.14, 0.18]} />
          </mesh>
          <mesh material={windowFrameMat} position={[0, -1.55, 0.05]}>
            <boxGeometry args={[4.3, 0.14, 0.18]} />
          </mesh>
          <mesh material={windowFrameMat} position={[-2.1, 0, 0.05]}>
            <boxGeometry args={[0.14, 3.24, 0.18]} />
          </mesh>
          <mesh material={windowFrameMat} position={[2.1, 0, 0.05]}>
            <boxGeometry args={[0.14, 3.24, 0.18]} />
          </mesh>
          <mesh material={windowFrameMat} position={[0, 0, 0.05]}>
            <boxGeometry args={[0.1, 3.1, 0.16]} />
          </mesh>
        </group>
      ))}

      {/* Whiteboard mounted on the Left Wall in the Server Room / Dev Pit */}
      <group position={[-15.8, 2.55, 5.8]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.08, 2.0, 3.5]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
        <mesh position={[0.05, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[3.3, 1.84]} />
          <meshStandardMaterial map={textures.whiteboard} roughness={0.5} />
        </mesh>
      </group>

      {/* Low Interior Cut-Away Dividers (~2.4 high) separating Back Row rooms */}
      {/* Between Pitch Studio & Boardroom */}
      <mesh material={wallMat} position={[-5.4, 1.25, -6.5]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 2.4, 8.7]} />
      </mesh>
      {/* Between Boardroom & Usability Lab */}
      <mesh material={wallMat} position={[4.95, 1.25, -6.5]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 2.4, 8.7]} />
      </mesh>

      {/* Low Interior Cut-Away Dividers (~2.4 high) separating Front Row rooms */}
      {/* Back walls along corridor edge (z = 1.35) for Front Row wall displays */}
      <mesh material={wallMat} position={[-11.8, 1.4, 1.35]} castShadow receiveShadow>
        <boxGeometry args={[6.8, 2.7, 0.18]} />
      </mesh>
      <mesh material={wallMat} position={[-3.7, 1.4, 1.35]} castShadow receiveShadow>
        <boxGeometry args={[7.2, 2.7, 0.18]} />
      </mesh>
      <mesh material={wallMat} position={[4.3, 1.5, 1.35]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 2.9, 0.18]} />
      </mesh>
      <mesh material={wallMat} position={[12.0, 1.5, 1.35]} castShadow receiveShadow>
        <boxGeometry args={[6.6, 2.9, 0.18]} />
      </mesh>

      {/* Side dividers between Front Row rooms */}
      <mesh material={wallMat} position={[-7.9, 1.2, 5.7]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 2.3, 8.6]} />
      </mesh>
      <mesh material={wallMat} position={[0.45, 1.2, 5.7]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 2.3, 8.6]} />
      </mesh>
      <mesh material={wallMat} position={[8.15, 1.2, 5.7]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 2.3, 8.6]} />
      </mesh>

      {/* Glass Partition Fronts (opacity ~0.18) along Corridor & Room Fronts */}
      {/* Boardroom glass front with doorway gap */}
      <GlassPartition position={[-2.4, 0, -2.0]} width={5.4} height={2.35} />
      <GlassPartition position={[3.35, 0, -2.0]} width={2.8} height={2.35} />

      {/* Usability Lab glass front leaving a clear doorway around x = 6.2 for quitters to exit */}
      <GlassPartition position={[11.6, 0, -2.0]} width={7.8} height={2.35} />
      {/* Doorway frame indicator on Usability Lab */}
      <mesh material={windowFrameMat} position={[5.15, 1.18, -2.0]}>
        <boxGeometry args={[0.12, 2.36, 0.12]} />
      </mesh>
      <mesh material={windowFrameMat} position={[7.68, 1.18, -2.0]}>
        <boxGeometry args={[0.12, 2.36, 0.12]} />
      </mesh>
      <mesh material={windowFrameMat} position={[6.42, 2.34, -2.0]}>
        <boxGeometry args={[2.65, 0.1, 0.12]} />
      </mesh>

      {/* Subtle Low Glass Front Edge Rail along Front Row rooms */}
      <GlassPartition position={[-11.8, 0, 10.6]} width={6.6} height={1.15} />
      <GlassPartition position={[-3.7, 0, 10.6]} width={7.0} height={1.15} />
      <GlassPartition position={[4.3, 0, 10.6]} width={6.2} height={1.15} />
      <GlassPartition position={[12.0, 0, 10.6]} width={6.4} height={1.15} />

      {/* Architectural Potted Plants */}
      <Plant position={[-15.1, 0, -10.1]} scale={1.25} />
      <Plant position={[15.1, 0, -10.1]} scale={1.15} />
      <Plant position={[-15.1, 0, 9.8]} scale={1.05} />
      <Plant position={[4.3, 0, -1.2]} scale={0.9} />
      <Plant position={[-5.9, 0, -1.1]} scale={0.95} />
      <Plant position={[15.2, 0, 0.2]} scale={1.0} />
      <Plant position={[0.9, 0, 9.8]} scale={0.85} />

      {/* Floating Room Name Signs (CanvasTexture Sprites matching reference) */}
      {(
        Object.entries(ROOM_SIGN_POSITIONS) as [
          Exclude<RoomId, "overview">,
          [number, number, number]
        ][]
      ).map(([roomId, pos]) => {
        const meta = roomTabMap.get(roomId);
        if (!meta) return null;
        return (
          <RoomSignSprite
            key={roomId}
            label={meta.label}
            position={pos}
            accent={meta.accent}
            active={focusedRoom === roomId}
            onClick={() => onSelectRoom(roomId)}
          />
        );
      })}
    </group>
  );
}
