declare const chrome: any;

type StoreShoppingStatus = "opened" | "added" | "unavailable";

interface AsdaHelperQueueItem {
  itemId: string;
  shoppingKey: string;
  statusKey: string;
  name: string;
  canonicalName?: string;
  displayQuantity: string;
  quantity?: number;
  unit?: string;
  requiredQuantity?: number;
  requiredUnit?: string;
  category: string;
  sourceMeals: string[];
  sourceIngredients?: string[];
  avoidTerms?: string[];
  savedProductUrl: string;
  searchUrl: string;
  status?: StoreShoppingStatus;
}

interface AsdaHelperQueue {
  version: 1;
  createdAt: string;
  sourceUrl: string;
  rangeStartDate: string;
  rangeEndDate: string;
  items: AsdaHelperQueueItem[];
}

interface AsdaHelperState {
  queue?: AsdaHelperQueue;
  currentIndex: number;
  activeAsdaTabId?: number;
  productLinks: Record<string, string>;
  itemStatus: Record<string, StoreShoppingStatus>;
  autoAddReviews?: AutoAddReviewItem[];
  lastRecommendations?: Record<string, AsdaLastRecommendation>;
  rejectedRecommendations?: Record<string, string[]>;
  lastAutoAddMessage?: string;
  lastImportedAt?: string;
}

interface AutoAddReviewItem {
  itemId: string;
  name: string;
  displayQuantity: string;
  openUrl: string;
  reason: string;
}

interface AsdaProductCandidate {
  url: string;
  name: string;
  imageUrl?: string;
  priceText?: string;
  unitPriceText?: string;
  offerText?: string;
  packSizeText?: string;
  available?: boolean;
  addable?: boolean;
  quantity?: number;
  unit?: string;
  rawText?: string;
}

interface AsdaBasketLine {
  index: number;
  url?: string;
  name: string;
  rawText?: string;
  lineQuantity?: number;
  packQuantity?: number;
  packUnit?: string;
  totalQuantity?: number;
  totalUnit?: string;
  canIncrease?: boolean;
}

type AsdaBasketCheckStatus = "ok" | "short" | "missing" | "unknown";

interface AsdaBasketCheck {
  itemId: string;
  shoppingKey: string;
  name: string;
  displayQuantity: string;
  sourceMeals: string[];
  status: AsdaBasketCheckStatus;
  requiredQuantity?: number;
  requiredUnit?: string;
  basketQuantity?: number;
  basketUnit?: string;
  basketLineIndex?: number;
  basketLineName?: string;
  basketProductUrl?: string;
  openUrl: string;
  message: string;
  canIncrease?: boolean;
}

interface AsdaRecommendation {
  product: AsdaProductCandidate;
  score: number;
  reasons: string[];
  warnings?: string[];
}

interface AsdaLastRecommendation {
  itemId: string;
  shoppingKey: string;
  productUrl: string;
  productName: string;
  priceText?: string;
  unitPriceText?: string;
  offerText?: string;
  selectedAt: string;
}

interface AsdaHelperRuntimeMessage {
  type?: string;
  queue?: AsdaHelperQueue;
  itemId?: string;
  status?: StoreShoppingStatus;
  productUrl?: string;
  candidate?: AsdaProductCandidate;
  advance?: boolean;
  openNext?: boolean;
  fallbackState?: AsdaHelperState;
  payload?: Record<string, unknown>;
}

interface AsdaHelperRuntimeResponse {
  ok: boolean;
  state?: AsdaHelperState;
  item?: AsdaHelperQueueItem;
  openUrl?: string;
  tabId?: number;
  message?: string;
  error?: string;
}
