// zustand persist용 IndexedDB 스토리지 (PLAN §3.2 ①)
//
// ⚠️ createJSONStorage를 쓰지 않는다. persist의 기본 JSON 직렬화는 도감 비트필드(Uint8Array)와
// Map을 파괴한다. PersistStorage를 직접 구현해 값을 idb-keyval에 **그대로** 넘기면
// IndexedDB의 structured clone이 TypedArray를 원형 그대로 보존한다.
import { get, set, del, createStore } from 'idb-keyval'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

const dbStore = createStore('pt-3d', 'save')

export function idbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => (await get<StorageValue<S>>(name, dbStore)) ?? null,
    // 직렬화 없음 — 객체를 그대로 넘긴다
    setItem: (name, value) => set(name, value, dbStore),
    removeItem: (name) => del(name, dbStore),
  }
}
