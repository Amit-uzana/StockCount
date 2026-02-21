package com.sunmiscanner

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

import com.rscja.barcode.BarcodeDecoder
import com.rscja.barcode.BarcodeFactory
import com.rscja.barcode.BarcodeUtility
import com.rscja.deviceapi.entity.BarcodeEntity

/**
 * Chainway C66 Scanner Module for React Native
 */
class ChainwayScannerModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ChainwayScanner"
        const val NAME = "ChainwayScanner"
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var barcodeDecoder: BarcodeDecoder? = null

    override fun getName(): String = NAME

    /**
     * Send event to JavaScript
     */
    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Open the scanner hardware
     */
    @ReactMethod
    fun open(promise: Promise) {
        Thread {
            try {
                // Disable Keyboard Emulator so we get exclusive scanner access
                try {
                    BarcodeUtility.getInstance().closeKeyboardHelper(reactApplicationContext)
                    Log.i(TAG, "Keyboard Emulator disabled")
                } catch (e: Exception) {
                    Log.w(TAG, "Could not disable Keyboard Emulator: ${e.message}")
                }

                val decoder = BarcodeFactory.getInstance().barcodeDecoder
                val success = decoder.open(reactApplicationContext)

                if (success) {
                    barcodeDecoder = decoder

                    // Register callback
                    decoder.setDecodeCallback { barcodeEntity ->
                        onBarcodeDecoded(barcodeEntity)
                    }

                    Log.i(TAG, "Scanner opened successfully")
                    mainHandler.post { promise.resolve(true) }
                } else {
                    Log.e(TAG, "Scanner failed to open")
                    mainHandler.post { promise.resolve(false) }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error opening scanner: ${e.message}")
                mainHandler.post { promise.reject("OPEN_ERROR", e.message) }
            }
        }.start()
    }

    /**
     * Close the scanner hardware
     */
    @ReactMethod
    fun close(promise: Promise) {
        try {
            barcodeDecoder?.close()
            barcodeDecoder = null
            Log.i(TAG, "Scanner closed")
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error closing scanner: ${e.message}")
            promise.reject("CLOSE_ERROR", e.message)
        }
    }

    /**
     * Trigger a scan programmatically
     */
    @ReactMethod
    fun startScan(promise: Promise) {
        try {
            val success = barcodeDecoder?.startScan() ?: false
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message)
        }
    }

    /**
     * Stop current scan
     */
    @ReactMethod
    fun stopScan(promise: Promise) {
        try {
            barcodeDecoder?.stopScan()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /**
     * Check if scanner is open
     */
    @ReactMethod
    fun isOpen(promise: Promise) {
        promise.resolve(barcodeDecoder?.isOpen == true)
    }

    /**
     * Called when barcode is decoded
     */
    private fun onBarcodeDecoded(entity: BarcodeEntity) {
        val status = when (entity.resultCode) {
            BarcodeDecoder.DECODE_SUCCESS -> "success"
            BarcodeDecoder.DECODE_FAILURE -> "failure"
            BarcodeDecoder.DECODE_TIMEOUT -> "timeout"
            BarcodeDecoder.DECODE_CANCEL -> "cancel"
            BarcodeDecoder.DECODE_ENGINE_ERROR -> "error"
            else -> "unknown"
        }

        Log.d(TAG, "Barcode: status=$status, code=${entity.barcodeData}, type=${entity.barcodeName}")

        // Send to React Native on main thread
        mainHandler.post {
            val params = Arguments.createMap().apply {
                putString("code", entity.barcodeData ?: "")
                putString("type", entity.barcodeName ?: "")
                putString("status", status)
            }
            sendEvent("onBarcodeScanned", params)
        }
    }

    /**
     * Required for NativeEventEmitter
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built-in Event Emitter Calls
    }
}
