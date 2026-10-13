import assert from "node:assert/strict";
import test from "node:test";

import {
  commonExtraItemsForProfile,
  commonExtraUsageForProfile,
  recordCompletedShoppingList,
  occasionalItemsForProfile,
  dueOccasionalItems,
  updateOccasionalItems,
  recordManualExtraUsage,
  seedState,
  updateCommonExtraProfileChoices
} from "../lib/domain.js";

test("ranks the most frequently added extras ahead of defaults", () => {
  let settings = seedState().settings;

  settings = recordManualExtraUsage(settings, "matt@example.com", ["Olives"], "2026-08-20T10:00:00.000Z");
  settings = recordManualExtraUsage(settings, "matt@example.com", ["Milk"], "2026-08-20T11:00:00.000Z");
  settings = recordManualExtraUsage(settings, "matt@example.com", ["Olives"], "2026-08-21T10:00:00.000Z");
  settings = recordManualExtraUsage(settings, "matt@example.com", ["Olives"], "2026-08-22T10:00:00.000Z");

  const items = commonExtraItemsForProfile(settings, "matt@example.com");

  assert.equal(items[0], "Olives");
  assert.equal(items[1], "Milk");
  assert.equal(items.length, 20);
});

test("completion counts typed and button extras once per shop, including resends with new items", () => {
  let settings = seedState().settings;
  const first = [
    { name: "Milk", manual: true },
    { name: " milk ", manual: true },
    { name: "Bread", manual: true },
    { name: "Carrots", manual: false }
  ];
  const at = "2026-10-13T12:00:00.000Z";
  settings = recordCompletedShoppingList(settings, "matt", "2026-10-12:2026-10-18", first, at);
  assert.equal(commonExtraUsageForProfile(settings, "matt", "Milk")?.count, 1);
  assert.equal(commonExtraUsageForProfile(settings, "matt", "Bread")?.count, 1);
  assert.equal(commonExtraUsageForProfile(settings, "matt", "Carrots"), undefined);
  assert.equal(recordCompletedShoppingList(settings, "matt", "2026-10-12:2026-10-18", first), settings);
  settings = recordCompletedShoppingList(settings, "matt", "2026-10-12:2026-10-18", [...first, { name: "Olives", manual: true }], at);
  assert.equal(commonExtraUsageForProfile(settings, "matt", "Milk")?.count, 1);
  assert.equal(commonExtraUsageForProfile(settings, "matt", "Olives")?.count, 1);
  settings = recordCompletedShoppingList(settings, "matt", "2026-10-19:2026-10-25", first, "2026-10-20T12:00:00Z");
  assert.equal(commonExtraUsageForProfile(settings, "matt", "Milk")?.count, 2);
  assert.equal(commonExtraUsageForProfile(settings, "hannah", "Milk"), undefined);
});

test("top 20 reorders by frequency, even when a low-frequency item was manually pinned", () => {
  let settings = seedState().settings;
  settings = updateCommonExtraProfileChoices(settings, "matt", [...commonExtraItemsForProfile(settings, "matt"), "Pinned"]);
  const names = Array.from({ length: 25 }, (_, i) => `Extra ${i}`);
  settings = recordCompletedShoppingList(settings, "matt", "first", names.map(name => ({ name, manual: true })));
  settings = recordCompletedShoppingList(settings, "matt", "second", [{ name: "Extra 24", manual: true }]);
  const top = commonExtraItemsForProfile(settings, "matt");
  assert.equal(top.length, 20);
  assert.equal(top[0], "Extra 24");
  assert.equal(top.includes("Pinned"), false);
  const counts = top.map(name => commonExtraUsageForProfile(settings, "matt", name)?.count ?? 0);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});

test("occasional essentials become due on the interval boundary, and a resend does not postpone them", () => {
  let settings = seedState().settings;
  const items = [{ name: "Nappy wipes", manual: true }, { name: "Bin bags", manual: false }];
  settings = recordCompletedShoppingList(settings, "matt", "first", items, "2026-10-13T23:30:00Z");
  assert.equal(dueOccasionalItems(settings, "matt", "2026-10-26").some(i => i.name === "Nappy wipes"), false);
  assert.equal(dueOccasionalItems(settings, "matt", "2026-10-27").some(i => i.name === "Nappy wipes"), true);
  settings = recordCompletedShoppingList(settings, "matt", "first", items, "2026-10-25T10:00:00Z");
  assert.equal(occasionalItemsForProfile(settings, "matt").find(i => i.name === "Nappy wipes")?.lastAddedAt, "2026-10-13T23:30:00Z");
  assert.equal(dueOccasionalItems(settings, "matt", "2026-10-27").some(i => i.name === "Bin bags"), false);
  settings = recordCompletedShoppingList(settings, "matt", "next", items, "2026-10-27T10:00:00Z");
  assert.equal(dueOccasionalItems(settings, "matt", "2026-10-27").some(i => i.name === "Nappy wipes"), false);
});

test("reminder settings retain history, allow edits/additions/removal and stay personal", () => {
  let settings = seedState().settings;
  settings = recordManualExtraUsage(settings, "matt", ["Bin bags"], "2026-10-01T10:00:00Z");
  const bags = occasionalItemsForProfile(settings, "matt").find(i => i.name === "Bin bags")!;
  assert.equal(bags.lastAddedAt, "2026-10-01T10:00:00Z");
  settings = updateOccasionalItems(settings, "matt", [{ ...bags, intervalDays: 7 }, { id: "shampoo", name: "Shampoo", intervalDays: 60 }]);
  assert.deepEqual(dueOccasionalItems(settings, "matt", "2026-10-08").map(i => i.name).sort(), ["Bin bags", "Shampoo"]);
  assert.equal(occasionalItemsForProfile(settings, "hannah").some(i => i.name === "Nappy wipes"), true);
  settings = updateOccasionalItems(settings, "matt", []);
  assert.deepEqual(dueOccasionalItems(settings, "matt"), []);
  const restored = JSON.parse(JSON.stringify(settings));
  assert.deepEqual(occasionalItemsForProfile(restored, "matt"), []);
});

test("keeps common-extra rankings separate for each signed-in account", () => {
  let settings = seedState().settings;

  settings = recordManualExtraUsage(settings, "matt@example.com", ["Flatbreads"], "2026-08-21T10:00:00.000Z");
  settings = recordManualExtraUsage(settings, "hannah@example.com", ["Nappies"], "2026-08-22T10:00:00.000Z");

  assert.equal(commonExtraItemsForProfile(settings, "matt@example.com")[0], "Flatbreads");
  assert.equal(commonExtraItemsForProfile(settings, "hannah@example.com")[0], "Nappies");
  assert.equal(commonExtraItemsForProfile(settings, "local")[0], "Milk");
});

test("manual additions stay pinned and removed items stay hidden", () => {
  let settings = seedState().settings;
  const original = commonExtraItemsForProfile(settings, "matt@example.com");
  const edited = [...original.filter((item) => item !== "Milk"), "Oat milk"];

  settings = updateCommonExtraProfileChoices(settings, "matt@example.com", edited);
  settings = recordManualExtraUsage(settings, "matt@example.com", ["Milk"], "2026-08-22T10:00:00.000Z");

  const items = commonExtraItemsForProfile(settings, "matt@example.com");
  assert.equal(items[0], "Oat milk");
  assert.equal(items.includes("Milk"), false);

  settings = updateCommonExtraProfileChoices(settings, "matt@example.com", [...items, "Milk"]);
  assert.equal(commonExtraItemsForProfile(settings, "matt@example.com").includes("Milk"), true);
});
