package com.hermesagent.mobile

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import io.crates.keyring.Keyring

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // android-native-keyring-store requires this before its first secure
    // credential operation. Tauri initializes its Rust runtime in super.
    Keyring.initializeNdkContext(applicationContext)
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
