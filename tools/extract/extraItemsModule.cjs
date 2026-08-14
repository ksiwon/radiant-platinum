// 롬 밖의 도구 둘이 아틀라스에서 차지하는 칸 (PARITY §12)
//
// ⚠️ **`src/engine/bag/extraItems.ts`와 같은 값이다.** 두 곳에 적히는 이유는
// 아틀라스를 굽는 쪽이 CJS 도구이고 쓰는 쪽이 TS라서다. 어긋나면
// `src/engine/bag/extraItems.test.ts`가 잡는다.
//
// ⚠️ **아이콘 번호는 item_icon.narc의 실제 자리다.** 롬의 도구 468종이
// 참조하지 않는 NCGR이 33개 있고(전부 3세대 잔재다), 연결의 끈은 그중
// **381번**을 쓴다 — 초록 화면이 달린 손에 드는 기계라 롬 안에서 GB플레이어에
// 가장 가깝고, 어느 도구도 이 칸을 안 쓰므로 가방에서 겹쳐 보이지 않는다.
// 고운 비늘은 하트비늘과 같은 그림(138)을 제 칸에 다시 그린다
'use strict'

/** `pl_item_data.narc`가 채우는 마지막 번호 다음 */
const FIRST_EXTRA_ITEM = 468

const EXTRA_ITEM_ICONS = [
  // 연결의 끈 — 안 쓰이는 3세대 잔재(디컴프 이름 `unused_381`)
  { id: 468, icon: 381, palette: 382 },
  // 고운 비늘 — 하트비늘(93번 도구)의 그림
  { id: 469, icon: 138, palette: 139 },
]

module.exports = { FIRST_EXTRA_ITEM, EXTRA_ITEM_ICONS }
