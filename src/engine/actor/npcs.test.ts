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
import { beforeEach, describe, expect, it } from 'vitest'
import { world as mapWorld, type EventFile, type MapHeader } from '../map/world'
import { VarStore } from '../script/vars'
import {
  addNpc, clearNpcPlacement, clearNpcs, npcActors, removeNpc, setNpcPlacement, spawnNpcs,
} from './npcs'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'events.json'))
const maybe = present ? describe : describe.skip
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

    expect(addNpc(localID)).toBe(true)
    const back = npcActors.byLocalID.get(localID)
    expect(back).toBeDefined()
    // 배치표 자리로 돌아온다 — 지웠을 때의 자리가 아니다
    expect({ x: back!.x, z: back!.z }).toEqual(at)
  })

  it('배치표에 없는 번호는 못 세운다', () => {
    spawnNpcs(TWINLEAF, vars)
    expect(addNpc(9999)).toBe(false)
  })

  it('이미 서 있으면 두 번 안 세운다', () => {
    spawnNpcs(TWINLEAF, vars)
    const before = npcActors.list.length
    expect(addNpc(npcActors.list[0]!.localID)).toBe(true)
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
    addNpc(localID)
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
    addNpc(localID)
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
