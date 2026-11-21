"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  STATUS_RING_COLORS,
  type ChibiPose,
  type StatusRingKind,
} from "./types";

// Shared static geometries across all Chibi characters
const HEAD_GEO = new THREE.SphereGeometry(0.29, 20, 16);
const EYE_GEO = new THREE.SphereGeometry(0.035, 10, 8);
const MOUTH_GEO = new THREE.BoxGeometry(0.1, 0.025, 0.02);
const HAIR_GEO = new THREE.SphereGeometry(0.31, 20, 14);
const LONG_HAIR_GEO = new THREE.BoxGeometry(0.55, 0.55, 0.18);
const NECK_GEO = new THREE.CylinderGeometry(0.09, 0.1, 0.12, 12);
const TORSO_GEO = new THREE.CylinderGeometry(0.27, 0.3, 0.78, 16);
const SHOULDER_GEO = new THREE.SphereGeometry(0.27, 16, 12);
const ARM_GEO = new THREE.CylinderGeometry(0.085, 0.075, 0.6, 12);
const HAND_GEO = new THREE.SphereGeometry(0.08, 12, 10);
const STAND_LEG_GEO = new THREE.CylinderGeometry(0.11, 0.1, 0.95, 12);
const STAND_SHOE_GEO = new THREE.BoxGeometry(0.2, 0.12, 0.32);
const SIT_THIGH_GEO = new THREE.CylinderGeometry(0.11, 0.11, 0.55, 12);
const SIT_SHIN_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.75, 12);
const SIT_SHOE_GEO = new THREE.BoxGeometry(0.18, 0.12, 0.3);
const LANYARD_GEO = new THREE.BoxGeometry(0.16, 0.22, 0.02);
const MIC_HANDLE_GEO = new THREE.CylinderGeometry(0.035, 0.025, 0.32, 10);
const MIC_HEAD_GEO = new THREE.SphereGeometry(0.065, 12, 10);
const STATUS_RING_GEO = new THREE.TorusGeometry(0.52, 0.045, 10, 32);

const EYE_MAT = new THREE.MeshStandardMaterial({ color: "#1b1b1f", roughness: 0.4 });
const MOUTH_MAT = new THREE.MeshStandardMaterial({ color: "#a0522d", roughness: 0.7 });
const SHOE_MAT = new THREE.MeshStandardMaterial({ color: "#1b1b1f", roughness: 0.7 });
const LANYARD_MAT = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 });
const MIC_HANDLE_MAT = new THREE.MeshStandardMaterial({
  color: "#1b1b1f",
  metalness: 0.5,
  roughness: 0.4,
});
const MIC_HEAD_MAT = new THREE.MeshStandardMaterial({
  color: "#2a2a2a",
  roughness: 0.9,
});

export interface ChibiProps {
  name: string;
  color: string;
  hairColor?: string;
  skinColor?: string;
  pantsColor?: string;
  longHair?: boolean;
  hasLanyard?: boolean;
  hasMic?: boolean;
  position: [number, number, number];
  rotationY?: number;
  pose: ChibiPose;
  statusRing?: StatusRingKind;
  bubble?: string | null;
  bubbleKey?: string | number;
  bubbleAccent?: string;
  showNameTag?: boolean;
  phase?: number;
  onClick?: () => void;
}

function truncateBubble(text: string, maxChars = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

export function Chibi({
  name,
  color,
  hairColor = "#3b2a20",
  skinColor = "#e0ac69",
  pantsColor = "#2d3142",
  longHair = false,
  hasLanyard = false,
  hasMic = false,
  position,
  rotationY = 0,
  pose,
  statusRing = "none",
  bubble = null,
  bubbleKey,
  bubbleAccent = "#e2e8f0",
  showNameTag = true,
  phase = 0,
  onClick,
}: ChibiProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const ringMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const currentPosRef = useRef<THREE.Vector3>(
    new THREE.Vector3(position[0], position[1], position[2])
  );
  const currentRotYRef = useRef<number>(rotationY);
  const initializedRef = useRef<boolean>(false);

  // Auto-fade speech bubble after ~6 seconds
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const [bubbleFading, setBubbleFading] = useState(false);

  useEffect(() => {
    if (!bubble || bubble.trim().length === 0) {
      setBubbleVisible(false);
      setBubbleFading(false);
      return;
    }
    setBubbleVisible(true);
    setBubbleFading(false);

    const fadeTimer = setTimeout(() => {
      setBubbleFading(true);
    }, 5200);

    const hideTimer = setTimeout(() => {
      setBubbleVisible(false);
    }, 6000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [bubble, bubbleKey]);

  // Materials for this character's palette
  const materials = useMemo(() => {
    return {
      shirt: new THREE.MeshStandardMaterial({ color, roughness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.78 }),
      skin: new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 }),
      pants: new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.78 }),
    };
  }, [color, hairColor, skinColor, pantsColor]);

  useEffect(() => {
    return () => {
      materials.shirt.dispose();
      materials.hair.dispose();
      materials.skin.dispose();
      materials.pants.dispose();
    };
  }, [materials]);

  const isSeated = pose === "sit" || pose === "type";
  const hipY = isSeated ? 0.82 : 1.0;

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const t = clock.getElapsedTime();
    const s = t * 6.5 + phase;

    const root = rootRef.current;
    if (!root) return;

    if (!initializedRef.current) {
      currentPosRef.current.set(position[0], position[1], position[2]);
      currentRotYRef.current = rotationY;
      root.position.copy(currentPosRef.current);
      root.rotation.y = currentRotYRef.current;
      initializedRef.current = true;
    }

    // Smooth walk/reposition lerp toward target
    const targetX = position[0];
    const targetY = position[1];
    const targetZ = position[2];
    const dx = targetX - currentPosRef.current.x;
    const dz = targetZ - currentPosRef.current.z;
    const horizDist = Math.hypot(dx, dz);
    const isMoving = horizDist > 0.04;

    if (pose === "walk" || isMoving) {
      const moveAlpha = 1 - Math.exp(-delta * (pose === "walk" ? 2.6 : 6.0));
      currentPosRef.current.x += dx * moveAlpha;
      currentPosRef.current.y += (targetY - currentPosRef.current.y) * moveAlpha;
      currentPosRef.current.z += dz * moveAlpha;
    } else {
      currentPosRef.current.set(targetX, targetY, targetZ);
    }

    root.position.copy(currentPosRef.current);

    // Face direction of travel while walking, otherwise smoothly orient to rotationY
    const desiredRotY = isMoving ? Math.atan2(dx, dz) : rotationY;
    let angleDiff = desiredRotY - currentRotYRef.current;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    currentRotYRef.current += angleDiff * (1 - Math.exp(-delta * 7));
    root.rotation.y = currentRotYRef.current;

    // Body idle bob & walk bounce
    if (bodyRef.current) {
      if (isMoving) {
        bodyRef.current.position.y = Math.abs(Math.sin(t * 9 + phase)) * 0.08;
      } else {
        bodyRef.current.position.y = Math.sin(t * 2.2 + phase) * 0.022;
      }
    }

    // Head subtle motion
    if (headRef.current) {
      if (pose === "type") {
        headRef.current.rotation.y = 0.14 * Math.sin(t * 0.9 + phase);
        headRef.current.rotation.x = 0.12;
      } else if (pose === "talk") {
        headRef.current.rotation.y = 0.2 * Math.sin(t * 1.4 + phase);
        headRef.current.rotation.x = 0.04 * Math.sin(t * 2.6 + phase);
      } else {
        headRef.current.rotation.y = 0.12 * Math.sin(t * 0.65 + phase);
        headRef.current.rotation.x = 0;
      }
    }

    // Arms animation
    const la = leftArmRef.current;
    const ra = rightArmRef.current;
    if (la && ra) {
      if (isMoving) {
        const swing = Math.sin(t * 9 + phase) * 0.55;
        la.rotation.set(swing, 0, 0.08);
        ra.rotation.set(-swing, 0, -0.08);
      } else if (pose === "type") {
        la.rotation.set(-1.15 + 0.07 * Math.sin(s * 2.1), 0, 0.12);
        ra.rotation.set(-1.15 + 0.07 * Math.cos(s * 2.4), 0, -0.12);
      } else if (pose === "sit") {
        la.rotation.set(-0.9, 0, 0.1);
        ra.rotation.set(-0.9, 0, -0.1);
      } else if (pose === "talk") {
        if (hasMic) {
          la.rotation.set(-0.55 + 0.3 * Math.sin(t * 2.4 + phase), 0, 0.32);
          ra.rotation.set(-2.15 + 0.06 * Math.sin(t * 2.0), 0, -0.24);
        } else {
          la.rotation.set(-0.65 + 0.28 * Math.sin(t * 3.1 + phase), 0, 0.22);
          ra.rotation.set(-0.65 + 0.28 * Math.cos(t * 2.8 + phase), 0, -0.22);
        }
      } else {
        // stand (or arrived from walk)
        if (hasMic) {
          la.rotation.set(-0.25, 0, 0.15);
          ra.rotation.set(-1.85, 0, -0.2);
        } else {
          la.rotation.set(0.06 * Math.sin(t * 1.8 + phase), 0, 0.08);
          ra.rotation.set(-0.06 * Math.sin(t * 1.8 + phase), 0, -0.08);
        }
      }
    }

    // Standing leg swing while walking
    if (!isSeated && leftLegRef.current && rightLegRef.current) {
      if (isMoving) {
        const legSwing = Math.sin(t * 9 + phase) * 0.45;
        leftLegRef.current.rotation.x = -legSwing;
        rightLegRef.current.rotation.x = legSwing;
      } else {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
      }
    }

    // Pulse status ring gently
    if (ringMatRef.current && statusRing !== "none") {
      ringMatRef.current.emissiveIntensity =
        statusRing === "speaking" || statusRing === "working"
          ? 1.1 + 0.5 * Math.sin(t * 4.2 + phase)
          : 0.9;
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick();
  };

  const ringColor =
    statusRing !== "none" ? STATUS_RING_COLORS[statusRing] : null;
  const formattedBubble = bubble ? truncateBubble(bubble, 90) : null;

  return (
    <group
      ref={rootRef}
      onClick={handleClick}
      onPointerOver={() => {
        if (onClick) document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (onClick) document.body.style.cursor = "auto";
      }}
    >
      {/* Floor Status Ring */}
      {ringColor && (
        <mesh
          geometry={STATUS_RING_GEO}
          position={[0, 0.06, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <meshStandardMaterial
            ref={ringMatRef}
            color={ringColor}
            emissive={ringColor}
            emissiveIntensity={1.0}
            roughness={0.35}
          />
        </mesh>
      )}

      {/* Animated Chibi Body */}
      <group ref={bodyRef}>
        {/* Legs & Shoes */}
        {isSeated ? (
          <>
            {[-0.15, 0.15].map((lx) => (
              <group key={lx}>
                <mesh
                  geometry={SIT_THIGH_GEO}
                  material={materials.pants}
                  position={[lx, hipY, 0.25]}
                  rotation={[Math.PI / 2, 0, 0]}
                  castShadow
                  receiveShadow
                />
                <mesh
                  geometry={SIT_SHIN_GEO}
                  material={materials.pants}
                  position={[lx, 0.42, 0.5]}
                  castShadow
                  receiveShadow
                />
                <mesh
                  geometry={SIT_SHOE_GEO}
                  material={SHOE_MAT}
                  position={[lx, 0.06, 0.58]}
                  castShadow
                />
              </group>
            ))}
          </>
        ) : (
          <>
            <group ref={leftLegRef} position={[-0.15, 0.95, 0]}>
              <mesh
                geometry={STAND_LEG_GEO}
                material={materials.pants}
                position={[0, -0.45, 0]}
                castShadow
                receiveShadow
              />
              <mesh
                geometry={STAND_SHOE_GEO}
                material={SHOE_MAT}
                position={[0, -0.89, 0.06]}
                castShadow
              />
            </group>
            <group ref={rightLegRef} position={[0.15, 0.95, 0]}>
              <mesh
                geometry={STAND_LEG_GEO}
                material={materials.pants}
                position={[0, -0.45, 0]}
                castShadow
                receiveShadow
              />
              <mesh
                geometry={STAND_SHOE_GEO}
                material={SHOE_MAT}
                position={[0, -0.89, 0.06]}
                castShadow
              />
            </group>
          </>
        )}

        {/* Torso & Shoulders */}
        <mesh
          geometry={TORSO_GEO}
          material={materials.shirt}
          position={[0, hipY + 0.42, 0]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={SHOULDER_GEO}
          material={materials.shirt}
          position={[0, hipY + 0.8, 0]}
          scale={[1.12, 0.55, 0.95]}
          castShadow
          receiveShadow
        />
        <mesh
          geometry={NECK_GEO}
          material={materials.skin}
          position={[0, hipY + 0.95, 0]}
          castShadow
        />

        {hasLanyard && (
          <mesh
            geometry={LANYARD_GEO}
            material={LANYARD_MAT}
            position={[0, hipY + 0.35, 0.3]}
            castShadow
          />
        )}

        {/* Head, Eyes, Mouth & Hair */}
        <group ref={headRef} position={[0, hipY + 1.24, 0]}>
          <mesh
            geometry={HEAD_GEO}
            material={materials.skin}
            castShadow
            receiveShadow
          />
          <mesh geometry={EYE_GEO} material={EYE_MAT} position={[-0.1, 0.03, 0.26]} />
          <mesh geometry={EYE_GEO} material={EYE_MAT} position={[0.1, 0.03, 0.26]} />
          <mesh geometry={MOUTH_GEO} material={MOUTH_MAT} position={[0, -0.1, 0.27]} />
          <mesh
            geometry={HAIR_GEO}
            material={materials.hair}
            position={[0, 0.06, -0.03]}
            scale={[1, longHair ? 1.05 : 0.82, 1]}
            castShadow
          />
          {longHair && (
            <mesh
              geometry={LONG_HAIR_GEO}
              material={materials.hair}
              position={[0, -0.18, -0.16]}
              castShadow
            />
          )}
        </group>

        {/* Left Arm */}
        <group ref={leftArmRef} position={[-0.36, hipY + 0.74, 0]}>
          <mesh
            geometry={ARM_GEO}
            material={materials.shirt}
            position={[0, -0.3, 0]}
            castShadow
          />
          <mesh
            geometry={HAND_GEO}
            material={materials.skin}
            position={[0, -0.64, 0]}
            castShadow
          />
        </group>

        {/* Right Arm (+ optional handheld mic) */}
        <group ref={rightArmRef} position={[0.36, hipY + 0.74, 0]}>
          <mesh
            geometry={ARM_GEO}
            material={materials.shirt}
            position={[0, -0.3, 0]}
            castShadow
          />
          <mesh
            geometry={HAND_GEO}
            material={materials.skin}
            position={[0, -0.64, 0]}
            castShadow
          />
          {hasMic && (
            <group position={[0, -0.66, 0.05]}>
              <mesh
                geometry={MIC_HANDLE_GEO}
                material={MIC_HANDLE_MAT}
                position={[0, 0.05, 0]}
                castShadow
              />
              <mesh
                geometry={MIC_HEAD_GEO}
                material={MIC_HEAD_MAT}
                position={[0, 0.24, 0]}
                castShadow
              />
            </group>
          )}
        </group>
      </group>

      {/* Compact Name Tag via drei Html */}
      {showNameTag && (
        <Html
          position={[0, hipY + 1.85, 0]}
          center
          distanceFactor={15}
          zIndexRange={[8, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="whitespace-nowrap rounded-full border border-white/15 bg-[#0e1118]/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-100 shadow-md backdrop-blur-sm">
            {name}
          </div>
        </Html>
      )}

      {/* Auto-fading Speech Bubble via drei Html */}
      {bubbleVisible && formattedBubble && (
        <Html
          position={[0, hipY + 2.65, 0]}
          center
          distanceFactor={14}
          zIndexRange={[20, 10]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className={`max-w-[230px] rounded-xl border bg-[#0d1018]/92 px-3 py-1.5 text-[11px] font-medium leading-snug text-zinc-100 shadow-xl backdrop-blur-md transition-opacity duration-700 ${
              bubbleFading ? "opacity-0" : "opacity-100"
            }`}
            style={{ borderColor: `${bubbleAccent}88` }}
          >
            <div className="line-clamp-3">&ldquo;{formattedBubble}&rdquo;</div>
          </div>
        </Html>
      )}
    </group>
  );
}
