import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import { AssetStore, OutfitColors, TibiaObject } from "./assets";
import { BLOOD_SPLAT, buildCity, CityMap, MonsterSpawn, TILE } from "./map";

const ZOOM = 3;
const DIR_N = 0,
  DIR_E = 1,
  DIR_S = 2,
  DIR_W = 3;
const DIR_DX = [0, 1, 0, -1];
const DIR_DY = [-1, 0, 1, 0];

const EFFECT_BLOOD = 1;
const EFFECT_PUFF = 3;
const EFFECT_AREA_HIT = 10; // gray slash burst (exori)
const EFFECT_ENERGY = 12; // blue lightning strike (exevo gran mas vis)
const EFFECT_SPARKLES = 15; // green sparkles (utani hur)

const BASE_STEP_MS = 250;
const HASTE_STEP_MS = 150;

const PLAYER_COLORS_IDX = { head: 78, body: 69, legs: 58, feet: 76 };

const AGGRO_RANGE = 7;
const LEASH_RANGE = 4;

export interface SpellUiState {
  hotkey: string;
  name: string;
  words: string;
  icon: string; // data URL for the slot image
  manaCost: number;
  remainingMs: number; // cooldown left
  totalMs: number; // full cooldown
  activeMs: number; // for buffs: time left on the effect
}

export interface GameStats {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  kills: number;
  spells: SpellUiState[];
}

interface SpellDef {
  name: string;
  words: string;
  manaCost: number;
  cooldownMs: number;
  cd: number; // cooldown remaining
  icon: string;
  cast: () => void;
}

export interface GameCallbacks {
  onStats: (s: GameStats) => void;
  onReady: () => void;
}

interface FloatingText {
  text: Text;
  worldX: number;
  worldY: number;
  age: number;
}

interface EffectAnim {
  sprite: Sprite;
  frames: Texture[];
  age: number;
}

interface TimedItem {
  sprite: Sprite;
  expires: number;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function chebyshev(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

class Creature {
  name: string;
  outfit: TibiaObject;
  colors?: OutfitColors;
  container = new Container();
  sprite = new Sprite();
  plate = new Container();
  plateName: Text;
  plateBar = new Graphics();

  tileX: number;
  tileY: number;
  dir = DIR_S;
  moving = false;
  moveFromX = 0;
  moveFromY = 0;
  moveT = 0; // 0..1
  stepMs: number;
  walkDist = 0;

  hp: number;
  maxHp: number;
  dmgMin: number;
  dmgMax: number;
  attackMs: number;
  attackCd = 0;
  dead = false;

  // monster-only
  spawn?: MonsterSpawn;
  respawnIn = 0;
  wanderCd = 0;

  constructor(
    private store: AssetStore,
    name: string,
    outfit: TibiaObject,
    x: number,
    y: number,
    opts: {
      maxHp: number;
      dmgMin: number;
      dmgMax: number;
      stepMs: number;
      attackMs: number;
      colors?: OutfitColors;
      nameColor?: number;
    },
  ) {
    this.name = name;
    this.outfit = outfit;
    this.colors = opts.colors;
    this.tileX = x;
    this.tileY = y;
    this.maxHp = this.hp = opts.maxHp;
    this.dmgMin = opts.dmgMin;
    this.dmgMax = opts.dmgMax;
    this.stepMs = opts.stepMs;
    this.attackMs = opts.attackMs;

    // creature sprites draw anchored to the bottom-right tile, displaced up-left by 8px
    this.sprite.position.set(
      -(outfit.width - 1) * TILE - 8,
      -(outfit.height - 1) * TILE - 8,
    );
    this.container.addChild(this.sprite);

    this.plateName = new Text({
      text: name,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 11,
        fontWeight: "bold",
        fill: opts.nameColor ?? 0x44dd44,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.plateName.resolution = 2;
    this.plateName.anchor.set(0.5, 1);
    this.plate.addChild(this.plateName, this.plateBar);
    this.updateFrame();
    this.redrawBar();
  }

  private frameCache = new Map<string, Texture>();

  private texture(dir: number, phase: number): Texture {
    const key = `${dir}:${phase}`;
    let tex = this.frameCache.get(key);
    if (!tex) {
      tex = this.store.frameTexture(
        this.outfit,
        { x: dir, phase },
        this.colors,
      );
      this.frameCache.set(key, tex);
    }
    return tex;
  }

  updateFrame(): void {
    const walkPhases = this.outfit.phases - 1;
    let phase = 0;
    if (this.moving && walkPhases > 0) {
      phase = 1 + (Math.floor(this.walkDist / 8) % walkPhases);
    }
    this.sprite.texture = this.texture(this.dir, phase);
  }

  redrawBar(): void {
    const g = this.plateBar;
    g.clear();
    const w = 27,
      h = 4;
    const ratio = Math.max(0, this.hp / this.maxHp);
    const color = ratio > 0.5 ? 0x00c000 : ratio > 0.2 ? 0xc0c000 : 0xc00000;
    g.rect(-w / 2 - 1, 2, w + 2, h + 2).fill(0x000000);
    g.rect(-w / 2, 3, Math.max(1, Math.round(w * ratio)), h).fill(color);
    this.plateName.style.fill = color;
  }

  /** interpolated top-left pixel position of the creature's tile */
  visualPos(): { x: number; y: number } {
    if (!this.moving) return { x: this.tileX * TILE, y: this.tileY * TILE };
    const t = this.moveT;
    return {
      x: (this.moveFromX + (this.tileX - this.moveFromX) * t) * TILE,
      y: (this.moveFromY + (this.tileY - this.moveFromY) * t) * TILE,
    };
  }

  startStep(nx: number, ny: number): void {
    this.moveFromX = this.tileX;
    this.moveFromY = this.tileY;
    this.tileX = nx;
    this.tileY = ny;
    this.moveT = 0;
    this.moving = true;
  }

  tickMove(dtMs: number): void {
    if (!this.moving) return;
    this.moveT += dtMs / this.stepMs;
    this.walkDist += (dtMs / this.stepMs) * TILE;
    if (this.moveT >= 1) {
      this.moveT = 0;
      this.moving = false;
    }
    this.updateFrame();
  }
}

export class Game {
  private app = new Application();
  private store = new AssetStore();
  private map!: CityMap;
  private world = new Container();
  private groundLayer = new Container();
  private objectLayer = new Container();
  private overlay = new Container();

  private player!: Creature;
  private monsters: Creature[] = [];
  private target: Creature | null = null;
  private targetMarker = new Graphics();

  private keysDown: string[] = [];
  private floats: FloatingText[] = [];
  private effects: EffectAnim[] = [];
  private timedItems: TimedItem[] = [];
  private kills = 0;
  private regenAcc = 0;
  private mana = 200;
  private maxMana = 200;
  private spells: SpellDef[] = [];
  private hasteMsLeft = 0;
  private statsAcc = 0;
  private destroyed = false;
  private keydownHandler = (e: KeyboardEvent) => this.onKeyDown(e);
  private keyupHandler = (e: KeyboardEvent) => this.onKeyUp(e);

  constructor(
    private host: HTMLElement,
    private cb: GameCallbacks,
  ) {}

  async start(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      background: "#000000",
      antialias: false,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    this.host.appendChild(this.app.canvas);

    await this.store.load();
    this.map = buildCity();
    if (this.destroyed) return;

    // preload every atlas sheet the demo can touch
    const spriteIds: number[] = [];
    const seen = new Set<number>();
    const collect = (o: TibiaObject) => {
      if (seen.has(o.clientId * 4 + o.category.length)) return;
      spriteIds.push(...o.sprites);
    };
    for (const row of this.map.tiles) {
      for (const t of row) {
        collect(this.store.item(t.ground));
        for (const id of t.items) collect(this.store.item(id));
      }
    }
    for (const s of this.map.spawns) collect(this.store.outfit(s.outfit));
    collect(this.store.outfit(128));
    collect(this.store.effect(EFFECT_BLOOD));
    collect(this.store.effect(EFFECT_PUFF));
    collect(this.store.effect(EFFECT_AREA_HIT));
    collect(this.store.effect(EFFECT_ENERGY));
    collect(this.store.effect(EFFECT_SPARKLES));
    collect(this.store.item(BLOOD_SPLAT));
    await this.store.preload(spriteIds);
    if (this.destroyed) return;

    this.world.scale.set(ZOOM);
    this.objectLayer.sortableChildren = true;
    this.world.addChild(this.groundLayer, this.objectLayer);
    this.app.stage.addChild(this.world, this.overlay);

    this.buildMapSprites();

    // player
    const pal = this.store.outfitPalette;
    const colors: OutfitColors = {
      head: pal[PLAYER_COLORS_IDX.head],
      body: pal[PLAYER_COLORS_IDX.body],
      legs: pal[PLAYER_COLORS_IDX.legs],
      feet: pal[PLAYER_COLORS_IDX.feet],
    };
    this.player = new Creature(
      this.store,
      "Gandalf",
      this.store.outfit(128),
      this.map.playerStart.x,
      this.map.playerStart.y,
      {
        maxHp: 400,
        dmgMin: 15,
        dmgMax: 50,
        stepMs: 250,
        attackMs: 1000,
        colors,
        nameColor: 0x44dd44,
      },
    );
    this.addCreature(this.player);

    for (const s of this.map.spawns) {
      const m = new Creature(
        this.store,
        s.name,
        this.store.outfit(s.outfit),
        s.x,
        s.y,
        {
          maxHp: s.maxHp,
          dmgMin: s.dmgMin,
          dmgMax: s.dmgMax,
          stepMs: s.stepMs,
          attackMs: s.attackMs,
          nameColor: 0x44dd44,
        },
      );
      m.spawn = s;
      this.monsters.push(m);
      this.addCreature(m);
    }

    this.buildSpells();

    this.targetMarker
      .rect(0.5, 0.5, TILE - 1, TILE - 1)
      .stroke({ color: 0xff0000, width: 2 });
    this.targetMarker.visible = false;
    this.objectLayer.addChild(this.targetMarker);

    window.addEventListener("keydown", this.keydownHandler);
    window.addEventListener("keyup", this.keyupHandler);
    this.app.canvas.addEventListener("pointerdown", (e) =>
      this.onPointerDown(e),
    );
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
    this.pushStats();
    this.cb.onReady();
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener("keydown", this.keydownHandler);
    window.removeEventListener("keyup", this.keyupHandler);
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  // ---------------------------------------------------------------- rendering

  private buildMapSprites(): void {
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const t = this.map.tiles[y][x];
        this.drawItem(this.store.item(t.ground), x, y, true);
        for (const id of t.items)
          this.drawItem(this.store.item(id), x, y, false);
      }
    }
  }

  private drawItem(
    o: TibiaObject,
    tileX: number,
    tileY: number,
    isGround: boolean,
  ): Sprite[] {
    const made: Sprite[] = [];
    const prio = isGround ? 0 : o.flags.onTop ? 4 : o.flags.onBottom ? 1 : 2;
    // items with layers > 1 store alternate states, not overlays — draw layer 0 only
    {
      const l = 0;
      for (let h = 0; h < o.height; h++) {
        for (let w = 0; w < o.width; w++) {
          // grounds vary their look by map position; other items (walls etc.)
          // use pattern 0 — their extra patterns are alternate materials
          const sid = isGround
            ? this.store.spriteId(o, { w, h, l, x: tileX, y: tileY })
            : this.store.spriteId(o, { w, h, l });
          if (!sid) continue;
          const sp = new Sprite(this.store.spriteTexture(sid));
          sp.position.set((tileX - w) * TILE, (tileY - h) * TILE);
          if (isGround) {
            this.groundLayer.addChild(sp);
          } else {
            sp.zIndex = tileY * 16 + prio;
            this.objectLayer.addChild(sp);
          }
          made.push(sp);
        }
      }
    }
    return made;
  }

  private addCreature(c: Creature): void {
    this.objectLayer.addChild(c.container);
    this.overlay.addChild(c.plate);
  }

  private spawnEffect(effectId: number, tileX: number, tileY: number): void {
    const o = this.store.effect(effectId);
    const frames: Texture[] = [];
    for (let p = 0; p < o.phases; p++)
      frames.push(this.store.frameTexture(o, { phase: p }));
    const sp = new Sprite(frames[0]);
    sp.position.set(
      (tileX - (o.width - 1)) * TILE,
      (tileY - (o.height - 1)) * TILE,
    );
    sp.zIndex = tileY * 16 + 6;
    this.objectLayer.addChild(sp);
    this.effects.push({ sprite: sp, frames, age: 0 });
  }

  private spawnBlood(tileX: number, tileY: number): void {
    const o = this.store.item(BLOOD_SPLAT);
    const sid = this.store.spriteId(o, { x: tileX, y: tileY });
    if (!sid) return;
    const sp = new Sprite(this.store.spriteTexture(sid));
    sp.position.set(tileX * TILE, tileY * TILE);
    sp.zIndex = tileY * 16 + 2;
    this.objectLayer.addChild(sp);
    this.timedItems.push({ sprite: sp, expires: 45000 });
  }

  private spawnFloat(
    worldX: number,
    worldY: number,
    msg: string,
    color: number,
  ): void {
    const text = new Text({
      text: msg,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 12,
        fontWeight: "bold",
        fill: color,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    text.resolution = 2;
    text.anchor.set(0.5, 1);
    this.overlay.addChild(text);
    this.floats.push({ text, worldX, worldY, age: 0 });
  }

  // ---------------------------------------------------------------- spells

  private effectIcon(effectId: number): string {
    const o = this.store.effect(effectId);
    return this.store
      .bakeFrame(o, { phase: Math.floor(o.phases / 2) })
      .toDataURL();
  }

  private buildSpells(): void {
    this.spells = [
      {
        name: "Berserk",
        words: "exori",
        manaCost: 40,
        cooldownMs: 2000,
        cd: 0,
        icon: this.effectIcon(EFFECT_AREA_HIT),
        cast: () => this.castAreaSpell(EFFECT_AREA_HIT, 1, 40, 90),
      },
      {
        name: "Rage of the Skies",
        words: "exevo gran mas vis",
        manaCost: 120,
        cooldownMs: 8000,
        cd: 0,
        icon: this.effectIcon(EFFECT_ENERGY),
        cast: () => this.castAreaSpell(EFFECT_ENERGY, 3, 80, 180),
      },
      {
        name: "Haste",
        words: "utani hur",
        manaCost: 50,
        cooldownMs: 2000,
        cd: 0,
        icon: this.effectIcon(EFFECT_SPARKLES),
        cast: () => {
          this.hasteMsLeft = 20000;
          this.spawnEffect(
            EFFECT_SPARKLES,
            this.player.tileX,
            this.player.tileY,
          );
        },
      },
    ];
  }

  /** Hit every living monster within `radius` (chebyshev for r=1, circle otherwise). */
  private castAreaSpell(
    effectId: number,
    radius: number,
    dmgMin: number,
    dmgMax: number,
  ): void {
    const p = this.player;
    const inArea = (dx: number, dy: number) =>
      radius <= 1
        ? Math.max(Math.abs(dx), Math.abs(dy)) <= radius
        : dx * dx + dy * dy <= radius * radius + 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!inArea(dx, dy)) continue;
        const x = p.tileX + dx;
        const y = p.tileY + dy;
        if (this.isWalkable(x, y)) this.spawnEffect(effectId, x, y);
      }
    }
    for (const m of this.monsters) {
      if (m.dead) continue;
      if (!inArea(m.tileX - p.tileX, m.tileY - p.tileY)) continue;
      this.dealDamage(m, randInt(dmgMin, dmgMax));
    }
  }

  castSpell(index: number): void {
    const spell = this.spells[index];
    if (!spell || this.destroyed) return;
    const p = this.player;
    if (spell.cd > 0) return;
    if (this.mana < spell.manaCost) {
      const v = p.visualPos();
      this.spawnFloat(v.x + TILE / 2, v.y - 12, "Not enough mana", 0xbbbbff);
      return;
    }
    this.mana -= spell.manaCost;
    spell.cd = spell.cooldownMs;
    const v = p.visualPos();
    this.spawnFloat(v.x + TILE / 2, v.y - 24, spell.words, 0xffff00);
    spell.cast();
    this.pushStats();
  }

  // ---------------------------------------------------------------- game logic

  private isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height)
      return false;
    const t = this.map.tiles[y][x];
    if (this.store.item(t.ground).flags.notWalkable) return false;
    for (const id of t.items)
      if (this.store.item(id).flags.notWalkable) return false;
    return true;
  }

  private isOccupied(x: number, y: number, ignore?: Creature): boolean {
    const all = [this.player, ...this.monsters];
    return all.some(
      (c) => c !== ignore && !c.dead && c.tileX === x && c.tileY === y,
    );
  }

  private tryStep(c: Creature, dir: number): boolean {
    c.dir = dir;
    const nx = c.tileX + DIR_DX[dir];
    const ny = c.tileY + DIR_DY[dir];
    if (!this.isWalkable(nx, ny) || this.isOccupied(nx, ny, c)) {
      c.updateFrame();
      return false;
    }
    c.startStep(nx, ny);
    return true;
  }

  private faceToward(c: Creature, x: number, y: number): void {
    const dx = x - c.tileX;
    const dy = y - c.tileY;
    if (Math.abs(dx) >= Math.abs(dy)) c.dir = dx >= 0 ? DIR_E : DIR_W;
    else c.dir = dy >= 0 ? DIR_S : DIR_N;
    c.updateFrame();
  }

  private dealDamage(victim: Creature, dmg: number): void {
    victim.hp = Math.max(0, victim.hp - dmg);
    victim.redrawBar();
    const vp = victim.visualPos();
    this.spawnFloat(vp.x + TILE / 2, vp.y - 12, String(dmg), 0xff3333);
    if (victim === this.player) this.pushStats();
    if (victim.hp <= 0) this.die(victim);
  }

  private strike(attacker: Creature, victim: Creature): void {
    attacker.attackCd = attacker.attackMs;
    this.faceToward(attacker, victim.tileX, victim.tileY);
    this.spawnEffect(EFFECT_BLOOD, victim.tileX, victim.tileY);
    this.dealDamage(victim, randInt(attacker.dmgMin, attacker.dmgMax));
  }

  private die(c: Creature): void {
    this.spawnEffect(EFFECT_PUFF, c.tileX, c.tileY);
    this.spawnBlood(c.tileX, c.tileY);
    if (c === this.player) {
      this.spawnFloat(
        c.tileX * TILE + 16,
        c.tileY * TILE,
        "You died!",
        0xffffff,
      );
      c.tileX = this.map.playerStart.x;
      c.tileY = this.map.playerStart.y;
      c.moving = false;
      c.hp = c.maxHp;
      this.mana = this.maxMana;
      this.hasteMsLeft = 0;
      c.redrawBar();
      this.target = null;
      this.pushStats();
      return;
    }
    c.dead = true;
    c.moving = false;
    c.container.visible = false;
    c.plate.visible = false;
    c.respawnIn = 15000;
    if (this.target === c) this.target = null;
    this.kills++;
    this.pushStats();
  }

  private respawn(c: Creature): void {
    const s = c.spawn!;
    if (!this.isWalkable(s.x, s.y) || this.isOccupied(s.x, s.y, c)) {
      c.respawnIn = 3000;
      return;
    }
    c.tileX = s.x;
    c.tileY = s.y;
    c.hp = c.maxHp;
    c.dead = false;
    c.moving = false;
    c.container.visible = true;
    c.plate.visible = true;
    c.redrawBar();
    c.updateFrame();
  }

  private monsterAI(m: Creature, dtMs: number): void {
    if (m.dead) {
      m.respawnIn -= dtMs;
      if (m.respawnIn <= 0) this.respawn(m);
      return;
    }
    const p = this.player;
    const dist = chebyshev(m.tileX, m.tileY, p.tileX, p.tileY);

    if (dist <= 1) {
      if (m.attackCd <= 0) this.strike(m, p);
      return;
    }

    if (m.moving) return;

    if (dist <= AGGRO_RANGE) {
      // greedy chase: bigger axis first, other axis as fallback
      const dx = p.tileX - m.tileX;
      const dy = p.tileY - m.tileY;
      const dirs: number[] = [];
      const hDir = dx > 0 ? DIR_E : DIR_W;
      const vDir = dy > 0 ? DIR_S : DIR_N;
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx !== 0) dirs.push(hDir);
        if (dy !== 0) dirs.push(vDir);
      } else {
        if (dy !== 0) dirs.push(vDir);
        if (dx !== 0) dirs.push(hDir);
      }
      for (const d of dirs) if (this.tryStep(m, d)) return;
      return;
    }

    // idle wander near spawn
    m.wanderCd -= dtMs;
    if (m.wanderCd <= 0) {
      m.wanderCd = 1200 + Math.random() * 1800;
      const d = randInt(0, 3);
      const s = m.spawn!;
      const nx = m.tileX + DIR_DX[d];
      const ny = m.tileY + DIR_DY[d];
      if (chebyshev(nx, ny, s.x, s.y) <= LEASH_RANGE) this.tryStep(m, d);
    }
  }

  private tick(dtMs: number): void {
    const p = this.player;

    // input-driven walking
    if (!p.moving) {
      const dir = this.heldDirection();
      if (dir !== null) this.tryStep(p, dir);
      else if (p.walkDist !== 0) {
        p.walkDist = 0;
        p.updateFrame();
      }
    }

    p.tickMove(dtMs);
    p.attackCd -= dtMs;

    // auto-attack current target
    if (this.target && !this.target.dead) {
      if (
        chebyshev(p.tileX, p.tileY, this.target.tileX, this.target.tileY) <=
          1 &&
        p.attackCd <= 0 &&
        !p.moving
      ) {
        this.strike(p, this.target);
      }
    }

    for (const m of this.monsters) {
      m.attackCd -= dtMs;
      m.tickMove(dtMs);
      this.monsterAI(m, dtMs);
    }

    // spell cooldowns + haste
    for (const s of this.spells) s.cd = Math.max(0, s.cd - dtMs);
    this.hasteMsLeft = Math.max(0, this.hasteMsLeft - dtMs);
    p.stepMs = this.hasteMsLeft > 0 ? HASTE_STEP_MS : BASE_STEP_MS;

    // hp/mana regen
    this.regenAcc += dtMs;
    if (this.regenAcc >= 1000) {
      this.regenAcc -= 1000;
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 2);
        p.redrawBar();
      }
      this.mana = Math.min(this.maxMana, this.mana + 8);
    }

    // keep the HUD's cooldown/mana display moving
    this.statsAcc += dtMs;
    if (this.statsAcc >= 100) {
      this.statsAcc = 0;
      this.pushStats();
    }

    // position creatures + camera
    const all = [p, ...this.monsters];
    for (const c of all) {
      const v = c.visualPos();
      c.container.position.set(v.x, v.y);
      c.container.zIndex = (v.y / TILE) * 16 + 3;
    }

    const pv = p.visualPos();
    const cx = Math.round(this.app.screen.width / 2 - (pv.x + TILE / 2) * ZOOM);
    const cy = Math.round(
      this.app.screen.height / 2 - (pv.y + TILE / 2) * ZOOM,
    );
    this.world.position.set(cx, cy);

    // nameplates in screen space
    for (const c of all) {
      if (c.dead) continue;
      const v = c.visualPos();
      c.plate.position.set(
        cx + (v.x + TILE / 2 - 8) * ZOOM,
        cy + (v.y - 8 - (c.outfit.height - 1) * 0) * ZOOM - 26,
      );
    }

    // target marker
    if (this.target && !this.target.dead) {
      const tv = this.target.visualPos();
      this.targetMarker.visible = true;
      this.targetMarker.position.set(tv.x, tv.y);
      this.targetMarker.zIndex = (tv.y / TILE) * 16 + 0.5;
    } else {
      this.targetMarker.visible = false;
    }

    // effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dtMs;
      const frame = Math.floor(e.age / 90);
      if (frame >= e.frames.length) {
        e.sprite.destroy();
        this.effects.splice(i, 1);
      } else {
        e.sprite.texture = e.frames[frame];
      }
    }

    // floating text
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.age += dtMs;
      if (f.age > 900) {
        f.text.destroy();
        this.floats.splice(i, 1);
        continue;
      }
      const rise = (f.age / 900) * 28;
      f.text.alpha = 1 - Math.max(0, f.age - 500) / 400;
      f.text.position.set(cx + f.worldX * ZOOM, cy + (f.worldY - rise) * ZOOM);
    }

    // temp blood splats
    for (let i = this.timedItems.length - 1; i >= 0; i--) {
      const t = this.timedItems[i];
      t.expires -= dtMs;
      if (t.expires <= 0) {
        t.sprite.destroy();
        this.timedItems.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- input

  private static readonly KEY_DIRS: Record<string, number> = {
    ArrowUp: DIR_N,
    ArrowRight: DIR_E,
    ArrowDown: DIR_S,
    ArrowLeft: DIR_W,
    KeyW: DIR_N,
    KeyD: DIR_E,
    KeyS: DIR_S,
    KeyA: DIR_W,
  };

  private heldDirection(): number | null {
    for (let i = this.keysDown.length - 1; i >= 0; i--) {
      const d = Game.KEY_DIRS[this.keysDown[i]];
      if (d !== undefined) return d;
    }
    return null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (
      Game.KEY_DIRS[e.code] !== undefined ||
      e.code === "Tab" ||
      e.code === "Space"
    )
      e.preventDefault();
    if (e.repeat) return;
    if (e.code === "Tab" || e.code === "Space") {
      this.targetNearest();
      return;
    }
    if (/^(Digit|Numpad)[1-5]$/.test(e.code)) {
      this.castSpell(Number(e.code.slice(-1)) - 1);
      return;
    }
    if (Game.KEY_DIRS[e.code] !== undefined) {
      this.keysDown = this.keysDown.filter((k) => k !== e.code);
      this.keysDown.push(e.code);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keysDown = this.keysDown.filter((k) => k !== e.code);
  }

  private targetNearest(): void {
    let best: Creature | null = null;
    let bestDist = Infinity;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const d = chebyshev(
        this.player.tileX,
        this.player.tileY,
        m.tileX,
        m.tileY,
      );
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    this.target = best;
  }

  private onPointerDown(e: PointerEvent): void {
    const wx = (e.offsetX - this.world.position.x) / ZOOM;
    const wy = (e.offsetY - this.world.position.y) / ZOOM;
    // pick the monster whose visible body contains the click (search top-down)
    let picked: Creature | null = null;
    for (const m of this.monsters) {
      if (m.dead) continue;
      const v = m.visualPos();
      const x1 = v.x - (m.outfit.width - 1) * TILE - 8;
      const y1 = v.y - (m.outfit.height - 1) * TILE - 8;
      if (
        wx >= x1 &&
        wx <= v.x + TILE - 8 &&
        wy >= y1 &&
        wy <= v.y + TILE - 8
      ) {
        if (!picked || m.tileY > picked.tileY) picked = m;
      }
    }
    this.target = picked ?? this.target;
  }

  private pushStats(): void {
    this.cb.onStats({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      mana: this.mana,
      maxMana: this.maxMana,
      kills: this.kills,
      spells: this.spells.map((s, i) => ({
        hotkey: String(i + 1),
        name: s.name,
        words: s.words,
        icon: s.icon,
        manaCost: s.manaCost,
        remainingMs: s.cd,
        totalMs: s.cooldownMs,
        activeMs: s.words === "utani hur" ? this.hasteMsLeft : 0,
      })),
    });
  }
}
