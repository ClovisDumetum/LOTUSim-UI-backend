/*
 * Copyright (c) 2025 Naval Group
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * https://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 */

/**
 * ************************************************************************************
 * *******************************   MODELS ROUTES   **********************************
 * ************************************************************************************
 *
 * Provides an API for managing 3D models and simulation files for Gazebo and Xdyn.
 *
 * Features:
 * - Lists available models stored in the system directory.
 * - Deletes a model folder and its contents.
 * - Creates a new model with:
 *    - Gazebo SDF file including STL mesh, sensors, and image.
 *    - Xdyn YAML file with hydrodynamic properties, propellers, and control surfaces.
 * - Supports parsing matrices and vectors for Xdyn hydrodynamic configuration.
 *
 * Endpoints:
 * - GET    /models           -> List all available models.
 * - POST   /model            -> Create a new model (SDF + Xdyn YAML).
 * - DELETE /model/:name      -> Delete an existing model by name (also
 *                               DELETE /model?name=, as earlier frontends sent).
 *
 * Notes:
 * - Uses synchronous and asynchronous file operations.
 * - Ensures folders exist before writing model files.
 * - Validates required fields in request body.
 *
 */

import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { modelsPath, errorMessage } from "../utils";
import { SDF } from "../models/sdf";
import {
  XdynYaml,
  Wave,
  Propeller,
  ControlSurface,
  PropellerWithRudder,
} from "../models/xdyn-yaml";
import { Vector3 } from "../interfaces/geometry";
import { Sensor } from "../interfaces/sensor";

const router = Router();

// ─── Request Types ───────────────────────────────────────────

export interface CreateModelRequestBody {
  modelName: string;
  /** Unused: the STL and the image come afterwards through POST /upload, and
   * the SDF always points to model://<modelName>/<modelName>.stl. */
  image?: string;
  stl?: string;
  sensors: Sensor[];
  xdyn?: {
    name: string;
    wave: Wave;
    meshDir: string;
    bodyFrameRelativeToMeshFrame: Vector3;
    hydroForcesCalcPoint: Vector3;
    centerOfInertia: Vector3;
    inertiaMatrixAtBuoyancy: string | number[][];
    addedMass: string | number[][];
    linearDamping: string | number[][];
    quadraticDamping: string | number[][];
    resistanceCurveSpeed: string | number[];
    resistanceCurveResistance: string | number[];
    propellers: Propeller[];
    rudders: ControlSurface[];
    propellerWithRudders: PropellerWithRudder[];
  };
}

// ─── Validation ──────────────────────────────────────────────

type ValidationResult = { valid: true } | { valid: false; error: string };

const invalid = (error: string): ValidationResult => ({ valid: false, error });

const validateCreateModelRequest = (body: CreateModelRequestBody): ValidationResult => {
  if (!body.modelName || typeof body.modelName !== "string")
    return invalid("Missing or invalid field: modelName");
  if (body.xdyn && !body.xdyn.name) return invalid("Missing field: xdyn.name");
  return { valid: true };
};

// ─── Helpers ─────────────────────────────────────────────────

const safeParse2DMatrix = (input: string | number[][]): number[][] =>
  typeof input === "string" ? JSON.parse(input) : input;

const safeParse1DArray = (input: string | number[]): number[] =>
  typeof input === "string" ? JSON.parse(input) : input;

const ensureDirectory = (dirPath: string): Promise<void> =>
  fs.promises.mkdir(dirPath, { recursive: true }).then(() => undefined);

const buildSdfFile = (modelName: string, sensors: Sensor[] = []): string => {
  const sdf = new SDF();
  sdf.name = modelName;
  sdf.sensors = sensors;
  return sdf.createSdfFile();
};

const buildXdynFile = (xdyn: NonNullable<CreateModelRequestBody["xdyn"]>): string => {
  const yaml = new XdynYaml();

  yaml.name = xdyn.name;
  yaml.wave = xdyn.wave;
  yaml.bodyFrameRelativeToMeshFrame = xdyn.bodyFrameRelativeToMeshFrame;
  yaml.hydroForcesCalcPoint = xdyn.hydroForcesCalcPoint;
  yaml.centerOfInertia = xdyn.centerOfInertia;
  yaml.inertiaMatrixAtBuoyancy = safeParse2DMatrix(xdyn.inertiaMatrixAtBuoyancy);
  yaml.addedMass = safeParse2DMatrix(xdyn.addedMass);
  yaml.linearDamping = safeParse2DMatrix(xdyn.linearDamping);
  yaml.quadraticDamping = safeParse2DMatrix(xdyn.quadraticDamping);
  yaml.resistanceCurveSpeed = safeParse1DArray(xdyn.resistanceCurveSpeed);
  yaml.resistanceCurveResistance = safeParse1DArray(xdyn.resistanceCurveResistance);
  yaml.propellers = xdyn.propellers;
  yaml.controlSurfaces = xdyn.rudders;
  yaml.propellerWithRudders = xdyn.propellerWithRudders;

  return yaml.createYaml();
};

// ─── Routes ──────────────────────────────────────────────────

/**
 * GET /models
 * Lists all model directories.
 */
router.get("/models", async (req: Request, res: Response): Promise<void> => {
  try {
    const entries = await fs.promises.readdir(modelsPath, { withFileTypes: true });
    const models = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    res.json({ success: true, count: models.length, models });
  } catch (err: unknown) {
    res.status(500).json({
      success: false,
      message: "Error reading models directory",
      details: errorMessage(err),
    });
  }
});

/**
 * GET /model/:name
 * Gets info about a specific model.
 */
router.get("/model/:name", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const modelPath = path.join(modelsPath, name);

    try {
      await fs.promises.access(modelPath);
    } catch {
      res.status(404).json({ success: false, message: `Model '${name}' not found` });
      return;
    }

    const files = await fs.promises.readdir(modelPath);
    res.json({ success: true, model: name, files });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: errorMessage(err) });
  }
});

/**
 * POST /model
 * Creates a new model (SDF + optionally Xdyn YAML).
 */
router.post("/model", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as CreateModelRequestBody;

    const validation = validateCreateModelRequest(body);
    if (!validation.valid) {
      res.status(400).json({ success: false, message: validation.error });
      return;
    }

    const { modelName, sensors, xdyn } = body;
    const folderPath = path.join(modelsPath, modelName);

    await ensureDirectory(folderPath);

    const sdfContent = buildSdfFile(modelName, sensors);
    await fs.promises.writeFile(path.join(folderPath, "model.sdf"), sdfContent, "utf-8");

    if (xdyn) {
      const xdynContent = buildXdynFile(xdyn);
      await fs.promises.writeFile(path.join(folderPath, "xdyn.yml"), xdynContent, "utf-8");
    }

    res.status(201).json({
      success: true,
      message: `Model '${modelName}' created successfully`,
    });
  } catch (err: unknown) {
    console.error("Error creating model:", err);
    res.status(500).json({ success: false, message: errorMessage(err) });
  }
});

/**
 * DELETE /model/:name (or DELETE /model?name=)
 * Deletes a model by name.
 */
const deleteModel = async (name: unknown, res: Response): Promise<void> => {
  try {
    if (!name || typeof name !== "string") {
      res.status(400).json({ success: false, message: "Missing or invalid model name" });
      return;
    }
    const modelPath = path.join(modelsPath, name);

    try {
      await fs.promises.access(modelPath);
    } catch {
      res.status(404).json({ success: false, message: `Model '${name}' not found` });
      return;
    }

    await fs.promises.rm(modelPath, { recursive: true, force: true });

    res.status(200).json({
      success: true,
      message: `Model '${name}' deleted successfully`,
    });
  } catch (err: unknown) {
    console.error("Error deleting model:", err);
    res.status(500).json({ success: false, message: errorMessage(err) });
  }
};

router.delete("/model/:name", (req: Request, res: Response) => deleteModel(req.params.name, res));
router.delete("/model", (req: Request, res: Response) => deleteModel(req.query.name, res));

export default router;
