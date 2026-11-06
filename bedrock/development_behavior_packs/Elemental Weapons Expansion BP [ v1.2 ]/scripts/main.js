/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         ELEMENTAL KATANAS V2 - main.js                       ║
 * ║   Nature · Earth · Lightning · Holy · Ice · Fire · Electric  ║
 * ║         VISUAL OVERHAUL + POWER UPGRADE EDITION              ║
 * ║         Made for MCPE @minecraft/server 1.13                 ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import {
  world,
  system,
  EntityDamageCause,
} from "@minecraft/server";

// ──────────────────────────────────────────────
//  CONFIG
// ──────────────────────────────────────────────
const COOLDOWNS = {
  wooden_katana:    120, // 6s  – Nature
  stone_katana:     140, // 7s  – Earth
  iron_katana:      100, // 5s  – Lightning
  golden_katana:    130, // 6.5s– Holy
  diamond_katana:   120, // 6s  – Ice
  netherite_katana: 160, // 8s  – Fire
  copper_katana:    100, // 5s  – Electric
  emerald_katana:   150, // 7.5s– Verdant Force
  eclipse_katana:   240, // 12s – Eclipse Ritual
};

const AoE_RADIUS      = 6.0;   // Bigger AoE
const BURST_RADIUS    = 3.0;   // Close-range burst
const MAX_RING_POINTS = 16;    // Points on a ring for ring particle effects

// ──────────────────────────────────────────────
//  Cooldown tracking
// ──────────────────────────────────────────────
const cooldownMap = new Map();

function isOnCooldown(player, itemId) {
  const key = `${player.name}_${itemId}`;
  const ready = cooldownMap.get(key) ?? 0;
  return system.currentTick < ready;
}

function setCooldown(player, itemId) {
  const key = `${player.name}_${itemId}`;
  cooldownMap.set(key, system.currentTick + (COOLDOWNS[itemId] ?? 100));
}

function cooldownRemaining(player, itemId) {
  const key = `${player.name}_${itemId}`;
  return Math.ceil(((cooldownMap.get(key) ?? 0) - system.currentTick) / 20);
}

// ──────────────────────────────────────────────
//  Core Helpers
// ──────────────────────────────────────────────

function applyEffect(entity, effectName, duration, amplifier) {
  try { entity.addEffect(effectName, duration, { amplifier, showParticles: true }); } catch (_) {}
}

function spawnParticle(dimension, particleId, location) {
  try { dimension.spawnParticle(particleId, location); } catch (_) {}
}

function spawnParticleAt(dimension, particleId, x, y, z) {
  try { dimension.spawnParticle(particleId, { x, y, z }); } catch (_) {}
}

function getNearbyMobs(dimension, location, radius) {
  try {
    return dimension.getEntities({
      location, maxDistance: radius,
      excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb"]
    });
  } catch (_) { return []; }
}

function getNearbyPlayers(dimension, location, radius) {
  try { return dimension.getPlayers({ location, maxDistance: radius }); } catch (_) { return []; }
}

function dealExtraDamage(entity, amount) {
  try { entity.applyDamage(amount, { cause: EntityDamageCause.entityAttack }); } catch (_) {}
}

function setOnFire(entity, ticks) {
  try { entity.setOnFire(ticks, true); } catch (_) {}
}

function knockbackFrom(entity, source, strength, verticalStrength = 0.45) {
  try {
    const dx = entity.location.x - source.x;
    const dz = entity.location.z - source.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    entity.applyKnockback((dx / len) * strength, (dz / len) * strength, verticalStrength, 0.5);
  } catch (_) {}
}

function msg(player, text) {
  try { player.onScreenDisplay.setActionBar(text); } catch (_) {}
}

// ──────────────────────────────────────────────
//  VISUAL HELPERS — stunning multi-burst particle patterns
// ──────────────────────────────────────────────

/**
 * Spawn a ring of particles at a given Y height around a center point.
 */
function spawnRing(dim, particleId, center, radius, yOffset, points) {
  const n = points ?? MAX_RING_POINTS;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    spawnParticleAt(dim, particleId,
      center.x + Math.cos(angle) * radius,
      center.y + yOffset,
      center.z + Math.sin(angle) * radius
    );
  }
}

/**
 * Spawn a vertical pillar of particles above a point.
 */
function spawnPillar(dim, particleId, center, height, steps) {
  for (let i = 0; i <= steps; i++) {
    spawnParticleAt(dim, particleId, center.x, center.y + (i / steps) * height, center.z);
  }
}

/**
 * Spawn particles at multiple offsets in a staggered wave (using system.runTimeout for delay).
 * Spawns rings expanding outward over time for a shockwave feel.
 */
function spawnShockwave(dim, particleId, center, maxRadius, waves) {
  for (let w = 0; w < waves; w++) {
    const wave = w;
    system.runTimeout(() => {
      const r = (wave + 1) * (maxRadius / waves);
      spawnRing(dim, particleId, center, r, 0.1, 12);
      spawnRing(dim, particleId, center, r * 0.6, 0.4, 8);
    }, wave * 3);
  }
}

/**
 * Delayed additional visual burst for after-effects.
 */
function delayedBurst(dim, particleId, center, delayTicks, count) {
  system.runTimeout(() => {
    for (let i = 0; i < count; i++) {
      const rx = (Math.random() - 0.5) * 2;
      const ry = Math.random() * 1.5;
      const rz = (Math.random() - 0.5) * 2;
      spawnParticleAt(dim, particleId, center.x + rx, center.y + ry, center.z + rz);
    }
  }, delayTicks);
}

// ──────────────────────────────────────────────
//  UNDEAD check for Holy
// ──────────────────────────────────────────────
const UNDEAD_TYPES = new Set([
  "minecraft:zombie", "minecraft:skeleton", "minecraft:wither_skeleton",
  "minecraft:zombie_pigman", "minecraft:zombified_piglin", "minecraft:drowned",
  "minecraft:husk", "minecraft:phantom", "minecraft:wither", "minecraft:zoglin",
  "minecraft:zombie_horse", "minecraft:skeleton_horse", "minecraft:stray",
  "minecraft:bogged"
]);
function isUndead(entity) { return UNDEAD_TYPES.has(entity.typeId); }

// ──────────────────────────────────────────────
//  ITEM/XP Pull (Electric)
// ──────────────────────────────────────────────
function pullNearbyItemsAndXP(player) {
  const dim = player.dimension;
  const loc = player.location;
  for (const type of ["minecraft:item", "minecraft:xp_orb"]) {
    const ents = dim.getEntities({ location: loc, maxDistance: 8, type });
    for (const e of ents) {
      try {
        const dx = loc.x - e.location.x;
        const dz = loc.z - e.location.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        e.applyKnockback(-(dx / len) * 2.0, -(dz / len) * 2.0, 0.6, 0.4);
      } catch (_) {}
    }
  }
}

// ══════════════════════════════════════════════
//  ELEMENTAL POWERS — VISUAL OVERHAUL V2
// ══════════════════════════════════════════════

/**
 * 🌿 NATURE KATANA (Wooden) — Life · Overgrowth
 *
 *  Powers:
 *   • Entangle: Target gets Slowness IV + Blindness (roots them in place)
 *   • Overgrowth Aura: Player gets Regeneration III + Absorption
 *   • Thorn Burst: Nearby mobs take Poison
 *
 *  Visuals:
 *   • Giant spiraling green leaf column pillar on target
 *   • Expanding ring of nature particles at ground level
 *   • Delayed second burst of floating spores
 *   • Vanilla: villager_happy + crit particles
 */
function triggerNatureKatana(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  applyEffect(target, "slowness",  100, 3);  // Slowness IV – 5s
  applyEffect(target, "blindness",  60, 0);  // Blindness 3s
  applyEffect(target, "poison",     80, 1);  // Poison II 4s
  dealExtraDamage(target, 4);

  // AoE Poison on nearby mobs
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    applyEffect(mob, "poison",    60, 1);
    applyEffect(mob, "slowness",  40, 1);
  }

  // Buff player
  applyEffect(player, "regeneration", 100, 2); // Regen III 5s
  applyEffect(player, "absorption",   200, 1); // Absorption II 10s

  // ─── VISUALS ───
  // Central burst
  spawnParticle(dim, "bca:nature_strike", loc);
  // Towering spiral pillar (8 blocks high)
  spawnPillar(dim, "bca:nature_strike", loc, 8, 12);
  // Ground ring at feet
  spawnRing(dim, "bca:nature_strike", loc, 2.5, 0.05, 20);
  spawnRing(dim, "bca:nature_strike", loc, 1.2, 0.05, 12);
  // Outer slow-expanding ring
  spawnShockwave(dim, "bca:nature_strike", loc, 5, 3);

  // Vanilla accents
  try { dim.spawnParticle("minecraft:villager_happy", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  // Delayed spore drift
  delayedBurst(dim, "bca:nature_strike", loc, 8, 8);
  delayedBurst(dim, "bca:nature_strike", loc, 16, 6);

  msg(player, "§2🌿 §lNature Katana§r §a— Overgrowth Surge!");
}

// ─────────────────────────────────────────────

/**
 * 🪨 EARTH KATANA (Stone) — Tectonic · Crush
 *
 *  Powers:
 *   • Tectonic Slam: Violent AoE knockback + Slowness
 *   • Seismic Wave: 3-wave staggered knockback ripple
 *   • Fortify: Player gets Resistance III + Strength
 *
 *  Visuals:
 *   • Expanding ground shockwave rings (dust/earth)
 *   • Pillar of earth debris shooting up
 *   • 3 delayed secondary ring waves
 *   • Vanilla: block_break particle cloud
 */
function triggerEarthKatana(player, target) {
  const loc = target ? target.location : player.location;
  const dim = player.dimension;

  // ─── POWERS ───
  applyEffect(player, "resistance", 80, 2);  // Resistance III 4s
  applyEffect(player, "strength",   80, 1);  // Strength II 4s

  const nearby = getNearbyMobs(dim, loc, AoE_RADIUS);
  for (const mob of nearby) {
    knockbackFrom(mob, loc, 2.8, 0.65);
    applyEffect(mob, "slowness", 40, 2);
    applyEffect(mob, "weakness", 40, 1);
    dealExtraDamage(mob, 3);
  }

  // Second seismic wave (delayed)
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 1)) {
      knockbackFrom(mob, loc, 1.5, 0.4);
      applyEffect(mob, "slowness", 20, 1);
    }
  }, 8);

  // Third ripple
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 2)) {
      knockbackFrom(mob, loc, 0.9, 0.2);
    }
  }, 16);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:earth_smash", loc);
  // Massive expanding ground shockwave
  spawnShockwave(dim, "bca:earth_smash", loc, 7, 4);
  // Debris pillar
  spawnPillar(dim, "bca:earth_smash", loc, 5, 8);
  // Surrounding debris cloud
  for (let i = 0; i < 5; i++) {
    spawnParticleAt(dim, "bca:earth_smash",
      loc.x + (Math.random() - 0.5) * 4,
      loc.y + Math.random() * 2,
      loc.z + (Math.random() - 0.5) * 4
    );
  }

  // Vanilla cracks
  try { dim.spawnParticle("minecraft:breaking_hit_particle", loc); } catch (_) {}

  // Delayed after-dust
  delayedBurst(dim, "bca:earth_smash", { x: loc.x, y: loc.y, z: loc.z }, 6, 10);
  delayedBurst(dim, "bca:earth_smash", { x: loc.x, y: loc.y, z: loc.z }, 14, 8);

  msg(player, "§6🪨 §lEarth Katana§r §e— Tectonic Slam!");
}

// ─────────────────────────────────────────────

/**
 * ⚡ LIGHTNING KATANA (Iron) — Storm · Discharge
 *
 *  Powers:
 *   • Primary lightning strike on target
 *   • Chain Lightning: 2 more bolts on nearby mobs
 *   • Electrocution: Weakness + Slowness from the shock
 *   • Extra damage burst
 *
 *  Visuals:
 *   • Central electric explosion
 *   • Fast outward ring of sparks
 *   • Vertical electric pillar with crackle
 *   • Chain sparks at secondary targets
 *   • Vanilla: lightning_particle + crit
 */
function triggerLightningKatana(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  try { dim.spawnEntity("minecraft:lightning_bolt", loc); } catch (_) {}
  dealExtraDamage(target, 6);
  applyEffect(target, "slowness", 40, 2);
  applyEffect(target, "weakness", 40, 1);

  // Chain lightning — up to 2 nearby mobs
  const nearby = getNearbyMobs(dim, loc, AoE_RADIUS);
  let chains = 0;
  for (const mob of nearby) {
    if (mob === target || chains >= 2) continue;
    system.runTimeout(() => {
      try { dim.spawnEntity("minecraft:lightning_bolt", mob.location); } catch (_) {}
      dealExtraDamage(mob, 4);
      applyEffect(mob, "slowness", 30, 1);
      // Chain spark visual
      spawnParticle(dim, "bca:lightning_strike", mob.location);
      spawnRing(dim, "bca:lightning_strike", mob.location, 1.2, 0.1, 8);
    }, 8 + chains * 6);
    chains++;
  }

  // ─── VISUALS ───
  spawnParticle(dim, "bca:lightning_strike", loc);
  // Violent fast outward ring
  spawnRing(dim, "bca:lightning_strike", loc, 3.0, 0.1, 24);
  spawnRing(dim, "bca:lightning_strike", loc, 1.5, 0.5, 16);
  // Crackle pillar
  spawnPillar(dim, "bca:lightning_strike", loc, 10, 16);
  // Second pulse ring
  system.runTimeout(() => {
    spawnRing(dim, "bca:lightning_strike", loc, 4.5, 0.1, 20);
    spawnParticle(dim, "bca:lightning_strike", loc);
  }, 5);

  // Vanilla accents
  try { dim.spawnParticle("minecraft:lightning_particle", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  delayedBurst(dim, "bca:lightning_strike", loc, 4, 8);
  delayedBurst(dim, "bca:lightning_strike", loc, 10, 6);

  msg(player, "§e⚡ §lLightning Katana§r §e— Storm Discharge!");
}

// ─────────────────────────────────────────────

/**
 * ✨ HOLY KATANA (Gold) — Divine · Radiance
 *
 *  Powers:
 *   • Smite: Massive bonus damage to all undead (doubled)
 *   • Divine Wrath: ALL nearby mobs get Weakness + Blindness
 *   • Radiance Aura: Nearby players get Regen III + Strength + Absorption
 *   • Consecrate: Undead also get Poison (holy burn)
 *
 *  Visuals:
 *   • Huge golden pillar of light
 *   • Multiple expanding golden rings from ground
 *   • Totem particles everywhere
 *   • Delayed golden star burst above center
 */
function triggerHolyKatana(player, target) {
  const loc = target ? target.location : player.location;
  const dim = player.dimension;

  // ─── POWERS ───
  const nearby = getNearbyMobs(dim, loc, AoE_RADIUS);
  for (const mob of nearby) {
    applyEffect(mob, "weakness", 80, 1);
    applyEffect(mob, "blindness", 60, 0);
    if (isUndead(mob)) {
      dealExtraDamage(mob, 10); // Big undead damage
      applyEffect(mob, "poison", 60, 2); // Holy burn
      try { dim.spawnEntity("minecraft:lightning_bolt", mob.location); } catch (_) {}
    } else {
      dealExtraDamage(mob, 3);
    }
  }

  // Buff all nearby players
  const allies = getNearbyPlayers(dim, loc, AoE_RADIUS);
  for (const ally of allies) {
    applyEffect(ally, "instant_health", 1, 2);       // Instant Health III
    applyEffect(ally, "regeneration", 120, 2);        // Regen III 6s
    applyEffect(ally, "strength", 80, 1);             // Strength II 4s
    applyEffect(ally, "absorption", 200, 1);          // Absorption 10s
  }

  // ─── VISUALS ───
  spawnParticle(dim, "bca:holy_slash", loc);
  // Grand pillar of golden light
  spawnPillar(dim, "bca:holy_slash", loc, 14, 20);
  // Multiple expanding rings
  for (let r = 1; r <= 4; r++) {
    const ring = r;
    system.runTimeout(() => {
      spawnRing(dim, "bca:holy_slash", loc, ring * 1.8, 0.1, 20);
      spawnRing(dim, "bca:holy_slash", loc, ring * 1.2, 1.0, 12);
    }, ring * 4);
  }

  // Totem firework-style burst
  try { dim.spawnParticle("minecraft:totem_particle", loc); } catch (_) {}
  system.runTimeout(() => {
    try { dim.spawnParticle("minecraft:totem_particle", { x: loc.x, y: loc.y + 3, z: loc.z }); } catch (_) {}
    spawnRing(dim, "bca:holy_slash", loc, 5.0, 4, 24);
  }, 10);

  delayedBurst(dim, "bca:holy_slash", { x: loc.x, y: loc.y + 5, z: loc.z }, 8, 12);
  delayedBurst(dim, "bca:holy_slash", { x: loc.x, y: loc.y + 8, z: loc.z }, 16, 10);

  msg(player, "§6✨ §lHoly Katana§r §e— Divine Radiance!");
}

// ─────────────────────────────────────────────

/**
 * ❄️ ICE KATANA (Diamond) — Absolute Zero · Permafrost
 *
 *  Powers:
 *   • Freeze: Target gets Slowness V + Mining Fatigue (almost frozen solid)
 *   • Absolute Cold: AoE Slowness IV on all nearby mobs
 *   • Ice Burst: Extra damage + brief Slowness to every mob in large radius
 *   • Cryogenic: Levitate target slightly then slam down (knockback up then gravity)
 *
 *  Visuals:
 *   • Cascading rings of ice crystals
 *   • Tall spire of frost particles
 *   • Snowflakes drifting outward
 *   • Second wave expanding ring with delay
 */
function triggerIceKatana(player, target) {
  const loc = target ? target.location : player.location;
  const dim = player.dimension;

  // ─── POWERS ───
  if (target) {
    applyEffect(target, "slowness",      120, 4); // Slowness V 6s — near frozen
    applyEffect(target, "mining_fatigue", 80, 2);
    applyEffect(target, "weakness",       60, 1);
    dealExtraDamage(target, 6);
    // Cryogenic toss — knock UP then let fall
    try {
      target.applyKnockback(0, 0, 1.2, 1.0);
    } catch (_) {}
  }

  // AoE freeze
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    if (mob === target) continue;
    applyEffect(mob, "slowness", 80, 3);   // Slowness IV 4s
    applyEffect(mob, "weakness", 40, 0);
    dealExtraDamage(mob, 2);
  }

  // Second frost pulse (delayed)
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 2)) {
      applyEffect(mob, "slowness", 40, 2);
    }
  }, 10);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:frost_slash", loc);
  // Ice spire tower
  spawnPillar(dim, "bca:frost_slash", loc, 10, 16);
  // Cascading crystal rings
  for (let i = 1; i <= 5; i++) {
    const idx = i;
    system.runTimeout(() => {
      spawnRing(dim, "bca:frost_slash", loc, idx * 1.4, 0.1, 18);
      spawnRing(dim, "bca:frost_slash", loc, idx * 0.8, 0.6, 10);
    }, idx * 3);
  }

  // Snowflake drift outward
  try { dim.spawnParticle("minecraft:snowflake_particle", loc); } catch (_) {}
  system.runTimeout(() => {
    try { dim.spawnParticle("minecraft:snowflake_particle", { x: loc.x, y: loc.y + 2, z: loc.z }); } catch (_) {}
    spawnRing(dim, "bca:frost_slash", loc, 6, 0.1, 28);
  }, 12);

  delayedBurst(dim, "bca:frost_slash", { x: loc.x, y: loc.y + 1, z: loc.z }, 6, 12);
  delayedBurst(dim, "bca:frost_slash", { x: loc.x, y: loc.y + 4, z: loc.z }, 14, 8);

  msg(player, "§b❄️ §lIce Katana§r §3— Absolute Zero!");
}

// ─────────────────────────────────────────────

/**
 * 🔥 FIRE KATANA (Netherite) — Inferno · Hellstorm
 *
 *  Powers:
 *   • Inferno: Target burns for 10 seconds + Wither effect (soul fire feel)
 *   • Hellstorm: ALL nearby mobs ignite + take extra damage
 *   • Magma Core: After 1s, second explosion for even more damage
 *   • Fire Immunity: Player briefly gets Fire Resistance
 *
 *  Visuals:
 *   • MASSIVE fire column explosion
 *   • Multiple expanding rings of flame
 *   • Delayed second pillar eruption
 *   • Ember rain falling from above
 */
function triggerFireKatana(player, target) {
  const loc = target ? target.location : player.location;
  const dim = player.dimension;

  // ─── POWERS ───
  applyEffect(player, "fire_resistance", 60, 0); // Player safe

  if (target) {
    setOnFire(target, 200);                        // 10s fire
    dealExtraDamage(target, 8);
    applyEffect(target, "wither", 60, 1);           // Wither II 3s (soul fire)
    applyEffect(target, "weakness", 60, 1);
  }

  // AoE hellstorm
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    setOnFire(mob, 140);     // 7s fire
    dealExtraDamage(mob, 4);
    applyEffect(mob, "weakness", 40, 0);
  }

  // Magma core delayed second explosion
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 1)) {
      setOnFire(mob, 60);
      dealExtraDamage(mob, 3);
    }
    spawnParticle(dim, "bca:inferno_slash", loc);
    spawnRing(dim, "bca:inferno_slash", loc, 5, 0.1, 24);
    try { dim.spawnParticle("minecraft:basic_flame_particle", loc); } catch (_) {}
  }, 20); // 1 second delay

  // ─── VISUALS ───
  spawnParticle(dim, "bca:inferno_slash", loc);
  // Eruption pillar
  spawnPillar(dim, "bca:inferno_slash", loc, 12, 20);
  // Shockwave fire rings
  spawnShockwave(dim, "bca:inferno_slash", loc, 8, 5);
  // Extra rings
  spawnRing(dim, "bca:inferno_slash", loc, 2, 0.5, 16);
  spawnRing(dim, "bca:inferno_slash", loc, 4, 1.0, 20);

  // Ember rain from above
  for (let i = 0; i < 10; i++) {
    const ex = i;
    system.runTimeout(() => {
      spawnParticleAt(dim, "bca:inferno_slash",
        loc.x + (Math.random() - 0.5) * 5,
        loc.y + 8 + Math.random() * 4,
        loc.z + (Math.random() - 0.5) * 5
      );
    }, ex * 2);
  }

  try { dim.spawnParticle("minecraft:basic_flame_particle", loc); } catch (_) {}
  delayedBurst(dim, "bca:inferno_slash", { x: loc.x, y: loc.y + 2, z: loc.z }, 8, 12);
  delayedBurst(dim, "bca:inferno_slash", { x: loc.x, y: loc.y, z: loc.z }, 18, 10);

  msg(player, "§4🔥 §lFire Katana§r §c— Hellstorm Inferno!");
}

// ─────────────────────────────────────────────

/**
 * ⚡ ELECTRIC KATANA (Copper) — Arc · Overdrive
 *
 *  Powers:
 *   • Magnetic Pull: Vacuum all items + XP within 10 blocks
 *   • Arc Discharge: AoE stun — Slowness IV + Weakness II + Nausea
 *   • Overdrive Aura: Player gets Speed III + Haste III + Jump Boost II
 *   • Overclock: Damage target + all nearby mobs
 *
 *  Visuals:
 *   • Electric burst with chaotic fast-moving sparks
 *   • Fast-pulsing rings (3 in rapid succession)
 *   • Spiral of electric bolts upward
 *   • Delayed arc discharge rings
 */
function triggerElectricKatana(player, target) {
  const loc = target ? target.location : player.location;
  const dim = player.dimension;

  // ─── POWERS ───
  pullNearbyItemsAndXP(player);

  applyEffect(player, "speed",      80, 2);   // Speed III 4s
  applyEffect(player, "haste",      80, 2);   // Haste III 4s
  applyEffect(player, "jump_boost", 60, 1);   // Jump Boost II 3s

  if (target) {
    dealExtraDamage(target, 7);
    applyEffect(target, "slowness", 50, 3);
    applyEffect(target, "nausea",   60, 0);
    applyEffect(target, "weakness", 50, 1);
  }

  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    if (mob === target) continue;
    applyEffect(mob, "slowness", 40, 3);    // Slowness IV 2s
    applyEffect(mob, "weakness", 40, 1);    // Weakness II 2s
    applyEffect(mob, "nausea",   40, 0);
    dealExtraDamage(mob, 3);
  }

  // Delayed second arc shock
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 1)) {
      applyEffect(mob, "slowness", 20, 2);
      dealExtraDamage(mob, 2);
    }
  }, 8);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:electric_surge", loc);
  // Three rapid pulse rings
  for (let i = 0; i < 3; i++) {
    const pi = i;
    system.runTimeout(() => {
      spawnRing(dim, "bca:electric_surge", loc, 2 + pi * 1.5, 0.1, 20);
      spawnParticle(dim, "bca:electric_surge", loc);
    }, pi * 3);
  }
  // Electric spiral pillar
  spawnPillar(dim, "bca:electric_surge", loc, 8, 14);

  // Chaotic scatter sparks
  for (let i = 0; i < 12; i++) {
    spawnParticleAt(dim, "bca:electric_surge",
      loc.x + (Math.random() - 0.5) * 5,
      loc.y + Math.random() * 3,
      loc.z + (Math.random() - 0.5) * 5
    );
  }

  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  // Delayed arc rings
  delayedBurst(dim, "bca:electric_surge", loc, 6, 10);
  system.runTimeout(() => {
    spawnRing(dim, "bca:electric_surge", loc, 6, 0.1, 28);
  }, 10);

  msg(player, "§6⚡ §lElectric Katana§r §e— Arc Overdrive!");
}

// ─────────────────────────────────────────────

/**
 * 💚 EMERALD KATANA — Verdant Force · Life Drain · Nature's Wrath
 *
 *  Powers:
 *   • Verdant Slam: Target hit with Poison III + Slowness IV + Weakness
 *   • Life Drain: Every nearby mob loses HP — player absorbs it as Absorption + Regen IV
 *   • Thorn Wall: AoE thorns — mobs around player take Poison II + bleed damage over 2 waves
 *   • Nature's Blessing: Player gets Regeneration IV + Absorption III + Resistance II
 *   • Vine Grip: Target gets mining fatigue + levitation (dragged up then dropped)
 *
 *  Visuals:
 *   • Dense emerald-green burst explosion at target
 *   • Spiralling double helix of particles rising upward (alternating rings)
 *   • Ground-level expanding shockwave rings in deep green
 *   • Life drain tendrils — lines of particles from mobs toward player
 *   • Delayed verdant spore cloud bloom
 */
function triggerEmeraldKatana(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;
  const ploc = player.location;

  // ─── POWERS ───
  applyEffect(target, "poison",         100, 2);  // Poison III 5s
  applyEffect(target, "slowness",       120, 3);  // Slowness IV 6s
  applyEffect(target, "weakness",        80, 1);  // Weakness II 4s
  applyEffect(target, "mining_fatigue",  60, 2);  // Mining Fatigue III 3s
  dealExtraDamage(target, 7);
  // Vine Grip — yank upward then gravity brings them back
  try { target.applyKnockback(0, 0, 0.1, 1.4); } catch (_) {}

  // Life Drain — nearby mobs take damage, player heals
  const nearby = getNearbyMobs(dim, ploc, AoE_RADIUS);
  let drainCount = 0;
  for (const mob of nearby) {
    dealExtraDamage(mob, 4);
    applyEffect(mob, "poison",    60, 1);
    applyEffect(mob, "slowness",  40, 2);
    drainCount++;

    // Tendril visual — particles from mob toward player (5 steps)
    const mloc = mob.location;
    for (let s = 0; s <= 5; s++) {
      const step = s;
      system.runTimeout(() => {
        const t = step / 5;
        spawnParticleAt(dim, "bca:emerald_slash",
          mloc.x + (ploc.x - mloc.x) * t,
          mloc.y + (ploc.y - mloc.y) * t + 0.8,
          mloc.z + (ploc.z - mloc.z) * t
        );
      }, s * 2);
    }
  }

  // Second thorn wave (delayed)
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, ploc, AoE_RADIUS + 1)) {
      dealExtraDamage(mob, 2);
      applyEffect(mob, "poison", 40, 1);
    }
    spawnRing(dim, "bca:emerald_slash", loc, 6, 0.1, 28);
  }, 14);

  // Player absorbs the life drain
  const healAmp = Math.min(drainCount, 4);
  applyEffect(player, "regeneration", 140, 3);          // Regen IV 7s
  applyEffect(player, "absorption",   300, healAmp);     // Scales with drain
  applyEffect(player, "resistance",    80, 1);           // Resistance II 4s
  applyEffect(player, "strength",      80, 1);           // Strength II 4s

  // ─── VISUALS ───
  spawnParticle(dim, "bca:emerald_slash", loc);

  // Dense central burst
  for (let i = 0; i < 6; i++) {
    spawnParticleAt(dim, "bca:emerald_slash",
      loc.x + (Math.random() - 0.5) * 1.5,
      loc.y + Math.random() * 2,
      loc.z + (Math.random() - 0.5) * 1.5
    );
  }

  // Double helix rising — two interleaved ring spirals
  for (let h = 0; h < 14; h++) {
    const step = h;
    system.runTimeout(() => {
      const angle1 = (step / 14) * Math.PI * 4;         // 2 full rotations
      const angle2 = angle1 + Math.PI;                   // opposite helix
      const yr = step * 0.65;
      spawnParticleAt(dim, "bca:emerald_slash",
        loc.x + Math.cos(angle1) * 1.4,
        loc.y + yr,
        loc.z + Math.sin(angle1) * 1.4
      );
      spawnParticleAt(dim, "bca:emerald_slash",
        loc.x + Math.cos(angle2) * 1.4,
        loc.y + yr,
        loc.z + Math.sin(angle2) * 1.4
      );
    }, step * 2);
  }

  // Ground shockwave rings — deep green expanding
  spawnShockwave(dim, "bca:emerald_slash", loc, 8, 5);
  spawnRing(dim, "bca:emerald_slash", loc, 2, 0.05, 20);
  spawnRing(dim, "bca:emerald_slash", loc, 3.5, 0.05, 24);

  // Pillar of verdant energy
  spawnPillar(dim, "bca:emerald_slash", loc, 11, 18);

  // Vanilla accents
  try { dim.spawnParticle("minecraft:villager_happy", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  // Delayed spore bloom cloud
  delayedBurst(dim, "bca:emerald_slash", { x: loc.x, y: loc.y + 2, z: loc.z }, 10, 14);
  delayedBurst(dim, "bca:emerald_slash", { x: loc.x, y: loc.y + 5, z: loc.z }, 20, 10);

  msg(player, "§2💚 §lEmerald Katana§r §a— Verdant Force! §2Life Drain active!");
}

// ─────────────────────────────────────────────

/**
 * 🌑 ECLIPSE KATANA — Void Eclipse · Dark Ritual · Solar Annihilation
 *
 *  Powers:
 *   • RITUAL IGNITION: On hit, a 3-phase ritual begins (3 timed waves)
 *   • Phase I  (0s)  — Dark nova: AoE Wither III + Blindness + massive damage to all nearby
 *   • Phase II (1s)  — Void collapse: second explosion, knockback all inward (implode), more damage
 *   • Phase III(2s)  — Eclipse pulse: third shockwave, Levitation then slam, lingering Wither
 *   • Shadow Drain: Player gains Strength III + Resistance III + Speed II from the ritual
 *   • Curse of Darkness: All hit mobs get Darkness + Slowness V (can't see, can't move)
 *   • Instant lethal bonus damage on target (12 extra damage)
 *
 *  Visuals — RITUAL SEQUENCE:
 *   Pre-phase: Summoning circle — 3 concentric rings of dark particles rise from ground
 *   Phase I:  Massive dark void explosion, pillars of shadow shooting up
 *   Phase II: Inward implosion rings collapse toward center (reverse shockwave)
 *             Solar corona ring at mid-height with dark sun halo
 *   Phase III:Outer shockwave blast + blood-red eclipse ring high in sky
 *             Dark rain falling from a high point
 *   All 3 phases staggered with system.runTimeout for cinematic timing
 */
function triggerEclipseKatana(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;
  const ploc = player.location;

  // ══ PHASE 0 — RITUAL IGNITION (immediate) ══
  dealExtraDamage(target, 12);
  applyEffect(target, "wither",    120, 2);  // Wither III 6s
  applyEffect(target, "blindness",  80, 0);  // Blindness 4s
  applyEffect(target, "slowness",  100, 4);  // Slowness V 5s
  applyEffect(target, "darkness",  120, 0);  // Darkness 6s

  // Summoning circle — 3 concentric rings expanding upward (ritual start)
  for (let ring = 1; ring <= 3; ring++) {
    const r = ring;
    system.runTimeout(() => {
      spawnRing(dim, "bca:eclipse_ritual", loc, r * 1.5, 0.05, 24);
      spawnRing(dim, "bca:eclipse_ritual", loc, r * 1.2, r * 0.4, 16);
    }, r * 3);
  }

  // Dark pre-burst particle flash
  spawnParticle(dim, "bca:eclipse_ritual", loc);
  spawnPillar(dim, "bca:eclipse_ritual", loc, 6, 10);

  try { dim.spawnParticle("minecraft:wither_rose_particle", loc); } catch (_) {}

  // ══ PHASE I — DARK NOVA (tick 20 / 1s) ══
  system.runTimeout(() => {
    // AoE dark nova — all nearby mobs
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 2)) {
      dealExtraDamage(mob, 8);
      applyEffect(mob, "wither",    100, 2);
      applyEffect(mob, "blindness",  80, 0);
      applyEffect(mob, "slowness",  100, 3);
      applyEffect(mob, "darkness",  100, 0);
      knockbackFrom(mob, loc, 2.5, 0.6);
    }

    // VISUAL: Massive dark explosion
    spawnParticle(dim, "bca:eclipse_ritual", loc);
    spawnParticle(dim, "bca:eclipse_ritual", loc);

    // Giant shadow pillar eruption
    spawnPillar(dim, "bca:eclipse_ritual", loc, 18, 24);

    // Massive outward ring blast
    spawnRing(dim, "bca:eclipse_ritual", loc, 6.0, 0.1, 32);
    spawnRing(dim, "bca:eclipse_ritual", loc, 4.0, 0.5, 24);
    spawnRing(dim, "bca:eclipse_ritual", loc, 2.5, 1.0, 16);

    // Dark debris scatter
    for (let i = 0; i < 16; i++) {
      spawnParticleAt(dim, "bca:eclipse_ritual",
        loc.x + (Math.random() - 0.5) * 8,
        loc.y + Math.random() * 4,
        loc.z + (Math.random() - 0.5) * 8
      );
    }

    // Vanilla wither accent
    try { dim.spawnParticle("minecraft:wither_rose_particle", loc); } catch (_) {}
    try {
      dim.spawnParticle("minecraft:wither_rose_particle",
        { x: loc.x, y: loc.y + 4, z: loc.z }
      );
    } catch (_) {}

  }, 20);

  // ══ PHASE II — VOID COLLAPSE / IMPLOSION (tick 40 / 2s) ══
  system.runTimeout(() => {
    // Void implosion — pull mobs INWARD (reverse knockback)
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 3)) {
      const dx = loc.x - mob.location.x;
      const dz = loc.z - mob.location.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      try {
        mob.applyKnockback(
          (dx / len) * 3.5,
          (dz / len) * 3.5,
          0.8, 0.6
        );
      } catch (_) {}
      dealExtraDamage(mob, 6);
      applyEffect(mob, "wither",   60, 1);
      applyEffect(mob, "darkness", 80, 0);
    }

    // VISUAL: Inward collapse rings (spawn from outside IN — small to large reversed feel)
    for (let i = 5; i >= 1; i--) {
      const idx = i;
      system.runTimeout(() => {
        spawnRing(dim, "bca:eclipse_ritual", loc, idx * 1.4, 0.1, 20);
      }, (5 - i) * 3);
    }

    // Solar corona / dark sun halo at mid height
    spawnRing(dim, "bca:eclipse_ritual", loc, 5.0, 4.0, 36);  // big ring mid-air
    spawnRing(dim, "bca:eclipse_ritual", loc, 4.2, 4.0, 28);
    spawnRing(dim, "bca:eclipse_ritual", loc, 3.4, 4.0, 20);

    // Eclipse disc — flat ring at eye level
    spawnRing(dim, "bca:eclipse_ritual", loc, 3.0, 1.6, 32);
    spawnRing(dim, "bca:eclipse_ritual", loc, 1.5, 1.6, 16);

    spawnParticle(dim, "bca:eclipse_ritual", loc);
    try { dim.spawnParticle("minecraft:wither_rose_particle", loc); } catch (_) {}

  }, 40);

  // ══ PHASE III — ECLIPSE PULSE / ANNIHILATION (tick 60 / 3s) ══
  system.runTimeout(() => {
    // Final massive shockwave
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 4)) {
      dealExtraDamage(mob, 5);
      applyEffect(mob, "wither",     80, 2);  // Lingering wither
      applyEffect(mob, "levitation", 20, 1);  // Brief levitation then slam
      applyEffect(mob, "darkness",  100, 0);
      knockbackFrom(mob, loc, 1.8, 0.3);
    }

    // VISUAL: Final massive outer blast ring
    spawnShockwave(dim, "bca:eclipse_ritual", loc, 12, 6);
    spawnRing(dim, "bca:eclipse_ritual", loc, 8.0, 0.1, 40);

    // Eclipse halo HIGH in the sky (looks like a dark sun ring)
    spawnRing(dim, "bca:eclipse_ritual", loc, 7.0, 16.0, 40);
    spawnRing(dim, "bca:eclipse_ritual", loc, 5.5, 16.0, 32);
    spawnRing(dim, "bca:eclipse_ritual", loc, 3.5, 16.0, 20);

    // Dark rain — particles falling from 20 blocks above
    for (let i = 0; i < 20; i++) {
      spawnParticleAt(dim, "bca:eclipse_ritual",
        loc.x + (Math.random() - 0.5) * 12,
        loc.y + 20 + Math.random() * 4,
        loc.z + (Math.random() - 0.5) * 12
      );
    }

    // Grand finale pillar
    spawnPillar(dim, "bca:eclipse_ritual", loc, 22, 28);
    spawnParticle(dim, "bca:eclipse_ritual", loc);

    try { dim.spawnParticle("minecraft:wither_rose_particle", loc); } catch (_) {}
    try {
      dim.spawnParticle("minecraft:wither_rose_particle",
        { x: loc.x, y: loc.y + 10, z: loc.z }
      );
    } catch (_) {}

  }, 60);

  // ══ PLAYER SHADOW DRAIN BUFF (granted at Phase I) ══
  system.runTimeout(() => {
    applyEffect(player, "strength",    200, 2);  // Strength III 10s
    applyEffect(player, "resistance",  200, 2);  // Resistance III 10s
    applyEffect(player, "speed",       150, 1);  // Speed II 7.5s
    applyEffect(player, "night_vision",300, 0);  // See through the darkness you create
  }, 18);

  msg(player, "§5🌑 §lEclipse Katana§r §8— §5Ritual of the Void Eclipse §8activated!");

  // Phase marker messages
  system.runTimeout(() => {
    msg(player, "§5🌑 §8Phase I: §cDark Nova — §4ANNIHILATE!");
  }, 20);
  system.runTimeout(() => {
    msg(player, "§5🌑 §8Phase II: §5Void Collapse — §dIMPLODE!");
  }, 40);
  system.runTimeout(() => {
    msg(player, "§5🌑 §8Phase III: §cEclipse Pulse — §4OBLITERATE!");
  }, 60);
}

// ══════════════════════════════════════════════
//  POWER MAPPING
// ══════════════════════════════════════════════
const KATANA_POWERS = {
  "bca:wooden_katana":    triggerNatureKatana,
  "bca:stone_katana":     triggerEarthKatana,
  "bca:iron_katana":      triggerLightningKatana,
  "bca:golden_katana":    triggerHolyKatana,
  "bca:diamond_katana":   triggerIceKatana,
  "bca:netherite_katana": triggerFireKatana,
  "bca:copper_katana":    triggerElectricKatana,
  "bca:emerald_katana":   triggerEmeraldKatana,
  "bca:eclipse_katana":   triggerEclipseKatana,
};

const KATANA_IDS = {
  "bca:wooden_katana":    "wooden_katana",
  "bca:stone_katana":     "stone_katana",
  "bca:iron_katana":      "iron_katana",
  "bca:golden_katana":    "golden_katana",
  "bca:diamond_katana":   "diamond_katana",
  "bca:netherite_katana": "netherite_katana",
  "bca:copper_katana":    "copper_katana",
  "bca:emerald_katana":   "emerald_katana",
  "bca:eclipse_katana":   "eclipse_katana",
};

// ══════════════════════════════════════════════
//  EVENT: entityHurt
// ══════════════════════════════════════════════
world.afterEvents.entityHurt.subscribe((ev) => {
  const attacker = ev.damageSource?.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;

  const player = attacker;
  const target = ev.hurtEntity;

  let heldItem;
  try {
    heldItem = player.getComponent("equippable")?.getEquipment("Mainhand");
  } catch (_) { return; }
  if (!heldItem) return;

  const itemId = heldItem.typeId;
  const cdKey  = KATANA_IDS[itemId];
  if (!cdKey) return;

  if (isOnCooldown(player, cdKey)) {
    const rem = cooldownRemaining(player, cdKey);
    msg(player, `§c⏳ Recharging... §7(${rem}s)`);
    return;
  }

  const powerFn = KATANA_POWERS[itemId];
  if (powerFn) {
    try {
      powerFn(player, target);
      setCooldown(player, cdKey);
    } catch (err) {
      console.warn(`[ElementalKatanas] Error in ${itemId}: ${err}`);
    }
  }
});

// ══════════════════════════════════════════════
//  CLEANUP — purge stale cooldown entries every 5 min
// ══════════════════════════════════════════════
system.runInterval(() => {
  const now = system.currentTick;
  for (const [key, readyTick] of cooldownMap.entries()) {
    if (now > readyTick + 400) cooldownMap.delete(key);
  }
}, 6000);

// ══════════════════════════════════════════════
//  ELEMENTAL DAGGERS — v1.2
//  Daggers are faster, shorter cooldowns, +held visual aura
//  Each dagger fires on entityHurt just like katanas
// ══════════════════════════════════════════════

const DAGGER_COOLDOWNS = {
  wooden_dagger:    60,  // 3s  – Wind
  stone_dagger:     80,  // 4s  – Venom
  iron_dagger:      70,  // 3.5s– Blood
  golden_dagger:    65,  // 3.25s–Divine
  diamond_dagger:   90,  // 4.5s – Cryo
  copper_dagger:    55,  // 2.75s– Thunder
  netherite_dagger: 110, // 5.5s – Shadow
};

const DAGGER_COOLDOWN_MAP = new Map();

function isDaggerOnCooldown(player, id) {
  const key = `${player.name}_dagger_${id}`;
  return system.currentTick < (DAGGER_COOLDOWN_MAP.get(key) ?? 0);
}
function setDaggerCooldown(player, id) {
  const key = `${player.name}_dagger_${id}`;
  DAGGER_COOLDOWN_MAP.set(key, system.currentTick + (DAGGER_COOLDOWNS[id] ?? 60));
}
function daggerCDRemaining(player, id) {
  const key = `${player.name}_dagger_${id}`;
  return Math.ceil(((DAGGER_COOLDOWN_MAP.get(key) ?? 0) - system.currentTick) / 20);
}

// ──────────────────────────────────────────────
//  WIND DAGGER (Wooden) — Gale Force · Aerial Slash
//
//  Powers:
//   • Gale Blast: Massive knockback on target + nearby mobs
//   • Aerial Surge: Player gains Speed IV + Jump Boost III instantly
//   • Updraft: Target is launched into the air (big vertical knockback)
//   • Wind Wall: Nearby mobs get slowed and pushed outward in a radial burst
//   • Storm Echo: Second delayed gust hits all nearby 0.5s later
//
//  Visuals:
//   • Rapid outward burst of pale green-white wind streaks
//   • 3 fast expanding rings in rapid succession
//   • Tall whirlwind pillar (thin, fast particles)
//   • Vanilla: snowflake_particle + crit burst
// ──────────────────────────────────────────────
function triggerWindDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  // Updraft — launch target into sky
  try { target.applyKnockback(0, 0, 0.5, 2.2); } catch (_) {}
  dealExtraDamage(target, 3);
  applyEffect(target, "slowness", 30, 1);

  // Radial gale blast on nearby mobs
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    if (mob === target) continue;
    knockbackFrom(mob, loc, 3.2, 0.9);
    applyEffect(mob, "slowness", 25, 1);
    dealExtraDamage(mob, 2);
  }

  // Player aerial boost
  applyEffect(player, "speed",      50, 3); // Speed IV 2.5s
  applyEffect(player, "jump_boost", 50, 2); // Jump Boost III 2.5s
  applyEffect(player, "haste",      40, 1); // Haste II 2s – fast dagger follow-up

  // Storm echo — second gust 0.5s later
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 1)) {
      knockbackFrom(mob, loc, 1.8, 0.5);
      applyEffect(mob, "slowness", 15, 0);
    }
    spawnParticle(dim, "bca:wind_slash", loc);
    spawnRing(dim, "bca:wind_slash", loc, 5, 0.1, 24);
  }, 10);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:wind_slash", loc);
  // Three rapid pulse rings — gust feel
  for (let i = 0; i < 3; i++) {
    const pi = i;
    system.runTimeout(() => {
      spawnRing(dim, "bca:wind_slash", loc, 1.5 + pi * 1.8, 0.1, 18 + pi * 4);
      spawnRing(dim, "bca:wind_slash", loc, 1.0 + pi * 1.2, 0.6, 12);
    }, pi * 2);
  }
  // Whirlwind pillar — tall and thin
  spawnPillar(dim, "bca:wind_slash", loc, 9, 18);
  // Scatter streaks
  for (let i = 0; i < 8; i++) {
    spawnParticleAt(dim, "bca:wind_slash",
      loc.x + (Math.random() - 0.5) * 4,
      loc.y + Math.random() * 3,
      loc.z + (Math.random() - 0.5) * 4
    );
  }

  try { dim.spawnParticle("minecraft:snowflake_particle", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  delayedBurst(dim, "bca:wind_slash", { x: loc.x, y: loc.y + 3, z: loc.z }, 5, 8);
  delayedBurst(dim, "bca:wind_slash", loc, 12, 6);

  msg(player, "§a🌬️ §lWind Dagger§r §f— Gale Force Surge!");
}

// ──────────────────────────────────────────────
//  VENOM DAGGER (Stone) — Toxic · Corrosion
//
//  Powers:
//   • Venom Strike: Target gets Poison IV + Wither I (stacking DoT)
//   • Corrosion Aura: Nearby mobs get Weakness III + Mining Fatigue (armour eaten)
//   • Toxic Cloud: Lingering AoE poison pool for 3 waves
//   • Antidote Drain: Player absorbs toxins → Regeneration II + Resistance
//
//  Visuals:
//   • Dense bubbling green particle burst at target
//   • Toxic cloud expanding low on the ground (flat rings)
//   • Corrosion tendrils rising upward (pillar with drift)
//   • Vanilla: mob_spell_particle in green
// ──────────────────────────────────────────────
function triggerVenomDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  applyEffect(target, "poison",         140, 3);  // Poison IV 7s
  applyEffect(target, "wither",          80, 0);  // Wither I 4s — stacking DoT
  applyEffect(target, "weakness",        80, 2);  // Weakness III 4s
  applyEffect(target, "mining_fatigue",  60, 1);  // Corrosion
  dealExtraDamage(target, 3);

  // Toxic cloud — 3 timed AoE poison waves
  for (let wave = 0; wave < 3; wave++) {
    const w = wave;
    system.runTimeout(() => {
      for (const mob of getNearbyMobs(dim, loc, BURST_RADIUS + w * 1.5)) {
        applyEffect(mob, "poison",   60, 1 + w);
        applyEffect(mob, "weakness", 30, 1);
        if (w === 0) dealExtraDamage(mob, 2);
      }
      spawnRing(dim, "bca:venom_slash", loc, 1.5 + w * 1.5, 0.1, 14 + w * 6);
      spawnParticle(dim, "bca:venom_slash", loc);
    }, w * 12);
  }

  // Player antidote drain
  applyEffect(player, "regeneration", 80, 1);   // Regen II 4s
  applyEffect(player, "resistance",   60, 0);    // Resistance I 3s

  // ─── VISUALS ───
  spawnParticle(dim, "bca:venom_slash", loc);
  // Low toxic cloud rings
  spawnRing(dim, "bca:venom_slash", loc, 1.8, 0.05, 20);
  spawnRing(dim, "bca:venom_slash", loc, 3.2, 0.05, 24);
  // Rising corrosion column
  spawnPillar(dim, "bca:venom_slash", loc, 6, 10);
  // Bubble scatter
  for (let i = 0; i < 10; i++) {
    spawnParticleAt(dim, "bca:venom_slash",
      loc.x + (Math.random() - 0.5) * 3,
      loc.y + Math.random() * 2.5,
      loc.z + (Math.random() - 0.5) * 3
    );
  }

  try { dim.spawnParticle("minecraft:mob_spell_particle", loc); } catch (_) {}

  delayedBurst(dim, "bca:venom_slash", { x: loc.x, y: loc.y + 1.5, z: loc.z }, 8, 10);
  delayedBurst(dim, "bca:venom_slash", loc, 18, 8);

  msg(player, "§2☠️ §lVenom Dagger§r §a— Toxic Corrosion!");
}

// ──────────────────────────────────────────────
//  BLOOD DAGGER (Iron) — Hemorrhage · Life Steal
//
//  Powers:
//   • Hemorrhage: Target bleeds — Wither II + Weakness II every 2s for 6s
//   • Life Steal: Player heals proportional to damage dealt
//   • Crimson Mark: Target takes +50% damage from all sources (Weakness on self-protection)
//   • Blood Frenzy: After kill, player gains Strength III + Speed II (checked via target hp)
//
//  Visuals:
//   • Crimson blood burst — heavy particles falling downward
//   • Blood droplets scatter around target
//   • Pulsing dark red ring at ground
//   • Vanilla: crit particles + redstone glow
// ──────────────────────────────────────────────
function triggerBloodDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  // Hemorrhage — 3 timed wither pulses (bleed ticks)
  for (let pulse = 0; pulse < 3; pulse++) {
    system.runTimeout(() => {
      applyEffect(target, "wither",   40, 1);   // Wither II 2s
      applyEffect(target, "weakness", 30, 1);
      dealExtraDamage(target, 2);
      spawnParticle(dim, "bca:blood_slash", loc);
    }, pulse * 14);
  }

  // Initial strike
  dealExtraDamage(target, 4);
  applyEffect(target, "weakness",        60, 2); // Crimson Mark
  applyEffect(target, "mining_fatigue",  40, 1); // Armour decay

  // Life steal — heal player
  applyEffect(player, "absorption",  120, 1);   // Absorption II 6s
  applyEffect(player, "regeneration", 60, 1);   // Regen II 3s

  // Blood Frenzy — check if target dies soon (low health heuristic via damage)
  system.runTimeout(() => {
    try {
      const hp = target.getComponent("minecraft:health")?.currentValue ?? 20;
      if (hp <= 4) {
        applyEffect(player, "strength", 100, 2); // Strength III 5s
        applyEffect(player, "speed",     80, 1); // Speed II 4s
        msg(player, "§4🩸 §lBlood Frenzy! §c+Strength +Speed from the kill!");
        spawnRing(dim, "bca:blood_slash", player.location, 2, 0.1, 16);
      }
    } catch (_) {}
  }, 20);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:blood_slash", loc);
  // Heavy downward blood droplet scatter
  for (let i = 0; i < 14; i++) {
    const di = i;
    system.runTimeout(() => {
      spawnParticleAt(dim, "bca:blood_slash",
        loc.x + (Math.random() - 0.5) * 2.5,
        loc.y + 2.5 + Math.random() * 1.5,
        loc.z + (Math.random() - 0.5) * 2.5
      );
    }, di * 1);
  }
  // Pulsing ground ring
  spawnRing(dim, "bca:blood_slash", loc, 1.2, 0.05, 16);
  spawnRing(dim, "bca:blood_slash", loc, 2.2, 0.05, 20);
  system.runTimeout(() => {
    spawnRing(dim, "bca:blood_slash", loc, 3.0, 0.05, 24);
  }, 8);

  // Short pillar
  spawnPillar(dim, "bca:blood_slash", loc, 4, 8);

  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  delayedBurst(dim, "bca:blood_slash", { x: loc.x, y: loc.y + 0.5, z: loc.z }, 6, 8);

  msg(player, "§4🩸 §lBlood Dagger§r §c— Hemorrhage Strike!");
}

// ──────────────────────────────────────────────
//  DIVINE DAGGER (Gold) — Smite · Consecration
//
//  Powers:
//   • Holy Strike: Extra +8 damage vs undead, +3 vs others
//   • Consecration: Small radius blessing — nearby players heal + get Strength
//   • Smite Burst: All undead in 5 blocks get struck by lightning
//   • Grace: Player gains Absorption III + Regeneration II instantly
//
//  Visuals:
//   • Brilliant golden burst of rising light shards
//   • Ascending pillar of golden motes
//   • Radiant expanding ring at ground
//   • Totem particle accent at target
// ──────────────────────────────────────────────
function triggerDivineDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  const dmg = isUndead(target) ? 8 : 3;
  dealExtraDamage(target, dmg);
  applyEffect(target, "weakness", 60, 1);
  applyEffect(target, "blindness", 40, 0);

  // Smite — lightning on all nearby undead
  for (const mob of getNearbyMobs(dim, loc, 5)) {
    if (isUndead(mob)) {
      try { dim.spawnEntity("minecraft:lightning_bolt", mob.location); } catch (_) {}
      dealExtraDamage(mob, 5);
      spawnRing(dim, "bca:divine_slash", mob.location, 1.0, 0.1, 8);
    }
  }

  // Player divine grace
  applyEffect(player, "absorption",   160, 2);  // Absorption III 8s
  applyEffect(player, "regeneration",  80, 1);  // Regen II 4s
  applyEffect(player, "strength",      60, 0);  // Strength I 3s

  // Consecration — bless nearby allies
  for (const ally of getNearbyPlayers(dim, loc, 5)) {
    applyEffect(ally, "regeneration",  60, 1);
    applyEffect(ally, "strength",      40, 0);
  }

  // ─── VISUALS ───
  spawnParticle(dim, "bca:divine_slash", loc);
  // Ascending golden pillar
  spawnPillar(dim, "bca:divine_slash", loc, 8, 14);
  // Radiant ground ring
  spawnRing(dim, "bca:divine_slash", loc, 2.0, 0.05, 20);
  spawnRing(dim, "bca:divine_slash", loc, 3.5, 0.05, 24);
  // Expanding holy shockwave
  spawnShockwave(dim, "bca:divine_slash", loc, 5, 3);
  // Scatter shards upward
  for (let i = 0; i < 8; i++) {
    spawnParticleAt(dim, "bca:divine_slash",
      loc.x + (Math.random() - 0.5) * 2,
      loc.y + Math.random() * 4,
      loc.z + (Math.random() - 0.5) * 2
    );
  }

  try { dim.spawnParticle("minecraft:totem_particle", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  delayedBurst(dim, "bca:divine_slash", { x: loc.x, y: loc.y + 4, z: loc.z }, 7, 10);

  msg(player, "§e✨ §lDivine Dagger§r §6— Holy Smite!");
}

// ──────────────────────────────────────────────
//  CRYO DAGGER (Diamond) — Shatter · Absolute Freeze
//
//  Powers:
//   • Shatter Strike: Target frozen solid — Slowness V + Mining Fatigue III
//   • Ice Lance: Extra shatter damage burst
//   • Cryo Field: AoE Slowness IV + Weakness on all nearby
//   • Frozen Core: After 1s, a second ice nova explodes from the target
//
//  Visuals:
//   • Razor-sharp ice shard burst in all directions
//   • Crystal spire rising above target
//   • Cascading ice rings outward
//   • Snowflake particles + delayed second burst
// ──────────────────────────────────────────────
function triggerCryoDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  applyEffect(target, "slowness",       140, 4);  // Slowness V 7s — frozen solid
  applyEffect(target, "mining_fatigue",  80, 2);  // III — can't swing
  applyEffect(target, "weakness",        80, 1);
  dealExtraDamage(target, 5);
  // Ice toss — knock up and freeze mid-air
  try { target.applyKnockback(0, 0, 0.3, 1.5); } catch (_) {}

  // Cryo field
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    if (mob === target) continue;
    applyEffect(mob, "slowness", 80, 3);    // Slowness IV
    applyEffect(mob, "weakness", 50, 0);
    dealExtraDamage(mob, 2);
  }

  // Frozen core — second ice nova 1s later
  system.runTimeout(() => {
    spawnParticle(dim, "bca:cryo_slash", loc);
    spawnShockwave(dim, "bca:cryo_slash", loc, 6, 4);
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 1)) {
      applyEffect(mob, "slowness", 40, 2);
      dealExtraDamage(mob, 2);
    }
  }, 20);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:cryo_slash", loc);
  // Crystal spire
  spawnPillar(dim, "bca:cryo_slash", loc, 8, 14);
  // Cascading crystal rings
  for (let i = 1; i <= 4; i++) {
    const idx = i;
    system.runTimeout(() => {
      spawnRing(dim, "bca:cryo_slash", loc, idx * 1.6, 0.1, 16 + idx * 2);
    }, idx * 2);
  }
  // Razor shard scatter
  for (let i = 0; i < 10; i++) {
    spawnParticleAt(dim, "bca:cryo_slash",
      loc.x + (Math.random() - 0.5) * 3,
      loc.y + Math.random() * 2,
      loc.z + (Math.random() - 0.5) * 3
    );
  }

  try { dim.spawnParticle("minecraft:snowflake_particle", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:snowflake_particle", { x: loc.x, y: loc.y + 2, z: loc.z }); } catch (_) {}

  delayedBurst(dim, "bca:cryo_slash", { x: loc.x, y: loc.y + 1, z: loc.z }, 5, 10);
  delayedBurst(dim, "bca:cryo_slash", { x: loc.x, y: loc.y + 4, z: loc.z }, 14, 8);

  msg(player, "§b❄️ §lCryo Dagger§r §3— Shatter Nova!");
}

// ──────────────────────────────────────────────
//  THUNDER DAGGER (Copper) — Chain Arc · Overload
//
//  Powers:
//   • Arc Strike: Hit lands a direct lightning + extra damage
//   • Chain Arc: Jumps to up to 3 additional nearby mobs (cascading)
//   • Overload: Player gains Haste III + Speed II instantly
//   • Capacitor Drain: Pulls nearby items + XP (same as electric katana)
//   • Static Field: All nearby mobs get Nausea + brief Slowness
//
//  Visuals:
//   • Violent blue-white electric burst at impact
//   • Multiple rapid-fire spark rings
//   • Electric chain lines toward nearby mobs (particle steps)
//   • Crackle pillar
// ──────────────────────────────────────────────
function triggerThunderDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  try { dim.spawnEntity("minecraft:lightning_bolt", loc); } catch (_) {}
  dealExtraDamage(target, 5);
  applyEffect(target, "slowness", 30, 2);
  applyEffect(target, "nausea",   50, 0);
  applyEffect(target, "weakness", 40, 1);

  // Chain arc — up to 3 targets
  const nearby = getNearbyMobs(dim, loc, AoE_RADIUS);
  let chains = 0;
  for (const mob of nearby) {
    if (mob === target || chains >= 3) continue;
    const chain = chains;
    system.runTimeout(() => {
      try { dim.spawnEntity("minecraft:lightning_bolt", mob.location); } catch (_) {}
      dealExtraDamage(mob, 3);
      applyEffect(mob, "slowness", 20, 1);
      applyEffect(mob, "nausea",   30, 0);
      // Chain spark visual — stepped line toward mob
      const mloc = mob.location;
      for (let s = 0; s <= 4; s++) {
        const step = s;
        system.runTimeout(() => {
          const t = step / 4;
          spawnParticleAt(dim, "bca:thunder_slash",
            loc.x + (mloc.x - loc.x) * t + (Math.random() - 0.5) * 0.3,
            loc.y + (mloc.y - loc.y) * t + 0.9,
            loc.z + (mloc.z - loc.z) * t + (Math.random() - 0.5) * 0.3
          );
        }, s * 1);
      }
      spawnRing(dim, "bca:thunder_slash", mob.location, 0.8, 0.1, 8);
    }, 6 + chain * 5);
    chains++;
  }

  // Static field — all nearby get nausea
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS - 1)) {
    if (mob === target) continue;
    applyEffect(mob, "nausea",   30, 0);
    applyEffect(mob, "slowness", 20, 1);
  }

  // Overload buff
  applyEffect(player, "haste",  60, 2);  // Haste III 3s
  applyEffect(player, "speed",  60, 1);  // Speed II 3s

  // Capacitor drain
  pullNearbyItemsAndXP(player);

  // ─── VISUALS ───
  spawnParticle(dim, "bca:thunder_slash", loc);
  // Rapid pulse rings
  for (let i = 0; i < 4; i++) {
    const pi = i;
    system.runTimeout(() => {
      spawnRing(dim, "bca:thunder_slash", loc, 1.0 + pi * 1.2, 0.1, 16 + pi * 4);
      spawnParticle(dim, "bca:thunder_slash", loc);
    }, pi * 2);
  }
  // Crackle pillar
  spawnPillar(dim, "bca:thunder_slash", loc, 7, 14);
  // Chaotic spark scatter
  for (let i = 0; i < 10; i++) {
    spawnParticleAt(dim, "bca:thunder_slash",
      loc.x + (Math.random() - 0.5) * 4,
      loc.y + Math.random() * 3,
      loc.z + (Math.random() - 0.5) * 4
    );
  }

  try { dim.spawnParticle("minecraft:lightning_particle", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:basic_crit_particle", loc); } catch (_) {}

  delayedBurst(dim, "bca:thunder_slash", loc, 4, 10);
  system.runTimeout(() => {
    spawnRing(dim, "bca:thunder_slash", loc, 5.5, 0.1, 28);
  }, 8);

  msg(player, "§e⚡ §lThunder Dagger§r §b— Chain Arc Overload!");
}

// ──────────────────────────────────────────────
//  SHADOW DAGGER (Netherite) — Void Stab · Darkness Rift
//
//  Powers:
//   • Void Stab: Instant high damage + Wither III + Darkness — target can't see or fight
//   • Rift Collapse: After 1.5s, implosion pulls ALL nearby mobs inward + extra damage
//   • Shadow Shroud: Player turns invisible + gains Night Vision + Resistance II
//   • Curse of the Abyss: All nearby mobs get Darkness + Slowness V (can't escape)
//   • Necrotic Drain: Player heals Absorption IV from the void energy
//
//  Visuals:
//   • Dark implosion burst — particles collapsing inward
//   • Rising void pillar (dark purple/black)
//   • Rift collapse rings shrinking inward with delay
//   • Eclipse-like halo at mid height
//   • Dark rain falling from above
// ──────────────────────────────────────────────
function triggerShadowDagger(player, target) {
  if (!target) return;
  const dim = target.dimension;
  const loc = target.location;

  // ─── POWERS ───
  dealExtraDamage(target, 7);
  applyEffect(target, "wither",    120, 2);  // Wither III 6s
  applyEffect(target, "darkness",  140, 0);  // Darkness 7s
  applyEffect(target, "slowness",  100, 4);  // Slowness V 5s
  applyEffect(target, "weakness",   80, 1);  // Weakness II 4s
  applyEffect(target, "blindness",  60, 0);  // Blindness 3s

  // Curse AoE — all nearby mobs
  for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS)) {
    if (mob === target) continue;
    applyEffect(mob, "darkness",  80, 0);
    applyEffect(mob, "slowness",  60, 3);
    applyEffect(mob, "weakness",  50, 1);
    dealExtraDamage(mob, 3);
  }

  // Rift collapse — implosion 1.5s later
  system.runTimeout(() => {
    for (const mob of getNearbyMobs(dim, loc, AoE_RADIUS + 2)) {
      const dx = loc.x - mob.location.x;
      const dz = loc.z - mob.location.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      try {
        mob.applyKnockback((dx / len) * 4.0, (dz / len) * 4.0, 0.6, 0.4);
      } catch (_) {}
      dealExtraDamage(mob, 5);
      applyEffect(mob, "wither",   50, 2);
      applyEffect(mob, "darkness", 60, 0);
    }
    // Collapse visual
    for (let i = 5; i >= 1; i--) {
      const idx = i;
      system.runTimeout(() => {
        spawnRing(dim, "bca:shadow_slash", loc, idx * 1.3, 0.1, 18);
      }, (5 - i) * 3);
    }
    spawnParticle(dim, "bca:shadow_slash", loc);
    spawnParticle(dim, "bca:shadow_slash", loc);
    try { dim.spawnParticle("minecraft:wither_rose_particle", loc); } catch (_) {}
  }, 30);

  // Shadow Shroud — stealth + combat buff
  applyEffect(player, "invisibility",  80, 0);  // Invisible 4s — sneak window
  applyEffect(player, "night_vision", 200, 0);  // See through the darkness
  applyEffect(player, "resistance",    80, 1);  // Resistance II 4s
  applyEffect(player, "absorption",   200, 3);  // Absorption IV 10s — necrotic drain
  applyEffect(player, "strength",      80, 1);  // Strength II 4s

  // ─── VISUALS ───
  spawnParticle(dim, "bca:shadow_slash", loc);
  spawnParticle(dim, "bca:shadow_slash", loc);
  // Rising void pillar
  spawnPillar(dim, "bca:shadow_slash", loc, 10, 16);
  // Inward collapsing rings
  for (let i = 1; i <= 4; i++) {
    const idx = i;
    system.runTimeout(() => {
      spawnRing(dim, "bca:shadow_slash", loc, (5 - idx) * 1.2, 0.1, 20);
    }, idx * 3);
  }
  // Dark scatter cloud
  for (let i = 0; i < 12; i++) {
    spawnParticleAt(dim, "bca:shadow_slash",
      loc.x + (Math.random() - 0.5) * 4,
      loc.y + Math.random() * 3,
      loc.z + (Math.random() - 0.5) * 4
    );
  }
  // Mid-air eclipse halo
  spawnRing(dim, "bca:shadow_slash", loc, 4.5, 5.0, 32);
  spawnRing(dim, "bca:shadow_slash", loc, 3.0, 5.0, 20);
  // Dark rain from above
  for (let i = 0; i < 8; i++) {
    const di = i;
    system.runTimeout(() => {
      spawnParticleAt(dim, "bca:shadow_slash",
        loc.x + (Math.random() - 0.5) * 6,
        loc.y + 12 + Math.random() * 3,
        loc.z + (Math.random() - 0.5) * 6
      );
    }, di * 2);
  }

  try { dim.spawnParticle("minecraft:wither_rose_particle", loc); } catch (_) {}
  try { dim.spawnParticle("minecraft:wither_rose_particle", { x: loc.x, y: loc.y + 5, z: loc.z }); } catch (_) {}

  delayedBurst(dim, "bca:shadow_slash", loc, 8, 10);
  delayedBurst(dim, "bca:shadow_slash", { x: loc.x, y: loc.y + 3, z: loc.z }, 18, 8);

  msg(player, "§5🌑 §lShadow Dagger§r §8— Void Rift Collapse!");
}

// ══════════════════════════════════════════════
//  DAGGER POWER MAPPING
// ══════════════════════════════════════════════
const DAGGER_POWERS = {
  "bca:wooden_dagger":    { fn: triggerWindDagger,    cd: "wooden_dagger"    },
  "bca:stone_dagger":     { fn: triggerVenomDagger,   cd: "stone_dagger"     },
  "bca:iron_dagger":      { fn: triggerBloodDagger,   cd: "iron_dagger"      },
  "bca:golden_dagger":    { fn: triggerDivineDagger,  cd: "golden_dagger"    },
  "bca:diamond_dagger":   { fn: triggerCryoDagger,    cd: "diamond_dagger"   },
  "bca:copper_dagger":    { fn: triggerThunderDagger, cd: "copper_dagger"    },
  "bca:netherite_dagger": { fn: triggerShadowDagger,  cd: "netherite_dagger" },
};

// ══════════════════════════════════════════════
//  EVENT: entityHurt — DAGGER HANDLER
// ══════════════════════════════════════════════
world.afterEvents.entityHurt.subscribe((ev) => {
  const attacker = ev.damageSource?.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;

  const player = attacker;
  const target = ev.hurtEntity;

  let heldItem;
  try {
    heldItem = player.getComponent("equippable")?.getEquipment("Mainhand");
  } catch (_) { return; }
  if (!heldItem) return;

  const entry = DAGGER_POWERS[heldItem.typeId];
  if (!entry) return;

  if (isDaggerOnCooldown(player, entry.cd)) {
    const rem = daggerCDRemaining(player, entry.cd);
    msg(player, `§c⏳ Recharging... §7(${rem}s)`);
    return;
  }

  try {
    entry.fn(player, target);
    setDaggerCooldown(player, entry.cd);
  } catch (err) {
    console.warn(`[ElementalDaggers] Error in ${heldItem.typeId}: ${err}`);
  }
});

// ══════════════════════════════════════════════
//  STARTUP
// ══════════════════════════════════════════════
system.run(() => {
  world.sendMessage("§6✦ §lElemental Katanas V2§r §6✦ §aExpansion Loaded!");
  world.sendMessage("§7  🌿 Nature · 🪨 Earth · ⚡ Lightning · ✨ Holy · ❄️ Ice · 🔥 Fire · ⚡ Electric");
  world.sendMessage("§7  §2💚 Emerald §7· §5🌑 Eclipse");
  world.sendMessage("§a  ══ Elemental Daggers ══");
  world.sendMessage("§7  🌬️ Wind · ☠️ Venom · 🩸 Blood · ✨ Divine · ❄️ Cryo · ⚡ Thunder · 🌑 Shadow");
});
