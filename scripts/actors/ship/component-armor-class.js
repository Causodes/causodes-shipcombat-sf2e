export function computeComponentArmorClass(
  items,
  componentType = "causodes-shipcombat-sf2e.component",
) {
  return [...(items ?? [])].reduce((total, item) => {
    if (item.type !== componentType || item.system?.equipped === false) return total;
    if (item.system?.slot !== "armour" && item.system?.slot !== "engine") return total;
    return total + Number(item.system?.armourClassContribution ?? 0);
  }, 0);
}
