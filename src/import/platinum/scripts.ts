// 스크립트·이벤트 그룹 — 브라우저에서 (DATA.md §2.10 · §2.3)
//
// **바이트코드를 그대로 싣는다.** 전부 288KB다. 우리 쪽 표현으로 옮기면 반드시
// 뭔가 흘리는데(조건부 길이 명령 6개, 도달 불가 코드, 정렬), 그럴 만큼 얻는 것이
// 없다. VM이 원본 바이트를 그대로 돌면 DS와 같은 것을 한다.
//
// ⚠️ **롬만으로는 못 읽는 것이 있다.** 명령 840개의 피연산자 폭, 파일 1124개가
// 코드인지 초기화 표인지, scriptID 구역 경계 — 셋 다 롬 안에 없다. 그것들은
// `scriptMeta.ts`에 굽혀 있다(디컴프에서 기계로 뽑은 **호환성 메타데이터**이고
// 롬 바이트는 하나도 안 들어간다 — COPYRIGHT.md §11).
import { narcEntry } from './nds'
import { bankLayout } from './textBanks'
import {
  COMMANDS, SCRIPT_NAMES, INIT_FILES, RANGES,
  MOVEMENTS, MOVEMENT_TYPES, MOVEMENT_DELAYS, ROTATE_FRAMES,
} from './scriptMeta'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const SCRIPT_NARC = '/fielddata/script/scr_seq.narc'
const EVENT_NARC = '/fielddata/eventdata/zone_event.narc'
/** `ScriptEntryEnd` — 진입점 표의 끝 */
const ENTRY_TABLE_END = 0xfd13

/**
 * 코드 파일의 진입점 표.
 *
 * **끝 표시(`0xFD13`)에 기대면 안 된다** — 원본이 `ScriptEntryEnd`를 빠뜨린 파일이
 * 셋 있다. 게임은 `base + offsetID * 4`로 곧장 들어가므로 끝 표시가 없어도 돌아간다.
 * 그래서 여기서는 **가장 앞선 목적지**를 표의 끝으로 본다 — 코드가 시작되는
 * 자리보다 뒤에 진입점이 있을 수는 없다
 */
export function readEntries(buf: Uint8Array): number[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const entries: number[] = []
  let limit = buf.byteLength
  for (let at = 0; at + 4 <= limit; at += 4) {
    if (view.getUint16(at, true) === ENTRY_TABLE_END) break
    const target = at + 4 + view.getInt32(at, true)
    if (target < 0 || target > buf.byteLength) {
      throw new Error(`진입점이 파일 밖이다: ${String(target)}`)
    }
    limit = Math.min(limit, target)
    entries.push(target)
  }
  return entries
}

// ── 이벤트 ───────────────────────────────────────────────────────────────────
//
// zone_event 파일 하나는 네 구역이 이어 붙은 것이다: [u32 개수, 엔트리]×4.
// 엔트리 크기 [20, 32, 12, 16]은 534개 파일 전부를 정확히 소진하는 유일한 해다.

/** [간판, NPC, 워프, 트리거] — `MapHeaderData`의 네 배열 순서다 */
const SECTION_SIZES = [20, 32, 12, 16]
const SIGN_INDEX = 0
const NPC_INDEX = 1
const WARP_INDEX = 2
const TRIGGER_INDEX = 3
/** 조건 플래그 없음 */
const NO_FLAG = 0xffff

interface Section { count: number, data: Uint8Array, size: number, view: DataView }

export function parseEventFile(buf: Uint8Array): Section[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let p = 0
  const sections: Section[] = []
  for (const size of SECTION_SIZES) {
    if (p + 4 > buf.byteLength) throw new Error('이벤트 파일이 헤더 도중에 끝난다')
    const n = view.getUint32(p, true); p += 4
    const need = n * size
    if (p + need > buf.byteLength) {
      throw new Error(`구역 크기 초과: ${String(n)}개 × ${String(size)}B`)
    }
    const data = buf.subarray(p, p + need)
    sections.push({
      count: n, data, size,
      view: new DataView(data.buffer, data.byteOffset, data.byteLength),
    })
    p += need
  }
  if (p !== buf.byteLength) throw new Error('이벤트 파일 크기 합 불일치 — 구역 크기 가정이 깨졌다')
  return sections
}

function parseWarps(s: Section): unknown[] {
  return Array.from({ length: s.count }, (_, i) => {
    const o = i * s.size
    return {
      /** 행렬 타일 좌표 (오버월드는 전역, 실내는 그 행렬 안) */
      x: s.view.getUint16(o, true),
      z: s.view.getUint16(o + 2, true),
      /** 목적지 맵 헤더 id */
      to: s.view.getUint16(o + 4, true),
      /** 목적지 맵의 몇 번째 워프로 나오는지 */
      anchor: s.view.getUint16(o + 6, true),
    }
  })
}

/**
 * NPC 32B — 디컴프의 `ObjectEvent` 그대로다.
 *
 * ⚠️ 이걸 찾기 전에는 값 분포로 이름을 붙였고 **script와 hiddenFlag가 서로 바뀌어
 * 있었다.** 떡잎마을 8명으로 갈린다 — 구조체대로면 말을 거는 NPC가 6명이고
 * 바꿔 읽으면 1명뿐이다.
 *
 * `y`는 fx32(20.12)인데 한 타일이 16단위라 **위쪽 16비트가 곧 타일 높이**다
 */
function parseNpcs(s: Section): unknown[] {
  return Array.from({ length: s.count }, (_, i) => {
    const o = i * s.size
    const u = (f: number): number => s.view.getUint16(o + f * 2, true)
    const sg = (f: number): number => s.view.getInt16(o + f * 2, true)
    const flag = u(4)
    return {
      x: u(12), z: u(13), height: u(15),
      localID: u(0), sprite: u(1), move: u(2), trainerType: u(3), facing: sg(6),
      script: u(5),
      flag: flag === NO_FLAG ? null : flag,
      range: [sg(10), sg(11)],
      raw: Array.from({ length: 16 }, (_, f) => u(f)),
    }
  })
}

/**
 * 간판 20B — 디컴프의 `BgEvent`.
 *
 * `playerFacingDir`은 **그 방향으로 보고 있을 때만** 반응한다는 뜻이다 — 벽에
 * 붙은 간판을 옆에서 읽을 수 없게 한다. 좌표는 int32인데 NPC와 달리 **타일
 * 그대로**다(고정소수점이 아니다)
 */
function parseSigns(s: Section): unknown[] {
  return Array.from({ length: s.count }, (_, i) => {
    const o = i * s.size
    return {
      script: s.view.getUint16(o, true),
      type: s.view.getUint16(o + 2, true),
      x: s.view.getInt32(o + 4, true),
      z: s.view.getInt32(o + 8, true),
      y: s.view.getInt32(o + 12, true),
      facing: s.view.getUint16(o + 16, true),
    }
  })
}

/**
 * 좌표 트리거 16B — 디컴프의 `CoordEvent`.
 *
 * 그 상자 안에 발을 들이고 **`var`의 값이 `value`와 같을 때** 스크립트가 돈다.
 * 떡잎마을을 처음 나설 때 라이벌이 달려오는 것이 이것이다
 */
function parseTriggers(s: Section): unknown[] {
  return Array.from({ length: s.count }, (_, i) => {
    const o = i * s.size
    const u = (f: number): number => s.view.getUint16(o + f * 2, true)
    return {
      script: u(0),
      x: u(1), z: u(2),
      width: u(3), length: u(4),
      y: u(5),
      value: u(6), var: u(7),
    }
  })
}

// ── 그룹 ─────────────────────────────────────────────────────────────────────

/** `TEXT_BANK_FOO` → us 뱅크 번호. 이름만 싣고 번호는 여기서 푼다 */
function bankNumber(constant: string): number {
  const name = constant.replace(/^TEXT_BANK_/, '').toLowerCase()
  const at = bankLayout('us').get(name)
  if (at === undefined) throw new Error(`글 뱅크 상수를 못 찾았다: ${constant}`)
  return at
}

export async function convertScripts(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(SCRIPT_NARC)
  if (!narc) throw new Error(`${SCRIPT_NARC}을 못 읽었다`)

  const init = new Set(INIT_FILES)
  const parts: Uint8Array[] = []
  const index: unknown[] = []
  let at = 0
  for (let i = 0; ; i++) {
    const buf = narcEntry(narc, i)
    if (!buf) break
    const kind = init.has(i) ? 'init' : 'code'
    parts.push(buf)
    index.push({
      name: SCRIPT_NAMES[i] ?? `#${String(i)}`,
      kind,
      at,
      size: buf.byteLength,
      entries: kind === 'code' ? readEntries(buf).length : 0,
    })
    at += buf.byteLength
    if (i % 64 === 0) { check(ctx); ctx.onProgress?.(i, 1124 + 534); await breathe(ctx) }
  }
  if (index.length !== SCRIPT_NAMES.length) {
    throw new Error(
      `스크립트 목록 ${String(SCRIPT_NAMES.length)}개, 롬 ${String(index.length)}개 — 안 맞는다`,
    )
  }

  const bin = new Uint8Array(at)
  let o = 0
  for (const p of parts) { bin.set(p, o); o += p.byteLength }

  const out: Produced = new Map()
  out.set('data/scripts.bin', bin)
  out.set('data/scripts.json', json({
    count: index.length,
    bytes: bin.byteLength,
    files: index,
    /** 큰 값부터 내려오며 처음 걸리는 구역이 답이다 (script_manager.c) */
    ranges: RANGES.map((r) => ({
      from: r.from,
      file: r.file,
      bank: r.bank,
      /** 미국 롬 기준 뱅크 번호. 파일 이름이 그 번호다 (DATA.md §2.11) */
      msg: bankNumber(r.bank),
    })),
    commands: COMMANDS,
    /**
     * `ApplyMovement`가 가리키는 이동 동작 표.
     *
     * 스크립트 바이트코드와 다른 언어이지만 소비자가 같은 VM이라 한 파일에 둔다
     */
    movements: MOVEMENTS,
    movementTypes: MOVEMENT_TYPES,
    movementDelays: MOVEMENT_DELAYS,
    rotateFrames: ROTATE_FRAMES,
  }))
  ctx.onProgress?.(index.length, 1124 + 534)

  // ── 이벤트 ──
  const eventNarc = await ctx.fs.read(EVENT_NARC)
  if (!eventNarc) throw new Error(`${EVENT_NARC}을 못 읽었다`)
  const events: Record<number, unknown> = {}
  let count = 0
  for (let i = 0; ; i++) {
    const buf = narcEntry(eventNarc, i)
    if (!buf) break
    const sec = parseEventFile(buf)
    events[i] = {
      warps: parseWarps(sec[WARP_INDEX]!),
      npcs: parseNpcs(sec[NPC_INDEX]!),
      signs: parseSigns(sec[SIGN_INDEX]!),
      triggers: parseTriggers(sec[TRIGGER_INDEX]!),
    }
    count = i + 1
    if (i % 64 === 0) { check(ctx); ctx.onProgress?.(1124 + i, 1124 + 534); await breathe(ctx) }
  }
  out.set('data/events.json', json({ count, events }))
  ctx.onProgress?.(1124 + 534, 1124 + 534)
  return out
}
