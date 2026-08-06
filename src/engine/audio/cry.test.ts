// 울음소리와 효과음 (DATA.md §2.18)
//
// 울음소리는 곡이 **아니다.** 악보는 늘 `SEQ_PV` 하나이고 파형 창고만 종족 것으로
// 갈아 끼운다 — `Sound_PlayPokemonCry`가 `NNS_SndArcPlayerStartSeqEx(…, waveID,
// …, SEQ_PV)`를 부르고 `waveID`에 종족 번호가 그대로 들어간다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderSong } from './render'
import { parseSwar } from './swar'
import { parseSbnk } from './sbnk'
import { CRY_SOURCE, FAINT_SEMITONES, MAX_CRY_SPECIES } from './music'
import { SFX } from './sfx'

const DATA = resolve(__dirname, '../../../public/data/sound')
const present = existsSync(resolve(DATA, 'index.json')) && existsSync(resolve(DATA, 'war/1.bin'))
const maybe = present ? describe : describe.skip

interface Index {
  songs: ({ name: string | null; bank: number; volume: number } | null)[]
  banks: ({ wars: (number | null)[] } | null)[]
}
const bin = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(DATA, rel))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
const index = (): Index => JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as Index

const rms = (a: Float32Array): number => {
  let s = 0
  for (const v of a) s += v * v
  return Math.sqrt(s / a.length)
}

function cry(species: number, faint = false) {
  const meta = index().songs[CRY_SOURCE.seq]!
  return renderSong(
    bin(`seq/${String(CRY_SOURCE.seq)}.bin`),
    bin(`bnk/${String(meta.bank)}.bin`),
    [bin(`war/${String(species)}.bin`), null, null, null],
    {
      sampleRate: 48000, maxSeconds: 8, volume: meta.volume,
      transpose: faint ? FAINT_SEMITONES : undefined,
    },
  )
}

maybe('울음소리가 붙는 자리', () => {
  it('악보는 SEQ_PV 하나이고 악기표는 1번이다', () => {
    const idx = index()
    expect(idx.songs[CRY_SOURCE.seq]?.name).toBe('SEQ_PV')
    expect(idx.songs[CRY_SOURCE.seq]?.bank).toBe(CRY_SOURCE.bank)
    // 그 악기표가 평소에 보는 창고는 1번(이상해씨)이다. 종족 번호로 갈아 끼운다
    expect(idx.banks[CRY_SOURCE.bank]?.wars[0]).toBe(1)
  })

  it('악보가 음 하나뿐이고 길이가 0이다', () => {
    // 길이 0은 "표본이 끝날 때까지"라는 뜻이다. 게이트로 끊으면 울음이 잘린다
    const d = new Uint8Array(bin(`seq/${String(CRY_SOURCE.seq)}.bin`))
    // 0xe1 템포 · 0x81 악기 · 0xc1 볼륨 · 0xc0 팬 · 음표 · 0xff
    expect([d[0x1c], d[0x1f], d[0x21], d[0x23]]).toEqual([0xe1, 0x81, 0xc1, 0xc0])
    expect(d[0x25]).toBe(60)      // 음 높이
    expect(d[0x26]).toBe(127)     // 세기
    expect(d[0x27]).toBe(0)       // 길이 0
    expect(d[0x28]).toBe(0xff)    // 끝
  })

  it('창고 1~494가 전부 표본 하나짜리다', () => {
    let missing = 0, notOne = 0
    for (let s = 1; s <= MAX_CRY_SPECIES; s++) {
      if (!existsSync(resolve(DATA, `war/${String(s)}.bin`))) { missing++; continue }
      if (parseSwar(bin(`war/${String(s)}.bin`)).length !== 1) notOne++
    }
    expect(missing).toBe(0)
    expect(notOne).toBe(0)
  })

  it('악기표 1번의 기준음이 60이라 원래 속도로 난다', () => {
    // 악보가 60번 음을 내므로 기준음이 60이어야 표본이 녹음된 그대로 울린다
    const bank = parseSbnk(bin(`bnk/${String(CRY_SOURCE.bank)}.bin`))
    const p = bank.programs[0]
    expect(p?.type).toBe('single')
    if (p?.type === 'single') {
      expect(p.note.baseNote).toBe(60)
      expect(p.note.kind).toBe(1)
      expect(p.note.wave).toBe(0)
      expect(p.note.war).toBe(0)
    }
  })
})

maybe('울음소리가 난다', () => {
  it('이상해씨·피카츄·아르세우스가 전부 소리를 낸다', () => {
    for (const species of [1, 25, 493]) {
      const out = cry(species)
      expect(rms(out.left), `종족 ${String(species)}`).toBeGreaterThan(0.01)
    }
  })

  it('표본이 끝나면 멈춘다 — 8초를 채우지 않는다', () => {
    // 게이트가 0이라 놓을 일이 없다. 도돌이표 없는 표본이 떨어지는 것으로 끝난다.
    // 이걸 안 하면 채널이 영영 안 풀리고 8초짜리 무음이 붙는다
    const out = cry(25)
    const seconds = out.left.length / 48000
    expect(seconds).toBeGreaterThan(0.3)
    expect(seconds).toBeLessThan(3)
  })

  it('종마다 길이가 다르다', () => {
    // 창고를 안 갈아 끼우면 전부 같은 소리가 난다
    const a = cry(1).left.length, b = cry(493).left.length
    expect(a).not.toBe(b)
  })

  it('기절 울음이 정확히 3.5반음 낮다', () => {
    // `POKECRY_FAINT`가 `SOUND_SEMITONES(-3.5)`를 건다.
    //
    // 재는 것은 **길이**다. 울음소리는 고른 음이 아니라서 자기상관으로 기본
    // 주파수를 뽑으면 창을 어디에 두느냐에 따라 답이 흔들린다(그렇게 재 봤다가
    // 1.02가 나왔다). 반면 음을 내리면 표본이 그만큼 느리게 흐르므로 길이가
    // 정확히 `2^(3.5/12)`배가 된다 — 이건 흔들리지 않는다
    const normal = cry(25).left.length, faint = cry(25, true).left.length
    const want = 2 ** (-FAINT_SEMITONES / 12)
    expect(want).toBeCloseTo(1.2241, 4)
    // 길이가 드라이버 프레임(1/192초) 단위로 끊겨서 1%쯤 어긋난다
    expect(faint / normal).toBeGreaterThan(want * 0.98)
    expect(faint / normal).toBeLessThan(want * 1.02)
  })

  it('한 옥타브 내리면 길이가 두 배다', () => {
    // 리샘플이 정말 걸려 있는지 크게 한 번 본다
    const a = cry(25).left.length, b = cry(25).left.length
    expect(a).toBe(b)
    const meta = index().songs[CRY_SOURCE.seq]!
    const octave = renderSong(
      bin(`seq/${String(CRY_SOURCE.seq)}.bin`),
      bin(`bnk/${String(meta.bank)}.bin`),
      [bin('war/25.bin'), null, null, null],
      { sampleRate: 48000, maxSeconds: 8, volume: meta.volume, transpose: -12 },
    )
    expect(octave.left.length / a).toBeGreaterThan(1.96)
    expect(octave.left.length / a).toBeLessThan(2.04)
  })
})

maybe('효과음 번호', () => {
  it('디컴프가 쓰는 이름과 SDAT의 이름이 같은 자리를 가리킨다', () => {
    const songs = index().songs
    // 이 넷은 두 이름이 같다
    expect(songs[SFX.DECIDE]?.name).toBe('SEQ_SE_DP_DECIDE')
    expect(songs[SFX.DOOR]?.name).toBe('SEQ_SE_DP_DOOR_OPEN')
    expect(songs[SFX.STAIRS]?.name).toBe('SEQ_SE_DP_KAIDAN2')
    expect(songs[SFX.FAINT]?.name).toBe('SEQ_SE_DP_POKE_DEAD3')
    expect(songs[SFX.THROW]?.name).toBe('SEQ_SE_DP_NAGERU')
    expect(songs[SFX.HEAL]?.name).toBe('SEQ_SE_DP_KAIFUKU')
    expect(songs[SFX.SAVE]?.name).toBe('SEQ_SE_DP_SAVE')
    expect(songs[SFX.LOW_HP]?.name).toBe('SEQ_SE_DP_HINSI')
  })

  it('메뉴 소리는 디컴프가 이름을 고쳐 붙인 자리다', () => {
    // 디컴프는 `SEQ_SE_CONFIRM`이라 부르고 SDAT는 `SEQ_SE_DP_SELECT`라 부른다.
    // 이름으로 찾으면 못 찾으므로 번호로 둔다
    expect(index().songs[SFX.MENU]?.name).toBe('SEQ_SE_DP_SELECT')
  })

  it('효과음이 실제로 울리고 짧다', () => {
    const songs = index().songs
    for (const id of [SFX.MENU, SFX.DOOR, SFX.FAINT]) {
      const meta = songs[id]!
      const bank = index().banks[meta.bank]!
      const out = renderSong(
        bin(`seq/${String(id)}.bin`),
        bin(`bnk/${String(meta.bank)}.bin`),
        bank.wars.map((w) => (w === null ? null : bin(`war/${String(w)}.bin`))),
        { sampleRate: 48000, maxSeconds: 8, volume: meta.volume },
      )
      expect(rms(out.left), `효과음 ${String(id)}`).toBeGreaterThan(0.001)
      // 효과음은 도돌이표가 없다. 8초를 꽉 채우면 안 끝난 것이다
      expect(out.left.length, `효과음 ${String(id)}`).toBeLessThan(48000 * 8)
    }
  })
})
