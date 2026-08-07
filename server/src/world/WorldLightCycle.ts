const CHECK_INTERVAL_MS = 10_000;
const GAME_DAY_MINUTES = 1_440;
const REAL_SECONDS_PER_GAME_DAY = 3_600;
const MINUTES_PER_CHECK =
  (GAME_DAY_MINUTES * (CHECK_INTERVAL_MS / 1_000)) / REAL_SECONDS_PER_GAME_DAY;
const SUNRISE_MINUTE = 360;
const SUNSET_MINUTE = 1_050;
const DAY_LEVEL = 250;
const NIGHT_LEVEL = 40;
/** Sunrise/sunset ramp the full range over 30 checks (~5 real minutes). */
const RAMP_STEP = (DAY_LEVEL - NIGHT_LEVEL) / 30;
/** 8-bit palette white; Tibia's world light never carries another color. */
const LIGHT_COLOR = 215;

type Phase = "day" | "sunrise" | "night" | "sunset";

export interface WorldLight {
  level: number;
  color: number;
}

/**
 * Canary's day/night cycle: one game day per real hour, checked every 10s.
 * Sunrise (06:00) and sunset (17:30) ramp the ambient level between 250 and
 * 40 in steps of 7. Purely presentational — no gameplay rule reads it — so
 * it lives outside the DB and restarts at midday.
 */
export class WorldLightCycle {
  private minute = SUNRISE_MINUTE + (SUNSET_MINUTE - SUNRISE_MINUTE) / 2;
  private level = DAY_LEVEL;
  private phase: Phase = "day";
  private nextCheckAt: number | null = null;
  private forced = false;

  current(): WorldLight {
    return { level: this.level, color: LIGHT_COLOR };
  }

  /** Dev override; the next tick reports it so the server broadcasts it. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(255, Math.round(level)));
    this.phase = this.level > NIGHT_LEVEL ? "day" : "night";
    this.forced = true;
  }

  /** Advances the cycle; returns the light only when it should broadcast. */
  tick(now: number): WorldLight | null {
    let changed = this.forced;
    this.forced = false;
    if (this.nextCheckAt === null) {
      this.nextCheckAt = now + CHECK_INTERVAL_MS;
      return changed ? this.current() : null;
    }
    while (now >= this.nextCheckAt) {
      this.nextCheckAt += CHECK_INTERVAL_MS;
      changed = this.advance() || changed;
    }
    return changed ? this.current() : null;
  }

  private advance(): boolean {
    this.minute = (this.minute + MINUTES_PER_CHECK) % GAME_DAY_MINUTES;
    if (Math.abs(this.minute - SUNRISE_MINUTE) < 2 * MINUTES_PER_CHECK) {
      this.phase = "sunrise";
    } else if (Math.abs(this.minute - SUNSET_MINUTE) < 2 * MINUTES_PER_CHECK) {
      this.phase = "sunset";
    }
    const previous = this.level;
    if (this.phase === "sunrise") {
      this.level = Math.min(DAY_LEVEL, this.level + RAMP_STEP);
      if (this.level === DAY_LEVEL) this.phase = "day";
    } else if (this.phase === "sunset") {
      this.level = Math.max(NIGHT_LEVEL, this.level - RAMP_STEP);
      if (this.level === NIGHT_LEVEL) this.phase = "night";
    }
    return this.level !== previous;
  }
}
