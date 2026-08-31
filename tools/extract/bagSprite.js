// 가방 그림 + 주머니 아이콘 (DESIGN.md §5)
//
// 원작 가방 화면은 **왼쪽에 가방이 서 있고** 오른쪽이 도구 목록이다
// (`applications/bag/windows.c`: 목록 창이 14타일=112px부터). 가방 그림은
// 주머니마다 다른 칸이 열린 여덟 장이고, `ManagedSprite_SetAnim(BAG_SPRITE_BAG,
// pocketType)`이 그중 하나를 고른다.
//
// ⚠️ **주머니 번호 ≠ 그림 번호다.** NANR의 애니 N이 `animationResults[N].index`로
// 셀을 가리키는데 그 차례가 뒤섞여 있다 — [1,3,4,7,2,6,5,0]. 그림 순서대로
// 그리면 「도구」 주머니에 볼 칸이 열린 가방이 뜬다.
//
// ⚠️ **`src/import/platinum/bagSprite.ts`와 한 줄씩 같아야 한다.** 브라우저에서
// 굽는 쪽이 없으면 설치본에서만 가방이 통째로 안 나온다 — 개발 서버에서는
// `public/data/`에 있는 이 결과물이 그대로 보여서 안 보인다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

/** 가방 한 장 (`sBagUISpriteTemplates[BAG_SPRITE_BAG]`은 64×64 어파인이다) */
const BAG = 64
/** 주머니 아이콘 한 칸 (`BagUI_DrawPocketSelectorIcon`의 blit이 16×16) */
const ICON = 16
const TILE = 8
/** 주머니 여덟 (`POCKET_MAX`) */
const POCKETS = 8
/** 남·여 두 벌 */
const BODIES = 2

// `graphic/pl_bag_gra.narc`의 차례 (`res/graphics/bag/bag_graphics.order`)
const MEMBER = {
  maleTiles: 2, malePalette: 3,
  femaleTiles: 6, femalePalette: 7,
  iconTiles: 21, iconPalette: 22,
}

/**
 * 주머니 번호 → 그림 번호.
 *
 * `bag_sprite_anim.json`의 `animationResults[N].index`다. 같은 차례가 애니
 * 이름표(`ca1 ca3 ca4 ca7 ca2 ca6 ca5 ca0`)에도 한 번 더 적혀 있다
 */
const FRAME_OF_POCKET = [1, 3, 4, 7, 2, 6, 5, 0]

/** BGR555 → RGB888 */
function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

function palette(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const out = []
  for (let i = 0; i < 16; i++) out.push(color(buf.readUInt16LE(0x28 + i * 2)))
  return out
}

/**
 * NCGR을 **가로 `across`타일**로 편 색 번호 판.
 *
 * 1D 매핑이라 타일이 그냥 차례대로 놓인다 (`bag_sprite_cell.json`의 셀 N이
 * 타일 N×64에서 시작한다 — 64타일이 8×8칸, 곧 64×64px 한 장이다)
 */
function tiles(buf, across) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const data = buf.subarray(0x30)
  const count = Math.floor((data.length * 2) / (TILE * TILE))
  const width = across * TILE
  const height = Math.ceil(count / across) * TILE
  const px = new Uint8Array(width * height)
  for (let t = 0; t < count; t++) {
    const ox = (t % across) * TILE, oy = Math.floor(t / across) * TILE
    for (let i = 0; i < TILE * TILE; i++) {
      const byte = data[t * ((TILE * TILE) / 2) + (i >> 1)]
      px[(oy + (i >> 3)) * width + ox + (i & 7)] = i & 1 ? byte >> 4 : byte & 0xf
    }
  }
  return { px, width, height }
}

/** 한 조각을 아틀라스에 옮긴다. 칠한 픽셀 수를 돌려준다 */
function blit(rgba, width, dx, dy, src, sx, sy, w, h, pal) {
  let solid = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = src.px[(sy + y) * src.width + sx + x]
      if (idx === 0) continue // 0번은 투명하다
      const [r, g, b] = pal[idx]
      const at = ((dy + y) * width + dx + x) * 4
      rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = 255
      solid++
    }
  }
  return solid
}

function main() {
  const narc = openRom().narc('/graphic/pl_bag_gra.narc')
  if (narc.length !== 39) throw new Error(`가방 아카이브가 ${narc.length}칸이다 — 39칸이라야 한다`)

  // ── 가방 여덟 장 × 두 벌 ─────────────────────────────────────────────────
  const width = BAG * POCKETS, height = BAG * BODIES
  const rgba = new Uint8Array(width * height * 4)
  const bodies = [
    { tiles: MEMBER.maleTiles, palette: MEMBER.malePalette },
    { tiles: MEMBER.femaleTiles, palette: MEMBER.femalePalette },
  ]
  const filled = []
  bodies.forEach((body, row) => {
    const sheet = tiles(narc[body.tiles], BAG / TILE)
    const pal = palette(narc[body.palette])
    if (sheet.height !== BAG * POCKETS) {
      throw new Error(`가방 시트가 ${sheet.width}×${sheet.height}다 — 64×512라야 한다`)
    }
    for (let pocket = 0; pocket < POCKETS; pocket++) {
      const frame = FRAME_OF_POCKET[pocket]
      filled.push(blit(rgba, width, pocket * BAG, row * BAG, sheet, 0, frame * BAG, BAG, BAG, pal))
    }
  })
  if (Math.min(...filled) === 0) throw new Error('빈 가방 칸이 있다 — 타일이나 팔레트를 잘못 읽었다')

  const png = encodePng(rgba, width, height)
  fs.writeFileSync(path.join(ROOT, 'public/data/bagSprite.png'), png)

  // ── 주머니 아이콘 열여섯 ────────────────────────────────────────────────
  //
  // 주머니마다 두 칸이다 — `BagUI_DrawPocketSelectorIcon`이 안 고른 것은
  // `pocketType*32`, 고른 것은 `+16`에서 떠 온다. 곧 시트 차례 그대로 2p·2p+1이다.
  //
  // ⚠️ 이쪽 NCGR은 `-sopc`라 **머리에 크기가 들어 있다** (32×2타일 = 256×16).
  // 가방 시트는 `-clobbersize`라 그 자리가 0xffff고, 그래서 둘의 가로 폭을
  // 같은 방법으로 못 구한다
  const iconAcross = narc[MEMBER.iconTiles].readUInt16LE(0x1a)
  if (iconAcross * TILE !== ICON * POCKETS * 2) {
    throw new Error(`주머니 아이콘 시트가 ${iconAcross * TILE}px다 — 256px이라야 한다`)
  }
  const iconSheet = tiles(narc[MEMBER.iconTiles], iconAcross)
  const iconPal = palette(narc[MEMBER.iconPalette])
  const iconCount = POCKETS * 2
  const iw = ICON * iconCount
  const iconRgba = new Uint8Array(iw * ICON * 4)
  const iconFilled = []
  for (let i = 0; i < iconCount; i++) {
    iconFilled.push(blit(iconRgba, iw, i * ICON, 0, iconSheet, i * ICON, 0, ICON, ICON, iconPal))
  }
  if (Math.min(...iconFilled) === 0) throw new Error('빈 주머니 아이콘이 있다')

  const iconPng = encodePng(iconRgba, iw, ICON)
  fs.writeFileSync(path.join(ROOT, 'public/data/bagPockets.png'), iconPng)

  const meta = writeJson('bagSprite.json', {
    size: BAG, cols: POCKETS, rows: BODIES, icon: ICON, iconCols: iconCount,
  })
  console.log(
    `가방 ${POCKETS}칸 × ${BODIES}벌 → public/data/bagSprite.png (${width}×${height}, `
    + `${(png.length / 1024).toFixed(1)}KB) · 주머니 아이콘 ${iconCount}칸 → bagPockets.png `
    + `(${iw}×${ICON}, ${(iconPng.length / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  console.log(`  칠해진 픽셀 가방 ${Math.min(...filled)}~${Math.max(...filled)} / ${BAG * BAG}`)
}

main()
