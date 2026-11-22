# guided shop upgrade

Status: Implemented locally on 21 November 2026; ready for deployment after verification.
Updated: 22 November 2026.

## Purpose and confirmed decisions

Add a separate Guided shop tab to Weekwise that takes a household through planning meals and preparing a weekly shop in a clear, linear sequence. Retain the existing Planner and Shopping tabs and their desktop layout. All views must use the same underlying meals and shopping data.

Confirmed by the user:
- Include meal planning in the guided flow.
- Select who is eating each dinner and add daily comments in the Dates stage. Keep both visible and editable in the Meals stage.
- Allow editable portion sizes for each household diner, for example 1 or 0.5 portions.
- Explicit diner selections override the old nursery-note rule. If Sophia is selected, exclude recipes tagged Not Sophia friendly even if the comment says Sophia nursery. Use the old note rule only where attendance has not been confirmed.
- Include all important behaviour changes below.
- Originally deferred; implementation subsequently authorised by the user.

## Step 1: Dates and diners

- Offer 7 days, 14 days and custom shopping dates.
- Show a compact row for every dinner date, with named household diners, total portions and an editable comment.
- Household diners are separate from account users, so children do not need logins.
- Each diner has an editable default portion size, initially 1. Include guests and an Apply to all days action with individual-day overrides.
- Reuse existing day notes rather than creating a second comments field.
- Distinguish attendance not yet confirmed from an explicit selection of nobody eating. Do not automatically fill dinners for zero diners.
- Use usual household diners as defaults for new dates while preserving existing selections.

## Step 2: Meals

- Reuse the existing meal plan and show a compact weekly overview, with diners, portions and comments beside each dinner.
- Support manual selection, Fill empty dinners, swaps, removal followed by refill, leftovers, eating out and no meal needed.
- Keep existing rating, familiarity and variety rules. Apply diner restrictions to all generation paths, including use-up suggestions and refills.
- Allow attendance and comments to be edited here without returning to Dates.
- Scale recipes and sides using the portions for that day. Provide a separate Cook extra portions control for leftovers.
- Do not silently overwrite existing manually chosen portions; offer an explicit recalculation.
- Make breakfast, lunch and snacks available without requiring them to finish the flow.
- Offer Food to use up before generating meals. Treat it as a recommendation input, not an automatic deduction from required shopping quantities.

## Step 3: Extras

- Show the top 20 common extras, most frequently added first, with usage counts.
- Support quick single-item entry and an expandable bulk-entry option.
- Show only occasional essentials that are due. Let users adjust intervals and add or remove items through settings, returning to the same guided step afterward.
- Clearly show what has already been added and prevent accidental duplicate additions.
- Usage counts include both typed extras and common-extra selections, but are recorded only when the list is finalised, not on every click.

## Step 4: Check supplies

- Combine meal ingredients and extras, grouped by grocery category.
- Give each item separate Need to buy, Have enough and Have some states.
- Support partial quantities: if 600 g is required and 200 g is available, buy 400 g.
- Subtract only compatible units. Flag unknown quantities or incompatible units for review rather than guessing.
- Include staple ingredients in this check even when the existing Shopping view normally hides them.
- Keep supply checks separate from added-to-basket or purchased status.
- Scope supply checks to this shop; a full persistent pantry inventory is outside this upgrade.
- When meals, diners, portions or recipes change, recompute requirements and flag affected supply checks. Preserve extras and unrelated checks.

## Step 5: Review and shop

- Show final buy quantities, unresolved items and the chosen shopping method.
- Finish list records that the list has been prepared and updates common-extra history once.
- Count extras still included on the buy list, whether typed or selected from common extras. Exclude removed items and items fully covered by supplies at home.
- Copying, exporting or reopening the list must not increment counts again. Re-finalising an edited list adjusts its existing completion record rather than creating another count.
- Occasional-essential intervals use finalised inclusion history. Label it Last included, not Last purchased.
- Offer the existing Asda helper, copy, print and an interactive checklist. A Tesco-compatible list can be offered without promising automatic basket filling.
- Provide a separate Shopping complete confirmation. Exporting or sending a list does not mean an order was placed.
- Keep the Asda helper hidden on phones, as in the existing requirement.

## Important behaviour changes

1. Separate Have at home from Added to basket throughout shared shopping data and views.
2. Include staples during the supply check.
3. Support partial stock quantities with safe unit handling and explicit review where uncertain.
4. Flag changed requirements after late edits to meals or portions; do not discard unaffected work.
5. Preview date changes before applying them. Preserve manually added extras and existing work.
6. Replace the Asda-send-only counting trigger with Finish list. Keep Shopping complete separate.

The existing Shopping tab must use the same finalisation record as Guided shop. Preserve historical common-extra counts and avoid duplicate counts during migration or when switching between tabs.

## Saving and navigation

- Maintain one shared plan and list, not independent guided copies.
- Autosave the active shop, dates, current step and progress; offer Resume shop.
- Sync with the household where cloud sync is available and clearly indicate local-only saving otherwise.
- Apply confirmed date changes together. Keep attendance and comments attached to their calendar dates; never silently shift meals to another date or delete notes outside the new range.
- Retain extras on date changes and recheck only requirements affected by the change.
- Provide one clear primary next action, Back, and navigation to earlier steps.
- Keep phone controls compact but easy to tap. Ensure fixed navigation does not cover content and avoid squeezing six full-sized tab buttons onto a narrow screen.
- Preserve existing desktop layouts outside the new guided experience.

## Implementation sequence

1. Add backward-compatible household diner and per-date attendance data, including confirmed versus unconfirmed attendance and portion preferences.
2. Extend dinner planning to use per-date diners and portions across normal planning, use-up suggestions and refills.
3. Add saved guided-shop progress, separate supply-check states and a shared finalisation record. Migrate existing history without duplicate counting.
4. Reuse shopping quantity calculations and add safe partial-stock subtraction and affected-item rechecks.
5. Build the five guided stages using shared application data, then connect existing Planner and Shopping actions to the same behaviour.
6. Test the complete workflow on phone and desktop before release.

Inspect the current code again before implementation because other app work will happen first. Expected areas include the shared domain types and shopping calculations, dinner planner, state hydration and cloud persistence, common-extra history, and the main app navigation and views. No database migration is assumed until the current persistence model has been checked.

## Acceptance checks

- Different diners and portion sizes correctly scale meals and sides by date.
- Confirmed Sophia attendance overrides nursery comments; legacy unconfirmed dates retain their fallback behaviour.
- Zero-diner and deliberately empty dinners are not auto-filled.
- Existing planning rules, ratings and favourites still behave correctly.
- Existing saved households load without data loss.
- Refreshing, changing dates and switching tabs retain extras, notes, attendance and progress appropriately.
- Partial stock subtraction handles compatible units and exposes uncertain quantities.
- Late meal or portion edits recheck affected items without resetting unrelated work.
- Repeated finalisation, export and Asda helper actions do not double-count common extras.
- Occasional-essential settings and history remain editable and accurately labelled.
- A first-time user can complete the entire flow on a phone or desktop without overlapping controls or hidden required actions.

## Out of scope

- Tesco basket automation or AI shopping agents.
- A full persistent pantry inventory.
- Replacing the existing Planner or Shopping tabs.

## Implementation notes

- Guided shop, Planner and Shopping share household snapshot data. No SQL migration is required.
- Existing recipes and manually chosen portions are retained. Diner-controlled meals scale recipes and sides; existing meals have an explicit Use diner portions action.
- Supply checks and basket acknowledgements are separate and scoped to the active shop. Changed requirements invalidate affected checks only.
- The old range-based finalisation identity is adopted during migration; subsequent date changes keep that identity. New shop creates a new identity.
- Finish list is the only inclusion-history trigger. Sending, copying, printing and marking basket items do not increment counts.
- On phones the five primary tabs are Guided shop, Planner, Recipes, Shopping and Settings. Add recipe remains available from Recipes; desktop retains its direct navigation entry.
- The regression runner is `npm run test:guided-shop`; existing planner, common-extra and shopping-improvement suites remain applicable.

Provide the exact commands needed to commit, push and deploy changes. Do not commit, push or deploy automatically without authorisation.

## Desktop layout update

- Dates and diners uses a Monday-first mini-month calendar with two-click range selection, month navigation, a persistent today marker, and 7/14-day presets. Apply dates retains the existing date-change safeguards; pending dates must be applied or cancelled before continuing.
- A compact attendance schedule sits beside the calendar. Per-day diner checkboxes, comments and totals stay visible; portion overrides, guests and household settings expand on demand.
- Meals uses a left-hand planning panel and a right-hand list of shopping days. The left panel includes use-up matches and the same engine/options as Planner: date range, fill or replace, preview, another mix, removal/refill, balance/warnings and apply.
- Meal handles support dragging from suggestions or Unscheduled into days, between days, and back to Unscheduled. The handles also open a day chooser for keyboard and touch use.
- Moving between two occupied days swaps meals after validating both destinations. New suggestions and multi-meal replacements park displaced dinners, rather than deleting them. Diner-controlled portions and sides rescale; manual overrides are retained.
- After placing an individual preview suggestion, remaining preview meals are saved in Unscheduled. Unscheduled meals persist with the household snapshot, do not contribute shopping ingredients, and carry into the next shop.
- Existing Planner and Shopping layouts, filters, extras and Asda behaviour are unchanged. No new database migration or dependency is required.
