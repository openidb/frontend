// Haptic feedback utility for mobile devices.
// Uses navigator.vibrate() on Android, hidden <input type="checkbox" switch> on iOS Safari 17.4+.
// No-op on desktop.

const PRESETS = {
  light: [10],
  medium: [20],
  success: [15, 50, 15],
  error: [20, 40, 20, 40, 20],
} as const;

export type HapticPreset = keyof typeof PRESETS;

let _isTouch: boolean | null = null;
function isTouchDevice(): boolean {
  if (_isTouch !== null) return _isTouch;
  _isTouch =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  return _isTouch;
}

let _isIOS: boolean | null = null;
function isIOS(): boolean {
  if (_isIOS !== null) return _isIOS;
  _isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  return _isIOS;
}

// Lazily-created hidden switch for iOS haptic trick
let iosSwitch: HTMLInputElement | null = null;
let iosLabel: HTMLLabelElement | null = null;

function getIOSSwitch(): HTMLLabelElement {
  if (iosLabel) return iosLabel;
  iosSwitch = document.createElement("input");
  iosSwitch.type = "checkbox";
  iosSwitch.setAttribute("switch", "");
  iosSwitch.id = "__haptic_switch";
  iosSwitch.style.cssText =
    "position:fixed;top:-100px;opacity:0;pointer-events:none";
  iosLabel = document.createElement("label");
  iosLabel.htmlFor = "__haptic_switch";
  iosLabel.style.cssText =
    "position:fixed;top:-100px;opacity:0;pointer-events:none";
  document.body.appendChild(iosSwitch);
  document.body.appendChild(iosLabel);
  return iosLabel;
}

export function triggerHaptic(preset: HapticPreset = "light"): void {
  if (!isTouchDevice()) return;

  const pattern = PRESETS[preset];

  if (isIOS()) {
    const label = getIOSSwitch();
    // Each label click toggles the switch, producing a haptic tick on iOS
    const totalTaps = Math.ceil(pattern.length / 2); // number of vibrate segments
    if (totalTaps <= 1) {
      label.click();
      return;
    }
    // Multi-tap: stagger clicks to match the pattern timing
    let delay = 0;
    for (let i = 0; i < totalTaps; i++) {
      setTimeout(() => label.click(), delay);
      // vibrate duration + pause duration
      delay += (pattern[i * 2] || 0) + (pattern[i * 2 + 1] || 0);
    }
    return;
  }

  // Android / other: navigator.vibrate
  if (navigator.vibrate) {
    navigator.vibrate(pattern as unknown as number[]);
  }
}
