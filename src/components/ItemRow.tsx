// src/components/ItemRow.tsx
// קומפוננטת שורת פריט בהזמנה

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import { OrderItem } from '../services/api';

interface ItemRowProps {
  item: OrderItem;
  onPress: (item: OrderItem) => void;
  disabled?: boolean;
}

export function ItemRow({ item, onPress, disabled = false }: ItemRowProps) {
  const getBackgroundColor = () => {
    switch (item.status) {
      case 'complete': return colors.success;
      case 'partial': return colors.warning;
      case 'missing': return colors.error;
      default: return colors.cardBackground;
    }
  };

  const getStatusIcon = () => {
    switch (item.status) {
      case 'complete': return '✅';
      case 'partial': return '⚠️';
      case 'missing': return '❌';
      default: return '⏳';
    }
  };

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: getBackgroundColor() }]}
      onPress={() => onPress(item)}
      disabled={disabled}
    >
      <View style={styles.info}>
        <Text style={styles.name}>{item.item_name}</Text>
        <Text style={styles.itemId}>מספר פריט: {item.item_id}</Text>
        {item.barcode && item.barcode !== item.item_id && (
          <Text style={styles.barcode}>ברקוד: {item.barcode}</Text>
        )}
      </View>
      
      <View style={styles.quantity}>
        <Text style={styles.quantityText}>
          {item.quantity_scanned || 0}/{item.quantity_ordered}
        </Text>
        <Text style={styles.statusIcon}>{getStatusIcon()}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  itemId: {
    color: colors.primary,
    fontSize: fontSize.sm,
  },
  barcode: {
    color: colors.textSecondary,
    fontSize: fontSize.sm - 1,
  },
  quantity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    marginRight: spacing.sm,
  },
  statusIcon: {
    fontSize: fontSize.xl,
  },
});
