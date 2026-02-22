// src/services/api.ts
// StockCount - API calls

const API_URL = 'https://ai-platform-backend-h6l1.onrender.com/api/inventory-count-mobile';

// Types
export interface Count {
  id: number;
  counter_user_id: number;
  counter_name: string;
  branch: 'הפצה' | 'חנות';
  status: 'IN_PROGRESS' | 'COMPLETED';
  created_at: string;
  end_date: string | null;
  total_items: number;
  unique_items: number;
}

export interface CountItem {
  id: number;
  count_id: number;
  item_code: string;
  item_name: string;
  department: string | null;
  item_group: string | null;
  subgroup: string | null;
  scanned_barcode: string;
  failed_barcode: string | null;
  quantity_counted: number;
  comax_quantity: number | null;
  notes: string | null;
  stock_store: number | null;
  stock_distribution: number | null;
}

export interface ScanResult {
  success: boolean;
  found: boolean;
  barcode?: string;
  items?: Array<{
    item_code: string;
    prt_c: string;
    item_name: string;
    department: string;
    group: string;
    sub_group: string;
    all_barcodes: string;
    stock_store: number;
    stock_distribution: number;
    price: number;
  }>;
  already_counted?: {
    item_code: string;
    total_counted: number;
    count_times: number;
  } | null;
}

export interface SearchResult {
  success: boolean;
  items: Array<{
    item_code: string;
    prt_c: string;
    item_name: string;
    department: string;
    group: string;
    sub_group: string;
    all_barcodes: string;
    stock_store: number;
    stock_distribution: number;
    price: number;
  }>;
}

// API Functions

export async function fetchCounts(): Promise<Count[]> {
  const response = await fetch(`${API_URL}/counts`);
  const data = await response.json();
  if (data.success) {
    return data.counts;
  }
  throw new Error(data.error || 'Failed to fetch counts');
}

export async function createCount(branch: string, workerName: string): Promise<Count> {
  const response = await fetch(`${API_URL}/counts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch, worker_name: workerName }),
  });
  const data = await response.json();
  if (data.success) {
    return data.count;
  }
  throw new Error(data.error || 'Failed to create count');
}

export async function fetchCountDetails(countId: number): Promise<{ count: Count; items: CountItem[] }> {
  const response = await fetch(`${API_URL}/counts/${countId}`);
  const data = await response.json();
  if (data.success) {
    return { count: data.count, items: data.items };
  }
  throw new Error(data.error || 'Failed to fetch count details');
}

export async function scanBarcode(countId: number, barcode: string): Promise<ScanResult> {
  const response = await fetch(`${API_URL}/counts/${countId}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode }),
  });
  const data = await response.json();
  return data;
}

export async function addItemToCount(
  countId: number,
  itemCode: string,
  scannedBarcode: string,
  quantityCounted: number,
  notes?: string,
  failedBarcode?: string
): Promise<CountItem> {
  const response = await fetch(`${API_URL}/counts/${countId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_code: itemCode,
      scanned_barcode: scannedBarcode,
      quantity_counted: quantityCounted,
      notes: notes || null,
      failed_barcode: failedBarcode || null,
    }),
  });
  const data = await response.json();
  if (data.success) {
    return data.item;
  }
  throw new Error(data.error || 'Failed to add item');
}

export async function updateCountItem(
  itemId: number,
  quantityCounted?: number,
  notes?: string
): Promise<CountItem> {
  const response = await fetch(`${API_URL}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity_counted: quantityCounted, notes }),
  });
  const data = await response.json();
  if (data.success) {
    return data.item;
  }
  throw new Error(data.error || 'Failed to update item');
}

export async function deleteCountItem(itemId: number): Promise<void> {
  const response = await fetch(`${API_URL}/items/${itemId}`, {
    method: 'DELETE',
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to delete item');
  }
}

export async function completeCount(countId: number): Promise<void> {
  const response = await fetch(`${API_URL}/counts/${countId}/complete`, {
    method: 'PATCH',
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to complete count');
  }
}

export async function searchItems(query: string): Promise<SearchResult> {
  const response = await fetch(`${API_URL}/search-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await response.json();
  return data;
}
