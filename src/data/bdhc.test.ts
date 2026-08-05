// 추출된 높이 데이터 검증 (DATA.md §2.2)
//
// 크기 합은 "포맷을 맞게 읽었다"까지만 말한다. **값이 맞는지는 별개 문제다** —
// 청크를 한 칸 밀려 읽어도 크기는 맞는다. 그래서 여기서는 산출물을 실제로 펴서
// 평면식이 말이 되는 높이를 내는지, 아는 장소가 아는 높이인지를 본다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { bdhcFileSchema } from './schema'

const DATA = resolve(__dirname, '../../public/data')
const present = existsSync(resolve(DATA, 'bdhc.json')) && existsSync(resolve(DATA, 'bdhc.bin'))
const maybe = present ? describe : describe.skip

maybe('지면 높이', () => {
  const meta = bdhcFileSchema.parse(JSON.parse(readFileSync(resolve(DATA, 'bdhc.json'), 'utf8')))
  const bin = readFileSync(resolve(DATA, 'bdhc.bin'))
  const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer
  const coords = new Int32Array(buf, 0, meta.plateCount * 4)
  const refs = new Uint16Array(buf, meta.plateCount * 16, meta.plateCount)

  /** 판 하나를 타일 척도로 편다 */
  const plate = (i: number) => {
    const o = i * 4
    const s = meta.fixedPerTile
    return {
      x1: coords[o]! / s, z1: coords[o + 1]! / s,
      x2: coords[o + 2]! / s, z2: coords[o + 3]! / s,
      plane: meta.planes[refs[i]!]!,
    }
  }
  /** 판 위 한 점의 높이. 런타임이 쓸 식과 같아야 한다 */
  const heightAt = (p: ReturnType<typeof plate>, x: number, z: number) => {
    const [nx, ny, nz, d] = p.plane
    return -(nx * x + nz * z + d) / ny
  }

  it('파일 두 개의 크기가 서로 맞는다', () => {
    // bin이 잘리거나 json이 낡으면 여기서 잡힌다 — 좌표 4×int32 + 색인 u16
    expect(bin.byteLength).toBe(meta.plateCount * 16 + meta.plateCount * 2)
    expect(meta.chunks).toHaveLength(666)
    expect(meta.chunks.reduce((n, [, c]) => n + c, 0)).toBe(meta.plateCount)
  })

  it('청크 구간이 끊기지 않고 이어진다', () => {
    // 한 청크라도 시작점이 어긋나면 그 뒤 전부가 남의 판을 본다
    let at = 0
    for (const [start, count] of meta.chunks) {
      expect(start).toBe(at)
      at += count
    }
    expect(at).toBe(meta.plateCount)
  })

  it('평면 색인이 표 안을 가리킨다', () => {
    for (let i = 0; i < meta.plateCount; i++) {
      expect(refs[i]!, `판 ${i}`).toBeLessThan(meta.planes.length)
    }
  })

  it('법선이 단위벡터이고 수직면이 없다', () => {
    // `ny`가 0이면 수직면이라 그 위의 높이를 정의할 수 없다. 실측 |ny| 최소가
    // 0.5547이라 여유가 크다 — 0에 가까운 값이 나오면 법선을 잘못 읽은 것이다.
    //
    // ⚠️ `ny > 0`이 아니다. 321종 중 2종은 법선을 아래로 적어 두었고 상수 `d`의
    // 부호도 같이 뒤집혀 있어서, 같은 평면을 반대 방향으로 쓴 것뿐이다.
    // `-(…)/ny`는 어느 쪽이든 같은 높이를 낸다
    let flipped = 0
    for (const [nx, ny, nz] of meta.planes) {
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3)
      expect(Math.abs(ny)).toBeGreaterThan(0.1)
      if (ny < 0) flipped++
    }
    expect(flipped, '뒤집힌 법선 개수가 변했다').toBe(2)
  })

  it('판이 청크 원점 기준이다 — 중심 기준이 아니다', () => {
    // 원본 좌표는 **청크 중심** 기준이라 −16~+16으로 나온다(건물 배치와 같은 규약).
    // 추출기가 +16타일 옮겨 0~32로 만든다. 안 옮기면 지형이 통째로 16타일 밀리는데,
    // 화면에는 "지형이 좀 이상하다"로만 보여서 눈으로는 못 잡는다.
    //
    // 청크별 좌표 최소값이 0에, 최대값이 32에 몰려야 한다
    const lows = new Map<number, number>()
    const highs = new Map<number, number>()
    for (const [start, count] of meta.chunks) {
      if (!count) continue
      let lo = Infinity, hi = -Infinity
      for (let i = 0; i < count; i++) {
        const p = plate(start + i)
        lo = Math.min(lo, p.x1, p.z1, p.x2, p.z2)
        hi = Math.max(hi, p.x1, p.z1, p.x2, p.z2)
      }
      lows.set(lo, (lows.get(lo) ?? 0) + 1)
      highs.set(hi, (highs.get(hi) ?? 0) + 1)
    }
    expect(lows.get(0), '최소값이 0인 청크').toBeGreaterThan(400)
    expect(highs.get(32), '최대값이 32인 청크').toBeGreaterThan(400)
    // 중심 기준이면 여기가 몰려 있을 자리다
    expect(lows.get(-16) ?? 0).toBe(0)
    expect(highs.get(16) ?? 0).toBeLessThan(60)
  })

  it('원점을 옮길 때 기울어진 판의 상수도 같이 옮겼다', () => {
    // 좌표를 +16 밀면 평면식도 밀어야 한다: d′ = d − 16(nx + nz).
    // 평평한 판은 nx=nz=0이라 안 변하므로 이걸 빠뜨려도 8974개 중 7969개는
    // 멀쩡해 보인다 — 계단만 조용히 어긋난다.
    //
    // 판 안의 점에서 잰 높이가 그 판의 높이 범위 안에 있어야 한다. 상수를
    // 안 옮기면 기울어진 판의 높이가 자기 귀퉁이 범위 밖으로 크게 튄다
    let checked = 0
    for (let i = 0; i < meta.plateCount; i++) {
      const p = plate(i)
      if (p.plane[0] === 0 && p.plane[2] === 0) continue
      const corners = [heightAt(p, p.x1, p.z1), heightAt(p, p.x2, p.z2)]
      const mid = heightAt(p, (p.x1 + p.x2) / 2, (p.z1 + p.z2) / 2)
      expect(mid).toBeGreaterThanOrEqual(Math.min(...corners) - 1e-6)
      expect(mid).toBeLessThanOrEqual(Math.max(...corners) + 1e-6)
      // 기울어진 판도 신오 안에 있어야 한다. 상수를 안 옮기면 여기가 크게 벗어난다
      expect(Math.min(...corners)).toBeGreaterThan(-10)
      expect(Math.max(...corners)).toBeLessThan(40)
      checked++
    }
    expect(checked, '기울어진 판이 없다').toBeGreaterThan(500)
  })

  it('높이가 신오의 범위 안이다', () => {
    // 천관산 꼭대기가 30타일, 동굴 바닥이 −6타일이다. 이 밖으로 나가면
    // 척도를 잘못 잡은 것이다 — d를 유닛 그대로 두면 16배가 되어 여기서 걸린다
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < meta.plateCount; i++) {
      const p = plate(i)
      for (const [x, z] of [[p.x1, p.z1], [p.x2, p.z2]] as const) {
        const y = heightAt(p, x, z)
        expect(Number.isFinite(y), `판 ${i}의 높이가 유한하지 않다`).toBe(true)
        lo = Math.min(lo, y); hi = Math.max(hi, y)
      }
    }
    expect(lo).toBeGreaterThan(-8)
    expect(lo).toBeLessThan(-4)
    expect(hi).toBeGreaterThan(25)
    expect(hi).toBeLessThan(35)
  })

  it('평평한 판은 네 귀퉁이 높이가 같다', () => {
    // 법선이 (0,1,0)이면 기울기가 없다. 여기가 깨지면 평면식이 틀린 것이다
    let checked = 0
    for (let i = 0; i < meta.plateCount; i++) {
      const p = plate(i)
      if (p.plane[0] !== 0 || p.plane[2] !== 0) continue
      expect(heightAt(p, p.x1, p.z1)).toBeCloseTo(heightAt(p, p.x2, p.z2), 6)
      checked++
    }
    // 공허하지 않게 — 평평한 판이 대다수여야 한다
    expect(checked).toBeGreaterThan(meta.plateCount / 2)
  })

  it('기울어진 판은 실제로 높이가 변한다', () => {
    // 계단·경사가 있다는 것 자체가 확인 대상이다. 전부 평평하게 나오면
    // 법선을 안 읽고 있는 것이다
    const sloped = []
    for (let i = 0; i < meta.plateCount; i++) {
      const p = plate(i)
      if (p.plane[0] === 0 && p.plane[2] === 0) continue
      const drop = Math.abs(heightAt(p, p.x1, p.z1) - heightAt(p, p.x2, p.z2))
      if (drop > 0.01) sloped.push(drop)
    }
    expect(sloped.length, '기울어진 판이 하나도 없다').toBeGreaterThan(300)
    // 4세대 계단은 한 판에서 몇 타일씩 오른다. 수십 타일이 나오면 척도가 틀렸다
    expect(Math.max(...sloped)).toBeLessThan(20)
  })

  it('같은 자리를 덮는 판이 있다 — 다리 밑을 지나갈 수 있다', () => {
    // 이게 0이면 높이를 "타일당 하나"로 접어도 된다는 뜻이고, 그러면 216번도로
    // 다리가 사라진다. 실제로는 겹치는 청크가 있어야 한다
    let overlapping = 0
    for (const [start, count] of meta.chunks) {
      let found = false
      for (let i = 0; i < count && !found; i++) {
        const a = plate(start + i)
        for (let j = i + 1; j < count; j++) {
          const b = plate(start + j)
          const ax = [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)]
          const az = [Math.min(a.z1, a.z2), Math.max(a.z1, a.z2)]
          const bx = [Math.min(b.x1, b.x2), Math.max(b.x1, b.x2)]
          const bz = [Math.min(b.z1, b.z2), Math.max(b.z1, b.z2)]
          if (ax[0]! < bx[1]! && bx[0]! < ax[1]! && az[0]! < bz[1]! && bz[0]! < az[1]!) {
            found = true
            break
          }
        }
      }
      if (found) overlapping++
    }
    expect(overlapping).toBeGreaterThan(50)
  })
})
