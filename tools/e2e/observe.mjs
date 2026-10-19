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
    /**
     * **비전기술로 치우는 물체**가 그 칸에 있는가 (`actor/obstacles.ts`의
     * `obstacleAt` — 게임이 실제로 쓰는 그 함수다).
     *
     * ⚠️ **`solidAt`으로는 못 본다.** 그쪽은 `solidNpcAt`이라 높이를 같이 보고,
     * 바위·나무·큰바위만 가리지도 않는다 — 실측(2026-09-16 `_north42` 3판)에서
     * 못 깬 바위를 「깼다」로 읽었다
     */
    obstacleAt: (x, z) => read('물체를 못 읽었다', async ([tx, tz]) => {
      const o = await import('/src/engine/actor/obstacles.ts')
      const hit = o.obstacleAt(tx, tz)
      return hit === null ? null : { gfx: hit.gfx, script: hit.info?.script ?? null }
    }, [x, z]),
    /**
     * **기다림을 상태로 바꾸려고 읽는 움직임** — 나간 프레임 수 · 주인공 속력(타일/초) · 뛰는 중인가.
     *
     * ⚠️ **전부 제품이 이미 가진 값이다** (`perfSnapshot.frames` · `worldState.player.velocity` · `.hop.active`).
     * 읽기만 한다. 배포물에서는 못 읽는다 — 부르는 쪽은 `known`이 아니면 예전 고정 시간으로 물러난다
     */
    motion: () => read('움직임을 못 읽었다', async () => {
      const sr = await import('/src/scene/sceneRefs.ts')
      const st = await import('/src/state/worldState.ts')
      const p = st.worldState.player
      return {
        frames: sr.perfSnapshot.frames,
        speed: Math.hypot(p.velocity.x, p.velocity.z),
        hop: p.hop?.active === true,
      }
    }),
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
    /**
     * 주인공이 **지금 보는 쪽** — 원작 방향 번호로 (북 0 · 남 1 · 서 2 · 동 3).
     *
     * ⚠️ **`worldState.player.facing`은 번호가 아니라 라디안이다.** 실측
     * (2026-09-22 배지4 탐침 7판): 그 값을 그대로 `kick.dir`과 견주었더니 **영영
     * 안 맞았고**, 「돌아섰나」를 묻는 고리가 통째로 헛돌았다. 기록에 남은 값은
     * `1.5707963267948966`(π/2)이었다 — 번호였다면 3이었을 자리다.
     *
     * 제품의 변환은 `script/field.ts`의 `playerMovable.dir`인데 **내보내지 않아서**
     * 밖에서 못 부른다. 그래서 같은 셈을 여기서 한다 — 사분면(0 +z · 1 +x ·
     * 2 −z · 3 −x)을 내고 방향으로 옮긴다. **번호는 제품의 `DIR`에서 가져온다**
     * (`atan2(vx, vz)`라 0이 +z, 곧 남쪽이다)
     */
    facingDir: () => read('보는 쪽을 못 읽었다', async () => {
      const st = await import('/src/state/worldState.ts')
      const mv = await import('/src/engine/script/movement.ts')
      const yaw = st.worldState.player.facing
      if (typeof yaw !== 'number') return null
      const quarter = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4
      return [mv.DIR.south, mv.DIR.east, mv.DIR.north, mv.DIR.west][quarter] ?? null
    }),
    /**
      * 그 맵에 **지금** 서 있는 사람들의 칸.
      *
      * ⚠️ **배치표의 자리가 아니다.** 트레이너는 주인공을 보면 **걸어와서** 그
      * 자리에 선다 — 이긴 뒤에도 거기 그대로다. 그래서 `trainersOn`(구운 배치표)로
      * 벽을 세우면 **싸운 뒤부터 틀린다.** 실측(2026-09-22 장막 체육관): 부하 셋과
      * 붙은 뒤 셋째 차기의 설 자리 (2,14)에 못 갔다 — 격자로는 걸을 수 있는 칸인데
      * 게임이 막았고, 계획은 매 바퀴 「한 걸음」을 내고 걸음은 매번 실패해
      * 90바퀴를 섰다
      */
    npcSpots: (mapId) => read('명부를 못 읽었다', async (map) => {
      const m = await import('/src/engine/actor/npcs.ts')
      const reg = m.npcActors
      if (reg.mapId !== map) return null
      return reg.list.filter((a) => a.visible !== false)
        .map((a) => [Math.round(a.x), Math.round(a.z)])
    }, mapId),
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
    /**
     * **둘째 배지 길목의 이야기 변수들.** 번호는 `generated/vars_flags.txt`의
     * `enumValues` 차례다 (줄 번호가 아니다 — 별칭 줄이 섞여 있다).
     *
     *   · 16503 `VAR_JUBILIFE_CITY_STATE`            3 → **4**가 갤럭시단 장면이다
     *   · 16459 `VAR_ETERNA_GYM_FLOWER_CLOCK_STATE`  0 → 1 → 2 → 3
     *   · 16558 `VAR_ETERNA_GYM_TRAINERS_BEATEN`     시계와 나란히 오른다
     *   · 16561 `VAR_ETERNA_FOREST_FOLLOWER_CHERYL_STATE` 0(안 붙음) → 1 → 2
     *
     * ⚠️ **못 읽으면 관측 불가다.** 0으로 접으면 「장면이 안 돌았다」로 잘못 적힌다
     */
    storyVars: () => read('이야기 변수를 못 읽었다', async () => {
      const f = await import('/src/engine/script/field.ts')
      const v = f.fieldScripts.vars
      return {
        jubilife: v.get(16503), clock: v.get(16459),
        beaten: v.get(16558), cheryl: v.get(16561),
        // ⚠️ **동행 플래그는 변수가 아니라 플래그다** (`SYSTEM_FLAG.hasPartner`
        // = 2401). 모미의 회복이 걸린 조건이 이것이라, 「붙었다」를 이 값으로
        // 본다 — 구역 변수(`cheryl`)는 장면이 어디까지 갔나만 말해 준다
        partner: v.checkFlag(2401) === true,
        // 골짜기발전소 (`badges.valleyWindworks`) — 16521 `VAR_VALLEY_WINDWORKS_STATE` 0 → 1(아가씨) → 2(마스) ·
        // 16617 꽃밭 조무래기 · 플래그 159 발전소 열쇠 · 271 문 열림
        windworks: v.get(16521), meadow: v.get(16617),
        worksKey: v.checkFlag(159) === true, windworksDoor: v.checkFlag(271) === true,
        /**
         * **셋째~다섯째 배지 길목** (`docs/orders/JOURNEY_BADGE345_20260922.md` §1).
         * 번호는 같은 셈법이다 — `vars_flags.txt`를 C 열거형으로 세었다.
         *
         *   · 16506 `VAR_ETERNA_CITY_STATE`             0 태홍 → 1 난천(풀베기) → 2 · 쥬피터 뒤 3
         *   · 16660 `VAR_ETERNA_CITY_BLOCK_EXITS_STATE` 자전거만 있고 탐사세트가 없으면 1
         *   · 16524 `VAR_ROUTE_207_COUNTERPART_TRIGGER_STATE` 동행 상대 장면 0 → 1
         *   · 16534 `VAR_MT_CORONET_1F_SOUTH_STATE`     태홍 장면 0 → 1
         *   · 16630 `VAR_HEARTHOME_CITY_STATE`          키라·이어롤 장면 0 → 1
         *   · 16507 `VAR_ROUTE_209_GATE_TO_HEARTHOME_CITY_STATE` 배지 3이면 1 · 라이벌전 뒤 2
         *   · 16499 `VAR_SOLACEON_TOWN_STATE`           라이벌 장면 0 → 1
         *   · 16629 `VAR_VEILSTONE_CITY_CRASHER_WAKE_STATE` 체육관 앞 맥실러 장면 0 → 1
         *   · 16666 `VAR_VEILSTONE_CITY_COUNTERPART_NEEDS_HELP_STATE` 배지 4 뒤 1 → 장면 뒤 2
         *   · 16671 `VAR_VEILSTONE_CITY_GALACTIC_WAREHOUSE_STATE` 창고 태그 배틀 뒤 2
         *   · 16508 `VAR_PASTORIA_CITY_STATE`           창고 뒤 1 → 라이벌전 뒤 2 → 배지 5 뒤 3
         *
         * 플래그 셋은 가방으로도 보이지만 롬이 거는 조건은 이 깃발이라 같이 읽는다 —
         * 121 `FLAG_RECEIVED_EXPLORER_KIT` · 129 `FLAG_TEAM_GALACTIC_LEFT_ETERNA_BUILDING` ·
         * 130 `FLAG_RECEIVED_BICYCLE`
         */
        eterna: v.get(16506), eternaExits: v.get(16660), route207: v.get(16524),
        coronet: v.get(16534), hearthome: v.get(16630), gate209: v.get(16507),
        solaceon: v.get(16499), wake: v.get(16629), help: v.get(16666),
        warehouse: v.get(16671), pastoria: v.get(16508),
        explorerKit: v.checkFlag(121) === true,
        galacticLeft: v.checkFlag(129) === true,
        bicycle: v.checkFlag(130) === true,
        /**
         * **여섯째·일곱째 배지 길목** (`docs/orders/JOURNEY_BADGE67_20260924.md` §2.1).
         * 같은 셈법이고, 스물아홉 개를 롬 목록으로 다시 세어 맞췄다(2026-09-24).
         *
         *   · 16500 `VAR_CELESTIC_TOWN_STATE`   태홍을 이기면 1 → 동굴을 나서면 2
         *   · 16625 `VAR_CELESTIC_TOWN_ELDER_STATE` 장로 좌표 장면 0 → 1
         *   · 16645 `VAR_ROUTE_218_GATE_TO_CANALAVE_CITY_STATE` 연구원 장면 0 → 1
         *   · 16504 `VAR_CANALAVE_CITY_STATE`   다리 1 → 배지 6 2 → 3 → 도서관 4 → 5
         *   · 16562 `VAR_CANALAVE_LIBRARY_STATE` 1 → 폭발 뒤 2
         *   · 16535 `VAR_LAKE_VERITY_PROF_ROWAN_STATE` 진실호수에 들어서면 1
         *   · 16552 `VAR_ROUTE_217_STATE` · 16516 `VAR_ACUITY_LAKEFRONT_STATE` 대사 장면 0 → 1
         */
        gruntEast: v.checkFlag(258) === true, gruntTalked: v.checkFlag(259) === true,
        grunt213: v.checkFlag(280) === true, grunt213Left: v.checkFlag(260) === true,
        valorGrunt: v.checkFlag(262) === true, psyduck: v.checkFlag(263) === true,
        charm: v.checkFlag(166) === true, painting: v.checkFlag(167) === true,
        blockade218: v.checkFlag(665) === true,
        celestic: v.get(16500), celesticElder: v.get(16625), gate218: v.get(16645),
        canalave: v.get(16504), library: v.get(16562),
        valorExploded: v.checkFlag(168) === true, saturn: v.checkFlag(318) === true,
        verityRowan: v.get(16535), verityLeft: v.checkFlag(186) === true,
        coronetOpen: v.checkFlag(666) === true,
        route217: v.get(16552), acuityFront: v.get(16516),
        byronTm: v.checkFlag(146) === true, candiceTm: v.checkFlag(158) === true,
        /**
         * **배지 7 뒤 → 깨어진 세계** (`JOURNEY_DISTORTION` §2 — 번호 셈은 배지 6·7 문서와 같다)
         *   · 16595 `VAR_LAKE_ACUITY_STATE` 1 → 예지호수 장면 2 · 깃발 547 장막 그런트 숨김(장면이 푼다)
         *   · 16671 `VAR_VEILSTONE_CITY_GALACTIC_WAREHOUSE_STATE` 핸섬 「예」 3 → 창고 문 4
         *   · 깃발 1251 갤럭시단의열쇠 · 16526 홀 연설 · 16598 4F 태홍(마스터볼) · 깃발 173 새턴 · 2429 호수 셋 해방
         *   · 16553 `VAR_MT_CORONET_2F_STATE` 버튼 1 → 핸섬 2 · 16536 `VAR_SPEAR_PILLAR_STATE` 0 → 1 → 2 → 3
         *   · 16579 깨진 창기둥 · 16469 `VAR_DISTORTION_WORLD_PROGRESS` 0 … 14 · 깃발 289 기라티나를 잡았다
         *   · 16554 `VAR_EXITED_DISTORTION_WORLD_STATE` 포털 1 → 송별의 샘 **2**(끝) · 깃발 1175 비전머신08
         */
        hm08: v.checkFlag(1175) === true, acuity: v.get(16595), stashGrunt: v.checkFlag(547) === true,
        galacticKey: v.checkFlag(1251) === true, hall: v.get(16526),
        hq4f: v.get(16598), hqSaturn: v.checkFlag(173) === true, freed: v.checkFlag(2429) === true,
        coronet2f: v.get(16553), spear: v.get(16536), spearDistorted: v.get(16579),
        distortion: v.get(16469), giratinaCaught: v.checkFlag(289) === true, exitedDistortion: v.get(16554),
        /**
         * **송별의 샘 → 명예의 전당** (`JOURNEY_LEAGUE` §2 — 같은 셈법으로 `vars_flags.txt`를 세었다)
         *   · 16550 `VAR_SANDGEM_TOWN_LAB_STATE` 송별의 샘 2 → 연구소 장면 3 · 16658 입지호수근처 막음 풀림 1
         *   · 16510 `VAR_SUNYSHORE_CITY_STATE` 대엽 장면 1 → 전진 2 → 비전머신07 3 · 깃발 354 전진이 체육관으로
         *   · 깃발 569 대엽 숨김(문에서 비켰다) · 깃발 154 비전머신07
         *   · 16623 `VAR_RIVAL_BEAT_SUNYSHORE_GYM` 북 센터 라이벌전 1 · 깃발 175 문지기 비킴
         *   · 깃발 176~179 사천왕 · 180 난천 · 2404 `FLAG_GAME_COMPLETED` · 16655 집 엔딩 뒤 1
         */
        sandgemLab: v.get(16550), valorOpen: v.get(16658), sunyshore: v.get(16510),
        volknerBack: v.checkFlag(354) === true, flintAway: v.checkFlag(569) === true, hm07: v.checkFlag(154) === true,
        rivalLeague: v.get(16623), guardMoved: v.checkFlag(175) === true,
        aaron: v.checkFlag(176) === true, bertha: v.checkFlag(177) === true, flint: v.checkFlag(178) === true,
        lucian: v.checkFlag(179) === true, cynthia: v.checkFlag(180) === true,
        gameCompleted: v.checkFlag(2404) === true, housePostgame: v.get(16655),
      }
    }),
    /**
     * **주인공이 지금 무엇을 타고 있나** — 파도타기·괴력(밀 수 있는가)·자전거.
     * 게임이 판정에 쓰는 그 값들이다(`worldState.player`). 읽기만 한다
     */
    fieldState: () => read('주인공 상태를 못 읽었다', async () => {
      const st = await import('/src/state/worldState.ts')
      const p = st.worldState.player
      return { surfing: p.surfing === true, strength: p.strength === true, cycling: p.cycling === true }
    }),
    /**
     * **공중날기 화면 커서의 출발 칸과 목표 칸** (`ui/menu/FlyScreen`).
     *
     * 화면은 열릴 때 커서를 **주인공이 있는 블록**에 두고(`FlyScreen.playerBlock` — 원작 `TownMap_Init`),
     * 방향키 한 번에 한 칸씩 옮긴다. 커서 자체는 화면 안의 상태라 밖에서 못 읽는다 — 그래서
     * 제품이 내보낸 출발 칸을 **읽어서** 몇 칸 누를지 셈한다. 날았는지는 부르는 쪽이 맵으로 본다.
     *
     * ⚠️ **예전에는 「열린 첫 자리」에서 셌다** — 제품이 원작대로 주인공 블록으로 바뀐 뒤 어긋났다.
     * 실측(2026-10-10 P4 진단 · ec149bb): 예지호수에서 장막시티로 날다 커서가 엉뚱한 칸에 서 120초를 버렸다
     */
    flyPlan: (map) => read('타운맵을 못 읽었다', async (target) => {
      const t = await import('/src/engine/map/townMap.ts')
      const save = await import('/src/state/saveStore.ts')
      const fly = await import('/src/ui/menu/FlyScreen.tsx')
      const spawns = await import('/src/engine/map/spawns.ts')
      const field = await import('/src/engine/script/field.ts')
      const lit = save.useSaveStore.getState().flySpots
      // 열렸는가도 화면과 같은 셈이다 — 깃발로 여는 자리가 있다 (`flySpotOpen`)
      const isOpen = (spawn) => spawns.flySpotOpen(spawn, lit, (f) => field.fieldScripts.vars.checkFlag(f))
      const open = fly.playerBlock()
      const spot = t.FLY_SPOTS.find((one) => one.map === target) ?? null
      return {
        from: open === null ? null : { x: open.x, z: open.z },
        to: spot === null ? null : { x: spot.x, z: spot.z },
        unlocked: spot !== null && isOpen(spot.spawn),
      }
    }, map),
    /**
     * **자전거를 타고 있는가.** 게임의 `CheckPlayerOnBike`가 읽는 그 값이다
     * (`scene/fieldServices`의 `bike.riding` = `worldState.player.cycling`).
     *
     * ⚠️ **가방으로는 못 잰다.** 자전거는 열쇠도구라 써도 개수가 안 줄고, 206번도로
     * 게이트가 보는 것은 가진 것이 아니라 **타고 있는 것**이다
     */
    riding: () => read('자전거 상태를 못 읽었다', async () => {
      const st = await import('/src/state/worldState.ts')
      return st.worldState.player.cycling === true
    }),
    /**
     * **연고 체육관 문 고르기의 답.** 제품이 들어설 때 뽑아 든 것을 **읽는다**
     * (`scene/hearthomeGym.ts`의 `hearthomePuzzle`).
     *
     * ⚠️ **사람은 이 값을 볼 길이 없다** — 힌트 그림이 아직 없다
     * (`JOURNEY_BADGE3` §5 ①). 그래서 이 읽기로 통과한 판은 「게임이 이어진다」지
     * 「사람이 할 수 있다」가 아니다. 그 사실은 부르는 쪽이 결과에 적는다
     */
    hearthomeDoor: () => read('연고 문 답을 못 읽었다', async () => {
      const g = await import('/src/scene/hearthomeGym.ts')
      const p = g.hearthomePuzzle()
      return p === null ? null : { room: p.room, door: p.correctDoor, clue: { x: p.clueX, z: p.clueZ } }
    }),
    /**
     * **장막 체육관의 지금 자리** — 샌드백 아홉과 아직 선 타이어, 미끄러지는 중인가.
     *
     * ⚠️ **타이어 목록은 제품이 따로 안 내놓는다.** 그래서 **빼서** 얻는다:
     * `veilstoneBlockedAt`이 참인 칸은 「샌드백 아니면 타이어」이고, 샌드백은
     * `veilstoneBagAt`으로 아홉을 알 수 있으니 그 차가 타이어다. 여기서 표를
     * 다시 세지 않는다는 뜻이다 (`two-bakers-must-match`)
     */
    veilstoneState: () => read('장막 체육관 상태를 못 읽었다', async () => {
      const v = await import('/src/scene/veilstoneGym.ts')
      const bags = []
      for (let i = 0; i < 9; i++) {
        const at = v.veilstoneBagAt(i)
        if (at !== null) bags.push([at[0], at[1]])
      }
      if (bags.length === 0) return null
      const solid = []
      for (let z = 0; z < 32; z++) {
        for (let x = 0; x < 32; x++) if (v.veilstoneBlockedAt(x, z) === true) solid.push([x, z])
      }
      const isBag = (x, z) => bags.some(([bx, bz]) => bx === x && bz === z)
      return {
        bags,
        stacks: solid.filter(([x, z]) => !isBag(x, z)).map(([x, z]) => `${x},${z}`),
        busy: v.veilstoneBusy(),
      }
    }),
    /**
     * **지금 막힌 칸** — 제품이 장치까지 얹어 내는 그 답이다
     * (`scene/mapFeatureCollision`의 `featureBlocked`를 `mapFeatureBridge`로 부른다).
     *
     * ⚠️ **`pastoriaBlocked`만 보면 445칸이 빈다** — 들판시티 물(`0x59`)은 장치 표가
     * 아니라 **엔진 규칙**(구운 높이 vs 높이판)으로 막힌다. 그래서 우리가 규칙을
     * 다시 쓰지 않고 **제품에게 통째로 묻는다**
     *
     * @param box `{ x0, z0, x1, z1 }` 훑을 네모. 방 하나 크기로 준다
     */
    featureWalls: (box) => read('장치 벽을 못 읽었다', async (b) => {
      const mf = await import('/src/engine/world/mapFeatures.ts')
      const zone = await import('/src/engine/map/zone.ts')
      const st = await import('/src/state/worldState.ts')
      const ask = mf.mapFeatureBridge.blocked
      if (typeof ask !== 'function') return null
      const grid = zone.activeZone.grid
      const y = st.worldState.player.position.y
      const out = []
      for (let z = b.z0; z <= b.z1; z++) {
        for (let x = b.x0; x <= b.x1; x++) {
          if (grid?.isBlocked(x, z) === true || ask(x, z, y) === true) out.push(`${x},${z}`)
        }
      }
      return out
    }, box),
    /**
     * **지금 자리에서 걸어 닿는 칸과, 높이 단차로 막힌 걸음** — 제품 규칙 그대로다.
     *
     * 격자 · 장치 벽(`featureWalls`와 같은 물음)에 더해 **`stepTooHigh`**(`actor/player` ·
     * 원작 `GetVerticalDirection` — 갈 칸 바닥이 지금 높이와 1.25칸 넘게 다르면 막는다)를
     * 지금 높이에서 칸마다 굴려 넓힌다. 높이는 칸을 옮길 때마다 그 칸 바닥으로 바뀐다.
     * 격자만 보는 플래너는 들판 체육관 물 0에서 2칸 낙차를 허공으로 건넜다
     * (2026-10-13 연쇄 칸 5)
     *
     * @param box `{ x0, z0, x1, z1 }`
     * @returns `{ reach: ['x,z', …], bans: ['x,z,키', …] }` — 금지는 「들어설 칸 · 방향키」다
     */
    stepEdges: (box) => read('단차를 못 읽었다', async (b) => {
      const mf = await import('/src/engine/world/mapFeatures.ts')
      const zone = await import('/src/engine/map/zone.ts')
      const st = await import('/src/state/worldState.ts')
      const pl = await import('/src/engine/actor/player.ts')
      const ask = mf.mapFeatureBridge.blocked
      const grid = zone.activeZone.grid
      if (grid === null || grid === undefined || typeof pl.stepTooHigh !== 'function') return null
      const p = st.worldState.player.position
      const sx = Math.floor(p.x)
      const sz = Math.floor(p.z)
      const seen = new Map([[`${sx},${sz}`, p.y]])
      const queue = [[sx, sz, p.y]]
      const bans = new Set()
      const STEPS = [[0, -1, 'ArrowUp'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight']]
      for (let head = 0; head < queue.length && head < 20000; head++) {
        const [x, z, y] = queue[head]
        for (const [dx, dz, key] of STEPS) {
          const nx = x + dx
          const nz = z + dz
          if (nx < b.x0 || nx > b.x1 || nz < b.z0 || nz > b.z1) continue
          if (grid.isBlocked(nx, nz) === true) continue
          if (typeof ask === 'function' && ask(nx, nz, y) === true) continue
          if (pl.stepTooHigh(grid, nx + 0.5, nz + 0.5, y)) { bans.add(`${nx},${nz},${key}`); continue }
          const k = `${nx},${nz}`
          if (seen.has(k)) continue
          const ny = grid.heightAtWorld(nx + 0.5, nz + 0.5, y) ?? y
          seen.set(k, ny)
          queue.push([nx, nz, ny])
        }
      }
      return { reach: [...seen.keys()], bans: [...bans] }
    }, box),
    /**
     * **층까지 보고 걷는 길** — 격자 플래너가 낸 칸 줄(`path`)에서 지금 자리로부터 실제로 닿는
     * **가장 먼 칸**까지의 방향키.
     *
     * 걸음 규칙은 `stepEdges`와 같이 전부 제품 것이다. 상태가 (칸, 높이)라 다리 위와 밑을 가른다.
     * 실측(2026-10-13 mac 칸 10): 천관산 2F(208)는 거동값이 전부 바닥(0x08)이라 `deckLayer`가
     * 못 거는 통나무 다리가 둘이다 — (7~8,36~38) 남북 · (15~23,28~30) 동서, 위 높이 3 · 밑 1.
     * 격자 플래너는 옆(높이 3)에서 다리 **위**로 올라 북으로 내려서려 했고 제품이 단차로 막았다.
     * 맞는 길은 높이 2 길로 돌아 다리 **밑**(1)을 지나는 것이다(두 입구 어디서나 485칸 · C(7,23) 닿음)
     *
     * @param arg `{ path: [[x, z], …] }` — 격자 플래너가 낸 칸 줄 (지금 칸 다음부터)
     * @returns `{ keys, reached, of, states }` · 하나도 못 닿으면 `keys`가 null
     */
    layeredKeys: (arg) => read('층 걸음을 못 읽었다', async (a) => {
      const mf = await import('/src/engine/world/mapFeatures.ts')
      const zone = await import('/src/engine/map/zone.ts')
      const st = await import('/src/state/worldState.ts')
      const pl = await import('/src/engine/actor/player.ts')
      const ask = mf.mapFeatureBridge.blocked
      const grid = zone.activeZone.grid
      if (grid === null || grid === undefined || typeof pl.stepTooHigh !== 'function') return null
      const want = new Map((a.path ?? []).map(([x, z], i) => [`${x},${z}`, i]))
      const p = st.worldState.player.position
      const sx = Math.floor(p.x)
      const sz = Math.floor(p.z)
      const id = (x, z, y) => `${x},${z},${Math.round(y * 4)}`
      const start = id(sx, sz, p.y)
      const prev = new Map([[start, null]])
      const queue = [[sx, sz, p.y, start]]
      const STEPS = [[0, -1, 'ArrowUp'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [1, 0, 'ArrowRight']]
      let best = null
      /**
       * **목표 칸을 주면 락클라임까지 타고 그 칸으로 곧장 푼다** (`a.goal`). 격자 계획이 고른 바위가 막다른 아래층으로
       * 내려가는 판이 있다 — 실측(2026-10-13 mac 칸 15): 챔피언로드 1F 계단 옆 (4,38)로 가는 계획이 (18,64) 바위를 내려가
       * −3 층 막다른 띠에 섰다. 맞는 길은 높이 1 다리를 건너 (36,49) 바위를 내려가는 106걸음이다. 바위 한 번은
       * `climb:<방향키>` 하나로 내고(`walk`가 거기서 끊고 탄다), 내린 자리는 그 칸의 두 바닥(위 · 아래) 중 닿는 쪽이다
       */
      const goal = a.goal ?? null
      /**
       * ⚠️ **서 있는 사람도 벽이다** (`solidNpcAt`). 사람을 정면으로 뚫고 지나가던 것을 고친 뒤(REPAIR §164) 처음
       * 드러났다 — 실측(2026-10-19 진단 `c39bd941` 칸 21): 챔피언로드 1F 계단 (4,37)로 가는 층 걸음이 (10,42)에 선
       * 엘리트 트레이너 마리아를 그대로 지나는 길을 내 (10,43)에서 15분을 밀었다. 그 칸이 목표면 비워 둔다
       */
      const npcs = await import('/src/engine/actor/npcs.ts')
      const people = new Set(npcs.npcActors.list.filter((n) => n.visible)
        .map((n) => `${String(Math.round(n.x))},${String(Math.round(n.z))}`))
      if (goal !== null) people.delete(`${String(goal.x)},${String(goal.z)}`)
      const CLIMB = { 0x4b: 'ns', 0x4c: 'ew' }
      for (let head = 0; head < queue.length && head < 200000; head++) {
        const [x, z, y, k] = queue[head]
        if (goal !== null && best !== null) break
        for (const [dx, dz, key] of STEPS) {
          const nx = x + dx
          const nz = z + dz
          if (goal !== null) {
            const beh = (grid.behavior?.(nx, nz) ?? 0) & 0x7fff
            const axis = CLIMB[beh]
            if ((axis === 'ns' && dz !== 0) || (axis === 'ew' && dx !== 0)) {
              let ex = nx
              let ez = nz
              while (((grid.behavior(ex + dx, ez + dz) ?? 0) & 0x7fff) === beh) { ex += dx; ez += dz }
              const lx = ex + dx
              const lz = ez + dz
              if (grid.isBlocked(lx, lz) === true) continue
              for (const yy of [y - 20, y + 20]) {
                const ly = grid.heightAtWorld(lx + 0.5, lz + 0.5, yy)
                if (ly === null || ly === undefined) continue
                const lk = id(lx, lz, ly)
                if (prev.has(lk)) continue
                prev.set(lk, [k, `climb:${key}`])
                queue.push([lx, lz, ly, lk])
                if (lx === goal.x && lz === goal.z && best === null) best = { at: 0, k: lk }
              }
              continue
            }
          }
          if (grid.isBlocked(nx, nz) === true) continue
          if (people.has(`${String(nx)},${String(nz)}`)) continue
          if (typeof ask === 'function' && ask(nx, nz, y) === true) continue
          if (pl.stepTooHigh(grid, nx + 0.5, nz + 0.5, y)) continue
          const ny = grid.heightAtWorld(nx + 0.5, nz + 0.5, y) ?? y
          const nk = id(nx, nz, ny)
          if (prev.has(nk)) continue
          prev.set(nk, [k, key])
          queue.push([nx, nz, ny, nk])
          if (goal !== null) {
            if (nx === goal.x && nz === goal.z && best === null) best = { at: 0, k: nk }
            continue
          }
          const at = want.get(`${nx},${nz}`)
          if (at !== undefined && (best === null || at > best.at)) best = { at, k: nk }
        }
      }
      if (best === null) return { keys: null, reached: -1, of: a.path?.length ?? 0, states: prev.size }
      const keys = []
      for (let k = best.k; prev.get(k) !== null; k = prev.get(k)[0]) keys.unshift(prev.get(k)[1])
      return { keys, reached: best.at, of: a.path?.length ?? 0, states: prev.size }
    }, arg),
    /**
     * **들판 체육관 — 단추 차례를 푼다** (칸 · 높이 · 물 높이를 한 상태로 보는 넓이 우선).
     *
     * 걸음 규칙은 전부 제품 것이다: 격자 벽 · 장치 벽(`mapFeatureBridge.blocked`) ·
     * 단차(`stepTooHigh`) · 바닥 높이(`heightAtWorld`). 물 높이 셋의 걸음표를 만들려고
     * 물을 **실제로** 옮긴다(`pressPastoriaButton` + `pastoriaTick`) — 그래서 이 계산은
     * import 뒤 **한 동기 구간**에서 끝내고 원래 단추로 되돌린다. 프레임이 끼어들 틈이
     * 없어 화면 · 세이브에는 안 남는다. 소리는 그동안 끈다.
     *
     * 욕심 풀이(가까운 단추부터)는 물 2에서 닿는 새 단추가 없어 섰다 (2026-10-13 연쇄 칸 5).
     * 실제로는 아홉 번쯤 눌러야 맥실러 앞에 닿는다
     *
     * @param arg `{ box, goal: {x,z}, buttons: [{x,z,water}], guards: ['x,z', …] }`
     * @returns `{ presses: [{x,z,water}], len }` · 못 닿으면 `{ presses: null, states }`
     */
    pastoriaPlan: (arg) => read('들판 풀이를 못 돌렸다', async (a) => {
      const mf = await import('/src/engine/world/mapFeatures.ts')
      const zone = await import('/src/engine/map/zone.ts')
      const st = await import('/src/state/worldState.ts')
      const pl = await import('/src/engine/actor/player.ts')
      const w = await import('/src/engine/world/pastoriaGym.ts')
      const g = await import('/src/scene/pastoriaGym.ts')
      const ask = mf.mapFeatureBridge.blocked
      const grid = zone.activeZone.grid
      if (grid === null || grid === undefined || typeof pl.stepTooHigh !== 'function') return null
      if (g.pastoriaBusy()) return null
      const pressed0 = g.pastoriaPressed()
      const water0 = g.pastoriaWaterHeight()
      if (pressed0 === null || water0 === null) return null
      const M = w.PASTORIA_BUTTON_MODEL
      const modelOf = (button) => [M.blue, M.green, M.orange].find((m) => w.pastoriaButtonOf(m) === button)
      const modelFor = (water) => [M.blue, M.green, M.orange].find((m) => w.pastoriaWaterFor(w.pastoriaButtonOf(m)) === water)
      const settle = () => { for (let i = 0; i < 400 && g.pastoriaBusy(); i++) g.pastoriaTick(1 / 30) }
      const guards = new Set(a.guards ?? [])
      const b = a.box
      const rq = (y) => Math.round(y * 8)
      const STEPS = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      const levels = [...new Set(a.buttons.map((one) => one.water))]
      const p = st.worldState.player.position
      // ── 동기 구간: 물을 옮겨 가며 걸음 함수를 굳힌다 ──
      const sound = g.pastoriaSound.play
      g.pastoriaSound.play = null
      const stepsAt = new Map()
      const floorAt = new Map()
      try {
        for (const lv of levels) {
          g.pressPastoriaButton(modelFor(lv)); settle()
          if (g.pastoriaWaterHeight() !== lv) return null
          // 그 물에서 (칸, 바닥 높이)마다 갈 수 있는 이웃
          const edges = new Map()
          for (let x = b.x0; x <= b.x1; x++) {
            for (let z = b.z0; z <= b.z1; z++) {
              for (let near = -1; near <= 6; near += 0.5) {
                const y = grid.heightAtWorld(x + 0.5, z + 0.5, near)
                if (y === null || y === undefined) continue
                const k = `${x},${z},${rq(y)}`
                if (edges.has(k)) continue
                const nb = []
                for (const [dx, dz] of STEPS) {
                  const nx = x + dx
                  const nz = z + dz
                  if (nx < b.x0 || nx > b.x1 || nz < b.z0 || nz > b.z1) continue
                  if (grid.isBlocked(nx, nz) === true || guards.has(`${nx},${nz}`)) continue
                  if (typeof ask === 'function' && ask(nx, nz, y) === true) continue
                  if (pl.stepTooHigh(grid, nx + 0.5, nz + 0.5, y)) continue
                  nb.push([nx, nz, grid.heightAtWorld(nx + 0.5, nz + 0.5, y) ?? y])
                }
                edges.set(k, nb)
              }
            }
          }
          stepsAt.set(lv, edges)
          // 단추를 밟아 물이 바뀌면 선 칸의 높이가 따라 바뀔 수 있다 — 그 물에서 바닥 층들을 읽어 둔다
          const fl = new Map()
          for (const one of a.buttons) {
            const ys = new Set()
            for (let near = -1; near <= 6; near += 0.5) {
              const y = grid.heightAtWorld(one.x + 0.5, one.z + 0.5, near)
              if (y !== null && y !== undefined) ys.add(y)
            }
            fl.set(`${one.x},${one.z}`, [...ys])
          }
          floorAt.set(lv, fl)
        }
      } finally {
        g.pressPastoriaButton(modelOf(pressed0)); settle()
        g.pastoriaSound.play = sound
      }
      if (g.pastoriaWaterHeight() !== water0 || g.pastoriaPressed() !== pressed0) return { restored: false }
      // ── 넓이 우선: (x, z, 높이, 물) ──
      const btn = new Map(a.buttons.map((one) => [`${one.x},${one.z}`, one.water]))
      const sx = Math.floor(p.x)
      const sz = Math.floor(p.z)
      const key = (s) => `${s[0]},${s[1]},${rq(s[2])},${s[3]}`
      const start = [sx, sz, grid.heightAtWorld(sx + 0.5, sz + 0.5, p.y) ?? p.y, water0]
      const prev = new Map([[key(start), null]])
      const queue = [start]
      let found = null
      for (let head = 0; head < queue.length && head < 200000; head++) {
        const cur = queue[head]
        const [x, z, y, wl] = cur
        if (x === a.goal.x && z === a.goal.z) { found = cur; break }
        const to = btn.get(`${x},${z}`)
        if (to !== undefined && to !== wl) {
          const ys = floorAt.get(to)?.get(`${x},${z}`) ?? []
          const ny = ys.reduce((best, one) => (Math.abs(one - y) < Math.abs(best - y) ? one : best), ys[0] ?? y)
          const n = [x, z, ny, to]
          if (!prev.has(key(n))) { prev.set(key(n), cur); queue.push(n) }
          // 단추 칸은 밟으면 눌린다 — 안 누르고 지나가는 걸음은 없다
          continue
        }
        const nbs = stepsAt.get(wl)?.get(`${x},${z},${rq(y)}`) ?? []
        for (const [nx, nz, ny] of nbs) {
          const n = [nx, nz, ny, wl]
          if (prev.has(key(n))) continue
          prev.set(key(n), cur)
          queue.push(n)
        }
      }
      if (found === null) return { presses: null, states: prev.size }
      const path = []
      for (let c = found; c !== null; c = prev.get(key(c))) path.push(c)
      path.reverse()
      const presses = []
      for (let i = 1; i < path.length; i++) {
        if (path[i][3] !== path[i - 1][3]) presses.push({ x: path[i][0], z: path[i][1], water: path[i][3] })
      }
      return { presses, len: path.length }
    }, arg),
    /**
     * **장막 체육관 풀이를 페이지 안에서 돌린다.**
     *
     * ⚠️ **탐색은 여기서 안 한다** — `tools/e2e/gymSolve.mjs`가 하고, 그것이 쓰는
     * 표와 규칙은 **제품 모듈**에서 온다(`veilstoneTravel`·`VEILSTONE_STEP`…).
     * 같은 파일을 단위 시험도 그대로 부르므로 **굽는 쪽이 하나**다.
     *
     * 페이지 안에서 도는 까닭은 `veilstoneTravel`이 제품 TS라 node 쪽에서 못 부르기
     * 때문이다. 벽은 닫힘을 못 넘기므로 **칸 목록**으로 받아 안에서 다시 묶는다
     *
     * @param arg `{ start, goal, wall: ['x,z', …], stacks: ['x,z', …], cap }`
     */
    veilstonePlan: (arg) => read('장막 풀이를 못 돌렸다', async (a) => {
      const g = await import('/src/engine/world/veilstoneGym.ts')
      const v = await import('/src/scene/veilstoneGym.ts')
      const s = await import('/tools/e2e/gymSolve.mjs')
      const bags = []
      for (let i = 0; i < 9; i++) {
        const at = v.veilstoneBagAt(i)
        if (at !== null) bags.push([at[0], at[1]])
      }
      if (bags.length === 0) return null
      const wall = new Set(a.wall)
      return s.solveVeilstone({
        start: a.start, goal: a.goal, bags, stacks: a.stacks,
        wall: (x, z) => wall.has(`${x},${z}`),
        travel: g.veilstoneTravel, step: g.VEILSTONE_STEP,
        tireFlag: g.VEILSTONE_FLAG.tireStack, key: g.veilstoneKey,
        cap: a.cap ?? 40000,
      })
    }, arg),
    /**
     * **운하 체육관 — 판 풀이** (`gymSolve67.solveCanalave`). 판의 지금 자리·층 통행표·
     * 사람이 선 칸을 **제품에서 읽어** 페이지 안에서 푼다(굽는 쪽이 하나).
     *
     * @param goal `{x, z, floor}`
     */
    canalavePlan: (goal) => read('운하 풀이를 못 돌렸다', async (g) => {
      const w = await import('/src/engine/world/canalaveGym.ts')
      const sc = await import('/src/scene/canalaveGym.ts')
      const st = await import('/src/state/worldState.ts')
      const n = await import('/src/engine/actor/npcs.ts')
      const s = await import('/tools/e2e/gymSolve67.mjs')
      let bits = 0
      for (let i = 0; i < w.CANALAVE_PLATFORMS.length; i++) {
        const t = sc.canalavePlatformTile(i)
        if (t === null) return null
        const b = w.CANALAVE_PLATFORMS[i].b
        if (t[0] === b[0] && t[1] === b[1] && t[2] === b[2]) bits |= 1 << i
      }
      const p = st.worldState.player.position
      const floor = w.canalaveFloorAt(p.y)
      const people = n.npcActors.list.filter((a) => a.visible)
        .map((a) => ({ x: Math.round(a.x), z: Math.round(a.z), floor: w.canalaveFloorAt(a.y) }))
      const blocked = (f, x, z) => w.canalaveBlocked(f * w.CANALAVE_FLOOR_HEIGHT, x, z)
        || people.some((q) => q.floor === f && q.x === x && q.z === z)
      const start = { x: Math.floor(p.x), z: Math.floor(p.z), floor }
      const plan = s.solveCanalave({ start, states: bits, platforms: w.CANALAVE_PLATFORMS, blocked, goal: g })
      return { start, bits, plan }
    }, goal),
    /** 운하 체육관 — 판이 움직이는 중인가 · 주인공 층 */
    canalaveState: () => read('운하 체육관 상태를 못 읽었다', async () => {
      const w = await import('/src/engine/world/canalaveGym.ts')
      const sc = await import('/src/scene/canalaveGym.ts')
      const st = await import('/src/state/worldState.ts')
      const p = st.worldState.player.position
      return {
        busy: sc.canalaveBusy(), floor: w.canalaveFloorAt(p.y), x: Math.floor(p.x), z: Math.floor(p.z),
        // 추적용 원시 값 — 판이 사람을 들고 가는지 가를 때 쓴다
        px: +p.x.toFixed(2), py: +p.y.toFixed(2), pz: +p.z.toFixed(2), riding: st.worldState.player.riding === true,
      }
    }),
    /**
     * **물가 체육관 — 톱니 풀이** (`gymSolve8.solveSunyshore`). 방·회전 상태·막힌 상자·단추 규칙은
     * **제품의 그 함수들로** 읽고, 격자와 선 사람은 지금 것을 읽는다.
     *
     * @param arg `{ goal: [[x, z], …], buttons: [{x, z, button}] }` — 단추 칸은 구운 좌표 이벤트에서
     *   부르는 쪽이 읽어 넘긴다(스크립트 번호 → 단추 종류만 하네스가 안다)
     */
    sunyshorePlan: (arg) => read('물가 풀이를 못 돌렸다', async (a) => {
      const g = await import('/src/engine/world/sunyshoreGym.ts')
      const sc = await import('/src/scene/sunyshoreGym.ts')
      const W = await import('/src/engine/map/world.ts')
      const z = await import('/src/engine/map/zone.ts')
      const st = await import('/src/state/worldState.ts')
      const n = await import('/src/engine/actor/npcs.ts')
      const s = await import('/tools/e2e/gymSolve8.mjs')
      const room = g.sunyshoreRoomOf(W.world.mapId)
      const state = sc.sunyshoreState()
      const grid = z.activeZone.grid
      if (room === null || state === null || !grid) return null
      const p = st.worldState.player.position
      const people = new Set(n.npcActors.list.filter((q) => q.visible).map((q) => `${Math.round(q.x)},${Math.round(q.z)}`))
      const blocked = (sx, x, zz) => grid.isBlocked(x, zz) || people.has(`${x},${zz}`) || g.sunyshoreBlocked(room, sx, x, zz) === true
      const buttons = new Map(a.buttons.map((b) => [`${b.x},${b.z}`, b.button]))
      const goalSet = new Set(a.goal.map(([x, zz]) => `${x},${zz}`))
      const start = { x: Math.floor(p.x), z: Math.floor(p.z) }
      /**
       * ⚠️ **단차도 막는다** — 방마다 계단이 있다. 실측(2026-10-13 mac 칸 13): 155번 방 (4,16)은 높이 1,
       * 옆 (3,16)은 높이 4다(x 1~3이 z 21→16으로 오르는 계단). 풀이가 높이를 몰라 옆으로 곧장 건너려 했고
       * 제품이 단차로 막아 세 판을 40바퀴씩 되밀렸다. 칸 바닥 높이는 지금 높이 근처 층으로 읽는다(한 층 방)
       */
      const pl = await import('/src/engine/actor/player.ts')
      // ⚠️ **바닥이 없는 칸은 묻지 않는다** — 톱니 다리가 아직 안 온 자리다(지금 회전 상태의 판이 없다).
      // 그 칸까지 지금 높이로 막으면 단추를 눌러 다리가 올 길이 통째로 사라진다 — 실측(2026-10-13 mac 칸 14):
      // 셋째 방 관장 단 (11,4) 높이 7에서 옆 (8,4)·(14,4)가 null이라 「길이 없다」로 곧장 끝났다. 그 칸은 `blocked`(톱니 규칙)가 맡는다
      const high = typeof pl.stepTooHigh !== 'function' ? null : (fx, fz, x, zz) => {
        const fy = grid.heightAtWorld(fx + 0.5, fz + 0.5, p.y)
        const ty = grid.heightAtWorld(x + 0.5, zz + 0.5, fy ?? p.y)
        return fy !== null && ty !== null && pl.stepTooHigh(grid, x + 0.5, zz + 0.5, fy)
      }
      // 부르는 쪽이 「제품이 실제로 막았다」고 잰 걸음(그 회전 상태에서) — 높이 표가 지금 상태만 알아 놓치는 자리다
      const ban = new Set(a.ban ?? [])
      /**
       * ⚠️ **지금 회전 상태의 걸음은 제품 규칙 그대로 잰다** — 바닥이 없는 칸(null)을 제품은 높이 0으로 친다(`stepTooHigh`).
       * 다른 상태의 걸음만 너그럽게 둔다(그 상태에선 다리가 올 수 있다). 실측(2026-10-15 최종 연쇄 칸 13): 셋째 방 (6,z) → (7,z)를
       * 풀이가 열린 걸음으로 보고 상태 0 · 2에서 거듭 되밀렸다 — 그 칸은 지금 상태에서 바닥이 없다
       */
      const now = (fx, fz, x, zz) => {
        if (typeof pl.stepTooHigh !== 'function') return false
        const fy = grid.heightAtWorld(fx + 0.5, fz + 0.5, p.y)
        return fy !== null && pl.stepTooHigh(grid, x + 0.5, zz + 0.5, fy)
      }
      const edge = (fx, fz, x, zz, st) => ban.has(`${String(st)}:${String(fx)},${String(fz)}>${String(x)},${String(zz)}`)
        || (st === state ? now(fx, fz, x, zz) : high !== null && high(fx, fz, x, zz))
      const plan = s.solveSunyshore({
        start, state, blocked, buttons, next: g.sunyshoreNextState, goal: (x, zz) => goalSet.has(`${x},${zz}`), edge,
      })
      return { room, state, start, plan }
    }, arg),
    /** 물가 체육관 — 톱니가 도는 중인가 · 회전 상태 */
    sunyshoreState: () => read('물가 체육관 상태를 못 읽었다', async () => {
      const sc = await import('/src/scene/sunyshoreGym.ts')
      const st = await import('/src/state/worldState.ts')
      const p = st.worldState.player.position
      return { state: sc.sunyshoreState(), busy: sc.sunyshoreBusy(), x: Math.floor(p.x), z: Math.floor(p.z) }
    }),
    /**
     * **선단 체육관 — 얼음 풀이** (`gymSolve67.solveSnowpoint`). 얼음 칸·높이·벽·눈덩이·
     * 한쪽 막음 가장자리를 **제품의 그 함수들로** 읽어 푼다. 높이는 주인공이 선 층 근처로
     * 읽는다(`heightAtWorld`의 `near`) — 이 방은 한 층이다.
     *
     * @param goal `[[x, z], …]` 설 칸들 (관장 옆)
     */
    snowpointPlan: (goal) => read('선단 풀이를 못 돌렸다', async (g) => {
      const ice = await import('/src/engine/actor/ice.ts')
      const z = await import('/src/engine/map/zone.ts')
      const eb = await import('/src/engine/actor/edgeBlock.ts')
      const st = await import('/src/state/worldState.ts')
      const n = await import('/src/engine/actor/npcs.ts')
      const s = await import('/tools/e2e/gymSolve67.mjs')
      const grid = z.activeZone.grid
      if (!grid) return null
      const p = st.worldState.player.position
      const view = {
        behaviorAt: (tx, tz) => grid.behavior(tx, tz),
        blockedAt: () => false,
        heightAt: (x, zz) => grid.heightAtWorld(x, zz, p.y) ?? 0,
      }
      const SNOWBALL = 118
      const actors = n.npcActors.list.filter((a) => a.visible)
      const balls = actors.filter((a) => a.gfx === SNOWBALL).map((a) => [Math.round(a.x), Math.round(a.z)])
      const people = new Set(actors.filter((a) => a.gfx !== SNOWBALL).map((a) => `${Math.round(a.x)},${Math.round(a.z)}`))
      const goalSet = new Set(g.map(([x, zz]) => `${x},${zz}`))
      const plan = s.solveSnowpoint({
        start: { x: Math.floor(p.x), z: Math.floor(p.z) }, balls,
        isIce: (x, zz) => ice.isIce(grid.behavior(x, zz)),
        wall: (x, zz) => grid.isBlocked(x, zz) || people.has(`${x},${zz}`),
        edge: (x, zz, dx, dz) => eb.edgeBlocks(grid.behavior(x, zz), grid.behavior(x + dx, zz + dz), dx, dz),
        heightChange: (x, zz, dx, dz) => ice.heightChange(view, x, zz, dx, dz),
        speedAfter: ice.iceSpeedAfter,
        goal: (x, zz) => goalSet.has(`${x},${zz}`),
      })
      return { start: { x: Math.floor(p.x), z: Math.floor(p.z) }, balls: balls.length, plan }
    }, goal),
    /** 선단 체육관 — 미끄러지는 중인가 */
    /**
     * **깨어진 세계 — 지금 자리** (`tools/e2e/DISTORTION_HARNESS.md` §3). 칸은 세계 칸이고 y는
     * `Math.round`다(`scene/distortionCore.ts:114-121`). `busy`는 조작이 묶인 동안이다
     */
    distortionState: () => read('깨어진 세계 상태를 못 읽었다', async () => {
      const core = await import('/src/scene/distortionCore.ts')
      const W = await import('/src/engine/map/world.ts')
      const st = await import('/src/state/worldState.ts')
      const MV = await import('/src/engine/script/movement.ts')
      if (!core.distortionActive()) return null
      const p = st.worldState.player
      const [x, y, z] = core.toWorldTiles(p.position.x, p.position.y, p.position.z)
      const q = W.quarterOf(p.facing)
      return {
        map: W.world.mapId, x, y, z, pi: core.platformIndex(),
        facing: [MV.DIR.south, MV.DIR.east, MV.DIR.north, MV.DIR.west][q],
        surf: p.surfing === true, strength: p.strength === true,
        busy: p.riding === true || p.hop.active === true || W.world.pending !== null,
        progress: core.distortionHooks.progress?.() ?? null,
        raw: { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2) },
      }
    }),
    /**
     * **깨어진 세계 — 다음 할 일의 계획** (`tools/e2e/distortionSolve.mjs` `planNext`). 규칙은 전부
     * 제품 모듈에서 꺼내 넘긴다(굽는 쪽이 하나). 사람·바위는 지금 층의 **살아 있는 배우**로, 다른 층은
     * 표로 본다.
     *
     * @param arg.escape 벽 속에서 시작했으면 안전망으로 나오는 걸음을 먼저 준다(기본 꺼짐, §6-1)
     */
    distortionPlan: (arg) => read('깨어진 세계 풀이를 못 돌렸다', async ({ escape = false } = {}) => {
      const D = await import('/src/engine/world/distortion.ts')
      const E = await import('/src/engine/world/distortionElevator.ts')
      const C = await import('/src/engine/world/distortionCascade.ts')
      const B = await import('/src/engine/world/distortionBoulder.ts')
      const MP = await import('/src/engine/world/distortionMovePlatform.ts')
      const L = await import('/src/engine/actor/ledge.ts')
      const O = await import('/src/engine/actor/obstacles.ts')
      const Z = await import('/src/engine/map/zone.ts')
      const MV = await import('/src/engine/script/movement.ts')
      const F = await import('/src/engine/script/field.ts')
      const W = await import('/src/engine/map/world.ts')
      const WD = await import('/src/scene/worldData.ts')
      const core = await import('/src/scene/distortionCore.ts')
      const st = await import('/src/state/worldState.ts')
      const N = await import('/src/engine/actor/npcs.ts')
      const S = await import('/tools/e2e/distortionSolve.mjs')
      const data = core.distortionData()
      if (data === null || !core.distortionActive()) return null
      // 층 격자 열 벌 — 층을 건너는 길 찾기가 다른 층도 본다. 깨어진 세계는 봉인하지 않는다
      const grids = new Map()
      for (const m of data.maps) {
        const h = W.world.maps?.[m.map]
        if (h !== undefined) grids.set(m.map, await WD.gridFor(h.matrix))
      }
      const map = W.world.mapId
      const floor = D.mapOf(data, map)
      const p = st.worldState.player
      const [x, y, z] = core.toWorldTiles(p.position.x, p.position.y, p.position.z)
      const hooks = core.distortionHooks
      const inPit = new Set([E.DIST_OBJ.b6fMespritBoulderInPit, E.DIST_OBJ.b6fAzelfBoulderInPit,
        E.DIST_OBJ.b6fUxieBoulderInPit])
      const live = N.npcActors.list.filter((a) => a.visible)
      const P = {
        data, STEP: D.STEP, ATTRS_INVALID: D.ATTRS_INVALID, tileAttributes: D.tileAttributes,
        blocked: D.blocked, tileBehavior: D.tileBehavior, findPlatform: D.findPlatform,
        hasPlatformAt: D.hasPlatformAt, jumpAt: D.jumpAt, flagHolds: D.flagHolds,
        connectionOf: D.connectionOf, mapOf: D.mapOf, TELEPORT: D.TELEPORT,
        CYNTHIA_BLOCK: D.CYNTHIA_BLOCK, EVENT_CMD: D.EVENT_CMD, MAP: D.MAP, FLAG_COND: D.FLAG_COND,
        PLATFORM: {
          FLOOR: D.PLATFORM_FLOOR, WEST_WALL: D.PLATFORM_WEST_WALL, EAST_WALL: D.PLATFORM_EAST_WALL,
          CEILING: D.PLATFORM_CEILING, NONE: D.PLATFORM_NONE,
        },
        elevatorAt: E.elevatorAt, elevatorLegs: E.elevatorLegs, upStartFlags: E.upStartFlags,
        downEndFlags: E.downEndFlags, withFlag: E.withFlag, ELEVATOR_DIR: E.ELEVATOR_DIR,
        PLATFORM_FLAG: E.PLATFORM_FLAG, cascadeAt: C.cascadeAt,
        fallLocationAt: B.fallLocationAt, fallDestination: B.fallDestination, fellToB6F: B.fellToB6F,
        fellIntoPit: B.fellIntoPit, fellIntoWrongPit: B.fellIntoWrongPit, puzzleSolved: B.puzzleSolved,
        FALL_DEST: B.FALL_DEST, PUZZLE_FLAG: B.PUZZLE_FLAG, hopDirOf: MP.hopDirOf, HOP_TILES: MP.HOP_TILES,
        distortionJump: L.distortionJump, HOP_TWICE_TILES: L.HOP_TWICE_TILES, ledgeHop: L.ledgeHop,
        isOnWater: Z.isOnWater, isSurfable: Z.isSurfable, DIR_STEP: MV.DIR_STEP,
        STRENGTH_BOULDER: O.STRENGTH_BOULDER, standableSpot: W.standableSpot,
        grid: (m) => grids.get(m) ?? null,
        // 판 밖 지형의 칸 높이 — 제품이 딛는 그 규칙(`player.ts` → `terrainTileY`)
        terrainY: (m, lx, lz) => D.terrainTileY(grids.get(m)?.heightAtWorld(lx + 0.5, lz + 0.5, 1)),
        cynthiaBlocksJump: D.cynthiaBlocksJump,
        initialPlatformFlags: E.initialPlatformFlags,
        // 지금 층만 살아 있는 배우로 답한다. 바위는 `boulders`가 든다
        solidAt: (m, lx, lz) => {
          if (m !== map) return null
          const a = O.solidNpcAt(lx + 0.5, lz + 0.5, p.position.y)
          return a !== null && a.gfx !== O.STRENGTH_BOULDER
        },
        // 판 위의 사람 — 그 사람의 높이로 가른다 (`solidNpcAtHeight`)
        solidAtHeight: (m, lx, ly, lz) => {
          if (m !== map) return null
          return O.solidNpcAtHeight(lx + 0.5, lz + 0.5, ly) !== null
        },
        checkFlag: (flag) => F.fieldScripts.vars.checkFlag(flag),
      }
      const s = core.state()
      const q = W.quarterOf(p.facing)
      let start = {
        map, x, y, z, pi: core.platformIndex(),
        facing: [MV.DIR.south, MV.DIR.east, MV.DIR.north, MV.DIR.west][q],
        surf: p.surfing === true, strength: p.strength === true,
        progress: hooks.progress?.() ?? 0, cyrus: hooks.cyrusAppearance?.() ?? 0,
        flags: s.platformFlags, puzzle: s.puzzleFlags,
        // 높이 계산(판 밖에서만 뜻이 있다)과 그림자 표식 둘 (2478 · 2479)
        hc: core.distortionFollowsGround(),
        anim: (F.fieldScripts.vars.checkFlag(2478) ? 1 : 0) | (F.fieldScripts.vars.checkFlag(2479) ? 2 : 0),
        boulders: live.filter((a) => a.gfx === O.STRENGTH_BOULDER).map((a) => ({
          id: a.localID, x: Math.round(a.x) + floor.offsetX, z: Math.round(a.z) + floor.offsetZ,
          fixed: inPit.has(a.localID),
        })),
      }
      const out = escape ? S.planEscape(P, start) : null
      if (out !== null && out.steps.length > 0) {
        return { start, stage: { kind: 'escape' }, legs: [{ map, steps: out.steps, end: out.end }] }
      }
      const person = (id) => {
        const a = N.npcActors.byLocalID.get(id)
        return a === undefined ? null
          : {
            x: Math.round(a.x) + floor.offsetX, y: Math.round(a.y) + floor.offsetY,
            z: Math.round(a.z) + floor.offsetZ,
          }
      }
      const plan = S.planNext(P, start, person)
      return plan === null ? { start, plan: null } : { start, stage: plan.stage, legs: plan.legs }
    }, arg ?? {}),
    iceState: () => read('얼음 상태를 못 읽었다', async () => {
      const ice = await import('/src/engine/actor/ice.ts')
      const st = await import('/src/state/worldState.ts')
      const p = st.worldState.player.position
      return { sliding: ice.isSliding(), x: Math.floor(p.x), z: Math.floor(p.z) }
    }),
    /** 들판 체육관 — 지금 물 높이와 움직이는 중인가 */
    pastoriaState: () => read('들판 체육관 상태를 못 읽었다', async () => {
      const p = await import('/src/scene/pastoriaGym.ts')
      const h = p.pastoriaWaterHeight()
      return h === null ? null : { water: h, pressed: p.pastoriaPressed(), busy: p.pastoriaBusy() }
    }),
    /**
     * **밟기 판정이 무엇을 봤는가** (`script/field.ts`의 `triggerWatch` · REPAIR §52).
     *
     * 좌표 이벤트가 판마다 다르게 걸리는 자리를 잡으려고 제품이 내놓는 값이다 —
     * 부른 횟수 · 칸이 나온 횟수 · 실제로 건 횟수 · **굶은 까닭** · 최근에 본 칸과
     * 그 답. 여기서 만들어 내는 값은 하나도 없다
     *
     * ⚠️ **판정에 안 쓴다.** 증거로만 적는다 — 「좌표 이벤트가 몇 번 걸렸나」를
     * 통과 조건으로 삼으면 이야기가 아니라 계측을 재게 된다
     */
    triggerWatch: () => read('밟기 계측을 못 읽었다', async () => {
      const f = await import('/src/engine/script/field.ts')
      const w = f.triggerWatch
      return {
        calls: w.calls, stepped: w.stepped, fired: w.fired,
        skipped: { ...w.skipped }, recent: w.recent.slice(-16),
      }
    }),
    /**
     * **지금 열린 가게의 재고 차례.** 줄 번호를 세지 않으려고 읽는다 —
     * 목록은 우리가 정하지 않고 그 자리의 배지 수가 정한다
     * (`engine/bag/mart.ts`의 `PokeMartCommon`)
     */
    shopStock: () => read('상점 재고를 못 읽었다', async () => {
      const m = await import('/src/state/menuStore.ts')
      return m.useMenuStore.getState().shopStock ?? null
    }),
    /** 가방과 돈. 볼을 사고 던지는 걸음이 여기 걸린다 */
    bagState: () => read('가방을 못 읽었다', async () => {
      const m = await import('/src/state/saveStore.ts')
      const s = m.useSaveStore.getState()
      return {
        money: s.money,
        // ⚠️ **주머니 번호를 같이 적는다.** 가방 화면은 ←→로 주머니를 옮기므로
        // 「몇 번째 주머니의 몇째 줄」을 모르면 커서를 못 놓는다
        items: s.bag.flatMap((slots, pocket) =>
          slots.map((one, row) => ({ item: one.item, count: one.count, pocket, row }))),
      }
    }),
    /**
     * **꽃시계가 지금 막고 있는 칸.** 표를 하네스가 다시 세지 않는다 —
     * 제품이 실제로 쓰는 `eternaBlockedAt`을 그대로 읽는다 (지시서 §3.2).
     *
     * ⚠️ 우리 격자(`route.mjs`)는 이 벽을 모른다. 상태 0에서 시계가 막는
     * 168칸을 격자는 대부분 걸을 수 있다고 한다 — 그래서 계획이 시계를
     * 뚫고 지나가고, 밖에서는 「길은 있는데 안 걸어진다」로 보인다
     */
    eternaWalls: () => read('꽃시계를 못 읽었다', async () => {
      const g = await import('/src/scene/eternaGym.ts')
      const list = []
      for (let z = 0; z < 32; z++) {
        for (let x = 0; x < 32; x++) if (g.eternaBlockedAt(x, z) === true) list.push(`${x},${z}`)
      }
      return list
    }),
    /**
     * **지금 맞서 있는 야생 포켓몬.** 무엇을 잡을지 고르려고 읽는다 —
     * 사람도 나온 것을 보고 볼을 던질지 싸울지 정한다
     */
    foeNow: () => read('상대를 못 읽었다', async () => {
      const store = await import('/src/state/battleStore.ts')
      const st = store.useBattleStore.getState()
      const foe = st.view?.active?.p2a ?? null
      return foe === null ? null
        : { species: foe.species ?? null, level: foe.level ?? null, kind: st.kind ?? null }
    }),
    /**
     * **화면에 적힌 기술 이름의 위력.** 「새 기술을 배우겠는가」에 사람처럼
     * 답하려고 읽는다 (지시서 §13.5의 1번). 변화 기술은 0이다.
     *
     * ⚠️ **못 찾은 이름을 0으로 접지 않는다.** 접으면 하네스가 제일 좋은 기술을
     * 「위력 0」으로 보고 잊는다 — 없는 값은 null로 돌려주고 부르는 쪽이 물러선다
     */
    movePower: (names) => read('기술표를 못 읽었다', async (want) => {
      const data = await import('/src/data/gameData.ts')
      const opt = await import('/src/state/optionsStore.ts')
      const [list, moves] = await Promise.all([
        data.loadMoveNames(opt.gameLocale()), data.loadMoves(),
      ])
      const byName = new Map()
      list.forEach((n, i) => { if (n !== '' && !byName.has(n)) byName.set(n, i) })
      return want.map((n) => {
        // 번호(`data-move-id` · `data-learn-new`)면 그대로, 글이면 이름표로 찾는다
        const id = typeof n === 'number' ? n : byName.get(n)
        if (id === undefined || !Number.isInteger(id)) return null
        const info = moves.get(id)
        if (!info) return null
        return info.category === 'status' ? 0 : info.power
      })
    }, names),
    /**
     * **지금 나와 있는 우리 쪽 마리의 체력** (`battleStore.view.active.p1a`).
     *
     * ⚠️ **배틀 중에 `partyState`로 체력을 재면 안 된다.** 그쪽은 `saveStore`의
     * 파티라 **배틀이 끝나야** 값이 바뀐다 — 실측(2026-09-17 journey16): 유채전에서
     * 수풀부기가 쓰러질 때까지 그 값이 만피 그대로였고, 그래서 「체력이 45% 아래면
     * 약을 쓴다」가 **한 번도 안 걸렸다** (좋은상처약 4개를 사서 0번 썼다).
     * 배틀이 보는 값은 배틀에게 물어야 한다
     */
    /**
     * **배틀이 지금 무엇을 묻고 있나** — 약을 쓰려다 못 본 순간을 가르려고 읽는다
     * (지시서 JOURNEY21_NEXT_DECISIONS §6). 턴 번호·「교체」 물음·고를 수 있는
     * 명령 수·단계. 화면 글이 아니라 가게(`battleStore`)의 값이다
     */
    battleMoment: () => read('배틀 순간을 못 읽었다', async () => {
      const store = await import('/src/state/battleStore.ts')
      const st = store.useBattleStore.getState()
      return {
        turn: st.view?.turn ?? null,
        phase: st.phase ?? null,
        shiftAsk: st.shiftAsk ?? null,
        actions: Array.isArray(st.actions) ? st.actions.length : null,
      }
    }),
    battleHp: () => read('배틀 체력을 못 읽었다', async () => {
      const store = await import('/src/state/battleStore.ts')
      const me = store.useBattleStore.getState().view?.active?.p1a ?? null
      if (me === null) return null
      const max = typeof me.maxHp === 'number' && me.maxHp > 0 ? me.maxHp : null
      return { hp: me.hp ?? null, max, fainted: me.fainted === true }
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
      const foeSpecies = foe?.species == null ? null : species.get(foe.species) ?? null
      const foeTypes = foeSpecies?.types ?? null
      // 상성표만 보면 고우스트에게 지진을 먼저 고른다 — 부유가 막는다(2026-09-23 7판 멜리사).
      // 특성은 배틀 화면에 안 뜨므로 **그 종이 가질 수 있는 특성이 전부** 그 타입을
      // 막을 때만 「효과 없음」으로 친다. 하나라도 안 막으면 상성표 그대로다
      const blocks = { 26: 4, 18: 10, 11: 11, 87: 11, 10: 13, 78: 13 } // 부유·타오르는불꽃·저수·건조피부·축전·전기엔진
      const kinds = (foeSpecies?.abilities ?? []).filter((x) => x !== 0)
      const walled = (type) => kinds.length > 0 && kinds.every((x) => blocks[x] === type)
      const scored = picks.map((a, i) => {
        const info = moves.get(a.move)
        if (!info) return { i, score: 0 }
        if (a.pp === 0) return { i, score: -1000 }
        if (info.category === 'status') return { i, score: 1 }
        const tag = preview.moveMatch(info, foeTypes, null, true)
        if (tag === 'immune' || walled(info.type)) return { i, score: 0 }
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
    obstacleAt: async () => unknown(NO_SRC),
    perf: async () => unknown(NO_SRC),
    motion: async () => unknown(NO_SRC),
    npcSpot: async () => unknown(NO_SRC),
    npcSpots: async () => unknown(NO_SRC),
    facingDir: async () => unknown(NO_SRC),
    partyState: async () => unknown(NO_SRC),
    bestMove: async () => unknown(NO_SRC),
    battleHp: async () => unknown(NO_SRC),
    battleMoment: async () => unknown(NO_SRC),
    movePower: async () => unknown(NO_SRC),
    foeNow: async () => unknown(NO_SRC),
    storyVars: async () => unknown(NO_SRC),
    fieldState: async () => unknown(NO_SRC),
    flyPlan: async () => unknown(NO_SRC),
    bagState: async () => unknown(NO_SRC),
    shopStock: async () => unknown(NO_SRC),
    eternaWalls: async () => unknown(NO_SRC),
    riding: async () => unknown(NO_SRC),
    hearthomeDoor: async () => unknown(NO_SRC),
    triggerWatch: async () => unknown(NO_SRC),
    veilstoneState: async () => unknown(NO_SRC),
    veilstonePlan: async () => unknown(NO_SRC),
    featureWalls: async () => unknown(NO_SRC),
    stepEdges: async () => unknown(NO_SRC),
    layeredKeys: async () => unknown(NO_SRC),
    pastoriaPlan: async () => unknown(NO_SRC),
    pastoriaState: async () => unknown(NO_SRC),
    canalavePlan: async () => unknown(NO_SRC),
    canalaveState: async () => unknown(NO_SRC),
    sunyshorePlan: async () => unknown(NO_SRC),
    sunyshoreState: async () => unknown(NO_SRC),
    snowpointPlan: async () => unknown(NO_SRC),
    iceState: async () => unknown(NO_SRC),
    distortionState: async () => unknown(NO_SRC),
    distortionPlan: async () => unknown(NO_SRC),
  }
}

// Install before walking into the target map. The driver can finish its dialog
// inside settle(), before its next snapshot observes that any script ran.
export function watchMapScene(targetMap) {
  globalThis.__rpMapSceneWatch?.disconnect()
  let ran = false
  const read = () => {
    const m = document.documentElement.dataset
    if (Number(m.map) === targetMap && (m.talk === '1' || m.script === '1' || m.scene === 'battle')) ran = true
  }
  const observer = new MutationObserver(read)
  observer.observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-map', 'data-talk', 'data-script', 'data-scene'],
  })
  read()
  globalThis.__rpMapSceneWatch = {
    finish: () => { read(); observer.disconnect(); return ran },
    disconnect: () => observer.disconnect(),
  }
}
