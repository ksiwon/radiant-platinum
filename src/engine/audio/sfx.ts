// 효과음 번호 (DATA.md §2.18)
//
// **어느 소리를 언제 내는지는 디컴프가 정한다.** 이름만 보고 고르면 그럴듯한
// 다른 소리를 집게 된다 — BGM에서 이미 한 번 그랬다(야생 배틀 곡 자리에
// 아카기 곡을 적었다).
//
// 이름 → 번호는 `generated/sdat.txt`가 준다. 그 파일은 `이름 = 숫자` 닻을 두고
// 그 뒤로 하나씩 올라가는 목록이라 **줄 번호에 상수를 더하는 방식으로는 안 된다** —
// SE 구간에서 어긋난다. 닻을 읽어 세면 SEQ 이름 1013개 중 982개가 SDAT의 `SYMB`와
// 글자까지 같고, 다른 31개는 디컴프가 일부러 고쳐 붙인 이름이다.
//
// ⚠️ `SEQ_SE_CONFIRM`이 그 31개 중 하나다. SDAT는 같은 번호를 `SEQ_SE_DP_SELECT`라
// 부른다 — 이름으로 찾으면 못 찾는다.

export const SFX = {
  /**
   * 메뉴. `Menu_ProcessInput`이 **A·B·상하좌우 전부** 이 하나를 쓴다
   * (`menu.c` 71~110줄). 고르는 소리와 움직이는 소리가 따로가 아니다
   */
  MENU: 1500,
  /** `SEQ_SE_DP_DECIDE`. 배틀 화면이 고를 때 쓴다 (`battle_display.c`) */
  DECIDE: 1501,
  /** `SEQ_SE_DP_DOOR_OPEN`. 문 (`ov5_021D431C.c`) */
  DOOR: 1541,
  /** `SEQ_SE_DP_KAIDAN2`. 계단·동굴 (`field_map_change.c` 631·1516줄) */
  STAIRS: 1539,
  /** `SEQ_SE_DP_NAGERU`. 공 던지기 (`battle_script.c` 10398줄) */
  THROW: 1802,
  /** `SEQ_SE_DP_POKE_DEAD3`. 쓰러질 때 */
  FAINT: 1795,
  /** `SEQ_SE_DP_HINSI`. 체력이 바닥일 때 (`battle_main.c` 1564줄) */
  LOW_HP: 1796,
  /** `SEQ_SE_DP_KAIFUKU`. 회복 */
  HEAL: 1516,
  /** `SEQ_SE_DP_SAVE`. 저장 (`clear_game.c` 136줄) */
  SAVE: 1563,

  /**
   * 기술이 맞는 소리 셋. **효과에 따라 다른 소리다** —
   * `BattleDisplay_FlyMoveHitSoundEffect`(`battle_display.c` 1694줄)가
   * `effectiveness`로 갈라 `Sound_PlayPannedEffect`를 부른다:
   * 0(보통) → `KOUKA_M` · 1(별로) → `KOUKA_L` · 2(굉장) → `KOUKA_H`.
   *
   * ⚠️ 쇼다운은 **보통일 때 아무 줄도 안 보낸다.** `-supereffective`/`-resisted`가
   * 없다는 것이 곧 보통이므로, 없을 때 `KOUKA_M`을 내야 대부분의 타격에 소리가 난다
   */
  HIT_SUPER: 1788,
  HIT_WEAK: 1789,
  HIT_NORMAL: 1790,
  /** `SEQ_SE_DP_BOWA2`. 공에서 나올 때 (`battle_display.c` 2058줄) */
  SEND_OUT: 1798,
  /** `SEQ_SE_DP_NIGERU`. 도망 */
  FLEE: 1792,
  /** `SEQ_SE_DP_GETTING`. 잡았다 (`battle_script.c` 10482줄) */
  CAUGHT: 1801,
  /** `SEQ_SE_DP_KON`. 공이 흔들릴 때 (`battle_script.c` 10420줄) */
  BALL_SHAKE: 1510,
  /**
   * `SEQ_SE_DP_BAG_030`. 서류가방이 열릴 때
   * (`choose_starter_app.c`의 `CHOICE_STEP_PLAY_BAG_NOISE`)
   */
  BAG_OPEN: 1738,
  /**
   * `SEQ_SE_DP_FW104`. 낚싯대를 던져 찌가 물에 떨어지는 소리
   * (`fishing.c`의 `FishingTask_CastRod`, 던지고 10프레임째)
   */
  CAST_ROD: 1616,
} as const

export type SfxName = keyof typeof SFX
