// 글꼴 파일(`public/fonts/*.woff2`)에서 글자 폭(advance width)을 직접 읽는다 — 시험 전용.
//
// 이름표가 겹치는지는 글 폭에 달렸고, 어림(글자당 12.5px)은 영어 · 일본어에서 틀린다. WOFF2는 표 묶음을 brotli로 한 번에
// 눌러 둔 것이라 `node:zlib`로 풀고, `cmap`(글자 → 글리프) · `hhea` · `hmtx`(글리프 → 폭) · `head`(unitsPerEm)만 읽는다.
// `glyf`만 변형(transform)되어 있고 `hmtx`는 변형이 없는 서브셋을 가정한다 — 아니면 던진다.
import { readFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

/** WOFF2 표 번호 → 태그 (공개 규격의 알려진 63개 중 앞쪽) */
const KNOWN = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc',
  'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
]

interface FontMetrics {
  unitsPerEm: number
  /** 글자 하나의 폭(em 단위의 1/unitsPerEm). 글꼴에 없으면 null */
  advance(ch: string): number | null
}

export function readWoff2Metrics(file: string): FontMetrics {
  const buf = readFileSync(file)
  if (buf.toString('ascii', 0, 4) !== 'wOF2') throw new Error(`${file}: WOFF2가 아니다`)
  const numTables = buf.readUInt16BE(12)
  let at = 48
  const base128 = (): number => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const b = buf[at++]!
      v = v * 128 + (b & 0x7f)
      if ((b & 0x80) === 0) return v
    }
    throw new Error('UIntBase128 오류')
  }
  const dir: { tag: string, len: number }[] = []
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at++]!
    const idx = flags & 0x3f
    const version = flags >> 6
    const tag = idx === 63 ? buf.toString('ascii', at, (at += 4)) : KNOWN[idx]!
    const orig = base128()
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0
    if (tag === 'hmtx' && transformed) throw new Error('hmtx가 변형되어 있다')
    dir.push({ tag, len: transformed ? base128() : orig })
  }
  const data = brotliDecompressSync(buf.subarray(at))
  const tables = new Map<string, Buffer>()
  let pos = 0
  for (const d of dir) {
    tables.set(d.tag, data.subarray(pos, pos + d.len))
    pos += d.len
  }
  const head = tables.get('head')!, hhea = tables.get('hhea')!, hmtx = tables.get('hmtx')!, cmap = tables.get('cmap')!
  const unitsPerEm = head.readUInt16BE(18)
  const count = hhea.readUInt16BE(34)
  const widthOf = (gid: number): number => hmtx.readUInt16BE(Math.min(gid, count - 1) * 4)

  // cmap — 서식 12(전체 유니코드)가 있으면 그것, 아니면 서식 4(BMP)
  const n = cmap.readUInt16BE(2)
  let sub = -1
  for (let i = 0; i < n; i++) {
    const off = cmap.readUInt32BE(4 + i * 8 + 4)
    const fmt = cmap.readUInt16BE(off)
    if (fmt === 12) { sub = off; break }
    if (fmt === 4 && sub < 0) sub = off
  }
  if (sub < 0) throw new Error(`${file}: 쓸 수 있는 cmap이 없다`)
  const fmt = cmap.readUInt16BE(sub)
  const glyphOf = (cp: number): number => {
    if (fmt === 12) {
      const groups = cmap.readUInt32BE(sub + 12)
      for (let g = 0; g < groups; g++) {
        const o = sub + 16 + g * 12
        const s = cmap.readUInt32BE(o), e = cmap.readUInt32BE(o + 4)
        if (cp >= s && cp <= e) return cmap.readUInt32BE(o + 8) + (cp - s)
      }
      return 0
    }
    const segX2 = cmap.readUInt16BE(sub + 6)
    const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2
    for (let s = 0; s < segX2; s += 2) {
      const end = cmap.readUInt16BE(ends + s)
      if (cp > end) continue
      const start = cmap.readUInt16BE(starts + s)
      if (cp < start) return 0
      const delta = cmap.readUInt16BE(deltas + s)
      const ro = cmap.readUInt16BE(ranges + s)
      if (ro === 0) return (cp + delta) & 0xffff
      const gid = cmap.readUInt16BE(ranges + s + ro + (cp - start) * 2)
      return gid === 0 ? 0 : (gid + delta) & 0xffff
    }
    return 0
  }
  return {
    unitsPerEm,
    advance(ch: string): number | null {
      const gid = glyphOf(ch.codePointAt(0)!)
      return gid === 0 ? null : widthOf(gid)
    },
  }
}

/** 글꼴 사슬로 한 줄의 폭(px)을 잰다 — 앞 글꼴에 없는 글자는 다음 글꼴이 맡는다. 어느 글꼴에도 없으면 던진다 */
export function textWidth(text: string, size: number, chain: readonly FontMetrics[]): number {
  let em = 0
  for (const ch of text) {
    let w: number | null = null
    for (const f of chain) {
      const a = f.advance(ch)
      if (a !== null) { w = a / f.unitsPerEm; break }
    }
    if (w === null) throw new Error(`글꼴에 없는 글자: ${ch} (U+${ch.codePointAt(0)!.toString(16)})`)
    em += w
  }
  return em * size
}
