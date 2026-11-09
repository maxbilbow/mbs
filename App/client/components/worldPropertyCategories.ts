export const PROPERTY_CATEGORIES = [
  "World and gameplay",
  "Players and access",
  "Networking",
  "Performance",
  "Packs and scripting",
  "Diagnostics",
  "Other",
] as const;

export function propertyCategory(
  key: string,
): (typeof PROPERTY_CATEGORIES)[number] {
  if (
    /^(content-log-|diagnostics-|sentry-|emit-server-telemetry|enable-profiler$|enable-editor-network-metrics$|enable-packet-limit-)/.test(
      key,
    )
  )
    return "Diagnostics";
  if (
    /^(level-|gamemode$|force-gamemode$|difficulty$|allow-cheats$|server-authoritative-|player-position-|player-movement-|disable-player-interaction|disable-persona|disable-custom-skins|disable-client-vibrant-visuals$|convert-world-to-editor-project$)/.test(
      key,
    )
  )
    return "World and gameplay";
  if (
    /^(max-players$|online-mode$|allow-list$|allow-player-joining$|default-player-permission-level$|player-idle-timeout$|chat-restriction$)/.test(
      key,
    )
  )
    return "Players and access";
  if (
    /^(server-name$|server-port|server-ip$|server-udp-|transport$|enable-lan-visibility$|compression-|client-side-chunk-generation-enabled$|disable-client-side-chunk-generation$)/.test(
      key,
    )
  )
    return "Networking";
  if (
    /^(view-distance$|tick-distance$|max-threads$|server-build-radius-ratio$|.*ticking-area-|block-network-ids-|.*chunk-|.*throttle)/.test(
      key,
    )
  )
    return "Performance";
  if (
    /^(texturepack-|texture-pack-|script-|experiment|enable-experiment|allow-content-|allow-outbound-script-|allow-inbound-script-|force-inbound-debug-port$)/.test(
      key,
    )
  )
    return "Packs and scripting";
  return "Other";
}
