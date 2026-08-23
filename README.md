# Weekwise Meal Planner

A responsive meal-planning web app that stores recipes, plans meals week by week, scales ingredient quantities by people eating, and generates a grouped grocery checklist.

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## What Is Implemented

- Weekly planner with breakfast, lunch, dinner, and snack slots.
- Per-meal people counts for quantity scaling.
- Recipe library with search, tags, favorites, duplicate, edit, and delete.
- Private meal-picture storage with recipe-card and planner-detail previews.
- Add recipe by manual entry, pasted text, public recipe URL, or recipe-book photo OCR review.
- URL imports use structured recipe metadata first, then only likely recipe sections instead of broad webpage text.
- Required import review screen before saving recipes.
- Shopping list generation with category grouping, checked state, manual items, hidden generated items, and copy/print actions.
- Canonical ingredient matching combines common aliases such as red onion/onions into one grocery line, with review prompts for ambiguous merges.
- Practical unit combining for common mass, volume, spoon, pack, can, clove, slice, and item units.
- Simple staples list that hides ingredients usually kept at home.
- Local persistence in the browser with cloud backup before remote loads.
- Supabase magic-link login with automatic snapshot sync across devices.
- Multiple switchable households with owner/editor/viewer invitations.
- Shared recipe catalogue plus household-only recipes.
- Personal meal reactions and anonymous cross-household popularity totals that guide auto-planning.
- Install-friendly web app manifest and icons for phone home screens.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Run `supabase/shared-household.sql` in the Supabase SQL editor.
4. Run `supabase/recipe-images.sql` in the Supabase SQL editor.
5. Run `supabase/multi-household.sql` in the Supabase SQL editor.
6. Add these values to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OCR_SPACE_API_KEY=optional-free-ocr-fallback-key
```

The app saves one fast snapshot per household in `household_app_snapshots`. On first sign-in after the multi-household migration, existing `household_snapshots` data and shared-household invitations are copied into the new structure automatically. The old tables remain in place as a rollback path. Before a cloud household overwrites local data, the previous local state is backed up in browser storage.

Household owners can create another household, invite editors or viewers by email, and switch households in Settings. Invited people use their own magic-link login. Supabase persists that session, so they do not normally need a new email link every time the app reopens.

Bundled Weekwise recipes are available in every household. Recipes that existed before this upgrade are shared on the first upgraded load so the current library carries across. A new recipe saved as **All households** is published to `shared_recipe_catalog`; **This household** keeps it in the active household only. Ratings are stored per signed-in user in `recipe_reactions`. Other households see totals, never who submitted a rating.

Uploaded meal pictures are kept in the private `recipe-images` Supabase Storage bucket rather than embedded in the snapshot. This prevents browser storage limits as the recipe library grows. Existing embedded recipe photos are moved into the bucket automatically after the user signs in. Recipe URLs can continue to use the source page's image URL without uploading a copy.

## Deploy To Vercel Hobby

1. Push this project to GitHub.
2. Create a Vercel project from the repository.
3. Set the framework preset to Next.js.
4. Add the environment variables above in Vercel project settings.
5. Deploy, then open the Vercel URL on your phone and laptop.
6. Sign in with the same email on both devices to sync meal plans and recipes.

Vercel is the recommended free host for this app because it runs Next.js and API routes smoothly without the cold-start behavior of free always-idle web services.

## Free Photo OCR

Photo import is free-first and privacy-conscious:

- The default "Read photo privately" button uses Tesseract.js in the browser, so the recipe photo does not leave the device.
- The image can be rotated and cropped to the whole recipe, ingredients, or method before OCR.
- Raw OCR text can be edited, re-parsed, or moved line-by-line into ingredients or method during review.
- "Try free online OCR" is optional and sends the compressed selected crop to OCR.Space through the app server. Add `OCR_SPACE_API_KEY` to enable it.
- No recipe is saved until the review screen is accepted.

## Private Asda Helper Extension

The repo includes a private Chrome/Edge extension for semi-automated Asda shopping. It imports the current shopping date range from the Shopping tab, opens saved Asda product links or search pages, remembers chosen product pages, and syncs `opened`, `added`, and `unavailable` statuses back to Weekwise.

Build it from the project root:

```bash
npm run build:extension
```

Then load it:

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select `extension/asda-helper`.
5. In Weekwise, open Shopping and click Send to Asda Helper.

The extension does not store Asda passwords and does not automate checkout, delivery slots, payment, or bot checks. It is designed as a guided helper: you stay logged in to Asda normally, confirm products yourself, and keep final checkout manual.

If your deployed Vercel URL changes, edit `extension/asda-helper/manifest.json` and replace `https://weekly-meal-planning-alpha.vercel.app/*` with your live app URL, then reload the extension.

The normalized meal-planner tables remain available for a later move from household snapshots to row-level meal and shopping sync.
