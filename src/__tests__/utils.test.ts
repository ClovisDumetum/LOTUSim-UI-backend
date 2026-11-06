import { bearingToEnuYawRad, errorMessage, quaternionToEulerZYX, quaternionToGpsHeading } from "../utils";

/** Quaternion for a pure rotation of `yawRad` around Z (ENU yaw) */
const yawQuaternion = (yawRad: number): [number, number, number, number] => [
  0,
  0,
  Math.sin(yawRad / 2),
  Math.cos(yawRad / 2),
];

/** Smallest angular difference in degrees, so 359.99 vs 0 counts as close. */
const angleDiffDeg = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe("errorMessage", () => {
  it("returns the message from an Error instance", () => {
    expect(errorMessage(new Error("something went wrong"))).toBe("something went wrong");
  });

  it("returns fallback for non-Error values", () => {
    expect(errorMessage("a string")).toBe("Internal server error");
    expect(errorMessage(42)).toBe("Internal server error");
    expect(errorMessage(null)).toBe("Internal server error");
    expect(errorMessage(undefined)).toBe("Internal server error");
    expect(errorMessage({ message: "looks like an error but isnt" })).toBe("Internal server error");
  });

  it("returns empty string for Error with empty message", () => {
    expect(errorMessage(new Error(""))).toBe("");
  });
});

describe("quaternionToEulerZYX", () => {
  const SIN45 = Math.sqrt(2) / 2;

  it("returns [0, 0, 0] for identity quaternion", () => {
    const [yaw, pitch, roll] = quaternionToEulerZYX({ x: 0, y: 0, z: 0, w: 1 });
    expect(yaw).toBeCloseTo(0);
    expect(pitch).toBeCloseTo(0);
    expect(roll).toBeCloseTo(0);
  });

  it("returns 90° yaw for 90° rotation around Z axis", () => {
    const [yaw, pitch, roll] = quaternionToEulerZYX({ x: 0, y: 0, z: SIN45, w: SIN45 });
    expect(yaw).toBeCloseTo(Math.PI / 2);
    expect(pitch).toBeCloseTo(0);
    expect(roll).toBeCloseTo(0);
  });

  it("returns 90° roll for 90° rotation around X axis", () => {
    const [yaw, pitch, roll] = quaternionToEulerZYX({ x: SIN45, y: 0, z: 0, w: SIN45 });
    expect(yaw).toBeCloseTo(0);
    expect(pitch).toBeCloseTo(0);
    expect(roll).toBeCloseTo(Math.PI / 2);
  });

  it("returns 45° pitch for 45° rotation around Y axis", () => {
    // Use 45° (not 90°) to avoid gimbal lock at ±90° pitch
    const sin225 = Math.sin(Math.PI / 8);
    const cos225 = Math.cos(Math.PI / 8);
    const [yaw, pitch, roll] = quaternionToEulerZYX({ x: 0, y: sin225, z: 0, w: cos225 });
    expect(yaw).toBeCloseTo(0);
    expect(pitch).toBeCloseTo(Math.PI / 4);
    expect(roll).toBeCloseTo(0);
  });
});

describe("quaternionToGpsHeading", () => {
  it("returns 90 for identity quaternion (facing east in ENU = 90° compass heading)", () => {
    expect(quaternionToGpsHeading(0, 0, 0, 1)).toBeCloseTo(90);
  });

  it("always returns a value in [0, 360)", () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 0, 1],
      [0, 0, Math.sqrt(2) / 2, Math.sqrt(2) / 2],
      [0, 0, 1, 0],
      [0, 0, -Math.sqrt(2) / 2, Math.sqrt(2) / 2],
    ];
    for (const [qx, qy, qz, qw] of cases) {
      const heading = quaternionToGpsHeading(qx, qy, qz, qw);
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(360);
    }
  });

  it("returns 0 for 90° CCW rotation around Z (facing north)", () => {
    // 90° CCW yaw in ENU = north heading in NED = 0°
    const SIN45 = Math.sqrt(2) / 2;
    expect(quaternionToGpsHeading(0, 0, SIN45, SIN45)).toBeCloseTo(0);
  });

  it("returns 180 for -90° rotation around Z (facing south)", () => {
    const SIN45 = Math.sqrt(2) / 2;
    expect(quaternionToGpsHeading(0, 0, -SIN45, SIN45)).toBeCloseTo(180);
  });

  it("returns 270 for 180° rotation around Z (facing west)", () => {
    expect(quaternionToGpsHeading(0, 0, 1, 0)).toBeCloseTo(270);
  });
});

describe("bearingToEnuYawRad", () => {
  it("maps compass North (0°) to +90° ENU yaw", () => {
    expect(bearingToEnuYawRad(0)).toBeCloseTo(Math.PI / 2);
  });

  it("maps compass East (90°) to 0 ENU yaw", () => {
    expect(bearingToEnuYawRad(90)).toBeCloseTo(0);
  });

  it("maps compass South (180°) to -90° ENU yaw", () => {
    expect(bearingToEnuYawRad(180)).toBeCloseTo(-Math.PI / 2);
  });

  it("maps compass West (270°) to -180° ENU yaw", () => {
    expect(bearingToEnuYawRad(270)).toBeCloseTo(-Math.PI);
  });
});

describe("bearingToEnuYawRad / quaternionToGpsHeading round trip", () => {
  it.each([0, 30, 45, 90, 135, 180, 225, 270, 315, 359])(
    "recovers a bearing of %d°",
    (bearing) => {
      const [qx, qy, qz, qw] = yawQuaternion(bearingToEnuYawRad(bearing));
      const heading = quaternionToGpsHeading(qx, qy, qz, qw);
      expect(angleDiffDeg(heading, bearing)).toBeLessThan(1e-6);
    },
  );

  it("stays in [0, 360) for bearings outside the range", () => {
    for (const bearing of [-90, 360, 450, 720]) {
      const [qx, qy, qz, qw] = yawQuaternion(bearingToEnuYawRad(bearing));
      const heading = quaternionToGpsHeading(qx, qy, qz, qw);
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(360);
      expect(angleDiffDeg(heading, ((bearing % 360) + 360) % 360)).toBeLessThan(1e-6);
    }
  });
});
