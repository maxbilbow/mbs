import { world, system, EquipmentSlot, GameMode, ItemStack } from "@minecraft/server";
import { DrillConfigs } from "./drill_configs.js";

const UniversalDrillSystem = {
    activeDrills: new Map,

    getDrillType(t) {
        return t && {
            "drills:iron_drill": "iron",
            "drills:gold_drill": "gold",
            "drills:diamond_drill": "diamond",
            "drills:emerald_drill": "emerald",
            "drills:netherite_drill": "netherite",
            "drills:copper_drill": "copper",
            "drills:amethyst_drill": "amethyst",
            "drills:skulk_drill": "skulk",
            "drills:prismarine_drill": "prismarine",
            "drills:chorus_drill": "chorus",
            "drills:multi_drill": "multi",
            "myw:mythril_drill": "netherite"
        }[t.typeId] || null
    },

    getConfig(t) {
        return DrillConfigs[t] || DrillConfigs.iron
    },

    handleDrillUse(t, e, r) {
        try {
            var a, i, l, o, s = this.getDrillType(e);
            s && (a = this.getConfig(s), i = t.id, l = this.getDrillMode(t), (o = this.getDrillHeat(t)) >= a.maxHeat ? this.handleOverheat(t, s) : o >= a.cooldownThreshold ? t.onScreenDisplay.setActionBar(`§e${a.name} Drill too hot - Must cool before use`) : this.activeDrills.has(i) || (a.teleportAbility && this.applyChorusTeleport(t), this.setDrillHeat(t, o + a.heatPerUse), this.playDrillSound(t, "start", s), this.startContinuousDrilling(t, e, l, s)))
        } catch (t) {
            world.sendMessage("§cDrill error: " + t.message)
        }
    },

    handleBlockDrilling(t, e, r, a) {
        try {
            var i, l, o, s, n = this.getDrillType(e);
            n && (i = this.getConfig(n), l = this.getDrillMode(t), (o = this.getDrillHeat(t)) >= i.maxHeat ? this.handleOverheat(t, n) : o >= i.cooldownThreshold ? t.onScreenDisplay.setActionBar(`§e${i.name} Drill too hot - Must cool before use`) : (s = this.calculateDrillAreaWithDirection(r.location, t, l, i), this.setDrillHeat(t, o + i.heatPerUse), this.breakBlocksWithDelay(t, e, s, i), this.createDrillImpactEffects(t.dimension, r.location, n), this.playDrillSound(t, "impact", n)))
        } catch (t) {
            world.sendMessage("§cDrilling error: " + t.message)
        }
    },

    startContinuousDrilling(s, n, c, d) {
        const h = s.id,
            m = this.getConfig(d);
        let y = 0,
            p = 0;
        var t = {
                intervalId: null,
                startTime: Date.now(),
                drillType: d
            },
            e = system.runInterval(() => {
                try {
                    y++, p++;
                    var t = s.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand),
                        e = this.getDrillType(t);
                    if (e && e === d) {
                        var r = this.getTargetBlock(s);
                        if (r) {
                            if (p >= Math.max(1, m.breakDelay - 2)) {
                                p = 0;
                                var a = this.getDrillHeat(s);
                                if (this.setDrillHeat(s, a + m.continuousHeatPerUse), a >= m.maxHeat) return this.handleOverheat(s, d), void this.stopDrilling(h);
                                var i = this.calculateDrillAreaWithDirection(r.location, s, "continuous", m),
                                    l = Math.max(2 * m.blocksPerTick, 4),
                                    o = i.slice(0, l);
                                this.breakBlocksBatch(s, n, o, m), this.consumeDurability(s, n, d), this.applySpecialDrillAbilities(s, d, r)
                            }
                            this.createContinuousDrillEffects(s, d), this.updateDrillDisplay(s, this.getDrillHeat(s), c, d), y >= 20 * m.maxDrillTime && this.stopDrilling(h)
                        } else this.stopDrilling(h)
                    } else this.stopDrilling(h)
                } catch (t) {
                    this.stopDrilling(h), world.sendMessage("§cContinuous drilling error: " + t.message)
                }
            }, 1);
        t.intervalId = e, this.activeDrills.set(h, t)
    },

    stopDrilling(e) {
        var t, r = this.activeDrills.get(e);
        r && r.intervalId && (system.clearRun(r.intervalId), this.activeDrills.delete(e), t = [...world.getPlayers()].find(t => t.id === e)) && (this.playDrillSound(t, "stop", r.drillType), this.handleDrillStop(t, r.drillType))
    },

    calculateDrillAreaWithDirection(t, e, r, a) {
        var i = [],
            {
                x: l,
                y: o,
                z: s
            } = t,
            n = e.getViewDirection(),
            t = a.maxRadius,
            e = Math.abs(n.x),
            a = Math.abs(n.y),
            c = Math.abs(n.z);
        let d, h, m;
        m = a < e && c < e ? (d = "x", h = "y", "z") : e < c && a < c ? (d = "z", h = "x", "y") : (d = "y", h = "x", "z");
        var y = Math.min(t, 3);
        switch (r) {
            case "precision":
                i.push({
                    x: Math.floor(l),
                    y: Math.floor(o),
                    z: Math.floor(s)
                });
                break;
            case "standard":
                var p = Math.min(y, 2);
                for (let e = -p; e <= p; e++)
                    for (let t = -p; t <= p; t++) {
                        var u = {
                            x: Math.floor(l),
                            y: Math.floor(o),
                            z: Math.floor(s)
                        };
                        u[h] += e, u[m] += t, i.push(u)
                    }
                break;
            case "pyramid":
                var f = 0 < n.x ? 1 : n.x < 0 ? -1 : 0,
                    D = 0 < n.z ? 1 : n.z < 0 ? -1 : 0,
                    g = 0 < n.y ? 1 : n.y < 0 ? -1 : 0;
                var b = -1,
                    p = y;
                for (let e = -p; e <= p; e++)
                    for (let t = -p; t <= p; t++) {
                        var u = {
                            x: Math.floor(l),
                            y: Math.floor(o),
                            z: Math.floor(s)
                        };
                        "x" === d ? (u.y += e, u.z += t, u.x += b * (f || 1)) : "z" === d ? (u.x += e, u.y += t, u.z += b * (D || 1)) : (u.x += e, u.z += t, u.y += b * (g || 1)), i.push(u)
                    }
                for (let r = 0; r <= y; r++) {
                    p = y - r;
                    for (let e = -p; e <= p; e++)
                        for (let t = -p; t <= p; t++) {
                            var u = {
                                x: Math.floor(l),
                                y: Math.floor(o),
                                z: Math.floor(s)
                            };
                            "x" === d ? (u.y += e, u.z += t, u.x += r * (f || 1)) : "z" === d ? (u.x += e, u.y += t, u.z += r * (D || 1)) : (u.x += e, u.z += t, u.y += r * (g || 1)), i.push(u)
                        }
                }
                break;
            case "excavation":
                for (let r = -y; r <= y; r++)
                    for (let e = -y; e <= y; e++)
                        for (let t = -y; t <= y; t++) i.push({
                            x: Math.floor(l) + r,
                            y: Math.floor(o) + e,
                            z: Math.floor(s) + t
                        });
                break;
            case "tunnel":
                var f = 0 < n.x ? 1 : n.x < 0 ? -1 : 0,
                    D = 0 < n.z ? 1 : n.z < 0 ? -1 : 0,
                    g = 0 < n.y ? 1 : n.y < 0 ? -1 : 0,
                    M = Math.min(y + 1, 5);
                for (let r = -y; r <= y; r++)
                    for (let e = -y; e <= y; e++)
                        for (let t = 0; t <= M; t++) {
                            var v = {
                                x: Math.floor(l),
                                y: Math.floor(o),
                                z: Math.floor(s)
                            };
                            "x" === d ? (v.y += r, v.z += e, v.x += t * (f || 1)) : "z" === d ? (v.x += r, v.y += e, v.z += t * (D || 1)) : (v.x += r, v.z += e, v.y += t * (g || 1)), i.push(v)
                        }
                break;
            default:
                i.push({
                    x: Math.floor(l),
                    y: Math.floor(o),
                    z: Math.floor(s)
                })
        }
        return i.filter((e, t, r) => t === r.findIndex(t => t.x === e.x && t.y === e.y && t.z === e.z))
    },

    breakBlocksWithDelay(r, t, a, i) {
        const l = Math.max(3 * i.blocksPerTick, 8);
        let o = 0;
        var e = Math.min(l, a.length);
        for (let t = 0; t < e; t++) this.breakSingleBlock(r, a[t], i);
        if ((o = e) < a.length) {
            const s = system.runInterval(() => {
                if (o >= a.length) system.clearRun(s);
                else {
                    var e = Math.min(l, a.length - o);
                    for (let t = 0; t < e; t++) o + t < a.length && this.breakSingleBlock(r, a[o + t], i);
                    o += e
                }
            }, 1)
        }
    },

    breakBlocksBatch(e, t, r, a) {
        var i, l = Math.min(r.length, 16);
        for (let t = 0; t < l; t++) t < r.length && (i = r[t], Math.random() <= a.efficiency) && this.breakSingleBlock(e, i, a);
        if (r.length > l) {
            const o = r.slice(l);
            system.runTimeout(() => {
                this.breakBlocksBatch(e, t, o, a)
            }, 1)
        }
    },

    breakSingleBlock(t, e, r) {
        try {
            var a = t.dimension.getBlock(e);
            !a || "minecraft:air" === a.typeId || this.isUnbreakableBlock(a.typeId) || (this.getDropsEnabled(t) && this.createBlockDrops(t, a, e), this.createBlockBreakEffects(t.dimension, e, a.typeId, r, t), r.luckyBonus && Math.random() < .1 && this.createBonusDrops(t.dimension, e), a.setType("minecraft:air"))
        } catch (t) {}
    },

    createBonusDrops(t, e) {
        try {
            t.spawnParticle("minecraft:totem_particle", {
                x: e.x + .5,
                y: e.y + .5,
                z: e.z + .5
            })
        } catch (t) {}
    },

    createContinuousDrillEffects(t, e) {
        try {
            var r = this.getConfig(e),
                a = t.location,
                i = t.dimension;
            if (.75 < Math.random())
                if ("multi" === e) this.createMultiDrillParticles(i, a);
                else
                    for (let t = 0; t < 3; t++) {
                        var l = 2 * (Math.random() - .5),
                            o = 2 * Math.random(),
                            s = 2 * (Math.random() - .5);
                        i.spawnParticle(r.particleType, {
                            x: a.x + l,
                            y: a.y + o,
                            z: a.z + s
                        })
                    }
            r.fastCooling && .8 < Math.random() && i.spawnParticle("drills:copper_dust", {
                x: a.x,
                y: a.y + 1,
                z: a.z
            })
        } catch (t) {}
    },

    createMultiDrillParticles(e, r) {
        try {
            var a = ["drills:iron_dust", "drills:gold_dust", "drills:copper_dust", "drills:amethyst_dust", "drills:prismarine_dust", "drills:emerald_dust", "drills:skulk_dust", "drills:chorus_dust", "drills:diamond_dust", "drills:netherite_dust"],
                i = Math.floor(2 * Math.random()) + 2;
            for (let t = 0; t < i; t++) {
                var l = a[Math.floor(Math.random() * a.length)],
                    o = 2.5 * (Math.random() - .5),
                    s = 2.5 * Math.random(),
                    n = 2.5 * (Math.random() - .5);
                e.spawnParticle(l, {
                    x: r.x + o,
                    y: r.y + s,
                    z: r.z + n
                })
            }
        } catch (t) {
            try {
                e.spawnParticle("drills:multi_dust", {
                    x: r.x,
                    y: r.y + 1,
                    z: r.z
                })
            } catch (t) {}
        }
    },

    createDrillImpactEffects(r, t, e) {
        var a = this.getConfig(e),
            {
                x: i,
                y: l,
                z: o
            } = t;
        try {
            if ("multi" === e)
                for (let e = 1; e <= 3; e++) {
                    var s = 6 * e;
                    for (let t = 0; t < s; t++) {
                        var n = t / s * Math.PI * 2,
                            c = .4 * e,
                            d = ["drills:diamond_dust", "drills:netherite_dust", "drills:emerald_dust"],
                            h = d[Math.floor(Math.random() * d.length)];
                        r.spawnParticle(h, {
                            x: i + .5 + Math.cos(n) * c,
                            y: l + .5,
                            z: o + .5 + Math.sin(n) * c
                        })
                    }
                } else
                    for (let e = 1; e <= 2; e++) {
                        var m = 6 * e;
                        for (let t = 0; t < m; t++) {
                            var y = t / m * Math.PI * 2,
                                p = .3 * e;
                            r.spawnParticle(a.particleType, {
                                x: i + .5 + Math.cos(y) * p,
                                y: l + .5,
                                z: o + .5 + Math.sin(y) * p
                            })
                        }
                    }
        } catch (t) {}
    },

    createBlockBreakEffects(e, t, r, a, i) {
        var {
            x: l,
            y: o,
            z: s
        } = t;
        try {
            var n = Math.max(1, Math.floor(2 * a.efficiency)),
                c = i.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand),
                d = this.getDrillType(c);
            if (.5 < Math.random())
                if ("multi" === d) this.createMultiDrillBlockParticles(e, t, n);
                else
                    for (let t = 0; t < n; t++) {
                        var h = .8 * (Math.random() - .5),
                            m = .8 * (Math.random() - .5),
                            y = .8 * (Math.random() - .5);
                        e.spawnParticle(a.particleType, {
                            x: l + .5 + h,
                            y: o + .5 + m,
                            z: s + .5 + y
                        })
                    }
        } catch (t) {
            if (.9 < Math.random()) try {
                e.spawnParticle(a.particleType, {
                    x: l + .5,
                    y: o + .5,
                    z: s + .5
                })
            } catch (t) {}
        }
    },

    createMultiDrillBlockParticles(e, r, t) {
        try {
            var {
                    x: a,
                    y: i,
                    z: l
                } = r,
                o = ["drills:iron_dust", "drills:gold_dust", "drills:copper_dust", "drills:amethyst_dust", "drills:prismarine_dust", "drills:emerald_dust", "drills:skulk_dust", "drills:chorus_dust", "drills:diamond_dust", "drills:netherite_dust"],
                s = o[Math.floor(Math.random() * o.length)],
                n = .8 * (Math.random() - .5),
                c = .8 * (Math.random() - .5),
                d = .8 * (Math.random() - .5);
            e.spawnParticle(s, {
                x: a + .5 + n,
                y: i + .5 + c,
                z: l + .5 + d
            })
        } catch (t) {
            try {
                e.spawnParticle("drills:multi_dust", {
                    x: r.x + .5,
                    y: r.y + .5,
                    z: r.z + .5
                })
            } catch (t) {}
        }
    },

    getTargetBlock(e) {
        try {
            var r = e.getViewDirection(),
                a = e.getHeadLocation();
            for (let t = .5; t <= 4; t += .5) {
                var i = {
                    x: Math.floor(a.x + r.x * t),
                    y: Math.floor(a.y + r.y * t),
                    z: Math.floor(a.z + r.z * t)
                };
                try {
                    var l = e.dimension.getBlock(i);
                    if (l && "minecraft:air" !== l.typeId) return l
                } catch (t) {
                    continue
                }
            }
            return null
        } catch (t) {
            return null
        }
    },

    isUnbreakableBlock(t) {
        return ["minecraft:bedrock", "minecraft:barrier", "minecraft:structure_block", "minecraft:command_block", "minecraft:chain_command_block", "minecraft:repeating_command_block", "minecraft:jigsaw", "minecraft:structure_void"].includes(t)
    },

    playDrillSound(e, r, a) {
        try {
            var i = this.getConfig(a);
            let t = "random.anvil_use";
            switch (r) {
                case "start":
                    t = "random.anvil_use";
                    break;
                case "impact":
                    t = "dig.stone";
                    break;
                case "stop":
                    t = "random.break";
                    break;
                case "overheat":
                    t = "random.fizz"
            }
            var l = i.soundPitch || 1;
            e.dimension.runCommandAsync(`playsound ${t} @a ~ ~ ~ 0.5 ` + l)
        } catch (t) {}
    },

    getDrillHeat(t) {
        try {
            return t.getDynamicProperty("myw:drill_heat") || 0
        } catch (t) {
            return 0
        }
    },

    setDrillHeat(t, e) {
        try {
            var r = Math.max(0, e);
            t.setDynamicProperty("myw:drill_heat", r)
        } catch (t) {}
    },

    getDrillMode(t) {
        try {
            return t.getDynamicProperty("myw:drill_mode") || "standard"
        } catch (t) {
            return "standard"
        }
    },

    setDrillMode(t, e) {
        try {
            t.setDynamicProperty("myw:drill_mode", e)
        } catch (t) {}
    },

    cycleDrillMode(e) {
        var t = ["precision", "standard", "pyramid", "excavation", "tunnel"],
            r = this.getDrillMode(e),
            r = t.indexOf(r),
            r = t[(r + 1) % t.length];
        this.setDrillMode(e, r);
        var t = e.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand),
            t = this.getDrillType(t),
            a = this.getConfig(t),
            i = {
                precision: {
                    name: "§b§lPRECISION MODE",
                    description: "§f1x1 - Drills single block"
                },
                standard: {
                    name: "§a§lSTANDARD MODE",
                    description: `§f${2 * a.maxRadius + 1}x${2 * a.maxRadius + 1} - Medium area`
                },
                pyramid: {
                    name: "§e§lPYRAMID MODE",
                    description: `§f${2 * a.maxRadius + 1}x${2 * a.maxRadius + 1} -> 1x1 - Tapered layers`
                },excavation: {
                    name: "§6§lEXCAVATION MODE",
                    description: `§f${2 * a.maxRadius + 1}x${2 * a.maxRadius + 1}x${2 * a.maxRadius + 1} - Full cube`
                },
                tunnel: {
                    name: "§d§lTUNNEL MODE",
                    description: `§f${2 * a.maxRadius + 1}x${2 * a.maxRadius + 1} Directional - Deep tunnel`
                }
            }[r];
        const l = i.name + " - " + i.description;
        try {
            e.onScreenDisplay.setActionBar(l), system.runTimeout(() => {
                e.onScreenDisplay.setActionBar(l)
            }, 20), system.runTimeout(() => {
                e.onScreenDisplay.setActionBar(l)
            }, 40)
        } catch (t) {
            world.sendMessage(`§b${e.name} §fchanged ${a.color}${a.name} drill§f to ` + i.name)
        }
        this.playDrillSound(e, "start", t), this.createModeChangeEffects(e, r, t)
    },

    createModeChangeEffects(t, e, r) {
        var a = t.location,
            i = t.dimension,
            l = this.getConfig(r);
        try {
            for (let t = 0; t < 8; t++) {
                var o = t / 8 * Math.PI * 2;
                i.spawnParticle(l.particleType, {
                    x: a.x + 1.5 * Math.cos(o),
                    y: a.y + 1,
                    z: a.z + 1.5 * Math.sin(o)
                })
            }
        } catch (t) {}
    },

    updateDrillDisplay(e, r, a, i) {
        try {
            var l = this.getConfig(i),
                o = r / l.maxHeat * 100;
            let t = "§a";
            70 < o ? t = "§c" : 40 < o && (t = "§e");
            var s = this.createProgressBar(o, 10),
                n = `§l${this.getModeDisplay(a, l)} §r| ${t}Heat: ${s} §f${Math.round(o)}%`;
            e.onScreenDisplay.setActionBar(n)
        } catch (t) {}
    },

    getModeDisplay(t, e) {
        return {
            precision: e.color + "PRECISION",
            standard: e.color + "STANDARD",
            pyramid: e.color + "PYRAMID",
            excavation: e.color + "EXCAVATION",
            tunnel: e.color + "TUNNEL"
        }[t] || e.color + "NORMAL"
    },

    createProgressBar(t, e) {
        var r = Math.round(t / 100 * e),
            e = e - r;
        let a = "§a";
        return 70 < t ? a = "§c" : 40 < t && (a = "§e"), a + "█".repeat(r) + "§8" + "░".repeat(e)
    },

    handleOverheat(i, t) {
        try {
            const l = this.getConfig(t);
            this.stopDrilling(i.id), i.onScreenDisplay.setActionBar(`§c§l${l.name} DRILL OVERHEATED - COOLING`), l.fireResistant ? i.onScreenDisplay.setActionBar(`§6§l${l.name} DRILL is heat resistant - Quick cooling`) : i.addEffect("slowness", 40, {
                amplifier: 0,
                showParticles: !1
            });
            let {
                x: e,
                y: r,
                z: a
            } = i.location;
            for (let t = 0; t < 8; t++) system.runTimeout(() => {
                try {
                    i.dimension.spawnParticle(l.particleType, {
                        x: e + 2 * (Math.random() - .5),
                        y: r + 2 * Math.random(),
                        z: a + 2 * (Math.random() - .5)
                    })
                } catch (t) {}
            }, 2 * t);
            this.playDrillSound(i, "overheat", t);
            const o = l.fastCooling ? .1 : .3;
            system.runTimeout(() => {
                this.setDrillHeat(i, l.maxHeat * o)
            }, 60)
        } catch (t) {}
    },

    handleDrillStop(t, e) {
        try {
            var r = this.getConfig(e);
            t.onScreenDisplay.setActionBar("" + r.color + r.name + " drill stopped - Cooling...")
        } catch (t) {}
    },

    consumeDurability(t, e, r) {
        try {
            var a, i, l, o, s;
            t.getGameMode() === GameMode.survival && (a = this.getConfig(r), i = e.getComponent("minecraft:durability")) && (l = i.damage || 0, i.maxDurability <= (o = l + a.durabilityUse) ? (this.handleDrillBreak(t, r), (s = t.getComponent("minecraft:equippable")) && s.setEquipment(EquipmentSlot.Mainhand, void 0)) : i.damage = o)
        } catch (t) {}
    },

    handleDrillBreak(i, t) {
        try {
            const l = this.getConfig(t);
            this.stopDrilling(i.id);
            let {
                x: e,
                y: r,
                z: a
            } = i.location;
            for (let t = 0; t < 15; t++) system.runTimeout(() => {
                try {
                    i.dimension.spawnParticle(l.particleType, {
                        x: e + 3 * (Math.random() - .5),
                        y: r + 2.5 * Math.random(),
                        z: a + 3 * (Math.random() - .5)
                    })
                } catch (t) {}
            }, 3 * t);
            i.onScreenDisplay.setActionBar(`§c§lTHE ${l.name} DRILL HAS BROKEN!`), world.sendMessage(`§b${i.name}§f's ${l.color}${l.name} Drill§f has broken from overuse!`), this.playDrillSound(i, "stop", t)
        } catch (t) {}
    },

    getDropsEnabled(t) {
        try {
            return t.getDynamicProperty("myw:drill_drops_enabled") || !1
        } catch (t) {
            return !1
        }
    },

    setDropsEnabled(t, e) {
        try {
            t.setDynamicProperty("myw:drill_drops_enabled", e)
        } catch (t) {}
    },

    toggleDropSystem(e) {
        try {
            var t = !this.getDropsEnabled(e);
            this.setDropsEnabled(e, t);
            var r = e.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand),
                a = this.getDrillType(r),
                i = this.getConfig(a),
                l = t ? "§aENABLED" : "§cDISABLED";
            const o = "" + i.color + i.name + " Drill Drops: " + l;
            e.onScreenDisplay.setActionBar(o), system.runTimeout(() => {
                e.onScreenDisplay.setActionBar(o)
            }, 20), system.runTimeout(() => {
                e.onScreenDisplay.setActionBar(o)
            }, 40), this.playDrillSound(e, t ? "start" : "stop", a)
        } catch (t) {
            e.onScreenDisplay.setActionBar("§cError toggling drop system")
        }
    },

    createBlockDrops(t, e, r) {
        try {
            var a = e.typeId;
            this.shouldDropBlock(a) && .3 < Math.random() && this.dropBlockItem(t.dimension, r, a)
        } catch (t) {}
    },

    shouldDropBlock(t) {
        return !["minecraft:air", "minecraft:water", "minecraft:lava", "minecraft:flowing_water", "minecraft:flowing_lava", "minecraft:bedrock", "minecraft:barrier"].includes(t)
    },

    dropBlockItem(t, e, r) {
        try {
            var a = new ItemStack(r, 1),
                i = {
                    x: e.x + .5 + .3 * (Math.random() - .5),
                    y: e.y + .5,
                    z: e.z + .5 + .3 * (Math.random() - .5)
                };
            t.spawnItem(a, i)
        } catch (t) {}
    },

    applySpecialDrillAbilities(t, e, r) {
        try {
            var a = this.getConfig(e);
            if (a.aquaticBonus || a.conduitPower) this.applyPrismarineAbilities(t, a);
            if (a.endBonus && "minecraft:the_end" === t.dimension.id) {
                var i = this.getDrillHeat(t),
                    l = Math.max(0, i - a.coolingRate * .5);
                this.setDrillHeat(t, l)
            }
        } catch (t) {}
    },

    applyPrismarineAbilities(t, e) {
        try {
            var r = t.getHeadLocation(),
                a = t.dimension.getBlock({
                    x: Math.floor(r.x),
                    y: Math.floor(r.y),
                    z: Math.floor(r.z)
                });
            if (a && ("minecraft:water" === a.typeId || "minecraft:flowing_water" === a.typeId)) {
                t.addEffect("conduit_power", 60, {
                    amplifier: 0,
                    showParticles: !0
                });
                var i = this.getDrillHeat(t),
                    l = Math.max(0, i - e.coolingRate);
                this.setDrillHeat(t, l), .7 < Math.random() && t.dimension.spawnParticle("minecraft:water_drip_particle", {
                    x: r.x,
                    y: r.y + 1,
                    z: r.z
                })
            }
            var o = t.dimension.id;
            if ("minecraft:overworld" === o) try {
                var s = t.dimension.getBlock(t.location);
                if (s) {
                    var n = s.typeId;
                    (n.includes("ocean") || n.includes("coral") || n.includes("prismarine")) && .95 < Math.random() && t.onScreenDisplay.setActionBar("§3§lPRISMARINE DRILL - Oceanic Speed Boost!")
                }
            } catch (t) {}
        } catch (t) {}
    },

    applyChorusTeleport(t) {
        try {
            var e = t.getViewDirection(),
                r = t.location,
                a = 3 + 2 * Math.random(),
                i = {
                    x: r.x + e.x * a,
                    y: r.y + e.y * a,
                    z: r.z + e.z * a
                };

            for (let e = 0; e < 8; e++) {
                var l = 2 * (Math.random() - .5),
                    o = 2 * Math.random(),
                    s = 2 * (Math.random() - .5);
                t.dimension.spawnParticle("minecraft:dragon_breath_trail", {
                    x: r.x + l,
                    y: r.y + o,
                    z: r.z + s
                })
            }

            t.onScreenDisplay.setActionBar("§5§lCHORUS DRILL - Preparing teleport...");

            system.runTimeout(() => {
                try {
                    var e = t.dimension.getBlock({
                        x: Math.floor(i.x),
                        y: Math.floor(i.y),
                        z: Math.floor(i.z)
                    });

                    if (e && "minecraft:air" === e.typeId) {
                        t.teleport(i, {
                            dimension: t.dimension,
                            rotation: t.getRotation()
                        });

                        for (let e = 0; e < 12; e++) {
                            var r = 2 * (Math.random() - .5),
                                a = 2 * Math.random(),
                                l = 2 * (Math.random() - .5);
                            t.dimension.spawnParticle("minecraft:dragon_breath_trail", {
                                x: i.x + r,
                                y: i.y + a,
                                z: i.z + l
                            })
                        }

                        t.dimension.runCommandAsync("playsound mob.endermen.portal @a ~ ~ ~ 0.6 1.2");
                        t.onScreenDisplay.setActionBar("§5§lCHORUS DRILL - Teleported!")
                    } else {
                        t.onScreenDisplay.setActionBar("§c§lCHORUS DRILL - Cannot teleport to solid block!")
                    }
                } catch (t) {}
            }, 20)
        } catch (t) {}
    }
};

export {
    UniversalDrillSystem
};
