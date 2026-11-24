import type { HouseholdDiner } from "./domain";

export const dinerPalette = ["#26735b", "#2f67ad", "#a34575", "#a65b19", "#7253a3", "#247d85", "#ab4545", "#67782c"];
const isColor = (value?: string): value is string => /^#[0-9a-f]{6}$/i.test(value ?? "");

export function dinerColor(diner: HouseholdDiner, index = 0) {
  return isColor(diner.color) ? diner.color : dinerPalette[index % dinerPalette.length];
}

export function nextDinerColor(diners: HouseholdDiner[]) {
  const used = new Set(diners.map((diner, index) => dinerColor(diner, index).toLowerCase()));
  return dinerPalette.find(color => !used.has(color)) ?? dinerPalette[diners.length % dinerPalette.length];
}

export function normalizeDinerColors(diners: HouseholdDiner[]) {
  const assigned = diners.filter(diner => isColor(diner.color));
  return diners.map(diner => {
    if (isColor(diner.color)) return diner;
    const updated = { ...diner, color: nextDinerColor(assigned) };
    assigned.push(updated);
    return updated;
  });
}

export function dinerTextColor(color: string) {
  const rgb = (isColor(color) ? color : dinerPalette[0]).slice(1).match(/.{2}/g)!.map(hex => {
    const channel = parseInt(hex, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
