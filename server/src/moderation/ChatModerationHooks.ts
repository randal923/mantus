/**
 * The moderation surface every chat path consults at execution time
 * (say/whisper/yell, private, party, and guild chat). `muteRemainingMs`
 * covers GM mutes and spam auto-mutes; `noteAutoMute` lets a chat path
 * report a flood-control mute so it applies across all chat kinds.
 */
export interface ChatModerationHooks {
  muteRemainingMs(characterId: string, now: number): number;
  noteAutoMute(characterId: string, mutedUntil: number): void;
}
