/** FNV-1a gives each stable map instance a repeatable animation offset. */
export function getItemInstanceSeed(instanceId: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < instanceId.length; index++) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
