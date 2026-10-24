import { emptyState, pillButton } from '../ui/components.js';

export default function renderNotFound(ctx) {
    ctx.shell({ title: '', largeTitle: false, back: true });
    ctx.body.innerHTML = emptyState({ iconName: 'info', title: 'ページが見つかりません', action: pillButton({ href: '/', label: 'ホームへ' }) });
}
