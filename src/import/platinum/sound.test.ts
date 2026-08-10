// 소리 그룹 ↔ 노드 산출물 parity (DATA.md §2.18)
//
// ⚠️ 노드 쪽은 SDAT를 **미리 뽑아 둔 파일**에서 읽었다 (`raw/extracted/us/`).
// 브라우저는 그럴 데가 없으니 롬 안(`/data/sound/pl_sound_data.sdat`)에서 바로
// 읽는다. 둘이 같은 바이트를 내는지가 이 시험의 절반이다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds } from './nds'
import { convertSound, openSdat, walkSeq } from './sound'
import { commandWidth } from '../../engine/audio/sseq'
import { SUPPORTED } from './validate'
import { DATA, withRom, romPath, fileSource } from '../../data/romData.testkit'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!
const decoder = new TextDecoder()

describe('SDAT 껍데기', () => {
  it('SDAT가 아니면 세운다', () => {
    expect(() => openSdat(new Uint8Array(64))).toThrow(/SDAT가 아니다/)
  })
})

describe('명령 폭 표', () => {
  it('엔진 것을 그대로 쓴다 — 추출기용 사본을 또 만들지 않는다', () => {
    // 표가 두 벌이면 한쪽만 고치고 어긋난다. 노드 쪽이 실제로 그랬다
    expect(commandWidth(0x00)).toBe('note')
    expect(commandWidth(0x93)).toBe('track')
    expect(commandWidth(0xff)).toBe(0)
    expect(commandWidth(0x8f)).toBeNull()
  })
})

withRom('en')('진짜 SDAT — 전곡을 걸어 본다', () => {
  let cached: Map<string, Uint8Array> | null = null
  const open = async (): Promise<Uint8Array> => {
    const fs = await openNds(fileSource(romPath('en')!))
    const bytes = await fs!.read('/data/sound/pl_sound_data.sdat')
    if (!bytes) throw new Error('SDAT를 롬에서 못 읽었다')
    return bytes
  }
  const run = async (): Promise<Map<string, Uint8Array>> => {
    if (cached) return cached
    const fs = await openNds(fileSource(romPath('en')!))
    cached = await convertSound({ fs: fs!, locale: 'en', release: EN })
    return cached
  }

  it('⚠️ 모르는 명령이 하나도 없고 세기가 127을 안 넘는다', async () => {
    const sdat = openSdat(await open())
    const seqs = sdat.records(0)
    const unknown = new Map<number, number>()
    let songs = 0, notes = 0, loud = 0
    let tempoLo = Infinity, tempoHi = -Infinity
    for (const rec of seqs) {
      if (rec === null) continue
      const r = walkSeq(sdat.file(sdat.view.getUint16(rec, true)))
      songs++
      notes += r.notes
      loud += r.loudNotes
      for (const op of r.unknown) unknown.set(op, (unknown.get(op) ?? 0) + 1)
      for (const t of r.tempos) { tempoLo = Math.min(tempoLo, t); tempoHi = Math.max(tempoHi, t) }
    }
    expect(songs).toBeGreaterThan(400)
    expect(notes).toBeGreaterThan(100_000)
    // 셋이 다 "한 칸 밀려 읽었다"의 증상이다. 틀린 답이 그럴듯한 크기로 나온다
    expect([...unknown.keys()]).toEqual([])
    expect(loud).toBe(0)
    expect(tempoHi).toBeLessThan(1000)
  }, 300_000)

  it('⚠️ 롬에서 읽은 SDAT가 미리 뽑아 둔 것과 같다', async () => {
    const extracted = resolve(__dirname, '../../../raw/extracted/us/pl_sound_data.sdat')
    if (!existsSync(extracted)) return   // 그 사본이 없는 기계도 있다
    const fromRom = await open()
    const onDisk = readFileSync(extracted)
    expect(fromRom.byteLength).toBe(onDisk.byteLength)
    expect(Buffer.from(fromRom.buffer, fromRom.byteOffset, fromRom.byteLength).equals(onDisk))
      .toBe(true)
  }, 300_000)

  it('⚠️ 악보·악기표·창고와 목차가 노드 산출물과 같다', async () => {
    if (!existsSync(resolve(DATA, 'sound/index.json'))) {
      expect.unreachable('public/data/sound가 없다 — pnpm extract:sound')
      return
    }
    const out = await run()
    const diff: string[] = []
    let same = 0
    for (const [path, bytes] of out) {
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      const expected = readFileSync(file)
      if (Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)) same++
      else diff.push(`${path}: ${String(bytes.byteLength)}B ≠ ${String(expected.byteLength)}B`)
    }
    expect(diff.slice(0, 5), `${String(diff.length)}개가 어긋난다`).toEqual([])
    expect(same).toBeGreaterThan(600)
  }, 600_000)

  it('목차에 곡 이름과 악기표 번호가 있다', async () => {
    const out = await run()
    const index = JSON.parse(decoder.decode(out.get('data/sound/index.json')!)) as {
      songs: ({ name: string | null, bank: number } | null)[]
      banks: ({ wars: (number | null)[] } | null)[]
    }
    expect(index.songs.filter(Boolean).length).toBeGreaterThan(400)
    expect(index.banks.filter(Boolean).length).toBeGreaterThan(0)
    // 이름표가 실려 있다 — SYMB 블록을 제대로 읽었다는 뜻이다
    expect(index.songs.filter((s) => s?.name).length).toBeGreaterThan(400)
  }, 600_000)
})
