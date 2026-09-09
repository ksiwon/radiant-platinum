// **합성 대조군** — 저작물이 아닌 그림으로 지형 판정자를 항상 건다.
//
// ⚠️ **진짜 게임 컷은 나무에 못 담는다** (`COPYRIGHT.md` §6). 그래서 컷이 없는
// 기계에서는 실측 대조가 통째로 **미실행**이 된다. 그 자리를 이것이 메운다 —
// 여기 일곱 장은 코드가 그리므로 **어디서나 돈다.**
//
// ⚠️ **이것으로 문턱을 맞추지 않는다.** 이 그림들은 판정자가 **구조**를 보는지
// 만 건다(빈 화면·하늘·주인공만·윗줄 바닥·검은 여백). 실제 문턱은 사람이 눈으로
// 가른 컷에서 나왔다 (`terrainJudge.test.mjs`).
import { deflateSync } from 'node:zlib'

const W = 320
const H = 240

const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** `paint(x, y) → [r, g, b]`를 320×240 PNG 한 장으로 굽는다 */
export function synth(paint) {
  const raw = Buffer.alloc((W * 3 + 1) * H)
  let o = 0
  for (let y = 0; y < H; y++) {
    raw[o++] = 0
    for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y)
      raw[o++] = r & 255; raw[o++] = g & 255; raw[o++] = b & 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 자리마다 다른 값을 주되 **되풀이되는** 잡티 — 같은 씨앗이면 같은 그림이다 */
const grain = (x, y, seed) => {
  const v = Math.sin((x * 12.9898 + y * 78.233 + seed) * 43758.5453)
  return Math.floor((v - Math.floor(v)) * 255)
}
/** 「구조가 있는 면」 — 밝기가 흩어지고 색이 여럿이다 */
const textured = (x, y, base, seed) => {
  const n = grain(x, y, seed)
  return [
    Math.min(255, Math.max(0, base[0] + (n % 90) - 45)),
    Math.min(255, Math.max(0, base[1] + ((n * 7) % 90) - 45)),
    Math.min(255, Math.max(0, base[2] + ((n * 13) % 90) - 45)),
  ]
}
const BLACK = () => [0, 0, 0]

/**
 * 판정자가 항상 받아야 할 일곱 장. `want`는 **기대 판정**이다.
 *
 * ⚠️ **「대부분 검정 + 두 칸 무늬」가 이 무리의 핵심이다.** 검은 칸을 「그릴
 * 것이 없는 자리」로 빼 주는 규칙에는 **아래 두 칸만 무늬면 통과하는 구멍**이
 * 뚫릴 수 있다. 이 장이 그 구멍을 막고 있는지를 매번 묻는다
 */
export const SYNTH_CUTS = [
  { name: '완전-검정', want: false, paint: BLACK },
  {
    name: '하늘-그라데이션', want: false,
    paint: (x, y) => { const t = y / H; return [Math.round(70 + t * 90), Math.round(110 + t * 80), Math.round(200 + t * 40)] },
  },
  {
    // 검은 바탕에 아래 가운데 두 칸만 무늬 — 「지형」이라고 부를 수 없다
    name: '검정-바탕에-두칸만', want: false,
    paint: (x, y) => (y >= H * 2 / 3 && x >= W / 4 && x < W * 3 / 4 ? textured(x, y, [120, 110, 90], 3) : BLACK()),
  },
  {
    // 파란 여백 위에 주인공만 — 실측 「파란여백-이어하기」의 뼈대
    name: '주인공만-파란여백', want: false,
    paint: (x, y) => (Math.abs(x - W / 2) < 18 && Math.abs(y - H / 2) < 30 ? textured(x, y, [150, 90, 90], 9) : [70, 78, 120]),
  },
  {
    // 바닥이 위쪽 한 줄만 그려졌다 — 실측 「바닥한줄-체육관」의 뼈대
    name: '얇은-상단바닥', want: false,
    paint: (x, y) => (y >= H / 3 && y < H / 3 + 24 ? textured(x, y, [140, 130, 110], 5) : [175, 178, 182]),
  },
  {
    // 정상 실내: 위 두 줄이 방이고 **아래 한 줄이 통째로** 화면 밖 검정이다
    name: '정상-실내-검은여백', want: true,
    paint: (x, y) => (y < H * 2 / 3 ? textured(x, y, [110, 100, 95], 7) : BLACK()),
  },
  {
    // 정상 실외: 위가 하늘, 아래 두 줄이 지형이다
    name: '정상-지형', want: true,
    paint: (x, y) => (y < H / 3 ? [90, 140, 210] : textured(x, y, [100, 120, 80], 11)),
  },
]
