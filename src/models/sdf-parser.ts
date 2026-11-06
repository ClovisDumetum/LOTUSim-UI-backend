/*
 * Copyright (c) 2025 Naval Group
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * https://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import { parseStringPromise } from "xml2js";
import fs from "fs";
import path from "path";
import { modelsPath } from "../utils";

export interface SensorInfo {
  name: string;
  type: string;
}

export interface PowerDeviceInfo {
  name: string;
  type: string;
}

export interface ModelStaticInfo {
  sensors: SensorInfo[];
  powerDevices: PowerDeviceInfo[];
}

const modelInfoCache = new Map<string, ModelStaticInfo>();

const asArray = <T,>(val: T | T[] | undefined): T[] =>
  val === undefined ? [] : Array.isArray(val) ? val : [val];

function findSdfFile(modelDir: string, modelName: string): string | null {
  for (const candidate of ["model.sdf", `${modelName}.sdf`]) {
    const p = path.join(modelDir, candidate);
    if (fs.existsSync(p)) return p;
  }
  try {
    const found = fs.readdirSync(modelDir).find((f) => f.endsWith(".sdf"));
    return found ? path.join(modelDir, found) : null;
  } catch {
    return null;
  }
}

export async function parseModelSdf(modelName: string): Promise<ModelStaticInfo> {
  if (modelInfoCache.has(modelName)) return modelInfoCache.get(modelName)!;

  const modelDir = path.join(modelsPath, modelName);
  const sdfPath = findSdfFile(modelDir, modelName);
  if (!sdfPath) {
    console.warn(`No .sdf file found for model '${modelName}' in ${modelDir}`);
    return { sensors: [], powerDevices: [] };
  }

  const xml = fs.readFileSync(sdfPath, "utf-8");
  const parsed = await parseStringPromise(xml, { explicitArray: true });

  const model = parsed?.sdf?.model?.[0];
  if (!model) return { sensors: [], powerDevices: [] };

  const sensors: SensorInfo[] = [];
  for (const link of asArray(model.link)) {
    for (const sensor of asArray(link?.sensor)) {
      const attrs = sensor?.$ ?? {};
      sensors.push({ name: attrs.name ?? "unknown", type: attrs.type ?? "unknown" });
    }
  }

  const powerDevices: PowerDeviceInfo[] = asArray(model.lotusim_power).map((p: any) => ({
    name: p?.name?.[0] ?? "unknown",
    type: p?.type?.[0] ?? "unknown",
  }));

  const result = { sensors, powerDevices };
  modelInfoCache.set(modelName, result);
  return result;
}