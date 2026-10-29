import { describe, expect, it } from 'vitest';
import { deviceLabel, describeDevice } from './device';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/120.0`;
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const POWERSHELL =
  'Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26100; en-US) PowerShell/7.5.0';

describe('deviceLabel', () => {
  it.each([
    [CHROME_WINDOWS, 'Chrome on Windows'],
    [EDGE_WINDOWS, 'Edge on Windows'],
    [FIREFOX_MAC, 'Firefox on macOS'],
    [SAFARI_IPHONE, 'Safari on iOS'],
    [CHROME_ANDROID, 'Chrome on Android'],
    [POWERSHELL, 'PowerShell on Windows'],
    ['curl/8.4.0', 'curl'],
    [null, 'Unknown device'],
    ['', 'Unknown device'],
  ])('describes %s as %s', (userAgent, expected) => {
    expect(deviceLabel(userAgent)).toBe(expected);
  });

  it('flags phones so the list can show a phone icon', () => {
    expect(describeDevice(SAFARI_IPHONE)?.mobile).toBe(true);
    expect(describeDevice(CHROME_WINDOWS)?.mobile).toBe(false);
  });
});
