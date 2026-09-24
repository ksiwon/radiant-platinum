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
        /**
         * **셋째~다섯째 배지 길목** (`docs/orders/JOURNEY_BADGE345_20260922.md` §1).
         * 번호는 같은 셈법이다 — `vars_flags.txt`를 C 열거형으로 세었다.
         *
         *   · 16506 `VAR_ETERNA_CITY_STATE`             0 태홍 → 1 난천(베어가르기) → 2 · 쥬피터 뒤 3
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
     * 화면은 열릴 때 커서를 `FLY_SPOTS` 차례에서 **열린 첫 자리**에 두고, 방향키
     * 한 번에 한 칸씩 옮긴다. 커서 자체는 화면 안의 상태라 밖에서 못 읽는다 — 그래서
     * 같은 표를 **읽어서** 몇 칸 누를지 셈한다. 날았는지는 부르는 쪽이 맵으로 본다
     */
    flyPlan: (map) => read('타운맵을 못 읽었다', async (target) => {
      const t = await import('/src/engine/map/townMap.ts')
      const save = await import('/src/state/saveStore.ts')
      const lit = save.useSaveStore.getState().flySpots
      const open = t.FLY_SPOTS.find((one) => (lit & (1 << one.spawn)) !== 0) ?? null
      const spot = t.FLY_SPOTS.find((one) => one.map === target) ?? null
      return {
        from: open === null ? null : { x: open.x, z: open.z },
        to: spot === null ? null : { x: spot.x, z: spot.z },
        unlocked: spot !== null && (lit & (1 << spot.spawn)) !== 0,
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
      return { busy: sc.canalaveBusy(), floor: w.canalaveFloorAt(p.y), x: Math.floor(p.x), z: Math.floor(p.z) }
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
        heightAt: (tx, tz) => grid.heightAtWorld(tx + 0.5, tz + 0.5, p.y) ?? 0,
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
        const id = byName.get(n)
        if (id === undefined) return null
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
    pastoriaState: async () => unknown(NO_SRC),
    canalavePlan: async () => unknown(NO_SRC),
    canalaveState: async () => unknown(NO_SRC),
    snowpointPlan: async () => unknown(NO_SRC),
    iceState: async () => unknown(NO_SRC),
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
