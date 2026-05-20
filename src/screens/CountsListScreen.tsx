// src/screens/CountsListScreen.tsx
// מסך רשימת ספירות

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../styles/theme';
import { Count, fetchCounts, createCount } from '../services/api';

// OTA update check — bumped automatically by deploy.sh
export const APP_VERSION = '1.0.1';
const VERSION_URL = 'https://api.mgmstock.com/downloads/stockcount-version.json';
const APK_URL = 'https://api.mgmstock.com/downloads/stockcount.apk';

interface CountsListScreenProps {
  onSelectCount: (count: Count) => void;
}

export function CountsListScreen({ onSelectCount }: CountsListScreenProps) {
  const [counts, setCounts] = useState<Count[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Check for OTA update once on mount — Android only (iOS would go via store)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    fetch(`${VERSION_URL}?t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        if (data?.version && data.version !== APP_VERSION) {
          setUpdateAvailable(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleUpdate = () => {
    Alert.alert('עדכון אפליקציה', 'להוריד את הגרסה החדשה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'הורד',
        onPress: () => {
          // Opens APK URL in browser → Android Package Installer prompts to install
          Linking.openURL(APK_URL).catch(() => {
            Alert.alert('שגיאה', 'לא ניתן לפתוח את קישור ההורדה');
          });
        },
      },
    ]);
  };

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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchCounts();
      setCounts(data);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן לטעון ספירות');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateCount = async (branch: 'הפצה' | 'חנות') => {
    try {
      const count = await createCount(branch, 'מסופון');
      onSelectCount(count);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן ליצור ספירה');
    }
  };

  useEffect(() => {
    loadCounts();
  }, []);

  const activeCounts = counts.filter(c => c.status === 'IN_PROGRESS');
  const completedCounts = counts.filter(c => c.status === 'COMPLETED').slice(0, 10);

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
      <View style={styles.titleRow}>
        <Text style={styles.title}>📋 ספירות מלאי</Text>
        {updateAvailable && (
          <TouchableOpacity style={styles.updateButton} onPress={handleUpdate}>
            <Text style={styles.updateButtonText}>⬆ עדכון</Text>
          </TouchableOpacity>
        )}
      </View>

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

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Active counts */}
        {activeCounts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>🟢 ספירות פעילות ({activeCounts.length})</Text>
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
            <Text style={styles.sectionTitle}>✅ ספירות שהושלמו ({completedCounts.length})</Text>
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
                    👤 {count.counter_name}
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
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>אין ספירות</Text>
            <Text style={styles.emptySubtext}>צור ספירה חדשה למעלה</Text>
          </View>
        )}
      </ScrollView>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  updateButton: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  updateButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: 'bold',
  },
  loadingText: {
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontSize: fontSize.lg,
  },
  createRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xl,
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
});
