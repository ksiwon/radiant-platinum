// 깨어진 세계 풀이 — **페이지 안에서 도는 계획기** (PARITY §6.10 · `gymSolve67.mjs`와 같은 꼴)
//
// ⚠️ **여기서 규칙을 다시 세우지 않는다** (`two-bakers-must-match`). 판 통행·걸음 표·뛰는 자리·
// 승강 경로·폭포·바위 낙하는 전부 부르는 쪽이 **제품 함수 그대로** 넘긴다(`P`). 이 파일이 아는
// 것은 **제품이 그 함수들을 부르는 차례**와 탐색뿐이다 — 차례는 줄마다 제품 파일:줄을 달았다.
// 그래서 페이지 안(관측기가 `/src/...`를 열어 `P`를 만든다)에서도, 단위 시험(제품 모듈을 그대로
// import한다)에서도 같은 코드가 돈다. 맨 위에서 제품 모듈을 import하지 않는다.
//
// ── 좌표 ────────────────────────────────────────────────────────────────────
// 계획은 **세계 칸**(x, y, z)으로 한다. 판·뛰는 자리·승강 발판·사건이 다 세계 칸이라서다
// (`scene/distortionCore.ts:7-9`). 맵 격자와 사람만 지역 칸(세계 − 층 오프셋)이다.
// y는 칸 높이 그대로다 — 제품은 `Math.round(y) + offsetY`로 세계 y를 만든다
// (`scene/distortionCore.ts:114-121`).
//
// ── 방향키 한 번이 무엇인가 ─────────────────────────────────────────────────
// 방향키는 **판 위의 로컬 방향**이다(`engine/input/move.ts:15-20`은 월드 축을 주지만
// `engine/actor/player.ts:305`가 `surfaceVector`로 판의 기저에 태운다). 그래서 누른 키의
// `DIR`(북0·남1·서2·동3)이 곧 `STEP[갈래][DIR]`의 줄이다(`engine/world/distortion.ts:224-229`):
//
//   바닥·판 밖   ↑ z−1 · ↓ z+1 · ← x−1 · → x+1
//   서쪽 벽      ↑ y+1 · ↓ y−1 · ← z+1 · → z−1
//   동쪽 벽      ↑ y+1 · ↓ y−1 · ← z−1 · → z+1
//   천장         ↑ z+1 · ↓ z−1 · ← x−1 · → x+1
//
// 한 번 누르면 제품이 이 차례로 본다:
//
//   ① 누르는 순간, **서 있는 칸**에서 (`stepSystem.ts:327-334` → `scene/distortion.ts:124-132`)
//      뛰는 자리(`jumpAt`) → 있으면 판을 갈아타고 끝. 없으면 폭포(`cascadeAt`)
//   ② 바닥·판 밖이면 두 칸 뛰기(`player.ts:411-429` · `ledge.ts:78-90`) → 턱(`player.ts:431-435`)
//   ③ 걸음 — 앞 칸이 막혔으면 제자리에서 돌기만 한다(`player.ts:568-595`)
//   ④ 칸이 바뀌면 닿은 칸을 본다(`scene/stepSystem.ts`): 판 다시 잡기 → 승강 발판 → 사건 →
//      스크립트 칸(`scene/distortion.ts`의 `distortionStepped`)
//
// 벽에서는 칸이 (y, z)다 — 오르내리는 걸음도 ①과 ④가 돈다(REPAIR §106). ①은 「칸 × 누른 방향」이
// 바뀔 때마다 돌므로 누른 채로 올라가도 위 칸의 뛰는 자리가 걸린다.
//
// ⚠️ **옮겨진 칸은 걸은 칸이 아니다**(REPAIR §101). 사건(미끄러지는 판·뛰어내림)·승강 발판·판 뛰기·
// 폭포가 내려놓은 칸에서는 ④가 안 돈다 — 그래서 사건은 다시 돌 수 있다(한 층에 한 번이 아니다).

/** `DIR` 순서의 방향키 (`engine/script/movement.ts:21`) */
export const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

/**
 * 스크립트 칸 둘이 부르는 워프 — 스크립트에만 적힌 값이라 여기 옮긴다.
 *
 * - B7F (89,65,57) 북향 → 스크립트 2 → `Warp GIRATINA_ROOM, 15, 25, DIR_NORTH`
 *   (`scripts_distortion_world_b7f.s:19`). 기라티나 방은 오프셋이 0이라 지역 = 세계다
 * - 기라티나 방 (15,1,25) 남향 → 스크립트 4 → `Warp B7F, 89, 57, DIR_SOUTH`
 *   (`scripts_distortion_world_giratina_room.s:56`). ⚠️ 롬의 89,57은 세계 칸인데 제품은 지역으로
 *   받는다 — 되돌아가는 이 길은 쓰지 않는다(`DISTORTION_HARNESS.md` §6)
 */
export const TELEPORT_WARP = {
  b7f: { map: 582, x: 15, z: 25, facing: 0 },
  giratinaRoom: { map: 581, x: 89, z: 57, facing: 1 },
}

/** 벽의 두 갈래 (`engine/world/distortion.ts:19-24`의 값을 `P.PLATFORM`으로 받는다) */
const isWallKind = (P, kind) => kind === P.PLATFORM.WEST_WALL || kind === P.PLATFORM.EAST_WALL

/**
 * 제품 규칙을 **부르는 차례**만 묶는다.
 *
 * @param P 제품이 주는 것 — `DISTORTION_HARNESS.md` §2가 관측기의 몸통을 적는다:
 *   `data`(`distortionData()` · 롬 반쪽 + 코드 표) · `STEP` · `PLATFORM` · `ATTRS_INVALID` ·
 *   `tileAttributes` · `blocked` · `tileBehavior` · `findPlatform` · `hasPlatformAt` · `jumpAt` ·
 *   `flagHolds` · `connectionOf` · `mapOf` · `TELEPORT` · `CYNTHIA_BLOCK` · `EVENT_CMD` · `MAP` ·
 *   `elevatorAt` · `elevatorLegs` · `upStartFlags` · `downEndFlags` · `withFlag` · `ELEVATOR_DIR` ·
 *   `PLATFORM_FLAG` · `cascadeAt` · `terrainY(map, lx, lz)`(판 밖 지형의 칸 높이 — 지역 y, 판이 없으면 null ·
 *   `terrainTileY(grid.heightAtWorld)`) · `cynthiaBlocksJump` · `initialPlatformFlags` · `fallLocationAt` ·
 *   `fallDestination` · `fellToB6F` ·
 *   `fellIntoPit` · `fellIntoWrongPit` · `puzzleSolved` · `FALL_DEST` · `hopDirOf` · `HOP_TILES` ·
 *   `distortionJump` · `HOP_TWICE_TILES` · `ledgeHop` · `isOnWater` · `isSurfable` · `DIR_STEP` ·
 *   `FLAG_COND` · `STRENGTH_BOULDER` · `PUZZLE_FLAG` ·
 *
 *   `grid(map) → {isBlocked(lx,lz), behavior(lx,lz)} | null`(그 층의 `MapGrid` — `gridFor`) ·
 *   `solidAt(map, lx, lz) → boolean | null`(지금 층의 살아 있는 사람. null이면 표로 본다 —
 *   바위는 상태의 `boulders`가 든다) · `solidAtHeight(map, lx, ly, lz) → boolean | null`(판 위 — 사람의
 *   높이로 가른다, 없어도 된다) · `checkFlag(flag)`(숨김 플래그, 없어도 된다)
 */
export function distortionModel(P) {
  const floorOf = (map) => P.mapOf(P.data, map)
  const toLocal = (f, x, y, z) => [x - f.offsetX, y - f.offsetY, z - f.offsetZ]

  /** 서 있는 판의 갈래. 판 밖이면 `PLATFORM.NONE` (`scene/distortionCore.ts:135-138`) */
  const kindOf = (s) => {
    if (s.pi < 0) return P.PLATFORM.NONE
    return floorOf(s.map)?.platforms[s.pi]?.kind ?? P.PLATFORM.NONE
  }

  /** 판 번호 → 상태의 판 번호. 개수 이상(0xFFFF 따위)은 「판 밖」이다 (`distortionCore.ts:272-277`) */
  const bindIndex = (f, index) => (index < 0 || index >= f.platforms.length ? -1 : index)

  const attrsAt = (f, pi, x, y, z) => {
    const p = f.platforms[pi]
    return P.tileAttributes(p, P.data.attrs[p?.attr ?? -1], x, y, z)
  }

  const boulderAt = (s, x, z) => (s.boulders ?? []).find((b) => b.x === x && b.z === z) ?? null

  /**
   * 사람이 그 칸을 막는가 (`player.ts:209` `solidNpcAt`). 몰이꾼이 지금 층의 살아 있는 배우로
   * 답하면(`P.solidAt`) 그것을, null이면 표(`tableActors`)를 본다. 바위는 여기서 빼고
   * `boulders`가 든다 — 밀리는 것이라서다
   */
  const tableSolid = new Map()
  const solidAt = (s, lx, lz) => {
    const live = P.solidAt?.(s.map, lx, lz)
    if (live !== null && live !== undefined) return live
    const k = `${s.map},${s.progress},${s.puzzle},${s.cyrus ?? 0}`
    let set = tableSolid.get(k)
    if (set === undefined) {
      const f = floorOf(s.map)
      set = new Set(tableActors(P, s).filter((a) => a.gfx !== P.STRENGTH_BOULDER)
        .map((a) => `${a.x - f.offsetX},${a.z - f.offsetZ}`))
      tableSolid.set(k, set)
    }
    return set.has(`${lx},${lz}`)
  }

  /** 판 위의 사람 — 살아 있는 배우가 답하면 그것을, 아니면 표의 높이로 (`obstacles.ts` `solidNpcAtHeight`) */
  const solidAtHeight = (s, lx, ly, lz) => {
    const live = P.solidAtHeight?.(s.map, lx, ly, lz)
    if (live !== null && live !== undefined) return live
    const f = floorOf(s.map)
    return tableActors(P, s).some((a) => a.gfx !== P.STRENGTH_BOULDER
      && a.x - f.offsetX === lx && a.z - f.offsetZ === lz && a.y - f.offsetY === ly)
  }

  /**
   * 판 밖 지형의 칸 높이 (세계 y) — 높이 계산이 켜져 있을 때만 (`player.ts` · REPAIR §105).
   * 판이 없는 칸이면 그대로다
   */
  const groundAt = (s) => {
    if (s.pi >= 0 || !s.hc) return s.y
    const f = floorOf(s.map)
    const [lx, , lz] = toLocal(f, s.x, s.y, s.z)
    const t = P.terrainY(s.map, lx, lz)
    return t === null || t === undefined ? s.y : f.offsetY + t
  }

  /**
   * 그 칸의 성질 — 판이 먼저고, 판이 모르는 칸(판 밖·판 없음)이면 맵 격자다
   * (`distortionCore.ts:187-193` → `player.ts:416-417` · `field.ts:1122-1124`)
   */
  const behaviorAt = (s, x, y, z) => {
    const f = floorOf(s.map)
    if (s.pi >= 0) {
      const b = P.tileBehavior(attrsAt(f, s.pi, x, y, z))
      if (b !== null && b !== undefined) return b
    }
    const g = P.grid(s.map)
    if (g === null) return 0
    const [lx, , lz] = toLocal(f, x, y, z)
    return g.behavior(lx, lz)
  }

  /** 스크립트 칸 앞의 막힘 (`distortionCore.ts:168-173`). 판과 상관없이 먼저 본다 */
  const teleportBlock = (map, x, z) => {
    const g = P.TELEPORT.giratinaRoom
    const b = P.TELEPORT.b7f
    if (map === g.map && x === g.x && z === g.z + 1) return true
    if (map === b.map && x === b.x && z === b.z - 1) return true
    return false
  }

  /**
   * 그 칸이 막혔는가 — `player.ts:179-219`의 `shut()` 한 칸 몫.
   *
   * 판 위면 판을 본다: 막힘 비트 → 물(파도타기가 아니면) → **그 높이의 사람**(`solidNpcAtHeight` —
   * B2F 서쪽 벽의 난천, REPAIR §107). 바위는 판 위에 없다. 판 밖이면 격자 · 물 · 바위 · 사람
   * (`player.ts:198-210`). 들판시티 따위의 장치 갈래(`mapFeatureBridge`)는 이 세계에서 늘 null이다
   * (`scene/mapFeatureCollision.ts` — 깨어진 세계 갈래가 없다. 시험이 격자에 그 성질이 없음을 잰다)
   */
  const blockedCell = (s, x, y, z) => {
    if (teleportBlock(s.map, x, z)) return true
    const f = floorOf(s.map)
    if (s.pi >= 0) {
      const a = attrsAt(f, s.pi, x, y, z)
      if (a !== P.ATTRS_INVALID) {
        if (P.blocked(a)) return true
        const beh = P.tileBehavior(a)
        if (!s.surf && beh !== null && beh !== undefined && P.isOnWater(beh, false)) return true
        const [lx, ly, lz] = toLocal(f, x, y, z)
        return solidAtHeight(s, lx, ly, lz)
      }
    }
    const g = P.grid(s.map)
    if (g === null) return true
    const [lx, , lz] = toLocal(f, x, y, z)
    return g.isBlocked(lx, lz)
      || (!s.surf && P.isOnWater(g.behavior(lx, lz), false))
      || boulderAt(s, x, z) !== null
      || solidAt(s, lx, lz)
  }

  /**
   * 칸이 바뀐 뒤 발밑의 판을 다시 잡는다 (`distortionCore.ts:250-262`).
   *
   * ⚠️ 원작의 뒤집힌 조건(`hasPlatformAt`)을 제품 함수 그대로 부른다 — 판 밖(`NONE`)에서는
   * 늘 거짓이라 걸어서 판에 오르는 일은 없다
   */
  const rebind = (s) => {
    const f = floorOf(s.map)
    const kind = kindOf(s)
    if (s.pi >= 0) {
      const a = attrsAt(f, s.pi, s.x, s.y, s.z)
      if (a !== P.ATTRS_INVALID && a !== -2) return s.pi
    }
    if (!P.hasPlatformAt(f.platforms, s.x, s.y, s.z, kind)) return s.pi
    const found = P.findPlatform(f.platforms, s.x, s.y, s.z, kind)
    return found >= 0 ? bindIndex(f, found) : s.pi
  }

  /** `flagHolds`의 셋째 인자 (`scene/distortionEvents.ts:28-33`) */
  const ctxOf = (s) => ({
    progress: s.progress,
    state: { puzzleFlags: s.puzzle, platformFlags: s.flags, hiddenGroups: 0 },
    // 2478 + n (`MapStreamer`의 `distortionHooks.giratinaAnim`) — 사건 명령 8이 세운다
    giratinaAnim: (n) => ((s.anim ?? 0) & (1 << n)) !== 0,
    cyrusAppearance: s.cyrus ?? 0,
  })

  /**
   * 승강 발판을 끝까지 탄다 (`scene/distortionElevator.ts:97-286`).
   *
   * 다리마다: 오르면 먼저 `upStartFlags`(`:119-126`) → 층 갈이에서 마지막 다리만 자리 표
   * set/clear(`:194-207`) → 끝에서 내려왔으면 `downEndFlags`(`:274-276`) → 닿은 칸의 판을
   * **갈래 안 가리고** 잡는다(`:283-284`)
   */
  const ride = (s, t) => {
    const legs = P.elevatorLegs(P.data.elevatorPaths, t.elevatorPathIndex)
    if (legs.length === 0) return null
    let flags = s.flags
    let map = s.map
    let at = [s.x, s.y, s.z]
    const up = t.elevatorDir === P.ELEVATOR_DIR.up
    for (const leg of legs) {
      if (up) flags = P.upStartFlags(flags, leg.path.index)
      const conn = P.connectionOf(P.data, map)
      const dest = up ? conn?.prev : conn?.next
      if (dest !== undefined && floorOf(dest) !== null) {
        if (leg.last) {
          flags = P.withFlag(flags, leg.path.persistedFlagToSet, true)
          flags = P.withFlag(flags, leg.path.persistedFlagToClear, false)
        }
        map = dest
      }
      at = [at[0] + leg.path.finalTileXOffset, at[1] + leg.path.finalTileYOffset,
        at[2] + leg.path.finalTileZOffset]
    }
    if (!up) flags = P.downEndFlags(flags, legs.at(-1).path.index)
    const f = floorOf(map)
    const pi = bindIndex(f, P.findPlatform(f.platforms, at[0], at[1], at[2]))
    // 닿으면 높이 계산을 켠다 (`SetHeightCalculationEnabledAndUpdate(TRUE)`)
    return {
      ...s, map, x: at[0], y: at[1], z: at[2], pi, flags, hc: true, strength: false,
      boulders: null,
    }
  }

  /**
   * 폭포를 끝까지 탄다 (`scene/distortionCascade.ts:69-156`).
   *
   * 층은 연결표의 다음/앞(`:159-178`), 닿는 칸은 뛰어든 칸 + `finishY`, 판은 **그 자리에서**
   * 잡고(`:142-143`) 그다음에 서쪽으로 `moveAway`칸을 옮긴다(`:148-151`). 내려갔으면 B5F의
   * 승강 발판 자리 7을 세운다(`:26` · `:153-155` — `PLATFORM_FLAG.b5f1`). 파도타기는 **안 푼다**
   * (그 파일에 `surfing`이 한 줄도 없다) — 서는 칸이 물이면 탄 채로 남고, 뭍이면 다음 프레임에
   * 내린다(`player.ts:597-606`)
   */
  const fall = (s, site) => {
    const conn = P.connectionOf(P.data, s.map)
    const dest = site.down ? conn?.next : conn?.prev
    if (dest === undefined || floorOf(dest) === null) return null
    const f = floorOf(dest)
    const y = s.y + site.finishY
    const pi = bindIndex(f, P.findPlatform(f.platforms, s.x, y, s.z))
    const step = P.DIR_STEP[2]
    const x = s.x + step.x * site.moveAway
    const z = s.z + step.z * site.moveAway
    let flags = s.flags
    if (site.down) flags = P.withFlag(flags, P.PLATFORM_FLAG.b5f1, true)
    // 내려오면 높이 계산을 켜고(웅덩이 128) 올라가 천장에 서면 끈다 (`..._FinishCascading`)
    const landed = {
      ...s, map: dest, x, y, z, pi, flags, facing: 2, hc: site.down, strength: false, boulders: null,
    }
    return { ...landed, surf: landed.surf && P.isOnWater(behaviorAt(landed, x, y, z), false) }
  }

  /**
   * 사건 하나를 끝까지 돌린다 (`scene/distortionEvents.ts:59-287`).
   *
   * 자리를 바꾸는 것은 둘이다 — 주인공을 태운 판 밀기(`movePlayer`, `:243-270`)와 주인공 뛰기
   * (`:272-287`). 둘 다 끝에서 판을 **갈래 안 가리고** 다시 잡는다. 나머지는 상태만 바꾸거나
   * 연출이다(`:128-171` — `default`로 떨어지는 7·8·10·12·13·14·2·3번은 **아무 일도 안 한다**)
   */
  // 사건이 내려놓은 칸에서는 닿은 칸 처리가 **안 돈다**(옮겨진 칸) — 그래서 여기서 다음 사건을 안 부른다.
  // 사건 하나는 몇 번이고 다시 돈다(REPAIR §101)
  const runEvent = (s, index, ev) => {
    const E = P.EVENT_CMD
    let n = { ...s }
    const f = floorOf(s.map)
    let script = null
    let wait = false
    for (const cmd of ev.cmds) {
      const p = cmd.params ?? {}
      switch (cmd.kind) {
        case E.startScript: script = p.scriptID; break
        case E.setProgress: n = { ...n, progress: p.progress }; break
        case E.setPuzzleFlag: n = { ...n, puzzle: n.puzzle | (1 << p.flagIndex) }; break
        case E.clearPuzzleFlag: n = { ...n, puzzle: n.puzzle & ~(1 << p.flagIndex) }; break
        case E.movePlatform:
          wait = true
          if (p.movePlayer === 1) {
            const x = n.x + (p.finalTileXOffset ?? 0)
            const y = n.y + (p.finalTileYOffset ?? 0)
            const z = n.z + (p.finalTileZOffset ?? 0)
            const pi = bindIndex(f, P.findPlatform(f.platforms, x, y, z))
            // 판 밖에 내려놓으면 높이 계산을 켠다 (`EventCmdMovePlatform_EndMovement`)
            n = { ...n, x, y, z, pi, hc: pi < 0 }
          }
          break
        case E.setMapObjectAnimation: {
          const dir = P.hopDirOf(p.movementAction ?? -1)
          if (dir === null || p.mapObjLocalID !== 255) break
          wait = true
          const st = P.DIR_STEP[dir]
          const x = n.x + st.x * P.HOP_TILES
          const z = n.z + st.z * P.HOP_TILES
          n = { ...n, x, z, facing: dir, pi: bindIndex(f, P.findPlatform(f.platforms, x, n.y, z)) }
          break
        }
        // 셋 다 도는 동안 조작이 안 먹는다(`MapStreamer.tsx:874-877`의 `riding` —
        // 그림자·도착은 사건이 서고, 방 발판 무리는 `distortionGhostRunning`이 막는다)
        case E.setGiratinaAnimationFlag:
          n = { ...n, anim: (n.anim ?? 0) | (1 << (p.anim ?? 0)) }
          break
        case E.showGiratinaShadow:
        case E.playGiratinaArrival:
        case E.showGiratinaRoomPlatforms:
        case E.hideGiratinaRoomPlatforms:
          wait = true
          break
        default:
          break
      }
    }
    return { state: n, script, wait, cmds: ev.cmds.map((c) => c.kind) }
  }

  /**
   * **닿은 칸**에서 도는 것 (`scene/distortion.ts:140-146`): 승강 발판 → 사건 → 스크립트 칸.
   *
   * @returns 아무 일도 없으면 null
   */
  const stepped = (s, dir) => {
    const tpl = P.data.movingPlatforms.find((m) => m.map === s.map)?.platforms ?? []
    const t = P.elevatorAt(tpl, s.flags, s.x, s.y, s.z)
    if (t !== null) {
      const to = ride(s, t)
      if (to !== null) {
        return {
          exit: { kind: 'elevator', dir: t.elevatorDir === P.ELEVATOR_DIR.up ? 'up' : 'down', index: t.index },
          state: to,
        }
      }
    }
    const table = P.data.events.find((e) => e.map === s.map)?.events ?? []
    const ctx = ctxOf(s)
    for (let i = 0; i < table.length; i++) {
      const ev = table[i]
      if (ev.x !== s.x || ev.y !== s.y || ev.z !== s.z) continue
      if (!P.flagHolds(ev.flagCond, ev.flagVal, ctx)) continue
      const run = runEvent(s, i, ev)
      return { event: { index: i, script: run.script, wait: run.wait, cmds: run.cmds }, state: run.state }
    }
    // `scene/distortionObjects.ts:11-23` — 방향은 **지금 보는 쪽**(`stepSystem.ts:343` `facingDir()`)
    for (const [name, t] of [['b7f', P.TELEPORT.b7f], ['giratinaRoom', P.TELEPORT.giratinaRoom]]) {
      if (s.map !== t.map || dir !== t.dir) continue
      if (s.x !== t.x || s.y !== t.y || s.z !== t.z) continue
      if (name === 'b7f' && s.progress < 10) continue
      const w = TELEPORT_WARP[name]
      const f = floorOf(w.map)
      // 스크립트의 `Warp`는 좌표를 **지역 칸**으로 받는다(`MapStreamer.tsx:412-418` — 층 오프셋을
      // 안 뺀다). 서는 높이는 층 오프셋 + 1(`distortionCore.ts:298-307`)
      const x = w.x + f.offsetX
      const z = w.z + f.offsetZ
      const y = f.offsetY + 1
      // 워프는 세이브 자리를 비운다(REPAIR §100) — 발밑의 판을 새로 찾고, 판 밖이면 높이 계산을 켜고,
      // 발판 자리는 닿은 층의 첫 값이다(`InitPersistedData`)
      const pi = bindIndex(f, P.findPlatform(f.platforms, x, y, z))
      const to = {
        ...s, map: w.map, x, y, z, facing: w.facing, strength: false, boulders: null, pi, hc: pi < 0,
        flags: P.initialPlatformFlags(w.map),
      }
      return { exit: { kind: 'teleport', script: t.script, to: w.map }, state: to }
    }
    return null
  }

  /** 칸을 옮긴 뒤: 판 다시 잡기 → 닿은 칸 (`stepSystem.ts:340-344`) */
  const arrive = (s, dir, act, extra = {}) => {
    const moved = { ...s, pi: rebind(s) }
    const hit = stepped(moved, dir)
    if (hit === null) return { act, state: moved, ...extra }
    return { act, state: hit.state, exit: hit.exit ?? null, event: hit.event ?? null, ...extra }
  }

  /** 난천이 막아선 칸 — **넘는 칸**으로 묻는다 (`cynthiaBlocksJump` · REPAIR §103) */
  const jumpBlocked = (s, dir) => {
    const st = P.STEP[P.PLATFORM.FLOOR][dir]
    return P.cynthiaBlocksJump(s.map, s.x + st[0], s.z + st[2], dir, s.progress)
  }

  /**
   * 방향키를 한 번 누른다 (`dir` = `DIR`). 결과 하나를 준다.
   *
   * @returns `{act, state, wait?, exit?, event?, push?}` — `act`:
   *   `jump`(판 갈아타기 16프레임) · `cascade`(층 이동) · `hop`(두 칸 뛰기 24프레임) · `ledge` ·
   *   `walk` · `wall`(벽에서 오르내림 — 닿은 칸 처리가 안 돈다) · `turn`(막혀서 돌기만) ·
   *   `push`/`drop`(괴력 바위)
   */
  const press = (s, dir) => onPress(s, dir) ?? hopFrom(s, dir) ?? walkFrom(s, dir)

  /**
   * ① 누르는 순간 서 있는 칸에서 (`scene/distortion.ts:124-132`): 뛰는 자리가 먼저, 뛰면 끝.
   * 없으면 폭포. 둘 다 없으면 null
   */
  const onPress = (s, dir) => {
    const f = floorOf(s.map)
    const j = P.jumpAt(f.jumps, s.x, s.y, s.z, dir)
    if (j !== null) {
      // 뛰는 것은 옮겨지는 것이라 닿은 칸 처리가 안 돈다(REPAIR §101). 뛰고 나면 높이 계산은 늘 꺼진다
      // (`JumpOnFloatingPlatform` — `u16 < 0`이 안 선다)
      const landed = {
        ...s, x: s.x + j.dx, y: s.y + j.dy, z: s.z + j.dz,
        pi: bindIndex(f, j.platformIndex), facing: j.facing, hc: false,
      }
      return { act: 'jump', wait: 'jump', state: landed }
    }
    const site = P.cascadeAt(s.map, s.x, s.y, s.z, dir)
    if (site !== null) {
      const to = fall(s, site)
      if (to !== null) return { act: 'cascade', wait: 'cascade', state: to, exit: { kind: 'cascade', down: site.down } }
    }
    return null
  }

  /**
   * ② 두 칸 뛰기(바닥·판 밖에서만, `player.ts:411-429`) → 턱(맵 격자로, 판 갈래와 상관없이
   * `player.ts:431-435` · `ledge.ts:122-147`). 둘 다 **속도의 부호**만 본다 — 그래서 손을 뗀 뒤
   * 남은 속도로도 뛴다(아래 `walkFrom`의 이어 뛰기). 없으면 null
   */
  const hopFrom = (s, dir) => {
    const f = floorOf(s.map)
    const kind = kindOf(s)
    const floorStep = P.STEP[P.PLATFORM.FLOOR][dir]
    const walk = P.STEP[kind === P.PLATFORM.NONE ? P.PLATFORM.FLOOR : kind][dir]
    // 속도는 `surfaceVector`를 지난 세계 벡터다(`player.ts:305`). 뛰기·턱은 그 x·z를 본다
    const vx = walk[0]
    const vz = walk[2]
    if (kind === P.PLATFORM.NONE || kind === P.PLATFORM.FLOOR) {
      const beh = behaviorAt(s, s.x + floorStep[0], s.y, s.z + floorStep[2])
      const jv = P.distortionJump(beh)
      if (jv !== null && jv[0] === floorStep[0] && jv[1] === floorStep[2] && !jumpBlocked(s, dir)) {
        const n = P.HOP_TWICE_TILES
        return arrive({ ...s, x: s.x + jv[0] * n, z: s.z + jv[1] * n, facing: dir }, dir, 'hop', { wait: 'hop' })
      }
    }
    const g = P.grid(s.map)
    if (g !== null && (vx !== 0 || vz !== 0)) {
      const [lx, , lz] = toLocal(f, s.x, s.y, s.z)
      const land = P.ledgeHop(g, lx + 0.5, lz + 0.5, vx, vz)
      if (land !== null) {
        const nx = Math.floor(land.x) + f.offsetX
        const nz = Math.floor(land.z) + f.offsetZ
        return arrive({ ...s, x: nx, z: nz, facing: dir }, dir, 'ledge', { wait: 'hop' })
      }
    }
    return null
  }

  /** ③ 걸음 (`player.ts:467-534`) */
  const walkFrom = (s, dir) => {
    const kind = kindOf(s)
    const floorStep = P.STEP[P.PLATFORM.FLOOR][dir]
    const walk = P.STEP[kind === P.PLATFORM.NONE ? P.PLATFORM.FLOOR : kind][dir]
    const tx = s.x + walk[0]
    const ty = s.y + walk[1]
    const tz = s.z + walk[2]
    if (blockedCell(s, tx, ty, tz)) {
      // 괴력: 막혔고 **앞 칸**에 바위가 있으면 민다 (`player.ts:471-479` → `obstacles.ts:44-59`).
      // 앞 칸은 로컬 얼굴의 `FACING_STEP`이다 — 판 밖에서는 로컬이 곧 세계다
      const b = s.strength && s.pi < 0 ? boulderAt(s, s.x + floorStep[0], s.z + floorStep[2]) : null
      if (b !== null) return push(s, b, dir)
      return { act: 'turn', state: { ...s, facing: dir } }
    }
    const moved = { ...s, x: tx, y: ty, z: tz, facing: dir }
    // 판 밖에서 높이 계산이 켜져 있으면 지형의 칸 높이를 딛는다 — B5F 웅덩이 128 · 뭍 129 (REPAIR §105)
    moved.y = groundAt(moved)
    // 뭍에 오르면 파도타기가 풀린다 (`player.ts`)
    if (moved.surf && !P.isOnWater(behaviorAt(moved, moved.x, moved.y, moved.z), false)) {
      moved.surf = false
    }
    // 벽의 오르내림도 한 걸음이다 — 떠나는 칸·닿은 칸 처리가 다 돈다 (REPAIR §106)
    const act = walk[0] === 0 && walk[2] === 0 ? 'wall' : 'walk'
    const through = { x: tx, y: ty, z: tz }
    // ⚠️ **새 칸에 든 그 틱에 누른 키는 아직 눌려 있다** — 칸이 바뀌어 「칸 × 방향」이 달라졌으니
    // 떠나는 칸 처리가 새 칸에서 다시 돈다(`stepSystem.ts:327-334`, 같은 틱에 닿은 칸보다 먼저).
    // 몰이꾼은 칸이 바뀐 것을 본 **뒤에야** 손을 뗄 수 있다
    const again = onPress(moved, dir)
    if (again !== null) return { ...again, through }
    const r = arrive(moved, dir, act)
    // 승강 발판·기다리는 사건·스크립트는 조작을 묶어 속도를 지운다(`player.ts:264-280`)
    if (r.exit || (r.event && (r.event.wait || r.event.script !== null))) return r
    // ⚠️ **손을 떼도 속도가 남는다**(`player.ts:309` — `lerp`라 0이 안 된다). 두 칸 뛰기·턱은
    // 속도의 부호만 보므로 새 칸에서 그 앞이 뛰는 칸이면 **돌아설 틈 없이 뛴다**
    const coast = hopFrom(r.state, dir)
    if (coast !== null) return { ...coast, through, event: r.event ?? coast.event ?? null }
    return r
  }

  /**
   * 바위를 한 칸 민다 (`obstacles.ts:44-59`).
   *
   * 떨어지는 자리면 떨어뜨리고 끝이다(`scene/distortionBoulder.ts:54-72`) — 막혔는지도 안 본다.
   * 아니면 앞이 격자로 막혔거나 다른 바위가 있으면 못 민다. 사람은 **안 본다**(`:56-58`).
   * 밀었으면 주인공이 빈 칸으로 한 걸음 든다(몰이꾼이 그 칸까지 잡고 간다 — 원작의 한 번 밀기)
   */
  const push = (s, b, dir) => {
    const f = floorOf(s.map)
    const st = P.STEP[P.PLATFORM.FLOOR][dir]
    const nx = b.x + st[0]
    const nz = b.z + st[2]
    const flag = P.fallLocationAt(s.map, nx, nz)
    if (flag !== null) {
      const dest = P.fallDestination(flag, s.puzzle)
      let puzzle = s.puzzle
      let boulders = s.boulders.filter((q) => q !== b)
      let script = null
      if (dest === P.FALL_DEST.b6f) puzzle = P.fellToB6F(puzzle, b.id)
      else if (dest === P.FALL_DEST.correctPit) {
        // 맞는 웅덩이: 바위가 웅덩이 바위(#144~146)로 바뀌어 떨어진 칸에서 민 쪽으로 한 칸 더 간 자리에
        // 서고, **웅덩이의** 스크립트가 선다 (`scene/distortionBoulder.ts` · REPAIR §109)
        const after = P.fellIntoPit(puzzle, b.id, flag)
        if (after !== null) {
          puzzle = after.flags
          script = after.script
          boulders = [...boulders, { id: after.localID, x: nx + st[0], z: nz + st[2], fixed: true }]
        }
      } else puzzle = P.fellIntoWrongPit(puzzle, b.id)
      return {
        act: 'drop', wait: script === null ? 'boulder' : 'script',
        drop: { id: b.id, dest, at: { x: nx, z: nz }, script },
        state: { ...s, boulders, puzzle, facing: dir },
      }
    }
    const g = P.grid(s.map)
    const [lx, , lz] = toLocal(f, nx, s.y, nz)
    if (g === null || g.isBlocked(lx, lz) || boulderAt(s, nx, nz) !== null) {
      return { act: 'turn', state: { ...s, facing: dir } }
    }
    const boulders = s.boulders.map((q) => (q === b ? { ...q, x: nx, z: nz } : q))
    return arrive({ ...s, boulders, x: b.x, z: b.z, facing: dir }, dir, 'push', { push: { id: b.id, to: { x: nx, z: nz } } })
  }

  /**
   * A 버튼의 앞 칸 (`field.ts`의 `tryTalk` → `frontTile()` — REPAIR §85).
   *
   * 판을 안다 — 그 판 갈래의 걸음 표(`P.STEP`)로 한 걸음 앞이다. 천장에서는 북이 z+1이고, 벽에서는
   * 앞뒤가 오르내림이다. 판 밖·바닥은 바닥 표다. (예전에는 A가 판을 몰라 천장에서 등 뒤를 집어서,
   * 계획이 물 반대쪽을 보게 **짧게 누르는** 수를 넣었다 — 이제 그럴 일이 없다)
   */
  const aDelta = (s, dir) => {
    const kind = kindOf(s)
    return P.STEP[kind === P.PLATFORM.NONE ? P.PLATFORM.FLOOR : kind][dir]
  }
  const aFront = (s, dir) => {
    const [dx, dy, dz] = aDelta(s, dir)
    return { x: s.x + dx, y: s.y + dy, z: s.z + dz }
  }

  /**
   * 제자리에서 `dir`을 보게 하는 키 한 번. 그 키가 **다른 일을 하면** null이다 —
   * 뛰는 자리·폭포·두 칸 뛰기가 먼저 걸리면 돌기만 할 수가 없다.
   *
   * @returns `{nudge}` — 걸을 수 있는 쪽이면 **짧게** 눌러 칸을 안 넘긴다(몰이꾼 §3의 `nudge`)
   */
  const turnTo = (s, dir) => {
    const r = press(s, dir)
    if (r.act === 'turn') return { nudge: false }
    if (r.act === 'walk' || r.act === 'wall') return { nudge: true }
    return null
  }

  /**
   * 파도타기에 오르는 수 — 앞 칸이 물이면 A → 「예」 (`field.ts:1098-1113` → `:1233-1237`).
   * 오르면 앞 칸으로 **x·z만** 옮기고(`hopTo`) 판은 그대로다
   */
  const surfFrom = (s) => {
    if (s.surf) return []
    const out = []
    for (let dir = 0; dir < 4; dir++) {
      const t = aFront(s, dir)
      const f = floorOf(s.map)
      const [lx, , lz] = toLocal(f, t.x, t.y, t.z)
      if (solidAt(s, lx, lz)) continue // 사람이 먼저다 (`field.ts:969-977`)
      if (!P.isSurfable(behaviorAt(s, t.x, t.y, t.z))) continue
      if (blockedCell({ ...s, surf: true }, t.x, t.y, t.z)) continue
      const turn = turnTo(s, dir)
      if (turn === null) continue
      const hopped = { ...s, x: t.x, z: t.z, surf: true, facing: dir }
      // 물에 올라서면 그 칸의 지형 높이를 딛는다 — 뭍(129)에서 B5F 웅덩이(128)로 (REPAIR §105)
      const on = { ...hopped, y: groundAt(hopped) }
      out.push({ dir, nudge: turn.nudge, result: arrive(on, dir, 'surf', { wait: 'surf' }) })
    }
    return out
  }

  return {
    floorOf, toLocal, kindOf, behaviorAt, blockedCell, press, push, stepped, aFront, aDelta, turnTo,
    surfFrom, ride, fall, boulderAt,
  }
}

// ── 한 층 안의 길 ────────────────────────────────────────────────────────────

const keyOf = (s) => `${s.x},${s.y},${s.z},${s.pi},${s.surf ? 1 : 0},${s.hc ? 1 : 0},${s.progress},${s.puzzle},${s.anim ?? 0}`

/** 몰이꾼에게 넘기는 기대값 — 세계 칸 · 지역 칸 · 판 번호 (`DISTORTION_HARNESS.md` §3) */
function expectOf(M, s) {
  const f = M.floorOf(s.map)
  const [lx, ly, lz] = M.toLocal(f, s.x, s.y, s.z)
  return {
    map: s.map, x: s.x, y: s.y, z: s.z, local: { x: lx, y: ly, z: lz },
    pi: s.pi, surf: s.surf, facing: s.facing, progress: s.progress,
  }
}

/** 결과 하나를 몰이꾼의 한 걸음으로 */
function stepOf(M, key, r, extra = {}) {
  return {
    key, act: r.act, wait: r.wait ?? null, ...extra,
    exit: r.exit ?? null,
    event: r.event ?? null,
    push: r.push ?? r.drop ?? null,
    expect: expectOf(M, r.state),
  }
}

/**
 * 한 층 안에서 목표까지 — 방향키와 파도타기만으로 (BFS, 누름 수 최소).
 *
 * @param start 상태 `{map, x, y, z, pi, facing, surf, strength, progress, flags, puzzle, hc, anim,
 *   boulders:[{id,x,z}]}` (세계 칸). `hc`는 높이 계산이 켜져 있는가, `anim`은 그림자 표식 둘(2478·2479)의 비트다
 * @param goal `(r, from) => boolean` — `r`은 `press`의 결과(나간 길 `exit` · 사건 `event` 포함)
 * @param opts.surf `'never' | 'auto'(마른 길이 없을 때만) | 'always'`
 * @param opts.stopAtScript 스크립트가 서는 사건을 **끝**으로 친다(기본 참) — 스크립트가 주인공을
 *   옮길 수 있어서 그 뒤는 몰이꾼이 다시 계획한다
 * @returns `{steps, end, explored}` 또는 null
 */
export function planFloor(P, s0, goal, { surf = 'auto', cap = 400_000, stopAtScript = true } = {}) {
  const M = distortionModel(P)
  const start = withBoulders(P, s0)
  const run = (allowSurf) => {
    const first = { s: start, from: null, steps: null }
    const seen = new Set([keyOf(start)])
    const queue = [first]
    for (let head = 0; head < queue.length && head < cap; head++) {
      const node = queue[head]
      const s = node.s
      const moves = []
      for (let dir = 0; dir < 4; dir++) {
        const r = M.press(s, dir)
        moves.push({ r, steps: [stepOf(M, KEYS[dir], r)] })
      }
      if (allowSurf) {
        for (const m of M.surfFrom(s)) {
          moves.push({
            r: m.result,
            steps: [
              stepOf(M, KEYS[m.dir], { act: m.nudge ? 'nudge' : 'turn', state: { ...s, facing: m.dir } }),
              stepOf(M, 'A', m.result, { prompt: 'surf' }),
            ],
          })
        }
      }
      for (const { r, steps } of moves) {
        if (goal(r, s)) {
          const out = [...steps]
          for (let at = node; at.steps !== null; at = at.from) out.unshift(...at.steps)
          return { steps: out, end: r.state, explored: head, result: r }
        }
        // 층을 나가는 길은 목표가 아니면 거기서 끊는다
        if (r.exit) continue
        if (r.act === 'turn') continue
        // 걷다가 바위를 밀면 안 된다 — 미는 것은 `planBoulders`만 한다
        if (r.act === 'push' || r.act === 'drop') continue
        if (stopAtScript && r.event?.script !== null && r.event?.script !== undefined) continue
        const k = keyOf(r.state)
        if (seen.has(k)) continue
        seen.add(k)
        queue.push({ s: r.state, from: node, steps })
      }
    }
    return null
  }
  if (surf === 'never') return run(false)
  if (surf === 'always') return run(true)
  return run(false) ?? run(true)
}

/** 그 칸에 서면 된다 */
export const goalTile = (t) => (r) => r.state.x === t.x && r.state.z === t.z
  && (t.y === undefined || r.state.y === t.y) && !r.exit && r.act !== 'turn'

/** 진행도를 `n`으로 세우는 사건을 밟는다 (사건 표의 `setProgress` — `distortionEvents.ts:133-135`) */
export const goalProgress = (n) => (r) => r.event !== null && r.event !== undefined && r.state.progress === n

/** 층을 나간다 — `kind`: `elevator` · `cascade` · `teleport`. `dir`: `up`·`down`(승강 발판) */
export const goalExit = (kind, dir = null) => (r) => r.exit !== null && r.exit !== undefined
  && r.exit.kind === kind && (dir === null || r.exit.dir === dir)

/** 아래층으로 — 승강 발판이든 폭포든 */
export const goalDown = () => (r) => {
  if (!r.exit) return false
  if (r.exit.kind === 'cascade') return r.exit.down
  return r.exit.kind === 'elevator' && r.exit.dir === 'down'
}

/**
 * 사람에게 말을 건다 — 그 사람을 앞 칸으로 두는 자리에 서서 그쪽으로 돌고 A (`field.ts`의 `tryTalk`).
 *
 * A의 앞 칸은 서 있는 판의 걸음 표로 한 걸음이다(`frontTile` — REPAIR §85). 깨어진 세계는 x·y·z 셋을 다
 * 견주므로(`Field_DistortionInteract` · REPAIR §107) 벽 위의 사람(B2F 난천)은 벽 위에서 오르내림 쪽으로
 * 마주 봐야 한다. 도는 키가 걸음이 되는 자리는 없다 — 사람이 그 칸을 막고 있어서 **제자리 돌기**다.
 *
 * @param target `{x, y?, z}` 세계 칸 — y가 없으면 x·z만 본다
 */
export function planTalk(P, start, target, opts = {}) {
  const M = distortionModel(P)
  const facing = (q) => {
    for (let dir = 0; dir < 4; dir++) {
      const t = M.aFront(q, dir)
      if (t.x === target.x && t.z === target.z && (target.y === undefined || t.y === target.y)) return dir
    }
    return -1
  }
  let walk = { steps: [], end: start }
  if (facing(start) < 0) {
    walk = planFloor(P, start, (r) => !r.exit && r.act !== 'turn' && facing(r.state) >= 0, opts)
    if (walk === null) return null
  }
  const s = walk.end
  const dir = facing(s)
  const turn = M.turnTo(s, dir)
  if (turn === null) return null
  const faced = { ...s, facing: dir }
  const steps = [...walk.steps]
  if (s.facing !== dir) {
    steps.push(stepOf(M, KEYS[dir], { act: turn.nudge ? 'nudge' : 'turn', state: faced }))
  }
  steps.push(stepOf(M, 'A', { act: 'talk', state: faced }, { prompt: 'talk', target }))
  return { steps, end: faced }
}

// ── 바위 수수께끼 (B5F · B6F) ───────────────────────────────────────────────

/**
 * 바위를 떨어뜨리는 차례를 찾는다 — 한 번에 바위 하나씩, 다른 바위는 벽으로 두고.
 *
 * 한 수는 「바위 뒤 칸까지 걸어가서 한 번 민다」다. 걷는 길은 `planFloor`(두 칸 뛰기·턱 포함)가
 * 잰다. 민 결과는 제품 규칙(`push`)이 정한다: 떨어지는 자리면 떨어지고(`fallLocationAt`), 아니면
 * 격자·바위가 막지 않을 때만 한 칸 간다.
 *
 * @param want `(drop) => boolean` — 떨어뜨려도 되는 자리인가. B5F는 아무 구멍이나(`b6f`),
 *   B6F는 **맞는 웅덩이만**(`correctPit`) — 틀린 웅덩이에 빠진 바위는 B5F로 되돌아간다
 *   (`distortionBoulder.ts:14-16`)
 * @returns `{steps, end}` 또는 null
 */
export function planBoulders(P, start, want, { order = null } = {}) {
  const M = distortionModel(P)
  const ids = order ?? start.boulders.map((b) => b.id)
  const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) =>
    perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])))
  for (const seq of order ? [ids] : perms(ids)) {
    let s = start
    const steps = []
    let ok = true
    for (const id of seq) {
      const one = solveOne(P, M, s, id, want)
      if (one === null) { ok = false; break }
      steps.push(...one.steps)
      s = one.end
    }
    if (ok) return { steps, end: s, order: seq }
  }
  return null
}

/** 바위 하나를 떨어뜨린다 — (바위 자리 · 주인공이 설 수 있는 곳)로 BFS */
function solveOne(P, M, start, id, want, cap = 20_000) {
  const DIRS = [0, 1, 2, 3]
  const first = { s: start, from: null, steps: null }
  const seen = new Set()
  const queue = [first]
  for (let head = 0; head < queue.length && head < cap; head++) {
    const node = queue[head]
    const s = node.s
    const b = s.boulders.find((q) => q.id === id)
    if (b === undefined) continue
    for (const dir of DIRS) {
      const st = P.STEP[P.PLATFORM.FLOOR][dir]
      const behind = { x: b.x - st[0], z: b.z - st[2] }
      // 바위 뒤에 선다 — 이미 서 있으면 걷지 않는다
      let walk = { steps: [], end: s }
      if (s.x !== behind.x || s.z !== behind.z) {
        walk = planFloor(P, s, goalTile(behind), { surf: 'never' })
        if (walk === null) continue
      }
      let at = walk.end
      const steps = [...walk.steps]
      // 괴력이 안 켜졌으면: 바위 쪽으로 돌고(막혀서 제자리 돌기) A → 「예」
      // (`field.ts:969-977` → 바위의 스크립트 10002 → `runFieldMove('strength')` `field.ts:1210-1215`)
      if (!at.strength) {
        const [ax, , az] = M.aDelta(at, dir)
        if (at.x + ax !== b.x || at.z + az !== b.z) continue
        if (at.facing !== dir) {
          const turn = M.turnTo(at, dir)
          if (turn === null) continue
          at = { ...at, facing: dir }
          steps.push(stepOf(M, KEYS[dir], { act: turn.nudge ? 'nudge' : 'turn', state: at }))
        }
        at = { ...at, strength: true }
        steps.push(stepOf(M, 'A', { act: 'strength', state: at }, { prompt: 'strength', target: { x: b.x, z: b.z } }))
      }
      const r = M.press(at, dir)
      if (r.act !== 'push' && r.act !== 'drop') continue
      steps.push(stepOf(M, KEYS[dir], r))
      if (r.act === 'drop') {
        if (!want(r.drop)) continue
        const out = [...steps]
        for (let n = node; n.steps !== null; n = n.from) out.unshift(...n.steps)
        return { steps: out, end: r.state }
      }
      const nb = r.state.boulders.find((q) => q.id === id)
      const k = `${nb.x},${nb.z},${r.state.x},${r.state.z},${r.state.puzzle}`
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ s: r.state, from: node, steps })
    }
  }
  return null
}

// ── 층을 건너는 길 ───────────────────────────────────────────────────────────
//
// ⚠️ **한 층 안에서는 안 풀린다.** B5F 아그놈 바위(98,67)는 **동쪽에서만** 밀린다 — 그 옆 칸
// (99,67)은 폭포 웅덩이 쪽 주머니고, 그 주머니는 바위가 막고 있어서 B5F 본채에서는 못 간다.
// 들어가는 길은 B4F 천장에서 폭포를 타고 내려오는 것 하나다(시험의 「B5F 웅덩이」). 그리고 B4F
// 천장에 닿는 동쪽 벽은 B3F 둘째 칸(95,193,70)의 승강 발판 아래에만 있고, 그 칸은 B4F
// (79,161,62)에서 올라가야 닿는다 — 그래서 **층을 오르내리는 길 찾기**가 필요하다.

/** 한 층 안에서 닿는 나가는 길 전부 — 도착 상태가 같은 것은 가장 짧은 하나만 */
export function floorExits(P, start, { cap = 400_000 } = {}) {
  const M = distortionModel(P)
  const s0 = withBoulders(P, start)
  const out = new Map()
  const first = { s: s0, from: null, steps: null }
  const seen = new Set([keyOf(s0)])
  const queue = [first]
  const trail = (node, tail) => {
    const steps = [...tail]
    for (let at = node; at.steps !== null; at = at.from) steps.unshift(...at.steps)
    return steps
  }
  for (let head = 0; head < queue.length && head < cap; head++) {
    const node = queue[head]
    const s = node.s
    const moves = []
    for (let dir = 0; dir < 4; dir++) {
      const r = M.press(s, dir)
      moves.push({ r, steps: [stepOf(M, KEYS[dir], r)] })
    }
    for (const m of M.surfFrom(s)) {
      moves.push({
        r: m.result,
        steps: [
          stepOf(M, KEYS[m.dir], { act: m.nudge ? 'nudge' : 'turn', state: { ...s, facing: m.dir } }),
          stepOf(M, 'A', m.result, { prompt: 'surf' }),
        ],
      })
    }
    for (const { r, steps } of moves) {
      if (r.exit) {
        const e = r.state
        const k = `${e.map},${e.x},${e.y},${e.z},${e.pi},${e.surf ? 1 : 0},${e.flags},${e.puzzle},${e.progress}`
        if (!out.has(k)) out.set(k, { steps: trail(node, steps), end: e, exit: r.exit })
        continue
      }
      if (r.act === 'turn' || r.act === 'push' || r.act === 'drop') continue
      if (r.event?.script !== null && r.event?.script !== undefined) continue
      const k = keyOf(r.state)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ s: r.state, from: node, steps })
    }
  }
  return [...out.values()]
}

/**
 * 층을 건너 목표 상태까지 — 다리(한 층 안의 걸음 + 나가는 길)를 잇는다. 걸음 수가 적은 순.
 *
 * @param goal `(s) => boolean` — 층에 닿은 상태(또는 바위를 떨어뜨린 직후)가 목표인가
 * @param opts.drop `(drop) => boolean` — 주면 바위 떨어뜨리기도 한 다리로 친다(`dropMap` 층에서만)
 * @returns `{legs: [{map, steps, end, exit|drop}], end}` 또는 null
 */
export function planRoute(P, start, goal, { drop = null, dropMap = null, maxNodes = 600 } = {}) {
  const M = distortionModel(P)
  const nodeKey = (s) => `${s.map},${s.x},${s.y},${s.z},${s.pi},${s.surf ? 1 : 0},${s.flags},${s.puzzle},${s.progress}`
  const open = [{ s: start, cost: 0, legs: [] }]
  const done = new Set()
  let n = 0
  while (open.length > 0 && n < maxNodes) {
    open.sort((a, b) => a.cost - b.cost)
    const cur = open.shift()
    const k = nodeKey(cur.s)
    if (done.has(k)) continue
    done.add(k)
    n++
    if (cur.legs.length > 0 && goal(cur.s)) return { legs: cur.legs, end: cur.s, explored: n }
    for (const e of floorExits(P, cur.s)) {
      open.push({
        s: e.end, cost: cur.cost + e.steps.length,
        legs: [...cur.legs, { map: cur.s.map, steps: e.steps, end: e.end, exit: e.exit }],
      })
    }
    if (drop !== null && (dropMap === null || cur.s.map === dropMap)) {
      const s = withBoulders(P, cur.s)
      for (const b of s.boulders.filter((q) => !q.fixed)) {
        const one = solveOne(P, M, s, b.id, drop)
        if (one === null) continue
        open.push({
          s: one.end, cost: cur.cost + one.steps.length,
          legs: [...cur.legs, { map: s.map, steps: one.steps, end: one.end, drop: b.id }],
        })
      }
    }
  }
  return null
}

/**
 * 그 층에 지금 선 사람과 바위 (`scene/distortionObjects.ts:113-133` — `spawnFloorObjects`와 같은
 * 조건: `manualAddOnly`는 빼고, `flagHolds`를 지나고, 숨김 플래그가 안 섰어야 한다).
 *
 * 몰이꾼이 **지금 층**의 살아 있는 배우를 넘기면(`P.solidAt`·상태의 `boulders`) 그것이 이긴다 —
 * 스크립트가 옮긴 사람은 표 자리에 없다. 다른 층(길 찾기로 미리 보는 층)은 표로 본다
 */
export function tableActors(P, s) {
  const rows = P.data.mapObjects.find((m) => m.map === s.map)?.objects ?? []
  const ctx = {
    progress: s.progress, state: { puzzleFlags: s.puzzle, platformFlags: s.flags, hiddenGroups: 0 },
    giratinaAnim: (i) => ((s.anim ?? 0) & (1 << i)) !== 0, cyrusAppearance: s.cyrus ?? 0,
  }
  const out = []
  for (const row of rows) {
    if (row.flagCond === P.FLAG_COND.manualAddOnly) continue
    if (!P.flagHolds(row.flagCond, row.flagCondVal, ctx)) continue
    if (row.hiddenFlag !== 0 && (P.checkFlag?.(row.hiddenFlag) ?? false)) continue
    // y는 고정소수점 세계 높이다 (`distortionObjects.ts`의 `FX32_PER_TILE`)
    out.push({ id: row.localID, gfx: row.graphicsID, x: row.x, y: Math.round(row.y / 65536), z: row.z })
  }
  return out
}

/** 괴력 바위 그림 번호 (`engine/actor/obstacles.ts:30` `STRENGTH_BOULDER`) — `P.STRENGTH_BOULDER`로 받는다 */
export function withBoulders(P, s) {
  if (s.boulders !== null && s.boulders !== undefined) return s
  const boulders = tableActors(P, s).filter((a) => a.gfx === P.STRENGTH_BOULDER)
    .map((a) => ({ id: a.id, x: a.x, z: a.z }))
  return { ...s, boulders }
}

// ── 이야기 차례 (`distortion_rom.md` §M/§N · `include/constants/distortion_world.h`) ──────────

/**
 * 층에 들어서면 도는 장면이 세우는 진행도 (`scripts_init_distortion_world_*.s`의 프레임 표).
 * **몰이꾼은 이 값을 쓰지 않는다** — 실제 값을 읽는다. 시험의 이어 달리기만 쓴다
 */
export const ON_ARRIVAL = {
  573: [0, 1], // `scripts_init_distortion_world_1f.s:9` → `scripts_distortion_world_1f.s:77`
  574: [2, 3], // `scripts_init_distortion_world_b1f.s:9` → `scripts_distortion_world_b1f.s:24`
  581: [7, 8], // `scripts_init_distortion_world_b7f.s` → `scripts_distortion_world_b7f.s:33`
}

/**
 * 할 일의 차례. 앞에서부터 **끝나지 않은 첫 줄**이 지금 할 일이다.
 *
 * - `event` — 그 진행도를 세우는 사건 칸을 밟는다(사건 표의 `setProgress`)
 * - `drop` — B5F 바위 셋을 구멍에(`FALL_DEST.b6f`) · `pits` — B6F 맞는 웅덩이에(`correctPit`)
 * - `talk` — 그 번호의 사람 앞에서 A. 자리는 살아 있는 배우(몰이꾼)나 표에서 읽는다
 */
export const STORY = [
  // 1F: 첫 장면(0→1) 뒤 승강판 앞 칸 (40,289,52) → 2 (사건 표 573)
  { map: 573, kind: 'event', progress: 2 },
  // B1F: 들어서면 장면(2→3), 엠라이트 칸 (15,257,58) → 4 (사건 표 574)
  { map: 574, kind: 'event', progress: 4 },
  // B2F: 서쪽 벽의 난천(#128 @30,233,20)가 벽의 통로를 막는다 — 말을 걸면 벽에서 한 칸 내려서고(106)
  // → 5 (`scripts_distortion_world_b2f.s`). 판 위의 사람도 막으므로(REPAIR §107) 건너뛸 수 없다
  { map: 575, kind: 'talk', localID: 128, done: 5 },
  // B3F: 태홍 칸 (65,193,41) → 6
  { map: 576, kind: 'event', progress: 6 },
  // B5F: 바위 셋을 구멍으로 (`sBoulderFallLocations` 앞 셋 — `distortionBoulder.ts:79-81`)
  { map: 579, kind: 'drop' },
  // B6F: 맞는 웅덩이 셋 → 난천(#134) → 7 (`scripts_distortion_world_b6f.s:22-34`)
  { map: 580, kind: 'pits' },
  { map: 580, kind: 'talk', localID: 134, done: 7 },
  // B7F: 사건 (84~86,65,76) → 9 · 태홍(#129) 배틀 이기면 → 10 (`_b7f.s:56-59`)
  { map: 581, kind: 'event', progress: 9 },
  { map: 581, kind: 'talk', localID: 129, done: 10 },
  // 기라티나 방: (15,24)→11 · (15,17)→12 · (15,14)→13 (사건 표 582)
  { map: 582, kind: 'event', progress: 11 },
  { map: 582, kind: 'event', progress: 12 },
  { map: 582, kind: 'event', progress: 13 },
  // 기라티나(#128 @15,13) → 배틀 뒤 OnLoad가 14 (`_giratina_room.s:25`) · 포털(#131 @15,13) → 송별의 샘
  { map: 582, kind: 'talk', localID: 128, done: 14 },
  { map: 582, kind: 'talk', localID: 131, done: null },
]

/** B5F에 바위가 남았는가 — 표의 `boulderTrue` 조건 그대로(`distortionTables` 579) */
const b5fBoulders = (P, s) => withBoulders(P, { ...s, map: P.MAP.b5f, boulders: null }).boulders.length

/**
 * 그 줄이 끝났는가. 바위 둘은 진행도 7(`FINISHED_BOULDER_PUZZLE`)을 넘었으면 끝난 것이다 —
 * 그 뒤로는 바위 자리를 안 본다(세이브를 이어 연 판은 처음 값이 「풀었다」다,
 * `distortionBoulder.ts:50-58`)
 */
export function stageDone(P, s, o) {
  switch (o.kind) {
    case 'event': return s.progress >= o.progress
    case 'talk': return o.done !== null && s.progress >= o.done
    case 'drop': return s.progress >= 7 || b5fBoulders(P, s) === 0
    case 'pits': return s.progress >= 7 || P.puzzleSolved(s.puzzle)
    default: return false
  }
}

export function nextStage(P, s) {
  return STORY.find((o) => !stageDone(P, s, o)) ?? null
}

/**
 * **지금 할 일 하나**의 계획 — 다른 층이면 그 층까지의 길(층 건너기)부터.
 *
 * 몰이꾼은 **다리 하나(`legs[0]`)만** 밟고 다시 부른다: 층에 들어서면 장면이 사람을 옮기고,
 * 사건 스크립트도 옮긴다(`scripts_distortion_world_1f.s:40` 따위). 계획이 맞는지는 걸음마다
 * `expect`로 본다.
 *
 * @param person `(localID) => {x, y?, z} | null` — 말 걸 사람의 **지금** 세계 칸(없으면 표)
 * @returns `{stage, legs: [{map, steps, end, exit?|drop?|talk?|event?}], end}` 또는 null
 */
export function planNext(P, start, person = () => null) {
  const stage = nextStage(P, start)
  if (stage === null) return null
  const s = withBoulders(P, start)
  if (stage.kind === 'drop' || stage.kind === 'pits') {
    const want = stage.kind === 'drop'
      ? (d) => d.dest === P.FALL_DEST.b6f
      : (d) => d.dest === P.FALL_DEST.correctPit
    // 떨어뜨릴 층에 닿기 전에는 나가는 길만, 닿으면 떨어뜨리기도 한 다리다
    const route = planRoute(P, s, (q) => stageDone(P, q, stage), { drop: want, dropMap: stage.map })
    return route === null ? null : { stage, ...route }
  }
  let pre = []
  let at = s
  if (s.map !== stage.map) {
    const route = planRoute(P, s, (q) => q.map === stage.map)
    if (route === null) return null
    pre = route.legs
    at = route.end
    // 다른 층의 일은 닿은 뒤에 다시 세운다 — 닿는 순간의 장면이 사람을 옮긴다
    return { stage, legs: pre, end: at }
  }
  if (stage.kind === 'event') {
    const r = planFloor(P, at, goalProgress(stage.progress))
    if (r === null) return null
    return { stage, legs: [{ map: at.map, steps: r.steps, end: r.end, event: r.result.event }], end: r.end }
  }
  // talk
  const who = person(stage.localID)
    ?? tableActors(P, at).find((a) => a.id === stage.localID) ?? null
  if (who === null) return null
  const r = planTalk(P, at, { x: who.x, y: who.y, z: who.z })
  if (r === null) return null
  return { stage, legs: [{ map: at.map, steps: r.steps, end: r.end, talk: stage.localID }], end: r.end }
}

// ── 벽 속에서 나오기 (기본 꺼짐) ─────────────────────────────────────────────

/**
 * **벽 속에 선 채로 시작했을 때** 제품의 안전망(`player.ts:481-523`)으로 걸어 나오는 걸음.
 *
 * ⚠️ **기본으로 안 쓴다 — 부르는 쪽이 깃발로 켜고, 켰다는 것을 증거에 적는다.** 이 길이 필요한
 * 것은 제품의 결함 하나 때문이다: 창기둥의 `Warp …_1F, 55, 40`(롬의 **세계** 좌표)을 제품이
 * **지역** 좌표로 받아 1F 지역 (55,40) — 벽 속에 세운다(`DISTORTION_HARNESS.md` §6-1).
 * 사람도 그 자리에서는 이 안전망으로만 나온다.
 *
 * 안전망의 규칙 그대로다: 발밑이 격자로 막혔으면 `standableSpot`(반경 8칸)을 찾고, 있으면
 * **그쪽으로 가까워지는 축만** 걷게 하고(`leaving`), 없으면 어느 쪽이든 걷게 둔다(`anywhere`).
 * 없을 때 어느 쪽으로 갈지는 제품이 안 정하므로, 막힘을 무시한 거리로 **가장 가까운 열린 칸**
 * 쪽으로 간다
 *
 * @param P `standableSpot`(`engine/map/world.ts:485`)을 더 받는다
 * @returns `{steps, end}` — 걸음의 `act`는 `escape`다. 벽 속이 아니면 빈 걸음
 */
export function planEscape(P, s0, { cap = 400 } = {}) {
  const M = distortionModel(P)
  const f = M.floorOf(s0.map)
  const g = P.grid(s0.map)
  if (s0.pi >= 0 || g === null) return null
  let s = { ...s0 }
  const steps = []
  const inWall = (q) => {
    const [lx, , lz] = M.toLocal(f, q.x, q.y, q.z)
    return g.isBlocked(lx, lz)
  }
  /** 막힘을 무시한 너비 우선으로 가장 가까운 열린 칸 (지역) */
  const nearestOpen = (lx, lz) => {
    const seen = new Set([`${lx},${lz}`])
    let ring = [[lx, lz]]
    for (let d = 0; d < 256 && ring.length > 0; d++) {
      const next = []
      for (const [cx, cz] of ring) {
        for (const [ax, az] of [[cx, cz + 1], [cx + 1, cz], [cx - 1, cz], [cx, cz - 1]]) {
          const k = `${ax},${az}`
          if (seen.has(k) || ax < 0 || az < 0 || ax >= g.tileWidth || az >= g.tileHeight) continue
          seen.add(k)
          if (!g.isBlocked(ax, az)) return [ax, az]
          next.push([ax, az])
        }
      }
      ring = next
    }
    return null
  }
  for (let n = 0; n < cap && inWall(s); n++) {
    const [lx, , lz] = M.toLocal(f, s.x, s.y, s.z)
    const spot = P.standableSpot(g, lx + 0.5, lz + 0.5)
    let to = [Math.floor(spot.x), Math.floor(spot.z)]
    if (to[0] === lx && to[1] === lz) to = nearestOpen(lx, lz)
    if (to === null) return null
    const dir = to[0] !== lx ? (to[0] > lx ? 3 : 2) : (to[1] > lz ? 1 : 0)
    const st = P.DIR_STEP[dir]
    s = { ...s, x: s.x + st.x, z: s.z + st.z, facing: dir }
    steps.push(stepOf(M, KEYS[dir], { act: 'escape', state: s }))
  }
  return inWall(s) ? null : { steps, end: s }
}
