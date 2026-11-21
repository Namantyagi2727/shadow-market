"use client";

import React, { useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { resolveArtifactUrl, type Stage } from "@/lib/contracts";
import type { PersonaState, RunState } from "@/lib/run-store";
import { Chibi } from "./Chibi";
import { Laptop, OfficeChair, WaterGlass } from "./Furniture";
import {
  drawBoardroomSpec,
  drawLabMonitor,
  drawPitchSlide,
  useArtifactImage,
  useDynamicCanvasTexture,
} from "./textures";
import type { ChibiPose, RoomId, StatusRingKind } from "./types";

interface RoomsBackProps {
  runState: RunState;
  activeStage: Stage;
  focusedRoom: RoomId;
  onSelectPersona: (persona: PersonaState) => void;
}

const LAB_DESK_POSITIONS: ReadonlyArray<[number, number]> = [
  [7.2, -8.3],
  [10.3, -8.3],
  [13.4, -8.3],
  [7.2, -4.8],
  [10.3, -4.8],
  [13.4, -4.8],
];

const LAB_PALETTES: ReadonlyArray<{
  shirt: string;
  hair: string;
  skin: string;
  longHair: boolean;
}> = [
  { shirt: "#5DCAA5", hair: "#2a1b12", skin: "#e0ac69", longHair: false },
  { shirt: "#EF9F27", hair: "#4a2c1a", skin: "#f1c27d", longHair: true },
  { shirt: "#7F77DD", hair: "#15151a", skin: "#c68642", longHair: true },
  { shirt: "#38bdf8", hair: "#6b3e26", skin: "#e0ac69", longHair: false },
  { shirt: "#f472b6", hair: "#2a1b12", skin: "#8d5524", longHair: true },
  { shirt: "#a3e635", hair: "#c9a36b", skin: "#f1c27d", longHair: false },
];

function PitchStudioRoom({
  runState,
  activeStage,
  showTags,
}: {
  runState: RunState;
  activeStage: Stage;
  showTags: boolean;
}) {
  const slideTexture = useDynamicCanvasTexture(
    1280,
    720,
    (ctx, w, h) => drawPitchSlide(ctx, w, h, runState.pitch),
    [runState.pitch]
  );

  // SpotLight target object + accurately aligned translucent beam cone
  const spotTarget = useMemo(() => {
    const obj = new THREE.Object3D();
    obj.position.set(-9.8, 0.55, -6.9);
    return obj;
  }, []);

  const coneTransform = useMemo(() => {
    const start = new THREE.Vector3(-8.4, 8.8, -3.9);
    const end = new THREE.Vector3(-9.8, 0.55, -6.9);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      dir.clone().normalize()
    );
    return { mid, quat, length };
  }, []);

  const isPitching = activeStage === "pitch";
  const founderBubble =
    isPitching && runState.pitch
      ? `${runState.pitch.title}: ${runState.pitch.one_liner}`
      : null;

  return (
    <group>
      {/* Elevated Dark Stage Platform + Glowing Amber Edge Strip + Front Step */}
      <mesh position={[-10.6, 0.25, -7.8]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 0.4, 4.9]} />
        <meshStandardMaterial color="#2b2e36" roughness={0.42} />
      </mesh>
      <mesh position={[-10.6, 0.47, -5.36]}>
        <boxGeometry args={[7.8, 0.06, 0.06]} />
        <meshStandardMaterial
          color="#000000"
          emissive="#EF9F27"
          emissiveIntensity={2.2}
        />
      </mesh>
      <mesh position={[-10.6, 0.12, -5.05]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.2, 0.6]} />
        <meshStandardMaterial color="#2b2e36" roughness={0.5} />
      </mesh>

      {/* Presentation Wall Screen (CanvasTexture) */}
      <mesh position={[-10.6, 3.35, -10.76]} castShadow receiveShadow>
        <boxGeometry args={[6.5, 3.7, 0.18]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.3} />
      </mesh>
      <mesh position={[-10.6, 3.35, -10.65]}>
        <planeGeometry args={[6.2, 3.48]} />
        <meshBasicMaterial map={slideTexture} />
      </mesh>

      {/* Podium */}
      <group position={[-11.8, 0.45, -6.55]}>
        <mesh position={[0, 0.56, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.72, 1.12, 0.56]} />
          <meshStandardMaterial color="#4a3423" roughness={0.58} />
        </mesh>
        <mesh position={[0, 1.14, 0.04]} rotation={[0.18, 0, 0]} castShadow>
          <boxGeometry args={[0.84, 0.07, 0.66]} />
          <meshStandardMaterial color="#5d402a" roughness={0.5} />
        </mesh>
      </group>

      {/* Stage Spotlight + Translucent Warm Cone */}
      <primitive object={spotTarget} />
      <spotLight
        color="#ffe2b0"
        intensity={2.2}
        distance={22}
        angle={0.34}
        penumbra={0.55}
        decay={1.2}
        position={[-8.4, 8.8, -3.9]}
        target={spotTarget}
      />
      <mesh
        position={coneTransform.mid}
        quaternion={coneTransform.quat}
      >
        <coneGeometry args={[1.65, coneTransform.length, 32, 1, true]} />
        <meshBasicMaterial
          color="#ffd9a0"
          transparent
          opacity={0.07}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Founder Chibi with Handheld Mic */}
      <Chibi
        name="Founder"
        color="#EF9F27"
        hairColor="#2a1b12"
        pantsColor="#1f2430"
        hasLanyard
        hasMic
        position={[-9.8, 0.45, -6.9]}
        rotationY={0.55}
        pose={isPitching ? "talk" : "stand"}
        statusRing={isPitching ? "speaking" : runState.pitch ? "converted" : "none"}
        bubble={founderBubble}
        bubbleKey={runState.pitch?.title ?? "idle"}
        bubbleAccent="#EF9F27"
        showNameTag={showTags}
        phase={0.3}
      />
    </group>
  );
}

function BoardroomRoom({
  runState,
  activeStage,
  showTags,
}: {
  runState: RunState;
  activeStage: Stage;
  showTags: boolean;
}) {
  const specTexture = useDynamicCanvasTexture(
    1024,
    600,
    (ctx, w, h) =>
      drawBoardroomSpec(ctx, w, h, runState.spec, runState.competitors),
    [runState.spec, runState.competitors.length]
  );

  const latestTurn =
    runState.boardroomTurns.length > 0
      ? runState.boardroomTurns[runState.boardroomTurns.length - 1]
      : null;

  const strategistSpeaking = latestTurn?.speaker === "strategist";
  const skepticSpeaking = latestTurn?.speaker === "skeptic";

  return (
    <group>
      {/* Walnut Conference Table */}
      <mesh position={[-0.3, 1.02, -6.2]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 0.12, 2.0]} />
        <meshStandardMaterial color="#5a3d29" roughness={0.48} />
      </mesh>
      {[-1.7, 1.1].map((lx) => (
        <mesh key={lx} position={[lx, 0.5, -6.2]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.98, 1.4]} />
          <meshStandardMaterial color="#422c1d" roughness={0.6} />
        </mesh>
      ))}

      {/* Laptops & Water Glasses */}
      <Laptop
        position={[-1.65, 1.08, -6.2]}
        rotationY={Math.PI / 2}
        glowColor="#7dd3fc"
      />
      <WaterGlass position={[-1.4, 1.19, -5.65]} />
      <Laptop
        position={[1.05, 1.08, -6.2]}
        rotationY={-Math.PI / 2}
        glowColor="#fda4af"
      />
      <WaterGlass position={[0.8, 1.19, -6.75]} />

      {/* Wall Spec Card mounted on left divider wall facing +X */}
      <group position={[-5.26, 1.48, -6.4]} rotation={[0, Math.PI / 2, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[3.6, 2.05, 0.1]} />
          <meshStandardMaterial color="#121620" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[3.42, 1.9]} />
          <meshBasicMaterial map={specTexture} />
        </mesh>
      </group>

      {/* Strategist (Left) */}
      <OfficeChair position={[-2.95, 0, -6.2]} rotationY={Math.PI / 2} />
      <Chibi
        name="Strategist"
        color="#22d3ee"
        hairColor="#2a1b12"
        skinColor="#e0ac69"
        position={[-2.75, 0, -6.2]}
        rotationY={Math.PI / 2}
        pose={strategistSpeaking ? "talk" : "sit"}
        statusRing={
          strategistSpeaking
            ? "speaking"
            : activeStage === "boardroom"
            ? "working"
            : runState.spec
            ? "converted"
            : "none"
        }
        bubble={strategistSpeaking ? latestTurn?.text : null}
        bubbleKey={strategistSpeaking ? latestTurn?.seq : "none"}
        bubbleAccent="#22d3ee"
        showNameTag={showTags}
        phase={1.1}
      />

      {/* Skeptic (Right) */}
      <OfficeChair position={[2.35, 0, -6.2]} rotationY={-Math.PI / 2} />
      <Chibi
        name="Skeptic"
        color="#fb7185"
        hairColor="#c9a36b"
        skinColor="#f1c27d"
        longHair
        position={[2.15, 0, -6.2]}
        rotationY={-Math.PI / 2}
        pose={skepticSpeaking ? "talk" : "sit"}
        statusRing={
          skepticSpeaking
            ? "speaking"
            : activeStage === "boardroom"
            ? "working"
            : runState.spec
            ? "converted"
            : "none"
        }
        bubble={skepticSpeaking ? latestTurn?.text : null}
        bubbleKey={skepticSpeaking ? latestTurn?.seq : "none"}
        bubbleAccent="#fb7185"
        showNameTag={showTags}
        phase={2.4}
      />
    </group>
  );
}

function LabStation({
  deskIdx,
  position,
  persona,
  mvpImage,
  onClick,
}: {
  deskIdx: number;
  position: [number, number];
  persona: PersonaState | null;
  mvpImage: HTMLImageElement | null;
  onClick?: () => void;
}) {
  const monitorTexture = useDynamicCanvasTexture(
    512,
    340,
    (ctx, w, h) => drawLabMonitor(ctx, w, h, persona, deskIdx, mvpImage),
    [persona?.name, persona?.status, deskIdx, mvpImage]
  );

  const lampColor = !persona
    ? "#334155"
    : persona.status === "quit"
    ? "#f43f5e"
    : persona.status === "converted"
    ? "#34d399"
    : "#f59e0b";

  const lampIntensity = persona ? 2.4 : 0.25;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  };

  return (
    <group
      position={[position[0], 0, position[1]]}
      onClick={handleClick}
      onPointerOver={() => {
        if (onClick) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (onClick) document.body.style.cursor = "auto";
      }}
    >
      {/* Desk Top & Legs */}
      <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.08, 0.88]} />
        <meshStandardMaterial color="#d8cfc0" roughness={0.52} />
      </mesh>
      {[-0.95, 0.95].map((lx) => (
        <mesh key={lx} position={[lx, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 1.0, 0.78]} />
          <meshStandardMaterial color="#30343e" roughness={0.65} />
        </mesh>
      ))}

      {/* Monitor Stand & Screen */}
      <mesh position={[0, 1.15, -0.22]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.24, 10]} />
        <meshStandardMaterial color="#30343e" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.07, -0.22]} castShadow>
        <boxGeometry args={[0.3, 0.025, 0.2]} />
        <meshStandardMaterial color="#30343e" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.48, -0.24]} castShadow>
        <boxGeometry args={[0.96, 0.62, 0.05]} />
        <meshStandardMaterial color="#15171c" roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.48, -0.21]}>
        <planeGeometry args={[0.88, 0.55]} />
        <meshBasicMaterial map={monitorTexture} />
      </mesh>

      {/* Keyboard */}
      <mesh position={[0, 1.07, 0.16]} castShadow>
        <boxGeometry args={[0.52, 0.02, 0.16]} />
        <meshStandardMaterial color="#2b2e36" roughness={0.6} />
      </mesh>

      {/* Status Desk Lamp */}
      <group position={[0.78, 1.06, -0.18]}>
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.12, 0.04, 14]} />
          <meshStandardMaterial color="#2b2e36" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.38, 8]} />
          <meshStandardMaterial color="#555a63" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshStandardMaterial
            color={lampColor}
            emissive={lampColor}
            emissiveIntensity={lampIntensity}
            roughness={0.25}
          />
        </mesh>
      </group>

      {/* Office Chair */}
      <OfficeChair position={[0, 0, 0.78]} rotationY={Math.PI} />
    </group>
  );
}

function UsabilityLabRoom({
  runState,
  showTags,
  onSelectPersona,
}: {
  runState: RunState;
  showTags: boolean;
  onSelectPersona: (persona: PersonaState) => void;
}) {
  const mvpScreenshotUrl = resolveArtifactUrl(
    runState.runId,
    runState.mvp?.screenshot_url
  );
  const mvpImage = useArtifactImage(mvpScreenshotUrl);

  const labPersonas = useMemo(() => {
    return runState.personaOrder
      .slice(0, 6)
      .map((id) => runState.personas[id])
      .filter((p): p is PersonaState => Boolean(p));
  }, [runState.personaOrder, runState.personas]);

  // Assign quit doorway slots so multiple quitters don't stand on top of each other
  const quitIndices = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    labPersonas.forEach((p) => {
      if (p.status === "quit") {
        map.set(p.persona_id, idx);
        idx += 1;
      }
    });
    return map;
  }, [labPersonas]);

  return (
    <group>
      {/* 6 Lab Desks */}
      {LAB_DESK_POSITIONS.map((pos, idx) => {
        const persona = labPersonas[idx] ?? null;
        return (
          <LabStation
            key={idx}
            deskIdx={idx}
            position={pos}
            persona={persona}
            mvpImage={mvpImage}
            onClick={persona ? () => onSelectPersona(persona) : undefined}
          />
        );
      })}

      {/* Up to 6 Usability Lab Persona Chibis */}
      {labPersonas.map((persona, idx) => {
        const deskPos = LAB_DESK_POSITIONS[idx] ?? LAB_DESK_POSITIONS[0];
        const palette = LAB_PALETTES[idx % LAB_PALETTES.length];
        const latestAction =
          persona.actions.length > 0
            ? persona.actions[persona.actions.length - 1]
            : null;

        let targetPos: [number, number, number] = [deskPos[0], 0, deskPos[1] + 0.72];
        let rotY = Math.PI;
        let pose: ChibiPose = "type";
        let ring: StatusRingKind = "working";
        let bubble: string | null = latestAction?.thought ?? null;
        let bubbleKey: string | number = `${persona.persona_id}-${persona.actions.length}`;
        let bubbleAccent = "#f59e0b";

        if (persona.status === "quit") {
          const qIdx = quitIndices.get(persona.persona_id) ?? 0;
          // Walk to the Usability Lab doorway on the front-left of the lab
          targetPos = [
            5.75 + (qIdx % 3) * 0.85,
            0,
            -2.15 + Math.floor(qIdx / 3) * 0.8,
          ];
          rotY = 0.25;
          pose = "walk";
          ring = "quit";
          bubble = persona.quit_reason
            ? `Quit: ${persona.quit_reason}`
            : "Left the checkout";
          bubbleKey = `${persona.persona_id}-quit`;
          bubbleAccent = "#f43f5e";
        } else if (persona.status === "converted") {
          pose = "sit";
          ring = "converted";
          bubble = "Checked out!";
          bubbleKey = `${persona.persona_id}-converted`;
          bubbleAccent = "#34d399";
        }

        const firstName = persona.name.trim().split(/\s+/)[0] || persona.name;

        return (
          <Chibi
            key={persona.persona_id}
            name={firstName}
            color={palette.shirt}
            hairColor={palette.hair}
            skinColor={palette.skin}
            longHair={palette.longHair}
            position={targetPos}
            rotationY={rotY}
            pose={pose}
            statusRing={ring}
            bubble={showTags ? bubble : null}
            bubbleKey={bubbleKey}
            bubbleAccent={bubbleAccent}
            showNameTag={showTags}
            phase={idx * 1.15}
            onClick={() => onSelectPersona(persona)}
          />
        );
      })}
    </group>
  );
}

export function RoomsBack({
  runState,
  activeStage,
  focusedRoom,
  onSelectPersona,
}: RoomsBackProps) {
  const showAllTags = focusedRoom === "overview";

  return (
    <group>
      <PitchStudioRoom
        runState={runState}
        activeStage={activeStage}
        showTags={showAllTags || focusedRoom === "pitch"}
      />
      <BoardroomRoom
        runState={runState}
        activeStage={activeStage}
        showTags={showAllTags || focusedRoom === "boardroom"}
      />
      <UsabilityLabRoom
        runState={runState}
        showTags={showAllTags || focusedRoom === "lab"}
        onSelectPersona={onSelectPersona}
      />
    </group>
  );
}
