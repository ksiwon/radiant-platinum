// 살아 있는 NPC 세우고 지우기 (`npcs.ts`)
//
// 컷신이 사람을 부르고 보내는 자리다 (`AddObject` 121곳 · `RemoveObject` 309곳).
// 조용히 틀릴 곳이 둘이다:
//
//   ① **지운 사람이 숨김 플래그를 남겨야 한다.** 안 남기면 문을 한 번 여닫는
//      것으로 사라진 사람이 되살아난다.
//   ② **배치표를 고치는 것과 사람을 옮기는 것이 다르다.** `SetObjectEventPos`는
//      **다음에 세울 사람**에게 먹고, 지금 서 있는 사람은 안 움직인다
//      (`MapHeaderData_SetObjectEventPos`).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import {
  hideFlagOf, isCloneNpc, npcsOf, world as mapWorld, type EventFile, type MapHeader,
} from '../map/world'
import { VAR_PLAYER_STARTER } from '../script/commands'
import { VarStore } from '../script/vars'
import {
  addNpc, clearNpcPlacement, clearNpcs, npcActors, removeNpc, resolveGfx, setNpcPlacement,
  spawnNpcs,
} from './npcs'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('events.json')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 떡잎마을. 사람이 여럿이고 숨김 플래그가 걸린 사람도 있다 */
const TWINLEAF = 411

maybe('살아 있는 NPC', () => {
  let vars: VarStore

  beforeEach(() => {
    mapWorld.maps = read('maps.json').maps as MapHeader[]
    mapWorld.events = read('events.json').events as Record<string, EventFile>
    vars = new VarStore()
    clearNpcs()
  })

  it('숨김 플래그가 선 사람은 아예 안 세운다', () => {
    spawnNpcs(TWINLEAF, vars)
    const hidden = npcActors.list.find((a) => a.info.flag !== null)
    expect(hidden).toBeDefined()
    const flag = hidden!.info.flag!
    const before = npcActors.list.length
    // ⚠️ **플래그 하나에 여러 명이 걸린다.** 라이벌 집처럼 한 장면이 통째로
    // 나타나고 사라지는 자리가 그렇다 — 한 명씩 세면 이 시험이 틀린다
    const share = npcActors.list.filter((a) => a.info.flag === flag).length
    expect(share).toBeGreaterThan(0)

    vars.setFlag(flag)
    spawnNpcs(TWINLEAF, vars)
    expect(npcActors.list.length).toBe(before - share)
    expect(npcActors.byLocalID.has(hidden!.localID)).toBe(false)
  })

  it('AddObject가 배치표에서 한 명을 되살린다', () => {
    spawnNpcs(TWINLEAF, vars)
    const someone = npcActors.list[0]!
    const localID = someone.localID
    const at = { x: someone.x, z: someone.z }

    expect(removeNpc(localID)).toBe(someone.info.flag)
    expect(npcActors.byLocalID.has(localID)).toBe(false)

    expect(addNpc(localID, vars)).toBe(true)
    const back = npcActors.byLocalID.get(localID)
    expect(back).toBeDefined()
    // 배치표 자리로 돌아온다 — 지웠을 때의 자리가 아니다
    expect({ x: back!.x, z: back!.z }).toEqual(at)
  })

  it('배치표에 없는 번호는 못 세운다', () => {
    spawnNpcs(TWINLEAF, vars)
    expect(addNpc(9999, vars)).toBe(false)
  })

  it('이미 서 있으면 두 번 안 세운다', () => {
    spawnNpcs(TWINLEAF, vars)
    const before = npcActors.list.length
    expect(addNpc(npcActors.list[0]!.localID, vars)).toBe(true)
    expect(npcActors.list.length).toBe(before)
  })

  /**
   * `SetObjectEventPos` + `AddObject`가 짝이다. 컷신이 자리를 적어 두고 그
   * 자리에 사람을 세운다 — 배치표를 고치는 명령만 만들고 이 짝을 안 이으면
   * 사람이 원래 자리에 나타난다
   */
  it('배치표를 고쳐 두면 그 자리에 세워진다', () => {
    spawnNpcs(TWINLEAF, vars)
    const someone = npcActors.list[0]!
    const localID = someone.localID
    removeNpc(localID)

    setNpcPlacement(localID, { x: 40, z: 41 })
    setNpcPlacement(localID, { dir: 3 })
    addNpc(localID, vars)
    const back = npcActors.byLocalID.get(localID)!
    expect({ x: back.x, z: back.z, dir: back.dir }).toEqual({ x: 40, z: 41, dir: 3 })
  })

  /**
   * ⚠️ **세울 때도 배치표 수정을 본다.**
   *
   * 맵 초기화 스크립트(`OnTransition`)가 사람을 세우기 **전에** 돌면서 자리를
   * 바꿔 놓는다 — 예진호수의 마박사가 이야기 단계에 따라 세 자리 중 하나에
   * 선다. 그래서 `spawnNpcs`가 수정을 지우면 안 되고, 지우는 것은 맵을 옮기는
   * 쪽이다(`clearNpcPlacement`)
   */
  it('초기화 스크립트가 적어 둔 자리에 세워진다', () => {
    spawnNpcs(TWINLEAF, vars)
    const localID = npcActors.list[0]!.localID
    clearNpcPlacement()
    setNpcPlacement(localID, { x: 40, z: 41 })
    spawnNpcs(TWINLEAF, vars)
    const moved = npcActors.byLocalID.get(localID)!
    expect({ x: moved.x, z: moved.z }).toEqual({ x: 40, z: 41 })
  })

  it('맵을 옮기면 고친 배치표가 사라진다', () => {
    spawnNpcs(TWINLEAF, vars)
    const localID = npcActors.list[0]!.localID
    const home = { x: npcActors.list[0]!.x, z: npcActors.list[0]!.z }
    setNpcPlacement(localID, { x: 40, z: 41 })

    // 원작도 **불러 둔 맵 헤더**만 고친다. 맵을 옮기면 롬의 자리다
    clearNpcPlacement()
    spawnNpcs(TWINLEAF, vars)
    removeNpc(localID)
    addNpc(localID, vars)
    const back = npcActors.byLocalID.get(localID)!
    expect({ x: back.x, z: back.z }).toEqual(home)
  })

  it('맵을 옮기면 멈춤이 풀린다', () => {
    spawnNpcs(TWINLEAF, vars)
    npcActors.paused = true
    spawnNpcs(TWINLEAF, vars)
    expect(npcActors.paused).toBe(false)
  })
})

// ── 그림 번호가 변수로 정해지는 자리 ────────────────────────────────────────

/**
 * 201번 도로. 파트너를 고르는 그 자리다.
 *
 * `LOCALID_COUNTERPART`가 `OBJ_EVENT_GFX_VAR_0`으로 놓여 있고, 맵 초기화
 * 스크립트가 성별을 보고 `VAR_OBJ_GFX_ID_0`에 광휘나 빛나를 넣는다
 */
const ROUTE_201 = 342
const GFX_VAR_0 = 101
const GFX_VAR_F = 116
const GFX_PLAYER_M = 0
const GFX_PLAYER_F = 97
const VAR_OBJ_GFX_ID_0 = 0x4020

maybe('그림 번호가 변수로 정해지는 사람', () => {
  let vars: VarStore

  beforeEach(() => {
    mapWorld.maps = read('maps.json').maps as MapHeader[]
    mapWorld.events = read('events.json').events as Record<string, EventFile>
    vars = new VarStore()
    clearNpcs()
  })

  it('자리를 되짚은 변수 번호가 이미 확정된 값과 이어진다', () => {
    // `VAR_PLAYER_STARTER`(0x4030)는 이 리포가 따로 확정해 둔 값이다. 그 바로
    // 앞 열여섯 칸이 `VAR_OBJ_GFX_ID_0`~`F`라 자리가 되짚어진다 — 짐작이 아니다
    expect(VAR_OBJ_GFX_ID_0 + (GFX_VAR_F - GFX_VAR_0) + 1).toBe(VAR_PLAYER_STARTER)
  })

  it('보통 그림은 그대로 지나간다', () => {
    for (const gfx of [0, 99, 100, 148, 174, 117, 200]) {
      expect(resolveGfx(gfx, vars), String(gfx)).toBe(gfx)
    }
  })

  it('VAR_0~F만 변수를 본다', () => {
    vars.set(VAR_OBJ_GFX_ID_0, GFX_PLAYER_F)
    vars.set(VAR_OBJ_GFX_ID_0 + 15, GFX_PLAYER_M)
    expect(resolveGfx(GFX_VAR_0, vars)).toBe(GFX_PLAYER_F)
    expect(resolveGfx(GFX_VAR_F, vars)).toBe(GFX_PLAYER_M)
    // 한 칸 밖은 자기 번호다
    expect(resolveGfx(GFX_VAR_0 - 1, vars)).toBe(GFX_VAR_0 - 1)
    expect(resolveGfx(GFX_VAR_F + 1, vars)).toBe(GFX_VAR_F + 1)
  })

  it('201번 도로의 광휘가 그 자리다 — 안 풀면 그림이 없다', () => {
    // ⚠️ 이 시험의 요점은 **그 번호로는 그릴 것이 없다**는 것이다. 판때기 쪽이
    // `data/npc/<번호>.png`를 받으므로, 안 풀면 사람 하나가 통째로 사라진다
    expect(existsSync(resolve(DATA, `npc/${String(GFX_VAR_0)}.png`))).toBe(false)
    expect(existsSync(resolve(DATA, `npc/${String(GFX_PLAYER_M)}.png`))).toBe(true)
    expect(existsSync(resolve(DATA, `npc/${String(GFX_PLAYER_F)}.png`))).toBe(true)

    vars.set(VAR_OBJ_GFX_ID_0, GFX_PLAYER_M)
    spawnNpcs(ROUTE_201, vars)
    const placed = npcActors.list.filter((a) => a.info.sprite === GFX_VAR_0)
    expect(placed.length, '201번 도로에 VAR_0 자리가 하나 있다').toBe(1)
    expect(placed[0]!.gfx).toBe(GFX_PLAYER_M)

    // 성별을 바꾸면 서는 사람도 바뀐다 (`Route201_SetCounterpartGraphics*`)
    vars.set(VAR_OBJ_GFX_ID_0, GFX_PLAYER_F)
    spawnNpcs(ROUTE_201, vars)
    expect(npcActors.list.find((a) => a.info.sprite === GFX_VAR_0)!.gfx).toBe(GFX_PLAYER_F)
  })

  it('AddObject로 나타나는 사람도 풀린다 — 광휘가 그 길로 온다', () => {
    // `ClearFlag FLAG_HIDE_ROUTE_201_COUNTERPART` 다음이 `AddObject`다.
    // 여기에 변수를 안 넘기면 컷신 도중에 나타나는 사람만 그림이 없다
    vars.set(VAR_OBJ_GFX_ID_0, GFX_PLAYER_F)
    spawnNpcs(ROUTE_201, vars)
    const at = npcActors.list.find((a) => a.info.sprite === GFX_VAR_0)!
    removeNpc(at.localID)
    expect(addNpc(at.localID, vars)).toBe(true)
    expect(npcActors.byLocalID.get(at.localID)!.gfx).toBe(GFX_PLAYER_F)
  })
})

/**
 * 옆 맵에서 베껴 온 사람 (`isCloneNpc`).
 *
 * ⚠️ **번호가 겹친다.** 사본의 `localID`는 저쪽 맵에서의 번호라, 이 맵의 같은
 * 번호와 아무 상관이 없다. 201번 도로의 5번은 **마박사**인데 잔모래마을에서
 * 베껴 온 간판도 5번이라, 안 걸러 내면 `AddObject LOCALID_PROF_ROWAN`이
 * 간판을 보고 "이미 서 있다"며 그냥 돌아간다.
 *
 * 실제로 그랬다. 컷신을 8분 몰아 대사 예순 줄을 다 지나가도 **박사가 끝까지
 * 안 나타났고**, 시험은 전부 초록이었다. 원작은 조회에서 사본을 건너뛴다
 * (`sub_020631A4`: `HasNoScript == FALSE && GetLocalID == localID`).
 */
const PROF_ROWAN = 5
const GFX_PROF_ROWAN = 99

maybe('베껴 온 사람이 번호를 가로채지 않는다', () => {
  let vars: VarStore

  beforeEach(() => {
    mapWorld.maps = read('maps.json').maps as MapHeader[]
    mapWorld.events = read('events.json').events as Record<string, EventFile>
    vars = new VarStore()
    clearNpcs()
  })

  it('201번 도로에 번호가 겹치는 사본이 실제로 있다 — 이 시험이 성립하는 근거다', () => {
    const table = npcsOf(ROUTE_201)
    const clones = table.filter(isCloneNpc)
    expect(clones.length, '사본이 없으면 아래 시험이 아무것도 안 지킨다').toBeGreaterThan(0)
    const clash = clones.filter((c) => table.some((n) => !isCloneNpc(n) && n.localID === c.localID))
    expect(clash.length).toBeGreaterThan(0)
    // 그 겹치는 번호 하나가 마박사다
    expect(clash.some((c) => c.localID === PROF_ROWAN)).toBe(true)
  })

  it('사본은 플래그를 안 본다 — 그 자리는 원본이 있는 맵 번호다', () => {
    const clone = npcsOf(ROUTE_201).find(isCloneNpc)!
    expect(clone.flag).not.toBeNull()
    expect(hideFlagOf(clone)).toBeNull()
    // 그 번호를 플래그로 읽고 세워 두면, 사본이 통째로 사라진다
    vars.setFlag(clone.flag!)
    spawnNpcs(ROUTE_201, vars)
    expect(npcActors.list.some((a) => a.info === clone)).toBe(true)
  })

  it('번호표는 원본이 가진다 — 사본이 먼저 나와도', () => {
    spawnNpcs(ROUTE_201, vars)
    for (const clone of npcsOf(ROUTE_201).filter(isCloneNpc)) {
      const held = npcActors.byLocalID.get(clone.localID)
      expect(held?.info, `${String(clone.localID)}번`).not.toBe(clone)
    }
  })

  it('AddObject가 사본을 지나쳐 마박사를 세운다', () => {
    // 새 판은 이 플래그를 세워 둔다(`scripts_init_new_game.s`). 컷신이 지우고
    // `AddObject`로 부르는 것이 바로 이 사람이다
    const rowanInfo = npcsOf(ROUTE_201).find((n) => n.sprite === GFX_PROF_ROWAN)!
    expect(rowanInfo.localID).toBe(PROF_ROWAN)
    vars.setFlag(rowanInfo.flag!)
    spawnNpcs(ROUTE_201, vars)
    expect(npcActors.list.some((a) => a.gfx === GFX_PROF_ROWAN)).toBe(false)
    expect(addNpc(PROF_ROWAN, vars)).toBe(true)
    const rowan = npcActors.list.filter((a) => a.gfx === GFX_PROF_ROWAN)
    expect(rowan.length, '박사가 하나 서야 한다').toBe(1)
    expect(rowan[0]!.localID).toBe(PROF_ROWAN)
  })
})
