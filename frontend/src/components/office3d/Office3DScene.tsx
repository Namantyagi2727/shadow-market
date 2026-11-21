"use client";

import React, { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import type { PersonaState } from "@/lib/run-store";
import { Building } from "./Building";
import { CameraRig } from "./CameraRig";
import { OfficeOverlay, PersonaInspectorModal } from "./OfficeOverlay";
import { RoomsBack } from "./RoomsBack";
import { RoomsFront } from "./RoomsFront";
import { stageToRoom, type Office3DSceneProps, type RoomId } from "./types";

export function Office3DScene({
  runState,
  activeStage,
  isSampleData = false,
  onOpenHotseat,
}: Office3DSceneProps) {
  const [autoFollow, setAutoFollow] = useState(true);
  const [manualRoom, setManualRoom] = useState<RoomId>("overview");
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(
    null
  );

  const autoFollowRoom = useMemo(() => stageToRoom(activeStage), [activeStage]);
  const focusedRoom: RoomId = autoFollow ? autoFollowRoom : manualRoom;

  const selectedPersona: PersonaState | null =
    selectedPersonaId && runState.personas[selectedPersonaId]
      ? runState.personas[selectedPersonaId]
      : null;

  const handleSelectRoom = (room: RoomId) => {
    setAutoFollow(false);
    setManualRoom(room);
  };

  const handleToggleAutoFollow = () => {
    setAutoFollow((prev) => !prev);
  };

  return (
    <div
      className="relative h-full w-full min-h-[520px] overflow-hidden rounded-2xl border border-white/10 select-none"
      style={{
        background:
          "linear-gradient(180deg, #10131b 0%, #15171d 55%, #1c1922 100%)",
      }}
    >
      <Canvas
        shadows="soft"
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
        camera={{
          fov: 30,
          near: 0.1,
          far: 220,
          position: [29, 27, 33],
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        {/* Atmospheric depth fog matching reference */}
        <fog attach="fog" args={["#15171d", 62, 118]} />

        {/* Warm Key + Cool Fill + Hemisphere Lighting (matching reference look) */}
        <hemisphereLight args={["#dfe8ff", "#3a2c22", 0.55]} />
        <directionalLight
          position={[14, 22, 16]}
          intensity={1.15}
          color="#fff0dc"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-left={-21}
          shadow-camera-right={21}
          shadow-camera-top={18}
          shadow-camera-bottom={-18}
          shadow-camera-near={1}
          shadow-camera-far={70}
        />
        <directionalLight
          position={[-14, 10, -8]}
          intensity={0.28}
          color="#9fb7ff"
        />

        {/* Procedural Lightformer-only Environment (zero external HDRIs/files) */}
        <Environment resolution={128} frames={1}>
          <Lightformer
            form="rect"
            intensity={1.3}
            color="#ffe8c8"
            position={[0, 14, 2]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[24, 16, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.85}
            color="#9fb7ff"
            position={[-18, 8, -4]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[18, 10, 1]}
          />
          <Lightformer
            form="circle"
            intensity={0.9}
            color="#f0a868"
            position={[14, 6, -14]}
            rotation={[0, -Math.PI / 4, 0]}
            scale={[10, 10, 1]}
          />
        </Environment>

        {/* Soft Grounding Contact Shadows under the Diorama */}
        <ContactShadows
          position={[0, -0.66, 0]}
          opacity={0.42}
          scale={44}
          blur={2.2}
          far={8}
          resolution={512}
          color="#05060a"
        />

        {/* Smooth Glide Camera Rig with ±15° Light Mouse Orbit */}
        <CameraRig focusedRoom={focusedRoom} />

        {/* Architectural Cut-Away Building Shell */}
        <Building focusedRoom={focusedRoom} onSelectRoom={handleSelectRoom} />

        {/* Live Data-Driven Rooms */}
        <RoomsBack
          runState={runState}
          activeStage={activeStage}
          focusedRoom={focusedRoom}
          onSelectPersona={(persona) => setSelectedPersonaId(persona.persona_id)}
        />
        <RoomsFront
          runState={runState}
          activeStage={activeStage}
          focusedRoom={focusedRoom}
        />
      </Canvas>

      {/* Translucent Dark HUD Overlay */}
      <OfficeOverlay
        runState={runState}
        activeStage={activeStage}
        focusedRoom={focusedRoom}
        autoFollowRoom={autoFollowRoom}
        autoFollow={autoFollow}
        isSampleData={isSampleData}
        onSelectRoom={handleSelectRoom}
        onToggleAutoFollow={handleToggleAutoFollow}
      />

      {/* Usability Lab Persona Video & Hot-Seat Overlay (outside canvas) */}
      {selectedPersona && (
        <PersonaInspectorModal
          runId={runState.runId}
          persona={selectedPersona}
          onClose={() => setSelectedPersonaId(null)}
          onOpenHotseat={onOpenHotseat}
        />
      )}
    </div>
  );
}
