// src/screens/CountingScreen.tsx
// מסך ספירה - סריקה + הוספת פריטים

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
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
  searchItems,
} from '../services/api';
import { CountedItemRow } from '../components/CountedItemRow';
import { useScanner } from '../hooks/useScanner';

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

  const inputRef = useRef<TextInput>(null);
  const quantityRef = useRef<TextInput>(null);

  // Process barcode from scanner or manual input
  const processBarcode = useCallback(async (scannedCode: string) => {
    if (!scannedCode.trim()) return;
    
    const code = scannedCode.trim();
    setLastBarcode(code);

    try {
      const result: ScanResult = await scanBarcode(count.id, code);

      if (!result.found || !result.items || result.items.length === 0) {
        // Save failed barcode and open search
        setFailedBarcode(code);
        setSearchQuery(code);
        setSearchVisible(true);
        return;
      }

      const product = result.items[0];
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
      Alert.alert('שגיאה', 'בעיה בבדיקת הברקוד');
    }
  }, [count.id]);

  // Scanner hook
  const scanner = useScanner({
    onScan: processBarcode,
    onError: (error) => console.error('Scanner error:', error),
  });

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

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('שגיאה', 'כמות לא תקינה');
      return;
    }

    try {
      await addItemToCount(
        count.id,
        scannedProduct.item_code,
        failedBarcode || lastBarcode,
        qty,
        notes || undefined,
        failedBarcode || undefined
      );
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
      Alert.alert('שגיאה', 'לא ניתן להוסיף פריט');
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
    loadItems();
    return () => { scanner.close(); };
  }, []);

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
                /* Product found - enter quantity */
                <View style={styles.productBox}>
                  <Text style={styles.productName}>{scannedProduct.item_name}</Text>
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

                  <View style={styles.inputRow}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>כמות</Text>
                      <TextInput
                        ref={quantityRef}
                        style={styles.quantityInput}
                        value={quantity}
                        onChangeText={setQuantity}
                        keyboardType="numeric"
                        onSubmitEditing={handleAddItem}
                        selectTextOnFocus
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 2 }]}>
                      <Text style={styles.inputLabel}>הערות</Text>
                      <TextInput
                        style={styles.notesInput}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="אופציונלי"
                        onSubmitEditing={handleAddItem}
                      />
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.cancelButton} onPress={handleCancelScan}>
                      <Text style={styles.cancelButtonText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.addButton} onPress={handleAddItem}>
                      <Text style={styles.addButtonText}>+ הוסף</Text>
                    </TouchableOpacity>
                  </View>
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
        </View>
      )}

      {/* Items list */}
      <View style={styles.itemsHeader}>
        <Text style={styles.itemsTitle}>פריטים שנספרו ({totalItems})</Text>
      </View>

      <FlatList
        data={items}
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
            <Text style={styles.emptyListText}>טרם נסרקו פריטים</Text>
          </View>
        }
      />

      {/* Complete button */}
      {scannerActive && !isCompleted && (
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
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultRow}
                  onPress={() => handleSelectSearchResult(item)}
                >
                  <Text style={styles.searchResultName}>{item.item_name}</Text>
                  <Text style={styles.searchResultCode}>
                    קוד: {item.item_code} | {item.sub_group || item.department}
                  </Text>
                </TouchableOpacity>
              )}
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
