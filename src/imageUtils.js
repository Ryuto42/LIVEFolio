import { alertDialog } from './ui/components.js';

export function setupImageUpload(container) {
    const input = container.querySelector('#image-input');
    const preview = container.querySelector('#image-preview');
    const uploadIcon = container.querySelector('#upload-icon');
    
    if (!input) return;

    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        // 選択をキャンセルしたときは、いま表示している写真をそのまま残す（表示と保存結果を食い違わせない）
        if (!file) return;

        try {
            const base64 = await compressImage(file, 800); // Max 800px for JSON export size reduction
            input.dataset.base64 = base64; // Store base64 string on the element for extraction
            preview.src = base64;
            preview.hidden = false;
            uploadIcon.hidden = true;
            input.dispatchEvent(new CustomEvent('image-ready'));
        } catch (err) {
            console.error('Failed to compress image', err);
            alertDialog('画像を読み込めませんでした', '別の写真を選んでください。');
        }
    });
}

function compressImage(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 0.7 quality for smaller JSON exports
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}
