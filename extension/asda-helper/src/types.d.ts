declare const chrome: any;

type StoreShoppingStatus = "opened" | "added" | "unavailable";

interface AsdaHelperQueueItem {
  itemId: string;
  shoppingKey: string;
  statusKey: string;
  name: string;
  displayQuantity: string;
  quantity?: number;
  unit?: string;
  category: string;
  sourceMeals: string[];
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

interface AsdaHelperRuntimeMessage {
  type?: string;
  queue?: AsdaHelperQueue;
  itemId?: string;
  status?: StoreShoppingStatus;
  productUrl?: string;
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
