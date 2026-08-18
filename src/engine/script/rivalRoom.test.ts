// 오프닝 다음 장면 — 용식이 방으로 들어온다 (PARITY §1.2)
//
// 원작 `scripts_twinleaf_town_player_house_2f.s`의 `..._Rival`은 **글 다섯
// 사이사이에 걸음을 끼운다.** 그것이 이 장면의 전부다:
//
//   들어오기 → 「거기 있었구나」 → 다가오기 → 「마박사가 포켓몬을」 →
//   느낌표 → PC로 → 「새 PC야?」 → 돌아서기 → 「어디까지 했더라」 →
//   되돌아오기 → 「마박사에게 가서 받아」 → 나가기 → 계단 소리
//
// ⚠️ **글만 세면 통과한다.** 걸음이 하나도 안 돌아도 글 다섯은 그대로 나오고,
// 화면에서는 대사가 한 호흡에 쏟아지는 것으로만 보인다. 그래서 여기서 재는
// 것은 **글과 걸음이 번갈아 오는가**다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import { buildCommands, type CommandTable } from './commands'
import { entryOffset, fileBytes, parseScriptMeta, type ScriptData } from './data'
import { ScriptContext } from './context'
import { FieldWorld, type FieldServices } from './world'
import { VarStore } from './vars'
import { DIR, type Movable } from './movement'
import type { MapHeader } from '../map/world'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** `map_headers.txt` 416번째 줄 */
const PLAYER_HOUSE_2F = 415
/**
 * 진입점 번호.
 *
 * `events_…_2f.json`의 `coord_events`가 스크립트 7·8·9·10을 가리키고, 그
 * 번호는 1부터 센다 — 표에서는 6·7·8·9다. 넷은 주인공이 선 자리만 다르고
 * 뒤는 같은 `..._Rival`로 모인다
 */
const COORD_NORTH = 6
const COORD_WEST = 7
const COORD_EAST = 8
const COORD_SOUTH = 9

/** `LOCALID_RIVAL` — 배치표의 그 사람 번호 */
const LOCALID_RIVAL = 0
/** `ApplyMovement`가 주인공을 가리키는 번호 (`constants/scrcmd.h`) */
const LOCALID_PLAYER = 0xff

maybe('용식이 방에 들어온다', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data: ScriptData = {
    meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
  }
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const file = maps[PLAYER_HOUSE_2F]!.scripts
  let commands: CommandTable

  beforeEach(() => { commands = buildCommands(meta.commands) })

  /** 장면이 지나간 자국. `글 6`·`걸음 0`처럼 무엇이 언제 왔는지만 남긴다 */
  type Mark = { kind: 'say', id: number } | { kind: 'walk', who: number, frames: number }

  interface Run {
    marks: Mark[]
    vars: VarStore
    /** 끝까지 돌았는가 */
    finished: boolean
    frames: number
  }

  function runScene(entry: number): Run {
    const vars = new VarStore()
    const marks: Mark[] = []

    // 배치표대로 세운 사람 하나와 주인공
    const rival: Movable = { x: 10, z: 4, dir: DIR.west, visible: false }
    const player: Movable = { x: 4, z: 5, dir: DIR.north, visible: true }

    // ⚠️ **소리는 안 준다.** `Common_SetRivalBGM`이 `sound` 서비스를 찾는데,
    // 없으면 그 명령이 조용히 지나간다 — 이 시험이 재는 것은 박자지 소리가 아니다
    const services: FieldServices = {}
    const world = new FieldWorld({
      vars,
      // 글은 번호만 본다 — 문장은 뱅크에서 오고 이 시험의 관심이 아니다
      messages: Array.from({ length: 64 }, (_, i) => `글${String(i)}`),
      // 늘 눌린 것으로 친다. **누름을 기다리는가**는 `printer.test.ts`가 재고,
      // 여기서 재는 것은 **글과 걸음의 차례**다
      input: () => ({ pressed: true, held: true }),
      movements: meta.movements,
      objects: (id) => (id === LOCALID_PLAYER ? player : id === LOCALID_RIVAL ? rival : null),
      services,
    })
    world.player = player

    const ctx = new ScriptContext(
      { vars, world, commands: commands.map }, fileBytes(data, file), file,
    )
    ctx.start(entryOffset(data, file, entry))

    let walking = 0
    let finished = false
    let frames = 0
    // ⚠️ **바로 앞 자국과만 견주면 안 된다.** 글 사이에 걸음 자국이 끼면 같은
    // 글이 두 번 적힌다 — `lastMessage`는 창을 닫아도 그대로 남기 때문이다
    let lastSaid: number | null = null
    for (; frames < 20_000; frames++) {
      if (!ctx.step(100_000)) { finished = true; break }
      if (world.lastMessage !== null && world.lastMessage !== lastSaid) {
        lastSaid = world.lastMessage
        marks.push({ kind: 'say', id: world.lastMessage })
      }
      // 걸음은 **끝난 순간**에 적는다. 시작만 적으면 0프레임짜리도 걸음이 된다
      if (world.moving) walking++
      else if (walking > 0) {
        marks.push({ kind: 'walk', who: LOCALID_RIVAL, frames: walking })
        walking = 0
      }
      world.tick()
    }
    return { marks, vars, finished, frames }
  }

  it('장면이 끝까지 돈다', () => {
    const run = runScene(COORD_NORTH)
    expect(run.finished).toBe(true)
  })

  it('원작의 글 다섯이 그 차례로 나온다', () => {
    const run = runScene(COORD_NORTH)
    const says = run.marks.filter((m) => m.kind === 'say')
    // 「거기 있었구나」·「마박사가」·「새 PC야?」·「어디까지 했더라」·「받으러 가」
    expect(says).toHaveLength(5)
  })

  it('⚠️ 글 사이마다 걸음이 든다 — 이것이 「속사포」를 막는다', () => {
    const run = runScene(COORD_NORTH)
    const shape = run.marks.map((m) => m.kind)
    // 글이 둘 연달아 오는 자리가 있으면 그 사이의 걸음이 통째로 빠진 것이다
    const backToBack = shape.filter((k, i) => k === 'say' && shape[i - 1] === 'say')
    expect(backToBack).toEqual([])
  })

  it('걸음이 실제로 프레임을 먹는다', () => {
    const run = runScene(COORD_NORTH)
    const walks = run.marks.filter((m): m is { kind: 'walk', who: number, frames: number } =>
      m.kind === 'walk')
    // 원작 박자는 들어오기·다가오기·느낌표·PC로·돌아서기·되돌아오기·나가기 일곱이다
    expect(walks.length).toBeGreaterThanOrEqual(6)
    // 한 칸이 여덟 프레임이라 어느 것도 한 프레임짜리일 수 없다
    for (const w of walks) expect(w.frames).toBeGreaterThan(1)
  })

  it('넷 중 어느 자리에서 밟아도 같은 장면이 돈다', () => {
    for (const entry of [COORD_NORTH, COORD_WEST, COORD_EAST, COORD_SOUTH]) {
      const run = runScene(entry)
      expect(run.finished, `진입점 ${String(entry)}`).toBe(true)
      expect(run.marks.filter((m) => m.kind === 'say'), `진입점 ${String(entry)}`).toHaveLength(5)
    }
  })
})
