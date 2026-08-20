// 고정 타임스텝 게임 루프 (PLAN §3.4) — Gaffer on Games "Fix Your Timestep"
const FIXED_DT = 1 / 60
const MAX_DELTA = 0.25 // 탭 복귀·GC 스파이크 방어 클램프

interface System {
  /** 물리·이동·판정 — 고정 스텝 */
  fixedUpdate?(dt: number): void
  /** 카메라·애니메이션 — 가변 스텝 */
  update?(delta: number, alpha: number): void
}

class GameLoop {
  private accumulator = 0
  private systems: System[] = []
  paused = false
  /** 마지막 tick의 렌더 보간 계수 (0~1) */
  alpha = 0

  // 계측
  readonly stats = { fps: 0, frameMs: 0 }
  private frames = 0
  private statWindow = 0

  register(system: System) {
    this.systems.push(system)
  }

  tick(delta: number) {
    if (this.paused) return
    const d = Math.min(delta, MAX_DELTA)
    const t0 = performance.now()

    this.accumulator += d
    while (this.accumulator >= FIXED_DT) {
      for (const s of this.systems) s.fixedUpdate?.(FIXED_DT)
      this.accumulator -= FIXED_DT
    }
    this.alpha = this.accumulator / FIXED_DT
    for (const s of this.systems) s.update?.(d, this.alpha)

    // 통계 (250ms 창)
    this.frames++
    this.statWindow += d
    if (this.statWindow >= 0.25) {
      this.stats.fps = Math.round(this.frames / this.statWindow)
      this.frames = 0
      this.statWindow = 0
    }
    this.stats.frameMs = performance.now() - t0
  }
}

export const gameLoop = new GameLoop()
