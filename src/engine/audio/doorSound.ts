// 문이 내는 소리 (`DoorAnimation_GetSoundEffectType`, `overlay005/ov5_021D431C.c:466-477`)
//
// 종류는 문 **모델 번호**가 정한다(`import/platinum/propAnims`의 `DOOR_KIND`). 모르는 모델은 여닫이다 —
// 원작도 미닫이·상점 문 일곱 개 밖은 전부 `HINGED`로 떨어진다.
import { SFX } from './sfx'

/** `DoorKind`와 같은 셋. 엔진이 `import/`를 들이지 않으려고 모양만 적는다 */
type DoorSoundKind = 'hinged' | 'sliding' | 'chime'

/** 열 때 (`ov5_021D431C.c:141-146 · 309-314 · 770-775`) */
export function doorOpenSe(kind: DoorSoundKind | undefined): number {
  if (kind === 'sliding') return SFX.DOOR_SLIDING
  if (kind === 'chime') return SFX.DOOR_STORE
  return SFX.DOOR
}

/** 닫을 때. 미닫이·상점 문은 소리가 없다 (`:189-194 · 360- · 800-805`) */
export function doorCloseSe(kind: DoorSoundKind | undefined): number | null {
  if (kind === 'sliding' || kind === 'chime') return null
  return SFX.DOOR_CLOSE
}
