export interface Device {
  browser: string;
  os: string | null;
  mobile: boolean;
}

function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/OPR\/|Opera/.test(userAgent)) return 'Opera';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  if (/PowerShell/i.test(userAgent)) return 'PowerShell';
  if (/curl\//i.test(userAgent)) return 'curl';
  return 'Unknown client';
}

function detectOs(userAgent: string): string | null {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
  if (/Linux|X11/.test(userAgent)) return 'Linux';
  return null;
}

export function describeDevice(userAgent: string | null): Device | null {
  if (!userAgent) return null;
  const os = detectOs(userAgent);
  return { browser: detectBrowser(userAgent), os, mobile: os === 'iOS' || os === 'Android' };
}

export function deviceLabel(userAgent: string | null): string {
  const device = describeDevice(userAgent);
  if (!device) return 'Unknown device';
  return device.os ? `${device.browser} on ${device.os}` : device.browser;
}
