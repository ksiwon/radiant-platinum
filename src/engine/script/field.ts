// 필드 스크립트 실행 (DATA.md §2.10) — 오버월드와 VM을 잇는 자리.
//
// 원작의 한 프레임이 그대로 여기 있다. 스크립트가 돌고 있으면 그것을 한 칸
// 굴리고(`ScriptContext_Run`), 아니면 말을 걸었는지 본다. 스크립트가 도는 동안
// **플레이어는 못 움직인다** — 원작도 `LockAll`로 세워 둔다.
//
// 이 모듈은 React를 모른다. 화면은 `world`를 들여다보기만 한다.
import { loadDialogueBank, loadScriptBytes, loadScriptMeta, type DataLocale } from '../../data/gameData'
import { mapById, npcsOf, NO_SCRIPT, world as mapWorld, type Npc } from '../map/world'
import { worldState } from '../../state/worldState'
import { buildCommands, type CommandTable } from './commands'
import { ScriptContext, ScriptError } from './context'
import { entryOffset, fileBytes, resolveScript, type ScriptData } from './data'
import { TEXT_SPEED, type PrinterInput } from './printer'
import { VarStore, VAR_LAST_TALKED } from './vars'
import { FieldWorld, MENU_NO, MENU_YES, type NameSource } from './world'

/**
 * 한 프레임에 이만큼 넘게 명령을 밟으면 스크립트가 되돌아 도는 것이다.
 *
 * 원작은 상한이 없다 — 그런 스크립트가 없으니까. 우리는 아직 안 만든 명령을
 * 건너뛰므로 조건이 영영 안 바뀌는 고리가 생길 수 있고, 그때 브라우저 탭이
 * 통째로 멎으면 안 된다
 */
const STEP_CAP = 200_000

export const fieldScripts = {
  data: null as ScriptData | null,
  commands: null as CommandTable | null,
  world: null as FieldWorld | null,
  /** 세이브에 남을 변수·플래그. 지금은 이 자리에만 있다 */
  vars: new VarStore(),
  /** 지금 도는 스크립트. null이면 오버월드가 자유롭다 */
  ctx: null as ScriptContext | null,
  /** 화면에 띄운 마지막 오류. 스크립트가 터져도 게임은 계속 돌아야 한다 */
  lastError: null as string | null,
  /** 지금 받아 둔 대사 뱅크 번호 (맵 헤더의 `msg`) */
  bank: -1,
  /**
   * 대사에 끼워 넣을 이름. 세이브가 로드되면 화면 쪽에서 갈아 끼운다.
   *
   * 함수로 두는 이유는 이름이 세계보다 늦게 정해지기 때문이다 — 세계는 맵이
   * 뜰 때 만들어지고 이름은 세이브가 복원된 뒤에야 나온다
   */
  names: {
    player: () => '',
    rival: () => '',
    counterpart: () => '',
  } as NameSource,
  /**
   * 스크립트 한 판이 끝날 때 불린다. 세이브에 밀어 넣는 자리다.
   *
   * 매 프레임이 아니라 **판이 끝날 때**만 부른다 — 플래그 하나 세울 때마다
   * IndexedDB에 쓰면 대사 한 번에 수십 번 저장이 나간다
   */
  onScriptEnd: null as ((vars: VarStore) => void) | null,
}

/**
 * 세이브에서 복원한 변수·플래그를 붓는다.
 *
 * 새 `VarStore`로 갈아 끼우지 않고 **내용만 덮어쓴다** — 이미 만들어진 세계와
 * 실행 문맥이 같은 객체를 들고 있기 때문이다
 */
export function loadVars(saved: Uint16Array, flags: Uint8Array): void {
  const target = fieldScripts.vars
  target.saved.set(saved.subarray(0, target.saved.length))
  target.flags.set(flags.subarray(0, target.flags.length))
}

/** 스크립트가 돌고 있는가. 이동·조우 시스템이 이걸 보고 비켜선다 */
export function scriptBusy(): boolean {
  return fieldScripts.ctx !== null
}

let locale: DataLocale = 'ko'

/**
 * 바이트코드와 명령표를 받는다. 한 번만 하면 된다.
 *
 * 대사 뱅크는 여기서 안 받는다 — 맵마다 다르고 맵이 정해진 뒤에야 알 수 있다
 */
export async function initFieldScripts(which: DataLocale = 'ko'): Promise<void> {
  if (fieldScripts.data !== null) return
  locale = which
  const [meta, bytes] = await Promise.all([loadScriptMeta(), loadScriptBytes()])
  fieldScripts.data = { meta, bytes }
  fieldScripts.commands = buildCommands(meta.commands)
  fieldScripts.world = makeWorld(fieldScripts.vars)
}

/**
 * 세계 하나. 버튼을 이 모듈이 읽는 프레임 입력에 묶는다 —
 * 그 배선이 어긋나면 대사창이 영영 안 넘어간다
 */
export function makeWorld(vars: VarStore, messages?: readonly string[]): FieldWorld {
  return new FieldWorld({
    vars,
    messages,
    options: { speed: TEXT_SPEED.normal, canSkip: true, autoScroll: false },
    input: () => frameInput,
    // 이름은 세이브가 복원되면 바뀌므로 그때그때 물어본다. 여기서 값을
    // 붙잡아 두면 세이브보다 먼저 만들어진 세계가 영영 빈 이름을 쓴다
    names: {
      player: () => fieldScripts.names.player(),
      rival: () => fieldScripts.names.rival(),
      counterpart: () => fieldScripts.names.counterpart(),
    },
  })
}

/** 맵이 바뀌면 읽을 뱅크도 바뀐다. 실패해도 게임은 계속 돈다 — 글만 빈다 */
export async function loadMapDialogue(mapId: number): Promise<void> {
  const header = mapById(mapId)
  if (!header || header.msg === fieldScripts.bank) return
  fieldScripts.bank = header.msg
  const bank = await loadDialogueBank(locale, header.msg)
  // 받는 사이에 맵이 또 바뀌었으면 늦게 온 것을 버린다
  if (fieldScripts.bank === header.msg) fieldScripts.world?.setMessages(bank)
}

// ── 한 프레임 ────────────────────────────────────────────────────────────────

/**
 * 이번 프레임의 버튼. 한 프레임 안에서는 누가 물어도 같은 값이어야 한다 —
 * 인쇄기와 대기 명령이 같은 프레임에 따로 물어보기 때문이다
 */
let frameInput: PrinterInput = { pressed: false, held: false }

/** 눌린 순간만 잡는다. 누르고 있는 동안 계속 참이면 메뉴가 한 번에 지나간다 */
const edges = { a: false, b: false, up: false, down: false }
const last = { a: false, b: false, up: false, down: false }

/** 방향키가 이만큼 기울면 눌린 것으로 본다 */
const STICK = 0.5

function readInput(): void {
  const input = worldState.input
  const now = {
    a: input.interact,
    b: input.cancel,
    up: input.move.y < -STICK,
    down: input.move.y > STICK,
  }
  for (const key of ['a', 'b', 'up', 'down'] as const) {
    edges[key] = now[key] && !last[key]
    last[key] = now[key]
  }
  // A와 B 둘 다 대사창을 넘긴다 (`ScriptContext_CheckABPress`)
  frameInput = { pressed: edges.a || edges.b, held: now.a || now.b }
}

export const scriptSystem = {
  fixedUpdate(): void {
    readInput()

    const { ctx, world } = fieldScripts
    if (ctx !== null && world !== null) {
      // 스크립트가 도는 동안은 발이 묶인다. 입력 시스템 다음에 돌아야
      // 이 지우기가 이동 시스템보다 먼저다
      worldState.input.move.set(0, 0)
      worldState.player.velocity.set(0, 0, 0)
      if (world.menu !== null) chooseFromMenu(world)
      step(ctx, world)
      return
    }
    if (edges.a) tryTalk()
  },
}

/** 예/아니오 커서. B는 곧바로 "아니오"다 — 원작도 B로 물러난다 */
function chooseFromMenu(world: FieldWorld): void {
  if (edges.up) world.menuCursor = MENU_YES
  if (edges.down) world.menuCursor = MENU_NO
  if (edges.b) world.choose(MENU_NO)
  else if (edges.a) world.choose(world.menuCursor)
}

function step(ctx: ScriptContext, world: FieldWorld): void {
  try {
    if (!ctx.step(STEP_CAP)) {
      finish()
      return
    }
    world.tick()
  } catch (e) {
    // 한 스크립트가 터졌다고 오버월드까지 멎으면 안 된다. 창을 닫고 놓아준다
    fieldScripts.lastError = e instanceof ScriptError ? e.message : String(e)
    finish()
  }
}

function finish(): void {
  fieldScripts.ctx = null
  fieldScripts.world?.closeBox(true)
  fieldScripts.world?.slots.clear()
  fieldScripts.vars.resetLocals()
  fieldScripts.onScriptEnd?.(fieldScripts.vars)
}

// ── 말 걸기 ──────────────────────────────────────────────────────────────────

/** 바라보는 방향의 단위 벡터. `facing`은 `atan2(vx, vz)`라 0이 +z다 */
const FACING_STEP = [
  { x: 0, z: 1 }, // 0  +z
  { x: 1, z: 0 }, // 1  +x
  { x: 0, z: -1 }, //  2  −z
  { x: -1, z: 0 }, // 3  −x
] as const

/** 지금 바라보는 앞 타일 */
export function tileInFront(x: number, z: number, facing: number): { x: number, z: number } {
  const quarter = ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4
  const step = FACING_STEP[quarter]!
  return { x: Math.floor(x) + step.x, z: Math.floor(z) + step.z }
}

/**
 * 그 자리에 서 있는 NPC.
 *
 * 플래그가 **서 있으면 숨은 것**이다 — 원작이 `if (!FieldSystem_CheckFlag(…))`
 * 일 때만 객체를 만든다. 반대로 읽으면 이야기가 끝난 NPC에게 계속 말을 걸게 된다
 */
export function npcAt(mapId: number, x: number, z: number, vars: VarStore): Npc | null {
  for (const npc of npcsOf(mapId)) {
    if (npc.x !== x || npc.z !== z) continue
    if (npc.flag !== null && vars.checkFlag(npc.flag)) continue
    return npc
  }
  return null
}

/**
 * 이 트레이너 종류만 말을 걸어도 자기 스크립트가 안 돌고 0번(아무 일 없음)이 돈다.
 * 원작의 `if (MapObject_GetTrainerType(object) != 0x9)`
 */
const TRAINER_TYPE_NO_TALK = 9

function tryTalk(): void {
  const { world, vars } = fieldScripts
  if (world === null) return
  const header = mapById(mapWorld.mapId)
  if (!header) return

  const p = worldState.player
  const front = tileInFront(p.position.x, p.position.z, p.facing)
  const npc = npcAt(mapWorld.mapId, front.x, front.z, vars)
  if (!npc || npc.script === NO_SCRIPT) return

  const id = npc.trainerType === TRAINER_TYPE_NO_TALK ? 0 : npc.script
  start(id, header.scripts, npc.localID)
}

/**
 * 스크립트 하나를 건다.
 *
 * @param scriptID 맵 이벤트가 들고 있는 번호. 2000 이상은 공용 구역이다
 * @param mapFile  지금 맵의 스크립트 파일 (`맵 헤더의 scripts`)
 * @param localID  말을 건 상대. `VAR_LAST_TALKED`로 스크립트가 읽는다
 */
export function start(scriptID: number, mapFile: number, localID = 0): boolean {
  const { data, commands, world, vars } = fieldScripts
  if (data === null || commands === null || world === null) return false

  const target = resolveScript(data.meta, scriptID, mapFile)
  if (!target) return false
  const info = data.meta.files[target.file]
  if (!info || target.entry >= info.entries) return false

  vars.resetLocals()
  vars.set(VAR_LAST_TALKED, localID)
  world.slots.clear()
  world.lastMessage = null

  const ctx = new ScriptContext(
    { vars, world, commands: commands.map }, fileBytes(data, target.file), target.file,
  )
  ctx.start(entryOffset(data, target.file, target.entry))
  fieldScripts.ctx = ctx
  fieldScripts.lastError = null
  return true
}
