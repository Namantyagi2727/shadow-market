"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAMERA_VIEWS, type RoomId } from "./types";

interface CameraRigProps {
  focusedRoom: RoomId;
}

const MAX_YAW_OFFSET = (15 * Math.PI) / 180; // ±15 degrees
const MAX_PITCH_OFFSET = (10 * Math.PI) / 180; // ±10 degrees

export function CameraRig({ focusedRoom }: CameraRigProps) {
  const { camera, gl } = useThree();

  const currentTarget = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.0, 0.2));
  const currentDist = useRef<number>(CAMERA_VIEWS.overview.distance);
  const currentElev = useRef<number>(CAMERA_VIEWS.overview.elevationRatio);
  const currentAzimuth = useRef<number>(CAMERA_VIEWS.overview.azimuth);

  // User mouse orbit offsets (strictly clamped to ±15°, no pan)
  const targetYawOffset = useRef<number>(0);
  const targetPitchOffset = useRef<number>(0);
  const currentYawOffset = useRef<number>(0);
  const currentPitchOffset = useRef<number>(0);
  const dragState = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
  }>({ active: false, lastX: 0, lastY: 0 });

  // Reset subtle orbit offset gently when switching rooms
  useEffect(() => {
    targetYawOffset.current = 0;
    targetPitchOffset.current = 0;
  }, [focusedRoom]);

  useEffect(() => {
    const dom = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragState.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragState.current.active) return;
      const dx = e.clientX - dragState.current.lastX;
      const dy = e.clientY - dragState.current.lastY;
      dragState.current.lastX = e.clientX;
      dragState.current.lastY = e.clientY;

      targetYawOffset.current = THREE.MathUtils.clamp(
        targetYawOffset.current - dx * 0.0025,
        -MAX_YAW_OFFSET,
        MAX_YAW_OFFSET
      );
      targetPitchOffset.current = THREE.MathUtils.clamp(
        targetPitchOffset.current + dy * 0.002,
        -MAX_PITCH_OFFSET,
        MAX_PITCH_OFFSET
      );
    };

    const onPointerUp = () => {
      dragState.current.active = false;
    };

    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const view = CAMERA_VIEWS[focusedRoom] ?? CAMERA_VIEWS.overview;

    // ~0.8s smooth glide (exponential damping lambda = 4.5 reaches 97.3% at 0.8s)
    const glideAlpha = 1 - Math.exp(-delta * 4.5);
    const orbitAlpha = 1 - Math.exp(-delta * 8.0);

    currentTarget.current.x = THREE.MathUtils.lerp(
      currentTarget.current.x,
      view.target[0],
      glideAlpha
    );
    currentTarget.current.y = THREE.MathUtils.lerp(
      currentTarget.current.y,
      view.target[1],
      glideAlpha
    );
    currentTarget.current.z = THREE.MathUtils.lerp(
      currentTarget.current.z,
      view.target[2],
      glideAlpha
    );

    currentDist.current = THREE.MathUtils.lerp(
      currentDist.current,
      view.distance,
      glideAlpha
    );
    currentElev.current = THREE.MathUtils.lerp(
      currentElev.current,
      view.elevationRatio,
      glideAlpha
    );
    currentAzimuth.current = THREE.MathUtils.lerp(
      currentAzimuth.current,
      view.azimuth,
      glideAlpha
    );

    currentYawOffset.current = THREE.MathUtils.lerp(
      currentYawOffset.current,
      targetYawOffset.current,
      orbitAlpha
    );
    currentPitchOffset.current = THREE.MathUtils.lerp(
      currentPitchOffset.current,
      targetPitchOffset.current,
      orbitAlpha
    );

    const ang = currentAzimuth.current + currentYawOffset.current;
    const elev = THREE.MathUtils.clamp(
      currentElev.current + currentPitchOffset.current * 0.65,
      0.32,
      0.92
    );
    const d = currentDist.current;

    camera.position.set(
      currentTarget.current.x + d * Math.cos(ang),
      currentTarget.current.y + d * elev,
      currentTarget.current.z + d * Math.sin(ang)
    );
    camera.lookAt(currentTarget.current);
  });

  return null;
}
