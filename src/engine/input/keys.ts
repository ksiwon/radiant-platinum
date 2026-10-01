// 키 상태 (PLAN §6.4) — `event.code`(물리 키) 기준.
//
// ⚠️ **이 모듈은 `worldState`를 import 하지 않는다.** 메뉴 스토어가 `setUiCapture`를
// 부르려고 여기를 잡는데, `worldState`가 딸려 오면 그것이 three를 값으로 가져오고
// three 427KB가 통째로 **타이틀 초기 청크**에 실린다 — §10.4의 150KB 예산이
// 3.6배로 깨진다. 키 상태와, 그것을 `worldState`에 합성하는 일(`keyboard.ts`)을
// 나눈 이유는 그것 하나다. `initialChunk.test.ts`가 이 경계를 지킨다.
const pressed = new Set<string>()
/**
 * 지난 스텝 뒤에 **새로** 눌린 키.
 *
 * ⚠️ **눌려 있는가만 보면 짧은 톡이 사라진다.** 필드는 고정 스텝마다 `pressed`를
 * 한 번 읽는데(`keyboard.ts`), 프레임이 떨어져 스텝 사이에 keydown과 keyup이 둘 다
 * 지나가면 그 누름은 한 번도 안 보인다 — 30fps에서 33ms보다 짧게 친 Space가 대사를
 * 못 넘긴다. 메뉴는 DOM 사건으로 받아서 같은 연타가 거기서는 먹었다.
 * 그래서 눌린 순간을 여기 남겨 두고, 읽는 쪽이 한 번 읽으면 지운다(`consumeTapped`)
 */
const tapped = new Set<string>()

// 게임 활성 시에만 기본 동작을 막는다 (PLAN §11.3)
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace',
])

/**
 * 무엇을 누르면 무엇이 되는가. **여기가 그 답의 유일한 자리다.**
 *
 * ⚠️ **화면에도 이 값을 쓴다.** 오프닝에서 마박사가 조작을 설명하는데
 * (`engine/intro/controlText`), 그 글을 손으로 적어 두면 키를 바꾼 날부터
 * **거짓말이 된다.** 그래서 아래 목록에서 글자를 뽑아 쓰고, 시험이 둘을
 * 맞춰 본다 (`controlText.test`)
 */
/**
 * ⚠️ **왼손 하나로 다 되어야 한다.** 오른손은 마우스에 있고, 원작이 한 손에
 * 들고 하던 게임이다. 그래서 **임자 키를 전부 WASD 언저리**(Q W E R · A S D F ·
 * Z X C V)와 왼쪽 Shift·스페이스에 둔다. 오른쪽 키(화살표·Enter·Backspace·Esc)는
 * **덤으로만** 남긴다 — 그것만 아는 손도 있어서 뺏지는 않는다.
 *
 * 한때 등록 도구가 `Y`였다. 원작 DS의 Y 버튼이라 이름은 맞았지만 오른손을
 * 건너가야 해서 `F`로 옮겼다 (`controlLegend.test`가 왼손 범위를 지킨다)
 */
export const BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  // 원작의 A와 B. 대사창은 둘 다로 넘어가고 예/아니오는 B가 "아니오"로 간다.
  // A는 **스페이스가 임자**다 — 엄지 자리라 WASD에서 손이 안 움직인다.
  // Enter는 덤이다 — 타이틀·오프닝·메뉴가 다 Enter를 결정으로 받는데 필드 대사와
  // 말 걸기만 안 받으면, 거기서 배운 손이 필드에 와서 헛누른다
  interact: ['Space', 'KeyZ', 'Enter'],
  cancel: ['KeyX', 'Backspace'],
  /**
   * 필드에서 시작 메뉴를 여는 키 (`ui/menu/MenuLayer`).
   *
   * 원작 DS에는 없는 자리다 — 거기서는 아래 화면을 눌러 연다. `C`가 임자고,
   * B(=X)로도 열리는 것은 그 화면이 없는 우리 사정이다. Esc는 덤이다
   */
  menu: ['KeyC', 'KeyX', 'Escape'],
  /**
   * 가방에서 등록해 둔 도구를 그 자리에서 쓴다 (PARITY §4.4).
   *
   * 원작은 DS의 **Y**인데 그 자리가 오른손이라 `F`로 옮겼다 — 집게손가락
   * 제자리다
   */
  register: ['KeyF'],
  /**
   * 자전거의 단을 바꾼다 (`PlayerAvatar_TryCyclingGearChange` · `actor/bikeGear`).
   *
   * 원작은 **B**인데 우리 B 자리(`cancel`)는 이미 X고 그것이 시작 메뉴도 연다.
   * 그래서 왼손에 비어 있던 `B`를 쓴다 — 글자가 원작 버튼과 같은 것은 덤이다.
   * ⚠️ **타고 있을 때만 뜻이 있다** — 걷는 동안 눌러도 아무 일도 안 한다
   */
  gear: ['KeyB'],
  /** 포켓치를 펼친다. 길게 누르면 감춘다 (`ui/poketch/PoketchWidget`) */
  poketch: ['KeyR'],
  /** 포켓치 앱을 앞뒤로 넘긴다 */
  poketchPrev: ['KeyQ'],
  poketchNext: ['KeyE'],
  /** 1인칭과 뒤따라가는 시점을 오간다 (`app/PlayRoute`). 원작에 없는 우리 것이다 */
  view: ['KeyV'],
}

/**
 * 왼손이 닿는 자판.
 *
 * 손을 WASD에 얹은 채로 누를 수 있는 것들이다 — 숫자줄과 오른쪽 절반은 없다.
 * `controlLegend.test`가 **임자 키가 전부 이 안에 있는지** 잰다. 오른쪽 키는
 * 덤으로만 두므로 이 목록에 없어도 된다
 */
export const LEFT_HAND: readonly string[] = [
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB',
  'ShiftLeft', 'ControlLeft', 'Tab', 'CapsLock', 'Space',
]

let gameActive = false
export function setGameActive(active: boolean) {
  gameActive = active
  if (!active) pressed.clear()
  // 켤 때도 톡은 비운다 — 오프닝·배틀에서 친 Z가 필드에 들어서는 첫 스텝에 말을 건다
  tapped.clear()
}

export function isGameActive(): boolean {
  return gameActive
}

/** 키를 붙잡는 쪽. 메뉴 스택(`state/menuStore`)과 크게 펼친 포켓치(`ui/poketch/PoketchWidget`)다 */
type CaptureOwner = 'menu' | 'poketch'

/**
 * 메뉴 화면이 키를 가져갔는가.
 *
 * 가방·도감처럼 전체 화면을 덮는 것이 떠 있는 동안 주인공이 걸어 다니면 안 된다.
 * 게임 자체를 끄지(`setGameActive(false)`) 않는 이유는 뒤에서 3D가 계속 돌아야
 * 하기 때문이다 — 입력만 끊는다.
 *
 * ⚠️ **붙잡은 쪽마다 따로 센다.** 깃발 하나를 메뉴와 포켓치가 같이 쓰면 서로
 * 덮어쓴다 — 포켓치를 크게 편 채로 시작 메뉴를 열었다 닫으면 메뉴가 놓으면서
 * 포켓치 몫까지 놓아, WASD에 포켓치 커서와 주인공이 같이 움직였다. 거꾸로 메뉴
 * 위에서 포켓치를 접어도 메뉴 뒤에서 주인공이 걸었다. 하나라도 붙잡고 있으면 붙잡힌 것이다
 */
const captors = new Set<CaptureOwner>()
/**
 * @param captured 붙잡는가 놓는가
 * @param owner 누가. 놓을 때는 **자기 몫만** 놓는다
 */
export function setUiCapture(captured: boolean, owner: CaptureOwner = 'menu') {
  if (captured) captors.add(owner)
  else captors.delete(owner)
  // 붙잡을 때 눌린 키를 지운다. 안 그러면 메뉴를 닫는 순간 그 키가 필드로 샌다
  if (captured) pressed.clear()
  // 톡은 붙잡을 때도 놓을 때도 비운다 — 메뉴를 닫은 X가 필드의 B로 한 번 더 먹으면 안 된다
  tapped.clear()
}

export function isUiCaptured(): boolean {
  return captors.size > 0
}

/**
 * 지금 **글자를 치고 있는가.**
 *
 * ⚠️ **백스페이스가 안 먹었다.** 게임이 켜져 있으면 위 `GAME_KEYS`의 기본
 * 동작을 막는데, 그 안에 `Backspace`가 있다(뒤로 가기를 막으려고 넣었다).
 * 그런데 이름 칸도 같은 창에 있어서 **이름을 지우는 것까지 막혔다** — 실제로
 * 오프닝에서 이름을 못 지운다는 보고를 받았다. 별명 짓는 칸도 같은 자리다.
 *
 * 글자 칸으로 간 키는 게임 키가 아니다. 눌린 것으로 세지도 않는다 — 안 그러면
 * 이름에 스페이스를 넣을 때 대사가 넘어가고, 화살표로 주인공이 걷는다
 */
export function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

/** 끌면 반투명 그림이 따라붙는 것 — 파티 카드·요약·도감의 포켓몬 그림이다 */
function isImage(target: EventTarget | null): boolean {
  return typeof HTMLImageElement !== 'undefined' && target instanceof HTMLImageElement
}

/**
 * 창에 키를 붙인다. 무대(`scene/Stage`)가 설 때 한 번 붙고 다시 안 뗀다.
 *
 * ⚠️ **브라우저 기본 동작도 여기서 막는다** — 키보드로 다루는 게임인데 웹 페이지라는
 * 티가 새면 안 된다. 셋이다.
 *
 * - **Tab** — 게임 커서와 따로 브라우저 포커스 링이 돈다. 걷는 중에는 위 `GAME_KEYS`가
 *   막지만, 오프닝·겹창처럼 게임이 아직 안 켜진 동안에도 막는다. 글 칸은 비켜 준다
 * - **오른쪽 클릭** — 대사창·메뉴 위에서 「뒤로 · 새로고침 · 검사」가 떴다. 캔버스만
 *   막던 것(`scene/Stage`)을 창 전체로 넓힌다. 글 칸은 붙여넣기 메뉴가 있어야 해 비켜 준다
 * - **그림 끌기** — 포켓몬 그림을 끌면 반투명 그림이 따라왔다
 *
 * ⚠️ 무대가 서기 전의 타이틀 화면에는 이것이 아직 안 붙어 있다 — 거기는 따로 막아야 한다
 */
export function attachKeyboard(target: Window = window) {
  target.addEventListener('keydown', (e) => {
    if (typingInto(e.target)) return
    if (e.code === 'Tab' || (gameActive && GAME_KEYS.has(e.code))) e.preventDefault()
    // 자동 반복은 이미 눌린 키다 — 톡으로 또 세지 않는다
    if (!pressed.has(e.code)) tapped.add(e.code)
    pressed.add(e.code)
  })
  target.addEventListener('keyup', (e) => pressed.delete(e.code))
  target.addEventListener('blur', () => { pressed.clear(); tapped.clear() })
  target.addEventListener('contextmenu', (e) => {
    if (!typingInto(e.target)) e.preventDefault()
  })
  target.addEventListener('dragstart', (e) => {
    if (isImage(e.target)) e.preventDefault()
  })
}

/** 이 동작에 묶인 키 중 하나라도 눌려 있는가 */
export function held(codes: string[]): boolean {
  return codes.some((c) => pressed.has(c))
}

/**
 * 이 동작에 묶인 키 중 하나라도 **지난번에 물은 뒤로 새로 눌렸는가.** 물으면 지운다.
 *
 * 이미 떼었어도 참이다 — 스텝 사이에 지나간 톡을 잡으려는 것이다. 고정 스텝마다
 * 한 번만 묻는다(`keyboard.ts`) — 그래야 그 누름이 **한 스텝만** 참이 되어
 * 스크립트의 「눌린 순간」(`script/field`의 `readInput`)이 한 번만 선다
 */
export function consumeTapped(codes: readonly string[]): boolean {
  let hit = false
  for (const c of codes) if (tapped.delete(c)) hit = true
  return hit
}

/** 남은 톡을 버린다. 키가 주인공까지 안 가는 동안(`keyboard.ts`의 막힌 갈래) 부른다 */
export function clearTapped(): void {
  tapped.clear()
}
