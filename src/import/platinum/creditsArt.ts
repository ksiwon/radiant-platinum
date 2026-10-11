// 엔딩 크레딧의 그림 — 회상 사진 28장과 날아다니는 포켓몬 넷 (`overlay099` · DATA.md §2.26)
//
// 크레딧 3D 무대(`scene/CreditsStage`)가 쓴다. 배경 세 장(`credits.ts`)과 같은 아카이브 `graphic/ending.narc`에서 나온다.
//
// **회상 사진** (`ov99_021D4134.c`의 `Unk_ov99_021D5394` · `…52F4` · `…5274` · `…52B4`) — 한 장이 BG 판이다.
//
//   타일 `ending.narc` t   배치 s(모든 사진이 같은 32×32칸)   팔레트 p     (256색 · 확장 팔레트)
//   회상 열 장    남 38~47 · 배치 37 · 팔레트 48~57       여 58~67 · 배치 37 · 팔레트 68~77   (장면 1 · 3 — 일곱 + 셋)
//   밤의 떡잎마을 남 87~90 · 배치 86 · 팔레트 91~94       여 95~98 · 배치 86 · 팔레트 99~102  (장면 5 — 넷)
//
// 장마다 BG 오프셋 `(x, y)`가 따로 있다 (`unk_06` · `unk_08`) — 원작은 판을 그만큼 **밀어** 사진을 화면의 제자리에 앉힌다.
// 우리는 사진을 **경계 상자만** 잘라 굽고 그 상자의 화면 자리(원작 256×192 기준)를 같이 싣는다. 3D 액자가 그 자리를 따른다.
//
// ⚠️ **0번 색은 뚫린 자리다.** 사진 둘레의 검정은 그림이 아니라 뒤판 색이고, 경계 상자는 0번이 아닌 픽셀로 잰다.
// 상자 안의 0번 색(그림 속 검정)은 검정으로 채운다 — 액자 뒤가 검정이라 같은 색이다.
//
// **날아다니는 포켓몬 넷** — 셀 뱅크 1번 · 그림 0번 · 팔레트 15번 (`SpriteSystem_Load…FromOpenNarc(… 0 · 1 · 2 · 15)`):
// 0 둥실봉 · 1 갈모매 · 2 어두운 한 마리 · 3 별똥별. 셀마다 경계 상자와 함께 굽는다 — 왼쪽 위 `(ox, oy)`가 스프라이트 중심에서 잰 자리다.
import { narcEntry } from './nds'
import { cellBank, cellBox, drawCell } from './ntrcell'
import { chars, maybeLz77, palettes, screen, screenCell, TILE } from './ntrgfx'
import { color } from './nitrotex'
import { encodePng } from './png'
import { breathe, check, json, readRomFile, type ConvertContext, type Produced } from './convertTypes'

const NARC = '/graphic/ending.narc'

/** 사진 한 벌의 멤버 번호 */
interface PhotoSet {
  /** 첫 타일 · 첫 팔레트 멤버 · 배치 멤버 · 장 수 */
  chr: number
  pal: number
  scr: number
  count: number
}

/** 열 장짜리 회상 사진 (장면 1에 일곱, 장면 3에 셋 — `unk_1105`가 이어 센다) */
const MEMORY: Record<'male' | 'female', PhotoSet> = {
  male: { chr: 38, pal: 48, scr: 37, count: 10 },
  female: { chr: 58, pal: 68, scr: 37, count: 10 },
}
/** 밤의 떡잎마을 네 장 (장면 5) */
const NIGHT: Record<'male' | 'female', PhotoSet> = {
  male: { chr: 87, pal: 91, scr: 86, count: 4 },
  female: { chr: 95, pal: 99, scr: 86, count: 4 },
}

/** 회상 열 장의 BG 오프셋 `(x, y)` — 남녀가 같다 (`Unk_ov99_021D5394`의 `unk_06` · `unk_08`) */
const MEMORY_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0], [-32, -48], [-16, -30], [-42, -2], [-8, -20], [-50, -16], [-40, -34], [-16, -1], [-44, -15], [-30, -30],
]

const SIZE = 256
const VIEW_W = 256
const VIEW_H = 192

/** 한 장 — 원작 화면(256×192)에서의 자리와 크기 */
export interface CreditsPhoto { file: string, x: number, y: number, w: number, h: number }

/** 날아다니는 포켓몬 한 장 — `(ox, oy)`가 스프라이트 중심에서 그림 왼쪽 위까지다 */
export interface CreditsSprite { file: string, ox: number, oy: number, w: number, h: number }

export interface CreditsArt {
  memory: { male: CreditsPhoto[], female: CreditsPhoto[] }
  night: { male: CreditsPhoto[], female: CreditsPhoto[] }
  sprites: CreditsSprite[]
}

const wrap = (v: number): number => ((v % SIZE) + SIZE) % SIZE

/**
 * BG 한 장을 256×256으로 펴고, 0번 색이 아닌 픽셀의 경계 상자를 화면 자리로 잘라 낸다.
 * `(ox, oy)`는 BG 오프셋이다 — 화면 `(sx, sy)`는 BG `(sx + ox, sy + oy)`를 본다
 */
async function bakePhoto(
  tiles: Uint8Array, scr: Uint8Array, pal: Uint8Array, ox: number, oy: number,
): Promise<{ png: Uint8Array, x: number, y: number, w: number, h: number }> {
  const t = maybeLz77(tiles)
  const data = t.subarray(0x30)
  const s = screen(maybeLz77(scr))
  const p = maybeLz77(pal)
  const pv = new DataView(p.buffer, p.byteOffset, p.byteLength)
  // 확장 팔레트 — 256색 한 벌씩 이어진다. 칸의 위 4비트가 벌을 고른다
  const slots = Math.max(1, Math.floor((p.length - 0x28) / 512))
  const rgba = new Uint8Array(SIZE * SIZE * 4)
  const mask = new Uint8Array(SIZE * SIZE)
  for (let cy = 0; cy < s.height; cy++) {
    for (let cx = 0; cx < s.width; cx++) {
      const cell = screenCell(s, cx, cy)
      const tile = cell & 0x3ff
      const slot = ((cell >> 12) & 0xf) % slots
      for (let i = 0; i < TILE * TILE; i++) {
        let px = i & 7, py = i >> 3
        if (cell & 0x400) px = TILE - 1 - px
        if (cell & 0x800) py = TILE - 1 - py
        const idx = data[tile * 64 + i] ?? 0
        // 화면 자리 — BG 픽셀 `(bx, by)`는 화면 `(bx - ox, by - oy)`에 선다 (오프셋은 창을 미는 값이다)
        const sx = wrap(cx * TILE + px - ox), sy = wrap(cy * TILE + py - oy)
        const at = (sy * SIZE + sx) * 4
        const c = idx === 0 ? [0, 0, 0] : color(pv.getUint16(0x28 + (slot * 256 + idx) * 2, true))
        rgba[at] = c[0]!; rgba[at + 1] = c[1]!; rgba[at + 2] = c[2]!; rgba[at + 3] = 255
        if (idx !== 0) mask[sy * SIZE + sx] = 1
      }
    }
  }
  let x0 = SIZE, y0 = SIZE, x1 = -1, y1 = -1
  for (let y = 0; y < VIEW_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      if (!mask[y * SIZE + x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) throw new Error('사진이 비었다')
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    out.set(rgba.subarray(((y0 + y) * SIZE + x0) * 4, ((y0 + y) * SIZE + x0 + w) * 4), y * w * 4)
  }
  return { png: await encodePng(out, w, h), x: x0, y: y0, w, h }
}

export async function convertCreditsArt(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`${NARC}에 ${String(at)}번 멤버가 없다`)
    return b
  }
  const out: Produced = new Map()
  const art: CreditsArt = { memory: { male: [], female: [] }, night: { male: [], female: [] }, sprites: [] }
  const total = 2 * 10 + 2 * 4 + 4
  let done = 0

  const bakeSet = async (
    kind: 'memory' | 'night', who: 'male' | 'female', set: PhotoSet,
  ): Promise<void> => {
    for (let k = 0; k < set.count; k++) {
      const [ox, oy] = kind === 'memory' ? MEMORY_OFFSETS[k]! : [0, 0]
      const got = await bakePhoto(take(set.chr + k), take(set.scr), take(set.pal + k), ox, oy)
      const file = `data/credits/${kind}-${who}${String(k)}.png`
      out.set(file, got.png)
      art[kind][who].push({ file: file.slice('data/'.length), x: got.x, y: got.y, w: got.w, h: got.h })
      ctx.onProgress?.(++done, total)
      check(ctx)
      await breathe(ctx)
    }
  }
  for (const who of ['male', 'female'] as const) {
    await bakeSet('memory', who, MEMORY[who])
    await bakeSet('night', who, NIGHT[who])
  }

  // 날아다니는 포켓몬 — 셀 뱅크 1 · 그림 0 · 팔레트 15 (`overlay099/ov99_021D1A54.c` 의 `10003`)
  const pals = palettes(maybeLz77(take(15)))
  const tiles = chars(maybeLz77(take(0))).data
  const bank = cellBank(take(1))
  for (const [k, oams] of bank.cells.entries()) {
    const [ox, oy, w, h] = cellBox(oams)
    const rgba = new Uint8Array(w * h * 4)
    if (drawCell(rgba, w, 0, 0, oams, tiles, pals) === 0) throw new Error(`셀 ${String(k)}이 비었다`)
    const file = `data/credits/sprite${String(k)}.png`
    out.set(file, await encodePng(rgba, w, h))
    art.sprites.push({ file: file.slice('data/'.length), ox, oy, w, h })
    ctx.onProgress?.(++done, total)
    check(ctx)
  }
  if (art.sprites.length !== 4) throw new Error(`날아다니는 셀이 ${String(art.sprites.length)}개다 — 넷이라야 한다`)

  out.set('data/credits/art.json', json(art))
  return out
}
