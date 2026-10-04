// 연출 계산이 같이 쓰는 3차원 벡터 — 시퀀스 접기 · 카메라 거르기 · 무대 충돌. 배열 하나가 한 점이다 (three를 안 쓴다 — 엔진 쪽 순수 계산)
export type V3 = [number, number, number]

export const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!]
export const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]
export const scale = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k]
export const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
export const cross = (a: readonly number[], b: readonly number[]): V3 =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
export const len = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!)
export const norm = (a: readonly number[]): V3 => scale(a, 1 / (len(a) || 1))
export const lerp3 = (a: readonly number[], b: readonly number[], t: number): V3 =>
  [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
export const dist3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
