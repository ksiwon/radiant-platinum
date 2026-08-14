// 크레딧 두루마리 (PARITY §8.12) — `overlay099/ov99_021D3E78.c`
//
// 명예의 전당이 닫히면 이것이 흐르고, 끝나면 타이틀로 나간다.
//
// ⚠️ **자리는 프레임이 아니라 픽셀이다.** 표의 `at`은 흐르는 띠 위의 y이고,
// 두루마리가 1프레임에 1픽셀씩 오르다가 그 자리를 지나면 줄이 그려진다. 두 값이
// 같은 속도라 겹쳐 보이지만, 속도를 만지는 순간 프레임으로 읽던 코드는 어긋난다.
//
// ⚠️ **글은 롬의 대사 뱅크 548에서 온다.** 237줄이고 표의 줄 수와 같아야 한다 —
// 우리가 한 글자도 짓지 않는다.
import {
  CREDIT_LINE_HEIGHT, CREDIT_ROWS, CREDIT_SCROLL_START, CREDIT_VIEW_HEIGHT,
  type CreditRow,
} from './creditsTable'

/** 크레딧이 사는 대사 뱅크 (`TEXT_BANK_UNK_0548`) */
export const CREDITS_BANK = 548

/**
 * 지금 화면에 서 있는 한 줄.
 *
 * `y`는 **화면 위에서 잰 픽셀**이다 — 표의 자리에서 두루마리 위치를 뺀 값이라
 * 화면 밖으로 나간 줄은 여기 안 든다
 */
export interface CreditLine {
  /** 대사 뱅크의 줄 번호 */
  index: number
  y: number
  centered: boolean
}

/**
 * 롬의 마지막 줄과 **우리 몫** 사이에 두는 빈 자리 (픽셀).
 *
 * ⚠️ **붙여 놓으면 안 된다.** 원작 스태프 목록과 이 이식을 만든 사람이 한 줄기로
 * 이어지면 남의 이름 옆에 우리 이름을 얹은 것처럼 읽힌다 — 화면 하나가 통째로
 * 비는 만큼(192픽셀) 띄워 두 목록이 절대 같이 안 보이게 한다
 */
export const CREDITS_TAIL_GAP = CREDIT_VIEW_HEIGHT + CREDIT_LINE_HEIGHT

/**
 * 흐를 줄들의 자리.
 *
 * 앞은 롬의 표이고 뒤는 **우리 몫**이다. 우리 줄은 자리 표가 없으므로 줄 높이
 * 간격으로 이어 붙인다 — 원작 표도 대부분 그 간격이다.
 *
 * ⚠️ **뱅크가 표보다 짧을 수 있다.** 일본 롬의 크레딧은 184줄이고(현지화 인원이
 * 통째로 없다) 표는 미국 오버레이의 237줄짜리다 — 끝까지 돌리면 뒤쪽 53줄이
 * 빈 줄로 흘러 크레딧이 1분 가까이 아무것도 없이 흐른다
 */
export function creditsRows(
  lineCount = CREDIT_ROWS.length, tail: readonly boolean[] = [],
): CreditRow[] {
  const rom = CREDIT_ROWS.slice(0, Math.min(lineCount, CREDIT_ROWS.length))
  if (tail.length === 0) return rom
  const from = (rom[rom.length - 1]?.at ?? 0) + CREDITS_TAIL_GAP
  return [...rom, ...tail.map((centered, i) => ({ at: from + i * CREDIT_LINE_HEIGHT, centered }))]
}

/**
 * 두루마리가 다 흐르는 데 걸리는 프레임.
 *
 * 마지막 줄이 화면 위로 완전히 빠질 때까지다 — 원작도 그 자리에서 판을 닫는다
 * (`param0->unk_1C == 2`)
 */
export function creditsFrames(rows: readonly CreditRow[]): number {
  return (rows[rows.length - 1]?.at ?? 0) + CREDIT_LINE_HEIGHT - CREDIT_SCROLL_START
}

/** 롬의 표만 다 흐를 때의 길이. 배경 나누기와 시험이 이걸 본다 */
export const CREDITS_FRAMES = creditsFrames(CREDIT_ROWS)

/**
 * `frame`번째 프레임에 화면에 있는 줄들.
 *
 * ⚠️ **원작은 256픽셀 창을 돌려 쓰지만 우리는 화면 높이로 자른다.** DS는 32×32타일
 * 창 하나에 글을 찍고 `& 0xff`로 감아 돌리는데(VRAM을 아끼는 방법이다) 그 감기는
 * 화면에 안 보인다 — 보이는 것은 「자리에서 두루마리를 뺀 y」뿐이라 그것만 옮긴다
 */
export function creditsAt(frame: number, rows: readonly CreditRow[] = CREDIT_ROWS): CreditLine[] {
  // 원작의 두 값 중 **지우는 쪽**(`unk_00`)이 화면 위 0이다. 뜨는 쪽은 그보다
  // 화면 높이만큼 앞서 있어서, 줄이 아래에서 올라오는 동안 미리 그려 둔다
  const top = CREDIT_SCROLL_START + frame
  const out: CreditLine[] = []
  for (const [index, row] of rows.entries()) {
    // 원작의 두 판정 그대로다 — 뜨는 쪽이 `>=`(화면 높이만큼 앞서서)이고
    // 지우는 쪽이 `>`(줄 높이만큼 지나서)라 양끝이 서로 다르게 닫힌다
    const y = row.at - top
    if (y <= -CREDIT_LINE_HEIGHT || y > CREDIT_VIEW_HEIGHT) continue
    out.push({ index, y, centered: row.centered })
  }
  return out
}

/**
 * 배경이 프레임마다 흐르는 픽셀 (`ov99_021D2C08` · `ov99_021D2E28` · `ov99_021D340C`).
 *
 * 원작이 `fx32`로 더하고 `/ FX32_ONE(4096)`으로 나눠 BG 오프셋에 넣는다 —
 * 첫 장은 가로로 `-0x40`(64분의 1픽셀), 둘째는 세로로 `+0x60`(128분의 3),
 * 셋째는 안 흐른다. ⚠️ **아주 느리다** — 130초 동안 첫 장이 122픽셀 간다.
 *
 * ⚠️ **BG 오프셋은 「그림이 아니라 창이」 움직이는 값이다.** 부호를 뒤집으면
 * 하늘이 반대로 흐른다
 */
export const CREDIT_SCENE_PAN: readonly { x: number; y: number }[] = [
  { x: -0x40 / 4096, y: 0 },
  { x: 0, y: 0x60 / 4096 },
  { x: 0, y: 0 },
]

/**
 * 몇 번째 배경인가 (0~`count-1`).
 *
 * ⚠️ **바뀌는 자리는 우리가 정했다.** 원작은 장면 일곱을 각자의 상태 기계가
 * 끝낼 때 넘기는데(`ov99_021D1D30`), 그 일곱이 오버레이 99 안의 3D 연출이라
 * 배경 그림만 있는 우리에게는 그 시각이 없다. 세 장을 **똑같이 나눈다**
 */
export function creditsScene(frame: number, count: number): number {
  if (count <= 0) return 0
  const at = Math.floor((frame / CREDITS_FRAMES) * count)
  return Math.min(count - 1, Math.max(0, at))
}
