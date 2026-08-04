// 최소 NDS 파일시스템 리더 — FNT/FAT를 걸어 전체 경로 → 파일 데이터 매핑
'use strict'
const fs = require('fs')

function readRom(path) {
  const buf = fs.readFileSync(path)
  const fntOff = buf.readUInt32LE(0x40)
  const fatOff = buf.readUInt32LE(0x48)
  const fatSize = buf.readUInt32LE(0x4c)
  const fileCount = fatSize / 8

  const fat = []
  for (let i = 0; i < fileCount; i++) {
    fat.push({ start: buf.readUInt32LE(fatOff + i * 8), end: buf.readUInt32LE(fatOff + i * 8 + 4) })
  }

  // FNT 워크
  const files = new Map() // fullPath -> {start,end}
  function walkDir(dirId, prefix) {
    const entryOff = fntOff + (dirId & 0xfff) * 8
    const subOff = buf.readUInt32LE(entryOff)
    let fileId = buf.readUInt16LE(entryOff + 4)
    let p = fntOff + subOff
    for (;;) {
      const len = buf[p++]
      if (len === 0) break
      if (len < 0x80) {
        const name = buf.toString('latin1', p, p + len)
        p += len
        files.set(prefix + name, fat[fileId++])
      } else {
        const name = buf.toString('latin1', p, p + (len & 0x7f))
        p += len & 0x7f
        const subDirId = buf.readUInt16LE(p)
        p += 2
        walkDir(subDirId, prefix + name + '/')
      }
    }
  }
  walkDir(0xf000, '/')

  return {
    buf,
    files,
    read(pathInRom) {
      const e = files.get(pathInRom)
      if (!e) return null
      return buf.subarray(e.start, e.end)
    },
    find(nameSubstr) {
      return [...files.keys()].filter(k => k.includes(nameSubstr))
    },
    gameTitle: buf.toString('latin1', 0, 12).replace(/\0+$/, ''),
    gameCode: buf.toString('latin1', 12, 16),
  }
}

module.exports = { readRom }
