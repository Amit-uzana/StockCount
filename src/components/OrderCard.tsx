// src/components/OrderCard.tsx
// קומפוננטת כרטיס הזמנה ברשימה

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import { Order } from '../services/api';

interface OrderCardProps {
  order: Order;
  onPress: (order: Order) => void;
}

export function OrderCard({ order, onPress }: OrderCardProps) {
  const isInProgress = order.status === 'in_progress';

  return (
    <TouchableOpacity
      style={[styles.card, isInProgress && styles.cardInProgress]}
      onPress={() => onPress(order)}
    >
      <View style={styles.header}>
        <Text style={styles.orderNumber}>הזמנה #{order.comax_order_id}</Text>
        <Text style={styles.status}>
          {order.status === 'pending' ? '⏳ ממתין' : '🔄 בתהליך'}
        </Text>
      </View>
      
      <Text style={styles.customerName}>{order.customer_name}</Text>
      
      <View style={styles.footer}>
        <Text style={styles.itemsCount}>
          {order.scanned_items || 0}/{order.total_items} פריטים
        </Text>
        <Text style={styles.date}>
          {new Date(order.order_date).toLocaleDateString('he-IL')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardInProgress: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  orderNumber: {
    color: colors.primary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  status: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  customerName: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    marginBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemsCount: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  date: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
});
