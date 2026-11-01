// Shrinks photos in the browser before they're uploaded: the longest side becomes
// at most `maxSize` pixels and the file is saved as WebP. A 4 MB phone photo usually
// ends up around 150–400 KB, which matters on mobile data.
// Browsers that can't make WebP (older iPhones) get a high-quality JPEG instead.

export async function compressImage(file, { maxSize = 1600, quality = 0.82 } = {}) {
  const source = await decode(file);
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff'; // transparent PNGs get a white background instead of black
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  source.close?.();

  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.86);
  if (!blob) throw new Error('image-encode-failed');
  return blob;
}

export const extensionFor = (blob) => (blob.type === 'image/webp' ? 'webp' : 'jpg');

// Reads the photo (respecting the phone's rotation info)
async function decode(file) {
  if (!file.type.startsWith('image/')) throw new Error('not-an-image');
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback for browsers without createImageBitmap support for this file
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
