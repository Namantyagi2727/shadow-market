"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { resolveArtifactUrl, type Stage } from "@/lib/contracts";
import type { RunState } from "@/lib/run-store";
import { Chibi } from "./Chibi";
import {
  Laptop,
  OfficeChair,
  PendantLamp,
  ServerRack,
  WaterGlass,
} from "./Furniture";
import {
  createCanvasTexture,
  drawCaptionTicker,
  drawCodeScreen,
  drawMarketBoard,
  drawNameplate,
  drawServerScreen,
  drawTeleprompter,
  drawVerdictBoard,
  useArtifactImage,
  useDynamicCanvasTexture,
} from "./textures";
import type { RoomId, StatusRingKind } from "./types";

interface RoomsFrontProps {
  runState: RunState;
  activeStage: Stage;
  focusedRoom: RoomId;
}

function DualMonitorDevDesk({
  position,
  codeTex,
  mvpTex,
}: {
  position: [number, number, number];
  codeTex: THREE.CanvasTexture;
  mvpTex: THREE.CanvasTexture;
}) {
  return (
    <group position={position}>
      {/* Desk Surface & Legs */}
      <mesh position={[0, 1.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.0, 0.08, 0.95]} />
        <meshStandardMaterial color="#d8cfc0" roughness={0.5} />
      </mesh>
      {[-0.9, 0.9].map((lx) => (
        <mesh key={lx} position={[lx, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 1.0, 0.85]} />
          <meshStandardMaterial color="#30343e" roughness={0.65} />
        </mesh>
      ))}

      {/* Dual Angled Monitors */}
      {[-0.4, 0.4].map((mx, idx) => (
        <group
          key={idx}
          position={[mx, 1.06, -0.25]}
          rotation={[0, idx === 0 ? 0.18 : -0.18, 0]}
        >
          <mesh position={[0, 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
            <meshStandardMaterial color="#30343e" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.01, 0]} castShadow>
            <boxGeometry args={[0.26, 0.02, 0.18]} />
            <meshStandardMaterial color="#30343e" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.72, 0.44, 0.04]} />
            <meshStandardMaterial color="#15171c" roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.5, 0.024]}>
            <planeGeometry args={[0.66, 0.38]} />
            <meshBasicMaterial map={idx === 0 ? codeTex : mvpTex} />
          </mesh>
        </group>
      ))}

      {/* Keyboard & Coffee Mug */}
      <mesh position={[0, 1.07, 0.16]} castShadow>
        <boxGeometry args={[0.52, 0.02, 0.16]} />
        <meshStandardMaterial color="#2b2e36" roughness={0.6} />
      </mesh>
      <mesh position={[0.7, 1.12, 0.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.12, 12]} />
        <meshStandardMaterial color="#D85A30" roughness={0.5} />
      </mesh>

      <OfficeChair position={[0, 0, 0.78]} rotationY={Math.PI} />
    </group>
  );
}

function ServerRoom({
  runState,
  activeStage,
  showTags,
}: {
  runState: RunState;
  activeStage: Stage;
  showTags: boolean;
}) {
  const isBuilding = runState.buildMessages.length > 0 && !runState.mvp;
  const mvpScreenshotUrl = resolveArtifactUrl(
    runState.runId,
    runState.mvp?.screenshot_url
  );
  const mvpImage = useArtifactImage(mvpScreenshotUrl);

  const latestMsg =
    runState.buildMessages.length > 0
      ? runState.buildMessages[runState.buildMessages.length - 1].message
      : "";

  const serverScreenTex = useDynamicCanvasTexture(
    1024,
    640,
    (ctx, w, h) =>
      drawServerScreen(ctx, w, h, runState.buildMessages, runState.mvp, mvpImage),
    [runState.buildMessages.length, latestMsg, runState.mvp?.url, mvpImage]
  );

  // Live scrolling code texture for the developer dual monitors
  const codeAnimRef = useRef<{ offset: number; lastTick: number }>({
    offset: 0,
    lastTick: 0,
  });

  const codeTex = useMemo(() => {
    return createCanvasTexture(512, 320, (ctx, w, h) =>
      drawCodeScreen(ctx, w, h, 0)
    );
  }, []);

  useEffect(() => {
    return () => {
      codeTex.dispose();
    };
  }, [codeTex]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const interval = isBuilding ? 0.38 : 1.1;
    if (t - codeAnimRef.current.lastTick > interval) {
      codeAnimRef.current.lastTick = t;
      codeAnimRef.current.offset += 1;
      const canvas = codeTex.image as HTMLCanvasElement;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawCodeScreen(ctx, canvas.width, canvas.height, codeAnimRef.current.offset);
        codeTex.needsUpdate = true;
      }
    }
  });

  const devRing: StatusRingKind = isBuilding
    ? "working"
    : runState.mvp
    ? "converted"
    : activeStage === "build"
    ? "working"
    : "none";

  return (
    <group>
      {/* 4 Server Racks with Blinking Emissive LEDs while building */}
      <ServerRack position={[-14.9, 0, 2.05]} active={isBuilding} seed={1} />
      <ServerRack position={[-13.75, 0, 2.05]} active={isBuilding} seed={2} />
      <ServerRack position={[-9.85, 0, 2.05]} active={isBuilding} seed={3} />
      <ServerRack position={[-8.7, 0, 2.05]} active={isBuilding} seed={4} />

      {/* Wall Build Log / MVP Screenshot Display */}
      <mesh position={[-11.8, 1.66, 1.48]} castShadow receiveShadow>
        <boxGeometry args={[2.75, 1.75, 0.12]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.35} />
      </mesh>
      <mesh position={[-11.8, 1.66, 1.56]}>
        <planeGeometry args={[2.6, 1.62]} />
        <meshBasicMaterial map={serverScreenTex} />
      </mesh>

      {/* Dev Pit Dual-Monitor Desks + Pendant Lamps */}
      <DualMonitorDevDesk
        position={[-13.2, 0, 6.2]}
        codeTex={codeTex}
        mvpTex={serverScreenTex}
      />
      <DualMonitorDevDesk
        position={[-10.4, 0, 6.2]}
        codeTex={codeTex}
        mvpTex={serverScreenTex}
      />

      <PendantLamp position={[-13.2, 5.2, 6.2]} lightIntensity={0.7} />
      <PendantLamp position={[-10.4, 5.2, 6.2]} lightIntensity={0.7} />

      {/* 2 Developer Chibis */}
      <Chibi
        name="Builder"
        color="#1D9E75"
        hairColor="#2a1b12"
        skinColor="#e0ac69"
        position={[-13.2, 0, 6.92]}
        rotationY={Math.PI}
        pose={isBuilding || activeStage === "build" ? "type" : "sit"}
        statusRing={devRing}
        bubble={isBuilding && latestMsg ? latestMsg : null}
        bubbleKey={latestMsg}
        bubbleAccent="#34d399"
        showNameTag={showTags}
        phase={0.5}
      />
      <Chibi
        name="Designer"
        color="#7F77DD"
        hairColor="#6b3e26"
        skinColor="#f1c27d"
        longHair
        position={[-10.4, 0, 6.92]}
        rotationY={Math.PI}
        pose={isBuilding || activeStage === "build" ? "type" : "sit"}
        statusRing={devRing}
        showNameTag={showTags}
        phase={1.9}
      />
    </group>
  );
}

const SWARM_COUNT = 200;
const SWARM_COLS = 20;
const SWARM_ROWS = 10;

function MarketFloorRoom({ runState }: { runState: RunState }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const figureGeo = useMemo(
    () => new THREE.CapsuleGeometry(0.11, 0.28, 6, 10),
    []
  );
  const figureMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.6,
        metalness: 0.05,
      }),
    []
  );

  useEffect(() => {
    return () => {
      figureGeo.dispose();
      figureMat.dispose();
    };
  }, [figureGeo, figureMat]);

  const boardTex = useDynamicCanvasTexture(
    1024,
    640,
    (ctx, w, h) =>
      drawMarketBoard(ctx, w, h, runState.swarmProgress, runState.swarmResult),
    [
      runState.swarmProgress?.done,
      runState.swarmProgress?.total,
      runState.swarmResult?.intent_mean,
      runState.swarmResult ? JSON.stringify(runState.swarmResult.rubrics) : "",
    ]
  );

  // Compute grid positions & per-instance colors
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const result = runState.swarmResult;
    const progress = runState.swarmProgress;
    const expectedBuyers = result
      ? Math.round(Math.max(0, Math.min(1, result.intent_mean)) * SWARM_COUNT)
      : 0;
    const litProgress =
      !result && progress && progress.total > 0
        ? Math.round(
            Math.max(0, Math.min(1, progress.done / progress.total)) * SWARM_COUNT
          )
        : 0;

    for (let i = 0; i < SWARM_COUNT; i += 1) {
      const col = i % SWARM_COLS;
      const row = Math.floor(i / SWARM_COLS);
      const x = -6.95 + col * 0.34;
      const z = 3.7 + row * 0.62;

      dummy.position.set(x, 0.32, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (result) {
        tmpColor.set(i < expectedBuyers ? "#34d399" : "#64748b");
      } else if (i < litProgress) {
        tmpColor.set("#38bdf8");
      } else {
        tmpColor.set("#64748b");
      }
      mesh.setColorAt(i, tmpColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [runState.swarmProgress, runState.swarmResult, dummy, tmpColor]);

  // Subtle living bob for the active figures
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const result = runState.swarmResult;
    const progress = runState.swarmProgress;
    const activeCount = result
      ? Math.round(Math.max(0, Math.min(1, result.intent_mean)) * SWARM_COUNT)
      : progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * SWARM_COUNT)
      : 0;

    if (activeCount === 0) return;

    for (let i = 0; i < SWARM_COUNT; i += 1) {
      const col = i % SWARM_COLS;
      const row = Math.floor(i / SWARM_COLS);
      const x = -6.95 + col * 0.34;
      const z = 3.7 + row * 0.62;
      const isLit = i < activeCount;
      const bob = isLit ? 0.045 * Math.sin(t * 3.2 + col * 0.45 + row * 0.6) : 0;

      dummy.position.set(x, 0.32 + Math.max(0, bob), z);
      dummy.scale.set(1, isLit ? 1.08 : 0.96, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* Wall Display Card: "Expected buyers (mean intent)" + 5 rubric bars */}
      <mesh position={[-3.7, 1.56, 1.48]} castShadow receiveShadow>
        <boxGeometry args={[5.4, 2.35, 0.12]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.35} />
      </mesh>
      <mesh position={[-3.7, 1.56, 1.56]}>
        <planeGeometry args={[5.2, 2.2]} />
        <meshBasicMaterial map={boardTex} />
      </mesh>

      {/* 200 Small Buyer Figures as ONE InstancedMesh */}
      <instancedMesh
        ref={meshRef}
        args={[figureGeo, figureMat, SWARM_COUNT]}
        castShadow
        receiveShadow
      />
    </group>
  );
}

function VerdictRoom({
  runState,
  activeStage,
  showTags,
}: {
  runState: RunState;
  activeStage: Stage;
  showTags: boolean;
}) {
  const verdictTex = useDynamicCanvasTexture(
    1120,
    680,
    (ctx, w, h) => drawVerdictBoard(ctx, w, h, runState.verdict),
    [runState.verdict]
  );

  const ring: StatusRingKind = !runState.verdict
    ? activeStage === "verdict"
      ? "working"
      : "none"
    : runState.verdict.launch_probability >= 0.6
    ? "converted"
    : runState.verdict.launch_probability >= 0.35
    ? "working"
    : "quit";

  return (
    <group>
      {/* Large Wall Verdict Display */}
      <mesh position={[4.3, 1.66, 1.48]} castShadow receiveShadow>
        <boxGeometry args={[5.6, 2.65, 0.14]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.32} />
      </mesh>
      <mesh position={[4.3, 1.66, 1.57]}>
        <planeGeometry args={[5.38, 2.48]} />
        <meshBasicMaterial map={verdictTex} />
      </mesh>

      {/* Analyst Briefing Bench */}
      <mesh position={[4.6, 0.45, 6.2]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.9, 0.85]} />
        <meshStandardMaterial color="#3c2f3f" roughness={0.55} />
      </mesh>
      <Laptop
        position={[4.6, 0.91, 6.2]}
        rotationY={Math.PI}
        glowColor="#EF9F27"
      />

      {/* Analyst Chibi */}
      <Chibi
        name="Analyst"
        color="#a78bfa"
        hairColor="#1f2937"
        skinColor="#e0ac69"
        position={[2.35, 0, 6.2]}
        rotationY={0.48}
        pose={activeStage === "verdict" && runState.verdict ? "talk" : "stand"}
        statusRing={ring}
        bubble={
          activeStage === "verdict" && runState.verdict
            ? runState.verdict.summary
            : null
        }
        bubbleKey={runState.verdict?.summary ?? "none"}
        bubbleAccent="#EF9F27"
        showNameTag={showTags}
        phase={3.1}
      />
    </group>
  );
}

const DEFAULT_JUDGE_ROLES = ["VC partner", "Skeptical CFO", "Product lead"];
const JUDGE_STYLES = [
  { shirt: "#378ADD", hair: "#2a1b12", skin: "#e0ac69", longHair: false },
  { shirt: "#993C1D", hair: "#c9a36b", skin: "#f1c27d", longHair: true },
  { shirt: "#5F5E5A", hair: "#111111", skin: "#8d5524", longHair: false },
];

function JudgeNameplate({
  position,
  role,
}: {
  position: [number, number, number];
  role: string;
}) {
  const plateTex = useDynamicCanvasTexture(
    256,
    64,
    (ctx, w, h) => drawNameplate(ctx, w, h, role),
    [role]
  );

  return (
    <mesh position={position} rotation={[-0.25, 0, 0]} castShadow>
      <boxGeometry args={[0.96, 0.23, 0.04]} />
      <meshStandardMaterial map={plateTex} roughness={0.5} />
    </mesh>
  );
}

function JudgesRoom({
  runState,
  showTags,
}: {
  runState: RunState;
  showTags: boolean;
}) {
  const latestChallenge =
    runState.twinChallenges.length > 0
      ? runState.twinChallenges[runState.twinChallenges.length - 1]
      : null;
  const latestBrief =
    runState.founderBriefs.length > 0
      ? runState.founderBriefs[runState.founderBriefs.length - 1]
      : null;
  const latestUtterance =
    runState.roomUtterances.length > 0
      ? runState.roomUtterances[runState.roomUtterances.length - 1]
      : null;

  const teleprompterTex = useDynamicCanvasTexture(
    1024,
    400,
    (ctx, w, h) => drawTeleprompter(ctx, w, h, latestBrief),
    [latestBrief?.challenge_id, latestBrief?.line, latestBrief?.badge]
  );

  const captionTex = useDynamicCanvasTexture(
    1024,
    110,
    (ctx, w, h) =>
      drawCaptionTicker(ctx, w, h, runState.roomCaption, latestUtterance),
    [runState.roomCaption, latestUtterance?.utterance_id]
  );

  // Derive seat roles from twinChallenges if provided
  const seatRoles = useMemo(() => {
    const roles = [...DEFAULT_JUDGE_ROLES];
    runState.twinChallenges.forEach((ch) => {
      const idx = ch.seat - 1;
      if (idx >= 0 && idx < 3 && ch.role.trim().length > 0) {
        roles[idx] = ch.role.trim();
      }
    });
    return roles;
  }, [runState.twinChallenges]);

  const seatXs = [10.1, 12.0, 13.9];

  return (
    <group>
      {/* Teleprompter Wall Screen (latest founderBrief) */}
      <mesh position={[12.0, 2.02, 1.48]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 1.72, 0.12]} />
        <meshStandardMaterial color="#0b0c10" roughness={0.32} />
      </mesh>
      <mesh position={[12.0, 2.02, 1.56]}>
        <planeGeometry args={[5.62, 1.58]} />
        <meshBasicMaterial map={teleprompterTex} />
      </mesh>

      {/* Caption Ticker Strip (roomCaption) */}
      <mesh position={[12.0, 0.84, 1.48]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 0.5, 0.1]} />
        <meshStandardMaterial color="#111520" roughness={0.4} />
      </mesh>
      <mesh position={[12.0, 0.84, 1.55]}>
        <planeGeometry args={[5.64, 0.42]} />
        <meshBasicMaterial map={captionTex} />
      </mesh>

      {/* Walnut Judges' Table (facing +Z so faces, laptops & nameplates face camera) */}
      <mesh position={[12.0, 1.05, 6.2]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 0.12, 1.4]} />
        <meshStandardMaterial color="#5a3d29" roughness={0.5} />
      </mesh>
      <mesh position={[12.0, 0.55, 6.84]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 0.95, 0.08]} />
        <meshStandardMaterial color="#4a3222" roughness={0.6} />
      </mesh>
      {[9.25, 14.75].map((lx) => (
        <mesh key={lx} position={[lx, 0.5, 6.2]} castShadow receiveShadow>
          <boxGeometry args={[0.1, 1.0, 1.25]} />
          <meshStandardMaterial color="#4a3222" roughness={0.6} />
        </mesh>
      ))}

      {/* 3 Judge-Twin Seats */}
      {seatXs.map((x, idx) => {
        const seatNum = idx + 1;
        const isChallenging = latestChallenge?.seat === seatNum;
        const style = JUDGE_STYLES[idx];
        const role = seatRoles[idx];

        return (
          <group key={seatNum}>
            <OfficeChair position={[x, 0, 5.15]} rotationY={0} />
            <Chibi
              name={role}
              color={style.shirt}
              hairColor={style.hair}
              skinColor={style.skin}
              longHair={style.longHair}
              position={[x, 0, 5.28]}
              rotationY={0}
              pose={isChallenging ? "talk" : "type"}
              statusRing={isChallenging ? "speaking" : "none"}
              bubble={isChallenging ? latestChallenge?.text : null}
              bubbleKey={isChallenging ? latestChallenge?.challenge_id : "none"}
              bubbleAccent="#60a5fa"
              showNameTag={showTags}
              phase={idx * 1.4 + 0.6}
            />
            <Laptop
              position={[x, 1.11, 5.98]}
              rotationY={0}
              glowColor={isChallenging ? "#60a5fa" : "#9fc6ff"}
            />
            <WaterGlass position={[x + 0.55, 1.22, 6.08]} />
            <JudgeNameplate position={[x, 1.22, 6.72]} role={role} />
          </group>
        );
      })}
    </group>
  );
}

export function RoomsFront({
  runState,
  activeStage,
  focusedRoom,
}: RoomsFrontProps) {
  const showAllTags = focusedRoom === "overview";

  return (
    <group>
      <ServerRoom
        runState={runState}
        activeStage={activeStage}
        showTags={showAllTags || focusedRoom === "server"}
      />
      <MarketFloorRoom runState={runState} />
      <VerdictRoom
        runState={runState}
        activeStage={activeStage}
        showTags={showAllTags || focusedRoom === "verdict"}
      />
      <JudgesRoom
        runState={runState}
        showTags={showAllTags || focusedRoom === "judges"}
      />
    </group>
  );
}
