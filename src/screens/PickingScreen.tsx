// src/screens/PickingScreen.tsx
// מסך ליקוט הזמנה - עם תמיכה בסורק Chainway

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import {
  Order,
  OrderItem,
  OrderDetails,
  fetchOrderDetails,
  startPicking,
  checkBarcodeInOrder,
  updateScannedItem,
  completePicking,
  syncWithComax,
} from '../services/api';
import { ItemRow } from '../components/ItemRow';
import { useScanner } from '../hooks/useScanner';

interface PickingScreenProps {
  order: Order;
  onBack: () => void;
  onComplete: () => void;
}

interface CurrentItem {
  item_id: string;
  name: string;
  quantity_ordered: number;
  quantity_scanned: number;
}

export function PickingScreen({ order, onBack, onComplete }: PickingScreenProps) {
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const quantityInputRef = useRef<TextInput>(null);

  // Process barcode - used by both scanner and manual input
  const processBarcode = useCallback(async (scannedCode: string) => {
    if (!scannedCode.trim() || !scanning) return;

    try {
      const result = await checkBarcodeInOrder(order.id, scannedCode.trim());

      if (!result.found_in_system) {
        Alert.alert('❌ לא נמצא', 'הברקוד לא קיים במערכת');
        return;
      }

      if (!result.in_order) {
        Alert.alert('⚠️ לא בהזמנה', 'הפריט לא נמצא בהזמנה זו');
        return;
      }

      if (result.item) {
        setCurrentItem({
          item_id: result.item.item_id,
          name: result.item.name,
          quantity_ordered: result.item.quantity_ordered,
          quantity_scanned: result.item.quantity_scanned,
        });
        setQuantity(result.item.quantity_ordered.toString());
        // Focus on quantity input
        setTimeout(() => quantityInputRef.current?.focus(), 100);
      }
    } catch (error) {
      Alert.alert('שגיאה', 'בעיה בבדיקת הברקוד');
    }
  }, [order.id, scanning]);

  // Setup scanner
  const scanner = useScanner({
    onScan: processBarcode,
    onError: (error) => {
      console.error('Scanner error:', error);
    },
  });

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      const data = await fetchOrderDetails(order.id);
      setOrderDetails(data);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לטעון פרטי הזמנה');
    } finally {
      setLoading(false);
    }
  };

  const handleStartPicking = async () => {
    try {
      await startPicking(order.id, 'עובד מסופון');
      setScanning(true);
      
      // Open scanner
      const opened = await scanner.open();
      setScannerReady(opened);
      
      if (!opened) {
        // Fallback to manual mode if scanner fails
        setManualMode(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להתחיל ליקוט');
    }
  };

  // Handle manual barcode input
  const handleBarcodeScan = async () => {
    if (!barcode.trim()) return;
    await processBarcode(barcode.trim());
    setBarcode('');
    inputRef.current?.focus();
  };

  const handleQuantitySubmit = async () => {
    if (!currentItem || !quantity) return;

    try {
      await updateScannedItem(order.id, currentItem.item_id, parseInt(quantity));
      await loadOrderDetails();
      setCurrentItem(null);
      setQuantity('');
      setManualMode(false);
      
      // Return focus based on mode
      if (manualMode) {
        inputRef.current?.focus();
      }
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לעדכן כמות');
    }
  };

  const handleSelectItem = (item: OrderItem) => {
    if (!scanning) return;
    setCurrentItem({
      item_id: item.item_id,
      name: item.item_name,
      quantity_ordered: item.quantity_ordered,
      quantity_scanned: item.quantity_scanned || 0,
    });
    setQuantity(item.quantity_ordered.toString());
    setTimeout(() => quantityInputRef.current?.focus(), 100);
  };

  const handleComplete = () => {
    Alert.alert('סיום ליקוט', 'האם לסיים את ליקוט ההזמנה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'סיים',
        onPress: async () => {
          try {
            await scanner.close();
            await completePicking(order.id);
            // סנכרון יום אחד אחרי סיום הזמנה
            await syncWithComax(1);
            onComplete();
          } catch (error) {
            Alert.alert('שגיאה', 'לא ניתן לסיים ליקוט');
          }
        },
      },
    ]);
  };

  const handleBack = async () => {
    await scanner.close();
    onBack();
  };

  const handleReset = () => {
    Alert.alert('איפוס ליקוט', 'האם לאפס את הליקוט ולהתחיל מחדש?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'אפס',
        style: 'destructive',
        onPress: async () => {
          if (orderDetails) {
            for (const item of orderDetails.items) {
              if (item.quantity_scanned && item.quantity_scanned > 0) {
                await updateScannedItem(order.id, item.item_id, 0);
              }
            }
          }
          await loadOrderDetails();
          setCurrentItem(null);
          setQuantity('');
        },
      },
    ]);
  };

  const handleCancelItem = () => {
    setCurrentItem(null);
    setQuantity('');
  };

  // Toggle between scanner and manual mode
  const toggleManualMode = async () => {
    if (manualMode) {
      // Switch to scanner mode
      setManualMode(false);
      const opened = await scanner.open();
      setScannerReady(opened);
    } else {
      // Switch to manual mode
      await scanner.close();
      setScannerReady(false);
      setManualMode(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Calculate totals
  const getTotalPickedQuantity = () => {
    if (!orderDetails) return 0;
    return orderDetails.items.reduce((sum, item) => sum + (item.quantity_scanned || 0), 0);
  };

  const getTotalOrderedQuantity = () => {
    if (!orderDetails) return 0;
    return orderDetails.items.reduce((sum, item) => sum + item.quantity_ordered, 0);
  };

  // Sort items: pending first, scanned last
  const sortedItems = useMemo(() => {
    if (!orderDetails) return [];
    
    const pending = orderDetails.items.filter(item => 
      !item.quantity_scanned || item.quantity_scanned === 0 || item.status === 'pending'
    );
    const scanned = orderDetails.items.filter(item => 
      item.quantity_scanned && item.quantity_scanned > 0 && item.status !== 'pending'
    );
    
    return [...pending, ...scanned];
  }, [orderDetails]);

  useEffect(() => {
    loadOrderDetails();
    
    // Cleanup scanner on unmount
    return () => {
      scanner.close();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← חזור</Text>
        </TouchableOpacity>
        <Text style={styles.title}>#{order.comax_order_id}</Text>
        {scanning && (
          <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>🔄</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Compact Stats Bar */}
      {orderDetails && (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            📦 {getTotalPickedQuantity()}/{getTotalOrderedQuantity()} פריטים
          </Text>
          <Text style={styles.statsText}>
            📋 {orderDetails.summary.scanned_items}/{orderDetails.summary.total_items} שורות
          </Text>
          <Text style={styles.statsText}>
            ✔ {orderDetails.summary.completion_percentage}%
          </Text>
        </View>
      )}

      {/* Scanner Status */}
      {scanning && (
        <View style={styles.scannerStatus}>
          <Text style={styles.scannerStatusText}>
            {scannerReady ? '📡 סורק מוכן - ירה על ברקוד' : manualMode ? '⌨️ מצב ידני' : '⏳ מאתחל סורק...'}
          </Text>
          <TouchableOpacity onPress={toggleManualMode} style={styles.toggleButton}>
            <Text style={styles.toggleButtonText}>
              {manualMode ? '📡' : '⌨️'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress Bar */}
      {orderDetails && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${orderDetails.summary.completion_percentage}%` },
            ]}
          />
        </View>
      )}

      {/* Scanning Area */}
      {scanning ? (
        <View style={styles.scanArea}>
          {currentItem ? (
            <View style={styles.currentItemBox}>
              <Text style={styles.currentItemName}>{currentItem.name}</Text>
              <Text style={styles.currentItemOrdered}>
                כמות: {currentItem.quantity_ordered} | מק"ט: {currentItem.item_id}
              </Text>
              <View style={styles.quantityRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelItem}>
                  <Text style={styles.cancelButtonText}>✕</Text>
                </TouchableOpacity>
                <TextInput
                  ref={quantityInputRef}
                  style={styles.quantityInput}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  placeholder="כמות"
                  onSubmitEditing={handleQuantitySubmit}
                  autoFocus
                />
                <TouchableOpacity style={styles.confirmButton} onPress={handleQuantitySubmit}>
                  <Text style={styles.confirmButtonText}>✔</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : manualMode ? (
            <View style={styles.scanInputArea}>
              <TextInput
                ref={inputRef}
                style={styles.barcodeInput}
                value={barcode}
                onChangeText={setBarcode}
                onSubmitEditing={handleBarcodeScan}
                placeholder="הקלד ברקוד..."
                autoFocus
              />
              <TouchableOpacity style={styles.submitButton} onPress={handleBarcodeScan}>
                <Text style={styles.submitButtonText}>🔍</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.waitingArea}>
              <Text style={styles.waitingText}>🔫 ירה על ברקוד</Text>
              <Text style={styles.waitingSubtext}>או לחץ על פריט מהרשימה</Text>
            </View>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.startButton} onPress={handleStartPicking}>
          <Text style={styles.startButtonText}>▶️ התחל ליקוט</Text>
        </TouchableOpacity>
      )}

      {/* Items List */}
      {orderDetails && (
        <FlatList
          data={sortedItems}
          renderItem={({ item }) => (
            <ItemRow item={item} onPress={handleSelectItem} disabled={!scanning} />
          )}
          keyExtractor={(item) => item.id.toString()}
          style={styles.itemsList}
          contentContainerStyle={styles.itemsListContent}
        />
      )}

      {/* Complete Button */}
      {scanning && (
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>סיים ליקוט ✔</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
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
  backButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  resetButton: {
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginLeft: 'auto',
  },
  resetButtonText: {
    fontSize: fontSize.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    flex: 1,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statsText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  scannerStatus: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  scannerStatusText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  toggleButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  toggleButtonText: {
    fontSize: fontSize.lg,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
    marginTop: spacing.xs,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  scanArea: {
    padding: spacing.sm,
  },
  scanInputArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barcodeInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    height: 45,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.lg,
    textAlign: 'center',
  },
  submitButton: {
    marginLeft: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    width: 50,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: fontSize.xl,
  },
  waitingArea: {
    backgroundColor: colors.cardBackground,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  waitingText: {
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  waitingSubtext: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  currentItemBox: {
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  currentItemName: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  currentItemOrdered: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quantityInput: {
    backgroundColor: colors.inputBackground,
    width: 100,
    height: 45,
    borderRadius: borderRadius.md,
    fontSize: fontSize.xl,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: colors.primary,
    width: 50,
    height: 45,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: colors.disabled,
    width: 50,
    height: 45,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
  },
  startButton: {
    backgroundColor: colors.primary,
    margin: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  startButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  itemsList: {
    flex: 1,
  },
  itemsListContent: {
    paddingBottom: spacing.md,
  },
  completeButton: {
    backgroundColor: colors.secondary,
    margin: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  completeButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
});
