// src/App.tsx
// אפליקציית ליקוט מחסן - SUNMI C66

import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { colors } from './styles/theme';
import { Order } from './services/api';
import { OrdersListScreen } from './screens/OrdersListScreen';
import { PickingScreen } from './screens/PickingScreen';

function App(): React.JSX.Element {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // מסך ליקוט
  if (selectedOrder) {
    return (
      <PickingScreen
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onComplete={() => setSelectedOrder(null)}
      />
    );
  }

  // מסך רשימת הזמנות
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <OrdersListScreen onSelectOrder={setSelectedOrder} />
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
