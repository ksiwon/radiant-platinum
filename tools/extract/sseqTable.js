// SSEQ 명령 폭 — `src/engine/audio/sseq.ts`를 그대로 옮긴 것.
//
// 추출기는 CommonJS 노드 스크립트라 TS 모듈을 못 부른다. 그래서 여기 한 벌이
// 더 있는데, **시험이 둘을 맞대 본다**(`sseq.test.ts`) — 어긋나면 걸린다.
'use strict'
module.exports = function commandWidth(op) {
  if (op < 0x80) return 'note'
  switch (op) {
    case 0x80: case 0x81: return 'var'
    case 0x93: return 'track'
    case 0x94: case 0x95: return 'u24'
    case 0xa0: return 'random'
    case 0xa1: return 'fromVar'
    case 0xa2: return 'if'
    case 0xc0: case 0xc1: case 0xc2: case 0xc3: case 0xc4: case 0xc5:
    case 0xc6: case 0xc7: case 0xc8: case 0xc9: case 0xca: case 0xcb:
    case 0xcc: case 0xcd: case 0xce: case 0xcf: case 0xd0: case 0xd1:
    case 0xd2: case 0xd3: case 0xd4: case 0xd5: case 0xd6:
      return 1
    case 0xe0: case 0xe1: case 0xe3: return 2
    case 0xb0: case 0xb1: case 0xb2: case 0xb3: case 0xb4: case 0xb5:
    case 0xb6: case 0xb8: case 0xb9: case 0xba: case 0xbb: case 0xbc:
    case 0xbd:
      return 3
    case 0xfc: case 0xfd: case 0xff: return 0
    case 0xfe: return 2
    default: return null
  }
}
