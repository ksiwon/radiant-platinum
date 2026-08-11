// 지금 울리는 중인 소리를 센다 (`Sound_IsEffectPlaying` · `Sound_IsPokemonCryPlaying`)
//
// ⚠️ **이 답 하나로 게임이 멈출 수 있다.** 필드 스크립트가 `WaitSE`·`WaitCry`·
// `WaitFanfare`로 여기 답이 거짓이 될 때까지 서는데, 그 동안 주인공은 발이
// 묶인다. 그러니 **참에서 거짓으로 가는 길이 반드시 있어야 한다.**
//
// 원작은 그 걱정이 없다. 하드웨어 채널이라 소리는 물리적으로 끝난다. 우리는
// 웹오디오라 안 끝나는 길이 셋이다:
//
//   1. 소리 파일을 못 받는다        → 약속이 거절되고 센 것이 안 돌아온다
//   2. 펴는 워커가 답을 안 한다     → 약속이 영영 안 풀린다
//   3. 오디오 문맥이 멈춰 있다      → `onended`가 영영 안 온다
//
// 실측으로 3번에 걸렸다. 새 게임 침실에서 팡파르 하나가 안 끝나 그 자리의
// 스크립트가 끝나지 않았고, 브라우저 밖에서는 **"게임이 얼었다"로만 보였다** —
// 대사도 없고 걸음도 없으니 벽에 막힌 것과 구별이 안 됐다.
//
// 그래서 **시간으로도 놓는다.** 소리 길이를 알면 그만큼, 아직 모르면 넉넉한
// 상한만큼 기다렸다가 스스로 끝난 것으로 센다. 소리가 조금 일찍 "끝났다"고
// 세는 것은 최악이라야 효과음이 겹쳐 들리는 것이고, 반대쪽 실수는 게임이 멈추는 것이다.

/** 울리는 소리 하나를 쥔 손잡이. `release`와 시간 중 먼저 오는 쪽이 이긴다 */
export interface Ring {
  /** 끝났다 */
  release: () => void
  /** 늦어도 이때까지는 끝난 것으로 쳐라 */
  by: (ms: number) => void
}

/** 시험이 시계를 갈아 끼울 수 있게 받는다 */
export interface Timers {
  set: (fn: () => void, ms: number) => unknown
  clear: (handle: unknown) => void
}

const REAL: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => { clearTimeout(h as ReturnType<typeof setTimeout>) },
}

export class RingCounter {
  /**
   * 번호 → 지금 울리는 것들의 표.
   *
   * ⚠️ **수를 세면 안 된다.** 수만 세면 `clear()` 뒤에 시작한 소리를 **그 전
   * 소리의 상한 타이머가 끝내 버린다** — A 시작 → `clear` → B 시작 → A의
   * 타이머가 뒤늦게 깨어나 "하나 줄여라"를 하면 B가 울리는 중인데도 0이 된다.
   * 그러면 `WaitSE`가 너무 일찍 풀려 스크립트 순서가 어긋난다.
   *
   * 표로 두면 그 일이 안 난다. 늦게 깨어난 A는 **자기 표만** 뺀다
   */
  private readonly live = new Map<number, Set<object>>()

  /**
   * @param capMs 소리 길이를 알기 전까지 세어 줄 수 있는 최대 시간.
   *   펴는 데 걸리는 시간까지 덮어야 한다
   */
  constructor(private readonly capMs: number, private readonly timers: Timers = REAL) {}

  /** 하나가 울리기 시작했다 */
  start(id: number): Ring {
    /** 이 소리 하나를 가리키는 표. 남과 안 겹치는 것이면 무엇이든 된다 */
    const token = {}
    const here = this.live.get(id) ?? new Set<object>()
    here.add(token)
    this.live.set(id, here)
    let over = false
    let handle: unknown = null
    const release = (): void => {
      if (over) return
      over = true
      if (handle !== null) this.timers.clear(handle)
      // ⚠️ **`live.get(id)`를 다시 읽는다.** `here`를 붙잡아 두면 `clear()`가
      // 갈아 끼운 뒤에도 옛 표를 만지게 되고, 그러면 지금 울리는 소리를 못 센다
      const set = this.live.get(id)
      if (!set?.delete(token)) return
      if (set.size === 0) this.live.delete(id)
    }
    const by = (ms: number): void => {
      if (over) return
      if (handle !== null) this.timers.clear(handle)
      handle = this.timers.set(release, ms)
    }
    by(this.capMs)
    return { release, by }
  }

  /** 아직 울리는가 */
  has(id: number): boolean {
    return this.live.has(id)
  }

  /**
   * 끊는다 (`Sound_StopEffect`).
   *
   * 이미 붙은 소스를 되찾을 길이 없으므로 **센 것만 지운다** — 소리는 남은
   * 길이만큼 더 나지만 `WaitSE`는 안 멎는다
   */
  clear(id: number): void {
    this.live.delete(id)
  }
}
