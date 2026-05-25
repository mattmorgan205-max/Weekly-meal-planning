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
  Crop,
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
  RotateCw,
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
  canonicalizeIngredientName,
  cleanOcrRecipeText,
  createId,
  draftToRecipe,
  draftFromOcrText,
  formatDateKey,
  generateShoppingList,
  groceryCategories,
  inferCategory,
  inferAutomaticRecipeTags,
  inferRecipeMealTypes,
  isAutomaticRecipeTag,
  labelMealSlot,
  mealSlots,
  mergeAutomaticRecipeTags,
  normalizeMealTypes,
  normalizeSuppressedAutomaticTags,
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
type MealPickerGroup = MealSlot | "all";
type RecipeGroupFilter = MealSlot | "all";
type PhotoCropMode = "whole" | "ingredients" | "method";

const storageKey = "weekwise-meal-planner-v1";
const backupStorageKey = "weekwise-meal-planner-cloud-backup-v1";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short"
});

function hydrateRecipe(recipe: Recipe): Recipe {
  return {
    ...recipe,
    mealTypes: normalizeMealTypes(recipe.mealTypes, inferRecipeMealTypes(recipe)[0]),
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      canonicalName: ingredient.canonicalName || canonicalizeIngredientName(ingredient.name).canonicalName,
      needsReview: ingredient.needsReview ?? ingredient.confidence === "low"
    })),
    source: recipe.source ?? recipe.sourceUrl,
    suppressedAutoTags: normalizeSuppressedAutomaticTags(recipe.suppressedAutoTags)
  };
}

function hydratePlannedMeal(meal: AppState["plannedMeals"][number], defaultPeople: number): AppState["plannedMeals"][number] {
  const parsedPeopleCount = Number(meal.peopleCount);

  return {
    ...meal,
    peopleCount: Number.isFinite(parsedPeopleCount) ? Math.max(0, parsedPeopleCount) : defaultPeople,
    manualTitle: meal.manualTitle?.trim() || undefined
  };
}

function hydrateState(value: unknown): AppState {
  const parsed = (value ?? {}) as Partial<AppState>;
  const seeded = seedState();

  return {
    ...seeded,
    ...parsed,
    recipes: (parsed.recipes ?? seeded.recipes).map(hydrateRecipe),
    plannedMeals: (parsed.plannedMeals ?? seeded.plannedMeals)
      .map((meal) => hydratePlannedMeal(meal, parsed.settings?.defaultPeople ?? seeded.settings.defaultPeople))
      .filter((meal) => meal.recipeId || meal.manualTitle),
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
    mealTypes: ["dinner"],
    tags: [],
    ingredients: [
      {
        id: createId("ing"),
        name: "",
        quantity: undefined,
        unit: "",
        category: "Other",
        canonicalName: "",
        confidence: "medium"
      }
    ],
    instructions: [""],
    source: "",
    suppressedAutoTags: [],
    warnings: [],
    importedFrom: "manual"
  };
}

function classNames(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalizeDateRange(startDate: string, endDate: string) {
  return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

function shoppingHiddenPrefixForRange(range: ReturnType<typeof normalizeDateRange>) {
  return `${range.startDate}__${range.endDate}__`;
}

function shoppingHiddenItemKey(range: ReturnType<typeof normalizeDateRange>, itemId: string) {
  return `${shoppingHiddenPrefixForRange(range)}${itemId}`;
}

function parseJsonResponse<T>(text: string, fallbackError: string): T | { error: string } {
  if (!text) return { error: fallbackError };

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text || fallbackError };
  }
}

function parseNumberInput(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function likelyHeicPhoto(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif") || file.type.includes("heic") || file.type.includes("heif");
}

function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000) return `${Math.round((bytes / 1_000_000) * 10) / 10} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

function isHttpUrl(value?: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
    image.onerror = () => reject(new Error("Image could not be loaded. Try exporting the recipe photo as a standard JPEG or PNG."));
    image.src = src;
  });
}

async function loadImageSource(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return {
        source: bitmap as CanvasImageSource,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      // Fall back to data URL loading below. Some browsers reject certain JPEG encodings here.
    }
  }

  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Image could not be loaded. Try exporting the recipe photo as a standard JPEG or PNG.");
  }

  return {
    source: image as CanvasImageSource,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: undefined
  };
}

function cropForMode(width: number, height: number, cropMode: PhotoCropMode) {
  if (cropMode === "ingredients") {
    return { x: 0, y: 0, width: Math.round(width * 0.52), height };
  }

  if (cropMode === "method") {
    return { x: Math.round(width * 0.4), y: 0, width: Math.round(width * 0.6), height };
  }

  return { x: 0, y: 0, width, height };
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

async function prepareRecipePhoto(file: File, cropMode: PhotoCropMode = "whole", rotation = 0, maxSide = 1500, quality = 0.72) {
  const loaded = await loadImageSource(file);

  try {
    const crop = cropForMode(loaded.width, loaded.height, cropMode);
    const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
    const cropWidth = Math.max(1, Math.round(crop.width * scale));
    const cropHeight = Math.max(1, Math.round(crop.height * scale));
    const normalizedRotation = normalizeRotation(rotation);
    const rotatedSideways = normalizedRotation === 90 || normalizedRotation === 270;
    const width = rotatedSideways ? cropHeight : cropWidth;
    const height = rotatedSideways ? cropWidth : cropHeight;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Image processing is not available in this browser.");

    canvas.width = width;
    canvas.height = height;
    context.save();

    if (normalizedRotation === 90) {
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedRotation === 180) {
      context.translate(width, height);
      context.rotate(Math.PI);
    } else if (normalizedRotation === 270) {
      context.translate(0, height);
      context.rotate((Math.PI * 3) / 2);
    }

    context.drawImage(loaded.source, crop.x, crop.y, crop.width, crop.height, 0, 0, cropWidth, cropHeight);
    context.restore();

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
    const suffix = cropMode === "whole" ? "recipe" : cropMode;
    const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, `-${suffix}.jpg`), { type: "image/jpeg" });

    return {
      file: compressedFile,
      dataUrl: await fileToDataUrl(compressedFile),
      cropMode,
      rotation: normalizedRotation
    };
  } finally {
    loaded.close?.();
  }
}

async function recognizeRecipePhoto(
  prepared: { file: File; dataUrl: string },
  originalFile: File,
  onProgress: (message: string) => void
) {
  const { recognize } = await import("tesseract.js");
  const candidates: Array<{ label: string; image: string | File }> = [
    { label: "processed image", image: prepared.dataUrl },
    { label: "processed file", image: prepared.file }
  ];

  if (prepared.file !== originalFile) {
    candidates.push({ label: "original file", image: originalFile });
  }

  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      onProgress(`Reading ${candidate.label} privately...`);
      const result = await recognize(candidate.image, "eng", {
        logger: (message: { status?: string; progress?: number }) => {
          if (message.status && typeof message.progress === "number") {
            onProgress(`${message.status} ${Math.round(message.progress * 100)}%`);
          }
        }
      });
      const text = result.data.text.trim();

      if (text) {
        return {
          text,
          warning: candidate.label === "processed image" ? "" : `Private OCR worked using the ${candidate.label}.`
        };
      }

      lastError = new Error(`Private OCR did not find text in the ${candidate.label}.`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Browser OCR could not read this photo.");
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
  const [shoppingStartDate, setShoppingStartDate] = useState(() => formatDateKey(startOfWeek(new Date())));
  const [shoppingEndDate, setShoppingEndDate] = useState(() => formatDateKey(addDays(startOfWeek(new Date()), 6)));
  const [recipeSearch, setRecipeSearch] = useState("");
  const [recipeGroupFilter, setRecipeGroupFilter] = useState<RecipeGroupFilter>("all");
  const [mealPicker, setMealPicker] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [mealPickerQuery, setMealPickerQuery] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("manual");
  const [importText, setImportText] = useState(samplePasteText);
  const [importUrl, setImportUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [compressedPhotoFile, setCompressedPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [photoCropMode, setPhotoCropMode] = useState<PhotoCropMode>("whole");
  const [photoRotation, setPhotoRotation] = useState(0);
  const [photoRawText, setPhotoRawText] = useState("");
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
  const shoppingDateRange = useMemo(() => normalizeDateRange(shoppingStartDate, shoppingEndDate), [shoppingStartDate, shoppingEndDate]);
  const shoppingHiddenPrefix = useMemo(
    () => shoppingHiddenPrefixForRange(shoppingDateRange),
    [shoppingDateRange.startDate, shoppingDateRange.endDate]
  );
  const rangeHiddenShoppingItems = useMemo(() => {
    const scopedHiddenItems: Record<string, boolean> = {};

    Object.entries(state.hiddenShoppingItems).forEach(([key, hidden]) => {
      if (hidden && key.startsWith(shoppingHiddenPrefix)) {
        scopedHiddenItems[key.slice(shoppingHiddenPrefix.length)] = true;
      }
    });

    return scopedHiddenItems;
  }, [shoppingHiddenPrefix, state.hiddenShoppingItems]);
  const shoppingList = useMemo(
    () =>
      generateShoppingList(
        state.recipes,
        state.plannedMeals.filter((meal) => meal.date >= shoppingDateRange.startDate && meal.date <= shoppingDateRange.endDate),
        state.settings,
        state.shoppingChecks,
        rangeHiddenShoppingItems,
        state.manualShoppingItems
      ),
    [rangeHiddenShoppingItems, shoppingDateRange, state]
  );
  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.toLowerCase().trim();
    return state.recipes
      .filter((recipe) => {
        if (recipeGroupFilter !== "all" && !recipe.mealTypes.includes(recipeGroupFilter)) return false;
        if (!query) return true;
        return (
          recipe.title.toLowerCase().includes(query) ||
          (recipe.source ?? recipe.sourceUrl ?? "").toLowerCase().includes(query) ||
          recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title));
  }, [recipeGroupFilter, recipeSearch, state.recipes]);
  const recipeFrequencies = useMemo(() => {
    return state.plannedMeals.reduce<Record<string, number>>((counts, meal) => {
      if (meal.recipeId) counts[meal.recipeId] = (counts[meal.recipeId] ?? 0) + 1;
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
  const plannedRecipeIds = new Set(state.plannedMeals.map((meal) => meal.recipeId).filter((recipeId): recipeId is string => Boolean(recipeId)));
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

    let active = true;

    client.auth.getUser().then(({ data }) => {
      if (!active) return;
      void connectCloudUser(data.user);
    });

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void connectCloudUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
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
    const hydratedDraft = {
      ...nextDraft,
      mealTypes: normalizeMealTypes(nextDraft.mealTypes, inferRecipeMealTypes(nextDraft)[0]),
      source: nextDraft.source ?? nextDraft.sourceUrl ?? "",
      suppressedAutoTags: normalizeSuppressedAutomaticTags(nextDraft.suppressedAutoTags)
    };
    setDraft(hydratedDraft);
    setTagInput(hydratedDraft.tags.filter((tag) => !isAutomaticRecipeTag(tag)).join(", "));
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
      ]
    }));
    setMealPicker(null);
    setMealPickerQuery("");
  }

  function addManualPlannedMeal(date: string, slot: MealSlot, title: string) {
    const manualTitle = title.trim();
    if (!manualTitle) return;

    updateState((current) => ({
      ...current,
      plannedMeals: [
        ...current.plannedMeals,
        {
          id: createId("meal"),
          date,
          slot,
          manualTitle,
          peopleCount: current.settings.defaultPeople
        }
      ]
    }));
    setMealPicker(null);
    setMealPickerQuery("");
  }

  function movePlannedMeal(id: string, date: string, slot: MealSlot) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.map((meal) => (meal.id === id ? { ...meal, date, slot } : meal))
    }));
  }

  function updatePlannedMeal(id: string, patch: Partial<Pick<(typeof state.plannedMeals)[number], "peopleCount" | "notes" | "producesLeftovers" | "leftoverTargetDate">>) {
    const normalizedPatch =
      typeof patch.peopleCount === "number" ? { ...patch, peopleCount: Math.max(0, patch.peopleCount) } : patch;

    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.map((meal) => (meal.id === id ? { ...meal, ...normalizedPatch } : meal))
    }));
  }

  function removePlannedMeal(id: string) {
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.filter((meal) => meal.id !== id)
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
          manualTitle: meal.recipeId ? undefined : meal.manualTitle,
          peopleCount: 0,
          notes: "Leftovers"
        }
      ]
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
      plannedMeals: [...current.plannedMeals, ...newMeals]
    }));
    setWeekStart(formatDateKey(nextWeek));
  }

  function clearWeek() {
    const dayKeys = new Set(days.map(formatDateKey));
    updateState((current) => ({
      ...current,
      plannedMeals: current.plannedMeals.filter((meal) => !dayKeys.has(meal.date)),
      shoppingChecks: {}
    }));
  }

  function saveDraft() {
    const cleanedDraft: ImportDraft = {
      ...draft,
      title: draft.title.trim() || "Untitled recipe",
      servings: Math.max(1, Number(draft.servings) || 4),
      mealTypes: normalizeMealTypes(draft.mealTypes),
      source: draft.source?.trim(),
      suppressedAutoTags: normalizeSuppressedAutomaticTags(draft.suppressedAutoTags),
      tags: parseTags(tagInput),
      ingredients: draft.ingredients
        .filter((ingredient) => ingredient.name.trim())
        .map((ingredient) => ({
          ...ingredient,
          id: ingredient.id || createId("ing"),
          unit: normalizeUnit(ingredient.unit),
          category: ingredient.category || inferCategory(ingredient.name),
          canonicalName: ingredient.canonicalName || canonicalizeIngredientName(ingredient.name).canonicalName,
          needsReview: ingredient.needsReview ?? ingredient.confidence === "low"
        })),
      instructions: draft.instructions.map((step) => step.trim()).filter(Boolean)
    };
    cleanedDraft.tags = mergeAutomaticRecipeTags(cleanedDraft.tags, cleanedDraft, cleanedDraft.suppressedAutoTags);
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
          )
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
      plannedMeals: current.plannedMeals.filter((meal) => meal.recipeId !== recipeId)
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
	              category: patch.name && !patch.category ? inferCategory(patch.name) : patch.category ?? ingredient.category,
	              canonicalName: patch.name ? canonicalizeIngredientName(patch.name).canonicalName : patch.canonicalName ?? ingredient.canonicalName,
	              needsReview: patch.name ? false : patch.needsReview ?? ingredient.needsReview
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
        { id: createId("ing"), name: "", unit: "", category: "Other", canonicalName: "", confidence: "medium" }
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
        source: importUrl,
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
      let prepared: Awaited<ReturnType<typeof prepareRecipePhoto>>;
      let preprocessingWarning = "";

      try {
        prepared = await prepareRecipePhoto(photoFile, photoCropMode, photoRotation);
      } catch (error) {
        preprocessingWarning =
          error instanceof Error
            ? `${error.message} Private OCR is trying the original file instead.`
            : "Photo preprocessing failed. Private OCR is trying the original file instead.";
	        prepared = {
	          file: photoFile,
	          dataUrl: photoPreview || (await fileToDataUrl(photoFile)),
	          cropMode: photoCropMode,
	          rotation: normalizeRotation(photoRotation)
	        };
      }

      setCompressedPhotoFile(prepared.file);
      setPhotoPreview(prepared.dataUrl);
      setImportStatus("Reading photo privately on this device...");

      const { text, warning } = await recognizeRecipePhoto(prepared, photoFile, setImportStatus);
      setPhotoRawText(cleanOcrRecipeText(text));
      const payload = draftFromOcrText(text, photoFile.name);
      applyDraft({
        ...payload,
        source: payload.source ?? photoFile.name,
        photoDataUrl: prepared.dataUrl,
        warnings: Array.from(
          new Set([
            "Browser OCR was used for this draft. Review carefully before saving.",
            `OCR crop mode: ${photoCropMode === "whole" ? "whole recipe" : `${photoCropMode} only`}.`,
            ...(preprocessingWarning ? [preprocessingWarning] : []),
            ...(warning ? [warning] : []),
            ...payload.warnings
          ])
        )
      });
    } catch (error) {
      const heicAdvice = likelyHeicPhoto(photoFile)
        ? "This looks like an iPhone HEIC photo. Export/share it as JPEG, or use iPhone Photos > Share > Options > Most Compatible."
        : "";
      applyDraft({
        ...emptyDraft(),
        title: photoFile.name.replace(/\.[^.]+$/, ""),
        importedFrom: "photo",
        photoDataUrl: photoPreview,
        warnings: [
          error instanceof Error ? error.message : "Browser OCR could not read this photo.",
          `Selected file: ${photoFile.name || "photo"} (${formatFileSize(photoFile.size)}${photoFile.type ? `, ${photoFile.type}` : ""}).`,
          ...(heicAdvice ? [heicAdvice] : []),
          "Try the free online OCR fallback or type/paste the recipe text into the review fields."
        ]
      });
    } finally {
      setImportStatus("");
    }
  }

  async function extractFromPhotoFallback() {
    if (!photoFile) return;
    setImportStatus("Preparing photo for free online OCR...");

    try {
      let prepared: Awaited<ReturnType<typeof prepareRecipePhoto>>;
      let preprocessingWarning = "";

      try {
        prepared = await prepareRecipePhoto(photoFile, photoCropMode, photoRotation, 1800, 0.8);
      } catch (error) {
        preprocessingWarning =
          error instanceof Error
            ? `${error.message} Online OCR is trying the original file instead.`
            : "Photo preprocessing failed. Online OCR is trying the original file instead.";
        prepared = {
          file: photoFile,
          dataUrl: photoPreview || (await fileToDataUrl(photoFile)),
          cropMode: photoCropMode,
          rotation: normalizeRotation(photoRotation)
        };
      }

      setCompressedPhotoFile(prepared.file);
      setPhotoPreview(prepared.dataUrl);
      setImportStatus("Sending selected crop to free online OCR...");

      const formData = new FormData();
      formData.append("source", "ocr-space");
      formData.append("cropMode", photoCropMode);
      formData.append("photo", prepared.file);

      const response = await fetch("/api/import/photo", { method: "POST", body: formData });
      const responseText = await response.text();
      const payload = parseJsonResponse<ImportDraft | { error?: string }>(responseText, "Online OCR failed.");

      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Online OCR failed.");
      }

      const nextDraft = payload as ImportDraft;
      setPhotoRawText(cleanOcrRecipeText(nextDraft.rawText || [...nextDraft.ingredients.map((ingredient) => ingredient.originalLine || ingredient.name), ...nextDraft.instructions].join("\n")));
      applyDraft({
        ...nextDraft,
        photoDataUrl: prepared.dataUrl,
	        warnings: Array.from(
	          new Set([
	            `Online OCR crop mode: ${photoCropMode === "whole" ? "whole recipe" : `${photoCropMode} only`}.`,
	            ...(preprocessingWarning ? [preprocessingWarning] : []),
	            ...nextDraft.warnings
	          ])
	        )
      });
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
    setPhotoRawText("");
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function reparsePhotoRawText() {
    const text = cleanOcrRecipeText(photoRawText);
    if (!text.trim()) return;
    const payload = draftFromOcrText(text, photoFile?.name || "Photo import");
    applyDraft({
      ...payload,
      source: payload.source ?? photoFile?.name ?? draft.source,
      photoDataUrl: photoPreview || draft.photoDataUrl,
      warnings: Array.from(new Set(["Raw OCR text was re-parsed. Review before saving.", ...payload.warnings]))
    });
    setPhotoRawText(text);
  }

  function moveOcrLineToIngredients(line: string) {
    const cleanedLine = line.trim();
    if (!cleanedLine) return;
    const parsed = parseIngredientLine(cleanedLine, { strict: false });
    setDraft((current) => ({
      ...current,
      ingredients: [
        ...current.ingredients,
        {
          ...parsed,
          originalLine: cleanedLine,
          confidence: parsed.confidence === "high" ? "medium" : parsed.confidence,
          needsReview: true
        }
      ],
      warnings: Array.from(new Set([...current.warnings, "A raw OCR line was moved into ingredients. Check the quantity and unit."]))
    }));
  }

  function moveOcrLineToMethod(line: string) {
    const cleanedLine = line.trim();
    if (!cleanedLine) return;
    setDraft((current) => ({
      ...current,
      instructions: [...current.instructions.filter((step) => step.trim() !== "Add cooking instructions."), cleanedLine],
      warnings: Array.from(new Set([...current.warnings, "A raw OCR line was moved into the method."]))
    }));
  }

  function rememberIngredientMerge(aliasName: string, canonicalName: string) {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ingredientAliases: {
          ...(current.settings.ingredientAliases ?? {}),
          [canonicalizeIngredientName(aliasName).normalizedName]: canonicalizeIngredientName(canonicalName).canonicalName
        }
      }
    }));
  }

  function undoIngredientConsolidation(item: ShoppingListItem) {
    if (!item.mergeKey) return;

    updateState((current) => {
      return {
        ...current,
        settings: {
          ...current.settings,
          splitShoppingItems: {
            ...(current.settings.splitShoppingItems ?? {}),
            [item.mergeKey!]: true
          }
        }
      };
    });
  }

  function restoreIngredientConsolidation(item: ShoppingListItem) {
    const splitGroupKey = item.splitGroupKey;
    if (!splitGroupKey) return;

    updateState((current) => {
      const splitShoppingItems = { ...(current.settings.splitShoppingItems ?? {}) };

      delete splitShoppingItems[splitGroupKey];

      return {
        ...current,
        settings: {
          ...current.settings,
          splitShoppingItems
        }
      };
    });
  }

  function addManualShoppingItem(event: FormEvent) {
    event.preventDefault();
    if (!manualItemName.trim()) return;

	  const item: ShoppingListItem = {
	    id: createId("manual"),
	    name: manualItemName.trim(),
	    canonicalName: canonicalizeIngredientName(manualItemName).canonicalName,
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
    const hiddenItemKey = shoppingHiddenItemKey(shoppingDateRange, item.id);

    updateState((current) => {
      if (item.manual) {
        return {
          ...current,
          manualShoppingItems: current.manualShoppingItems.filter((manual) => manual.id !== item.id)
        };
      }

      return {
        ...current,
        hiddenShoppingItems: { ...current.hiddenShoppingItems, [hiddenItemKey]: true }
      };
    });
  }

  function forgetHiddenShoppingItems() {
    updateState((current) => (Object.keys(current.hiddenShoppingItems).length ? { ...current, hiddenShoppingItems: {} } : current));
  }

  function updateShoppingStartDate(value: string) {
    setShoppingStartDate(value);
    forgetHiddenShoppingItems();
  }

  function updateShoppingEndDate(value: string) {
    setShoppingEndDate(value);
    forgetHiddenShoppingItems();
  }

  function restoreHiddenGeneratedShoppingItems() {
    updateState((current) => ({
      ...current,
      hiddenShoppingItems: Object.fromEntries(
        Object.entries(current.hiddenShoppingItems).filter(([key]) => !key.startsWith(shoppingHiddenPrefix))
      )
    }));
  }

  async function copyShoppingList() {
    const text = shoppingList
      .map((item) => {
        const conversion = item.conversionNotes?.length ? ` (${item.conversionNotes.join("; ")})` : "";
        return `${item.checked ? "[x]" : "[ ]"} ${item.displayQuantity ? `${item.displayQuantity} ` : ""}${item.name}${conversion}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
  }

  function updateSettings(patch: Partial<AppState["settings"]>) {
    updateState((current) => ({
      ...current,
      settings: { ...current.settings, ...patch }
    }));
  }

  async function resolveSnapshotOwnerForUser(userId: string, email?: string | null) {
    const client = getSupabaseClient();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!client || !normalizedEmail) return userId;

    const { data, error } = await client
      .from("household_snapshot_members")
      .select("owner_user_id")
      .eq("member_email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (error) {
      setCloudMessage(`Shared household lookup failed: ${error.message}. Using your own household.`);
      return userId;
    }

    const ownerUserId = typeof data?.owner_user_id === "string" ? data.owner_user_id : userId;

    if (ownerUserId !== userId) {
      setCloudMessage(`Using shared household for ${normalizedEmail}.`);
    }

    return ownerUserId;
  }

  async function connectCloudUser(user: { id: string; email?: string | null } | null) {
    setCloudUser(user?.email ?? null);

    if (!user) {
      cloudUserIdRef.current = null;
      cloudLoadedRef.current = false;
      setSyncStatus("local");
      return;
    }

    setSyncStatus("loading");
    const snapshotOwnerId = await resolveSnapshotOwnerForUser(user.id, user.email);
    cloudUserIdRef.current = snapshotOwnerId;
    await loadCloudSnapshotForUser(snapshotOwnerId);
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
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
            recipeGroupFilter={recipeGroupFilter}
            setRecipeGroupFilter={setRecipeGroupFilter}
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
	            photoCropMode={photoCropMode}
	            setPhotoCropMode={setPhotoCropMode}
	            photoRotation={photoRotation}
	            setPhotoRotation={setPhotoRotation}
	            photoRawText={photoRawText}
	            setPhotoRawText={setPhotoRawText}
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
	            onReparsePhotoRawText={reparsePhotoRawText}
	            onMoveOcrLineToIngredients={moveOcrLineToIngredients}
	            onMoveOcrLineToMethod={moveOcrLineToMethod}
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
            startDate={shoppingStartDate}
            endDate={shoppingEndDate}
            rangeStartDate={shoppingDateRange.startDate}
            rangeEndDate={shoppingDateRange.endDate}
            manualItemName={manualItemName}
            manualItemQuantity={manualItemQuantity}
            manualItemCategory={manualItemCategory}
            setStartDate={updateShoppingStartDate}
            setEndDate={updateShoppingEndDate}
            setManualItemName={setManualItemName}
            setManualItemQuantity={setManualItemQuantity}
            setManualItemCategory={setManualItemCategory}
            onResetDateRange={() => {
              const currentWeekStart = startOfWeek(new Date());
              setShoppingStartDate(formatDateKey(currentWeekStart));
              setShoppingEndDate(formatDateKey(addDays(currentWeekStart, 6)));
              forgetHiddenShoppingItems();
            }}
            onToggleIncludeStaples={(includeStaples) => updateSettings({ includeStaples })}
            onAddManualItem={addManualShoppingItem}
            onToggleItem={toggleShoppingItem}
            onUpdateManualItem={updateManualShoppingItem}
            onDeleteItem={deleteShoppingItem}
            onOpenRecipe={setSelectedRecipeId}
            onCopy={copyShoppingList}
            onPrint={() => window.print()}
            onRestoreGenerated={restoreHiddenGeneratedShoppingItems}
            onRememberIngredientMerge={rememberIngredientMerge}
            onUndoIngredientConsolidation={undoIngredientConsolidation}
            onRestoreIngredientConsolidation={restoreIngredientConsolidation}
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
            onAddManual={(title) => addManualPlannedMeal(mealPicker.date, mealPicker.slot, title)}
            onClose={() => setMealPicker(null)}
          />
        )}

        {selectedRecipe && (
          <RecipeDetailModal
            recipe={selectedRecipe}
            onClose={() => setSelectedRecipeId(null)}
            onEditRecipe={(recipe) => {
              setSelectedRecipeId(null);
              editRecipe(recipe);
            }}
          />
        )}
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
                        const recipe = meal.recipeId ? recipes.find((item) => item.id === meal.recipeId) : null;
                        const title = recipe?.title ?? meal.manualTitle;
                        if (!title) return null;
                        const mealMeta = recipe
                          ? `${recipe.tags.slice(0, 2).join(" · ") || "Saved recipe"}${
                              (recipeFrequencies[recipe.id] ?? 0) > 1 ? ` · planned ${recipeFrequencies[recipe.id]}x` : ""
                            }`
                          : meal.notes || "Manual plan";

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
                            {recipe ? (
                              <button className="meal-card-main" onClick={() => onOpenRecipe(recipe.id)}>
                                <strong>{title}</strong>
                                <span>{mealMeta}</span>
                              </button>
                            ) : (
                              <div className="meal-card-main manual-meal-main">
                                <strong>{title}</strong>
                                <span>{mealMeta}</span>
                              </div>
                            )}
                            <div className="meal-actions">
                              <label className="mini-input">
                                <Users size={15} />
                                <input
                                  aria-label="People eating"
                                  type="number"
                                  min={0}
                                  value={meal.peopleCount}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => {
                                    const peopleCount = Number(event.target.value);
                                    onUpdateMeal(meal.id, { peopleCount: Number.isFinite(peopleCount) ? Math.max(0, peopleCount) : 0 });
                                  }}
                                />
                              </label>
                              {recipe ? (
                                <button className="icon-button" title="Add leftovers to tomorrow lunch" onClick={() => onAddLeftovers(meal)}>
                                  <RefreshCw size={16} />
                                </button>
                              ) : null}
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
  recipeGroupFilter,
  setRecipeGroupFilter,
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
  recipeGroupFilter: RecipeGroupFilter;
  setRecipeGroupFilter: (value: RecipeGroupFilter) => void;
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
          <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder="Search meals, tags, sources, ingredients" />
        </label>
        <button className="primary-button" onClick={onAddRecipe}>
          <Plus size={18} />
          New recipe
        </button>
      </section>

      <div className="meal-group-tabs recipe-filter-tabs" aria-label="Recipe meal group filter">
        <button className={classNames(recipeGroupFilter === "all" && "active")} type="button" onClick={() => setRecipeGroupFilter("all")}>
          All
        </button>
        {mealSlots.map((slot) => (
          <button
            className={classNames(recipeGroupFilter === slot && "active")}
            key={slot}
            type="button"
            onClick={() => setRecipeGroupFilter(slot)}
          >
            {labelMealSlot(slot)}
          </button>
        ))}
      </div>

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
              <p>{recipe.mealTypes.map(labelMealSlot).join(", ")} · {recipe.ingredients.length} ingredients · serves {recipe.servings}</p>
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
  onAddManual,
  onClose
}: {
  target: { date: string; slot: MealSlot };
  recipes: Recipe[];
  recipeFrequencies: Record<string, number>;
  query: string;
  setQuery: (value: string) => void;
  onAdd: (recipeId: string) => void;
  onAddManual: (title: string) => void;
  onClose: () => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<MealPickerGroup>(target.slot);
  const [manualMealTitle, setManualMealTitle] = useState("");
  const groupedRecipes = recipes.filter((recipe) => selectedGroup === "all" || recipe.mealTypes.includes(selectedGroup));
  const frequentRecipes = groupedRecipes.filter((recipe) => (recipeFrequencies[recipe.id] ?? 0) > 0).slice(0, 5);
  const mainRecipes = query.trim()
    ? groupedRecipes
    : frequentRecipes.length > 0
      ? groupedRecipes.filter((recipe) => !frequentRecipes.some((frequent) => frequent.id === recipe.id)).slice(0, 10)
      : groupedRecipes.slice(0, 10);
  const selectedGroupLabel = selectedGroup === "all" ? "All meals" : labelMealSlot(selectedGroup);

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

        <div className="meal-group-tabs" aria-label="Recipe meal group">
          {mealSlots.map((slot) => (
            <button
              className={classNames(selectedGroup === slot && "active")}
              key={slot}
              type="button"
              onClick={() => setSelectedGroup(slot)}
            >
              {labelMealSlot(slot)}
            </button>
          ))}
          <button className={classNames(selectedGroup === "all" && "active")} type="button" onClick={() => setSelectedGroup("all")}>
            All
          </button>
        </div>

        <form
          className="manual-meal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onAddManual(manualMealTitle);
          }}
        >
          <input value={manualMealTitle} onChange={(event) => setManualMealTitle(event.target.value)} placeholder="Type a meal, e.g. takeaway" />
          <button className="icon-text-button" type="submit" disabled={!manualMealTitle.trim()}>
            <Plus size={18} />
            Add typed meal
          </button>
        </form>

        <div className="picker-list">
          {!query.trim() && frequentRecipes.length > 0 && (
            <>
              <span className="picker-section-label">Most chosen {selectedGroupLabel.toLowerCase()}</span>
              {frequentRecipes.map((recipe) => (
                <RecipePickerButton key={recipe.id} recipe={recipe} recipeFrequencies={recipeFrequencies} onAdd={onAdd} />
              ))}
            </>
          )}

          {(mainRecipes.length > 0 || groupedRecipes.length === 0) && (
            <span className="picker-section-label">{query.trim() ? `Matching ${selectedGroupLabel.toLowerCase()}` : `${selectedGroupLabel} recipes`}</span>
          )}
          {mainRecipes.map((recipe) => (
            <RecipePickerButton key={recipe.id} recipe={recipe} recipeFrequencies={recipeFrequencies} onAdd={onAdd} />
          ))}
          {groupedRecipes.length === 0 && <p className="muted">No matching meals in this group yet.</p>}
        </div>
      </section>
    </div>
  );
}

function RecipePickerButton({
  recipe,
  recipeFrequencies,
  onAdd
}: {
  recipe: Recipe;
  recipeFrequencies: Record<string, number>;
  onAdd: (recipeId: string) => void;
}) {
  return (
    <button className="picker-recipe" onClick={() => onAdd(recipe.id)}>
      <span>
        <strong>{recipe.title}</strong>
        <small>
          {recipe.mealTypes.map(labelMealSlot).join(" · ")}
          {recipe.tags.slice(0, 2).length ? ` · ${recipe.tags.slice(0, 2).join(" · ")}` : ""}
          {(recipeFrequencies[recipe.id] ?? 0) > 0 ? ` · chosen ${recipeFrequencies[recipe.id]}x` : ""}
        </small>
      </span>
      <Plus size={18} />
    </button>
  );
}

function RecipeDetailModal({
  recipe,
  onClose,
  onEditRecipe
}: {
  recipe: Recipe;
  onClose: () => void;
  onEditRecipe: (recipe: Recipe) => void;
}) {
  const totalMinutes = totalRecipeMinutes(recipe);
  const source = recipe.source ?? recipe.sourceUrl;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel recipe-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Recipe</p>
            <h2>{recipe.title}</h2>
          </div>
          <div className="button-row">
            <button className="icon-text-button" type="button" onClick={() => onEditRecipe(recipe)}>
              <Wand2 size={18} />
              Edit
            </button>
            <button className="icon-button" title="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="recipe-meta-row">
          <span>
            <Users size={16} />
            Serves {recipe.servings}
          </span>
          <span>{recipe.mealTypes.map(labelMealSlot).join(", ")}</span>
          <span>
            <Clock size={16} />
            {totalMinutes ? `${totalMinutes} mins total` : "Time not set"}
          </span>
          {recipe.prepMinutes ? <span>{recipe.prepMinutes} mins prep</span> : null}
          {recipe.cookMinutes ? <span>{recipe.cookMinutes} mins cook</span> : null}
          {source ? (
            <span>
              Source:{" "}
              {isHttpUrl(source) ? (
                <a href={source} target="_blank" rel="noreferrer">
                  link
                </a>
              ) : (
                source
              )}
            </span>
          ) : null}
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
  photoCropMode,
  setPhotoCropMode,
  photoRotation,
  setPhotoRotation,
  photoRawText,
  setPhotoRawText,
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
  onReparsePhotoRawText,
  onMoveOcrLineToIngredients,
  onMoveOcrLineToMethod,
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
  photoCropMode: PhotoCropMode;
  setPhotoCropMode: (mode: PhotoCropMode) => void;
  photoRotation: number;
  setPhotoRotation: (value: number | ((current: number) => number)) => void;
  photoRawText: string;
  setPhotoRawText: (value: string) => void;
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
  onReparsePhotoRawText: () => void;
  onMoveOcrLineToIngredients: (line: string) => void;
  onMoveOcrLineToMethod: (line: string) => void;
  onNewManual: () => void;
  onSaveDraft: () => void;
  onUpdateIngredient: (id: string, patch: Partial<Ingredient>) => void;
  onAddIngredient: () => void;
  onRemoveIngredient: (id: string) => void;
  onUpdateInstruction: (index: number, value: string) => void;
  onAddInstruction: () => void;
  onRemoveInstruction: (index: number) => void;
}) {
	  const suppressedAutoTags = normalizeSuppressedAutomaticTags(draft.suppressedAutoTags);
	  const automaticTags = inferAutomaticRecipeTags(draft).filter((tag) => !suppressedAutoTags.includes(tag));
	  const removedAutomaticTags = suppressedAutoTags.filter((tag) => inferAutomaticRecipeTags(draft).includes(tag));
	  const ocrLines = photoRawText
	    .split(/\r?\n/)
	    .map((line) => line.trim())
	    .filter(Boolean)
	    .slice(0, 40);

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
            <div className="photo-actions">
              <label className="photo-choice">
                <Camera size={22} />
                <span>Take photo</span>
                <input type="file" accept="image/*,.heic,.heif" capture="environment" onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)} />
              </label>
              <label className="photo-choice">
                <ImagePlus size={22} />
                <span>Choose photo</span>
                <input type="file" accept="image/*,.heic,.heif" onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="photo-controls">
              <label>
                <Crop size={16} />
                Crop
                <select value={photoCropMode} onChange={(event) => setPhotoCropMode(event.target.value as PhotoCropMode)}>
                  <option value="whole">Whole recipe</option>
                  <option value="ingredients">Ingredients only</option>
                  <option value="method">Method only</option>
                </select>
              </label>
              <button className="icon-text-button" type="button" onClick={() => setPhotoRotation((current) => normalizeRotation(current + 90))}>
                <RotateCw size={18} />
                Rotate {photoRotation ? `${photoRotation}°` : ""}
              </button>
            </div>
            {photoFile && <span className="selected-photo-name">{photoFile.name}</span>}
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
            {photoRawText && (
              <div className="ocr-review-tools">
                <label>
                  Raw OCR text
                  <textarea value={photoRawText} onChange={(event) => setPhotoRawText(event.target.value)} rows={7} />
                </label>
                <button className="icon-text-button" type="button" onClick={onReparsePhotoRawText}>
                  <RefreshCw size={17} />
                  Re-parse text
                </button>
                <div className="ocr-line-list">
                  {ocrLines.map((line, index) => (
                    <div className="ocr-line" key={`${index}-${line}`}>
                      <span>{line}</span>
                      <button type="button" title="Move to ingredients" onClick={() => onMoveOcrLineToIngredients(line)}>
                        <Plus size={15} />
                        Ingredient
                      </button>
                      <button type="button" title="Move to method" onClick={() => onMoveOcrLineToMethod(line)}>
                        <Plus size={15} />
                        Method
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
          Recipe source
          <input
            value={draft.source ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
            placeholder="URL, cookbook page, magazine, family recipe"
          />
        </label>

        <div className="editor-section">
          <div className="section-heading">
            <h3>Meal group</h3>
          </div>
          <div className="toggle-grid meal-type-grid">
            {mealSlots.map((slot) => {
              const active = draft.mealTypes.includes(slot);
              return (
                <button
                  className={classNames("toggle-tile", active && "active")}
                  key={slot}
                  type="button"
                  onClick={() =>
                    setDraft((current) => {
                      const currentlyActive = current.mealTypes.includes(slot);
                      const mealTypes = currentlyActive
                        ? current.mealTypes.filter((mealType) => mealType !== slot)
                        : [...current.mealTypes, slot];

                      return { ...current, mealTypes: mealTypes.length ? mealTypes : [slot] };
                    })
                  }
                >
                  {labelMealSlot(slot)}
                </button>
              );
            })}
          </div>
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
                <button
                  className="tag-chip-button"
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      suppressedAutoTags: normalizeSuppressedAutomaticTags([...(current.suppressedAutoTags ?? []), tag])
                    }))
                  }
                >
                  {tag}
                  <X size={14} />
                </button>
              ))}
            </>
          ) : (
            <span>Automatic meal-type and time tags are kept up to date when saved.</span>
          )}
          {removedAutomaticTags.length > 0 && (
            <>
              <span>Removed auto tags</span>
              {removedAutomaticTags.map((tag) => (
                <button
                  className="tag-chip-button muted-chip"
                  key={tag}
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      suppressedAutoTags: normalizeSuppressedAutomaticTags(current.suppressedAutoTags).filter((item) => item !== tag)
                    }))
                  }
                >
                  {tag}
                  <Plus size={14} />
                </button>
              ))}
            </>
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
	              <div
	                className={classNames("ingredient-row", (ingredient.confidence === "low" || ingredient.needsReview) && "needs-review")}
	                key={ingredient.id}
	              >
	                <input
	                  aria-label="Quantity"
	                  className="qty-input"
	                  type="number"
	                  min={0}
	                  step="0.25"
	                  value={ingredient.quantity ?? ""}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { quantity: parseNumberInput(event.target.value), needsReview: false })}
	                />
	                <input
	                  aria-label="Unit"
	                  className="unit-input"
	                  value={ingredient.unit ?? ""}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { unit: event.target.value, needsReview: false })}
	                  placeholder="unit"
	                />
	                <input
	                  aria-label="Ingredient"
	                  value={ingredient.name}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { name: event.target.value })}
	                  onBlur={(event) => {
	                    if (!ingredient.quantity && !ingredient.unit && event.target.value.trim()) {
	                      const parsed = parseIngredientLine(event.target.value);
	                      if (parsed.name !== event.target.value) onUpdateIngredient(ingredient.id, { ...parsed, id: ingredient.id, needsReview: false });
	                    }
	                  }}
	                  placeholder="ingredient"
	                />
	                <select
	                  aria-label="Category"
	                  value={ingredient.category}
	                  onChange={(event) => onUpdateIngredient(ingredient.id, { category: event.target.value as GroceryCategory, needsReview: false })}
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
	                {(ingredient.needsReview || ingredient.originalLine) && (
	                  <small className="ingredient-review-note">
	                    {ingredient.needsReview ? "Check this line" : "Imported line"}{ingredient.originalLine ? `: ${ingredient.originalLine}` : ""}
	                  </small>
	                )}
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
  startDate,
  endDate,
  rangeStartDate,
  rangeEndDate,
  manualItemName,
  manualItemQuantity,
  manualItemCategory,
  setStartDate,
  setEndDate,
  setManualItemName,
  setManualItemQuantity,
  setManualItemCategory,
  onResetDateRange,
  onToggleIncludeStaples,
  onAddManualItem,
  onToggleItem,
  onUpdateManualItem,
  onDeleteItem,
  onOpenRecipe,
  onCopy,
  onPrint,
  onRestoreGenerated,
  onRememberIngredientMerge,
  onUndoIngredientConsolidation,
  onRestoreIngredientConsolidation
}: {
  items: ShoppingListItem[];
  settings: AppState["settings"];
  startDate: string;
  endDate: string;
  rangeStartDate: string;
  rangeEndDate: string;
  manualItemName: string;
  manualItemQuantity: string;
  manualItemCategory: GroceryCategory;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  setManualItemName: (value: string) => void;
  setManualItemQuantity: (value: string) => void;
  setManualItemCategory: (value: GroceryCategory) => void;
  onResetDateRange: () => void;
  onToggleIncludeStaples: (value: boolean) => void;
  onAddManualItem: (event: FormEvent) => void;
  onToggleItem: (id: string, checked: boolean) => void;
  onUpdateManualItem: (id: string, patch: Partial<ShoppingListItem>) => void;
  onDeleteItem: (item: ShoppingListItem) => void;
  onOpenRecipe: (recipeId: string) => void;
  onCopy: () => void;
  onPrint: () => void;
  onRestoreGenerated: () => void;
  onRememberIngredientMerge: (aliasName: string, canonicalName: string) => void;
  onUndoIngredientConsolidation: (item: ShoppingListItem) => void;
  onRestoreIngredientConsolidation: (item: ShoppingListItem) => void;
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
          <p className="eyebrow">Generated from selected dates</p>
          <h2>{items.length} shopping items</h2>
          <p className="muted">
            {dateFormatter.format(new Date(`${rangeStartDate}T12:00:00`))} to {dateFormatter.format(new Date(`${rangeEndDate}T12:00:00`))}
          </p>
        </div>
        <div className="button-row">
          <div className="date-range-controls">
            <label>
              From
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <button className="text-button" onClick={onResetDateRange}>This week</button>
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
              {group.items.map((item) => {
                const sourceRecipeId = item.sourceRecipeIds?.[0];

                return (
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
                      <div
                        className={classNames("shopping-text", sourceRecipeId && "clickable")}
                        role={sourceRecipeId ? "button" : undefined}
                        tabIndex={sourceRecipeId ? 0 : undefined}
                        onClick={() => {
                          if (sourceRecipeId) onOpenRecipe(sourceRecipeId);
                        }}
                        onKeyDown={(event) => {
                          if (!sourceRecipeId || (event.key !== "Enter" && event.key !== " ")) return;
                          event.preventDefault();
                          onOpenRecipe(sourceRecipeId);
                        }}
                      >
                        <strong>
                          {item.displayQuantity && <span>{item.displayQuantity}</span>} {item.name}
                        </strong>
                        <small>
                          {item.sourceMeals.join(", ")}
                          {item.incompatible ? " · check unit" : ""}
                          {item.staple ? " · staple" : ""}
                          {item.splitFromConsolidation ? " · split from consolidated item" : ""}
                          {item.sourceIngredients && item.sourceIngredients.length > 1 ? ` · combines ${item.sourceIngredients.join(", ")}` : ""}
                        </small>
                        {item.conversionNotes?.length ? <small className="shopping-note">Metric conversion: {item.conversionNotes.join("; ")}</small> : null}
                        {item.mergeWarnings?.length ? <small className="shopping-note">{item.mergeWarnings.join(" ")}</small> : null}
                        {(item.canSplitMerge || item.canRestoreMerge || item.mergeSuggestion) && (
                          <div className="shopping-inline-actions" onClick={(event) => event.stopPropagation()}>
                            {item.canSplitMerge && (
                              <button className="text-button" type="button" onClick={() => onUndoIngredientConsolidation(item)}>
                                <RefreshCw size={15} />
                                Split consolidation
                              </button>
                            )}
                            {item.canRestoreMerge && (
                              <button className="text-button" type="button" onClick={() => onRestoreIngredientConsolidation(item)}>
                                <Check size={15} />
                                Combine again
                              </button>
                            )}
                            {item.mergeSuggestion && (
                              <button
                                className="text-button"
                                type="button"
                                onClick={() => onRememberIngredientMerge(item.mergeSuggestion!.aliasName, item.mergeSuggestion!.canonicalName)}
                              >
                                <Check size={15} />
                                {item.mergeSuggestion.label}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button className="icon-button danger" title={item.manual ? "Delete item" : "Hide generated item"} onClick={() => onDeleteItem(item)}>
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              })}
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
