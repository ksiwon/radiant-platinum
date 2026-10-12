// **칸이 멈췄으면 바로 끝낸다** — 같은 상태가 N분 그대로면 그 칸을 「멈춤」으로 실패시키는 감시자
// (`docs/orders/JOURNEY_SPEED_20261012.md` 채택 2)
//
// ⚠️ **바퀴를 세는 견딤(`budget.mjs`의 `makeStall` · `makePen`)과 겹치지 않는다.** 그쪽은 `goTo` · `stepOn` 한 부름 안의
// 바퀴를 센다 — 부름이 끝나면 새로 센다. 이쪽은 **칸 전체**를 밖에서 본다: 어떤 고리 안에 있든(대사를 넘기다 · 가방을
// 열다 · 배틀 명령을 고르다 · 체육관 퍼즐을 풀다) 게임이 **아무것도 안 바뀐 채로** 벽시계로 N분이 가면 끝낸다.
// 예산(칸당 수 시간)을 다 태우고서야 끝나지 않게 하려는 것이다.
//
// ⚠️ **「진행」의 정의는 지문 하나다.** 지문에 든 것은 맵 · 칸 · 정확한 좌표 · 장면 · 대사 · 스크립트(어느 파일의 어느 줄) · 메뉴 ·
// 컷인 · 복원 · 배틀(종류 · 턴 · 단계 · 명령 수)이다. 이 밖의 것(fps · 시각 · 계기판 글)은 안 넣는다 — 계기판 숫자가 매 초 바뀌어
// 「늘 진행 중」이 되는 것이 이 감시자를 무력하게 만드는 가장 쉬운 길이다.
//
// ⚠️ **읽기만 한다.** 개발 서버에서만 돈다(`/src` 모듈을 열어 읽는다). 못 읽는 값은 지문에서 `?`로 두고 **0으로 안 접는다** —
// 그래도 DOM 표식만으로 지문이 서므로 일부를 못 읽는 것이 감시를 끄지는 않는다.

/** 기본 N분. `--stuck=<분>`으로 고친다 (`0`이면 끈다) */
export const DEFAULT_STUCK_MINUTES = 8

/**
 * 한 번 읽은 것을 지문 한 줄로 접는다. **같은 값이면 같은 글**이어야 한다.
 *
 * @param read `readState`가 준 것 `{ marks, script, battle, at }`
 */
export function fingerprintOf(read) {
  const m = read?.marks ?? {}
  const pick = ['scene', 'map', 'tile', 'talk', 'script', 'menu', 'cutin', 'restoring', 'battle', 'frontierStage', 'slot']
    .map((k) => `${k}=${m[k] ?? '-'}`).join(' ')
  const s = read?.script
  const b = read?.battle
  const at = read?.at
  return [
    `path=${String(m.path ?? '?')}`,
    pick,
    s === undefined ? 'sc=?' : s === null ? 'sc=-' : `sc=${String(s.file)}@${String(s.pc)}:${String(s.state)}`,
    b === undefined ? 'bt=?' : b === null ? 'bt=-' : `bt=${String(b.phase)}/t${String(b.turn)}/${String(b.shiftAsk)}/a${String(b.actions)}`,
    at === undefined ? 'xz=?' : at === null ? 'xz=-' : `xz=${String(at.x)},${String(at.z)}`,
  ].join(' | ')
}

/**
 * 지문이 얼마나 그대로인지 재는 시계. **시각을 부르는 쪽이 넘긴다** — 시험이 벽시계를 안 기다린다.
 *
 * @param limitMs 이만큼 그대로면 멈춤이다
 */
export function makeStuckClock(limitMs) {
  if (!Number.isFinite(limitMs) || limitMs <= 0) throw new Error(`멈춤 한도가 0보다 커야 한다: ${String(limitMs)}`)
  let last = null
  let since = null
  return {
    limitMs,
    /** 지문 하나를 적는다. 돌려주는 것은 `{ stuck, sameMs }` */
    note(fp, now) {
      if (last === null || fp !== last) { last = fp; since = now; return { stuck: false, sameMs: 0 } }
      const sameMs = now - since
      return { stuck: sameMs >= limitMs, sameMs }
    },
    get last() { return last },
    get since() { return since },
  }
}

/**
 * 페이지에서 **지문 재료**를 읽는다. 개발 서버 전용 — 못 연 모듈은 `undefined`로 둔다 (0으로 안 접는다).
 *
 * ⚠️ **한 번의 `evaluate`다.** 폴링마다 여러 번 왕복하면 재는 것이 판을 무겁게 한다
 */
export const readState = (page) => page.evaluate(async () => {
  const marks = { ...document.documentElement.dataset, path: location.pathname }
  let script
  let battle
  let at
  try {
    const f = await import('/src/engine/script/field.ts')
    const ctx = f.fieldScripts.ctx
    script = ctx === null || ctx === undefined ? null : { file: ctx.file, pc: ctx.pointer, state: ctx.state }
  } catch { script = undefined }
  try {
    const store = await import('/src/state/battleStore.ts')
    const st = store.useBattleStore.getState()
    battle = st.phase === 'off' ? null : {
      phase: st.phase ?? null, turn: st.view?.turn ?? null, shiftAsk: st.shiftAsk ?? null,
      actions: Array.isArray(st.actions) ? st.actions.length : null,
    }
  } catch { battle = undefined }
  try {
    const st = await import('/src/state/worldState.ts')
    const p = st.worldState.player.position
    // 0.1칸 단위 — 걷는 동안은 바뀌고, 제자리에서 미세하게 떠는 것은 안 센다
    at = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }
  } catch { at = undefined }
  return { marks, script, battle, at }
})

/**
 * 감시를 켠다.
 *
 * @param page playwright 페이지
 * @param limitMs 이만큼 지문이 그대로면 멈춤이다
 * @param pollMs 지문을 읽는 간격
 * @param onStuck 멈춤을 알아챘을 때 한 번 부른다 — `{ fingerprint, sameMs, minutes }`를 받아 증거(스크린샷 · 상태)를 남기고 그 글을 돌려준다
 * @param read 지문 재료를 읽는 함수(시험용으로 갈아 끼운다)
 * @param clock 시각 함수(시험용)
 * @returns `{ stuck, stop }` — `stuck`은 멈춤이면 `{ ...info, evidence }`로 풀리고 **아니면 영영 안 풀린다**(경주에 건다)
 */
export function startStuckWatch(page, {
  limitMs, pollMs = 5_000, readMs = 60_000, onStuck = async () => null, read = readState, clock = Date.now,
} = {}) {
  const sc = makeStuckClock(limitMs)
  let live = true
  let timer = null
  /** 읽기가 연달아 실패한 횟수 — 페이지가 죽었으면 멈춤이 아니라 **못 읽음**이다. 그것은 다른 장치가 잡는다 */
  let missed = 0
  /**
   * 아직 안 돌아온 읽기. ⚠️ **안 돌아오는 읽기도 멈춤이다** — 10-12 칸 1이 모래시티에서 gpu-process만 돌고 `evaluate`가 18분
   * 안 돌아왔는데, 읽기를 기다리던 이 감시자도 같이 서서 예산을 다 태웠다. `readMs` 안에 안 오면 「응답 없음」이라는 **같은 지문**을
   * 적고(그대로 두면 한도 뒤에 멈춤), 그 읽기는 버리지 않고 다음 바퀴에 다시 기다린다 — 읽기를 겹쳐 쌓지 않는다
   */
  let pending = null
  const NO_ANSWER = Symbol('no-answer')
  /** 증거 남기기도 같은 페이지를 만진다 — 그것까지 안 돌아오면 증거 없이 끝낸다 */
  const capped = (p) => Promise.race([p, new Promise((r) => { setTimeout(() => { r(NO_ANSWER) }, readMs) })])
  const stuck = new Promise((resolve) => {
    const tick = async () => {
      if (!live) return
      try {
        if (pending === null) pending = read(page)
        const got = await capped(pending)
        if (got !== NO_ANSWER) pending = null
        const fp = got === NO_ANSWER ? `응답 없음 — 읽기가 ${String(Math.round(readMs / 1000))}초 넘게 안 돌아온다` : fingerprintOf(got)
        missed = 0
        const r = sc.note(fp, clock())
        if (r.stuck) {
          live = false
          const info = { fingerprint: fp, sameMs: r.sameMs, minutes: Math.round(r.sameMs / 6_000) / 10, limitMs }
          let evidence = null
          try {
            const e = await capped(onStuck(info))
            evidence = e === NO_ANSWER ? '증거를 못 남겼다 — 페이지가 대답하지 않는다' : e
          } catch (e) { evidence = `증거를 못 남겼다 — ${String(e?.message ?? e).slice(0, 80)}` }
          resolve({ ...info, evidence })
          return
        }
      } catch { pending = null; missed++ }
      if (live) timer = setTimeout(() => { void tick() }, pollMs)
    }
    timer = setTimeout(() => { void tick() }, pollMs)
  })
  return {
    stuck,
    /** 감시를 끈다 — 칸이 제 발로 끝났을 때 */
    stop() { live = false; if (timer !== null) clearTimeout(timer) },
    /** 지금 지문이 얼마나 그대로인가 (진단) */
    peek: () => ({ fingerprint: sc.last, sinceMs: sc.since === null ? null : clock() - sc.since, missed }),
  }
}
