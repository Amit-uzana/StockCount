// src/screens/OrdersListScreen.tsx
// מסך רשימת הזמנות לליקוט

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import { Order, fetchOrders } from '../services/api';
import { OrderCard } from '../components/OrderCard';

interface OrdersListScreenProps {
  onSelectOrder: (order: Order) => void;
}

export function OrdersListScreen({ onSelectOrder }: OrdersListScreenProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await fetchOrders();
      setOrders(data);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לטעון הזמנות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>טוען הזמנות...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📦 הזמנות לליקוט</Text>

      {orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>אין הזמנות ממתינות</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadOrders}>
            <Text style={styles.refreshButtonText}>🔄 רענן</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={onSelectOrder} />
          )}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadOrders}
        />
      )}
    </View>
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
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontSize: fontSize.lg,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.xl,
    marginBottom: spacing.lg,
  },
  refreshButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  refreshButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  listContent: {
    padding: spacing.sm,
  },
});
