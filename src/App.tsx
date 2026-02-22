// src/App.tsx
// StockCount - אפליקציית ספירות מלאי

import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { colors } from './styles/theme';
import { Count } from './services/api';
import { CountsListScreen } from './screens/CountsListScreen';
import { CountingScreen } from './screens/CountingScreen';

function App(): React.JSX.Element {
  const [selectedCount, setSelectedCount] = useState<Count | null>(null);

  if (selectedCount) {
    return (
      <CountingScreen
        count={selectedCount}
        onBack={() => setSelectedCount(null)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <CountsListScreen onSelectCount={setSelectedCount} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
