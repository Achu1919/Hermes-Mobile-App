package io.crates.keyring

import android.content.Context

/**
 * JNI bridge required by android-native-keyring-store.
 *
 * The Rust dependency exports this exact companion-object symbol and needs the
 * Android application context before the first KeyStore-backed credential read
 * or write.
 */
class Keyring {
  companion object {
    init {
      // The initializer must run before Tauri starts its Rust runtime.
      // Loading again later from Tauri's generated Rust bridge is idempotent.
      System.loadLibrary("hermes_mobile_app_lib")
    }

    external fun initializeNdkContext(context: Context)
  }
}
