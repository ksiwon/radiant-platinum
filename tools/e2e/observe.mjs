// 무엇을 읽을 수 있는가는 **어디서 도느냐가 정한다** — 관측 어댑터 (후속 §3)
//
// ⚠️ **한 파일에서 둘을 섞으면 배포본이 조용히 다르게 돈다.** `drive.mjs`는
// 개발 서버와 배포물(dist)을 **같은 코드로** 몬다. 그런데 몇 자리는 개발
// 서버에만 있는 `/src/...` 모듈을 열어 값을 읽었고, 배포물에서는 그 요청이
// 404가 된다. 한 자리(`pickMove`)는 그것을 `.catch(() => null)`로 삼켜서
// **실행은 이어지되 고르는 기술이 달라졌고**, 다른 자리(`lakeVars`·`snapshot`)는
// 그대로 던져서 ㉖을 통째로 끊었다 — 실측(2026-09-08 `e2e`): ㉖이
// `Failed to fetch dynamically imported module: .../src/engine/script/field.ts`.
//
// 그래서 **읽는 자리를 하나로 모으고 갈래를 명시한다.**
//
//   `dev`  — 개발 서버. `/src/...`를 열어 제품이 export하는 값을 **읽기만** 한다
//   `dist` — 배포물. `<html>`의 읽기 전용 표식과 화면만 본다. `/src` 요청을
//            **한 건도 안 보낸다**
//
// ⚠️ **못 읽는 것을 false·0·성공으로 바꾸지 않는다.** 모든 답이
// `{ known: true, value }` 또는 `{ known: false, why }`다. 「관측 불가」는
// 「아니다」가 아니고 PASS도 아니다 — 부르는 쪽이 그 셋을 갈라 적는다
// (`docs/orders/POST_OVERNIGHT_REVIEW_20260909.md` §3).
//
// ⚠️ **쓰는 길은 안 만든다.** 여기 있는 것은 전부 읽기다. 진행은 `drive.mjs`가
// 방향키와 A로만 만든다

/** 읽은 값 */
export const got = (value) => ({ known: true, value })
/** 못 읽었다. **거짓이 아니다** */
export const unknown = (why) => ({ known: false, why })

/**
 * 어느 갈래인가를 **요청 없이** 가른다.
 *
 * ⚠️ **`/src`를 찔러 보면 안 된다.** 그 자체가 「배포에서 /src 요청 0건」을
 * 깨뜨린다. Vite 개발 서버는 `index.html`에 자기 클라이언트를 꽂으므로
 * (`<script type="module" src="/@vite/client">`) 그 한 줄이 갈래를 말한다 —
 * 배포물에는 없다. `import.meta.env.DEV`가 페이지 밖에서는 안 보이는 자리다
 */
export async function observerKind(page) {
  return page.evaluate(() => (
    document.querySelector('script[src*="/@vite/client"]') !== null
      || '__vite_plugin_react_preamble_installed__' in window
      ? 'dev' : 'dist'
  ))
}

/**
 * 관측 어댑터를 만든다.
 *
 * @param page playwright 페이지
 * @param kind `'dev'` · `'dist'` · `'auto'`(기본, 위 규칙으로 가른다)
 */
export async function makeObserver(page, kind = 'auto') {
  const mode = kind === 'auto' ? await observerKind(page) : kind
  return mode === 'dev' ? devObserver(page) : distObserver(page)
}

/** 배포물에서 못 읽는 값들의 까닭. 자리마다 같은 글을 쓴다 */
const NO_SRC = '배포물에서는 못 읽는다 — /src 모듈이 없다 (관측 불가, 거짓 아님)'

// ── 개발 서버 ────────────────────────────────────────────────────────────────

function devObserver(page) {
  /**
   * ⚠️ **열다 실패한 것을 값처럼 돌려주지 않는다.** 개발 서버에서도 모듈
   * 하나가 못 열릴 수 있다(고치는 중의 문법 오류가 그렇다). 그때는
   * 「관측 불가」지 「값이 없다」가 아니다
   */
  const read = async (why, fn, arg = null) => {
    try {
      return got(await page.evaluate(fn, arg))
    } catch (e) {
      return unknown(`${why} — ${String(e?.message ?? e).slice(0, 120)}`)
    }
  }
  return {
    kind: 'dev',
    lakeVars: () => read('이야기 변수를 못 읽었다', async () => {
      const f = await import('/src/engine/script/field.ts')
      const v = f.fieldScripts.vars
      return { rival: v.get(16518), front: v.get(16514), visited: v.get(16533) }
    }),
    script: () => read('도는 스크립트를 못 읽었다', async () => {
      const f = await import('/src/engine/script/field.ts')
      const ctx = f.fieldScripts.ctx
      return {
        running: ctx === null ? null : { file: ctx.file, pc: ctx.pointer, state: ctx.state },
        lastError: f.fieldScripts.lastError === null ? null
          : String(f.fieldScripts.lastError).slice(0, 200),
      }
    }),
    where: () => read('세계 좌표를 못 읽었다', async () => {
      const w = await import('/src/engine/map/world.ts')
      const st = await import('/src/state/worldState.ts')
      const p = st.worldState.player.position
      return {
        map: w.world.mapId, x: +p.x.toFixed(2), z: +p.z.toFixed(2),
        facing: st.worldState.player.facing,
      }
    }),
    /**
     * **게임 자신의 격자**가 그 칸을 막았는가. 우리 격자(`route.mjs`)와 견주려고
     * 읽는다 — 계획은 우리 것으로 세우고 막는 것은 게임 것이라, 둘이 다르면
     * 「길은 있는데 안 걸어진다」가 난다
     */
    blockedAt: (x, z) => read('게임 격자를 못 읽었다', async ([tx, tz]) => {
      const m = await import('/src/engine/map/world.ts')
      const g = m.world.grid
      if (!g) return null
      return { blocked: g.isBlocked(tx, tz), behavior: g.behavior?.(tx, tz) ?? null }
    }, [x, z]),
    /**
     * 그 자리를 **사람이** 막고 있는가 (`actor/obstacles.ts`의 `solidNpcAt` —
     * 게임이 실제로 쓰는 그 함수다).
     *
     * ⚠️ **격자에는 사람이 없다.** `route.mjs`는 칸 격자로만 계획하므로
     * 사람을 뚫고 가는 길을 낸다 — 그때 「경로는 있는데 이동 실패」가 난다
     */
    solidAt: (x, z) => read('사람 충돌을 못 읽었다', async ([tx, tz]) => {
      const o = await import('/src/engine/actor/obstacles.ts')
      const st = await import('/src/state/worldState.ts')
      const hit = o.solidNpcAt(tx, tz, st.worldState.player.position.y)
      return hit === null ? null : {
        script: hit.info?.script ?? null,
        at: { x: Number(hit.x.toFixed(2)), z: Number(hit.z.toFixed(2)) },
      }
    }, [x, z]),
    /** 지금 프레임이 얼마나 걸리나 (`scene/sceneRefs.ts`의 `perfSnapshot`) */
    perf: () => read('계기판을 못 읽었다', async () => {
      const m = await import('/src/scene/sceneRefs.ts')
      const p = m.perfSnapshot
      return p === undefined ? null : { fps: p.fps ?? null, ms: p.ms ?? null, draws: p.draws ?? null }
    }),
    npcSpot: (mapId, script) => read('명부를 못 읽었다', async ([map, want]) => {
      const m = await import('/src/engine/actor/npcs.ts')
      const reg = m.npcActors
      if (reg.mapId !== map) return null
      const hit = reg.list.find((a) => a.info?.script === want && a.visible !== false)
      return hit === undefined ? null : { x: Math.round(hit.x), z: Math.round(hit.z) }
    }, [mapId, script]),
    partyState: () => read('파티를 못 읽었다', async () => {
      const m = await import('/src/state/saveStore.ts')
      const inst = await import('/src/engine/pokemon/instance.ts')
      const data = await import('/src/data/gameData.ts')
      const party = m.useSaveStore.getState().party
      if (party.length === 0) return []
      const [species, moves] = await Promise.all([data.loadSpecies(), data.loadMoves()])
      return party.map((p) => {
        const info = species.of(p)
        const slots = p.moves.map((slot) => ({
          move: slot.move, pp: slot.pp, max: inst.maxPpOf(slot, moves.get(slot.move).pp),
        }))
        return {
          species: p.species, level: p.level, hp: p.hp,
          max: info ? inst.maxHp(p, info) : null, status: p.status, moves: slots,
        }
      })
    }),
    bestMove: () => read('기술표를 못 읽었다', async () => {
      const store = await import('/src/state/battleStore.ts')
      const data = await import('/src/data/gameData.ts')
      const preview = await import('/src/engine/battle/movePreview.ts')
      const [moves, species] = await Promise.all([data.loadMoves(), data.loadSpecies()])
      const st = store.useBattleStore.getState()
      const picks = st.actions.filter((a) => a.type === 'move')
      if (picks.length === 0) return null
      const foe = st.view?.active?.p2a ?? null
      const foeTypes = foe?.species == null ? null : species.get(foe.species)?.types ?? null
      const scored = picks.map((a, i) => {
        const info = moves.get(a.move)
        if (!info) return { i, score: 0 }
        if (a.pp === 0) return { i, score: -1000 }
        if (info.category === 'status') return { i, score: 1 }
        const tag = preview.moveMatch(info, foeTypes, null, true)
        if (tag === 'immune') return { i, score: 0 }
        const mul = tag === 'super' ? 4 : tag === 'resisted' ? 0.5 : 1
        return { i, score: Math.max(1, info.power) * mul + 10 }
      })
      scored.sort((x, y) => y.score - x.score)
      const top = scored[0]
      return top === undefined || top.score <= 0 ? null : top.i
    }),
  }
}

// ── 배포물 ───────────────────────────────────────────────────────────────────

/**
 * ⚠️ **여기서는 아무 요청도 안 나간다.** 전부 `unknown`이거나 이미 문서에
 * 적혀 있는 표식이다. 「값이 필요하니 하나만 열자」가 곧 ㉖의 실패였다
 */
function distObserver(page) {
  return {
    kind: 'dist',
    lakeVars: async () => unknown(NO_SRC),
    script: async () => unknown(NO_SRC),
    /**
     * 표식은 배포물에도 있다 — 다만 **칸 단위의 정수**고 원시 좌표가 아니다
     * (`app/sceneMark.ts`의 `markTile`은 `floor`다)
     */
    where: async () => {
      const m = await page.evaluate(() => ({ ...document.documentElement.dataset }))
      const [x, z] = (m.tile ?? '').split(',').map(Number)
      if (!Number.isFinite(x) || !Number.isFinite(z)) return unknown('아직 칸 표식이 없다')
      return got({ map: Number(m.map), x, z, facing: null, tileOnly: true })
    },
    blockedAt: async () => unknown(NO_SRC),
    solidAt: async () => unknown(NO_SRC),
    perf: async () => unknown(NO_SRC),
    npcSpot: async () => unknown(NO_SRC),
    partyState: async () => unknown(NO_SRC),
    bestMove: async () => unknown(NO_SRC),
  }
}
