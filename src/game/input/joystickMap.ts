export interface DriveActions {
  accelerate: boolean
  brake: boolean
  steerLeft: boolean
  steerRight: boolean
}

/**
 * Map a joystick vector to the boolean drive actions the sim consumes.
 * y is negative-up (matching the gamepad axis). Thresholds mirror the gamepad
 * handling already in InputManager, so touch, pad, and keyboard feel identical.
 */
export function joystickToActions(x: number, y: number, deadzone = 0.2): DriveActions {
  const inDeadzone = Math.hypot(x, y) < deadzone
  if (inDeadzone) return { accelerate: false, brake: false, steerLeft: false, steerRight: false }
  return {
    accelerate: y < -0.35,
    brake: y > 0.35,
    steerLeft: x < -0.3,
    steerRight: x > 0.3,
  }
}
