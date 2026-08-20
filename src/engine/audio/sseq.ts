// SSEQ 악보 형식 (DATA.md §2.18)
//
// 곡은 바이트코드다. 명령 하나의 **폭**을 알아야 다음 명령으로 넘어갈 수 있고,
// 폭을 하나만 잘못 알면 악보 전체가 한 칸씩 밀린다.
//
// ⚠️ 그때 나오는 답이 **그럴듯한 크기**라는 것이 이 형식의 함정이다. 트랙
// 오프셋을 파일 처음에서 재는 실수를 했을 때 "모르는 명령 46개 · 세기 127 넘는
// 음표 1414개 · 템포 최대 5057"이 나왔다 — 완전히 깨진 값이 아니라 조금 이상한
// 값이라 그냥 넘어갈 뻔했다.
//
// 표가 맞는지는 **전곡을 걸어서** 안다(`tools/extract/sound.js`). 곡 1013개에서
// 모르는 명령 0종 · 세기 127 넘는 음표 0 · 템포 6~512다. 셋이 동시에 맞을
// 확률은 표가 맞을 때뿐이다.

/** 명령 하나가 뒤에 데리고 오는 것 */
type Width =
  /** 음 높이가 곧 명령 번호. 뒤에 세기(u8)와 길이(가변)가 붙는다 */
  | 'note'
  /** 가변 길이 정수 하나 */
  | 'var'
  /** 트랙 번호(u8) + 주소(u24) */
  | 'track'
  /** 주소(u24) */
  | 'u24'
  /**
   * 다음 명령의 값을 범위에서 무작위로 뽑는다. `A0 <명령> <s16 최소> <s16 최대>`.
   *
   * ⚠️ 한동안 이것을 3바이트로 알고 있었다. 전곡에 두 번밖에 안 나오는데,
   * 하필 뒤에 오는 바이트가 0x80 미만이라 **음표로 읽혀서 아무 데도 안 걸렸다** —
   * `A0 C0 0A 00 78 00`을 실제로 들여다보고서야 6바이트인 것을 알았다
   */
  | 'random'
  /** 다음 명령의 값을 변수에서 가져온다. `A1 <명령> <변수 번호>` */
  | 'fromVar'
  /** 앞선 비교가 참일 때만 다음 명령을 실행한다. `A2 <명령…>` */
  | 'if'
  /** 고정 바이트 수 */
  | number

/** 모르는 명령이면 `null`. 전곡에서 이것이 안 나와야 표를 아는 것이다 */
export function commandWidth(op: number): Width | null {
  if (op < 0x80) return 'note'
  switch (op) {
    case 0x80: case 0x81: return 'var'
    case 0x93: return 'track'
    case 0x94: case 0x95: return 'u24'
    case 0xa0: return 'random'
    case 0xa1: return 'fromVar'
    case 0xa2: return 'if'
    // 팬·볼륨·조옮김·벤드·우선순위·타이·포르타멘토·모듈레이션·ADSR·반복 시작
    case 0xc0: case 0xc1: case 0xc2: case 0xc3: case 0xc4: case 0xc5:
    case 0xc6: case 0xc7: case 0xc8: case 0xc9: case 0xca: case 0xcb:
    case 0xcc: case 0xcd: case 0xce: case 0xcf: case 0xd0: case 0xd1:
    case 0xd2: case 0xd3: case 0xd4: case 0xd5: case 0xd6:
      return 1
    // 모듈레이션 지연 · 템포 · 스윕
    case 0xe0: case 0xe1: case 0xe3: return 2
    // 변수 (번호 u8 + 값 s16)
    case 0xb0: case 0xb1: case 0xb2: case 0xb3: case 0xb4: case 0xb5:
    case 0xb6: case 0xb8: case 0xb9: case 0xba: case 0xbb: case 0xbc:
    case 0xbd:
      return 3
    case 0xfc: case 0xfd: case 0xff: return 0
    case 0xfe: return 2
    default: return null
  }
}

/** 악보가 시작하는 자리. **트랙 오프셋의 기준점이다** — 파일 처음이 아니다 */
export const SEQ_BASE = 0x1c
