// 악기표 (DATA.md §2.18)
//
// 악보는 "몇 번 악기로 이 음을 내라"고만 한다. 어느 표본을 어느 속도로 어떤
// 포락선에 태울지는 여기가 정한다.
//
// 악기 하나가 셋 중 하나다:
//   · 음 하나짜리 — 표본 하나를 음정만 바꿔 쓴다
//   · 음역 분할 — 음 높이에 따라 다른 표본 (피아노 저음/고음)
//   · 드럼셋 — 음 높이마다 아예 다른 소리
//
// PSG(사각파·잡음)는 표본이 없다. 만들어 내야 한다 — 롬에도 파형이 없고
// 하드웨어가 직접 낸다.

/** 음 정의 하나. 10바이트 */
export interface NoteDef {
  /** 1 = 표본 · 2 = PSG 사각파 · 3 = 잡음 */
  kind: number
  /** 표본 번호. PSG면 사각파 듀티(0~7) */
  wave: number
  /** 이 악기표가 든 창고 넷 중 몇 번째인가 (0~3) */
  war: number
  /** 이 표본이 원래 음정을 내는 음 높이 */
  baseNote: number
  attack: number
  decay: number
  sustain: number
  release: number
  pan: number
}

export interface Bank {
  /** 프로그램 번호로 꺼낸다. 빈 자리는 `null` */
  programs: (Program | null)[]
}

export type Program =
  | { type: 'single'; note: NoteDef }
  /** 음 높이 `lo`~`hi`가 각각 제 정의를 갖는다 */
  | { type: 'drums'; lo: number; hi: number; notes: (NoteDef | null)[] }
  /** `ranges[i]`까지가 `notes[i]`다 */
  | { type: 'split'; ranges: number[]; notes: (NoteDef | null)[] }

const DEF = 10

function readDef(view: DataView, at: number, kind: number): NoteDef {
  return {
    kind,
    wave: view.getUint16(at, true),
    war: view.getUint16(at + 2, true),
    baseNote: view.getUint8(at + 4),
    attack: view.getUint8(at + 5),
    decay: view.getUint8(at + 6),
    sustain: view.getUint8(at + 7),
    release: view.getUint8(at + 8),
    pan: view.getUint8(at + 9),
  }
}

export function parseSbnk(buf: ArrayBuffer): Bank {
  const view = new DataView(buf)
  if (view.getUint32(0, false) !== 0x53424e4b) throw new Error('SBNK가 아니다')
  const count = view.getUint32(0x38, true)
  const programs: (Program | null)[] = []
  for (let i = 0; i < count; i++) {
    const type = view.getUint8(0x3c + i * 4)
    const at = view.getUint16(0x3c + i * 4 + 1, true)
    if (type === 0) { programs.push(null); continue }
    if (type >= 1 && type <= 5) {
      programs.push({ type: 'single', note: readDef(view, at, type) })
      continue
    }
    if (type === 0x10) {
      const lo = view.getUint8(at), hi = view.getUint8(at + 1)
      const notes: (NoteDef | null)[] = []
      for (let n = 0; n <= hi - lo; n++) {
        const rec = at + 2 + n * (2 + DEF)
        const k = view.getUint16(rec, true)
        notes.push(k === 0 ? null : readDef(view, rec + 2, k))
      }
      programs.push({ type: 'drums', lo, hi, notes })
      continue
    }
    if (type === 0x11) {
      const ranges: number[] = []
      for (let n = 0; n < 8; n++) ranges.push(view.getUint8(at + n))
      const used = ranges.filter((r) => r !== 0).length
      const notes: (NoteDef | null)[] = []
      for (let n = 0; n < used; n++) {
        const rec = at + 8 + n * (2 + DEF)
        const k = view.getUint16(rec, true)
        notes.push(k === 0 ? null : readDef(view, rec + 2, k))
      }
      programs.push({ type: 'split', ranges: ranges.slice(0, used), notes })
      continue
    }
    programs.push(null)
  }
  return { programs }
}

/** 프로그램과 음 높이로 정의 하나를 고른다 */
export function noteFor(program: Program | null, note: number): NoteDef | null {
  if (!program) return null
  if (program.type === 'single') return program.note
  if (program.type === 'drums') {
    if (note < program.lo || note > program.hi) return null
    return program.notes[note - program.lo] ?? null
  }
  for (let i = 0; i < program.ranges.length; i++) {
    if (note <= program.ranges[i]!) return program.notes[i] ?? null
  }
  return null
}
