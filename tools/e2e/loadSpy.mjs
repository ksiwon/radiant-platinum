// 판이 도는 **내내** 기계가 얼마나 붐볐는지를 적는 자 (지시서 H4).
//
// ⚠️ **왜 필요한가.** fps 표본이 지금까지 **막힌 다리에서만** 모였다 —
// `drive.mjs`의 `blockNotes`가 「걸음이 막혔다」를 적을 때만 계기판을 읽는다.
// 그래서 「4FPS가 났다」는 사실은 있는데 **얼마나 자주 그런지**를 말할 수 없고,
// 그 한 문장으로는 제품 성능 결함인지 재는 기계가 붐빈 것인지 못 가른다
// (보고서 §7). 판 전체에서 고르게 모아야 분포가 생긴다.
//
// ⚠️ **판정에 안 쓴다.** 여기서 나온 값은 두 곳에만 쓰인다 —
//   ① 실패 하나를 FAIL과 BLOCKED(경합)로 가르는 분류 (`budget.mjs`의 `classify`)
//   ② 개발 서버와 배포물의 분포를 나란히 놓는 비교 (지시서 §2.1)
// **낮은 fps 그 자체로는 아무것도 안 떨어뜨린다.**
//
// ⚠️ **`obs.perf()`를 안 쓴다 — 배포물에서 못 읽기 때문이다.** 제품의 계기판은
// `/src/scene/sceneRefs.ts`를 열어야 읽히는데 배포물에는 그 길이 없다
// (`observe.mjs`). 개발 서버는 제품 값으로, 배포물은 다른 값으로 재면 §2.1의
// 비교가 **서로 다른 자로 잰 두 수**가 된다. 그래서 양쪽 다 브라우저의
// `requestAnimationFrame`을 세는 **같은 자**로 잰다.
//
// ⚠️ **CPU는 이 기계 전체다 — 우리 프로세스 몫이 아니다.** `os.cpus()`가 주는
// 것이 그것이고, 재려는 것도 그것이다(다른 LLM이 같이 쓰는가). 「크로미움이
// 얼마나 썼나」로 읽지 않는다

import { cpus } from 'node:os'
import { summarizeLoad } from './budget.mjs'

/**
 * 페이지에 심는 프레임 계수기. **초마다 프레임 수를 하나씩 쌓는다.**
 *
 * ⚠️ **`addInitScript`로 심는 하네스 코드고 제품이 아니다** (`perfSpy.mjs`와
 * 같은 자리다). 배포물에는 이 줄이 없다.
 *
 * ⚠️ **읽을 때마다 비운다.** 안 비우면 한 판(수십 분)의 배열이 그대로 쌓이고,
 * 화면을 새로 열면 통째로 사라진다 — 자주 걷어 가는 쪽이 둘 다 푼다
 */
export const LOAD_SPY = () => {
  const w = window
  const st = { secs: [], n: 0, at: Math.floor(performance.now() / 1000) }
  w.__loadSpy = st
  const tick = () => {
    const s = Math.floor(performance.now() / 1000)
    if (s !== st.at) {
      // ⚠️ **건너뛴 초를 0으로 안 채운다.** 화면이 아예 안 도는 동안(탭이
      // 숨거나 장치가 죽은 동안)은 **못 잰 것**이지 0프레임이 아니다
      st.secs.push(st.n)
      if (st.secs.length > 900) st.secs.shift()
      st.at = s
      st.n = 0
    }
    st.n++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** 이 기계 전체의 CPU 시간 합 */
const cpuTimes = () => {
  let idle = 0
  let total = 0
  for (const c of cpus()) {
    for (const [k, v] of Object.entries(c.times)) {
      total += v
      if (k === 'idle') idle += v
    }
  }
  return { idle, total }
}

/**
 * 부하 표본을 모으는 자를 켠다.
 *
 * @param page playwright 페이지. `LOAD_SPY`가 이미 심겨 있어야 한다
 * @param every 몇 ms마다 걷어 갈까
 */
export function startLoadSpy(page, { every = 5_000 } = {}) {
  /** `{ fps, cpu }` 표본들. 못 잰 것은 **넣지 않는다** */
  const samples = []
  /** 걷어 가다 실패한 횟수. 「표본이 적다」의 까닭이 된다 */
  let missed = 0
  let last = cpuTimes()
  let live = true

  const take = async () => {
    // ⚠️ **CPU는 페이지와 상관없이 잰다.** 화면을 못 읽어도 기계가 붐볐다는
    // 사실은 남아야 한다
    const now = cpuTimes()
    const dTotal = now.total - last.total
    const dIdle = now.idle - last.idle
    last = now
    const cpu = dTotal > 0 ? ((dTotal - dIdle) / dTotal) * 100 : null
    // ⚠️ **두 값을 한 점에 묶지 않는다.** CPU는 걷는 주기마다 한 번이고 fps는
    // 초마다 하나다 — 묶으면 같은 CPU 값이 다섯 번씩 세어져 표본 수가 거짓이 된다
    if (cpu !== null) samples.push({ cpu })
    try {
      const secs = await page.evaluate(() => {
        const st = window.__loadSpy
        if (st === undefined) return null
        const out = st.secs
        st.secs = []
        return out
      })
      // 초마다 하나씩 넣는다 — 5초를 한 점으로 접으면 봉우리가 사라진다
      if (Array.isArray(secs)) for (const f of secs) samples.push({ fps: f })
      else missed++
    } catch { missed++ }
  }

  const timer = setInterval(() => { void take() }, every)
  // ⚠️ 이 타이머가 노드를 붙잡아 두면 안 된다 — 판이 끝나면 같이 끝난다
  timer.unref?.()

  return {
    /** 마지막 몫까지 걷고 요약을 돌려준다 */
    async stop() {
      if (!live) return summarizeLoad(samples)
      live = false
      clearInterval(timer)
      await take().catch(() => { missed++ })
      return { ...summarizeLoad(samples), missed }
    },
    /** 지금까지의 요약. 도는 중에 분류가 물어볼 수 있다 */
    peek() { return { ...summarizeLoad(samples), missed } },
    samples,
  }
}
