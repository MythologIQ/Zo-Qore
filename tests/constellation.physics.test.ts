/**
 * Constellation Physics Tests
 *
 * Momentum physics calculation tests.
 */

import { describe, it, expect } from "vitest";
import {
  applyFriction,
  clampVelocity,
  updateViewport,
  applyImpulse,
} from "../zo/constellation/physics.js";

describe("constellation.physics", () => {
  describe("applyFriction", () => {
    it("reduces velocity by friction factor", () => {
      const result = applyFriction(10, 0.9);
      expect(result).toBe(9);
    });

    it("stops velocity at minimum threshold", () => {
      const result = applyFriction(0.05, 0.9);
      expect(result).toBe(0);
    });

    it("handles negative velocity", () => {
      const result = applyFriction(-10, 0.9);
      expect(result).toBe(-9);
    });

    it("stops negative velocity at minimum threshold", () => {
      const result = applyFriction(-0.05, 0.9);
      expect(result).toBe(0);
    });
  });

  describe("clampVelocity", () => {
    it("clamps positive velocity to max", () => {
      const result = clampVelocity(100, 50);
      expect(result).toBe(50);
    });

    it("clamps negative velocity to -max", () => {
      const result = clampVelocity(-100, 50);
      expect(result).toBe(-50);
    });

    it("does not modify velocity within bounds", () => {
      const result = clampVelocity(25, 50);
      expect(result).toBe(25);
    });

    it("allows zero velocity", () => {
      const result = clampVelocity(0, 50);
      expect(result).toBe(0);
    });
  });

  describe("updateViewport", () => {
    it("updates position based on velocity", () => {
      const viewport = { x: 100, y: 200, velocityX: 10, velocityY: -5 };
      const result = updateViewport(viewport);
      expect(result.x).toBeGreaterThan(100);
      expect(result.y).toBeLessThan(200);
    });

    it("applies friction to velocity", () => {
      const viewport = { x: 0, y: 0, velocityX: 10, velocityY: 10 };
      const result = updateViewport(viewport);
      expect(Math.abs(result.velocityX)).toBeLessThan(10);
      expect(Math.abs(result.velocityY)).toBeLessThan(10);
    });

    it("stops when velocity is very small", () => {
      const viewport = { x: 100, y: 100, velocityX: 0.05, velocityY: 0.05 };
      const result = updateViewport(viewport);
      expect(result.velocityX).toBe(0);
      expect(result.velocityY).toBe(0);
    });

    it("uses custom physics config", () => {
      const viewport = { x: 0, y: 0, velocityX: 100, velocityY: 100 };
      const config = { friction: 0.5, maxVelocity: 20, minVelocity: 0.1 };
      const result = updateViewport(viewport, config);
      expect(result.velocityX).toBeLessThanOrEqual(20);
      expect(result.velocityY).toBeLessThanOrEqual(20);
    });
  });

  describe("applyImpulse", () => {
    it("adds impulse to velocity", () => {
      const viewport = { velocityX: 0, velocityY: 0 };
      const result = applyImpulse(viewport, 10, -5);
      expect(result.velocityX).toBe(10);
      expect(result.velocityY).toBe(-5);
    });

    it("accumulates impulses", () => {
      const viewport = { velocityX: 5, velocityY: 5 };
      const result = applyImpulse(viewport, 10, 10);
      expect(result.velocityX).toBe(15);
      expect(result.velocityY).toBe(15);
    });

    it("clamps to max velocity", () => {
      const viewport = { velocityX: 40, velocityY: 40 };
      const result = applyImpulse(viewport, 20, 20);
      expect(result.velocityX).toBe(50);
      expect(result.velocityY).toBe(50);
    });

    it("handles negative impulses", () => {
      const viewport = { velocityX: 10, velocityY: 10 };
      const result = applyImpulse(viewport, -20, -20);
      expect(result.velocityX).toBe(-10);
      expect(result.velocityY).toBe(-10);
    });
  });
});
