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
import { MASCmdRequest } from "./interfaces/ros";

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

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : "Internal server error";

// ─── Message Validation ────────────────────────────────────────────────

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// CREATE (0) and MOVE (2) always need a full position and heading
// Returns an error message, or null if the command is valid
export function validateMASCmd(cmd: MASCmdRequest): string | null {
  if (cmd.cmdType !== 0 && cmd.cmdType !== 2) return null;

  const g = cmd.geoPoint;
  if (!g || !finite(g.latitude) || !finite(g.longitude) || !finite(g.altitude) || !finite(cmd.heading)) {
    return "geoPoint (latitude, longitude, altitude) and heading are required.";
  }
  if (Math.abs(g.latitude) > 90 || Math.abs(g.longitude) > 180 || cmd.heading < 0 || cmd.heading >= 360) {
    return "latitude must be in [-90, 90], longitude in [-180, 180], heading in [0, 360).";
  }
  return null;
}