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
- Add recipe by manual entry, pasted text, public recipe URL, or recipe-book photo OCR review.
- Required import review screen before saving recipes.
- Shopping list generation with category grouping, checked state, manual items, hidden generated items, and copy/print actions.
- Practical unit combining for common mass, volume, spoon, pack, can, clove, slice, and item units.
- Simple staples list that hides ingredients usually kept at home.
- Local persistence in the browser with cloud backup before remote loads.
- Supabase magic-link login with automatic snapshot sync across devices.
- Install-friendly web app manifest and icons for phone home screens.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Add these values to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OCR_SPACE_API_KEY=optional-free-ocr-fallback-key
```

The MVP saves the app state to `household_snapshots` for quick cross-device sync. After sign-in, the app loads the latest cloud snapshot and automatically saves changes after a short pause. Before a cloud snapshot overwrites local data, the previous local state is backed up in browser storage.

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
- The image is resized, converted to high-contrast grayscale, and then OCR text is parsed into the existing recipe review screen.
- "Try free online OCR" is optional and sends the compressed photo to OCR.Space through the app server. Add `OCR_SPACE_API_KEY` to enable it.
- No recipe is saved until the review screen is accepted.

The normalized meal-planner tables are included for a future row-level sync migration.
