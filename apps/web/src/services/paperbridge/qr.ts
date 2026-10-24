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
 * Defaults to brand forest green (#004225) on white background for high camera scan contrast.
 */
export async function generateQRCodeDataUrl(
  content: string,
  options: GenerateQROptions = {},
): Promise<string> {
  try {
    return await QRCode.toDataURL(content, {
      errorCorrectionLevel: options.errorCorrectionLevel ?? 'M',
      margin: options.margin ?? 4,
      width: options.width ?? 320,
      color: {
        dark: options.darkColor ?? '#004225',
        light: options.lightColor ?? '#ffffff',
      },
    });
  } catch (error) {
    throw new PaperBridgeError('Failed to generate QR code image.', 'INVALID_TASK', error);
  }
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
