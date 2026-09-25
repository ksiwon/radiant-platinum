# 깨어진 세계를 방향키와 A로 걷는다

`tools/e2e/distortionSolve.mjs`는 깨어진 세계(맵 573~582)의 계획기다. 페이지 안에서 돌고, 규칙은 제품 함수를 그대로 받는다(`P`). 이 문서에는 네 가지를 적었다.

- 관측기에 붙일 몸통
- 몰이꾼 루프
- 층마다 이야기의 차례
- 제품의 틈

시험은 `npx vitest run tools/e2e/distortionSolve.test.mts`로 돈다. 1F 도착부터 기라티나 방 포털까지 이어서 풀고, 걸음마다 제품 규칙으로 다시 밟아 기대값을 맞춘다.

---

## 1. 제품이 걸음을 정하는 차례

계획기가 따라 하는 순서다. 줄 번호는 HEAD `50b69fd` 기준이다.

| 무엇 | 규칙 | 근거 |
|---|---|---|
| 방향키 → 세계 | 키의 `DIR`(↑0 ↓1 ←2 →3)이 `STEP[판 갈래][DIR]`의 줄이다. 입력이 카메라를 따라 돌지 않는다. 판 밖과 바닥은 ↑ z−1이다. 서쪽 벽은 ↑ y+1 · ← z+1이고, 동쪽 벽은 ↑ y+1 · ← z−1이다. 천장은 ↑ z+1 · → x+1이다. | `engine/input/move.ts:15-20`, `engine/actor/player.ts:305`, `engine/world/distortion.ts:224-229` |
| 막힘 | 판 위에서는 판 격자를 본다. 막힘 비트를 보고, 파도타기가 아니면 물도 막힘이고, **그 높이의 사람**도 막는다(`solidNpcAtHeight` — B2F 서쪽 벽의 난천, REPAIR §107). 판 밖에서는 맵 격자·물·바위·사람을 본다. 스크립트 칸 앞(B7F (89,56), 기라티나 방 (15,26))은 늘 막힘이다. | `engine/actor/player.ts`의 `blocked`, `actor/obstacles.ts`, `scene/distortionCore.ts`의 `distortionBlockedAt` |
| 누르는 순간 | 서 있는 칸 × 누른 방향으로 뛰는 자리(`jumpAt`)를 먼저 본다. 뛰면 16프레임 뒤에 판을 갈아 끼우고 높이 계산을 끈다. 뛰는 자리가 없으면 폭포(`cascadeAt`)를 본다. 이 판정은 「칸(x,y,z) × 방향」이 바뀔 때마다 돈다 — 누른 채로 벽을 오르내려도 칸마다 돈다(REPAIR §106). | `scene/stepSystem.ts`, `scene/distortion.ts`의 `distortionMoved`, `scene/distortionJump.ts` |
| 두 칸 뛰기 | 바닥 판이나 판 밖에서, **누른 방향** 앞 칸이 0x5A~0x5D이면 3칸을 뛴다(24프레임). 칸 가운데에 선 뒤에만 뛴다(REPAIR §110 · §111). 기라티나 방 진행도 14에서는 넘는 칸 (15,15)을 난천이 막는다(`cynthiaBlocksJump` · REPAIR §103). | `player.ts`, `actor/ledge.ts` |
| 턱 | 맵 격자로 보고, 판 갈래와는 상관없다. B3F·B5F·B6F에 있다. | `player.ts:431-435`, `ledge.ts:122-147` |
| 닿은 칸 | 칸(벽에서는 y·z)이 바뀐 틱에 돈다. 판을 다시 잡고 → 승강 발판 → 사건 → 스크립트 칸 순서다. **옮겨진 칸은 걸은 칸이 아니다** — 사건·승강 발판·판 뛰기·폭포가 내려놓은 칸에서는 안 돈다(`markCarried` · REPAIR §101). 스크립트 칸은 막힌 앞 칸을 밀어도 선다(REPAIR §114). | `scene/stepSystem.ts`, `scene/distortion.ts`의 `distortionStepped` · `distortionBumped` |
| 승강 발판 | 세계 (x,y,z) **세 축이 정확히** 발판 칸과 같으면 밟는 순간 탄다. 기다리지 않는다. 다리마다 층이 바뀐다. 한 다리는 32칸에 128프레임(2.1초)이다. B3F→B5F는 두 다리로 4.3초, B6F→B7F는 3.3초다. | `engine/world/distortionElevator.ts:80-91,159-195`, `scene/distortionElevator.ts:97-286` |
| 폭포 | B4F 천장 (104,170,76~79)에서 **→를 누르면** 내려간다(664프레임, 11.1초). B5F (104,128,76~79)에서 →를 누르면 올라간다(83프레임). 끝나면 서쪽으로 2칸(올라가면 3칸) 옮겨 선다. 파도타기는 그대로 남는다. | `engine/world/distortionCascade.ts:121-160`, `scene/distortionCascade.ts:69-156` |
| 미끄러지는 판 (B2F) | 사건 칸을 밟으면 판이 떨고 → 태워 가고 → 주인공이 3칸 뛰어내린다. 사건은 **밟을 때마다** 다시 돈다 — 내려놓은 칸에서 되돌아가는 판이 곧바로 서지 않을 뿐이다(REPAIR §101). | `scene/distortionEvents.ts` |
| 괴력 | 바위를 마주 보고 A → 「예」를 고르면 `strength`가 켜진다. 층을 옮기면 꺼진다. 막힌 채 바위 쪽을 누르면 한 칸 민다. 앞 칸이 떨어지는 자리면 막힘을 안 보고 떨어뜨린다. 사람은 안 본다. | `script/field.ts:1210-1215,573-574`, `player.ts:471-479`, `actor/obstacles.ts:44-59`, `scene/distortionBoulder.ts:54-120` |
| 파도타기 | A의 앞 칸이 물이면 「예」 → 앞 칸으로 x·z만 옮기고 판은 그대로다. 뭍에 오르면 저절로 내린다. 판 밖에서 높이 계산이 켜져 있으면 지형의 칸 높이를 딛는다 — B5F 웅덩이 128 · 뭍 129(REPAIR §105). | `script/field.ts`, `player.ts` |
| **A의 앞 칸** | 판을 아는 `frontTile()` — 바라보는 쪽 한 걸음(그 판 갈래의 `STEP`) | `field.ts`의 `tryTalk` (REPAIR §85) |
| 조작이 묶이는 동안 | `player.riding`이 참이다. 승강 발판·바위 낙하·유령 발판·판 뛰기·사건·폭포 중 하나라도 돌면 선다. 이때 속도도 0이 된다. | `MapStreamer.tsx:874-877`, `player.ts:264-280` |

계획기는 이 표를 `distortionModel(P).press(state, dir)` 하나로 옮겼다. 결과의 `act`는 다음 중 하나다.

| `act` | 무엇 |
|---|---|
| `walk` | 걷는다 |
| `wall` | 벽에서 y로 오르내린다 — 한 걸음이다(닿은 칸 처리가 돈다) |
| `turn` | 막혀서 돌기만 한다 |
| `nudge` | 짧게 눌러 칸을 안 넘기고 돌아선다 |
| `jump` | 판을 갈아탄다 |
| `hop` | 두 칸 뛰기 |
| `ledge` | 턱을 넘는다 |
| `cascade` | 폭포를 탄다 |
| `push` | 바위를 민다 |
| `drop` | 바위를 떨어뜨린다 |
| `surf` | 파도타기에 오른다 |
| `strength` | 괴력을 켠다 |
| `talk` | 말을 건다 |
| `escape` | 벽 속에서 걸어 나온다 |

걸음 하나가 `through`를 가지는 경우가 있다. 걸어서 새 칸에 든 그 틱에 누른 키가 아직 눌려 있거나 속도가 남아 있어서, 그 칸에서 곧바로 뛰거나 폭포를 탄 경우다(`stepSystem.ts:327-334`, `player.ts:309`). 몰이꾼이 막을 수 없으므로 계획기가 한 걸음으로 합친다. 이때 `through`는 지나간 칸이고 `expect`는 끝난 자리다.

---

## 2. 관측기 — `observe.mjs`의 `devObserver`에 붙일 것

`snowpointPlan`과 같은 꼴이다. `/src`는 읽기만 하고, 쓰는 길은 만들지 않는다. 배포물 갈래(`distObserver`)에는 `distortionState: async () => unknown(NO_SRC)`와 `distortionPlan: async () => unknown(NO_SRC)`를 둔다.

```js
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
```

`drive.mjs`의 `api`에도 `distortionPlan`과 `distortionState`를 붙인다. `canalavePlan`과 같은 모양이다(`drive.mjs` 3798줄 근처).

계획 한 번에 드는 시간은 시험 기준 한 층 안에서 수 ms다. B5F 바위 셋(층 건너기 포함)은 약 1초 걸린다.

---

## 3. 몰이꾼 루프 — `drive.mjs`에 붙일 것

`runKeys`는 x·z만 보고 멈춤을 판단한다(`drive.mjs` 1114~1128줄). 그래서 벽 위의 걸음은 전부 멈춤으로 읽힌다. **깨어진 세계에서는 쓰지 않는다.** 대신 걸음 하나를 이렇게 밟는다.

```js
  /** 깨어진 세계 — 계획의 걸음 하나를 밟고, 끝난 자리를 기대값과 견준다 */
  const dwStep = async (q) => {
    const look = async () => { const r = await obs.distortionState(); return r.known ? r.value : null }
    const same = (a, e) => a !== null && a.map === e.map && a.x === e.x && a.y === e.y && a.z === e.z
      && a.pi === e.pi && a.surf === e.surf
    const idle = async (ms = 15_000) => {           // 묶인 동안(뛰기·승강·폭포·사건·바위·장면)을 기다린다
      const till = Date.now() + ms
      for (;;) {
        const s = await now()
        if (s.talk || s.script || s.scene !== 'overworld') { await settle(); continue }
        const d = await look()
        if (d !== null && !d.busy) break
        if (Date.now() > till) return false
        await page.waitForTimeout(50)
      }
      await page.waitForTimeout(250)               // 남은 속도가 죽기를 기다린다 (drive.mjs 1140-1152)
      return true
    }
    const before = await look()
    if (q.key === 'A') {
      await tap('Space', 250)
      if (q.prompt === 'surf' || q.prompt === 'strength') await clearTalk()   // 「예」
      else await settle()                            // 말 → 장면·배틀 (기라티나는 §4-10)
      await idle()
    } else if (q.act === 'turn') {
      await tap(q.key, 80)                           // 막힌 쪽 — 제자리에서 돌기만 한다
    } else if (q.act === 'nudge') {
      await page.keyboard.down(q.key); await page.waitForTimeout(40); await page.keyboard.up(q.key)
      await page.waitForTimeout(300)
    } else {
      // 걷기·벽·뛰기·폭포·밀기: 칸(벽이면 y)이 바뀌거나 묶이는 순간 손을 뗀다
      await page.keyboard.down(q.key)
      const till = Date.now() + (q.act === 'push' || q.act === 'drop' ? 2_000 : 3_000)
      for (;;) {
        const d = await look()
        if (d === null || d.busy || d.map !== before.map || d.x !== before.x || d.y !== before.y
          || d.z !== before.z || Date.now() > till) break
        await page.waitForTimeout(15)
      }
      await page.keyboard.up(q.key)
      await idle(q.wait === 'cascade' ? 20_000 : 15_000)
    }
    const after = await look()
    const ok = q.key === 'A' && q.prompt === 'talk' ? true
      : same(after, q.expect) && (q.act !== 'turn' && q.act !== 'nudge' || after.facing === q.expect.facing)
    return { ok, after }
  }

  /**
   * 깨어진 세계를 걷는다 — **다리 하나를 밟고 다시 세운다.** 어긋나면 그 자리에서 다시 세운다.
   * 사건은 밟을 때마다 다시 돌므로(REPAIR §101) 돈 사건을 따로 세지 않는다
   */
  /**
   * @param stopWhen `(state) => boolean` — 참이면 그 자리에서 멈춘다. 기라티나 방에서 기라티나가 선 뒤
   *   (진행 13) A를 **이 걸음이 누르지 않게** 쓴다 — 거기서부터는 마스터볼 다리가 맡는다
   */
  const distortionWalk = async (budgetMs, { escape = false, stopWhen = null } = {}) => {
    const till = Math.min(Date.now() + budgetMs, started + totalMs)
    let lastMap = null
    let misses = 0
    while (Date.now() < till) {
      await settle()
      const st = await obs.distortionState()
      if (!st.known || st.value === null) return { ok: true, why: '깨어진 세계를 나왔다' }
      if (stopWhen !== null && stopWhen(st.value)) return { ok: true, why: '멈출 자리다', at: st.value }
      if (st.value.map !== lastMap) lastMap = st.value.map
      const r = await obs.distortionPlan({ escape })
      if (!r.known || r.value === null || !r.value.legs) return { ok: false, why: '계획이 없다', at: st.value }
      const leg = r.value.legs[0]
      for (const q of leg.steps) {
        const { ok, after } = await dwStep(q)
        if (!ok) { misses++; log(`      어긋남 ${q.key}/${q.act} 기대 ${JSON.stringify(q.expect)} 실제 ${JSON.stringify(after)}`); break }
        misses = 0
        if (after.map !== lastMap) break
      }
      if (misses >= 3) return { ok: false, why: '같은 자리에서 세 번 어긋났다', at: (await obs.distortionState()).value }
    }
    return { ok: false, why: '시간이 다 됐다' }
  }
```

지키는 것:

- **도착 판정은 칸 넷이다.** 세계 x·y·z와 판 번호(`pi`)를 본다. 벽 위에서는 y가 걷는 축이다. 판 번호가 다르면 같은 칸이라도 다른 자리다(서쪽 벽 y 233과 바닥 판 y 233이 그렇다).
- **벽에서는 걸음마다 손을 뗀다.** 누른 채로 오르면 위 칸의 뛰는 자리가 안 걸린다(`stepSystem.ts:327-334`). 위의 `dwStep`은 걸음마다 뗀다. 같은 키를 묶어 잡고 가는 `runs()`를 쓰면 안 된다.
- **기다리는 것은 시간이 아니라 `busy`다.** 참고로 걸리는 시간은 다음과 같다.

  | 동작 | 시간 |
  |---|---|
  | 판 뛰기 | 16프레임 |
  | 두 칸 뛰기·턱 | 0.4초 |
  | 승강 발판 | 2.1~4.3초 |
  | 폭포 내려가기 | 11.1초 |
  | 폭포 올라가기 | 1.4초 |
  | B2F 미끄러지는 판 | 약 1.7초 |
  | 바위 낙하 | 28~52프레임 |
  | 기라티나 그림자 | 판마다 다르다 |

  4FPS로 떨어지는 순간이 있으므로(`drive.mjs` 1060~1075줄) 폭포에는 20초를 준다.
- **`nudge`는 칸을 넘기면 안 된다.** 걸을 수 있는 쪽으로 돌아서기만 할 때 짧게(40ms) 누른다. 끝나고 칸이 같고 얼굴이 맞아야 한다. 칸이 바뀌었으면 다시 세우면 된다.
- **A 뒤의 「예」.** 파도타기(`FieldMoves_Water`), 괴력(바위 스크립트 10002), B3F 태홍(예/아니오 둘 다 같다), 포털은 `clearTalk()`가 첫 칸 「예」를 고른다. `surfStart`와 같다(`drive.mjs` 1294줄). 탔는지는 `distortionState().surf`로, 켜졌는지는 `strength`로 본다.
- **사건은 셀 필요가 없다.** 제품이 사건을 밟을 때마다 다시 돌리고(REPAIR §101) 계획기도 같은 규칙이라, 몰이꾼은 돈 사건을 따로 적지 않는다. 사건이 내려놓은 칸에서 다음 사건이 안 도는 것도 둘이 같다.
- **세이브는 물 위에서 쓰지 않는다.** 파도타기가 저장되지 않는다(`state/save/schema.ts:273-290`, 틈 문서 §7).

---

## 4. 이야기 차례 — 층마다 할 일과 볼 진행도

진행도는 `VAR_DISTORTION_WORLD_PROGRESS` 16469이고, 관측기 `storyVars().distortion`으로 읽는다. 계획기의 `STORY`가 이 순서를 들고 있다. 걸음 수는 시험의 이어 달리기에서 나온 값이다. 괄호 속 좌표는 세계 칸이다.

1. **1F (573)**
   - 창기둥에서 「예」를 고르면 도착한다.
   - 들어서면 장면이 돈다. 진행 0→1이고 주인공이 서쪽으로 한 걸음 옮겨진다(`scripts_distortion_world_1f.s:40,77`). `settle()`로 넘긴다.
   - ⚠️ 제품은 도착 자리가 벽 속이다(§6-1).
   - 승강판 앞 칸 (40,289,52)을 두 칸 뛰기로 밟는다. 스크립트 4가 돌고(난천), 진행 1→2다.
   - 발판 (40,289,54)을 밟으면 난천과 같이 B1F로 내려간다.
2. **B1F (574)**
   - 들어서면 장면이 돈다(2→3).
   - 엠라이트 칸 (15,257,58): 스크립트 3, 3→4.
   - 발판 (33,257,45)로 B2F.
3. **B2F (575)**
   - 난천(윗단 (30,233,20))에게 말 거는 것은 선택이다(4→5). B3F 사건이 4와 5를 다 받는다.
   - 가는 길은 서쪽 벽을 타고 윗단에 올라, 미끄러지는 판 사건 일곱 개를 지나는 것이다.
   - 발판 (65,225,31)로 B3F.
4. **B3F (576)**
   - 태홍 칸 (65,193,41): 스크립트 2(예/아니오), →6.
   - 도착한 칸에서 닿는 아래층 길은 **(96,193,43) 두 다리 발판 하나**다. 곧장 B5F로 간다.
5. **B5F (579) 바위 둘**
   - 유크시 바위 (86,56): 뒤 칸 (86,55)에서 A → 괴력 「예」 → ↓. 구멍 (86,57)로 떨어진다.
   - 엠라이트 바위 (75,68): (74,68)에서 →. 구멍 (76,68)로 떨어진다.
   - 아그놈 바위 (98,67)는 **동쪽 칸 (99,67)에서만** 밀린다. 그 칸은 폭포 웅덩이 쪽 주머니라 본채에서 못 간다.
6. **아그놈 바위로 가는 길**
   - B5F 발판 (78,129,77)로 올라가 B4F (78,161,77).
   - B4F (79,161,62)로 올라가 B3F 둘째 칸.
   - B3F (95,193,70)로 내려가 B4F (95,161,70).
   - B4F 바닥 물을 파도타기로 건넌다((94,161,60)에서 ↑ 돌기 → A).
   - (105,161,57)에서 →를 누르면 동쪽 벽(판 0)으로 건넌다. 벽에서 ↑·→로 (106,169,61)까지 오르고, ↑를 누르면 천장(판 1)이다.
   - 천장 (102,170,70)에서 물 쪽(↑ — 천장의 북은 z+1)으로 돌고 → A → 파도타기로 물 (102,170,71)에 오른다.
   - (104,170,76)에서 →를 누르면 폭포다.
7. **B5F 웅덩이**
   - (99,67)에서 A → 괴력 → ←. 아그놈 바위가 구멍 (97,67)로 떨어진다. 이제 B5F 바위가 0이다.
   - 웅덩이는 y 128이고, 바위를 떨어뜨린 뒤 뭍에 올라서면 129라 B5F 발판을 탄다(§6-2).
8. **B6F (580)**
   - 맞는 웅덩이 셋에 넣는다. 틀린 웅덩이에 빠진 바위는 B5F로 되돌아가므로 계획기가 안 쓴다.
     - 유크시: ↓ 넷(86,56→60), 그다음 (87,60)에서 ←. 웅덩이 (85,60)로 들어간다.
     - 아그놈: (99,67)에서 ← 둘, (96,66)에서 ↓. 웅덩이 (96,68)로 들어간다.
     - 엠라이트: (76,68)에서 ← 일곱, (68,69)에서 ↑. 웅덩이 (68,67)로 들어간다.
   - 셋 다 들어가면 깃발 2477이 선다. 넣을 때마다 우는 소리 스크립트 5/6/7이 돈다.
   - 난천(#134, (85,80))에게 말을 건다 → 7(`_b6f.s:22-34`). 풀기 전에는 난천이 승강판으로 가는 외길을 막고 있다. 풀고 나면 (84,84)로 비킨다.
   - 발판 (85,115,86)로 B7F.
9. **B7F (581)**
   - 들어서면 장면이 돈다(7→8).
   - 사건 (84~86,65,76): 스크립트 4, →9. 스크립트가 주인공을 옮기므로 다시 세운다.
   - 태홍(#129, (85,74))에게 말 → 배틀(트레이너 404) → 이기면 10(`_b7f.s:56-59`). 지면 9로 돌아가고 블랙아웃이다. 이기면 난천이 파티를 회복한다.
   - (89,65,57)을 **↑로 밟으면** 스크립트 2가 돌고 기라티나 방 (15,25)로 간다. (89,56)은 막혀 있다.
10. **기라티나 방 (582)**
    - (15,24): 스크립트 7 + 그림자, →11.
    - (15,23): 발판 무리가 선다(기다림).
    - 두 칸 뛰기로 (15,17): 그림자, →12.
    - 두 칸 뛰기로 (15,14): →13, 기라티나 도착, 스크립트 8.
    - ↑(막혀서 돌기) → A → **야생 기라티나 오리진 Lv47**(`commands.ts:4201`).
      - ⚠️ `fightThrough`를 부르면 쓰러뜨린다. 첫 명령 메뉴에서 마스터볼(아이템 1)을 던진다. 틈 문서 §6과 `captureBall.mjs:128-170`을 옮겨 쓴다.
      - 확인: 깃발 289(잡았다). 배틀 뒤 OnLoad가 14를 세운다.
    - 같은 자리에서 A → 포털(#131) 「예」 → 송별의 샘(267). 16554가 1 → 2가 되면 끝이다.

---

## 5. 시험

```
npx vitest run tools/e2e/distortionSolve.test.mts
```

시험이 잠그는 것:

- **제품 규칙 그대로:**
  - 걸음 표의 뜻.
  - 깨어진 세계 격자에 한쪽 막음 가장자리가 0칸, 물높이 막음이 0칸이다(계획기가 안 부르는 두 규칙이 해당 없음을 잰다).
- **층마다 도착 → 할 일 → 나가는 길:** 1F, B1F, B2F, B3F, B4F(천장 파도타기와 폭포), B7F, 기라티나 방. 바위는 B5F 셋(폭포 뒤의 아그놈 포함)과 B6F 맞는 웅덩이 셋이다.
- **이어 달리기:**
  - 1F 도착부터 포털까지 다리 60개 안으로 간다(B2F 난천에게 말 거는 다리가 있다). 다리마다 몰이꾼처럼 첫 다리만 밟고 다시 세운다.
  - 각 다리의 모든 걸음을 `press`로 다시 밟아 `expect`와 맞춘다.
- **알려진 틈(§6)을 잰 것.**

---

## 6. 제품의 틈 — 계획기가 비켜 가거나 몰이꾼이 알아야 하는 것

1. **스크립트 워프의 롬 칸** — 깨진 창기둥 → 1F `(55,40)`은 세계 칸이다. 제품이 층 오프셋을 빼서 세운다
   (REPAIR §83 · `romTileToLocal`). 첫 장면이 서쪽으로 한 걸음 옮겨 세계 (54,40)에서 시작한다. `planEscape`는
   이제 쓸 일이 없지만 벽 속에서 시작한 판을 위해 남겨 둔다(기본 꺼짐).
2. **B5F 웅덩이는 128, 뭍은 129** — 판 밖에서 높이 계산이 켜져 있으면 제품이 지형의 칸 높이를 딛는다(REPAIR §105 ·
   `terrainTileY`). 계획기도 같은 규칙을 `P.terrainY`로 받고 높이 계산 상태를 `hc`로 든다(세계가 서면 · 승강 발판 ·
   판 밖에 내려놓는 판 · 폭포 내려서기가 켜고, 판 뛰기 · 폭포 오르기가 끈다). 뭍에서 물에 들면 128이라 거슬러 오르는
   자리가 걸린다.
3. **A의 앞 칸은 바라보는 쪽이다** — 천장에서도 그렇다(REPAIR §85 · `tryTalk`의 `frontTile()`). 계획기의 `aFront`는
   그 판 갈래의 걸음 표(`P.STEP`) 한 걸음이다. 물가에서는 물 쪽으로 돌기만 하면 된다(`nudge`가 안 나온다).
4. **B5F 안내 사건 12·13·14는 제품에서 돈다**(REPAIR §86) — `…_IN_B6F`가 서서 B6F의 호수의 셋이 선다. 계획기는 그
   명령의 깃발을 안 따라간다 — 안내 칸을 밟는 계획이 없고, B6F의 셋은 막는 자리에 서지 않는다.
5. **B2F 난천은 말을 걸어야 지나간다** — 진행도 4의 난천(30,233,20)가 서쪽 벽 통로를 막는다(REPAIR §107). 말을
   걸면 스크립트가 난천을 벽에서 한 칸 내리고(106) 주인공이 y 232에서 걸었으면 z+1로 비킨다(107 · REPAIR §112).
   `STORY`에 그 줄이 있다.
6. **명령 2(`addMapObject`, B1F → B2F 난천)는 넘어가지만** B2F 난천은 표 조건(진행 4)으로 선다. 명령 8(그림자
   표식)은 제품이 2478·2479를 세우고, 계획기도 `anim`으로 든다(REPAIR §102).
7. **계획기가 근사하는 것** — 걸음에는 영향이 없다고 본 것.
   - 판 뛰기 · 사건 · 승강 발판 · 폭포가 옮긴 칸은 닿은 칸 처리를 안 한다 — 제품과 같다(REPAIR §101).
   - 판 밖의 사람 높이 차 판정(`solidNpcAt`의 `FLOOR_GAP`)을 표 쪽에서는 안 본다. 판 밖은 한 층 높이라서다. 판 위는
     표의 높이로 본다(`solidAtHeight`).
   - 유령 소품(밟으면 나타나는 블록)은 통행에 안 쓰인다(`hiddenGroups`를 읽는 곳이 그림뿐이다 — `distortionCore.ts:428`, `distortion.ts:148-160`).
