/**
 * Vector Operations - Generative Utils Demo
 * Demonstrates the comprehensive vec2 (2D vector) utilities:
 *
 * Creation & Basic Math:
 * - vec2.create: Create a new vector
 * - vec2.add, subtract, multiply, divide: Vector arithmetic
 *
 * Magnitude & Distance:
 * - vec2.magnitude, magnitudeSquared: Vector length
 * - vec2.distance, distanceSquared: Distance between points
 * - vec2.normalize: Unit vector
 * - vec2.limit, setMagnitude: Constrain/set length
 *
 * Angles & Rotation:
 * - vec2.angle: Get vector angle
 * - vec2.angleBetween: Angle between two vectors
 * - vec2.fromAngle: Create vector from angle
 * - vec2.rotate, rotateAround: Rotate vectors
 *
 * Products & Projections:
 * - vec2.dot, cross: Vector products
 * - vec2.perpendicular: 90° rotated vector
 * - vec2.reflect: Reflection off surface
 *
 * Interpolation:
 * - vec2.lerp (vecLerp): Interpolate between vectors
 *
 * The artwork shows particle traces demonstrating vector physics.
 */

import type { ControlSchema, InferValues, CanvasConfig } from '../src/controls/schema';
import { canvasToPixels } from '../src/controls/schema';
import { createCanvas } from '../src/svg-utils';
import {
  seedPRNG,
  random,
  vec2,
} from '@johnfmorton/generative-utils';

export const meta = {
  title: 'Vector Operations',
  description: 'Demonstrates 2D vector math with particle physics visualization',
};

export const canvas: CanvasConfig = {
  width: 11,
  height: 8.5,
  unit: 'in',
};

export const controls = [
  {
    type: 'slider',
    id: 'particles',
    label: 'Particle Traces',
    min: 3,
    max: 20,
    step: 1,
    default: 8,
  },
  {
    type: 'slider',
    id: 'steps',
    label: 'Steps per Trace',
    min: 20,
    max: 150,
    step: 10,
    default: 80,
  },
  {
    type: 'slider',
    id: 'speed',
    label: 'Initial Speed',
    min: 5,
    max: 30,
    step: 1,
    default: 15,
  },
  {
    type: 'slider',
    id: 'maxSpeed',
    label: 'Max Speed',
    min: 10,
    max: 50,
    step: 5,
    default: 25,
  },
  {
    type: 'toggle',
    id: 'showPerpendicular',
    label: 'Show Perpendiculars',
    default: true,
  },
  {
    type: 'toggle',
    id: 'showReflections',
    label: 'Show Reflection Normals',
    default: false,
  },
  {
    type: 'toggle',
    id: 'showVelocity',
    label: 'Show Velocity Arrows',
    default: true,
  },
  {
    type: 'slider',
    id: 'gravity',
    label: 'Gravity',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.2,
  },
  {
    type: 'slider',
    id: 'lineWidth',
    label: 'Line Width',
    min: 0.3,
    max: 2,
    step: 0.1,
    default: 0.6,
  },
  {
    type: 'seed',
    id: 'seed',
    label: 'Seed',
    default: 42,
  },
] as const satisfies ControlSchema;

export type Values = InferValues<typeof controls>;

type Vec2 = { x: number; y: number };

export function draw(values: Values, canvasConfig: CanvasConfig): SVGElement {
  const {
    particles,
    steps,
    speed,
    maxSpeed,
    showPerpendicular,
    showReflections,
    showVelocity,
    gravity,
    lineWidth,
    seed,
  } = values;

  seedPRNG(seed.toString());

  const { width, height } = canvasToPixels(canvasConfig);
  const { svg, draw: svgDraw } = createCanvas(canvasConfig);

  // Groups for different elements
  const traceGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth, linecap: 'round' })
    .fill('none');

  const decorGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth * 0.5 })
    .fill('none');

  const arrowGroup = svgDraw.group()
    .stroke({ color: 'black', width: lineWidth * 0.4 })
    .fill('none');

  const margin = 50;
  const bounds = {
    left: margin,
    right: width - margin,
    top: margin,
    bottom: height - margin,
  };

  // Gravity vector (demonstrates vec2.create and vec2.multiply)
  const gravityVec = vec2.multiply(vec2.create(0, 1), gravity);

  // Simulate multiple particles
  for (let p = 0; p < particles; p++) {
    // Initial position using vec2.create
    let pos = vec2.create(
      random(bounds.left + 50, bounds.right - 50),
      random(bounds.top + 50, bounds.top + 150)
    );

    // Initial velocity using vec2.fromAngle
    const initialAngle = random(-Math.PI * 0.8, -Math.PI * 0.2);
    let vel = vec2.fromAngle(initialAngle, speed);

    // Store path points
    const pathPoints: Vec2[] = [{ ...pos }];
    const reflectionPoints: { pos: Vec2; normal: Vec2 }[] = [];

    // Simulate particle motion
    for (let s = 0; s < steps; s++) {
      // Apply gravity using vec2.add
      vel = vec2.add(vel, gravityVec);

      // Limit velocity using vec2.limit
      vel = vec2.limit(vel, maxSpeed);

      // Update position using vec2.add
      pos = vec2.add(pos, vel);

      // Check for boundary collisions and reflect
      let reflected = false;
      let normal: Vec2 | null = null;

      if (pos.x <= bounds.left) {
        pos.x = bounds.left;
        normal = vec2.create(1, 0); // Right-facing normal
        vel = vec2.reflect(vel, normal);
        reflected = true;
      } else if (pos.x >= bounds.right) {
        pos.x = bounds.right;
        normal = vec2.create(-1, 0); // Left-facing normal
        vel = vec2.reflect(vel, normal);
        reflected = true;
      }

      if (pos.y <= bounds.top) {
        pos.y = bounds.top;
        normal = vec2.create(0, 1); // Down-facing normal
        vel = vec2.reflect(vel, normal);
        reflected = true;
      } else if (pos.y >= bounds.bottom) {
        pos.y = bounds.bottom;
        normal = vec2.create(0, -1); // Up-facing normal
        vel = vec2.reflect(vel, normal);
        reflected = true;
      }

      // Store reflection points for visualization
      if (reflected && normal && showReflections) {
        reflectionPoints.push({ pos: { ...pos }, normal });
      }

      // Add slight friction using vec2.multiply
      vel = vec2.multiply(vel, 0.995);

      pathPoints.push({ ...pos });

      // Draw perpendicular indicators at intervals
      if (showPerpendicular && s % 15 === 0 && s > 0) {
        // vec2.perpendicular returns 90° rotated vector
        const perp = vec2.perpendicular(vel);
        // vec2.normalize and setMagnitude control length
        const perpNorm = vec2.setMagnitude(perp, 8);

        const perpStart = vec2.subtract(pos, perpNorm);
        const perpEnd = vec2.add(pos, perpNorm);
        decorGroup.line(perpStart.x, perpStart.y, perpEnd.x, perpEnd.y);
      }

      // Draw velocity arrows at intervals
      if (showVelocity && s % 25 === 0) {
        // vec2.normalize gets direction, then scale for display
        const velDir = vec2.normalize(vel);
        const arrowEnd = vec2.add(pos, vec2.multiply(velDir, 15));

        // Draw arrow line
        arrowGroup.line(pos.x, pos.y, arrowEnd.x, arrowEnd.y);

        // Draw arrowhead using vec2.rotate
        const headSize = 4;
        const head1 = vec2.add(
          arrowEnd,
          vec2.rotate(vec2.multiply(velDir, -headSize), Math.PI / 6)
        );
        const head2 = vec2.add(
          arrowEnd,
          vec2.rotate(vec2.multiply(velDir, -headSize), -Math.PI / 6)
        );
        arrowGroup.line(arrowEnd.x, arrowEnd.y, head1.x, head1.y);
        arrowGroup.line(arrowEnd.x, arrowEnd.y, head2.x, head2.y);
      }
    }

    // Draw the particle trace path
    if (pathPoints.length > 1) {
      const pathData = pathPoints
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
        .join(' ');
      traceGroup.path(pathData);
    }

    // Draw reflection normals
    for (const ref of reflectionPoints) {
      const normalEnd = vec2.add(ref.pos, vec2.multiply(ref.normal, 20));
      decorGroup.line(ref.pos.x, ref.pos.y, normalEnd.x, normalEnd.y)
        .stroke({ dasharray: '3,3' });

      // Small circle at reflection point
      decorGroup.circle(4).cx(ref.pos.x).cy(ref.pos.y);
    }

    // Mark start position
    decorGroup.circle(8).cx(pathPoints[0].x).cy(pathPoints[0].y);
  }

  // Draw boundary frame
  traceGroup.rect(bounds.right - bounds.left, bounds.bottom - bounds.top)
    .move(bounds.left, bounds.top);

  // Demonstration area: vec2.lerp interpolation
  const demoY = height - 30;
  const startVec = vec2.create(margin + 50, demoY);
  const endVec = vec2.create(width - margin - 50, demoY);

  // Draw lerp demonstration
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    // vec2.lerp interpolates between two vectors
    const interpVec = vec2.lerp(startVec, endVec, t);
    decorGroup.circle(6).cx(interpVec.x).cy(interpVec.y);
  }

  svgDraw.text('vec2.lerp(a, b, t)')
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(margin + 50, demoY - 15);

  // Demonstration: vec2.rotateAround
  const rotCenter = vec2.create(width - 120, margin + 60);
  const rotPoint = vec2.create(rotCenter.x + 40, rotCenter.y);

  decorGroup.circle(4).cx(rotCenter.x).cy(rotCenter.y);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    // vec2.rotateAround rotates a point around a pivot
    const rotated = vec2.rotateAround(rotPoint, rotCenter, angle);
    decorGroup.circle(6).cx(rotated.x).cy(rotated.y);

    // Connect to center with dashed line
    if (i % 2 === 0) {
      decorGroup.line(rotCenter.x, rotCenter.y, rotated.x, rotated.y)
        .stroke({ dasharray: '2,2' });
    }
  }

  svgDraw.text('rotateAround()')
    .font({ size: 9, family: 'sans-serif' })
    .fill('black')
    .move(width - 150, margin + 100);

  // Labels
  svgDraw.text('vec2 operations: add, subtract, multiply, normalize, limit, reflect, perpendicular, lerp, rotate')
    .font({ size: 10, family: 'sans-serif' })
    .fill('black')
    .move(margin, 25);

  return svg;
}
