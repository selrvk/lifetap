import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Before any JS runs, so the app never sees the old data.
    clearKeychainFromPreviousInstall()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "lifetap",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

// iOS keeps an app's Keychain items after the app is deleted. LifeTap keeps the
// medical profile, the sign-in session, responder keys and reports there (via
// react-native-encrypted-storage), so a reinstall — or a phone passed on to
// someone else — would bring all of it back.
//
// UserDefaults is erased on uninstall, so a missing marker means this is the
// first launch of this install (or of the first build with this check). Items
// older than the app's data container were written by an earlier install and
// are deleted; an existing install updating to this build has no such items,
// so nothing of its own is touched.
private func clearKeychainFromPreviousInstall() {
  let marker = "lifetap.keychainLeftoversChecked"
  let defaults = UserDefaults.standard
  guard !defaults.bool(forKey: marker) else { return }

  // The data container itself is created at install and kept across updates,
  // so it's older than anything this install has written.
  guard
    let installedAt = try? URL(fileURLWithPath: NSHomeDirectory())
      .resourceValues(forKeys: [.creationDateKey]).creationDate
  else { return }

  var result: AnyObject?
  let status = SecItemCopyMatching([
    kSecClass as String: kSecClassGenericPassword,
    kSecMatchLimit as String: kSecMatchLimitAll,
    kSecReturnAttributes as String: true,
  ] as CFDictionary, &result)

  // Launched before the first unlock after a reboot (Keychain unreadable):
  // try again on the next launch instead of marking this install as checked.
  guard status == errSecSuccess || status == errSecItemNotFound else { return }

  for item in (result as? [[String: Any]]) ?? [] {
    guard let created = item[kSecAttrCreationDate as String] as? Date, created < installedAt else { continue }
    var match: [String: Any] = [kSecClass as String: kSecClassGenericPassword]
    if let account = item[kSecAttrAccount as String] { match[kSecAttrAccount as String] = account }
    if let service = item[kSecAttrService as String] { match[kSecAttrService as String] = service }
    SecItemDelete(match as CFDictionary)
  }
  defaults.set(true, forKey: marker)
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
