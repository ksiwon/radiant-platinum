export interface PromptNpc {
  x: number
  z: number
  visible: boolean
}

/** Finds the visible scripted NPC occupying the field engine's rounded talk tile. */
export function promptNpcAt<T extends PromptNpc>(
  npcs: readonly T[],
  x: number,
  z: number,
  noScript: number,
  scriptOf: (npc: T) => number = (npc) => (npc as T & { script: number }).script,
): T | null {
  for (const npc of npcs) {
    if (!npc.visible || scriptOf(npc) === noScript) continue
    if (Math.round(npc.x) === x && Math.round(npc.z) === z) return npc
  }
  return null
}
