// src/services/api.ts
// שירות API - כל הקריאות לשרת

const API_URL = 'https://ai-platform-backend-h6l1.onrender.com/api/warehouse-picking';

// טיפוסים
export interface Order {
  id: number;
  comax_order_id: string;
  customer_name: string;
  customer_id: string;
  order_date: string;
  supply_date: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'completed_with_issues';
  total_items: number;
  scanned_items: number;
  started_at: string | null;
  worker_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface OrderItem {
  id: number;
  item_id: string;
  item_name: string;
  quantity_ordered: number;
  quantity_scanned: number | null;
  status: 'pending' | 'complete' | 'partial' | 'missing';
  barcode: string;
  all_barcodes: string | null;
}

export interface OrderDetails {
  order: Order;
  items: OrderItem[];
  summary: {
    total_items: number;
    scanned_items: number;
    completed_items: number;
    partial_items: number;
    missing_items: number;
    completion_percentage: number;
  };
}

export interface CheckBarcodeResult {
  success: boolean;
  in_order: boolean;
  found_in_system: boolean;
  item?: {
    item_id: string;
    name: string;
    quantity_ordered: number;
    quantity_scanned: number;
    status: string;
    all_barcodes?: string;
  };
  message?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  closed: number;
  error?: string;
}

// פונקציות API

export async function fetchOrders(): Promise<Order[]> {
  const response = await fetch(`${API_URL}/orders`);
  const data = await response.json();
  if (data.success) {
    return data.orders;
  }
  throw new Error(data.error || 'Failed to fetch orders');
}

export async function syncWithComax(days: number = 30): Promise<SyncResult> {
  const response = await fetch(`${API_URL}/sync?days=${days}`, {
    method: 'POST',
  });
  const data = await response.json();
  return data;
}

export async function fetchOrderDetails(orderId: number): Promise<OrderDetails> {
  const response = await fetch(`${API_URL}/orders/${orderId}`);
  const data = await response.json();
  if (data.success) {
    return data;
  }
  throw new Error(data.error || 'Failed to fetch order details');
}

export async function startPicking(orderId: number, workerName: string): Promise<void> {
  const response = await fetch(`${API_URL}/orders/${orderId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker_name: workerName }),
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to start picking');
  }
}

export async function checkBarcodeInOrder(orderId: number, barcode: string): Promise<CheckBarcodeResult> {
  const response = await fetch(`${API_URL}/orders/${orderId}/check-barcode/${barcode}`);
  const data = await response.json();
  return data;
}

export async function updateScannedItem(
  orderId: number,
  itemId: string,
  quantityScanned: number
): Promise<void> {
  const response = await fetch(`${API_URL}/orders/${orderId}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId, quantity_scanned: quantityScanned }),
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to update scanned item');
  }
}

export async function completePicking(orderId: number, notes?: string): Promise<void> {
  const response = await fetch(`${API_URL}/orders/${orderId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to complete picking');
  }
}
