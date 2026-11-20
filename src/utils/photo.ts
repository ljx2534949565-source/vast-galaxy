/**
 * 壁纸图片压缩：把「一张手机照片」变成「一段能塞进本地存储配额的 dataURL」。
 *
 * 原来的 1600px / JPEG 0.82 一张要 300KB 上下，存十几张就把 WebView 给 App 的
 * localStorage 配额吃满了。这里改成 WebP 优先（体积大约只有同画质 JPEG 的六成），
 * 再按体积逐级降档，一张控制在 ~150K 字符以内；老 JPEG 壁纸也能用同一套逻辑重压。
 */

/** 目标：单张 dataURL 的字符数。localStorage 是按字符串算配额的，不是按文件字节 */
export const MAX_WALLPAPER_CHARS = 150000;

export interface EncodeStep {
  edge: number;
  quality: number;
}

/** 从清晰到省地方，第一档达标就收手 */
export const ENCODE_STEPS: EncodeStep[] = [
  { edge: 1280, quality: 0.74 },
  { edge: 1280, quality: 0.64 },
  { edge: 1080, quality: 0.62 },
  { edge: 960, quality: 0.56 }
];

/** 浏览器给单个应用的本地存储配额，经验值约 5M 字符；不同 WebView 会略有出入 */
export const STORAGE_QUOTA_CHARS = 5 * 1024 * 1024;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('这张图片读不出来，换一张试试'));
    image.src = src;
  });
}

/** 不支持 WebP 的 WebView 会悄悄返回 PNG（反而更大），所以要认一下前缀再退回 JPEG */
function toDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', quality);
}

export function encodeImage(image: HTMLImageElement, step: EncodeStep): string {
  const longest = Math.max(image.width, image.height) || 1;
  const scale = Math.min(1, step.edge / longest);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('这台设备的浏览器不支持图片处理');
  // JPEG/WebP 都没有透明通道，先铺白底，免得透明 PNG 变成黑块
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return toDataUrl(canvas, step.quality);
}

/** 从任意图片地址（blob: 或 data:）压出一张达标壁纸 */
export async function encodeFromSource(src: string): Promise<string> {
  const image = await loadImage(src);
  let result = '';
  for (const step of ENCODE_STEPS) {
    result = encodeImage(image, step);
    if (result.length <= MAX_WALLPAPER_CHARS) break;
  }
  return result;
}

/** 用户刚从文件选择器里挑的图 */
export async function encodeFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return await encodeFromSource(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 把字符数说成人能看懂的「MB」；配额按字符算，1 字符按 1 字节估算 */
export function formatStorage(chars: number): string {
  return `${(chars / 1024 / 1024).toFixed(1)} MB`;
}
