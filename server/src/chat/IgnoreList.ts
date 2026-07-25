/** Canary caps a character's ignore list; ours matches the protocol bound. */
export const MAX_IGNORED_NAMES = 100;

/**
 * Per-character ignore lists, held for the server's lifetime so relogging
 * cannot clear one mid-session. Suppression happens on delivery: an ignored
 * speaker's line is simply never sent to the ignorer, and the speaker is told
 * nothing at all — they must not be able to detect the difference between
 * being ignored and being heard (charter rule 6).
 */
export class IgnoreList {
  private readonly byCharacter = new Map<string, Set<string>>();

  /** Reports whether the name was added (false when full or already there). */
  add(characterId: string, name: string): boolean {
    const normalized = name.trim().toLowerCase();
    if (normalized.length === 0) return false;
    const names = this.byCharacter.get(characterId) ?? new Set<string>();
    if (names.has(normalized)) return true;
    if (names.size >= MAX_IGNORED_NAMES) return false;
    names.add(normalized);
    this.byCharacter.set(characterId, names);
    return true;
  }

  remove(characterId: string, name: string): void {
    this.byCharacter.get(characterId)?.delete(name.trim().toLowerCase());
  }

  ignores(characterId: string, speakerName: string): boolean {
    return (
      this.byCharacter.get(characterId)?.has(speakerName.trim().toLowerCase()) ??
      false
    );
  }

  names(characterId: string): ReadonlyArray<string> {
    return [...(this.byCharacter.get(characterId) ?? [])].sort();
  }
}
