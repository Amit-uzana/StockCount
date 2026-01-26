// src/screens/PickingScreen.tsx
// מסך ליקוט הזמנה

import React, { useState, useEffect, useRef } from 'react';
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
} from '../services/api';
import { ItemRow } from '../components/ItemRow';

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
  const inputRef = useRef<TextInput>(null);

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
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להתחיל ליקוט');
    }
  };

  const handleBarcodeScan = async () => {
    if (!barcode.trim()) return;

    try {
      const result = await checkBarcodeInOrder(order.id, barcode.trim());

      if (!result.found_in_system) {
        Alert.alert('❌ לא נמצא', 'הברקוד לא קיים במערכת');
        setBarcode('');
        inputRef.current?.focus();
        return;
      }

      if (!result.in_order) {
        Alert.alert('⚠️ לא בהזמנה', 'הפריט לא נמצא בהזמנה זו');
        setBarcode('');
        inputRef.current?.focus();
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
      }
      setBarcode('');
    } catch (error) {
      Alert.alert('שגיאה', 'בעיה בבדיקת הברקוד');
      setBarcode('');
    }
  };

  const handleQuantitySubmit = async () => {
    if (!currentItem || !quantity) return;

    try {
      await updateScannedItem(order.id, currentItem.item_id, parseInt(quantity));
      await loadOrderDetails();
      setCurrentItem(null);
      setQuantity('');
      setManualMode(false);
      inputRef.current?.focus();
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
  };

  const handleComplete = () => {
    Alert.alert('סיום ליקוט', 'האם לסיים את ליקוט ההזמנה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'סיים',
        onPress: async () => {
          try {
            await completePicking(order.id);
            onComplete();
          } catch (error) {
            Alert.alert('שגיאה', 'לא ניתן לסיים ליקוט');
          }
        },
      },
    ]);
  };

  const handleCancelItem = () => {
    setCurrentItem(null);
    setQuantity('');
    inputRef.current?.focus();
  };

  useEffect(() => {
    loadOrderDetails();
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
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← חזור</Text>
        </TouchableOpacity>
        <Text style={styles.title}>הזמנה #{order.comax_order_id}</Text>
      </View>

      {/* Progress Bar */}
      {orderDetails && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${orderDetails.summary.completion_percentage}%` },
            ]}
          />
          <Text style={styles.progressText}>
            {orderDetails.summary.scanned_items}/{orderDetails.summary.total_items} פריטים
          </Text>
        </View>
      )}

      {/* Scanning Area */}
      {scanning ? (
        <View style={styles.scanArea}>
          {currentItem ? (
            <View style={styles.currentItemBox}>
              <Text style={styles.currentItemName}>{currentItem.name}</Text>
              <Text style={styles.currentItemId}>מספר פריט: {currentItem.item_id}</Text>
              <Text style={styles.currentItemOrdered}>
                כמות מוזמנת: {currentItem.quantity_ordered}
              </Text>
              <TextInput
                style={styles.quantityInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                placeholder="הזן כמות"
                onSubmitEditing={handleQuantitySubmit}
                autoFocus
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelItem}>
                  <Text style={styles.cancelButtonText}>ביטול</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={handleQuantitySubmit}>
                  <Text style={styles.confirmButtonText}>אישור ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.scanInputArea}>
              <Text style={styles.scanPrompt}>סרוק ברקוד או לחץ על פריט 📷</Text>
              <TextInput
                ref={inputRef}
                style={styles.barcodeInput}
                value={barcode}
                onChangeText={setBarcode}
                onSubmitEditing={handleBarcodeScan}
                placeholder="סרוק או הקלד ברקוד..."
                showSoftInputOnFocus={manualMode}
                autoFocus
              />
              <TouchableOpacity
                style={styles.manualButton}
                onPress={() => setManualMode(!manualMode)}
              >
                <Text style={styles.manualButtonText}>
                  {manualMode ? '📷 מצב סריקה' : '⌨️ הקלדה ידנית'}
                </Text>
              </TouchableOpacity>
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
        <>
          {scanning && <Text style={styles.listHint}>💡 לחץ על פריט לבחירה ידנית</Text>}
          <FlatList
            data={orderDetails.items}
            renderItem={({ item }) => (
              <ItemRow item={item} onPress={handleSelectItem} disabled={!scanning} />
            )}
            keyExtractor={(item) => item.id.toString()}
            style={styles.itemsList}
          />
        </>
      )}

      {/* Complete Button */}
      {scanning && (
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>סיים ליקוט ✓</Text>
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
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginRight: spacing.md,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: fontSize.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  progressBar: {
    height: 30,
    backgroundColor: colors.border,
    margin: spacing.md,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  progressText: {
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  scanArea: {
    padding: spacing.md,
  },
  scanInputArea: {
    alignItems: 'center',
  },
  scanPrompt: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  barcodeInput: {
    backgroundColor: colors.inputBackground,
    width: '100%',
    height: 50,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.xl,
    textAlign: 'center',
  },
  manualButton: {
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  manualButtonText: {
    color: colors.primary,
    fontSize: fontSize.lg,
  },
  currentItemBox: {
    backgroundColor: colors.cardBackground,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  currentItemName: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  currentItemId: {
    color: colors.primary,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  currentItemOrdered: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    marginBottom: spacing.md,
  },
  quantityInput: {
    backgroundColor: colors.inputBackground,
    width: 150,
    height: 50,
    borderRadius: borderRadius.md,
    fontSize: fontSize.title,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  confirmButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: colors.disabled,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
  },
  startButton: {
    backgroundColor: colors.primary,
    margin: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  startButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xxl,
    fontWeight: 'bold',
  },
  listHint: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    fontSize: fontSize.md,
  },
  itemsList: {
    flex: 1,
  },
  completeButton: {
    backgroundColor: colors.secondary,
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  completeButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
});
