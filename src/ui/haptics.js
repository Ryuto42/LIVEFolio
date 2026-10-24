import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();
const isIOS = Capacitor.getPlatform() === 'ios';

// iOS の selectionChanged は selectionStart で生成したジェネレータが無いと鳴らない
if (isNative && isIOS) Haptics.selectionStart().catch(() => {});

// Android はプラグインの最小プリセットでも振動が長いため、Web の Vibration API で短く鳴らす
function vibrate(ms) {
    try {
        return typeof navigator.vibrate === 'function' && navigator.vibrate(ms);
    } catch {
        return false;
    }
}

export function tick() {
    if (isNative && isIOS) {
        Haptics.selectionChanged().catch(() => {});
        return;
    }
    if (vibrate(8)) return;
    if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}

export function impact(style = 'light') {
    if (!isNative) { vibrate(style === 'medium' ? 14 : 8); return; }
    if (!isIOS && vibrate(style === 'medium' ? 14 : 8)) return;
    Haptics.impact({ style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}
