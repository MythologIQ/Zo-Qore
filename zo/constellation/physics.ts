/**
 * Momentum Physics Engine
 *
 * Lightweight physics for spatial navigation.
 *
 * @module zo/constellation/physics
 */

export interface PhysicsConfig {
  friction: number; // 0-1, velocity decay rate
  maxVelocity: number; // Maximum pixels per frame
  minVelocity: number; // Threshold to stop
}

const DEFAULT_CONFIG: PhysicsConfig = {
  friction: 0.92,
  maxVelocity: 50,
  minVelocity: 0.1,
};

/**
 * Apply friction to velocity.
 */
export function applyFriction(velocity: number, friction: number): number {
  const result = velocity * friction;
  return Math.abs(result) < DEFAULT_CONFIG.minVelocity ? 0 : result;
}

/**
 * Clamp velocity to maximum.
 */
export function clampVelocity(velocity: number, max: number): number {
  return Math.max(-max, Math.min(max, velocity));
}

/**
 * Update viewport position with momentum.
 */
export function updateViewport(
  viewport: { x: number; y: number; velocityX: number; velocityY: number },
  config: PhysicsConfig = DEFAULT_CONFIG
): { x: number; y: number; velocityX: number; velocityY: number } {
  const vx = applyFriction(viewport.velocityX, config.friction);
  const vy = applyFriction(viewport.velocityY, config.friction);

  return {
    x: viewport.x + vx,
    y: viewport.y + vy,
    velocityX: clampVelocity(vx, config.maxVelocity),
    velocityY: clampVelocity(vy, config.maxVelocity),
  };
}

/**
 * Apply impulse (keyboard or gesture input).
 */
export function applyImpulse(
  viewport: { velocityX: number; velocityY: number },
  impulseX: number,
  impulseY: number,
  config: PhysicsConfig = DEFAULT_CONFIG
): { velocityX: number; velocityY: number } {
  return {
    velocityX: clampVelocity(viewport.velocityX + impulseX, config.maxVelocity),
    velocityY: clampVelocity(viewport.velocityY + impulseY, config.maxVelocity),
  };
}
