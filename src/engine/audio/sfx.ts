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
   * `SEQ_SE_PL_FW463`. 깨어진 세계의 폭포 (`ov9_02249960.c` 8223·8545줄).
   *
   * 뛰어들 때 켜고 다 내려간 자리에서 끈다(8429·8726줄) — 11초를 흐른다
   */
  WATERFALL: 1488,
  /**
   * `SEQ_SE_DP_ELEBETA2`. 승강기가 오르내리는 소리
   * (`overlay006/elevator_animation.c`의 `..._STATE_PLAY_WITH_SOUND`).
   *
   * ⚠️ **오르든 내리든 같은 소리다.** 원작이 `if (dir == UP) … else …`로 갈라
   * 놓고 양쪽에 같은 번호를 적었다 — 방향으로 소리를 나누면 원작에 없는 것을 짓는 셈이다
   */
  ELEVATOR: 1554,
  /** `SEQ_SE_DP_PINPON`. 승강기가 다 왔을 때의 「띵동」. 이 소리가 끝나야 문이 열린다 */
  ELEVATOR_DING: 1521,
  /**
   * `SEQ_SE_DP_FW019`. 기라티나 그림자가 **달아날 때**
   * (`ov9_02249960.c`의 `GIRATINA_SHADOW_PROP_SFX_KIND_FLEE`).
   *
   * 그림자 넷 중 소리가 갈린다 — 1F와 B4F 셋은 울음소리(`SFX_KIND_CRY`)고,
   * 기라티나 방 둘째만 이 소리다. 첫째는 소리가 없다
   */
  GIRATINA_FLEE: 1609,
  /**
   * `SEQ_SE_PL_GIRA`. 기라티나가 하늘에서 내려설 때
   * (`EventCmdPlayGiratinaArrival_InitSpriteAndSky`)
   */
  GIRATINA_ARRIVE: 1489,

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
  /**
   * `SEQ_SE_DP_VS_SEEKER_BEEP`. VS시커가 둘레를 훑는 소리
   * (`vs_seeker.c`의 `VS_SEEKER_STATE_START`).
   *
   * ⚠️ **이 소리가 끝날 때까지 스크립트가 선다** — 원작이 소리 하나로 연출
   * 길이를 잰다 (`VS_SEEKER_STATE_WAIT_FOR_VS_SEEKER_SFX`)
   */
  VS_SEEKER: 1568,
} as const

export type SfxName = keyof typeof SFX
