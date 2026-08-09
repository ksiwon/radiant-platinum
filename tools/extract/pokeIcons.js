// 포켓몬 아이콘 아틀라스 (DATA.md §2.20)
//
// 파티·박스 화면이 쓰는 32×32 아이콘이다. 지금까지 두 화면 다 **배틀 그림**을
// 줄여서 썼는데, 박스는 한 화면에 서른 마리가 서므로 그 방식이 못 버틴다
// (배틀 그림 한 장이 80×80이고 서른 장이면 화면이 그림으로 덮인다).
//
// pl_poke_icon.narc는 파일 547개다. 앞 7개가 공용이고(`species_icons.order`)
// 그 뒤 540개가 아이콘이다:
//
//   0  shared_pals.NCLR    552바이트 = 0x28 + 512 → 색 256개 = 팔레트 16벌 × 16색
//   1~6 NANR·NCER 세 쌍    아이콘이 까딱거리는 애니메이션. 우리는 안 쓴다
//   7~  icon_NNNNN.NCGR   1072바이트 = 0x30 + 1024 → 4bpp 2048픽셀 = 32×64
//
// 32×64인 것은 **프레임이 둘**이기 때문이다. 원작은 둘을 번갈아 그려 아이콘이
// 까딱거리게 한다. 우리는 위쪽 한 장만 쓴다.
//
// ⚠️ 팔레트는 종마다 다르다 — 16벌 중 몇 번을 쓰는지가 그림에 안 적혀 있고
// 코드에 박힌 표다(`sPokemonIconPaletteIndex`). 그 표는 디컴프의 종별
// `data.json`에 `icon_palette`로 있고, 종 번호와의 짝은 `generated/species.txt`
// 줄 순서다(0 = SPECIES_NONE). 짐작으로 0번을 쓰면 풀색 포켓몬이 보라색이 된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')
const { encodePng } = require('./png')

// 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
const DECOMP = require('../raw/sources.cjs').requireDir('references.decomp')

const ICON = 32
const TILE = 8
const COLS = 24
/** 공용 파일 7개 뒤부터 아이콘이다 (`res/pokemon/species_icons.order`) */
const FIRST_ICON = 7
/** 아이콘이 쓰는 팔레트 벌 수. 종마다 이 셋 중 하나다 */
const ICON_PALETTES = 3

/** BGR555 → RGB888. 5비트를 8비트로 늘릴 때 위쪽 3비트를 아래에 되붙인다 */
function color(v) {
  const r = v & 0x1f, g = (v >> 5) & 0x1f, b = (v >> 10) & 0x1f
  return [(r << 3) | (r >> 2), (g << 3) | (g >> 2), (b << 3) | (b >> 2)]
}

/** 공용 NCLR에서 팔레트 세 벌을 꺼낸다 */
function palettes(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RLCN') throw new Error('NCLR이 아니다')
  const out = []
  for (let p = 0; p < ICON_PALETTES; p++) {
    const one = []
    for (let i = 0; i < 16; i++) one.push(color(buf.readUInt16LE(0x28 + (p * 16 + i) * 2)))
    out.push(one)
  }
  return out
}

/**
 * NCGR에서 **위 프레임 한 장**을 꺼낸다.
 *
 * 타일은 8×8 단위로 가로 4장씩 놓인다. 위 32×32는 타일 16장이라 앞 512바이트다
 */
function frame(buf) {
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

/**
 * 종 번호 → 팔레트 번호.
 *
 * 폼마다 다른 종(이상해·도롱마담·조개무지…)은 `icon_palette`가 객체다. 그
 * 종의 기본 폼만 쓰므로 `base`를 집는다 — 우리 개체 자료에 폼이 없다
 */
function paletteIndex() {
  const list = fs.readFileSync(path.join(DECOMP, 'generated/species.txt'), 'utf8')
    .split(/\r?\n/).filter(Boolean)
  return list.map((constant) => {
    const dir = constant.replace('SPECIES_', '').toLowerCase()
    const file = path.join(DECOMP, 'res/pokemon', dir, 'data.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')).icon_palette
    if (typeof raw === 'number') return raw
    // "base,0,a,0,…" 꼴로 폼마다 적힌 것. 기본 폼을 집는다
    const parts = String(raw).split(',')
    const at = parts.indexOf('base')
    if (at < 0) throw new Error(`${dir}: icon_palette에 base가 없다 — ${raw}`)
    return Number(parts[at + 1])
  })
}

function main() {
  const narc = openRom().narc('/poketool/icongra/pl_poke_icon.narc')
  const pals = palettes(narc[0])
  const perSpecies = paletteIndex()
  const count = perSpecies.length

  if (narc.length < FIRST_ICON + count) {
    throw new Error(`아이콘 ${narc.length - FIRST_ICON}장인데 종은 ${count}개다`)
  }

  const rows = Math.ceil(count / COLS)
  const width = COLS * ICON, height = rows * ICON
  const rgba = new Uint8Array(width * height * 4)
  const solid = []

  for (let species = 0; species < count; species++) {
    const px = frame(narc[FIRST_ICON + species])
    const pal = pals[perSpecies[species]]
    if (!pal) throw new Error(`종 ${species}: 팔레트 ${perSpecies[species]}번은 없다`)
    const ox = (species % COLS) * ICON, oy = Math.floor(species / COLS) * ICON
    let n = 0
    for (let y = 0; y < ICON; y++) {
      for (let x = 0; x < ICON; x++) {
        const idx = px[y * ICON + x]
        if (idx === 0) continue // 0번은 투명하다 — 스프라이트의 규칙이다
        const [r, g, b] = pal[idx]
        const at = ((oy + y) * width + ox + x) * 4
        rgba[at] = r; rgba[at + 1] = g; rgba[at + 2] = b; rgba[at + 3] = 255
        n++
      }
    }
    solid.push(n)
  }

  // 0번(SPECIES_NONE)은 원작도 빈 칸이다. 그 뒤가 비면 잘못 읽은 것이다
  const blank = solid.map((n, i) => (n === 0 ? i : -1)).filter((i) => i > 0)
  if (blank.length) throw new Error(`빈 아이콘 ${blank.length}개: ${blank.slice(0, 5).join(', ')}`)

  const png = encodePng(rgba, width, height)
  fs.writeFileSync(path.join(ROOT, 'public/data/pokeIcons.png'), png)
  const meta = writeJson('pokeIcons.json', { size: ICON, cols: COLS, rows, count })

  console.log(
    `포켓몬 아이콘 ${count}칸 → public/data/pokeIcons.png ` +
    `(${width}×${height}, ${(png.length / 1024).toFixed(1)}KB) · ${meta.rel}`,
  )
  const drawn = solid.slice(1)
  console.log(
    `  칠해진 픽셀 최소 ${Math.min(...drawn)} · 최대 ${Math.max(...drawn)} / 칸당 ${ICON * ICON}` +
    ` · 팔레트 쓰임 ${[0, 1, 2].map((p) => perSpecies.filter((v) => v === p).length).join('/')}`,
  )
}

main()
