// src/screens/CountingScreen.tsx
// מסך ספירה - סריקה + הוספת פריטים

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Modal,
  Switch,
} from 'react-native';
import Sound from 'react-native-sound';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import {
  Count,
  CountItem,
  ScanResult,
  fetchCountDetails,
  scanBarcode,
  addItemToCount,
  updateCountItem,
  deleteCountItem,
  completeCount,
  reopenCount,
  searchItems,
} from '../services/api';
import { CountedItemRow } from '../components/CountedItemRow';
import { useScanner } from '../hooks/useScanner';

// Audio feedback — same pattern as SunmiScanner's SerialScanScreen
Sound.setCategory('Playback');
let successSound: Sound | null = null;
let errorSound: Sound | null = null;
let warningSound: Sound | null = null;
function loadSounds() {
  if (!successSound) successSound = new Sound('success.mp3', Sound.MAIN_BUNDLE, () => {});
  if (!errorSound) errorSound = new Sound('error.mp3', Sound.MAIN_BUNDLE, () => {});
  if (!warningSound) warningSound = new Sound('warning.mp3', Sound.MAIN_BUNDLE, () => {});
}
function playSuccess() { successSound?.stop(() => successSound?.play()); }
function playError() { errorSound?.stop(() => errorSound?.play()); }
function playWarning() { warningSound?.stop(() => warningSound?.play()); }

interface CountingScreenProps {
  count: Count;
  onBack: () => void;
}

interface ScannedProduct {
  item_code: string;
  item_name: string;
  department: string;
  group: string;
  sub_group: string;
  stock_store: number;
  stock_distribution: number;
  already_counted?: { total_counted: number; count_times: number } | null;
}

export function CountingScreen({ count, onBack }: CountingScreenProps) {
  const [items, setItems] = useState<CountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [countStatus, setCountStatus] = useState(count.status);

  // Scanned product state
  const [scannedProduct, setScannedProduct] = useState<ScannedProduct | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [lastBarcode, setLastBarcode] = useState('');

  // Failed barcode tracking
  const [failedBarcode, setFailedBarcode] = useState<string | null>(null);

  // Search modal
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Edit modal
  const [editItem, setEditItem] = useState<CountItem | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // "Auto 1" mode — each trigger press = one scan = silent +1, no dialog.
  // Hardware stays in single-shot (no held-trigger auto-fire), so dedup isn't
  // needed: one physical pull = one count. Duplicates of the same code are fine
  // (each physical unit gets its own row when the user pulls the trigger again).
  const [continuousMode, setContinuousMode] = useState(false);

  // Filter list of counted items
  const [itemsFilter, setItemsFilter] = useState('');

  // ID of the most recently added row — drives the "↶ Undo last" button
  const [lastAddedItemId, setLastAddedItemId] = useState<number | null>(null);

  // CHECKPOINT — list of shelf boundaries (item IDs). Each adjacent pair (plus 0
  // and infinity at the ends) defines a "shelf". The user can press CHECKPOINT
  // to close the current shelf and start a new one, or open the shelves modal
  // to revisit / clear any past shelf.
  const [checkpoints, setCheckpoints] = useState<number[]>([]);
  const [clearing, setClearing] = useState(false);
  const [shelvesModalOpen, setShelvesModalOpen] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const quantityRef = useRef<TextInput>(null);

  // Tiny dedup guard — the Chainway SDK very occasionally delivers the same
  // trigger pull as two events 50-150ms apart. Block re-entry for 300ms after
  // any processed scan so one physical pull = one count.
  const cooldownUntilRef = useRef<number>(0);
  const COOLDOWN_MS = 300;

  // Process barcode from scanner or manual input
  const processBarcode = useCallback(async (scannedCode: string) => {
    if (!scannedCode.trim()) return;

    // In single-shot mode, block re-scan while the product card is open
    if (!continuousMode && scannedProduct) return;

    const code = scannedCode.trim();

    // Continuous-mode cooldown — drop everything that arrives during the
    // 1.5s lock. CRITICAL: arm the cooldown SYNCHRONOUSLY before any await,
    // otherwise the ~10 scan events that fire during the network request all
    // sail through and add duplicate rows.
    if (continuousMode) {
      if (Date.now() < cooldownUntilRef.current) return;
      cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    }

    setLastBarcode(code);

    try {
      const result: ScanResult = await scanBarcode(count.id, code);

      if (!result.found || !result.items || result.items.length === 0) {
        playError();
        if (continuousMode) {
          // Beep once and lock — otherwise the hardware's continuous fire
          // would keep beeping "not found" until the operator physically moves
          // the gun off the unknown barcode.
          cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
          return;
        }
        setFailedBarcode(code);
        setSearchQuery(code);
        setSearchVisible(true);
        return;
      }

      const product = result.items[0];

      // CONTINUOUS MODE — silent +1, no dialog. Each scan = one physical unit.
      if (continuousMode) {
        try {
          const newItem = await addItemToCount(count.id, product.item_code, code, 1, undefined, undefined);
          playSuccess();
          setLastAddedItemId(newItem?.id ?? null);
          await loadItems();
        } catch {
          playError();
        } finally {
          // Lock for COOLDOWN_MS after every processed continuous-mode read
          cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
        }
        return;
      }

      // SINGLE-SHOT MODE — open the product card with quantity input
      if (result.already_counted) playWarning();
      else playSuccess();

      setScannedProduct({
        item_code: product.item_code,
        item_name: product.item_name,
        department: product.department,
        group: product.group,
        sub_group: product.sub_group,
        stock_store: product.stock_store,
        stock_distribution: product.stock_distribution,
        already_counted: result.already_counted,
      });
      setQuantity('1');
      setNotes('');
      setTimeout(() => quantityRef.current?.focus(), 100);
    } catch (error) {
      playError();
      if (continuousMode) {
        cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
      } else {
        Alert.alert('שגיאה', 'בעיה בבדיקת הברקוד');
      }
    }
  }, [count.id, continuousMode, scannedProduct]);

  // Derive shelves from checkpoints + items. The last entry is always the
  // "current" (open) shelf; all earlier ones are closed and can be cleared.
  const shelves = useMemo(() => {
    const result: { index: number; startId: number; endId: number | null; items: CountItem[]; isCurrent: boolean }[] = [];
    let prev = 0;
    checkpoints.forEach((boundary, i) => {
      const shelfItems = items.filter(it => it.id > prev && it.id <= boundary);
      result.push({ index: i + 1, startId: prev, endId: boundary, items: shelfItems, isCurrent: false });
      prev = boundary;
    });
    const currentItems = items.filter(it => it.id > prev);
    result.push({ index: checkpoints.length + 1, startId: prev, endId: null, items: currentItems, isCurrent: true });
    return result;
  }, [items, checkpoints]);

  const currentShelf = shelves[shelves.length - 1];

  // CHECKPOINT — close the current shelf, start a new one
  const handleCheckpoint = () => {
    const maxId = items.reduce((m, i) => Math.max(m, i.id), 0);
    if (maxId === 0 || (checkpoints.length > 0 && checkpoints[checkpoints.length - 1] === maxId)) return;
    setCheckpoints([...checkpoints, maxId]);
    playSuccess();
  };

  // Wipe a specific shelf (current OR any past one). Past-shelf wipes also
  // remove the now-empty boundary so shelves before/after merge cleanly.
  const handleClearShelf = (shelfIdx: number) => {
    const shelf = shelves[shelfIdx];
    if (!shelf || shelf.items.length === 0) return;
    const label = shelf.isCurrent ? 'המדף הנוכחי' : `מדף ${shelf.index}`;
    Alert.alert(
      `ניקוי ${label}`,
      `למחוק ${shelf.items.length} פריטים מ${label}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              for (const it of shelf.items) {
                try { await deleteCountItem(it.id); } catch {}
              }
              playWarning();
              setLastAddedItemId(null);
              // Drop the boundary for a closed shelf so the remaining shelves renumber
              if (!shelf.isCurrent) {
                setCheckpoints(cps => cps.filter((_, i) => i !== shelfIdx));
              }
              await loadItems();
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  // Quick action — clear just the current shelf (kept for the inline button)
  const handleClearCurrentShelf = () => handleClearShelf(shelves.length - 1);

  // Scanner hook
  const scanner = useScanner({
    onScan: processBarcode,
    onError: (error) => console.error('Scanner error:', error),
  });

  // Toggle "Auto 1" mode. Hardware stays in single-shot mode either way —
  // אוטומט 1 only changes whether software opens the qty dialog or auto-adds 1.
  const toggleContinuousMode = useCallback(async () => {
    const next = !continuousMode;
    setContinuousMode(next);
    cooldownUntilRef.current = 0;
    // Force hardware off-continuous in case anything left it on
    await scanner.setContinuousMode(false);
  }, [continuousMode, scanner]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const data = await fetchCountDetails(count.id);
      setItems(data.items);
      setCountStatus(data.count.status);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לטעון פריטים');
    } finally {
      setLoading(false);
    }
  };

  // Start scanner
  const handleStartScanner = async () => {
    setScannerActive(true);
    const opened = await scanner.open();
    setScannerReady(opened);
    if (!opened) {
      setManualMode(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Manual barcode submit
  const handleManualScan = async () => {
    if (!barcode.trim()) return;
    await processBarcode(barcode.trim());
    setBarcode('');
    inputRef.current?.focus();
  };

  // Add scanned product to count
  const handleAddItem = async () => {
    if (!scannedProduct || !quantity) return;

    // Accept decimals — many warehouse items are sold by weight/volume.
    // Normalize Hebrew/comma decimal separators.
    const qty = parseFloat(quantity.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      playError();
      Alert.alert('שגיאה', 'כמות לא תקינה');
      return;
    }

    try {
      const newItem = await addItemToCount(
        count.id,
        scannedProduct.item_code,
        failedBarcode || lastBarcode,
        qty,
        notes || undefined,
        failedBarcode || undefined
      );
      playSuccess();
      setLastAddedItemId(newItem?.id ?? null);
      setScannedProduct(null);
      setQuantity('1');
      setNotes('');
      setFailedBarcode(null);
      await loadItems();

      // Return focus
      if (manualMode) {
        inputRef.current?.focus();
      }
    } catch (error) {
      playError();
      Alert.alert('שגיאה', 'לא ניתן להוסיף פריט');
    }
  };

  // Undo the most recently added row — single tap, no confirm
  const handleUndoLast = async () => {
    if (!lastAddedItemId) return;
    try {
      await deleteCountItem(lastAddedItemId);
      playWarning();
      setLastAddedItemId(null);
      await loadItems();
    } catch (error) {
      playError();
      Alert.alert('שגיאה', 'לא ניתן לבטל');
    }
  };

  // Cancel current scan
  const handleCancelScan = () => {
    setScannedProduct(null);
    setQuantity('1');
    setNotes('');
    setFailedBarcode(null);
    if (manualMode) {
      inputRef.current?.focus();
    }
  };

  // Toggle scanner/manual mode
  const toggleManualMode = async () => {
    if (manualMode) {
      setManualMode(false);
      const opened = await scanner.open();
      setScannerReady(opened);
    } else {
      await scanner.close();
      setScannerReady(false);
      setManualMode(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Edit item
  const handleEditItem = (item: CountItem) => {
    setEditItem(item);
    setEditQuantity(item.quantity_counted.toString());
    setEditNotes(item.notes || '');
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    try {
      await updateCountItem(editItem.id, parseInt(editQuantity), editNotes || undefined);
      setEditItem(null);
      await loadItems();
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לעדכן');
    }
  };

  // Delete item
  const handleDeleteItem = (item: CountItem) => {
    Alert.alert('מחיקת פריט', `למחוק ${item.item_name}?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCountItem(item.id);
            await loadItems();
          } catch (error) {
            Alert.alert('שגיאה', 'לא ניתן למחוק');
          }
        },
      },
    ]);
  };

  // Complete count
  const handleComplete = () => {
    Alert.alert('סיום ספירה', 'האם לסיים את הספירה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'סיים',
        onPress: async () => {
          try {
            await scanner.close();
            await completeCount(count.id);
            Alert.alert('✅ ספירה הושלמה', `${items.length} פריטים נספרו`, [
              { text: 'אישור', onPress: onBack },
            ]);
          } catch (error) {
            Alert.alert('שגיאה', 'לא ניתן לסיים ספירה');
          }
        },
      },
    ]);
  };

  // Reopen count
  const handleReopen = () => {
    Alert.alert('פתיחה מחדש', 'לפתוח את הספירה מחדש לעריכה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'פתח',
        onPress: async () => {
          try {
            await reopenCount(count.id);
            setCountStatus('IN_PROGRESS');
          } catch (error) {
            Alert.alert('שגיאה', 'לא ניתן לפתוח מחדש');
          }
        },
      },
    ]);
  };

  // Search
  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 2) return;
    try {
      setSearching(true);
      const result = await searchItems(searchQuery);
      setSearchResults(result.items || []);
    } catch (error) {
      Alert.alert('שגיאה', 'חיפוש נכשל');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSearchResult = (item: any) => {
    setScannedProduct({
      item_code: item.item_code,
      item_name: item.item_name,
      department: item.department,
      group: item.group,
      sub_group: item.sub_group,
      stock_store: item.stock_store,
      stock_distribution: item.stock_distribution,
      already_counted: null,
    });
    // If came from failed barcode scan, keep the failed barcode
    // Otherwise use item_code as the scanned barcode
    if (!failedBarcode) {
      setLastBarcode(item.item_code);
    }
    setQuantity('1');
    setNotes('');
    setSearchVisible(false);
    setSearchQuery('');
    setSearchResults([]);
    setTimeout(() => quantityRef.current?.focus(), 100);
  };

  const handleBack = async () => {
    await scanner.close();
    onBack();
  };

  // Stats
  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity_counted, 0);
  const uniqueItems = new Set(items.map(i => i.item_code)).size;

  useEffect(() => {
    loadSounds();
    loadItems();
    // Auto-start scanner so the user doesn't have to tap "📡 הפעל סורק" every time
    handleStartScanner();
    return () => {
      // Reset the hardware to single-shot so other apps don't inherit continuous mode
      scanner.setContinuousMode(false).catch(() => {});
      scanner.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Current-shelf items (alias for legacy references)
  const pendingItems = currentShelf?.items ?? [];

  // Decimal quantity is more permissive; tweak input
  const filteredItems = useMemo(() => {
    const q = itemsFilter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.item_name.toLowerCase().includes(q) ||
      i.item_code.toLowerCase().includes(q) ||
      (i.scanned_barcode && i.scanned_barcode.toLowerCase().includes(q))
    );
  }, [items, itemsFilter]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isCompleted = countStatus === 'COMPLETED';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← חזור</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ספירה #{count.id} - {count.branch}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>📦 {uniqueItems} פריטים</Text>
        <Text style={styles.statsText}>🔢 {totalQuantity} יחידות</Text>
        <Text style={styles.statsText}>📋 {totalItems} שורות</Text>
      </View>

      {/* Mode toggle + Undo row */}
      {!isCompleted && (
        <View style={styles.quickRow}>
          <View style={styles.quickToggle}>
            <Text style={[styles.quickLabel, continuousMode && styles.quickLabelActive]}>
              🤖 אוטומט 1
            </Text>
            <Switch
              value={continuousMode}
              onValueChange={toggleContinuousMode}
              trackColor={{ false: colors.disabled, true: colors.secondary }}
            />
          </View>
          <TouchableOpacity
            style={[styles.undoButton, !lastAddedItemId && styles.undoButtonDisabled]}
            disabled={!lastAddedItemId}
            onPress={handleUndoLast}
          >
            <Text style={styles.undoButtonText}>↶ ביטול אחרון</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Auto-1 banner */}
      {continuousMode && !isCompleted && (
        <View style={styles.continuousBanner}>
          <Text style={styles.continuousBannerText}>
            🤖 אוטומט 1 – ירייה אחת בכל פעם, מוסיף +1 בלי דיאלוג.
          </Text>
        </View>
      )}

      {/* CHECKPOINT row — current-shelf controls + shelves modal opener */}
      {!isCompleted && (
        <View style={styles.checkpointRow}>
          <View style={styles.checkpointInfo}>
            <Text style={styles.checkpointLabel}>
              📍 מדף נוכחי ({checkpoints.length + 1}/{checkpoints.length + 1}):
            </Text>
            <Text style={styles.checkpointCount}>
              {pendingItems.length} פריטים
            </Text>
          </View>
          <View style={styles.checkpointButtons}>
            <TouchableOpacity
              style={styles.shelvesButton}
              onPress={() => setShelvesModalOpen(true)}
            >
              <Text style={styles.shelvesButtonText}>📂 {checkpoints.length + 1}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.checkpointButton, pendingItems.length === 0 && styles.checkpointButtonDisabled]}
              disabled={pendingItems.length === 0}
              onPress={handleCheckpoint}
            >
              <Text style={styles.checkpointButtonText}>📍 CHECKPOINT</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.clearButton, (pendingItems.length === 0 || clearing) && styles.checkpointButtonDisabled]}
              disabled={pendingItems.length === 0 || clearing}
              onPress={handleClearCurrentShelf}
            >
              <Text style={styles.clearButtonText}>
                {clearing ? '...' : '🗑️ נקה'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Shelves modal — see all shelves, clear any specific one */}
      <Modal visible={shelvesModalOpen} animationType="slide" transparent onRequestClose={() => setShelvesModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📂 מדפים בספירה</Text>
            <FlatList
              data={shelves}
              keyExtractor={(s) => `${s.index}-${s.startId}-${s.endId ?? 'open'}`}
              renderItem={({ item: shelf, index: shelfIdx }) => (
                <View style={[styles.shelfRow, shelf.isCurrent && styles.shelfRowCurrent]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shelfName}>
                      {shelf.isCurrent ? `📍 מדף נוכחי (#${shelf.index})` : `✅ מדף ${shelf.index}`}
                    </Text>
                    <Text style={styles.shelfCount}>{shelf.items.length} פריטים</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.clearShelfButton, (shelf.items.length === 0 || clearing) && styles.checkpointButtonDisabled]}
                    disabled={shelf.items.length === 0 || clearing}
                    onPress={() => {
                      setShelvesModalOpen(false);
                      handleClearShelf(shelfIdx);
                    }}
                  >
                    <Text style={styles.clearButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
              style={{ maxHeight: 400 }}
              ListEmptyComponent={<Text style={styles.modalEmpty}>אין מדפים עדיין</Text>}
            />
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setShelvesModalOpen(false)}>
              <Text style={styles.closeModalText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanner area */}
      {!isCompleted && (
        <>
          {scannerActive ? (
            <View style={styles.scanArea}>
              {/* Scanner status */}
              <View style={styles.scannerStatus}>
                <Text style={styles.scannerStatusText}>
                  {scannerReady ? '📡 סורק מוכן' : manualMode ? '⌨️ מצב ידני' : '⏳ מאתחל...'}
                </Text>
                <View style={styles.scannerButtons}>
                  <TouchableOpacity onPress={toggleManualMode} style={styles.toggleButton}>
                    <Text style={styles.toggleButtonText}>{manualMode ? '📡' : '⌨️'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSearchVisible(true)} style={styles.toggleButton}>
                    <Text style={styles.toggleButtonText}>🔍</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {scannedProduct ? (
                /* Product found - enter quantity. Layout puts qty + Add row at
                   the top so the keyboard never hides them. */
                <View style={[
                  styles.productBox,
                  scannedProduct.already_counted && styles.productBoxAlreadyCounted,
                ]}>
                  <Text style={styles.productName} numberOfLines={2}>{scannedProduct.item_name}</Text>

                  {/* MAIN ACTION ROW — always visible above the keyboard */}
                  <View style={styles.primaryActionRow}>
                    <Text style={styles.qtyLabel}>כמות:</Text>
                    <TextInput
                      ref={quantityRef}
                      style={styles.primaryQtyInput}
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="decimal-pad"
                      onSubmitEditing={handleAddItem}
                      selectTextOnFocus
                    />
                    <TouchableOpacity style={styles.primaryAddButton} onPress={handleAddItem}>
                      <Text style={styles.primaryAddButtonText}>+ הוסף</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Secondary info — informational, ok to be hidden by keyboard */}
                  <Text style={styles.productCode}>
                    קוד: {scannedProduct.item_code} | {scannedProduct.sub_group || scannedProduct.department}
                  </Text>
                  {failedBarcode && (
                    <Text style={styles.failedBarcodeTag}>
                      ⚠️ ברקוד מקורי: {failedBarcode}
                    </Text>
                  )}
                  <Text style={styles.productStock}>
                    מלאי מערכת: {count.branch === 'חנות' ? scannedProduct.stock_store : scannedProduct.stock_distribution}
                  </Text>
                  {scannedProduct.already_counted && (
                    <Text style={styles.alreadyCounted}>
                      ⚠️ כבר נספר: {scannedProduct.already_counted.total_counted} ({scannedProduct.already_counted.count_times} פעמים)
                    </Text>
                  )}

                  <TextInput
                    style={styles.notesInput}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="הערות (אופציונלי)"
                    onSubmitEditing={handleAddItem}
                  />

                  <TouchableOpacity style={styles.cancelButtonSmall} onPress={handleCancelScan}>
                    <Text style={styles.cancelButtonText}>ביטול</Text>
                  </TouchableOpacity>
                </View>
              ) : manualMode ? (
                /* Manual barcode input */
                <View style={styles.manualInput}>
                  <TextInput
                    ref={inputRef}
                    style={styles.barcodeInput}
                    value={barcode}
                    onChangeText={setBarcode}
                    onSubmitEditing={handleManualScan}
                    placeholder="הקלד ברקוד..."
                    autoFocus
                  />
                  <TouchableOpacity style={styles.scanButton} onPress={handleManualScan}>
                    <Text style={styles.scanButtonText}>🔍</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Waiting for scan */
                <View style={styles.waitingArea}>
                  <Text style={styles.waitingText}>🔫 ירה על ברקוד</Text>
                  <Text style={styles.waitingSubtext}>או לחץ 🔍 לחיפוש ידני</Text>
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.startButton} onPress={handleStartScanner}>
              <Text style={styles.startButtonText}>📡 הפעל סורק</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {isCompleted && (
        <View style={styles.completedBanner}>
          <Text style={styles.completedText}>✅ ספירה הושלמה</Text>
          <TouchableOpacity style={styles.reopenButton} onPress={handleReopen}>
            <Text style={styles.reopenButtonText}>🔄 פתח מחדש</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Items list header + filter */}
      <View style={styles.itemsHeader}>
        <Text style={styles.itemsTitle}>
          פריטים שנספרו ({itemsFilter ? `${filteredItems.length}/${totalItems}` : totalItems})
        </Text>
        <TextInput
          style={styles.itemsFilterInput}
          value={itemsFilter}
          onChangeText={setItemsFilter}
          placeholder="🔍 חיפוש ברשימה (שם / קוד / ברקוד)"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <FlatList
        data={filteredItems}
        renderItem={({ item }) => (
          <CountedItemRow
            item={item}
            branch={count.branch}
            onEdit={!isCompleted ? handleEditItem : undefined}
            onDelete={!isCompleted ? handleDeleteItem : undefined}
          />
        )}
        keyExtractor={(item) => item.id.toString()}
        style={styles.itemsList}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>
              {itemsFilter ? 'אין התאמות' : 'טרם נסרקו פריטים'}
            </Text>
          </View>
        }
      />

      {/* Complete button — visible whenever count is open, not only when scanner is running */}
      {!isCompleted && (
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>✅ סיים ספירה</Text>
        </TouchableOpacity>
      )}

      {/* Search Modal */}
      <Modal visible={searchVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {failedBarcode ? '⚠️ פריט לא נמצא' : '🔍 חיפוש פריט'}
            </Text>
            {failedBarcode && (
              <Text style={styles.failedBarcodeText}>
                ברקוד {failedBarcode} לא קיים במאגר
              </Text>
            )}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="שם, קוד, ברקוד..."
                onSubmitEditing={handleSearch}
                autoFocus
              />
              <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                <Text style={styles.searchButtonText}>חפש</Text>
              </TouchableOpacity>
            </View>

            {searching && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />}

            <FlatList
              data={searchResults}
              renderItem={({ item }) => {
                const branchStock = count.branch === 'חנות' ? item.stock_store : item.stock_distribution;
                return (
                  <TouchableOpacity
                    style={styles.searchResultRow}
                    onPress={() => handleSelectSearchResult(item)}
                  >
                    <Text style={styles.searchResultName}>{item.item_name}</Text>
                    <Text style={styles.searchResultCode}>
                      קוד: {item.item_code} | {item.sub_group || item.department}
                    </Text>
                    <Text style={styles.searchResultStock}>
                      📦 מלאי ב{count.branch}: {branchStock ?? '—'}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              keyExtractor={(item) => item.item_code}
              style={styles.searchResultsList}
              ListEmptyComponent={
                searchQuery.length >= 2 && !searching ? (
                  <Text style={styles.noResults}>לא נמצאו תוצאות</Text>
                ) : null
              }
            />

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => { setSearchVisible(false); setSearchResults([]); setSearchQuery(''); setFailedBarcode(null); }}
            >
              <Text style={styles.closeModalText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={!!editItem} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ עריכת פריט</Text>
            {editItem && (
              <>
                <Text style={styles.editItemName}>{editItem.item_name}</Text>
                <Text style={styles.editItemCode}>קוד: {editItem.item_code}</Text>

                <Text style={styles.inputLabel}>כמות</Text>
                <TextInput
                  style={styles.editInput}
                  value={editQuantity}
                  onChangeText={setEditQuantity}
                  keyboardType="numeric"
                  autoFocus
                />

                <Text style={styles.inputLabel}>הערות</Text>
                <TextInput
                  style={styles.editInput}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="אופציונלי"
                />

                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => setEditItem(null)}
                  >
                    <Text style={styles.cancelButtonText}>ביטול</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addButton} onPress={handleSaveEdit}>
                    <Text style={styles.addButtonText}>שמור</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
  },
  backButtonText: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  title: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold', flex: 1 },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statsText: { color: colors.textPrimary, fontSize: fontSize.md },
  scanArea: { padding: spacing.sm },
  scannerStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  scannerStatusText: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: 'bold' },
  scannerButtons: { flexDirection: 'row', gap: spacing.sm },
  toggleButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  toggleButtonText: { fontSize: fontSize.lg },
  productBox: {
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  productBoxAlreadyCounted: {
    backgroundColor: '#4d4d1b',
    borderColor: colors.warning,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  quickToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  quickLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  undoButton: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  undoButtonDisabled: {
    opacity: 0.4,
  },
  undoButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  quickLabelActive: {
    color: colors.secondary,
    fontWeight: 'bold',
  },
  continuousBanner: {
    padding: spacing.xs,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    backgroundColor: '#1b4d1b',
    borderRadius: borderRadius.sm,
  },
  continuousBannerText: {
    color: '#a5d6a7',
    fontSize: fontSize.sm,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  checkpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  checkpointInfo: { flex: 1 },
  checkpointLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  checkpointCount: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: 'bold' },
  checkpointButtons: { flexDirection: 'row', gap: spacing.xs },
  checkpointButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  checkpointButtonText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: 'bold' },
  checkpointButtonDisabled: { opacity: 0.4 },
  clearButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  clearButtonText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: 'bold' },
  shelvesButton: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  shelvesButtonText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: 'bold' },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
  },
  shelfRowCurrent: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  shelfName: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: 'bold' },
  shelfCount: { color: colors.textMuted, fontSize: fontSize.sm },
  clearShelfButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modalEmpty: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    padding: spacing.md,
  },
  primaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  qtyLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  primaryQtyInput: {
    backgroundColor: colors.inputBackground,
    height: 50,
    width: 80,
    borderRadius: borderRadius.md,
    fontSize: fontSize.xl,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  primaryAddButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryAddButtonText: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: 'bold' },
  cancelButtonSmall: {
    alignSelf: 'flex-start',
    backgroundColor: colors.disabled,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  itemsFilterInput: {
    backgroundColor: colors.inputBackground,
    height: 36,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  searchResultStock: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  productName: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: 'bold', textAlign: 'center', marginBottom: spacing.xs },
  productCode: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.xs },
  productStock: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.xs },
  alreadyCounted: { color: colors.warning, fontSize: fontSize.md, textAlign: 'center', fontWeight: 'bold', marginBottom: spacing.sm },
  failedBarcodeTag: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center', marginBottom: spacing.xs, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  inputGroup: { flex: 1 },
  inputLabel: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.xs },
  quantityInput: {
    backgroundColor: colors.inputBackground,
    height: 45,
    borderRadius: borderRadius.md,
    fontSize: fontSize.xl,
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: colors.inputBackground,
    height: 45,
    borderRadius: borderRadius.md,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.sm,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.disabled,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButtonText: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  addButton: {
    flex: 2,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  addButtonText: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  manualInput: { flexDirection: 'row', alignItems: 'center' },
  barcodeInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    height: 45,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
    textAlign: 'center',
  },
  scanButton: {
    marginLeft: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    width: 50,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonText: { fontSize: fontSize.xl },
  waitingArea: {
    backgroundColor: colors.cardBackground,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  waitingText: { fontSize: fontSize.xl, color: colors.textPrimary, fontWeight: 'bold', marginBottom: spacing.xs },
  waitingSubtext: { fontSize: fontSize.md, color: colors.textMuted },
  startButton: {
    backgroundColor: colors.primary,
    margin: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  startButtonText: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: 'bold' },
  completedBanner: {
    backgroundColor: '#1b4d1b',
    padding: spacing.md,
    margin: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  completedText: { color: colors.primary, fontSize: fontSize.lg, fontWeight: 'bold' },
  reopenButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  reopenButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  itemsHeader: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  itemsTitle: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: 'bold' },
  itemsList: { flex: 1 },
  emptyList: { padding: spacing.xl, alignItems: 'center' },
  emptyListText: { color: colors.textMuted, fontSize: fontSize.md },
  completeButton: {
    backgroundColor: colors.secondary,
    margin: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  completeButtonText: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalTitle: { color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: 'bold', textAlign: 'center', marginBottom: spacing.sm },
  failedBarcodeText: { color: colors.warning, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    height: 45,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
  },
  searchButtonText: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  searchResultsList: { marginTop: spacing.sm, maxHeight: 300 },
  searchResultRow: {
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  searchResultName: { color: colors.textPrimary, fontSize: fontSize.md, fontWeight: 'bold' },
  searchResultCode: { color: colors.textMuted, fontSize: fontSize.sm },
  noResults: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  closeModalButton: {
    backgroundColor: colors.disabled,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  closeModalText: { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: 'bold' },
  editItemName: { color: colors.textPrimary, fontSize: fontSize.lg, textAlign: 'center', marginBottom: spacing.xs },
  editItemCode: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center', marginBottom: spacing.md },
  editInput: {
    backgroundColor: colors.inputBackground,
    height: 45,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
    marginBottom: spacing.sm,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
