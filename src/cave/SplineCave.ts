import Phaser from 'phaser';

const SPLINE_SAMPLES = 600;
const CLOSEST_REFINE_STEPS = 12;

export type SplineCaveConfig = {
  halfWidth: number;
  screenWidth: number;
  screenHeight: number;
};

type ClosestResult = {
  t: number;
  point: Phaser.Math.Vector2;
  tangent: Phaser.Math.Vector2;
  distance: number;
};

export class SplineCave {
  private path: Phaser.Curves.Path;
  private halfWidth: number;
  private cachedPoints: Phaser.Math.Vector2[] = [];
  private totalLength = 0;

  constructor(config: SplineCaveConfig) {
    this.halfWidth = config.halfWidth;
    this.path = this.buildPath(config.screenWidth, config.screenHeight, config.halfWidth);
    this.totalLength = this.path.getLength();
    this.cachedPoints = this.path.getSpacedPoints(SPLINE_SAMPLES);
    // #region agent log
    const curves = (this.path as any).curves?.length ?? 0;
    const p0 = this.cachedPoints[0];
    const pN = this.cachedPoints[this.cachedPoints.length - 1];
    const payload = { curves, totalLength: this.totalLength, cachedLen: this.cachedPoints.length, halfWidth: this.halfWidth, p0x: p0?.x, p0y: p0?.y, pNx: pN?.x, pNy: pN?.y };
    console.warn('[Cave H1] Path init', payload);
    fetch('http://127.0.0.1:7438/ingest/fbc2db40-b056-4b77-90e1-9ded15eb52a0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'483a1c'},body:JSON.stringify({sessionId:'483a1c',location:'SplineCave.ts:ctor',message:'Path init',data:payload,timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
  }

  /**
   * Build path: horizontal runs as straight segments, switchbacks as smooth cubic curves.
   * Avoids spline overshoot so the corridor looks clean (straight walls, smooth turns).
   */
  private buildPath(screenWidth: number, screenHeight: number, halfWidth: number): Phaser.Curves.Path {
    const w = screenWidth;
    const h = screenHeight;
    const startY = h - 140;
    const xMin = halfWidth;
    const xMax = w - halfWidth;
    const laneHeight = 320;
    const numLanes = 10;
    const width = xMax - xMin;

    let y = startY;
    let xFrom = xMin;
    let xTo = xMax;

    const path = new Phaser.Curves.Path(xFrom, y);

    for (let lane = 0; lane < numLanes; lane++) {
      // Horizontal run: straight line segments (no spline bulge)
      const numHorizontal = 5;
      for (let j = 1; j <= numHorizontal; j++) {
        const t = j / numHorizontal;
        const x = xFrom + (xTo - xFrom) * t;
        path.lineTo(x, y);
      }

      if (lane < numLanes - 1) {
        // Switchback: one smooth cubic (starts at path end (xTo, y), ends at next lane start)
        const start = new Phaser.Math.Vector2(xTo, y);
        const c1 = new Phaser.Math.Vector2(xTo - width * 0.35, y - laneHeight * 0.4);
        const c2 = new Phaser.Math.Vector2(xFrom + width * 0.35, y - laneHeight * 0.6);
        const end = new Phaser.Math.Vector2(xFrom, y - laneHeight);
        path.add(new Phaser.Curves.CubicBezier(start, c1, c2, end));
        y = end.y;
        const swap = xFrom;
        xFrom = xTo;
        xTo = swap;
      }
    }

    return path;
  }

  getClosest(x: number, y: number): ClosestResult {
    const out = new Phaser.Math.Vector2();
    const tangentOut = new Phaser.Math.Vector2();
    let bestT = 0;
    let bestDistSq = Infinity;
    const n = this.cachedPoints.length;

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.path.getPoint(t, out);
      const dx = x - out.x;
      const dy = y - out.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestT = t;
      }
    }

    for (let step = 0; step < CLOSEST_REFINE_STEPS; step++) {
      const stepSize = 1 / (n - 1);
      const t0 = Math.max(0, bestT - stepSize);
      const t1 = Math.min(1, bestT + stepSize);
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const t = t0 + (t1 - t0) * (k / steps);
        this.path.getPoint(t, out);
        const dx = x - out.x;
        const dy = y - out.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestT = t;
        }
      }
    }

    this.path.getPoint(bestT, out);
    this.path.getTangent(bestT, tangentOut);
    const dx = x - out.x;
    const dy = y - out.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return { t: bestT, point: out.clone(), tangent: tangentOut.clone(), distance: dist };
  }

  isInPath(x: number, y: number, margin: number): boolean {
    const { distance } = this.getClosest(x, y);
    return distance <= this.halfWidth - margin;
  }

  findWallAnchor(origin: Phaser.Math.Vector2, dir: Phaser.Math.Vector2, maxRange: number): Phaser.Math.Vector2 | null {
    const unit = dir.clone().normalize();
    const step = 8;
    const steps = Math.floor(maxRange / step);
    const probe = origin.clone();

    for (let i = 1; i <= steps; i++) {
      probe.set(origin.x + unit.x * step * i, origin.y + unit.y * step * i);
      if (!this.isInPath(probe.x, probe.y, 0)) {
        return probe.clone();
      }
    }
    return null;
  }

  getStartPosition(): { x: number; y: number; heading: number } {
    const out = new Phaser.Math.Vector2();
    const tangent = new Phaser.Math.Vector2();
    this.path.getPoint(0, out);
    this.path.getTangent(0, tangent);
    const heading = Math.atan2(tangent.y, tangent.x);
    return { x: out.x, y: out.y, heading };
  }

  /** Find t in [0,1] where path.getPoint(t).y ≈ targetY. Path goes high y (t=0) to low y (t=1). */
  private getTAtY(targetY: number): number | null {
    const point = new Phaser.Math.Vector2();
    this.path.getPoint(0, point);
    if (point.y <= targetY) return 0;
    this.path.getPoint(1, point);
    if (point.y >= targetY) return 1;
    let lo = 0;
    let hi = 1;
    for (let step = 0; step < 24; step++) {
      const t = (lo + hi) / 2;
      this.path.getPoint(t, point);
      if (Math.abs(point.y - targetY) < 1) return t;
      if (point.y > targetY) lo = t;
      else hi = t;
    }
    return (lo + hi) / 2;
  }

  getPathBoundsForRendering(visibleY0: number, visibleY1: number): {
    left: Phaser.Math.Vector2[];
    right: Phaser.Math.Vector2[];
  } {
    const left: Phaser.Math.Vector2[] = [];
    const right: Phaser.Math.Vector2[] = [];
    const point = new Phaser.Math.Vector2();
    const tangent = new Phaser.Math.Vector2();

    let skipped = 0;
    for (let i = 0; i < this.cachedPoints.length; i++) {
      const t = i / (this.cachedPoints.length - 1);
      this.path.getPoint(t, point);
      if (point.y < visibleY0 - 100 || point.y > visibleY1 + 100) { skipped++; continue; }
      this.path.getTangent(t, tangent);
      tangent.normalize();
      const nx = -tangent.y;
      const ny = tangent.x;
      left.push(new Phaser.Math.Vector2(point.x + nx * this.halfWidth, point.y + ny * this.halfWidth));
      right.push(new Phaser.Math.Vector2(point.x - nx * this.halfWidth, point.y - ny * this.halfWidth));
    }
    // Extend to view bounds so the corridor fills top/bottom (no wall bands). Path order: first = high y (bottom), last = low y (top).
    const pointOut = new Phaser.Math.Vector2();
    const tangentOut = new Phaser.Math.Vector2();
    if (left.length > 0) {
      const firstCenterY = (left[0].y + right[0].y) / 2;
      const lastCenterY = (left[left.length - 1].y + right[right.length - 1].y) / 2;
      const tTop = this.getTAtY(visibleY0);
      const tBottom = this.getTAtY(visibleY1);
      if (tTop != null && lastCenterY > visibleY0) {
        this.path.getPoint(tTop, pointOut);
        this.path.getTangent(tTop, tangentOut);
        tangentOut.normalize();
        const nx = -tangentOut.y;
        const ny = tangentOut.x;
        left.push(new Phaser.Math.Vector2(pointOut.x + nx * this.halfWidth, pointOut.y + ny * this.halfWidth));
        right.push(new Phaser.Math.Vector2(pointOut.x - nx * this.halfWidth, pointOut.y - ny * this.halfWidth));
      }
      if (tBottom != null && firstCenterY < visibleY1) {
        this.path.getPoint(tBottom, pointOut);
        this.path.getTangent(tBottom, tangentOut);
        tangentOut.normalize();
        const nx = -tangentOut.y;
        const ny = tangentOut.x;
        left.unshift(new Phaser.Math.Vector2(pointOut.x + nx * this.halfWidth, pointOut.y + ny * this.halfWidth));
        right.unshift(new Phaser.Math.Vector2(pointOut.x - nx * this.halfWidth, pointOut.y - ny * this.halfWidth));
      }
    }
    // #region agent log
    const _boundsLogCount = (SplineCave as any)._boundsLogCount = ((SplineCave as any)._boundsLogCount ?? 0) + 1;
    if (left.length > 0 && _boundsLogCount % 60 === 1) {
      this.path.getPoint(0, point);
      this.path.getTangent(0, tangent);
      tangent.normalize();
      const data = { leftLen: left.length, visibleY0, visibleY1, skipped, firstLx: left[0].x, firstLy: left[0].y, lastLy: left[left.length - 1].y, tangentX: tangent.x, tangentY: tangent.y };
      console.warn('[Cave H2] Bounds', data);
      fetch('http://127.0.0.1:7438/ingest/fbc2db40-b056-4b77-90e1-9ded15eb52a0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'483a1c'},body:JSON.stringify({sessionId:'483a1c',location:'SplineCave.ts:getPathBounds',message:'Bounds',data,timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    }
    // #endregion
    return { left, right };
  }

  getRandomPointAhead(nearY: number, spread: number): { x: number; y: number } | null {
    const yMin = nearY - spread;
    const yMax = nearY;
    const candidates: number[] = [];
    const out = new Phaser.Math.Vector2();
    for (let i = 0; i < this.cachedPoints.length; i++) {
      const t = i / (this.cachedPoints.length - 1);
      this.path.getPoint(t, out);
      if (out.y >= yMin && out.y <= yMax) candidates.push(t);
    }
    if (candidates.length === 0) return null;
    const bestT = candidates[Math.floor(Math.random() * candidates.length)];
    this.path.getPoint(bestT, out);
    const tangent = new Phaser.Math.Vector2();
    this.path.getTangent(bestT, tangent);
    tangent.normalize();
    const nx = -tangent.y;
    const ny = tangent.x;
    const offset = (Math.random() * 2 - 1) * (this.halfWidth - 25);
    return {
      x: out.x + nx * offset,
      y: out.y + ny * offset,
    };
  }

  getPathLength(): number {
    return this.totalLength;
  }
}
