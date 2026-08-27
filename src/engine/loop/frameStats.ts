// 프레임이 얼마나 고른가 (PLAN §10.5)
//
// ⚠️ **평균 FPS는 부드러움을 말해 주지 않는다.** 60프레임 중 쉰아홉이 16ms고
// 하나가 300ms면 평균은 60에 가깝지만 사람은 그 하나만 느낀다. 그래서 여기서
// 재는 것은 **분포**다.
//
// ⚠️ **헤드리스로는 못 잰다.** `pnpm shot`·`pnpm story`는 WebGPU 장치를 못 만들어
// SwiftShader(소프트웨어 래스터라이저)로 내려앉는다 — 그 수는 사용자 기계의
// 수가 아니다 (DEPLOY.md). 이 계기판은 **사람이 제 기계에서 읽어 주는** 자리다.
//
// 재는 것 다섯이 사용자가 실제로 느끼는 것과 짝이 맞는다:
//
//   프레임 시간 분포   중간값과 **p99** — 「가끔 걸린다」가 여기 뜬다
//   드로우콜 · 삼각형   화면 하나의 값. 무엇을 줄일지의 근거다
//   맵 전환 최장 프레임 걸어서 맵을 나갈 때의 멈춤 (REPAIR §8)
//   첫 배틀 최장 프레임 `@pkmn/sim`이 처음 들어오는 그 한 번 (PLAN §7.5.1)

/**
 * 몇 프레임을 들고 있나. 60Hz로 **17초**다.
 *
 * ⚠️ **2의 거듭제곱이다** — 자리를 `& (N−1)`로 돌린다. 나머지 연산이 아니라
 * 비트라 프레임마다 도는 자리에 값이 안 든다
 */
const KEEP = 1024

/**
 * 프레임 간격의 분포.
 *
 * ⚠️ **재는 것은 루프가 아니라 간격이다.** 루프가 도는 시간(`gameLoop.stats.frameMs`)은
 * 우리 코드가 쓴 값이고, 사람이 보는 것은 **화면이 다음 장으로 넘어가는 간격**이다 —
 * 드라이버가 셰이더를 굽느라 멎은 300ms는 루프 시간에 안 잡히고 간격에만 잡힌다
 */
export class FrameStats {
  // ⚠️ **32비트로 두면 16.6667ms가 16.6666603으로 적힌다.** 8KB짜리 배열이라
  // 아낄 값이 아니고, 시험이 원래 값과 못 맞대는 쪽이 더 비싸다
  private readonly ring = new Float64Array(KEEP)
  private at = 0
  private filled = 0
  /** 지금 열려 있는 구간. 없으면 null */
  private span: { name: string, worst: number, frames: number, fresh: boolean } | null = null
  /**
   * 구간마다 잰 것. 이름 하나에 두 벌을 든다 — **처음 한 번**과 **제일 나쁜 번**이다.
   *
   * 첫 배틀의 히칭은 처음 한 번이 임자고(다음부터는 청크가 이미 와 있다),
   * 맵 전환은 제일 나쁜 번이 임자다 (어느 맵이 제일 아픈가)
   */
  readonly spans = new Map<string, {
    first: number, worst: number, last: number, count: number,
  }>()

  /** 한 프레임 (`ms`는 앞 프레임과의 간격) */
  push(ms: number): void {
    this.ring[this.at] = ms
    this.at = (this.at + 1) & (KEEP - 1)
    if (this.filled < KEEP) this.filled += 1
    const span = this.span
    if (span === null) return
    span.frames += 1
    if (ms <= span.worst) return
    span.worst = ms
    // ⚠️ **닫히기를 기다리지 않고 그 자리에서 적는다.** 구간을 닫는 것은 다음
    // 구간이 열릴 때인데, 그때까지 안 적으면 **처음 한 번이 화면에 영영 안 뜬다** —
    // 걸어서 맵을 나가 보고 계기판을 봤는데 아무것도 없는 것이 그 증상이다
    const had = this.spans.get(span.name)
    this.spans.set(span.name, {
      first: span.fresh ? ms : had?.first ?? ms,
      worst: Math.max(had?.worst ?? 0, ms),
      last: ms,
      count: had?.count ?? 1,
    })
  }

  /** 들고 있는 프레임 수 */
  get count(): number { return this.filled }

  /**
   * 백분위 프레임 시간(ms). `p`는 0~1이고 **작을수록 빠른 쪽**이다.
   *
   * `percentile(0.99)`가 흔히 말하는 **1% low**의 한 갈래다 — 「백 프레임 중
   * 제일 느린 하나가 이만큼」. ⚠️ **같은 이름의 다른 셈이 있다**(제일 느린 1%의
   * *평균*). 두 값이 다르므로 어느 쪽인지 밝히지 않으면 남과 못 견준다 —
   * 우리는 **백분위** 쪽이고, 이 주석이 그 근거다.
   *
   * 들고 있는 것이 없으면 0이다
   */
  percentile(p: number): number {
    if (this.filled === 0) return 0
    const sorted = Array.from(this.ring.subarray(0, this.filled)).sort((a, b) => a - b)
    // ⚠️ **`Math.round`가 아니라 아래로 자른다** — 자리가 길이를 넘으면 안 된다
    const at = Math.min(this.filled - 1, Math.floor(p * this.filled))
    return sorted[at] ?? 0
  }

  /**
   * 구간을 연다. 같은 이름을 다시 열면 앞의 것을 닫고 새로 센다.
   *
   * ⚠️ **안 닫아도 된다** — 다음 구간이 열리면 그 자리에서 닫힌다. 닫는 것을
   * 잊어서 값이 영영 안 남는 일이 없게 그렇게 뒀다
   */
  openSpan(name: string): void {
    this.closeSpan()
    // 몇 번째인가는 **여는 자리**에서 센다. 한 프레임도 안 지난 구간은 값을
    // 안 남기지만, 「열렸다」는 사실 자체는 그 자리에서 이미 참이다
    const had = this.spans.get(name)
    this.span = { name, worst: 0, frames: 0, fresh: had === undefined }
    if (had !== undefined) this.spans.set(name, { ...had, last: 0, count: had.count + 1 })
  }

  /** 지금 구간을 닫는다. 값은 `push`가 프레임마다 이미 적어 두었다 */
  closeSpan(): void {
    this.span = null
  }

  /** 새 판·새 기계. 잰 것을 통째로 버린다 */
  reset(): void {
    this.at = 0
    this.filled = 0
    this.span = null
    this.spans.clear()
  }
}

/** 구간 이름 둘. 문자열을 두 자리에 적으면 언젠가 한쪽만 고쳐진다 */
export const SPAN = { warp: '맵 전환', battle: '첫 배틀' } as const

/**
 * 세계에 하나. 미는 것은 `engine/loop`이고 읽는 것은 계기판이다.
 *
 * ⚠️ **스토어가 아니다** — 프레임마다 바뀌는 값이라 리액트에 밀면 화면이
 * 초당 예순 번 다시 그려진다 (`state/worldState`와 같은 이유다)
 */
export const frameStats = new FrameStats()
