/*
 * Copyright (c) 2025 Naval Group
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * https://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */
import { Quaternion } from "./interfaces/geometry";

// ─── Path Resolution ─────────────────────────────────────────

const resolveEnvPath = (envVar: string, fallback: string): string => {
  const value = process.env[envVar];
  if (value) {
    console.log(`${envVar}: ${value}`);
    return value;
  }
  console.warn(`${envVar} is not set, falling back to: ${fallback}`);
  return fallback;
};

export const modelsPath = resolveEnvPath(
  "LOTUSIM_MODELS_PATH",
  "~/lotusim_ws/src/lotusim/assets/models/",
);

export const scenariosPath = resolveEnvPath(
  "LOTUSIM_SCENARIOS_PATH",
  "~/lotusim_ws/src/LOTUSim/assets/scenarios/",
);

// ─── Geometry ────────────────────────────────────────────────

/**
 * Converts a quaternion to Euler angles [yaw (ψ), pitch (θ'), roll (φ'')]
 * in radians, using the ZYX convention.
 */
export function quaternionToEulerZYX(q: Quaternion): [number, number, number] {
  const { x, y, z, w } = q;

  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp);

  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  return [yaw, pitch, roll];
}

/** Compass bearing (deg, 0 = North, clockwise) -> ENU yaw (rad, 0 = East, counter-clockwise) */
export function bearingToEnuYawRad(bearingDeg: number): number {
  return ((90 - bearingDeg) * Math.PI) / 180;
}

/**
 * Extracts a GPS heading (degrees, [0, 360)) from a quaternion.
 * Converts ENU yaw (Gazebo convention) to NED heading.
 */
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "Internal server error";

export function quaternionToGpsHeading(qx: number, qy: number, qz: number, qw: number): number {
  const siny_cosp = 2 * (qw * qz + qx * qy);
  const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
  const yawRad = Math.atan2(siny_cosp, cosy_cosp);

  const headingDeg = 90 - (yawRad * 180) / Math.PI;
  const rounded = Math.round(headingDeg * 100) / 100;
  return (rounded + 360) % 360; //359.999 is now 360
}
