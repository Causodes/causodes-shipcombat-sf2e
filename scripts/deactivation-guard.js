const MODULE_ID = "causodes-shipcombat-sf2e";
const CORE_MODULE_ID = "causodes-shipcombat-core";

const ACTOR_TYPES = new Set([
  `${MODULE_ID}.ship`,
  `${MODULE_ID}.npcShip`,
  `${MODULE_ID}.shipOrdnance`,
]);
const ITEM_TYPE = `${MODULE_ID}.component`;

/**
 * Decode the value stored by core.moduleConfiguration.
 *
 * Foundry has represented this setting as both an object and a JSON string
 * across releases. Keeping this decoder deliberately small makes the guard
 * work with either representation and easy to exercise outside Foundry.
 */
export function decodeModuleConfiguration(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

/** Return true/false when the configuration is understood, otherwise null. */
export function moduleIsActive(configuration, moduleId) {
  const decoded = decodeModuleConfiguration(configuration);
  if (Array.isArray(decoded)) return decoded.includes(moduleId);
  if (!decoded || typeof decoded !== "object") return null;
  return Object.hasOwn(decoded, moduleId) ? Boolean(decoded[moduleId]) : false;
}

export function countModuleDocuments({ actors, items } = {}) {
  let actorCount = 0;
  let itemCount = 0;

  for (const actor of actors ?? []) {
    if (ACTOR_TYPES.has(actor?.type)) actorCount += 1;
    for (const item of actor?.items ?? []) {
      if (item?.type === ITEM_TYPE) itemCount += 1;
    }
  }
  for (const item of items ?? []) {
    if (item?.type === ITEM_TYPE) itemCount += 1;
  }

  return { actorCount, itemCount, total: actorCount + itemCount };
}

function isModuleConfigurationSetting(setting) {
  const key = setting?.key ?? setting?.id;
  return key === "core.moduleConfiguration";
}

/**
 * Stop the normal Manage Modules workflow from persisting an unloadable world.
 *
 * SF2E's ActorProxyPF2e/ItemProxyPF2e throw on unknown module subtypes instead
 * of allowing Foundry to hide invalid documents. Once one of our documents is
 * stored, both this adapter and Core must therefore remain active until those
 * documents have been removed.
 */
export function preventUnsafeDeactivation(setting, changed) {
  if (!isModuleConfigurationSetting(setting)) return;

  const configuration = changed?.value;
  const adapterActive = moduleIsActive(configuration, MODULE_ID);
  const coreActive = moduleIsActive(configuration, CORE_MODULE_ID);

  // Unknown setting shapes must not prevent unrelated settings updates.
  if (adapterActive === null || coreActive === null) return;
  if (adapterActive && coreActive) return;

  const counts = countModuleDocuments({
    actors: globalThis.game?.actors,
    items: globalThis.game?.items,
  });
  if (!counts.total) return;

  const actorLabel = `${counts.actorCount} ship actor${counts.actorCount === 1 ? "" : "s"}`;
  const itemLabel = `${counts.itemCount} component item${counts.itemCount === 1 ? "" : "s"}`;
  globalThis.ui?.notifications?.error(
    `Causodes Ship Combat cannot be disabled while this world contains ${actorLabel} and ${itemLabel}. `
      + "SF2E cannot load module actor/item subtypes after their provider is disabled. "
      + "Delete those documents before disabling Ship Combat.",
    { permanent: true }
  );
  return false;
}

export function registerDeactivationGuard() {
  globalThis.Hooks?.on("preUpdateSetting", preventUnsafeDeactivation);
}
