// 우편 (PARITY §4.8) — `mail.c` · `applications/mail.c` · `applications/mail_viewer.c`
//
// 편지지 열두 장에 낱말로 세 줄을 쓴다. 쓴 편지는 **포켓몬이 지니고**, 떼면
// 우편함 스무 칸으로 들어간다. 글은 낱말 고르기가 만든다 (`easyChat.ts`).
//
// ⚠️ **편지지는 도구다.** 도구 번호 137(풀편지)부터 148(벽돌편지)까지 열둘이고
// (`FIRST_MAIL_IDX`~`LAST_MAIL_IDX`), 쓰는 순간 가방에서 빠져 포켓몬에게 붙는다.
//
// ⚠️ **편지에 쓴 사람이 새겨진다** — 트레이너 번호·이름·성별·게임판·언어.
// 그래서 남의 편지는 지운 뒤에야 다시 쓸 수 있고, 지우면 편지지로 되돌아온다.
//
// ⚠️ **아이콘 셋은 「그때 파티에 있던 마리」다** (`Mail_SetTrainerAndIconData`) —
// 편지를 쓴 자리부터 파티 끝까지 최대 셋을 그대로 새긴다. 나중에 파티가 바뀌어도
// 편지의 그림은 안 바뀐다.
//
// ⚠️ **우편함은 스무 칸이고 꽉 차면 못 뗀다.** 원작이 그 자리에서 「우편함이
// 가득 찼습니다」로 막는다 (`Mail_GetEmptyMailSlot`이 −1을 준다).
import { EASY_CHAT_WORD_NONE } from './easyChatTable'

/** 편지지 도구 번호의 첫 칸 (`ITEM_GRASS_MAIL`) */
export const MAIL_ITEM_FIRST = 137
/** 편지지 열두 장 (`NUM_MAIL_TYPES`) */
export const MAIL_TYPE_COUNT = 12
/** 아무 편지도 아님 (`MAIL_TYPE_NONE`) */
export const MAIL_TYPE_NONE = 0xffff
/** 우편함 (`MAILBOX_SIZE`) */
export const MAILBOX_SIZE = 20
/** 한 편지의 줄 수 (`MAIL_MAX_SENTENCES`) */
export const MAIL_LINES = 3
/** 한 줄의 낱말 수 (`MAX_EASY_CHAT_SENTENCE_WORD_SLOTS`) */
export const MAIL_WORDS_PER_LINE = 2
/** 편지에 새기는 아이콘 (`MAIL_MAX_ICONS`) */
export const MAIL_ICONS = 3

/**
 * 편지지 열둘의 이름표. **차례가 곧 편지지 번호**다.
 *
 * ⚠️ **번호로만 가르면 안 되는 자리가 있다** — 도구표를 읽는 쪽은 번호를
 * 갖고 있지만 필드 도구 갈래를 정하는 자리는 `constant`만 갖는다. 둘이
 * 어긋나지 않는 것은 시험이 `items.json`과 맞대어 지킨다
 */
export const MAIL_ITEM_CONSTANTS: readonly string[] = [
  'ITEM_GRASS_MAIL', 'ITEM_FLAME_MAIL', 'ITEM_BUBBLE_MAIL', 'ITEM_BLOOM_MAIL',
  'ITEM_TUNNEL_MAIL', 'ITEM_STEEL_MAIL', 'ITEM_HEART_MAIL', 'ITEM_SNOW_MAIL',
  'ITEM_SPACE_MAIL', 'ITEM_AIR_MAIL', 'ITEM_MOSAIC_MAIL', 'ITEM_BRICK_MAIL',
]

/** 도구 번호 → 편지지 번호. 편지지가 아니면 `null` */
export function mailTypeOfItem(item: number): number | null {
  const at = item - MAIL_ITEM_FIRST
  return at >= 0 && at < MAIL_TYPE_COUNT ? at : null
}

/** 도구 이름표 → 편지지 번호. 편지지가 아니면 `null` */
export function mailTypeOfConstant(constant: string): number | null {
  const at = MAIL_ITEM_CONSTANTS.indexOf(constant)
  return at < 0 ? null : at
}

/** 편지지 번호 → 도구 번호 */
export function mailItemOfType(type: number): number {
  return MAIL_ITEM_FIRST + type
}

/** 편지에 새겨지는 아이콘 하나 — 그때 파티에 있던 마리다 */
interface MailIcon {
  species: number
  form: number
  isEgg: boolean
}

export interface Mail {
  /** 편지지 번호 0~11. `MAIL_TYPE_NONE`이면 빈 칸이다 */
  type: number
  trainerId: number
  trainerName: string
  /** 0 남자 · 1 여자 */
  trainerGender: number
  icons: MailIcon[]
  /** 줄 셋 × 낱말 둘. 안 쓴 칸은 `EASY_CHAT_WORD_NONE` */
  lines: number[][]
}

/** 빈 편지 (`Mail_Reset`) */
export function newMail(): Mail {
  return {
    type: MAIL_TYPE_NONE,
    trainerId: 0,
    trainerName: '',
    trainerGender: 0,
    icons: [],
    lines: Array.from({ length: MAIL_LINES }, () =>
      Array.from({ length: MAIL_WORDS_PER_LINE }, () => EASY_CHAT_WORD_NONE)),
  }
}

/** 빈 우편함 (`Mailbox_Init`) */
export function newMailbox(): Mail[] {
  return Array.from({ length: MAILBOX_SIZE }, () => newMail())
}

/**
 * 이 칸에 편지가 들어 있는가 (`Mail_IsValid`).
 *
 * ⚠️ **글이 비었는지를 안 본다.** 낱말을 하나도 안 넣은 편지도 편지다 —
 * 원작이 편지지 번호만 본다
 */
export function hasMail(mail: Mail | null | undefined): boolean {
  return mail !== null && mail !== undefined
    && mail.type >= 0 && mail.type < MAIL_TYPE_COUNT
}

/** 우편함에 든 편지 수 (`Mailbox_CountMail`) */
export function mailboxCount(box: readonly Mail[]): number {
  return box.filter((m) => hasMail(m)).length
}

/** 빈 칸 번호. 꽉 찼으면 −1 (`Mail_GetEmptyMailSlot`) */
export function emptyMailSlot(box: readonly Mail[]): number {
  return box.findIndex((m) => !hasMail(m))
}

interface MailWriter {
  trainerId: number
  trainerName: string
  trainerGender: number
  /** 편지를 쓰는 자리부터 파티 끝까지. 앞에서 셋만 새긴다 */
  party: readonly MailIcon[]
}

/**
 * 새 편지를 쓴다 (`Mail_SetTrainerAndIconData`).
 *
 * ⚠️ **고른 자리부터 센다** — 원작이 `selectedPartySlot`에서 시작해 파티 끝까지
 * 훑으며 셋을 채운다. 0부터 세면 늘 선두 셋이 새겨진다
 */
export function writeMail(type: number, writer: MailWriter, lines: number[][]): Mail {
  return {
    type,
    trainerId: writer.trainerId,
    trainerName: writer.trainerName,
    trainerGender: writer.trainerGender,
    icons: writer.party.slice(0, MAIL_ICONS).map((m) => ({ ...m })),
    lines: Array.from({ length: MAIL_LINES }, (_, i) =>
      Array.from({ length: MAIL_WORDS_PER_LINE }, (_, j) =>
        lines[i]?.[j] ?? EASY_CHAT_WORD_NONE)),
  }
}

/** 편지에 낱말이 하나라도 들어 있는가 — 「단어를 넣어 주십시오」의 판정이다 */
export function mailHasWords(mail: Mail): boolean {
  return mail.lines.some((line) => line.some((w) => w !== EASY_CHAT_WORD_NONE))
}

interface MailboxMove {
  box: Mail[]
  slot: number
}

/**
 * 포켓몬에게서 편지를 떼어 우편함에 넣는다 (`Mail_TransferFromMonToMailbox`).
 *
 * 꽉 찼으면 `null`이다 — **떼지 않는다.** 떼고 나서 넣을 데가 없으면 편지가
 * 사라진다
 */
export function toMailbox(box: readonly Mail[], mail: Mail): MailboxMove | null {
  const slot = emptyMailSlot(box)
  if (slot < 0) return null
  const next = box.map((m) => m)
  next[slot] = mail
  return { box: next, slot }
}

/** 우편함에서 꺼낸다 (`Mail_TransferFromMailboxToMon`). 빈 칸이면 `null` */
export function fromMailbox(box: readonly Mail[], slot: number): { box: Mail[], mail: Mail } | null {
  const mail = box[slot]
  if (!mail || !hasMail(mail)) return null
  const next = box.map((m) => m)
  next[slot] = newMail()
  return { box: next, mail }
}

/**
 * 내용을 지운다 (`Mailbox_ClearMailAtSlot`).
 *
 * ⚠️ **지우면 편지지로 되돌아온다** — 원작이 그 자리에서 가방에 도구를 넣고,
 * 가방이 꽉 찼으면 **버린다**(「가방이 가득 차 있습니다... 메일을 버렸습니다」)
 */
export function clearMailAt(box: readonly Mail[], slot: number): { box: Mail[], item: number } | null {
  const mail = box[slot]
  if (!mail || !hasMail(mail)) return null
  const next = box.map((m) => m)
  next[slot] = newMail()
  return { box: next, item: mailItemOfType(mail.type) }
}
