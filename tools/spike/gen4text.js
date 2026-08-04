// Gen 4 텍스트 디코더 — pret/pokeplatinum tools/msgenc 알고리즘의 JS 이식
// MsgAlloc: alloc_key = (765 * i * key) & 0xFFFF (i는 1-based), offset/length XOR
// 문자열: key = (i * 596947) & 0xFFFF, 문자마다 XOR 후 key += 18749
'use strict'
const fs = require('fs')

function parseNarc(buf) {
  if (buf.toString('latin1', 0, 4) !== 'NARC') throw new Error('not a NARC')
  let p = buf.readUInt16LE(12) // header size
  const files = []
  let fatb = null, gmifData = null
  while (p < buf.length) {
    const magic = buf.toString('latin1', p, p + 4)
    const size = buf.readUInt32LE(p + 4)
    if (magic === 'BTAF') {
      const count = buf.readUInt32LE(p + 8)
      fatb = []
      for (let i = 0; i < count; i++) {
        fatb.push({ start: buf.readUInt32LE(p + 12 + i * 8), end: buf.readUInt32LE(p + 16 + i * 8) })
      }
    } else if (magic === 'GMIF') {
      gmifData = p + 8
    }
    p += size
  }
  for (const e of fatb) files.push(buf.subarray(gmifData + e.start, gmifData + e.end))
  return files
}

function decodeBank(bank) {
  const count = bank.readUInt16LE(0)
  const key = bank.readUInt16LE(2)
  const messages = []
  for (let i = 1; i <= count; i++) {
    let allocKey = (765 * i * key) & 0xffff
    const full = (allocKey | (allocKey << 16)) >>> 0
    const off = (bank.readUInt32LE(4 + (i - 1) * 8) ^ full) >>> 0
    const len = (bank.readUInt32LE(8 + (i - 1) * 8) ^ full) >>> 0
    const codes = new Uint16Array(len)
    let ck = (i * 596947) & 0xffff
    for (let j = 0; j < len; j++) {
      codes[j] = bank.readUInt16LE(off + j * 2) ^ ck
      ck = (ck + 18749) & 0xffff
    }
    messages.push(codes)
  }
  return messages
}

function loadCharmap(path) {
  const map = new Map()
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const t = line.replace(/\r$/, '')
    if (!t || t.startsWith('//')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const code = parseInt(t.slice(0, eq).trim(), 16)
    if (Number.isNaN(code)) continue
    let ch = t.slice(eq + 1)
    if (ch === '\\x0000') ch = ''
    map.set(code, ch)
  }
  return map
}

function codesToString(codes, charmap) {
  let out = ''
  for (let j = 0; j < codes.length; j++) {
    const c = codes[j]
    if (c === 0xffff) break
    if (c === 0xfffe) { // 제어 코드: {cmd nargs args...}
      const cmd = codes[++j]
      const nargs = codes[++j]
      out += `{${cmd.toString(16).toUpperCase()}:${nargs}}`
      j += nargs
      continue
    }
    if (c === 0xf100) { out += '{TRNAME-9bit}'; break } // 9비트 압축 — 스파이크에선 스킵
    if (charmap.has(c)) out += charmap.get(c)
    else out += `[${c.toString(16).padStart(4, '0').toUpperCase()}]`
  }
  return out
}

module.exports = { parseNarc, decodeBank, loadCharmap, codesToString }
