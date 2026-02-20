// src/hooks/useScanner.ts
// Hook לשימוש בסורק Chainway

import { useEffect, useRef, useCallback, useState } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ChainwayScanner } = NativeModules;

interface ScanResult {
  code: string;
  type: string;
  status: 'success' | 'failure' | 'timeout' | 'cancel' | 'error' | 'unknown';
}

interface UseScannerOptions {
  onScan?: (code: string) => void;
  onError?: (error: string) => void;
}

export function useScanner(options: UseScannerOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const eventEmitterRef = useRef<NativeEventEmitter | null>(null);
  const subscriptionRef = useRef<any>(null);

  const { onScan, onError } = options;

  // Open scanner
  const open = useCallback(async () => {
    if (Platform.OS !== 'android' || !ChainwayScanner) {
      console.warn('ChainwayScanner not available');
      return false;
    }

    try {
      const success = await ChainwayScanner.open();
      setIsOpen(success);
      return success;
    } catch (error: any) {
      console.error('Failed to open scanner:', error);
      onError?.(error.message || 'Failed to open scanner');
      return false;
    }
  }, [onError]);

  // Close scanner
  const close = useCallback(async () => {
    if (!ChainwayScanner) return;

    try {
      await ChainwayScanner.close();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to close scanner:', error);
    }
  }, []);

  // Manual scan trigger
  const startScan = useCallback(async () => {
    if (!ChainwayScanner) return false;

    try {
      return await ChainwayScanner.startScan();
    } catch (error) {
      console.error('Failed to start scan:', error);
      return false;
    }
  }, []);

  // Stop scan
  const stopScan = useCallback(async () => {
    if (!ChainwayScanner) return;

    try {
      await ChainwayScanner.stopScan();
    } catch (error) {
      console.error('Failed to stop scan:', error);
    }
  }, []);

  // Setup event listener
  useEffect(() => {
    if (Platform.OS !== 'android' || !ChainwayScanner) {
      return;
    }

    // Create event emitter
    eventEmitterRef.current = new NativeEventEmitter(ChainwayScanner);

    // Subscribe to scan events
    subscriptionRef.current = eventEmitterRef.current.addListener(
      'onBarcodeScanned',
      (result: ScanResult) => {
        console.log('Scan result:', result);

        if (result.status === 'success' && result.code) {
          setLastScan(result.code);
          onScan?.(result.code);
        } else if (result.status === 'error') {
          onError?.('Scan error');
        }
      }
    );

    return () => {
      subscriptionRef.current?.remove();
    };
  }, [onScan, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      close();
    };
  }, [close]);

  return {
    isOpen,
    lastScan,
    open,
    close,
    startScan,
    stopScan,
  };
}
