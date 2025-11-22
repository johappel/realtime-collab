/**
 * Image utilities for client-side image processing
 */

/**
 * Resizes an image file to fit within maxWidth x maxHeight while maintaining aspect ratio
 * @param file - Image file to resize
 * @param maxWidth - Maximum width (default: 800)
 * @param maxHeight - Maximum height (default: 800)
 * @returns Resized image as Blob
 */
export async function resizeImage(
    file: File,
    maxWidth: number = 800,
    maxHeight: number = 800
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };

        reader.onerror = () => {
            reject(new Error('Failed to read image file'));
        };

        img.onload = () => {
            // Calculate new dimensions
            let width = img.width;
            let height = img.height;

            // Only resize if image is larger than max dimensions
            if (width <= maxWidth && height <= maxHeight) {
                // Image is already small enough, return original
                resolve(file);
                return;
            }

            // Calculate scaling factor to maintain aspect ratio
            const widthRatio = maxWidth / width;
            const heightRatio = maxHeight / height;
            const ratio = Math.min(widthRatio, heightRatio);

            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);

            // Create canvas and draw resized image
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Convert canvas to Blob
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create blob from canvas'));
                }
            }, file.type || 'image/png');
        };

        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };

        reader.readAsDataURL(file);
    });
}
