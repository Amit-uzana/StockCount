// src/screens/CountsListScreen.tsx
// מסך רשימת ספירות

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
import { Count, fetchCounts, createCount } from '../services/api';

interface CountsListScreenProps {
  onSelectCount: (count: Count) => void;
}

export function CountsListScreen({ onSelectCount }: CountsListScreenProps) {
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCounts = async () => {
    try {
      setLoading(true);
      const data = await fetchCounts();
      setCounts(data);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לטעון ספירות');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCount = (branch: 'הפצה' | 'חנות') => {
    Alert.alert(
      `ספירה חדשה - ${branch}`,
      'ליצור ספירה חדשה?',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'צור',
          onPress: async () => {
            try {
              const count = await createCount(branch, 'מסופון');
              onSelectCount(count);
            } catch (error) {
              Alert.alert('שגיאה', 'לא ניתן ליצור ספירה');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const activeCounts = counts.filter(c => c.status === 'IN_PROGRESS');
  const completedCounts = counts.filter(c => c.status === 'COMPLETED').slice(0, 5);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>טוען ספירות...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.title}>📋 ספירות מלאי</Text>

      {/* Create buttons */}
      <View style={styles.createRow}>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={() => handleCreateCount('הפצה')}
        >
          <Text style={styles.createButtonText}>+ ספירת הפצה</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.secondary }]}
          onPress={() => handleCreateCount('חנות')}
        >
          <Text style={styles.createButtonText}>+ ספירת חנות</Text>
        </TouchableOpacity>
      </View>

      {/* Active counts */}
      {activeCounts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🟢 ספירות פעילות</Text>
          {activeCounts.map(count => (
            <TouchableOpacity
              key={count.id}
              style={styles.countCard}
              onPress={() => onSelectCount(count)}
            >
              <View style={styles.countCardHeader}>
                <Text style={styles.countBranch}>{count.branch}</Text>
                <Text style={styles.countId}>#{count.id}</Text>
              </View>
              <View style={styles.countCardBody}>
                <Text style={styles.countInfo}>
                  📅 {formatDate(count.created_at)}
                </Text>
                <Text style={styles.countInfo}>
                  👤 {count.counter_name}
                </Text>
                <Text style={styles.countInfo}>
                  📦 {count.total_items || 0} פריטים
                </Text>
              </View>
              <View style={styles.countCardFooter}>
                <Text style={styles.tapText}>לחץ להמשך ספירה →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {/* Completed counts */}
      {completedCounts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>✅ ספירות שהושלמו</Text>
          {completedCounts.map(count => (
            <TouchableOpacity
              key={count.id}
              style={[styles.countCard, styles.completedCard]}
              onPress={() => onSelectCount(count)}
            >
              <View style={styles.countCardHeader}>
                <Text style={styles.countBranch}>{count.branch}</Text>
                <Text style={styles.countId}>#{count.id}</Text>
              </View>
              <View style={styles.countCardBody}>
                <Text style={styles.countInfo}>
                  📅 {formatDate(count.created_at)}
                </Text>
                <Text style={styles.countInfo}>
                  📦 {count.total_items || 0} פריטים
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      {activeCounts.length === 0 && completedCounts.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>אין ספירות</Text>
          <Text style={styles.emptySubtext}>צור ספירה חדשה למעלה</Text>
        </View>
      )}

      {/* Refresh */}
      <TouchableOpacity style={styles.refreshButton} onPress={loadCounts}>
        <Text style={styles.refreshButtonText}>🔄 רענן</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.sm,
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
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontSize: fontSize.lg,
  },
  createRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  createButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  createButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  countCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  completedCard: {
    borderLeftColor: colors.disabled,
    opacity: 0.7,
  },
  countCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  countBranch: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  countId: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  countCardBody: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  countInfo: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  countCardFooter: {
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  tapText: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.xl,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  refreshButton: {
    backgroundColor: colors.cardBackground,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
});
