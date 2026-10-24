export const EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 押下: :active は iOS WebView でタッチ直後に付かないことがあるため pointer イベントで制御する
export function installPressable() {
    let active = null;
    let startX = 0;
    let startY = 0;
    const release = () => {
        if (active) active.classList.remove('is-pressed');
        active = null;
    };
    document.addEventListener('pointerdown', e => {
        const el = e.target.closest('.pressable');
        if (!el || el.disabled) return;
        active = el;
        startX = e.clientX;
        startY = e.clientY;
        el.classList.add('is-pressed');
    }, { passive: true });
    document.addEventListener('pointermove', e => {
        if (active && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) release();
    }, { passive: true });
    ['pointerup', 'pointercancel', 'dragstart'].forEach(t => document.addEventListener(t, release, { passive: true }));
    document.addEventListener('scroll', release, { passive: true, capture: true });
}

// 初回表示時だけ 460ms・18px 上がりながら出す
export function reveal(root, scrollRoot, enabled = true) {
    const els = root.querySelectorAll('[data-reveal]');
    if (!enabled || reducedMotion() || !('IntersectionObserver' in window)) return;
    let fired = false;
    const io = new IntersectionObserver(entries => {
        fired = true;
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            el.style.setProperty('--d', `${el.dataset.reveal || 0}ms`);
            el.classList.remove('reveal-wait');
            el.classList.add('reveal-in');
            io.unobserve(el);
        });
    }, { root: scrollRoot, rootMargin: '0px 0px 40px 0px' });
    els.forEach(el => {
        el.classList.add('reveal-wait');
        io.observe(el);
    });
    // 監視が一度も届かない環境（非表示のまま描かれた画面など）で、内容が見えないまま残らないようにする
    setTimeout(() => {
        if (fired) return;
        io.disconnect();
        els.forEach(el => el.classList.remove('reveal-wait'));
    }, 1500);
}

const counted = new Map();
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

export function countUp(el, to, key, { ms, format = n => new Intl.NumberFormat('ja-JP').format(n) } = {}) {
    if (!el) return;
    const seen = counted.has(key);
    const from = seen ? counted.get(key) : 0;
    counted.set(key, to);
    if (reducedMotion() || (seen && from === to)) {
        el.textContent = format(to);
        return;
    }
    const duration = ms ?? (seen ? 600 : 1400);
    const t0 = performance.now();
    el.textContent = format(from);
    const step = now => {
        const t = Math.min(1, (now - t0) / duration);
        el.textContent = format(Math.round(from + (to - from) * easeOutCubic(t)));
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

export function morphCapsule(capsule) {
    if (!capsule) return;
    capsule.classList.remove('is-moving');
    void capsule.offsetWidth;
    capsule.classList.add('is-moving');
}

// 共有要素遷移: 一覧のアートワークから詳細のヒーロー画像へ、位置と大きさを補間して移動する
export function flyShared(fromEl, toEl, duration) {
    if (!fromEl || !toEl || reducedMotion()) return null;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    if (!a.width || !b.width) return null;

    const ghost = fromEl.cloneNode(true);
    ghost.removeAttribute('data-shared');
    ghost.removeAttribute('data-shared-target');
    ghost.classList.add('shared-ghost');
    const radiusA = getComputedStyle(fromEl).borderRadius;
    const radiusB = getComputedStyle(toEl).borderRadius;
    Object.assign(ghost.style, {
        position: 'fixed', left: '0px', top: '0px', margin: '0',
        width: `${a.width}px`, height: `${a.height}px`, zIndex: '900',
        transformOrigin: '0 0', pointerEvents: 'none',
    });
    document.body.appendChild(ghost);
    fromEl.style.visibility = 'hidden';
    toEl.style.visibility = 'hidden';

    const anim = ghost.animate([
        { transform: `translate(${a.left}px, ${a.top}px)`, width: `${a.width}px`, height: `${a.height}px`, borderRadius: radiusA },
        { transform: `translate(${b.left}px, ${b.top}px)`, width: `${b.width}px`, height: `${b.height}px`, borderRadius: radiusB },
    ], { duration, easing: EASE_IOS, fill: 'forwards' });

    const done = () => {
        fromEl.style.visibility = '';
        toEl.style.visibility = '';
        ghost.remove();
    };
    anim.finished.then(done, done);
    return anim;
}
