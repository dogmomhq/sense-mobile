import ExpoModulesCore
import DeviceCheck

// B210 (CJ 2026-09-18): Apple DeviceCheck — two bits per physical device that survive reinstall and wipe. The server
// sets "this device has a paid account" on first paid play and refuses a second paid account on a device carrying
// it. App Attest keys are per install, so this is the only durable device identity Apple offers.
public class SenseDeviceCheckModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SenseDeviceCheck")

    AsyncFunction("isSupported") { () -> Bool in
      return DCDevice.current.isSupported
    }

    AsyncFunction("generateToken") { (promise: Promise) in
      guard DCDevice.current.isSupported else { promise.resolve(nil); return }
      DCDevice.current.generateToken { data, error in
        if let error = error { promise.reject("DEVICECHECK", error.localizedDescription); return }
        guard let data = data else { promise.resolve(nil); return }
        promise.resolve(data.base64EncodedString())
      }
    }
  }
}
