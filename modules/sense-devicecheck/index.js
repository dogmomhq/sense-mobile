// B210: Apple DeviceCheck token (native, iOS only). null on simulator / unsupported / missing module.
import { requireOptionalNativeModule } from 'expo-modules-core';
const M = requireOptionalNativeModule('SenseDeviceCheck');
export const DEVICECHECK_OK = !!M;
export async function deviceCheckToken() {
  try { if (!M) return null; if (!(await M.isSupported())) return null; return await M.generateToken(); } catch (e) { return null; }
}
