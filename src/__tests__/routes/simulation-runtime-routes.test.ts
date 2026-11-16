import request from "supertest";
import express from "express";

const mockGetInstancevesselPositionMap = jest.fn();
const mockGetVesselPosition = jest.fn();
const mockSendMASCmd = jest.fn();
const mockSendMASCmdArray = jest.fn();
const mockClearVessels = jest.fn();
const mockLaunchScenario = jest.fn();
const mockStopScenario = jest.fn();

jest.mock("../../interfaces/ros", () => ({
  rosInstances: {
    getInstancevesselPositionMap: mockGetInstancevesselPositionMap,
    getVesselPosition: mockGetVesselPosition,
    sendMASCmd: mockSendMASCmd,
    sendMASCmdArray: mockSendMASCmdArray,
    clearVessels: mockClearVessels,
    launchScenario: mockLaunchScenario,
    stopScenario: mockStopScenario,
  },
}));

jest.mock("../../utils", () => ({
  ...jest.requireActual("../../utils"),
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : "Internal server error"),
}));

import simulationRouter from "../../routes/simulation-runtime-routes";

const app = express();
app.use(express.json());
app.use("/", simulationRouter);

const mockVessel = { name: "vessel1", position: { latitude: 10, longitude: 20, altitude: 0 } };

// ─── GET /instance/:instance/vessels ─────────────────────────

describe("GET /instance/:instance/vessels", () => {
  it("returns 404 when instance does not exist", async () => {
    mockGetInstancevesselPositionMap.mockReturnValue(null);
    const res = await request(app).get("/instance/ghost/vessels");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("ghost");
  });

  it("returns vessel list for a known instance", async () => {
    mockGetInstancevesselPositionMap.mockReturnValue(new Map([["vessel1", mockVessel]]));
    const res = await request(app).get("/instance/sim1/vessels");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.vessels).toHaveLength(1);
  });
});

// ─── GET /instance/:instance/vessel?name= ────────────────────

describe("GET /instance/:instance/vessel", () => {
  it("returns 400 when name query param is missing", async () => {
    const res = await request(app).get("/instance/sim1/vessel");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 404 when vessel is not found", async () => {
    mockGetVesselPosition.mockReturnValue(null);
    const res = await request(app).get("/instance/sim1/vessel?name=ghost");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("ghost");
  });

  it("returns vessel info when found", async () => {
    mockGetVesselPosition.mockReturnValue(mockVessel);
    const res = await request(app).get("/instance/sim1/vessel?name=vessel1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.vessel).toEqual(mockVessel);
  });
});

const validCreate = {
  cmdType: 0,
  vesselName: "v1",
  modelName: "lrauv",
  geoPoint: { latitude: 1.26, longitude: 103.75, altitude: -30 },
  heading: 90,
};

// ─── POST /instance/:instance/vessel ─────────────────────────

describe("POST /instance/:instance/vessel", () => {
  beforeEach(() => mockSendMASCmd.mockReset());

  it("returns 200 when command is accepted", async () => {
    mockSendMASCmd.mockResolvedValue(true);
    const res = await request(app).post("/instance/sim1/vessel").send(validCreate);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 when command is rejected", async () => {
    mockSendMASCmd.mockResolvedValue(false);
    const res = await request(app).post("/instance/sim1/vessel").send(validCreate);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("accepts a MOVE at latitude 0 and heading 0", async () => {
    mockSendMASCmd.mockResolvedValue(true);
    const res = await request(app)
      .post("/instance/sim1/vessel")
      .send({
        cmdType: 2,
        vesselName: "v1",
        geoPoint: { latitude: 0, longitude: 0, altitude: 0 },
        heading: 0,
      });
    expect(res.status).toBe(200);
    expect(mockSendMASCmd).toHaveBeenCalled();
  });

  it("accepts a DELETE without position or heading", async () => {
    mockSendMASCmd.mockResolvedValue(true);
    const res = await request(app).post("/instance/sim1/vessel").send({ cmdType: 1, vesselName: "v1" });
    expect(res.status).toBe(200);
  });

  it.each([
    ["missing heading", { ...validCreate, heading: undefined }],
    ["missing geoPoint", { ...validCreate, geoPoint: undefined }],
    ["heading-only MOVE", { cmdType: 2, vesselName: "v1", heading: 45 }],
    ["position-only MOVE", { cmdType: 2, vesselName: "v1", geoPoint: validCreate.geoPoint }],
    ["latitude 91", { ...validCreate, geoPoint: { ...validCreate.geoPoint, latitude: 91 } }],
    ["longitude 181", { ...validCreate, geoPoint: { ...validCreate.geoPoint, longitude: 181 } }],
    ["heading 360", { ...validCreate, heading: 360 }],
    ["heading -1", { ...validCreate, heading: -1 }],
    ["string heading", { ...validCreate, heading: "90" }],
  ])("returns 400 and does not call ROS for %s", async (_name, body) => {
    const res = await request(app).post("/instance/sim1/vessel").send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockSendMASCmd).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected error", async () => {
    mockSendMASCmd.mockRejectedValue(new Error("ROS failure"));
    const res = await request(app).post("/instance/sim1/vessel").send(validCreate);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe("ROS failure");
  });
});

// ─── POST /instance/:instance/vessels ────────────────────────

describe("POST /instance/:instance/vessels", () => {
  beforeEach(() => mockSendMASCmdArray.mockReset());

  it("returns 200 when command array is accepted", async () => {
    mockSendMASCmdArray.mockResolvedValue(true);
    const res = await request(app).post("/instance/sim1/vessels").send({ cmd: [validCreate] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 200 for an empty array", async () => {
    mockSendMASCmdArray.mockResolvedValue(true);
    const res = await request(app).post("/instance/sim1/vessels").send({ cmd: [] });
    expect(res.status).toBe(200);
  });

  it("returns 400 when command array is rejected by the core", async () => {
    mockSendMASCmdArray.mockResolvedValue(false);
    const res = await request(app).post("/instance/sim1/vessels").send({ cmd: [validCreate] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("names the invalid command and does not call ROS", async () => {
    const res = await request(app)
      .post("/instance/sim1/vessels")
      .send({ cmd: [validCreate, { ...validCreate, heading: undefined }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("cmd[1]");
    expect(mockSendMASCmdArray).not.toHaveBeenCalled();
  });

  it("returns 400 when cmd is not an array", async () => {
    const res = await request(app).post("/instance/sim1/vessels").send({});
    expect(res.status).toBe(400);
    expect(mockSendMASCmdArray).not.toHaveBeenCalled();
  });

});

// ─── DELETE /instance/:instance/vessels ──────────────────────

describe("DELETE /instance/:instance/vessels", () => {
  it("clears vessels and returns 200", async () => {
    const res = await request(app).delete("/instance/sim1/vessels");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockClearVessels).toHaveBeenCalledWith("sim1");
  });
});

// ─── POST /instance/:instance/start-scenario ─────────────────

describe("POST /instance/:instance/start-scenario", () => {
  it("returns 400 when scenario_name is missing", async () => {
    const res = await request(app).post("/instance/sim1/start-scenario").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 200 when launch is accepted", async () => {
    mockLaunchScenario.mockResolvedValue({ success: true, message: "Scenario launched." });
    const res = await request(app)
      .post("/instance/sim1/start-scenario")
      .send({ scenario_name: "test.yaml" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 when launch is rejected", async () => {
    mockLaunchScenario.mockResolvedValue({ success: false, message: "Launch failed." });
    const res = await request(app)
      .post("/instance/sim1/start-scenario")
      .send({ scenario_name: "test.yaml" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── POST /instance/:instance/stop-scenario ──────────────────

describe("POST /instance/:instance/stop-scenario", () => {
  it("returns 200 when stop is accepted", async () => {
    mockStopScenario.mockResolvedValue(true);
    const res = await request(app).post("/instance/sim1/stop-scenario").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 400 when stop is rejected", async () => {
    mockStopScenario.mockResolvedValue(false);
    const res = await request(app).post("/instance/sim1/stop-scenario").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
