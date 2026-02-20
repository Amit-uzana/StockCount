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
import { Order, fetchOrders, syncWithComax } from '../services/api';
import { OrderCard } from '../components/OrderCard';

interface OrdersListScreenProps {
  onSelectOrder: (order: Order) => void;
}

export function OrdersListScreen({ onSelectOrder }: OrdersListScreenProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [initialSync, setInitialSync] = useState(true);

  const loadOrders = async () => {
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לטעון הזמנות');
    }
  };

  // סנכרון ראשוני בכניסה - 5 ימים
  const initialSyncAndLoad = async () => {
    try {
      setInitialSync(true);
      setLoading(true);
      
      // סנכרון 5 ימים
      await syncWithComax(5);
      
      // טעינת הזמנות
      await loadOrders();
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לסנכרן');
    } finally {
      setInitialSync(false);
      setLoading(false);
    }
  };

  // סנכרון ידני - 30 ימים
  const handleManualSync = async () => {
    try {
      setSyncing(true);
      const result = await syncWithComax(30);
      if (result.closed > 0) {
        Alert.alert('סנכרון הושלם', `${result.closed} הזמנות הוסרו`);
      } else {
        Alert.alert('סנכרון הושלם', 'אין הזמנות לעדכון');
      }
      await loadOrders();
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לסנכרן עם קומקס');
    } finally {
      setSyncing(false);
    }
  };

  // רענון רגיל - בלי סנכרון
  const handleRefresh = async () => {
    setLoading(true);
    await loadOrders();
    setLoading(false);
  };

  useEffect(() => {
    initialSyncAndLoad();
  }, []);

  // מסך טעינה ראשוני עם סנכרון
  if (initialSync) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>מסנכרן 5 ימים אחורה...</Text>
        <Text style={styles.loadingSubtext}>אנא המתן</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with sync button */}
      <View style={styles.headerRow}>
        <TouchableOpacity 
          style={[styles.syncButton, syncing && styles.syncButtonDisabled]} 
          onPress={handleManualSync}
          disabled={syncing}
        >
          <Text style={styles.syncButtonText}>
            {syncing ? '⏳' : '🔄'} סנכרן
          </Text>
        </TouchableOpacity>
        <Text style={styles.title}>📦 הזמנות לליקוט</Text>
        <View style={styles.headerSpacer} />
      </View>

      {syncing && (
        <View style={styles.syncingBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.syncingText}>מסנכרן 30 ימים אחורה...</Text>
        </View>
      )}

      {orders.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>אין הזמנות ממתינות</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
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
          onRefresh={handleRefresh}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    flex: 1,
  },
  syncButton: {
    backgroundColor: colors.cardBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncButtonDisabled: {
    opacity: 0.5,
  },
  syncButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 80,
  },
  syncingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    backgroundColor: colors.cardBackground,
    marginHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  syncingText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  loadingText: {
    color: colors.textPrimary,
    marginTop: spacing.md,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
  },
  loadingSubtext: {
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontSize: fontSize.md,
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
