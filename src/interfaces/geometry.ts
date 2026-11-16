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
 * ***************************   GEOMETRY UTILITY MODULE   ****************************
 * ************************************************************************************
 *
 * Provides types, classes, and utility functions for handling geometry and spatial data.
 *
 * Includes:
 * - GeoPoint: a WGS84 position (latitude, longitude, altitude)
 * - VesselPosition: a vessel's geographic position and heading (degrees from true North, clockwise)
 * - Vector3, Quaternion and Pose: body-frame geometry for model and sensor definitions
 *   (xdyn propellers and control surfaces, sensor noise). NOT used for vessel positions.
 *
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Pose {
  position: Vector3;
  orientation: Quaternion;
}

export interface VesselPosition {
  vesselName: string;
  geoPoint?: GeoPoint;
  /** Where the bow points, degrees from true North, clockwise. */
  heading?: number;
}

export class GeoPoint {
  #latitude: number;
  #longitude: number;
  #altitude: number;
  /**
   * A WGS84 position.
   * @param latitude - degrees, North positive
   * @param longitude - degrees, East positive
   * @param altitude - metres from sea level, negative when submerged
   */
  constructor(latitude: number, longitude: number, altitude: number) {
    this.#latitude = latitude;
    this.#longitude = longitude;
    this.#altitude = altitude;
  }

  public get latitude(): number {
    return this.#latitude;
  }

  public set latitude(value: number) {
    this.#latitude = value;
  }

  public get longitude(): number {
    return this.#longitude;
  }

  public set longitude(value: number) {
    this.#longitude = value;
  }

  public get altitude(): number {
    return this.#altitude;
  }

  public set altitude(value: number) {
    this.#altitude = value;
  }
}
