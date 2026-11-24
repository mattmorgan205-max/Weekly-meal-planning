import type { HouseholdDiner } from "@/lib/domain";
import { dinerColor, dinerTextColor } from "@/lib/diner-colors";

export function DinerBadge({ diner, index }: { diner: HouseholdDiner; index: number }) {
  const color = dinerColor(diner, index);
  return <span className="diner-badge" style={{ backgroundColor: color, color: dinerTextColor(color) }} title={diner.name || "Unnamed diner"}>{diner.name || "Unnamed diner"}</span>;
}

export function DinerSwatch({ diner, index }: { diner: HouseholdDiner; index: number }) {
  return <span className="diner-swatch" aria-hidden="true" style={{ backgroundColor: dinerColor(diner, index) }} />;
}
