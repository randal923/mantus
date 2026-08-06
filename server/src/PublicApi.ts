import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CYCLOPEDIA_LIMITS,
  GUILD_LIMITS,
  HIGHSCORE_LIMITS,
  PUBLIC_WEBSITE_LIMITS,
  publicCharacterProfileDataSchema,
  publicGuildProfileDataSchema,
  publicGuildsDataSchema,
  publicHighscoresDataSchema,
  publicHighscoresQuerySchema,
  publicLandingDataSchema,
  publicOnlineDataSchema,
  publicServerInfoDataSchema,
  type BoostedEntry,
  type PublicCharacterProfileData,
  type PublicGuildProfileData,
  type PublicGuildsData,
  type PublicHighscoresData,
  type PublicLandingData,
  type PublicOnlineData,
  type PublicOnlinePlayer,
  type PublicServerInfoData,
} from "@tibia/protocol";
import { normalizeCharacterName } from "./character/normalizeCharacterName";
import type { CyclopediaStore } from "./cyclopedia/CyclopediaStore";
import type { GuildStore } from "./guild/GuildStore";
import { normalizeGuildName } from "./guild/normalizeGuildName";
import {
  ACHIEVEMENTS,
  BADGE_NAMES,
  TITLE_NAMES,
} from "./profile/achievementCatalog";
import type { ProfileStore } from "./profile/ProfileStore";
import type { HighscoreStore } from "./social/HighscoreStore";

type PublicApiData =
  | PublicLandingData
  | PublicHighscoresData
  | PublicOnlineData
  | PublicCharacterProfileData
  | PublicServerInfoData
  | PublicGuildsData
  | PublicGuildProfileData
  | null;

interface CachedResponse {
  readonly expiresAt: number;
  readonly data: PublicApiData;
}

interface PublicApiOptions {
  readonly worldName: string;
  readonly onlinePlayers: () => ReadonlyArray<PublicOnlinePlayer>;
  readonly isOnline: (characterId: string) => boolean;
  readonly residenceFor: (townId: number) => string | undefined;
  readonly boosted: () => {
    readonly creature: BoostedEntry | null;
    readonly boss: BoostedEntry | null;
  };
  readonly highscores?: HighscoreStore;
  readonly profiles?: ProfileStore;
  readonly cyclopedia?: CyclopediaStore;
  readonly guilds?: GuildStore;
  readonly serverInfo: Omit<
    PublicServerInfoData,
    "worldName" | "status" | "playersOnline" | "generatedAt"
  >;
}

export class PublicApi {
  private readonly cache = new Map<string, CachedResponse>();
  private readonly pending = new Map<string, Promise<PublicApiData>>();

  constructor(private readonly options: PublicApiOptions) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    this.setCommonHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET, OPTIONS");
      this.sendJson(response, 405, { error: "method-not-allowed" });
      return;
    }
    if (
      (request.headers["content-length"] !== undefined &&
        request.headers["content-length"] !== "0") ||
      request.headers["transfer-encoding"] !== undefined
    ) {
      request.resume();
      this.sendJson(response, 400, { error: "request-body-not-allowed" });
      return;
    }
    if (request.url === undefined || request.url.length > 512) {
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }

    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname === "/api/public/landing" && url.search === "") {
        this.sendJson(response, 200, await this.loadLanding());
        return;
      }
      if (url.pathname === "/api/public/highscores") {
        await this.handleHighscores(url, response);
        return;
      }
      if (url.pathname === "/api/public/online" && url.search === "") {
        this.sendJson(response, 200, await this.loadOnline());
        return;
      }
      if (
        url.pathname.startsWith("/api/public/characters/") &&
        url.search === ""
      ) {
        await this.handleCharacter(url.pathname, response);
        return;
      }
      if (url.pathname === "/api/public/server-info" && url.search === "") {
        this.sendJson(response, 200, await this.loadServerInfo());
        return;
      }
      if (url.pathname === "/api/public/guilds" && url.search === "") {
        await this.handleGuildDirectory(response);
        return;
      }
      if (
        url.pathname.startsWith("/api/public/guilds/") &&
        url.search === ""
      ) {
        await this.handleGuild(url.pathname, response);
        return;
      }
      this.sendJson(response, 404, { error: "not-found" });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`public API load failed (${url.pathname}): ${reason}`);
      this.sendJson(response, 503, { error: "temporarily-unavailable" });
    }
  }

  private async handleHighscores(
    url: URL,
    response: ServerResponse,
  ): Promise<void> {
    const allowedKeys = new Set(["category", "vocation", "page"]);
    const keys = [...url.searchParams.keys()];
    if (
      keys.some(
        (key) =>
          !allowedKeys.has(key) || url.searchParams.getAll(key).length !== 1,
      )
    ) {
      this.sendJson(response, 400, { error: "invalid-request" });
      return;
    }
    const parsed = publicHighscoresQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      this.sendJson(response, 400, { error: "invalid-request" });
      return;
    }
    const store = this.options.highscores;
    if (!store) {
      this.sendJson(response, 503, { error: "temporarily-unavailable" });
      return;
    }
    const { category, page } = parsed.data;
    const vocation = parsed.data.vocation ?? null;
    const key = `highscores:${category}:${vocation ?? "all"}:${page}`;
    const data = await this.loadCached(
      key,
      PUBLIC_WEBSITE_LIMITS.databaseCacheTtlMs,
      async () => {
        const record = await store.loadPage({ category, vocation, page });
        return publicHighscoresDataSchema.parse({
          category,
          vocation,
          page,
          totalPages: Math.min(
            HIGHSCORE_LIMITS.maxPage + 1,
            Math.max(
              1,
              Math.ceil(record.totalEntries / HIGHSCORE_LIMITS.pageSize),
            ),
          ),
          entries: record.rows.map((row, index) => ({
            rank: page * HIGHSCORE_LIMITS.pageSize + index + 1,
            name: row.name,
            level: row.level,
            vocation: row.vocation,
            value: row.value,
          })),
          generatedAt: new Date().toISOString(),
        });
      },
    );
    this.sendJson(response, 200, data);
  }

  private async handleCharacter(
    pathname: string,
    response: ServerResponse,
  ): Promise<void> {
    const encodedName = pathname.slice("/api/public/characters/".length);
    if (!encodedName || encodedName.includes("/")) {
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }
    let decodedName: string;
    try {
      decodedName = decodeURIComponent(encodedName);
    } catch {
      this.sendJson(response, 400, { error: "invalid-request" });
      return;
    }
    const name = normalizeCharacterName(decodedName);
    if (!name) {
      this.sendJson(response, 400, { error: "invalid-request" });
      return;
    }
    const store = this.options.profiles;
    if (!store) {
      this.sendJson(response, 503, { error: "temporarily-unavailable" });
      return;
    }
    const data = await this.loadCached(
      `character:${name.normalizedName}`,
      PUBLIC_WEBSITE_LIMITS.databaseCacheTtlMs,
      async () => {
        const record = await store.loadPublicProfile(name.normalizedName);
        if (!record) return null;
        const deaths = this.options.cyclopedia
          ? await this.options.cyclopedia.deathsPage(
              record.characterId,
              0,
              CYCLOPEDIA_LIMITS.pageSize,
              CYCLOPEDIA_LIMITS.deathsWindowDays,
            )
          : { entries: [] };
        const achievements = record.achievements
          .map((achievementId) => ACHIEVEMENTS.get(achievementId))
          .filter((entry) => entry !== undefined)
          .sort(
            (a, b) =>
              b.grade - a.grade ||
              b.points - a.points ||
              a.name.localeCompare(b.name),
          );
        const badges = record.badges
          .map((badgeId) => {
            const badgeName = BADGE_NAMES.get(badgeId);
            return badgeName ? { badgeId, name: badgeName } : null;
          })
          .filter((entry) => entry !== null)
          .slice(0, PUBLIC_WEBSITE_LIMITS.profileBadges);
        return publicCharacterProfileDataSchema.parse({
          name: record.name,
          level: record.level,
          vocation: record.vocation,
          sex: record.sex,
          outfit: record.outfit,
          worldName: this.options.worldName,
          residence:
            this.options.residenceFor(record.townId) ?? "Unknown residence",
          guildName: record.guildName,
          title: record.selectedTitle
            ? (TITLE_NAMES.get(record.selectedTitle) ?? null)
            : null,
          achievementPoints: achievements.reduce(
            (total, entry) => total + entry.points,
            0,
          ),
          achievements: achievements
            .slice(0, PUBLIC_WEBSITE_LIMITS.profileAchievements)
            .map((entry) => ({
              achievementId: entry.achievementId,
              name: entry.name,
              description: entry.description,
              grade: entry.grade,
              points: entry.points,
              secret: entry.secret ?? false,
              granted: true,
            })),
          badges,
          createdAt: record.createdAt.toISOString(),
          lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
          deathHistory: deaths.entries.map((entry) => ({
            occurredAt: new Date(entry.at).toISOString(),
            level: entry.level,
            cause: entry.cause,
          })),
          online: this.options.isOnline(record.characterId),
          generatedAt: new Date().toISOString(),
        });
      },
    );
    if (!data) {
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }
    this.sendJson(response, 200, data);
  }

  private async handleGuildDirectory(
    response: ServerResponse,
  ): Promise<void> {
    const store = this.options.guilds;
    if (!store) {
      this.sendJson(response, 503, { error: "temporarily-unavailable" });
      return;
    }
    const data = await this.loadCached(
      "guilds",
      PUBLIC_WEBSITE_LIMITS.databaseCacheTtlMs,
      async () => {
        const entries = await store.loadDirectory();
        return publicGuildsDataSchema.parse({
          guilds: entries
            .slice(0, PUBLIC_WEBSITE_LIMITS.guildDirectoryEntries)
            .map((entry) => ({
              name: entry.name,
              motd: entry.motd,
              level: entry.level,
              memberCount: entry.memberCount,
              createdAt: entry.createdAt.toISOString(),
            })),
          generatedAt: new Date().toISOString(),
        });
      },
    );
    this.sendJson(response, 200, data);
  }

  private async handleGuild(
    pathname: string,
    response: ServerResponse,
  ): Promise<void> {
    const encodedName = pathname.slice("/api/public/guilds/".length);
    if (!encodedName || encodedName.includes("/")) {
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }
    let decodedName: string;
    try {
      decodedName = decodeURIComponent(encodedName);
    } catch {
      this.sendJson(response, 400, { error: "invalid-request" });
      return;
    }
    const name = normalizeGuildName(decodedName);
    if (!name || name.length > GUILD_LIMITS.maxNameLength) {
      this.sendJson(response, 400, { error: "invalid-request" });
      return;
    }
    const store = this.options.guilds;
    if (!store) {
      this.sendJson(response, 503, { error: "temporarily-unavailable" });
      return;
    }
    const data = await this.loadCached(
      `guild:${name}`,
      PUBLIC_WEBSITE_LIMITS.databaseCacheTtlMs,
      async () => {
        const record = await store.loadPublicGuild(name);
        if (!record) return null;
        const members = record.members
          .slice(0, GUILD_LIMITS.maxMembers)
          .map((member) => ({
            name: member.name,
            nick: member.nick,
            rankName: member.rankName,
            rankLevel: member.rankLevel,
            vocation: member.vocation,
            level: member.level,
            joinedAt: member.joinedAt.toISOString(),
            online: this.options.isOnline(member.characterId),
          }));
        return publicGuildProfileDataSchema.parse({
          name: record.name,
          motd: record.motd,
          level: record.level,
          createdAt: record.createdAt.toISOString(),
          membersOnline: members.filter((member) => member.online).length,
          members,
          generatedAt: new Date().toISOString(),
        });
      },
    );
    if (!data) {
      this.sendJson(response, 404, { error: "not-found" });
      return;
    }
    this.sendJson(response, 200, data);
  }

  private async loadLanding(): Promise<PublicLandingData> {
    return this.loadCached(
      "landing",
      PUBLIC_WEBSITE_LIMITS.landingCacheTtlMs,
      async () => {
        const page = this.options.highscores
          ? await this.options.highscores.loadPage({
              category: "experience",
              vocation: null,
              page: 0,
            })
          : { rows: [] };
        return publicLandingDataSchema.parse({
          status: "online",
          worldName: this.options.worldName,
          playersOnline: this.options.onlinePlayers().length,
          generatedAt: new Date().toISOString(),
          boosted: this.options.boosted(),
          highscores: page.rows
            .slice(0, PUBLIC_WEBSITE_LIMITS.landingHighscoreEntries)
            .map((row, index) => ({
              rank: index + 1,
              name: row.name,
              level: row.level,
              vocation: row.vocation,
              value: row.value,
            })),
        });
      },
    );
  }

  private async loadOnline(): Promise<PublicOnlineData> {
    return this.loadCached(
      "online",
      PUBLIC_WEBSITE_LIMITS.liveCacheTtlMs,
      async () => {
        const players = [...this.options.onlinePlayers()]
          .sort(
            (a, b) =>
              b.level - a.level ||
              a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
          )
          .slice(0, PUBLIC_WEBSITE_LIMITS.onlinePlayers);
        return publicOnlineDataSchema.parse({
          playersOnline: players.length,
          players,
          generatedAt: new Date().toISOString(),
        });
      },
    );
  }

  private async loadServerInfo(): Promise<PublicServerInfoData> {
    return this.loadCached(
      "server-info",
      PUBLIC_WEBSITE_LIMITS.liveCacheTtlMs,
      async () =>
        publicServerInfoDataSchema.parse({
          ...this.options.serverInfo,
          worldName: this.options.worldName,
          status: "online",
          playersOnline: this.options.onlinePlayers().length,
          generatedAt: new Date().toISOString(),
        }),
    );
  }

  private async loadCached<TData extends PublicApiData>(
    key: string,
    ttlMs: number,
    load: () => Promise<TData>,
  ): Promise<TData> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as TData;
    }
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<TData>;
    if (this.pending.size >= PUBLIC_WEBSITE_LIMITS.cacheEntries) {
      throw new Error("public API request capacity reached");
    }

    const pending = load();
    this.pending.set(key, pending);
    try {
      const data = await pending;
      if (this.cache.size >= PUBLIC_WEBSITE_LIMITS.cacheEntries) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) this.cache.delete(oldestKey);
      }
      this.cache.set(key, { expiresAt: Date.now() + ttlMs, data });
      return data;
    } finally {
      this.pending.delete(key);
    }
  }

  private setCommonHeaders(response: ServerResponse): void {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader(
      "Cache-Control",
      "public, max-age=5, stale-while-revalidate=15",
    );
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("X-Content-Type-Options", "nosniff");
  }

  private sendJson(
    response: ServerResponse,
    status: number,
    body: Exclude<PublicApiData, null> | { readonly error: string },
  ): void {
    if (response.writableEnded) return;
    response.writeHead(status);
    response.end(JSON.stringify(body));
  }
}
