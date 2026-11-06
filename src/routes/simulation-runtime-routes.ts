/**
 * ************************************************************************************
 * *******************************   GAZEBO ROS API ROUTER   **************************
 * ************************************************************************************
 *
 * Express router for managing a running Lotusim simulation instances vessels via ROS.
 *
 * Routes:
 * - GET    /instance/:instance/vessels       : Get all vessels in an instance.
 * - POST   /instance/:instance/vessels       : Send MAS commands to multiple vessels.
 * - POST   /instance/:instance/vessel        : Send a MAS command to a single vessel.
 * - DELETE /instance/:instance/vessels       : Delete all vessels in an instance.
 * - GET    /instance/:instance/vessel?name=  : Get the position of a specific vessel.
 */

import path from "path";
import { Router, Request, Response } from "express";
import { MASCmdRequest, MASCmdArrayRequest, rosInstances } from "../interfaces/ros";
import { VesselPosition } from "../interfaces/geometry";
import { Scenario } from "../interfaces/lotusim/scenario";
import { errorMessage, scenariosPath } from "../utils";

const router = Router();

router.get("/instance/:instance/vessels", (req: Request, res: Response): void => {
  const { instance } = req.params;
  const mapping = rosInstances.getInstancevesselPositionMap(instance);

  if (!mapping) {
    res.status(404).json({ success: false, message: `Instance '${instance}' not found.` });
    return;
  }

  const result: VesselPosition[] = Array.from(mapping.values());
  res.status(200).json({ success: true, vessels: result });
});

router.get("/instance/:instance/vessel", (req: Request, res: Response): void => {
  const { instance } = req.params;
  const { name } = req.query as { name?: string };

  if (!name) {
    res.status(400).json({ success: false, message: "Query parameter 'name' is required." });
    return;
  }

  const vesselInfo = rosInstances.getVesselPosition(instance, name);
  if (!vesselInfo) {
    res.status(404).json({
      success: false,
      message: `Vessel '${name}' not found in instance '${instance}'.`,
    });
    return;
  }

  res.status(200).json({ success: true, vessel: vesselInfo });
});

router.post("/instance/:instance/vessel", async (req: Request, res: Response): Promise<void> => {
  try {
    const { instance } = req.params;
    const cmd = req.body as MASCmdRequest;
    const ok = await rosInstances.sendMASCmd(instance, cmd);
    if (ok) {
      res.status(200).json({ success: true, message: "MAS command accepted." });
    } else {
      res.status(400).json({ success: false, message: "MAS command rejected." });
    }
  } catch (err) {
    console.error("POST /vessel error:", err);
    res.status(500).json({ success: false, message: errorMessage(err) });
  }
});

router.post("/instance/:instance/vessels", async (req: Request, res: Response): Promise<void> => {
  try {
    const { instance } = req.params;
    const cmds = (req.body as MASCmdArrayRequest).cmd;
    const ok = await rosInstances.sendMASCmdArray(instance, cmds);
    if (ok) {
      res.status(200).json({ success: true, message: "MAS command array accepted." });
    } else {
      res.status(400).json({ success: false, message: "MAS command array rejected." });
    }
  } catch (err) {
    console.error("POST /vessels error:", err);
    res.status(500).json({ success: false, message: errorMessage(err) });
  }
});

router.delete("/instance/:instance/vessels", (req: Request, res: Response): void => {
  try {
    const { instance } = req.params;
    rosInstances.clearVessels(instance);
    res.status(200).json({ success: true, message: "All vessels cleared." });
  } catch (err) {
    console.error("DELETE /vessels error:", err);
    res.status(500).json({ success: false, message: errorMessage(err) });
  }
});

router.post(
  "/instance/:instance/start-scenario",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { instance } = req.params;
      const { scenario_name } = req.body;

      if (!scenario_name) {
        res.status(400).json({ success: false, message: "scenario_name is required." });
        return;
      }

      const { success, message } = await rosInstances.launchScenario(instance, scenario_name);
      if (success) {
        let referencePosition: { latitude: number; longitude: number; altitude: number } | undefined;
        try {
          const fileName =
            scenario_name.endsWith(".yaml") || scenario_name.endsWith(".yml")
              ? scenario_name
              : `${scenario_name}.yaml`;
          const scenario = await Scenario.fromFile(path.join(scenariosPath, fileName));
          const rp = scenario.referencePosition;
          referencePosition = {
            latitude: rp.latitude,
            longitude: rp.longitude,
            altitude: rp.altitude,
          };
        } catch (err) {
          console.warn("Could not read scenario file for referencePosition:", err);
        }
        res.status(200).json({
          success: true,
          message,
          ...(referencePosition !== undefined && { referencePosition }),
        });
      } else {
        res.status(400).json({ success: false, message });
      }
    } catch (err) {
      console.error("POST /start-scenario:", err);
      res.status(500).json({ success: false, message: errorMessage(err) });
    }
  },
);

router.post(
  "/instance/:instance/stop-scenario",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { instance } = req.params;
      const ok = await rosInstances.stopScenario(instance);
      if (ok) {
        res.status(200).json({ success: true, message: "Scenario stop request accepted." });
      } else {
        res.status(400).json({ success: false, message: "Scenario stop request rejected." });
      }
    } catch (err) {
      console.error("POST /stop-scenario:", err);
      res.status(500).json({ success: false, message: errorMessage(err) });
    }
  },
);

router.get("/instance/:instance/running-scenario", (req: Request, res: Response): void => {
  const { instance } = req.params;

  const scenario = rosInstances.getRunningScenario(instance);

  if (scenario === undefined) {
    res.status(404).json({
      success: false,
      message: `Instance '${instance}' not found.`,
    });
    return;
  }

  res.status(200).json({
    success: true,
    running: scenario !== null,
    scenario_name: scenario,
  });
});

export default router;
