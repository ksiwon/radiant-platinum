// 코덱 (PLAN §9.3)
//
// ⚠️ 이 파일이 지키는 것은 **하나**다: `JSON.stringify(SaveData)`가 도감을
// 조용히 부순다는 사실. 그게 `saveStore.test.ts`에 이미 증거로 박혀 있고
// ("JSON 직렬화는 같은 데이터를 파괴한다"), 파일 내보내기는 그 JSON을 지나야만
// 한다. 코덱이 그 사이에 있다.
import { describe, it, expect } from 'vitest'
import { base64ToBytes, bytesToBase64, checksum, decodePayload, encodePayload } from './codec'
import { createNewSave, DEX_BYTES } from '../saveStore'
import { dexHas, dexSet } from '../../engine/pokemon/dex'

describe('base64', () => {
  it('아무 바이트나 왕복한다', () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes])
  })

  it('빈 배열도 왕복한다', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0))).length).toBe(0)
  })

  it('길어도 스택이 안 터진다', () => {
    // ⚠️ `String.fromCharCode(...bytes)`는 인자를 스택에 쌓는다. 12만 바이트면
    // 브라우저에 따라 `RangeError`다 — 조각내지 않으면 큰 세이브에서 저장이 죽는다
    const big = new Uint8Array(300_000).fill(0xab)
    expect(base64ToBytes(bytesToBase64(big)).length).toBe(300_000)
  })
})

describe('TypedArray 왕복', () => {
  it('도감 비트필드가 살아 돌아온다 — JSON만으로는 안 되는 그것', () => {
    const save = createNewSave()
    save.pokedex.seen = dexSet(save.pokedex.seen, 387)
    save.pokedex.caught = dexSet(save.pokedex.caught, 493)

    const back = decodePayload(encodePayload(save)) as typeof save

    expect(back.pokedex.seen).toBeInstanceOf(Uint8Array)
    expect(back.pokedex.seen.length).toBe(DEX_BYTES)
    expect(dexHas(back.pokedex.seen, 387)).toBe(true)
    expect(dexHas(back.pokedex.caught, 493)).toBe(true)
    // 그리고 **다음 쓰기가 살아남는다.** 평범한 객체로 뭉개졌으면 여기서 길이 0이 된다
    expect(dexSet(back.pokedex.seen, 25).length).toBe(DEX_BYTES)
  })

  it('u16도 종류를 지킨다 — 스크립트 변수가 u8이 되면 값이 잘린다', () => {
    const save = createNewSave()
    save.vars[3] = 40000
    const back = decodePayload(encodePayload(save)) as typeof save
    expect(back.vars).toBeInstanceOf(Uint16Array)
    expect(back.vars[3]).toBe(40000)
  })

  it('null과 빈 배열을 안 잃는다 — 박스 540칸이 전부 null이다', () => {
    const save = createNewSave()
    const back = decodePayload(encodePayload(save)) as typeof save
    expect(back.boxes).toHaveLength(18)
    expect(back.boxes[0]).toHaveLength(30)
    expect(back.boxes[0]![0]).toBeNull()
    expect(back.party).toEqual([])
  })

  it('모르는 종류는 조용히 지나가지 않는다', () => {
    // Map을 `{}`로 뭉개면 그 안의 값이 사라진 것을 아무도 모른다
    expect(() => encodePayload({ x: new Map([[1, 2]]) })).toThrow(/모르는 종류/)
  })

  it('반쪽 난 u16은 되살리다 세운다', () => {
    // 손상 파일에서 실제로 나오는 모양이다. `new Uint16Array(홀수바이트)`는
    // 던지는데, 그 오류가 "왜 못 읽는지"를 말해 주지 않는다
    const broken = JSON.stringify({ v: { $ta: 'u16', $b: bytesToBase64(new Uint8Array(3)) } })
    expect(() => decodePayload(broken)).toThrow(/길이가 안 맞는다/)
  })
})

describe('체크섬', () => {
  it('같은 글은 같은 값이다', () => {
    expect(checksum('가나다')).toBe(checksum('가나다'))
    expect(checksum('')).toHaveLength(8)
  })

  it('한 글자만 바뀌어도 달라진다', () => {
    expect(checksum('나빛')).not.toBe(checksum('나빚'))
  })

  it('⚠️ 상위 바이트를 안 버린다 — 한글 이름만 바뀐 손상을 놓치면 안 된다', () => {
    // `h ^ (c & 0xff)`만 먹이면 `가`(0xAC00)와 `개`(0xAC1C)는… 하위가 다르니 통과한다.
    // 하위가 같고 상위만 다른 짝을 골라야 실제로 잰다: 0xAC00과 0xAD00
    expect(checksum(String.fromCharCode(0xac00))).not.toBe(checksum(String.fromCharCode(0xad00)))
  })

  it('세이브가 한 칸 바뀌면 payload 체크섬이 바뀐다', () => {
    const a = createNewSave()
    const b = { ...a, money: a.money + 1 }
    expect(checksum(encodePayload(a))).not.toBe(checksum(encodePayload(b)))
  })
})
