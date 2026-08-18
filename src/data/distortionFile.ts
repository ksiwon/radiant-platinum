// 깨어진 세계의 두 절반을 합치는 **하나뿐인 자리** (PARITY §6.10)
//
// 자료가 두 원천에서 온다:
//
//   판 · 통행 격자          롬 `fielddata/tornworld/` 두 NARC → `data/distortion.json`
//   층 이음 · 사건 · 발판 ·  오버레이 `ov9_02249960.c`의 C 배열
//   승강 경로 · 소품 ·        → `engine/world/distortionTables.ts` (`pnpm gen:distortionTables`)
//   맵 물체 · 그림자
//
// ⚠️ **읽는 쪽 스무 군데는 이 구별을 몰라야 한다.** 합치는 자리를 여기 하나로
// 좁히지 않으면 「어느 칸이 어디서 왔는가」가 스무 군데로 번지고, 한 군데만
// 안 합쳐도 그 화면에서만 깨어진 세계가 조용히 빈다.
import { DISTORTION_TABLES } from '../engine/world/distortionTables'
import type { DistortionData, DistortionRom } from './schema'

/** 롬 절반에 코드 표 일곱 칸을 얹는다 */
export function withDistortionTables(rom: DistortionRom): DistortionData {
  return { ...rom, ...DISTORTION_TABLES }
}
