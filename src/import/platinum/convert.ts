// Platinum 브라우저 변환 (IMPORT.md §6 · §13-5)
//
// 노드 추출기 스물다섯 개가 하는 일을 브라우저로 옮기는 자리다. 한꺼번에 다
// 옮기지 않는다 — **한 그룹을 끝까지 옮겨 parity를 세워 놓고** 그 자리를 넓힌다.
// 순서를 뒤집으면(전부 반쯤 옮긴 상태) 어느 것이 맞는지 아무도 모른다.
//
// ⚠️ **지금 여기 있는 것은 `moves`와 `marts` 둘이다.** 그 둘이 증명하는 것:
//
//   · 브라우저가 NARC를 열고 ARM9를 짚어 같은 바이트를 읽는다
//   · 그 결과가 노드 산출물과 **바이트로 같다** (`convert.test.ts`)
//   · 진행률·취소·transferable이 그 길을 지난다 (`worker.ts`)
//
// 남은 그룹과 막힌 이유는 `GROUPS` 표에 그대로 적는다. 표가 곧 남은 일이다.
import { narcCount, narcEntry, type NdsFileSystem } from './nds'
import { readMarts } from './marts'
import { martLocator, type Release } from './validate'

/** 한 그룹이 만드는 것 — 논리 경로 → 바이트 */
export type Produced = Map<string, Uint8Array>

export interface ConvertContext {
  fs: NdsFileSystem
  locale: string
  /**
   * 판정된 지역판. ARM9 표 자리처럼 **지역판마다 다른 것**을 여기서 읽는다
   * (`marts.ts`) — 코드에 세 벌을 박으면 판이 늘 때마다 갈라진다
   */
  release: Release
  /** 몇 개 중 몇 개째인지. 화면이 이걸로 진행을 그린다 */
  onProgress?: (done: number, total: number) => void
  /** 취소 신호. 그룹마다 **자주** 본다 — 한 그룹이 몇 초씩 걸린다 */
  signal?: { aborted: boolean }
  /** 몇 번째 숨인가. `breathe`가 센다 — 넷에 한 번은 타이머여야 한다 */
  breaths?: number
}

export class Cancelled extends Error {
  constructor() { super('취소했다'); this.name = 'Cancelled' }
}

const check = (ctx: ConvertContext): void => {
  if (ctx.signal?.aborted) throw new Cancelled()
}

/**
 * 메시지를 받을 틈을 낸다.
 *
 * ⚠️ **마이크로태스크로는 안 된다.** 취소는 Worker 바깥에서 `postMessage`로
 * 오고, 그것은 **태스크**로 큐에 들어간다 — `await Promise.resolve()`로는
 * 그 큐가 안 돌아서 신호가 영영 안 보인다. 진짜 포트로 시험을 돌렸을 때
 * 취소가 한 번도 안 먹은 것이 그 증거였고, 같은 스레드에서 함수를 직접
 * 부르던 시험은 이걸 못 잡았다 (시험이 직접 `aborted`를 켰기 때문이다).
 *
 * ⚠️ **`scheduler.yield()`만으로는 안 된다.** 중첩 `setTimeout(0)`은 4ms로
 * 늘어나서 느리지만, `scheduler.yield()`의 재개는 다른 태스크보다 **먼저**
 * 실행되도록 우선순위가 붙는다 — 그러면 취소 메시지를 계속 앞질러서 이 함수가
 * 고치려던 버그가 그대로 돌아온다. 그래서 둘을 섞는다: 평소에는 싼 쪽으로
 * 양보하고, `TIMER_EVERY`번에 한 번은 반드시 타이머로 큐를 비운다.
 * 브라우저에서 실제로 취소가 먹는지는 `tools/e2e/run.mjs`가 잰다
 */
async function breathe(ctx: ConvertContext): Promise<void> {
  ctx.breaths = (ctx.breaths ?? 0) + 1
  if (ctx.breaths % TIMER_EVERY === 0 || !yieldFn) {
    await new Promise<void>((done) => { setTimeout(done, 0) })
  } else {
    await yieldFn()
  }
  check(ctx)
}

/**
 * `scheduler.yield()`가 있으면 그것. 없으면 null이고 늘 타이머로 간다.
 *
 * 표준에 없는 API라 타입에 없다. Node 18+에도 전역 `scheduler`가 있어서
 * (`setImmediate` 상당) 시험도 이 갈래를 지난다
 */
const yieldFn: (() => Promise<void>) | null = (() => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  return typeof s?.yield === 'function' ? s.yield.bind(s) : null
})()

/** 이만큼마다 한 번 숨을 쉰다. 471개면 여덟 번이라 취소가 곧 먹는다 */
const BREATH = 64
/** 그 숨 중 이만큼마다 한 번은 **반드시** 타이머다 — 위 ⚠️ 참고 */
const TIMER_EVERY = 4

export interface GroupSpec {
  name: string
  /** 이 그룹이 만드는 논리 경로들 (진단·저널용) */
  outputs: string[]
  /**
   * 변환기 판. **고치면 올린다** — 설치 기록에 남아서, 올라간 그룹만 다시 만든다.
   * 이게 없으면 변환기를 고쳐도 옛 산출물이 온전하다는 이유로 그대로 남는다
   */
  converter: number
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
    // 취소 메시지가 들어올 틈. 마이크로태스크로는 안 온다 (`breathe` 참조)
    if (id % BREATH === 0) await breathe(ctx)
  }
  ctx.onProgress?.(moves.length, moves.length)

  // ⚠️ 노드 쪽 `writeJson`과 **같은 모양**이어야 한다 — 키 순서와 들여쓰기까지.
  // parity를 바이트로 재려면 직렬화도 같아야 하기 때문이다
  return new Map([
    ['data/moves.json', encoder.encode(JSON.stringify({ count: moves.length, moves }))],
  ])
}

// ── marts ───────────────────────────────────────────────────────────────────

async function convertMarts(ctx: ConvertContext): Promise<Produced> {
  ctx.onProgress?.(0, 2)
  await breathe(ctx)
  // 아이템 표 엔트리 수를 먼저 센다 — 읽어 낸 번호가 그 안에 드는지 보려는 것이다.
  // 못 세면 그 검사만 건너뛴다. 상점을 못 읽는 이유가 되지는 않는다
  const items = await ctx.fs.read('/itemtool/itemdata/pl_item_data.narc')
  const itemCount = items ? narcCount(items) ?? undefined : undefined
  check(ctx)
  ctx.onProgress?.(1, 2)
  // 자리를 이 롬의 헤더와 맞춰 본다. 표가 어긋나 있으면 여기서 던진다
  const at = martLocator(ctx.release, ctx.fs.header.arm9RomOffset)
  const table = await readMarts(ctx.fs, at, itemCount)
  ctx.onProgress?.(2, 2)
  // 노드 쪽 writeJson과 같은 모양이어야 한다 — parity를 바이트로 재기 때문이다
  return new Map([['data/marts.json', encoder.encode(JSON.stringify(table))]])
}

// ── 그룹 표 ──────────────────────────────────────────────────────────────────

/**
 * 무엇이 옮겨졌고 무엇이 안 옮겨졌는가.
 *
 * ⚠️ **안 옮긴 것을 숨기지 않는다.** 표가 곧 남은 일이고, Import 화면이 이걸
 * 그대로 읽어 "이 판은 아직 여기까지"라고 말한다 (IMPORT.md §13-5)
 */
export const GROUPS: readonly GroupSpec[] = [
  { name: 'moves', outputs: ['data/moves.json'], converter: 1, convert: convertMoves },
  { name: 'marts', outputs: ['data/marts.json'], converter: 1, convert: convertMarts },

  {
    name: 'text',
    outputs: ['data/names/*.json', 'data/dialogue/**'],
    converter: 1,
    blockedBy:
      '글 디코더(charmap + 뱅크 복호화)를 아직 안 옮겼다. '
      + '`tools/extract/message.js`와 `tools/spike/gen4text.js`가 정본이고, '
      + '뱅크 매핑표(`src/data/textBanks.json`)는 이미 브라우저에서 읽을 수 있다.',
  },
  {
    name: 'species',
    outputs: ['data/species.json'],
    converter: 1,
    blockedBy: '`moves`와 같은 모양이라 옮기는 데 막힌 것은 없다. 아직 안 했을 뿐이다.',
  },
  {
    name: 'maps',
    outputs: ['data/maps.json', 'data/matrices/**', 'data/bdhc.*'],
    converter: 1,
    blockedBy:
      'arm9 오버레이에서 맵 헤더 표를 읽어야 하는데 오버레이는 FNT에 이름이 없다. '
      + '헤더의 오버레이 표(+0x50)로 파일 번호를 찾는 길은 노드 쪽에 이미 있다 '
      + '(`tools/extract/rom.js`의 `overlay()`).',
  },
  {
    name: 'chunks',
    outputs: ['data/chunks/**', 'data/props/**', 'data/tex/**'],
    converter: 1,
    blockedBy:
      'NSBMD 디스플레이 리스트 해석기를 안 옮겼다 (DATA.md §2.2). 노드 쪽은 '
      + '666/666 검증을 통과했고, 브라우저로 옮기면 같은 수치가 나와야 한다.',
  },
  {
    name: 'scripts',
    outputs: ['data/scripts.bin', 'data/scripts.json', 'data/events.json'],
    converter: 1,
    blockedBy:
      '⚠️ **`raw/decomp`에 기댄다.** 명령 폭 표와 scriptID 표를 디컴프에서 뽑는다 '
      + '(PLAN §14 "Platinum 추출기의 decomp 의존"). 롬 자체 파싱으로 바꾸거나, '
      + '배포 가능한 최소 호환성 메타데이터로 분리해야 한다.',
  },
  {
    name: 'sound',
    outputs: ['data/sound/**'],
    converter: 1,
    blockedBy:
      'SDAT 파서와 SSEQ 렌더러를 안 옮겼다. 렌더러는 이미 Worker에서 도는 코드가 '
      + '있으므로(`engine/audio/renderWorker.ts`) 남은 것은 SDAT 쪽이다.',
  },
  {
    name: 'pokegra',
    outputs: ['data/pokemon/**'],
    converter: 1,
    blockedBy: '`pl_pokegra.narc`의 암호를 푸는 코드를 안 옮겼다 (DATA.md §2.17).',
  },
]

export function groupsReady(): readonly GroupSpec[] {
  return GROUPS.filter((g) => g.convert !== undefined)
}

export function groupsBlocked(): readonly GroupSpec[] {
  return GROUPS.filter((g) => g.convert === undefined)
}
