// src/components/CountedItemRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import { CountItem } from '../services/api';

interface CountedItemRowProps {
  item: CountItem;
  branch: string;
  onEdit?: (item: CountItem) => void;
  onDelete?: (item: CountItem) => void;
}

export function CountedItemRow({ item, branch, onEdit, onDelete }: CountedItemRowProps) {
  const comaxStock = branch === 'חנות' ? item.stock_store : item.stock_distribution;
  const diff = comaxStock != null ? item.quantity_counted - comaxStock : null;

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{item.item_name}</Text>
          <Text style={styles.code}>קוד: {item.item_code}</Text>
          {item.notes && <Text style={styles.notes}>📝 {item.notes}</Text>}
        </View>

        <View style={styles.quantitySection}>
          <Text style={styles.quantity}>{item.quantity_counted}</Text>
          {comaxStock != null && (
            <Text style={[
              styles.diff,
              diff === 0 ? styles.diffZero : diff! > 0 ? styles.diffPositive : styles.diffNegative,
            ]}>
              {diff === 0 ? '=' : diff! > 0 ? `+${diff}` : `${diff}`}
            </Text>
          )}
        </View>
      </View>

      {(onEdit || onDelete) && (
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity style={styles.editButton} onPress={() => onEdit(item)}>
              <Text style={styles.actionText}>✏️</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(item)}>
              <Text style={styles.actionText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  code: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  notes: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  quantitySection: {
    alignItems: 'center',
    minWidth: 50,
  },
  quantity: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  diff: {
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  diffZero: { color: colors.primary },
  diffPositive: { color: colors.warning },
  diffNegative: { color: colors.danger },
  actions: {
    flexDirection: 'column',
    gap: spacing.xs,
    marginLeft: spacing.sm,
  },
  editButton: {
    padding: spacing.xs,
  },
  deleteButton: {
    padding: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.md,
  },
});
