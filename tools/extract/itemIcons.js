// 아이템 아이콘 아틀라스 (DATA.md §2.12)
//
// item_icon.narc는 NCGR 328개 + NCLR 381개다. 팔레트가 더 많은 것은 기술머신처럼
// 그림 하나를 여러 색으로 돌려쓰는 것들 때문이다 (tm.NCGR + tm_<타입>.NCLR 17장).
//
// NCGR 560바이트 = 헤더 0x30 + 512. 4bpp라 512바이트가 픽셀 1024개, 곧 32×32다.
// NCLR 552바이트 = 헤더 0x28 + 512. 색 256개짜리지만 실제로 쓰는 것은 앞 16개뿐이다
// (뒤 240칸이 전부 0이고, 타일 데이터에 15보다 큰 번호가 나오지 않는다).
//
// 타일은 8×8 단위로 순서대로 놓인다. 32px이니 가로 4장씩이다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')
const { EXTRA_ITEM_ICONS, FIRST_EXTRA_ITEM } = require('./extraItemsModule.cjs')

const ICON = 32
const TILE = 8
const COLS = 24

/** BGR555 → RGB888. 5비트를 8비트로 늘릴 때 위쪽 3비트를 아래에 되붙인다 */
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

/** @returns {Uint8Array} 32×32 색 번호 */
function tiles(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RGCN') throw new Error('NCGR이 아니다')
  const data = buf.subarray(0x30)
  const px = new Uint8Array(ICON * ICON)
  const across = ICON / TILE
  for (let t = 0; t < across * across; t++) {
    const ox = (t % across) * TILE, oy = Math.floor(t / across) * TILE
    for (let i = 0; i < TILE * TILE; i++) {
      const byte = data[t * (TILE * TILE / 2) + (i >> 1)]
      px[(oy + (i >> 3)) * ICON + ox + (i & 7)] = i & 1 ? byte >> 4 : byte & 0xf
    }
  }
  return px
}

function main() {
  const rom = openRom()
  const narc = rom.narc('/itemtool/itemdata/item_icon.narc')
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/items.json'), 'utf8')).items

  // 롬 밖의 도구 둘은 표 **뒤에** 제 칸을 갖는다 (PARITY §12). 남의 칸을
  // 빌리면 가방에서 같은 그림이 둘 나오고, 그리는 자리마다 번호를 갈아 끼워야 한다
  if (items.length !== FIRST_EXTRA_ITEM) {
    throw new Error(`롬 도구가 ${items.length}종인데 덧붙일 자리는 ${FIRST_EXTRA_ITEM}부터다`)
  }
  const cells = [
    ...items.map((item, id) => ({ id, item })),
    ...EXTRA_ITEM_ICONS.map((e) => ({ id: e.id, item: { name: `extra_${e.id}`, data: {}, ...e } })),
  ]

  const rows = Math.ceil(cells.length / COLS)
  const width = COLS * ICON, height = rows * ICON
  const rgba = new Uint8Array(width * height * 4)

  // 자료 없는 아이템(ITEM_UNUSED_*)은 none 아이콘으로 채운다. 빈칸을 남기면
  // 잘못된 번호로 그렸을 때 "원래 빈 칸"과 구분이 안 된다
  const none = items.find((it) => it.name === 'none')
  let drawn = 0
  const opaque = new Map()

  cells.forEach(({ id, item }) => {
    const src = item.data === null ? none : item
    const px = tiles(narc[src.icon])
    const pal = palette(narc[src.palette])
    const ox = (id % COLS) * ICON, oy = Math.floor(id / COLS) * ICON
    let solid = 0
    for (let y = 0; y < ICON; y++) {
      for (let x = 0; x < ICON; x++) {
        const idx = px[y * ICON + x]
        const at = ((oy + y) * width + ox + x) * 4
        if (idx === 0) continue // 0번은 투명하다 — 스프라이트의 규칙이다
        const [r, g, b] = pal[idx]
        rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = 255
        solid++
      }
    }
    opaque.set(id, solid)
    if (item.data !== null) drawn++
  })

  // 전부 투명한 칸이 있으면 팔레트나 타일을 잘못 읽은 것이다
  const byId = new Map(cells.map((c) => [c.id, c.item.name]))
  const blank = [...opaque].filter(([, n]) => n === 0).map(([id]) => byId.get(id))
  if (blank.length) throw new Error(`빈 아이콘 ${blank.length}개: ${blank.slice(0, 5).join(', ')}`)

  const png = encodePng(rgba, width, height)
  const file = path.join(ROOT, 'public/data/itemIcons.png')
  fs.writeFileSync(file, png)

  const meta = writeJson('itemIcons.json', { size: ICON, cols: COLS, rows, count: cells.length })
  console.log(
    `아이콘 ${drawn}종 + 빈 자리 ${cells.length - drawn}칸 → public/data/itemIcons.png ` +
    `(${width}×${height}, ${(png.length / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  const filled = [...opaque.values()]
  console.log(`  칠해진 픽셀 최소 ${Math.min(...filled)} · 최대 ${Math.max(...filled)} / 칸당 ${ICON * ICON}`)
}

main()
