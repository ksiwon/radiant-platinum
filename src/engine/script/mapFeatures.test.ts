// 맵에 들어서면 그 맵의 장치가 켜지는가 (PARITY §7.12)
//
// ⚠️ **이 사슬은 조용히 끊어진다.** 체육관 여섯의 장치는 저마다 단위 시험이
// 지키지만, 그 시험들은 전부 **함수를 직접 부른다** — 게임이 그 함수까지
// 닿는지는 아무도 안 본다. 사이에 네 마디가 있다:
//
//   초기화 표(`initScripts`) → 맵 스크립트 코드 → 명령(`commands.ts`)
//     → 서비스(`scene/fieldServices`) → 장치
//
// 어느 마디가 끊겨도 예외는 안 난다. 장치가 그냥 안 켜지고, 화면은 멀쩡한데
// 꽃시계가 안 돌고 문이 다 같은 곳으로 가고 뜨는 판이 안 뜬다. 그리고 이 방들은
// **장치가 곧 길이라** 뱃지를 못 딴다.
//
// 여기서는 진짜 자료로 `enterMap`을 돌리고 **어느 손잡이가 실제로 불렸는지**를
// 센다. 명령 번호를 손으로 적지 않는다 — 바이트를 훑어 찾으면 정렬이 안 맞는
// 자리에서 헛것을 집는다(실제로 그렇게 맵 91을 「부른다」고 잘못 읽었다).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import type { EventFile, MapHeader } from '../map/world'
import { world as mapWorld } from '../map/world'
import { buildCommands } from './commands'
import { parseScriptMeta } from './data'
import { enterMap, fieldScripts, makeWorld } from './field'
import { VarStore } from './vars'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'scripts.json', 'maps.json', 'events.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/**
 * 장치를 켜는 손잡이와, 그 장치가 사는 맵.
 *
 * 맵 번호는 각 장치가 제 표에 적어 둔 것과 같아야 한다 — 여기 적은 것은
 * 그 표를 그대로 옮긴 것이 아니라 **초기화가 실제로 도는 맵**이다.
 */
const GYMS = [
  { handle: 'initEternaGym', label: '영원 꽃시계', maps: [67] },
  { handle: 'initHearthomeGym', label: '연고 문 고르기', maps: [89, 90] },
  { handle: 'initVeilstoneGym', label: '장막 샌드백', maps: [133] },
  { handle: 'initPastoriaGym', label: '들판 물바닥', maps: [122] },
  { handle: 'initCanalaveGym', label: '운하 뜨는 판', maps: [35] },
  { handle: 'initSunyshoreGym', label: '물가 톱니', maps: [154, 155, 156] },
] as const

/** 손잡이 이름 전부. 「다른 것이 안 불렸다」를 이걸로 센다 */
const HANDLES = GYMS.map((g) => g.handle)

maybe('맵에 들어서면 장치가 켜진다', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  /** 이번 `enterMap`에서 불린 손잡이들 */
  let called: string[] = []

  beforeEach(() => {
    mapWorld.maps = maps
    mapWorld.events = events
    fieldScripts.data = {
      meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
    }
    const built = buildCommands(meta.commands)
    fieldScripts.commands = { map: built.map, unhandled: built.unhandled }
    fieldScripts.vars = new VarStore()
    // ⚠️ **손잡이만 채운다.** 나머지를 비워 두면 명령이 `?.`로 조용히 넘어가므로
    // 이 시험이 보는 것은 「불렸는가」 하나로 남는다
    fieldScripts.services = {
      mapFeatures: Object.fromEntries(
        HANDLES.map((h) => [h, () => { called.push(h) }]),
      ) as unknown as NonNullable<typeof fieldScripts.services.mapFeatures>,
    }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    called = []
  })

  it.each(GYMS.flatMap((g) => g.maps.map((m) => [g.label, m, g.handle] as const)))(
    '%s · 맵 %i', (_label, map, handle) => {
      mapWorld.mapId = map
      enterMap(map)
      expect(fieldScripts.lastError, '초기 스크립트가 터졌다').toBeNull()
      expect(called, `맵 ${String(map)}에서 안 불렸다`).toContain(handle)
      // ⚠️ **다른 장치가 같이 켜지면 안 된다.** 원작은 한 번에 하나만 산다
      expect(called.filter((c) => c !== handle)).toEqual([])
    })

  it('⚠️ 체육관이 아닌 맵에서는 하나도 안 켜진다', () => {
    // 이게 없으면 위의 시험은 「어느 맵에서나 다 부른다」와 구별이 안 된다.
    // 연고 체육관 입구(88)를 넣어 둔다 — 앞선 조사가 여기를 재고
    // 「문이 안 바뀐다」고 읽은 자리다. 여기는 원래 안 부르는 것이 맞다
    for (const map of [88, 91, 411, 0]) {
      called = []
      mapWorld.mapId = map
      enterMap(map)
      expect(called, `맵 ${String(map)}이 장치를 켰다`).toEqual([])
    }
  })
})
