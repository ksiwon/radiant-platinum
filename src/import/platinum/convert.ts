// Platinum 브라우저 변환 (IMPORT.md §6 · §13-5)
//
// 노드 추출기 스물다섯 개가 하는 일을 브라우저로 옮기는 자리다. 한꺼번에 다
// 옮기지 않는다 — **한 그룹을 끝까지 옮겨 parity를 세워 놓고** 그 자리를 넓힌다.
// 순서를 뒤집으면(전부 반쯤 옮긴 상태) 어느 것이 맞는지 아무도 모른다.
//
// ⚠️ **지금 여기 있는 것은 `moves` 하나다.** 그 하나가 증명하는 것:
//
//   · 브라우저가 NARC를 열어 같은 바이트를 읽는다
//   · 그 결과가 노드 산출물과 **바이트로 같다** (`convert.test.ts`)
//   · 진행률·취소·transferable이 그 길을 지난다 (`worker.ts`)
//
// 남은 그룹과 막힌 이유는 `GROUPS` 표에 그대로 적는다. 표가 곧 남은 일이다.
import { narcEntry, type NdsFileSystem } from './nds'

/** 한 그룹이 만드는 것 — 논리 경로 → 바이트 */
export type Produced = Map<string, Uint8Array>

export interface ConvertContext {
  fs: NdsFileSystem
  locale: string
  /** 몇 개 중 몇 개째인지. 화면이 이걸로 진행을 그린다 */
  onProgress?: (done: number, total: number) => void
  /** 취소 신호. 그룹마다 **자주** 본다 — 한 그룹이 몇 초씩 걸린다 */
  signal?: { aborted: boolean }
}

export class Cancelled extends Error {
  constructor() { super('취소했다'); this.name = 'Cancelled' }
}

const check = (ctx: ConvertContext): void => {
  if (ctx.signal?.aborted) throw new Cancelled()
}

export interface GroupSpec {
  name: string
  /** 이 그룹이 만드는 논리 경로들 (진단·저널용) */
  outputs: string[]
  /** 구현됐으면 변환 함수, 아직이면 왜 막혔는지 */
  convert?: (ctx: ConvertContext) => Promise<Produced>
  blockedBy?: string
}

// ── moves ────────────────────────────────────────────────────────────────────

const MOVE_SIZE = 16
/** 0 = 필중(명중 판정을 하지 않는다). 471개 중 127개가 여기 해당한다 */
const ALWAYS_HITS = 0
export const CATEGORY = ['physical', 'special', 'status'] as const

/** 4세대 접촉·방어 플래그 (b11) */
const FLAG_CONTACT = 0x01
const FLAG_PROTECT = 0x02

export interface MoveRow {
  id: number
  effect: number
  category: string
  power: number
  type: number
  accuracy: number
  alwaysHits: boolean
  pp: number
  effectChance: number
  target: number
  priority: number
  flags: number
  contact: boolean
  protectable: boolean
}

/**
 * 기술 하나 (16B).
 *
 * ⚠️ **노드 쪽(`tools/extract/moves.js`)과 한 줄씩 같아야 한다.** 여기가 갈리면
 * 개발판과 공개판의 배틀 계산이 달라지고, 그 차이는 배틀 한복판에서만 보인다.
 * `convert.test.ts`가 471개를 통째로 대조한다
 */
export function parseMove(b: Uint8Array, id: number): MoveRow {
  if (b.byteLength !== MOVE_SIZE) throw new Error(`waza 크기 ${String(b.byteLength)} ≠ 16`)
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (view.getUint16(14, true) !== 0) {
    throw new Error('waza 꼬리 2B가 0이 아니다 — 배치 가정이 깨졌다')
  }
  const cat = b[2]!
  if (cat > 2) throw new Error(`분류값 ${String(cat)}가 범위를 벗어난다`)
  const flags = b[11]!
  return {
    id,
    effect: view.getUint16(0, true),
    category: CATEGORY[cat]!,
    power: b[3]!,
    type: b[4]!,
    accuracy: b[5]!,
    alwaysHits: b[5] === ALWAYS_HITS,
    pp: b[6]!,
    effectChance: b[7]!,
    target: view.getUint16(8, true),
    priority: view.getInt8(10),
    flags,
    contact: (flags & FLAG_CONTACT) !== 0,
    protectable: (flags & FLAG_PROTECT) !== 0,
  }
}

const encoder = new TextEncoder()

async function convertMoves(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/poketool/waza/pl_waza_tbl.narc')
  if (!narc) throw new Error('pl_waza_tbl.narc을 못 읽었다')

  const moves: MoveRow[] = []
  for (let id = 0; ; id++) {
    const entry = narcEntry(narc, id)
    if (!entry) break
    moves.push(parseMove(entry, id))
    // 471개라 열 개마다면 진행이 눈에 보이고 메시지가 안 넘친다
    if (id % 10 === 0) { check(ctx); ctx.onProgress?.(id, 471) }
  }
  ctx.onProgress?.(moves.length, moves.length)

  // ⚠️ 노드 쪽 `writeJson`과 **같은 모양**이어야 한다 — 키 순서와 들여쓰기까지.
  // parity를 바이트로 재려면 직렬화도 같아야 하기 때문이다
  return new Map([
    ['data/moves.json', encoder.encode(JSON.stringify({ count: moves.length, moves }))],
  ])
}

// ── 그룹 표 ──────────────────────────────────────────────────────────────────

/**
 * 무엇이 옮겨졌고 무엇이 안 옮겨졌는가.
 *
 * ⚠️ **안 옮긴 것을 숨기지 않는다.** 표가 곧 남은 일이고, Import 화면이 이걸
 * 그대로 읽어 "이 판은 아직 여기까지"라고 말한다 (IMPORT.md §13-5)
 */
export const GROUPS: readonly GroupSpec[] = [
  { name: 'moves', outputs: ['data/moves.json'], convert: convertMoves },

  {
    name: 'text',
    outputs: ['data/names/*.json', 'data/dialogue/**'],
    blockedBy:
      '글 디코더(charmap + 뱅크 복호화)를 아직 안 옮겼다. '
      + '`tools/extract/message.js`와 `tools/spike/gen4text.js`가 정본이고, '
      + '뱅크 매핑표(`src/data/textBanks.json`)는 이미 브라우저에서 읽을 수 있다.',
  },
  {
    name: 'species',
    outputs: ['data/species.json'],
    blockedBy: '`moves`와 같은 모양이라 옮기는 데 막힌 것은 없다. 아직 안 했을 뿐이다.',
  },
  {
    name: 'maps',
    outputs: ['data/maps.json', 'data/matrices/**', 'data/bdhc.*'],
    blockedBy:
      'arm9 오버레이에서 맵 헤더 표를 읽어야 하는데 오버레이는 FNT에 이름이 없다. '
      + '헤더의 오버레이 표(+0x50)로 파일 번호를 찾는 길은 노드 쪽에 이미 있다 '
      + '(`tools/extract/rom.js`의 `overlay()`).',
  },
  {
    name: 'chunks',
    outputs: ['data/chunks/**', 'data/props/**', 'data/tex/**'],
    blockedBy:
      'NSBMD 디스플레이 리스트 해석기를 안 옮겼다 (DATA.md §2.2). 노드 쪽은 '
      + '666/666 검증을 통과했고, 브라우저로 옮기면 같은 수치가 나와야 한다.',
  },
  {
    name: 'scripts',
    outputs: ['data/scripts.bin', 'data/scripts.json', 'data/events.json'],
    blockedBy:
      '⚠️ **`raw/decomp`에 기댄다.** 명령 폭 표와 scriptID 표를 디컴프에서 뽑는다 '
      + '(PLAN §14 "Platinum 추출기의 decomp 의존"). 롬 자체 파싱으로 바꾸거나, '
      + '배포 가능한 최소 호환성 메타데이터로 분리해야 한다.',
  },
  {
    name: 'marts',
    outputs: ['data/marts.json'],
    blockedBy:
      '⚠️ **롬에 없다.** 상점 재고는 디컴프의 `include/data/mart_items.h`에 있다 '
      + '(DATA.md §2.13). 사용자의 롬 두 입력만으로는 만들 수 없다 — '
      + '메타데이터로 배포할지 다른 길을 찾을지 정해야 한다.',
  },
  {
    name: 'sound',
    outputs: ['data/sound/**'],
    blockedBy:
      'SDAT 파서와 SSEQ 렌더러를 안 옮겼다. 렌더러는 이미 Worker에서 도는 코드가 '
      + '있으므로(`engine/audio/renderWorker.ts`) 남은 것은 SDAT 쪽이다.',
  },
  {
    name: 'pokegra',
    outputs: ['data/pokemon/**'],
    blockedBy: '`pl_pokegra.narc`의 암호를 푸는 코드를 안 옮겼다 (DATA.md §2.17).',
  },
]

export function groupsReady(): readonly GroupSpec[] {
  return GROUPS.filter((g) => g.convert !== undefined)
}

export function groupsBlocked(): readonly GroupSpec[] {
  return GROUPS.filter((g) => g.convert === undefined)
}
