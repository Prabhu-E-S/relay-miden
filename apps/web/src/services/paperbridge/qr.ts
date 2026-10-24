import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PaperBridgeError } from '@relay-miden/shared';

export interface GenerateQROptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  width?: number;
  darkColor?: string;
  lightColor?: string;
}

/**
 * Generates a PNG data URL representation of the QR code using the centralized brand palette.
 * Callers provide the centralized brand color; the neutral fallback keeps this service UI-independent.
 */
export async function generateQRCodeDataUrl(
  content: string,
  options: GenerateQROptions = {},
): Promise<string> {
  try {
    const baseWidth = options.width ?? 1024;
    const levels = [options.errorCorrectionLevel ?? 'M', 'L', 'Q'] as const;
    for (const width of [baseWidth, Math.max(baseWidth, 1280), Math.max(baseWidth, 1536)]) {
      for (const errorCorrectionLevel of levels) {
        const dataUrl = await QRCode.toDataURL(content, {
          errorCorrectionLevel,
          margin: options.margin ?? 4,
          width,
          color: {
            dark: options.darkColor ?? '#000000',
            light: options.lightColor ?? '#ffffff',
          },
        });
        if (typeof document === 'undefined' || (await generatedQRDecodes(dataUrl, content))) {
          return dataUrl;
        }
      }
    }
    throw new PaperBridgeError(
      'This QR could not be verified locally. Shorten the task text and try again.',
      'INVALID_TASK',
    );
  } catch (error) {
    if (error instanceof PaperBridgeError) throw error;
    throw new PaperBridgeError('Failed to generate QR code image.', 'INVALID_TASK', error);
  }
}

async function generatedQRDecodes(dataUrl: string, expected: string): Promise<boolean> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return (
    jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })?.data ===
    expected
  );
}

/**
 * Decodes a QR code directly from an uploaded File object (PNG, JPEG, WebP)
 * entirely inside the browser without network or server access.
 */
export async function scanQRCodeFromImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new PaperBridgeError(
      'Selected file is not an image. Please select a PNG or JPEG image.',
      'INVALID_JSON',
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new PaperBridgeError('Could not read image file.', 'INVALID_JSON'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new PaperBridgeError('Canvas 2D context is not available.', 'INVALID_JSON');
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (decoded && decoded.data) {
      return decoded.data;
    }

    // If native full resolution didn't decode (e.g. huge smartphone photo), try a scaled down version
    if (canvas.width > 1200 || canvas.height > 1200) {
      const maxDim = 1000;
      const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height);
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = Math.round(canvas.width * scale);
      scaledCanvas.height = Math.round(canvas.height * scale);
      const scaledCtx = scaledCanvas.getContext('2d', { willReadFrequently: true });
      if (scaledCtx) {
        scaledCtx.drawImage(canvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
        const scaledData = scaledCtx.getImageData(0, 0, scaledCanvas.width, scaledCanvas.height);
        const scaledDecoded = jsQR(scaledData.data, scaledData.width, scaledData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (scaledDecoded && scaledDecoded.data) {
          return scaledDecoded.data;
        }
      }
    }

    throw new PaperBridgeError(
      'No QR code could be found in this image. Ensure the QR is clear, focused, and well-lit.',
      'INVALID_ENVELOPE',
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
