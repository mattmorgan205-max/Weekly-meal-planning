"use client";

import {
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  CircleOff,
  Clock,
  Clipboard,
  Copy,
  Download,
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  Link,
  ListChecks,
  Loader2,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
  X
} from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  createId,
  draftToRecipe,
  draftFromOcrText,
  formatDateKey,
  generateShoppingList,
  groceryCategories,
  inferCategory,
  labelMealSlot,
  mealSlots,
  mergeAutomaticRecipeTags,
  normalizeUnit,
  parseIngredientLine,
  parseRecipeText,
  parseTags,
  recipeToDraft,
  seedState,
  startOfWeek,
  totalRecipeMinutes,
  weekDates,
  type AppState,
  type GroceryCategory,
  type ImportDraft,
  type Ingredient,
  type MealSlot,
  type Recipe,
  type ShoppingListItem
} from "@/lib/domain";
import { getSupabaseClient } from "@/lib/supabase-client";

type View = "planner" | "recipes" | "add" | "shopping" | "settings";
type ImportMode = "manual" | "paste" | "url" | "photo";
type SyncStatus = "local" | "loading" | "saving" | "saved" | "offline" | "error";

const storageKey = "weekwise-meal-planner-v1";
const backupStorageKey = "weekwise-meal-planner-cloud-backup-v1";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short"
});

function hydrateState(value: unknown): AppState {
  const parsed = (value ?? {}) as Partial<AppState>;
  const seeded = seedState();

  return {
    ...seeded,
    ...parsed,
    settings: { ...seeded.settings, ...parsed.settings },
    shoppingChecks: parsed.shoppingChecks ?? {},
    hiddenShoppingItems: parsed.hiddenShoppingItems ?? {},
    manualShoppingItems: parsed.manualShoppingItems ?? []
  };
}

function loadState(): AppState {
  if (typeof window === "undefined") return seedState();
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return seedState();
    return hydrateState(JSON.parse(stored));
  } catch {
    return seedState();
  }
}

function emptyDraft(): ImportDraft {
  return {
    id: createId("draft"),
    title: "",
    servings: 4,
    tags: [],
    ingredients: [
      {
        id: createId("ing"),
        name: "",
        quantity: undefined,
        unit: "",
        category: "Other",
        confidence: "medium"
      }
    ],
    instructions: [""],
    warnings: [],
    importedFrom: "manual"
  };
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function parseNumberInput(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = src;
  });
}

async function prepareRecipePhoto(file: File, maxSide = 1500, quality = 0.72) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Image processing is not available in this browser.");

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const contrast = 1.18;
    const midpoint = 128;

    for (let index = 0; index < imageData.data.length; index += 4) {
      const gray = imageData.data[index] * 0.299 + imageData.data[index + 1] * 0.587 + imageData.data[index + 2] * 0.114;
      const enhanced = Math.max(0, Math.min(255, (gray - midpoint) * contrast + midpoint));
      imageData.data[index] = enhanced;
      imageData.data[index + 1] = enhanced;
      imageData.data[index + 2] = enhanced;
    }

    context.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => (nextBlob ? resolve(nextBlob) : reject(new Error("Photo compression failed."))), "image/jpeg", quality);
    });
    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });

    return {
      file: compressedFile,
      dataUrl: await fileToDataUrl(compressedFile)
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function syncStatusCopy(status: SyncStatus) {
  const labels: Record<SyncStatus, string> = {
    local: "Local only",
    loading: "Loading",
    saving: "Saving",
    saved: "Saved",
    offline: "Offline",
    error: "Sync error"
  };

  return labels[status];
}

export default function Home() {
  const [state, setState] = useState<AppState>(() => seedState());
  const [hasHydratedLocalState, setHasHydratedLocalState] = useState(false);
  const [activeView, setActiveView] = useState<View>("planner");
  const [weekStart, setWeekStart] = useState(() => formatDateKey(startOfWeek(new Date())));
  const [recipeSearch, setRecipeSearch] = useState("");
  const [mealPicker, setMealPicker] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [mealPickerQuery, setMealPickerQuery] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("manual");
  const [importText, setImportText] = useState(samplePasteText);
  const [importUrl, setImportUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [compressedPhotoFile, setCompressedPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [draft, setDraft] = useState<ImportDraft>(() => emptyDraft());
  const [tagInput, setTagInput] = useState("");
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [manualItemName, setManualItemName] = useState("");
  const [manualItemQuantity, setManualItemQuantity] = useState("");
  const [manualItemCategory, setManualItemCategory] = useState<GroceryCategory>("Other");
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const stateRef = useRef(state);
  const cloudUserIdRef = useRef<string | null>(null);
  const cloudLoadedRef = useRef(false);
  const suppressNextCloudSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedJsonRef = useRef("");

  useEffect(() => {
    const hydratedState = loadState();
    stateRef.current = hydratedState;
    setState(hydratedState);
    setHasHydratedLocalState(true);
  }, []);

  const visibleSlots = useMemo(
    () => mealSlots.filter((slot) => !state.settings.hiddenSlots.includes(slot)),
    [state.settings.hiddenSlots]
  );
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const shoppingList = useMemo(
    () =>
      generateShoppingList(
        state.recipes,
        state.plannedMeals.filter((meal) => days.some((date) => formatDateKey(date) === meal.date)),
        state.settings,
        state.shoppingChecks,
        state.hiddenShoppingItems,
        state.manualShoppingItems
      ),
    [days, state]
  );
  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.toLowerCase().trim();
    return state.recipes
      .filter((recipe) => {
        if (!query) return true;
        return (
          recipe.title.toLowerCase().includes(query) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title));
  }, [recipeSearch, state.recipes]);
  const recipeFrequencies = useMemo(() => {
    return state.plannedMeals.reduce<Record<string, number>>((counts, meal) => {
      counts[meal.recipeId] = (counts[meal.recipeId] ?? 0) + 1;
      return counts;
    }, {});
  }, [state.plannedMeals]);
  const mealPickerRecipes = useMemo(() => {
    const query = mealPickerQuery.toLowerCase().trim();
    return state.recipes
      .filter((recipe) => {
        if (!query) return true;
        return (
          recipe.title.toLowerCase().includes(query) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => {
        const frequencySort = (recipeFrequencies[b.id] ?? 0) - (recipeFrequencies[a.id] ?? 0);
        return frequencySort || Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title);
      });
  }, [mealPickerQuery, recipeFrequencies, state.recipes]);
  const selectedRecipe = selectedRecipeId ? state.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null : null;
  const plannedRecipeIds = new Set(state.plannedMeals.map((meal) => meal.recipeId));
  const weekMeals = state.plannedMeals.filter((meal) => days.some((date) => formatDateKey(date) === meal.date));
  const generatedCount = shoppingList.filter((item) => !item.manual).length;
  const checkedCount = shoppingList.filter((item) => item.checked).length;
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  useEffect(() => {
    stateRef.current = state;
    if (!hasHydratedLocalState) return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [hasHydratedLocalState, state]);

  useEffect(() => {
    if (!hasHydratedLocalState) return;
    const client = getSupabaseClient();
    if (!client) {
      setSyncStatus("local");
      return;
    }

    client.auth.getUser().then(({ data }) => {
      const user = data.user;
      setCloudUser(user?.email ?? null);
      cloudUserIdRef.current = user?.id ?? null;
      if (user) {
        void loadCloudSnapshotForUser(user.id);
      } else {
        cloudLoadedRef.current = false;
        setSyncStatus("local");
      }
    });

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setCloudUser(user?.email ?? null);
      cloudUserIdRef.current = user?.id ?? null;
      if (user) {
        void loadCloudSnapshotForUser(user.id);
      } else {
        cloudLoadedRef.current = false;
        setSyncStatus("local");
      }
    });

    return () => subscription.unsubscribe();
  }, [hasHydratedLocalState]);

  useEffect(() => {
    if (!hasHydratedLocalState) return;
    if (!supabaseConfigured || !cloudUserIdRef.current) {
      setSyncStatus("local");
      return;
    }

    if (!cloudLoadedRef.current) return;

    if (suppressNextCloudSaveRef.current) {
      suppressNextCloudSaveRef.current = false;
      return;
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    const json = JSON.stringify(state);
    if (json === lastSavedJsonRef.current) {
      setSyncStatus("saved");
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      void saveCloudSnapshotForUser(cloudUserIdRef.current!, stateRef.current);
    }, 900);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hasHydratedLocalState, state, supabaseConfigured]);

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => updater(current));
  }

  function applyDraft(nextDraft: ImportDraft) {
    setDraft(nextDraft);
    setTagInput(nextDraft.tags.join(", "));
  }

  function addPlannedMeal(date: string, slot: MealSlot, recipeId: string) {
    if (!recipeId) return;

    updateState((current) => ({
      ...current,
      plannedMeals: [
        ...current.plannedMeals,
        {
          id: createId("meal"),
          date,
          slot,
          recipeId,
          peopleCount: current.settings.defaultPeople
        }
      ],
      hiddenShoppingItems: {}
    }));
    setMealPicker(null);
    setMealPickerQuery("");
  }

  function movePlannedMeal(id: string, date: string, slot: MealSlot) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.map((meal) => (meal.id === id ? { ...meal, date, slot } : meal)),
      hiddenShoppingItems: {}
    }));
  }

  function updatePlannedMeal(id: string, patch: Partial<Pick<(typeof state.plannedMeals)[number], "peopleCount" | "notes" | "producesLeftovers" | "leftoverTargetDate">>) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.map((meal) => (meal.id === id ? { ...meal, ...patch } : meal)),
      hiddenShoppingItems: {}
    }));
  }

  function removePlannedMeal(id: string) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.filter((meal) => meal.id !== id),
      hiddenShoppingItems: {}
    }));
  }

  function addLeftoverLunch(meal: (typeof state.plannedMeals)[number]) {
    const nextDay = formatDateKey(addDays(new Date(`${meal.date}T12:00:00`), 1));
    updateState((current) => ({
      ...current,
      plannedMeals: [
        ...current.plannedMeals,
        {
          id: createId("meal"),
          date: nextDay,
          slot: "lunch",
          recipeId: meal.recipeId,
          peopleCount: Math.max(1, Math.floor(meal.peopleCount / 2)),
          notes: "Leftovers"
        }
      ],
      hiddenShoppingItems: {}
    }));
  }

  function moveWeek(direction: -1 | 1) {
    setWeekStart((current) => formatDateKey(addDays(new Date(`${current}T12:00:00`), direction * 7)));
  }

  function duplicateWeekToNext() {
    const nextWeek = addDays(new Date(`${weekStart}T12:00:00`), 7);
    const newMeals = weekMeals.map((meal) => ({
      ...meal,
      id: createId("meal"),
      date: formatDateKey(addDays(nextWeek, days.findIndex((day) => formatDateKey(day) === meal.date)))
    }));

    updateState((current) => ({
      ...current,
      plannedMeals: [...current.plannedMeals, ...newMeals],
      hiddenShoppingItems: {}
    }));
    setWeekStart(formatDateKey(nextWeek));
  }

  function clearWeek() {
    const dayKeys = new Set(days.map(formatDateKey));
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.filter((meal) => !dayKeys.has(meal.date)),
      shoppingChecks: {},
      hiddenShoppingItems: {}
    }));
  }

  function saveDraft() {
    const cleanedDraft: ImportDraft = {
      ...draft,
      title: draft.title.trim() || "Untitled recipe",
      servings: Math.max(1, Number(draft.servings) || 4),
      tags: parseTags(tagInput),
      ingredients: draft.ingredients
        .filter((ingredient) => ingredient.name.trim())
        .map((ingredient) => ({
          ...ingredient,
          id: ingredient.id || createId("ing"),
          unit: normalizeUnit(ingredient.unit),
          category: ingredient.category || inferCategory(ingredient.name)
        })),
      instructions: draft.instructions.map((step) => step.trim()).filter(Boolean)
    };
    cleanedDraft.tags = mergeAutomaticRecipeTags(cleanedDraft.tags, cleanedDraft);
    const recipe = draftToRecipe(cleanedDraft);

    updateState((current) => {
      if (editingRecipeId) {
        const existing = current.recipes.find((item) => item.id === editingRecipeId);
        return {
          ...current,
          recipes: current.recipes.map((item) =>
            item.id === editingRecipeId
              ? {
                  ...recipe,
                  id: editingRecipeId,
                  favorite: existing?.favorite ?? false,
                  createdAt: existing?.createdAt ?? recipe.createdAt,
                  updatedAt: new Date().toISOString()
                }
              : item
          ),
          hiddenShoppingItems: {}
        };
      }

      return {
        ...current,
        recipes: [{ ...recipe, favorite: cleanedDraft.tags.includes("favorite") }, ...current.recipes]
      };
    });

    applyDraft(emptyDraft());
    setEditingRecipeId(null);
    setImportMode("manual");
    setActiveView("recipes");
  }

  function editRecipe(recipe: Recipe) {
    applyDraft(recipeToDraft(recipe));
    setEditingRecipeId(recipe.id);
    setImportMode("manual");
    setActiveView("add");
  }

  function duplicateRecipe(recipe: Recipe) {
    const copy = draftToRecipe({
      ...recipeToDraft(recipe),
      title: `${recipe.title} copy`,
      importedFrom: "manual"
    });
    updateState((current) => ({ ...current, recipes: [{ ...copy, favorite: false }, ...current.recipes] }));
  }

  function deleteRecipe(recipeId: string) {
    updateState((current) => ({
      ...current,
      recipes: current.recipes.filter((recipe) => recipe.id !== recipeId),
      plannedMeals: current.plannedMeals.filter((meal) => meal.recipeId !== recipeId),
      hiddenShoppingItems: {}
    }));
  }

  function toggleFavorite(recipeId: string) {
    updateState((current) => ({
      ...current,
      recipes: current.recipes.map((recipe) =>
        recipe.id === recipeId ? { ...recipe, favorite: !recipe.favorite, updatedAt: new Date().toISOString() } : recipe
      )
    }));
  }

  function updateDraftIngredient(id: string, patch: Partial<Ingredient>) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) =>
        ingredient.id === id
          ? {
              ...ingredient,
              ...patch,
              category: patch.name && !patch.category ? inferCategory(patch.name) : patch.category ?? ingredient.category
            }
          : ingredient
      )
    }));
  }

  function addDraftIngredient() {
    setDraft((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        { id: createId("ing"), name: "", unit: "", category: "Other", confidence: "medium" }
      ]
    }));
  }

  function removeDraftIngredient(id: string) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.filter((ingredient) => ingredient.id !== id)
    }));
  }

  function updateInstruction(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      instructions: current.instructions.map((step, stepIndex) => (stepIndex === index ? value : step))
    }));
  }

  function addInstruction() {
    setDraft((current) => ({ ...current, instructions: [...current.instructions, ""] }));
  }

  function removeInstruction(index: number) {
    setDraft((current) => ({
      ...current,
      instructions: current.instructions.filter((_step, stepIndex) => stepIndex !== index)
    }));
  }

  async function extractFromText(event: FormEvent) {
    event.preventDefault();
    setImportStatus("Extracting recipe text...");

    try {
      const response = await fetch("/api/import/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: importText })
      });
      if (!response.ok) throw new Error("Import failed");
      applyDraft((await response.json()) as ImportDraft);
    } catch {
      applyDraft(parseRecipeText(importText, "paste"));
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromUrl(event: FormEvent) {
    event.preventDefault();
    setImportStatus("Reading recipe page...");

    try {
      const response = await fetch("/api/import/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: importUrl })
      });
      const payload = (await response.json()) as ImportDraft | { error?: string };
      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Import failed");
      }
      applyDraft(payload as ImportDraft);
    } catch (error) {
      applyDraft({
        ...emptyDraft(),
        title: "URL import draft",
        sourceUrl: importUrl,
        importedFrom: "url",
        warnings: [
          error instanceof Error ? error.message : "The page could not be imported automatically.",
          "Paste the recipe text into the text importer or fill the review fields manually."
        ]
      });
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromPhoto(event: FormEvent) {
    event.preventDefault();
    if (!photoFile) return;
    setImportStatus("Preparing photo...");

    try {
      const prepared = await prepareRecipePhoto(photoFile);
      setCompressedPhotoFile(prepared.file);
      setPhotoPreview(prepared.dataUrl);
      setImportStatus("Reading photo privately on this device...");

      const { recognize } = await import("tesseract.js");
      const result = await recognize(prepared.file, "eng", {
        logger: (message: { status?: string; progress?: number }) => {
          if (message.status && typeof message.progress === "number") {
            setImportStatus(`${message.status} ${Math.round(message.progress * 100)}%`);
          }
        }
      });
      const text = result.data.text.trim();
      const payload = draftFromOcrText(text, photoFile.name);
      applyDraft({
        ...payload,
        photoDataUrl: prepared.dataUrl,
        warnings: Array.from(new Set(["Browser OCR was used for this draft. Review carefully before saving.", ...payload.warnings]))
      });
    } catch (error) {
      applyDraft({
        ...emptyDraft(),
        title: photoFile.name.replace(/\.[^.]+$/, ""),
        importedFrom: "photo",
        photoDataUrl: photoPreview,
        warnings: [
          error instanceof Error ? error.message : "Browser OCR could not read this photo.",
          "Try the free online OCR fallback or type/paste the recipe text into the review fields."
        ]
      });
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromPhotoFallback() {
    if (!photoFile) return;
    setImportStatus("Preparing online OCR fallback...");

    try {
      const prepared = compressedPhotoFile ? { file: compressedPhotoFile, dataUrl: photoPreview } : await prepareRecipePhoto(photoFile, 1300, 0.62);
      setCompressedPhotoFile(prepared.file);
      setPhotoPreview(prepared.dataUrl);

      if (prepared.file.size > 1_000_000) {
        throw new Error("The compressed image is still over the free OCR fallback limit. Retake the photo closer to the page.");
      }

      const formData = new FormData();
      formData.append("source", "ocr-space");
      formData.append("photo", prepared.file);

      const response = await fetch("/api/import/photo", { method: "POST", body: formData });
      const payload = (await response.json()) as ImportDraft | { error?: string };

      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Online OCR failed.");
      }

      applyDraft({ ...(payload as ImportDraft), photoDataUrl: prepared.dataUrl });
    } catch (error) {
      setImportStatus("");
      applyDraft({
        ...draft,
        photoDataUrl: photoPreview,
        warnings: Array.from(
          new Set([
            ...draft.warnings,
            error instanceof Error ? error.message : "The free online OCR fallback could not read the photo."
          ])
        )
      });
      return;
    }

    setImportStatus("");
  }

  function handlePhotoChange(file: File | null) {
    setPhotoFile(file);
    setCompressedPhotoFile(null);
    setPhotoPreview("");
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function addManualShoppingItem(event: FormEvent) {
    event.preventDefault();
    if (!manualItemName.trim()) return;

    const item: ShoppingListItem = {
      id: createId("manual"),
      name: manualItemName.trim(),
      displayQuantity: manualItemQuantity.trim(),
      category: manualItemCategory,
      sourceMeals: ["Manual"],
      checked: false,
      manual: true
    };

    updateState((current) => ({
      ...current,
      manualShoppingItems: [...current.manualShoppingItems, item]
    }));
    setManualItemName("");
    setManualItemQuantity("");
    setManualItemCategory("Other");
  }

  function toggleShoppingItem(id: string, checked: boolean) {
    updateState((current) => ({
      ...current,
      shoppingChecks: { ...current.shoppingChecks, [id]: checked },
      manualShoppingItems: current.manualShoppingItems.map((item) => (item.id === id ? { ...item, checked } : item))
    }));
  }

  function updateManualShoppingItem(id: string, patch: Partial<ShoppingListItem>) {
    updateState((current) => ({
      ...current,
      manualShoppingItems: current.manualShoppingItems.map((item) =>
        item.id === id ? { ...item, ...patch, manual: true } : item
      )
    }));
  }

  function deleteShoppingItem(item: ShoppingListItem) {
    updateState((current) => {
      if (item.manual) {
        return {
          ...current,
          manualShoppingItems: current.manualShoppingItems.filter((manual) => manual.id !== item.id)
        };
      }

      return {
        ...current,
        hiddenShoppingItems: { ...current.hiddenShoppingItems, [item.id]: true }
      };
    });
  }

  async function copyShoppingList() {
    const text = shoppingList
      .map((item) => `${item.checked ? "[x]" : "[ ]"} ${item.displayQuantity ? `${item.displayQuantity} ` : ""}${item.name}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
  }

  function updateSettings(patch: Partial<AppState["settings"]>) {
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
      hiddenShoppingItems: {}
    }));
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client) {
      setCloudMessage("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable cloud login.");
      return;
    }

    setCloudBusy(true);
    const { error } = await client.auth.signInWithOtp({
      email: cloudEmail,
      options: { emailRedirectTo: window.location.origin }
    });
    setCloudBusy(false);
    setCloudMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  async function saveCloudSnapshotForUser(userId: string, snapshot: AppState, message?: string) {
    const client = getSupabaseClient();
    if (!client) {
      setSyncStatus("local");
      return setCloudMessage("Cloud sync is not configured yet.");
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return setCloudMessage("You are offline. Changes are saved locally and will sync when you reconnect.");
    }

    setSyncStatus("saving");
    const { error } = await client.from("household_snapshots").upsert({
      user_id: userId,
      app_state: snapshot,
      updated_at: new Date().toISOString()
    });

    if (error) {
      setSyncStatus("error");
      setCloudMessage(error.message);
      return;
    }

    lastSavedJsonRef.current = JSON.stringify(snapshot);
    setSyncStatus("saved");
    if (message) setCloudMessage(message);
  }

  async function loadCloudSnapshotForUser(userId: string, manual = false) {
    const client = getSupabaseClient();
    if (!client) return setCloudMessage("Cloud sync is not configured yet.");

    setCloudBusy(manual);
    setSyncStatus("loading");

    const { data, error } = await client
      .from("household_snapshots")
      .select("app_state, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    setCloudBusy(false);

    if (error) {
      setSyncStatus("error");
      return setCloudMessage(error.message);
    }

    if (!data?.app_state) {
      cloudLoadedRef.current = true;
      setCloudMessage("No cloud snapshot yet. This device will create one automatically.");
      await saveCloudSnapshotForUser(userId, stateRef.current, "Created your cloud snapshot.");
      return;
    }

    const hydratedState = hydrateState(data.app_state);
    window.localStorage.setItem(
      backupStorageKey,
      JSON.stringify({
        backedUpAt: new Date().toISOString(),
        reason: "before-cloud-load",
        appState: stateRef.current
      })
    );
    suppressNextCloudSaveRef.current = true;
    cloudLoadedRef.current = true;
    lastSavedJsonRef.current = JSON.stringify(hydratedState);
    setState(hydratedState);
    setSyncStatus("saved");
    setCloudMessage(`Loaded cloud snapshot${data.updated_at ? ` from ${new Date(data.updated_at).toLocaleString()}` : ""}.`);
  }

  async function saveCloudSnapshot() {
    const userId = cloudUserIdRef.current;
    if (!userId) return setCloudMessage("Sign in before syncing to cloud.");
    setCloudBusy(true);
    await saveCloudSnapshotForUser(userId, stateRef.current, "Saved this household plan to Supabase.");
    setCloudBusy(false);
  }

  async function loadCloudSnapshot() {
    const userId = cloudUserIdRef.current;
    if (!userId) return setCloudMessage("Sign in before loading cloud data.");
    await loadCloudSnapshotForUser(userId, true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <ChefHat size={24} />
          </div>
          <div>
            <strong>Weekwise</strong>
            <span>Meal planning</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          <NavButton view="planner" activeView={activeView} setActiveView={setActiveView} icon={<CalendarDays />} label="Planner" />
          <NavButton view="recipes" activeView={activeView} setActiveView={setActiveView} icon={<ChefHat />} label="Recipes" />
          <NavButton view="add" activeView={activeView} setActiveView={setActiveView} icon={<Plus />} label="Add recipe" />
          <NavButton view="shopping" activeView={activeView} setActiveView={setActiveView} icon={<ShoppingCart />} label="Shopping" />
          <NavButton view="settings" activeView={activeView} setActiveView={setActiveView} icon={<Settings />} label="Settings" />
        </nav>

        <div className="sidebar-summary">
          <span>{weekMeals.length} meals planned</span>
          <strong>{checkedCount}/{shoppingList.length}</strong>
          <span>shopping items done</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{state.settings.householdName}</p>
            <h1>{viewTitle[activeView]}</h1>
          </div>
          <div className="topbar-actions">
            <span className={classNames("sync-badge", `sync-${syncStatus}`)}>{syncStatusCopy(syncStatus)}</span>
            <button className="icon-text-button" onClick={() => setActiveView("shopping")}>
              <ListChecks size={18} />
              {generatedCount} generated
            </button>
          </div>
        </header>

        {activeView === "planner" && (
          <PlannerView
            days={days}
            weekStart={weekStart}
            recipes={state.recipes}
            plannedMeals={state.plannedMeals}
            visibleSlots={visibleSlots}
            recipeFrequencies={recipeFrequencies}
            onAddMeal={addPlannedMeal}
            onMoveMeal={movePlannedMeal}
            onRemoveMeal={removePlannedMeal}
            onUpdateMeal={updatePlannedMeal}
            onAddLeftovers={addLeftoverLunch}
            onOpenMealPicker={(date, slot) => {
              setMealPicker({ date, slot });
              setMealPickerQuery("");
            }}
            onOpenRecipe={setSelectedRecipeId}
            onMoveWeek={moveWeek}
            onThisWeek={() => setWeekStart(formatDateKey(startOfWeek(new Date())))}
            onDuplicateWeek={duplicateWeekToNext}
            onClearWeek={clearWeek}
          />
        )}

        {activeView === "recipes" && (
          <RecipeLibrary
            recipes={filteredRecipes}
            recipeSearch={recipeSearch}
            setRecipeSearch={setRecipeSearch}
            plannedRecipeIds={plannedRecipeIds}
            onAddRecipe={() => {
              applyDraft(emptyDraft());
              setEditingRecipeId(null);
              setImportMode("manual");
              setActiveView("add");
            }}
            onEditRecipe={editRecipe}
            onDuplicateRecipe={duplicateRecipe}
            onDeleteRecipe={deleteRecipe}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {activeView === "add" && (
          <AddRecipeView
            importMode={importMode}
            setImportMode={setImportMode}
            importText={importText}
            setImportText={setImportText}
            importUrl={importUrl}
            setImportUrl={setImportUrl}
            photoFile={photoFile}
            photoPreview={photoPreview}
            onPhotoChange={handlePhotoChange}
            draft={draft}
            setDraft={setDraft}
            tagInput={tagInput}
            setTagInput={setTagInput}
            editingRecipeId={editingRecipeId}
            importStatus={importStatus}
            onExtractText={extractFromText}
            onExtractUrl={extractFromUrl}
            onExtractPhoto={extractFromPhoto}
            onExtractPhotoFallback={extractFromPhotoFallback}
            onNewManual={() => {
              applyDraft(emptyDraft());
              setEditingRecipeId(null);
              setImportMode("manual");
            }}
            onSaveDraft={saveDraft}
            onUpdateIngredient={updateDraftIngredient}
            onAddIngredient={addDraftIngredient}
            onRemoveIngredient={removeDraftIngredient}
            onUpdateInstruction={updateInstruction}
            onAddInstruction={addInstruction}
            onRemoveInstruction={removeInstruction}
          />
        )}

        {activeView === "shopping" && (
          <ShoppingView
            items={shoppingList}
            settings={state.settings}
            manualItemName={manualItemName}
            manualItemQuantity={manualItemQuantity}
            manualItemCategory={manualItemCategory}
            setManualItemName={setManualItemName}
            setManualItemQuantity={setManualItemQuantity}
            setManualItemCategory={setManualItemCategory}
            onToggleIncludeStaples={(includeStaples) => updateSettings({ includeStaples })}
            onAddManualItem={addManualShoppingItem}
            onToggleItem={toggleShoppingItem}
            onUpdateManualItem={updateManualShoppingItem}
            onDeleteItem={deleteShoppingItem}
            onCopy={copyShoppingList}
            onPrint={() => window.print()}
            onRestoreGenerated={() => updateState((current) => ({ ...current, hiddenShoppingItems: {} }))}
          />
        )}

        {activeView === "settings" && (
          <SettingsView
            settings={state.settings}
            updateSettings={updateSettings}
            supabaseConfigured={supabaseConfigured}
            cloudEmail={cloudEmail}
            setCloudEmail={setCloudEmail}
            cloudUser={cloudUser}
            cloudMessage={cloudMessage}
            cloudBusy={cloudBusy}
            syncStatus={syncStatus}
            onSendMagicLink={sendMagicLink}
            onSaveCloud={saveCloudSnapshot}
            onLoadCloud={loadCloudSnapshot}
            onResetDemo={() => setState(seedState())}
          />
        )}

        {mealPicker && (
          <MealPickerModal
            target={mealPicker}
            recipes={mealPickerRecipes}
            recipeFrequencies={recipeFrequencies}
            query={mealPickerQuery}
            setQuery={setMealPickerQuery}
            onAdd={(recipeId) => addPlannedMeal(mealPicker.date, mealPicker.slot, recipeId)}
            onClose={() => setMealPicker(null)}
          />
        )}

        {selectedRecipe && <RecipeDetailModal recipe={selectedRecipe} onClose={() => setSelectedRecipeId(null)} />}
      </section>
    </main>
  );
}

function NavButton({
  view,
  activeView,
  setActiveView,
  icon,
  label
}: {
  view: View;
  activeView: View;
  setActiveView: (view: View) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className={classNames("nav-button", activeView === view && "active")} onClick={() => setActiveView(view)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function PlannerView({
  days,
  weekStart,
  recipes,
  plannedMeals,
  visibleSlots,
  recipeFrequencies,
  onAddMeal,
  onMoveMeal,
  onRemoveMeal,
  onUpdateMeal,
  onAddLeftovers,
  onOpenMealPicker,
  onOpenRecipe,
  onMoveWeek,
  onThisWeek,
  onDuplicateWeek,
  onClearWeek
}: {
  days: Date[];
  weekStart: string;
  recipes: Recipe[];
  plannedMeals: AppState["plannedMeals"];
  visibleSlots: MealSlot[];
  recipeFrequencies: Record<string, number>;
  onAddMeal: (date: string, slot: MealSlot, recipeId: string) => void;
  onMoveMeal: (id: string, date: string, slot: MealSlot) => void;
  onRemoveMeal: (id: string) => void;
  onUpdateMeal: (id: string, patch: Partial<AppState["plannedMeals"][number]>) => void;
  onAddLeftovers: (meal: AppState["plannedMeals"][number]) => void;
  onOpenMealPicker: (date: string, slot: MealSlot) => void;
  onOpenRecipe: (recipeId: string) => void;
  onMoveWeek: (direction: -1 | 1) => void;
  onThisWeek: () => void;
  onDuplicateWeek: () => void;
  onClearWeek: () => void;
}) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, date: string, slot: MealSlot) {
    event.preventDefault();
    const mealId = event.dataTransfer.getData("text/plain");
    setDragOverSlot(null);
    if (mealId) onMoveMeal(mealId, date, slot);
  }

  return (
    <div className="view-stack">
      <section className="toolbar-band">
        <div>
          <p className="eyebrow">Week of</p>
          <h2>{dateFormatter.format(new Date(`${weekStart}T12:00:00`))}</h2>
        </div>
        <div className="button-row">
          <button className="icon-button" title="Previous week" onClick={() => onMoveWeek(-1)}>
            <Minus size={18} />
          </button>
          <button className="text-button" onClick={onThisWeek}>This week</button>
          <button className="icon-button" title="Next week" onClick={() => onMoveWeek(1)}>
            <Plus size={18} />
          </button>
          <button className="icon-text-button" onClick={onDuplicateWeek}>
            <Copy size={18} />
            Repeat
          </button>
          <button className="ghost-danger" onClick={onClearWeek}>
            <CircleOff size={18} />
            Clear
          </button>
        </div>
      </section>

      <section className="planner-grid">
        {days.map((date) => {
          const dateKey = formatDateKey(date);

          return (
            <div className="day-column" key={dateKey}>
              <div className="day-heading">
                <strong>{dateFormatter.format(date)}</strong>
              </div>

              {visibleSlots.map((slot) => {
                const slotMeals = plannedMeals.filter((meal) => meal.date === dateKey && meal.slot === slot);
                const slotKey = `${dateKey}-${slot}`;

                return (
                  <div
                    className={classNames("meal-slot", dragOverSlot === slotKey && "drop-target")}
                    key={slot}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverSlot(slotKey);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverSlot(null);
                    }}
                    onDrop={(event) => handleDrop(event, dateKey, slot)}
                  >
                    <div className="slot-heading">
                      <span>{labelMealSlot(slot)}</span>
                    </div>

                    <div className="meal-list">
                      {slotMeals.map((meal) => {
                        const recipe = recipes.find((item) => item.id === meal.recipeId);
                        if (!recipe) return null;

                        return (
                          <article
                            className="meal-card"
                            key={meal.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", meal.id);
                            }}
                          >
                            <button className="meal-card-main" onClick={() => onOpenRecipe(recipe.id)}>
                              <strong>{recipe.title}</strong>
                              <span>
                                {recipe.tags.slice(0, 2).join(" · ") || "Saved recipe"}
                                {(recipeFrequencies[recipe.id] ?? 0) > 1 ? ` · planned ${recipeFrequencies[recipe.id]}x` : ""}
                              </span>
                            </button>
                            <div className="meal-actions">
                              <label className="mini-input">
                                <Users size={15} />
                                <input
                                  aria-label="People eating"
                                  type="number"
                                  min={1}
                                  value={meal.peopleCount}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => onUpdateMeal(meal.id, { peopleCount: Number(event.target.value) || 1 })}
                                />
                              </label>
                              <button className="icon-button" title="Add leftovers to tomorrow lunch" onClick={() => onAddLeftovers(meal)}>
                                <RefreshCw size={16} />
                              </button>
                              <button className="icon-button danger" title="Remove meal" onClick={() => onRemoveMeal(meal.id)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="quick-add">
                      <button className="add-meal-button" onClick={() => onOpenMealPicker(dateKey, slot)}>
                        <Plus size={16} />
                        Add meal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function RecipeLibrary({
  recipes,
  recipeSearch,
  setRecipeSearch,
  plannedRecipeIds,
  onAddRecipe,
  onEditRecipe,
  onDuplicateRecipe,
  onDeleteRecipe,
  onToggleFavorite
}: {
  recipes: Recipe[];
  recipeSearch: string;
  setRecipeSearch: (value: string) => void;
  plannedRecipeIds: Set<string>;
  onAddRecipe: () => void;
  onEditRecipe: (recipe: Recipe) => void;
  onDuplicateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onToggleFavorite: (recipeId: string) => void;
}) {
  return (
    <div className="view-stack">
      <section className="toolbar-band">
        <label className="search-box">
          <Search size={18} />
          <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Search meals, tags, ingredients" />
        </label>
        <button className="primary-button" onClick={onAddRecipe}>
          <Plus size={18} />
          New recipe
        </button>
      </section>

      <section className="recipe-grid">
        {recipes.map((recipe, index) => (
          <article className="recipe-card" key={recipe.id}>
            <div className={`recipe-visual visual-${index % 6}`}>{recipe.favorite && <Star size={20} fill="currentColor" />}</div>
            <div className="recipe-body">
              <div className="recipe-title-row">
                <h2>{recipe.title}</h2>
                <button className="icon-button" title={recipe.favorite ? "Remove favorite" : "Favorite"} onClick={() => onToggleFavorite(recipe.id)}>
                  <Heart size={18} fill={recipe.favorite ? "currentColor" : "none"} />
                </button>
              </div>
              <p>{recipe.ingredients.length} ingredients · serves {recipe.servings}</p>
              <div className="tag-row">
                {recipe.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
                {plannedRecipeIds.has(recipe.id) && <span>planned</span>}
              </div>
              <div className="card-actions">
                <button className="text-button" onClick={() => onEditRecipe(recipe)}>Edit</button>
                <button className="icon-button" title="Duplicate" onClick={() => onDuplicateRecipe(recipe)}>
                  <Copy size={17} />
                </button>
                <button className="icon-button danger" title="Delete" onClick={() => onDeleteRecipe(recipe.id)}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function MealPickerModal({
  target,
  recipes,
  recipeFrequencies,
  query,
  setQuery,
  onAdd,
  onClose
}: {
  target: { date: string; slot: MealSlot };
  recipes: Recipe[];
  recipeFrequencies: Record<string, number>;
  query: string;
  setQuery: (value: string) => void;
  onAdd: (recipeId: string) => void;
  onClose: () => void;
}) {
  const frequentRecipes = recipes.filter((recipe) => (recipeFrequencies[recipe.id] ?? 0) > 0).slice(0, 5);
  const visibleRecipes = query.trim() ? recipes : frequentRecipes.length > 0 ? frequentRecipes : recipes.slice(0, 8);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel meal-picker-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">
              {dateFormatter.format(new Date(`${target.date}T12:00:00`))} · {labelMealSlot(target.slot)}
            </p>
            <h2>Add meal</h2>
          </div>
          <button className="icon-button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="search-box">
          <Search size={18} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search meals, tags, ingredients" />
        </label>

        <div className="picker-list">
          {visibleRecipes.map((recipe) => (
            <button className="picker-recipe" key={recipe.id} onClick={() => onAdd(recipe.id)}>
              <span>
                <strong>{recipe.title}</strong>
                <small>
                  {recipe.tags.slice(0, 3).join(" · ") || `${recipe.ingredients.length} ingredients`}
                  {(recipeFrequencies[recipe.id] ?? 0) > 0 ? ` · chosen ${recipeFrequencies[recipe.id]}x` : ""}
                </small>
              </span>
              <Plus size={18} />
            </button>
          ))}
          {visibleRecipes.length === 0 && <p className="muted">No matching meals yet.</p>}
        </div>
      </section>
    </div>
  );
}

function RecipeDetailModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const totalMinutes = totalRecipeMinutes(recipe);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel recipe-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Recipe</p>
            <h2>{recipe.title}</h2>
          </div>
          <button className="icon-button" title="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="recipe-meta-row">
          <span>
            <Users size={16} />
            Serves {recipe.servings}
          </span>
          <span>
            <Clock size={16} />
            {totalMinutes ? `${totalMinutes} mins total` : "Time not set"}
          </span>
          {recipe.prepMinutes ? <span>{recipe.prepMinutes} mins prep</span> : null}
          {recipe.cookMinutes ? <span>{recipe.cookMinutes} mins cook</span> : null}
        </div>

        <div className="tag-row">
          {recipe.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="recipe-detail-grid">
          <section>
            <h3>Ingredients</h3>
            <ul className="ingredient-list">
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient.id}>
                  <span>{ingredient.quantity ? `${ingredient.quantity} ` : ""}{ingredient.unit ? `${ingredient.unit} ` : ""}</span>
                  {ingredient.name}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Method</h3>
            <ol className="method-list">
              {recipe.instructions.map((step, index) => (
                <li key={`${index}-${step.slice(0, 12)}`}>{step}</li>
              ))}
            </ol>
          </section>
        </div>
      </section>
    </div>
  );
}

function AddRecipeView({
  importMode,
  setImportMode,
  importText,
  setImportText,
  importUrl,
  setImportUrl,
  photoFile,
  photoPreview,
  onPhotoChange,
  draft,
  setDraft,
  tagInput,
  setTagInput,
  editingRecipeId,
  importStatus,
  onExtractText,
  onExtractUrl,
  onExtractPhoto,
  onExtractPhotoFallback,
  onNewManual,
  onSaveDraft,
  onUpdateIngredient,
  onAddIngredient,
  onRemoveIngredient,
  onUpdateInstruction,
  onAddInstruction,
  onRemoveInstruction
}: {
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  importText: string;
  setImportText: (value: string) => void;
  importUrl: string;
  setImportUrl: (value: string) => void;
  photoFile: File | null;
  photoPreview: string;
  onPhotoChange: (file: File | null) => void;
  draft: ImportDraft;
  setDraft: (draft: ImportDraft | ((current: ImportDraft) => ImportDraft)) => void;
  tagInput: string;
  setTagInput: (value: string) => void;
  editingRecipeId: string | null;
  importStatus: string;
  onExtractText: (event: FormEvent) => void;
  onExtractUrl: (event: FormEvent) => void;
  onExtractPhoto: (event: FormEvent) => void;
  onExtractPhotoFallback: () => void;
  onNewManual: () => void;
  onSaveDraft: () => void;
  onUpdateIngredient: (id: string, patch: Partial<Ingredient>) => void;
  onAddIngredient: () => void;
  onRemoveIngredient: (id: string) => void;
  onUpdateInstruction: (index: number, value: string) => void;
  onAddInstruction: () => void;
  onRemoveInstruction: (index: number) => void;
}) {
  const automaticTags = mergeAutomaticRecipeTags(parseTags(tagInput), draft).filter((tag) => !parseTags(tagInput).includes(tag));

  return (
    <div className="split-view">
      <section className="import-panel">
        <div className="segmented-control" role="tablist" aria-label="Recipe import method">
          <button className={classNames(importMode === "manual" && "active")} onClick={() => setImportMode("manual")}>
            <ChefHat size={17} />
            Manual
          </button>
          <button className={classNames(importMode === "paste" && "active")} onClick={() => setImportMode("paste")}>
            <Clipboard size={17} />
            Paste
          </button>
          <button className={classNames(importMode === "url" && "active")} onClick={() => setImportMode("url")}>
            <Link size={17} />
            URL
          </button>
          <button className={classNames(importMode === "photo" && "active")} onClick={() => setImportMode("photo")}>
            <Camera size={17} />
            Photo
          </button>
        </div>

        {importMode === "manual" && (
          <div className="import-box">
            <ImagePlus size={32} />
            <h2>{editingRecipeId ? "Editing saved recipe" : "Start from a blank recipe"}</h2>
            <p>Create a clean review draft, then save it to the recipe library.</p>
            <button className="primary-button" onClick={onNewManual}>
              <Plus size={18} />
              Blank recipe
            </button>
          </div>
        )}

        {importMode === "paste" && (
          <form className="import-box" onSubmit={onExtractText}>
            <label>
              Recipe text
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={12} />
            </label>
            <button className="primary-button" type="submit" disabled={!importText.trim() || Boolean(importStatus)}>
              {importStatus ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              Extract to review
            </button>
          </form>
        )}

        {importMode === "url" && (
          <form className="import-box" onSubmit={onExtractUrl}>
            <label>
              Public recipe URL
              <input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://example.com/recipe" />
            </label>
            <button className="primary-button" type="submit" disabled={!importUrl.trim() || Boolean(importStatus)}>
              {importStatus ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Import URL
            </button>
          </form>
        )}

        {importMode === "photo" && (
          <form className="import-box" onSubmit={onExtractPhoto}>
            <label className="photo-drop">
              <Camera size={28} />
              <span>{photoFile ? photoFile.name : "Choose or take a recipe photo"}</span>
              <input type="file" accept="image/*" capture="environment" onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)} />
            </label>
            {photoPreview && <img className="photo-preview" src={photoPreview} alt="Recipe import preview" />}
            {importStatus && <span className="ocr-status">{importStatus}</span>}
            <button className="primary-button" type="submit" disabled={!photoFile || Boolean(importStatus)}>
              {importStatus ? <Loader2 className="spin" size={18} /> : <Eye size={18} />}
              Read photo privately
            </button>
            <button className="icon-text-button" type="button" onClick={onExtractPhotoFallback} disabled={!photoFile || Boolean(importStatus)}>
              <Sparkles size={18} />
              Try free online OCR
            </button>
          </form>
        )}
      </section>

      <section className="review-panel">
        <div className="review-heading">
          <div>
            <p className="eyebrow">Review before save</p>
            <h2>{draft.title || "Untitled recipe"}</h2>
          </div>
          <button className="primary-button" onClick={onSaveDraft} disabled={!draft.title.trim() || draft.ingredients.every((ingredient) => !ingredient.name.trim())}>
            <Check size={18} />
            {editingRecipeId ? "Update recipe" : "Save recipe"}
          </button>
        </div>

        {draft.warnings.length > 0 && (
          <div className="warning-list">
            {draft.warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        )}

        <div className="form-grid">
          <label>
            Recipe name
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Serves
            <input
              type="number"
              min={1}
              value={draft.servings}
              onChange={(event) => setDraft((current) => ({ ...current, servings: Number(event.target.value) || 1 }))}
            />
          </label>
          <label>
            Prep mins
            <input
              type="number"
              min={0}
              value={draft.prepMinutes ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, prepMinutes: parseNumberInput(event.target.value) }))}
            />
          </label>
          <label>
            Cook mins
            <input
              type="number"
              min={0}
              value={draft.cookMinutes ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, cookMinutes: parseNumberInput(event.target.value) }))}
            />
          </label>
        </div>

        <label>
          Tags
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="family, cosy, lunch prep"
          />
        </label>
        <div className="tag-helper">
          {automaticTags.length > 0 ? (
            <>
              <span>Auto tags on save</span>
              {automaticTags.map((tag) => (
                <strong key={tag}>{tag}</strong>
              ))}
            </>
          ) : (
            <span>Automatic meal-type and time tags are kept up to date when saved.</span>
          )}
        </div>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Ingredients</h3>
            <button className="icon-text-button" onClick={onAddIngredient}>
              <Plus size={17} />
              Add row
            </button>
          </div>
          <div className="ingredient-editor">
            {draft.ingredients.map((ingredient) => (
              <div className={classNames("ingredient-row", ingredient.confidence === "low" && "needs-review")} key={ingredient.id}>
                <input
                  aria-label="Quantity"
                  className="qty-input"
                  type="number"
                  min={0}
                  step="0.25"
                  value={ingredient.quantity ?? ""}
                  onChange={(event) => onUpdateIngredient(ingredient.id, { quantity: parseNumberInput(event.target.value) })}
                />
                <input
                  aria-label="Unit"
                  className="unit-input"
                  value={ingredient.unit ?? ""}
                  onChange={(event) => onUpdateIngredient(ingredient.id, { unit: event.target.value })}
                  placeholder="unit"
                />
                <input
                  aria-label="Ingredient"
                  value={ingredient.name}
                  onChange={(event) => onUpdateIngredient(ingredient.id, { name: event.target.value })}
                  onBlur={(event) => {
                    if (!ingredient.quantity && !ingredient.unit && event.target.value.trim()) {
                      const parsed = parseIngredientLine(event.target.value);
                      if (parsed.name !== event.target.value) onUpdateIngredient(ingredient.id, parsed);
                    }
                  }}
                  placeholder="ingredient"
                />
                <select
                  aria-label="Category"
                  value={ingredient.category}
                  onChange={(event) => onUpdateIngredient(ingredient.id, { category: event.target.value as GroceryCategory })}
                >
                  {groceryCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <button className="icon-button danger" title="Remove ingredient" onClick={() => onRemoveIngredient(ingredient.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Method</h3>
            <button className="icon-text-button" onClick={onAddInstruction}>
              <Plus size={17} />
              Add step
            </button>
          </div>
          <div className="method-editor">
            {draft.instructions.map((step, index) => (
              <div className="method-row" key={`${index}-${step.slice(0, 8)}`}>
                <span>{index + 1}</span>
                <textarea value={step} onChange={(event) => onUpdateInstruction(index, event.target.value)} rows={2} />
                <button className="icon-button danger" title="Remove step" onClick={() => onRemoveInstruction(index)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ShoppingView({
  items,
  settings,
  manualItemName,
  manualItemQuantity,
  manualItemCategory,
  setManualItemName,
  setManualItemQuantity,
  setManualItemCategory,
  onToggleIncludeStaples,
  onAddManualItem,
  onToggleItem,
  onUpdateManualItem,
  onDeleteItem,
  onCopy,
  onPrint,
  onRestoreGenerated
}: {
  items: ShoppingListItem[];
  settings: AppState["settings"];
  manualItemName: string;
  manualItemQuantity: string;
  manualItemCategory: GroceryCategory;
  setManualItemName: (value: string) => void;
  setManualItemQuantity: (value: string) => void;
  setManualItemCategory: (value: GroceryCategory) => void;
  onToggleIncludeStaples: (value: boolean) => void;
  onAddManualItem: (event: FormEvent) => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onUpdateManualItem: (id: string, patch: Partial<ShoppingListItem>) => void;
  onDeleteItem: (item: ShoppingListItem) => void;
  onCopy: () => void;
  onPrint: () => void;
  onRestoreGenerated: () => void;
}) {
  const grouped = groceryCategories
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category)
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="view-stack">
      <section className="toolbar-band">
        <div>
          <p className="eyebrow">Generated from this week</p>
          <h2>{items.length} shopping items</h2>
        </div>
        <div className="button-row">
          <label className="toggle-line">
            <input type="checkbox" checked={settings.includeStaples} onChange={(event) => onToggleIncludeStaples(event.target.checked)} />
            Include staples
          </label>
          <button className="icon-text-button" onClick={onCopy}>
            <Download size={18} />
            Copy
          </button>
          <button className="icon-button" title="Print" onClick={onPrint}>
            <Printer size={18} />
          </button>
          <button className="icon-button" title="Restore hidden generated items" onClick={onRestoreGenerated}>
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      <form className="manual-add" onSubmit={onAddManualItem}>
        <input value={manualItemName} onChange={(event) => setManualItemName(event.target.value)} placeholder="Add extra item" />
        <input value={manualItemQuantity} onChange={(event) => setManualItemQuantity(event.target.value)} placeholder="Quantity" />
        <select value={manualItemCategory} onChange={(event) => setManualItemCategory(event.target.value as GroceryCategory)}>
          {groceryCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <button className="primary-button" type="submit">
          <Plus size={18} />
          Add
        </button>
      </form>

      <section className="shopping-groups">
        {grouped.map((group) => (
          <div className="shopping-group" key={group.category}>
            <h2>{group.category}</h2>
            <div className="shopping-list">
              {group.items.map((item) => (
                <article className={classNames("shopping-item", item.checked && "checked")} key={item.id}>
                  <label className="check-control">
                    <input type="checkbox" checked={item.checked} onChange={(event) => onToggleItem(item.id, event.target.checked)} />
                    <Check size={16} />
                  </label>

                  {item.manual ? (
                    <div className="manual-edit">
                      <input value={item.displayQuantity} onChange={(event) => onUpdateManualItem(item.id, { displayQuantity: event.target.value })} />
                      <input value={item.name} onChange={(event) => onUpdateManualItem(item.id, { name: event.target.value })} />
                    </div>
                  ) : (
                    <div className="shopping-text">
                      <strong>
                        {item.displayQuantity && <span>{item.displayQuantity}</span>} {item.name}
                      </strong>
                      <small>
                        {item.sourceMeals.join(", ")}
                        {item.incompatible ? " · check unit" : ""}
                        {item.staple ? " · staple" : ""}
                      </small>
                    </div>
                  )}

                  <button className="icon-button danger" title={item.manual ? "Delete item" : "Hide generated item"} onClick={() => onDeleteItem(item)}>
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function SettingsView({
  settings,
  updateSettings,
  supabaseConfigured,
  cloudEmail,
  setCloudEmail,
  cloudUser,
  cloudMessage,
  cloudBusy,
  syncStatus,
  onSendMagicLink,
  onSaveCloud,
  onLoadCloud,
  onResetDemo
}: {
  settings: AppState["settings"];
  updateSettings: (patch: Partial<AppState["settings"]>) => void;
  supabaseConfigured: boolean;
  cloudEmail: string;
  setCloudEmail: (value: string) => void;
  cloudUser: string | null;
  cloudMessage: string;
  cloudBusy: boolean;
  syncStatus: SyncStatus;
  onSendMagicLink: (event: FormEvent) => void;
  onSaveCloud: () => void;
  onLoadCloud: () => void;
  onResetDemo: () => void;
}) {
  return (
    <div className="settings-layout">
      <section className="settings-section">
        <h2>Household</h2>
        <div className="form-grid">
          <label>
            Household name
            <input value={settings.householdName} onChange={(event) => updateSettings({ householdName: event.target.value })} />
          </label>
          <label>
            Default people
            <input
              type="number"
              min={1}
              value={settings.defaultPeople}
              onChange={(event) => updateSettings({ defaultPeople: Number(event.target.value) || 1 })}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h2>Meal slots</h2>
        <div className="toggle-grid">
          {mealSlots.map((slot) => {
            const hidden = settings.hiddenSlots.includes(slot);
            return (
              <button
                className={classNames("toggle-tile", !hidden && "active")}
                key={slot}
                onClick={() =>
                  updateSettings({
                    hiddenSlots: hidden ? settings.hiddenSlots.filter((item) => item !== slot) : [...settings.hiddenSlots, slot]
                  })
                }
              >
                {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                {labelMealSlot(slot)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section">
        <h2>Staples</h2>
        <label>
          Usually at home
          <textarea
            value={settings.stapleIngredients.join(", ")}
            onChange={(event) =>
              updateSettings({
                stapleIngredients: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              })
            }
            rows={4}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Cloud sync</h2>
        <span className={classNames("sync-badge", `sync-${syncStatus}`)}>{syncStatusCopy(syncStatus)}</span>
        <p className="muted">
          {supabaseConfigured
            ? cloudUser
              ? `Signed in as ${cloudUser}. Changes save automatically after a short pause.`
              : "Supabase is configured. Sign in to sync this household across devices."
            : "Supabase credentials are not configured yet. Local saving still works on this device."}
        </p>
        <form className="cloud-form" onSubmit={onSendMagicLink}>
          <input type="email" value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} placeholder="you@example.com" />
          <button className="primary-button" disabled={cloudBusy || !cloudEmail.trim()} type="submit">
            {cloudBusy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Sign in
          </button>
        </form>
        <div className="button-row">
          <button className="icon-text-button" onClick={onSaveCloud} disabled={cloudBusy}>
            <Download size={18} />
            Sync now
          </button>
          <button className="icon-text-button" onClick={onLoadCloud} disabled={cloudBusy}>
            <RefreshCw size={18} />
            Reload cloud
          </button>
        </div>
        {cloudMessage && <span className="status-line">{cloudMessage}</span>}
      </section>

      <section className="settings-section">
        <h2>Demo data</h2>
        <button className="ghost-danger" onClick={onResetDemo}>
          <Trash2 size={18} />
          Reset sample data
        </button>
      </section>
    </div>
  );
}

const viewTitle: Record<View, string> = {
  planner: "Weekly planner",
  recipes: "Recipe library",
  add: "Add recipe",
  shopping: "Shopping list",
  settings: "Settings"
};

const samplePasteText = `Black bean tacos
Serves 4

Ingredients
1 tbsp olive oil
1 red onion
2 cans black beans
1 tsp cumin
8 tortillas
150 g cheddar
1 lime

Method
Soften the onion in olive oil.
Add beans and cumin, then warm through.
Serve in tortillas with cheddar and lime.`;
