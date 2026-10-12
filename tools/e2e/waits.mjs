// **기다림을 시간이 아니라 상태로** — 하네스가 고정 `waitForTimeout`을 대신 쓰는 자들
// (`docs/orders/JOURNEY_SPEED_20261012.md`)
//
// ⚠️ **상한은 그대로 두고 일찍 나오기만 한다.** 예전 고정 시간이 이 자리의 상한이다 — 상태가 안 서면
// **그 시간만큼은 기다리고** 예전처럼 이어 간다(시간 초과가 판정을 바꾸지 않는다). 그래서 이 바꿈으로
// 판이 예전보다 **더 오래 기다리는 길은 없고**(프레임 기다림만 예외 — 아래), 이미 서 있으면 바로 나온다.
//
// ⚠️ **읽을 수 없으면 예전 고정 시간으로 물러난다.** 배포물(`dist`)에서는 `/src`를 못 읽으므로
// (`observe.mjs`) 프레임 수 · 속력은 「관측 불가」다 — 그때 이 파일의 자들은 **예전 고정 시간 그대로** 잔다.
// 관측 불가를 「이미 됐다」로 접지 않는다.
//
// ⚠️ **쓰는 길이 아니다.** 여기 있는 것은 전부 읽기와 기다림이다. 진행은 늘 키 입력이 만든다.

/** 벽시계로 잔다 — 폴링 사이 간격이고 판정이 아니다 */
const nap = (ms) => new Promise((r) => { setTimeout(r, ms) })

/**
 * 조건이 참이 될 때까지 기다린다 — **상한까지.**
 *
 * @param pred 참이면 끝나는 함수. 던지면 「아직」으로 읽는다(마지막 오류는 `why`에 남는다)
 * @param timeout 상한(ms). 넘기면 `ok:false`로 **돌아온다** — 던지지 않는다. 던질지는 부르는 쪽이 정한다
 * @param poll 폴링 간격(ms)
 * @returns `{ ok, ms, value, why }` — `value`는 마지막으로 읽은 판정식의 값
 */
export async function waitFor(pred, { timeout = 5_000, poll = 40 } = {}) {
  const t0 = Date.now()
  let value = null
  let why = null
  for (;;) {
    try {
      value = await pred()
      if (value) return { ok: true, ms: Date.now() - t0, value, why: null }
    } catch (e) {
      why = String(e?.message ?? e).slice(0, 120)
    }
    const left = timeout - (Date.now() - t0)
    if (left <= 0) return { ok: false, ms: Date.now() - t0, value, why }
    await nap(Math.min(poll, left))
  }
}

/** 시간 초과면 던진다 — **기다린 것이 안 섰으면 이어 가면 안 되는 자리**에서 쓴다 */
export async function waitForOrThrow(pred, opts, what) {
  const r = await waitFor(pred, opts)
  if (!r.ok) throw new Error(`${what} — ${String(r.ms)}ms를 기다려도 안 섰다${r.why === null ? '' : ` (${r.why})`}`)
  return r
}

/**
 * **게임 프레임이 `n`장 더 나가기를 기다린다.**
 *
 * `readMotion`은 `obs.motion`(개발 서버) 같은 읽는 함수다 — `{ known, value: { frames } }`를 준다.
 * ⚠️ **프레임은 벽시계가 아니다.** 느린 기계(4fps)에서는 `n`장에 `n/4`초가 걸리고, 그것이 옳다 — 「화면에
 * 나갔는가」를 묻는 자리는 고정 시간이 기계에 따라 모자라거나 남기 때문이다. 그래서 상한은 예전 고정 시간의
 * `CAP_FACTOR`배다.
 *
 * ⚠️ **프레임을 못 읽으면 예전 고정 시간 그대로 잔다** (`fallbackMs`).
 *
 * @param fallbackMs 예전 고정 시간 — 못 읽을 때의 잠이고 상한의 바탕이다
 * @returns `{ ok, known, ms, frames }` — `known:false`면 고정 시간으로 잤다
 */
export const CAP_FACTOR = 5
export async function pauseFrames(readMotion, n, fallbackMs, { poll = 16 } = {}) {
  const t0 = Date.now()
  const first = await readMotion().catch(() => ({ known: false }))
  if (first?.known !== true || !Number.isFinite(first.value?.frames)) {
    await nap(fallbackMs)
    return { ok: true, known: false, ms: Date.now() - t0, frames: null }
  }
  const from = first.value.frames
  const r = await waitFor(async () => {
    const m = await readMotion()
    return m.known === true && m.value.frames - from >= n ? m.value.frames - from : false
  }, { timeout: Math.max(fallbackMs * CAP_FACTOR, 1_000), poll })
  return { ok: r.ok, known: true, ms: r.ms, frames: r.ok ? r.value : null }
}

/**
 * **주인공의 남은 속도가 죽기를 기다린다.**
 *
 * 손을 떼면 속도가 `exp(−12t)`로 죽는다(`actor/player`의 `velocity.lerp(desired, 1 − exp(−12dt))`) —
 * 남은 미끄러짐 거리는 `속력/12`다. 예전 250ms(= `exp(−3)` ≈ 5%)가 걸었던 약속은 「걸어서 남는 미끄러짐이
 * 0.02칸」이라, 여기서도 **남은 거리 ≤ `slideTiles`**를 조건으로 한다 (`속력 ≤ 12 × slideTiles`).
 *
 * ⚠️ **게임 시간이지 벽시계가 아니다.** 한 프레임이 길어 시간 증분이 잘리는 느린 기계에서는 250ms가 모자라고
 * (게임 시간이 덜 흘렀다) 이 기다림이 그만큼 더 간다. 그래서 상한은 예전 시간의 `CAP_FACTOR`배다.
 * 못 읽으면 예전 고정 시간 그대로다.
 */
export async function pauseSettled(readMotion, fallbackMs, { slideTiles = 0.02, poll = 16 } = {}) {
  const t0 = Date.now()
  const first = await readMotion().catch(() => ({ known: false }))
  if (first?.known !== true || !Number.isFinite(first.value?.speed)) {
    await nap(fallbackMs)
    return { ok: true, known: false, ms: Date.now() - t0 }
  }
  const limit = 12 * slideTiles
  const r = await waitFor(async () => {
    const m = await readMotion()
    return m.known === true && m.value.speed <= limit
  }, { timeout: Math.max(fallbackMs * CAP_FACTOR, 1_000), poll })
  return { ok: r.ok, known: true, ms: r.ms }
}

/**
 * **주인공이 뛰기(`hop`)를 끝내고 속력이 죽기를 기다린다** — 파도타기 승선 · 락클라임처럼 `hopTo`가 도는 동안.
 *
 * ⚠️ **프레임이 `minFrames`장 나간 뒤에만 「안 뛴다」를 믿는다.** 뛰기를 시작하는 호출과 이 읽기 사이에 프레임이 한 장도
 * 안 돌았으면 `hop.active`가 아직 거짓일 수 있다 — 「시작 전」을 「끝났다」로 읽지 않으려는 문턱이다.
 * 상한은 예전 시간의 `CAP_FACTOR`배고, 못 읽으면(배포물) 예전 고정 시간 그대로 잔다.
 */
export async function pauseIdle(readMotion, fallbackMs, { minFrames = 2, slideTiles = 0.02, poll = 16 } = {}) {
  const t0 = Date.now()
  const first = await readMotion().catch(() => ({ known: false }))
  if (first?.known !== true || !Number.isFinite(first.value?.frames)) {
    await nap(fallbackMs)
    return { ok: true, known: false, ms: Date.now() - t0 }
  }
  const from = first.value.frames
  const limit = 12 * slideTiles
  const r = await waitFor(async () => {
    const m = await readMotion()
    return m.known === true && m.value.frames - from >= minFrames && m.value.hop !== true && m.value.speed <= limit
  }, { timeout: Math.max(fallbackMs * CAP_FACTOR, 1_000), poll })
  return { ok: r.ok, known: true, ms: r.ms }
}
