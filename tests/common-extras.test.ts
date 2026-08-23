import assert from "node:assert/strict";
import test from "node:test";

import {
  commonExtraItemsForProfile,
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
  assert.equal(items.length, 15);
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
