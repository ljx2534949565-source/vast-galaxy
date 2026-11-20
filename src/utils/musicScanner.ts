/**
 * 本地音乐自动扫描的原生能力封装。
 *
 * 安卓 App 里走 MusicScannerPlugin：直接查系统媒体库，不用用户手动选文件
 * （网页里的 <input type="file"> 在 WebView 上要么调不起、要么选完拿不到路径）。
 * H5 调试环境没有媒体库，降级成文件选择器，由调用方兜底。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AudioFileLike } from '@/utils/music';

export interface NativeScanResult {
  /** 权限是否到手；false 时 tracks 为空，前端提示去系统设置开权限 */
  granted: boolean;
  /** 媒体库扫到的音频，带可读的 content:// 位置 */
  tracks: AudioFileLike[];
  /** 媒体库原始条目数（含被后缀过滤掉的），排查「扫不到」用 */
  raw: number;
  /** 原生侧的诊断备注，出问题时给人看，不暴露堆栈 */
  note: string;
}

interface MusicScannerPluginApi {
  scan(): Promise<NativeScanResult>;
}

const MusicScanner = registerPlugin<MusicScannerPluginApi>('MusicScanner');

/** 是不是能走原生自动扫描的真机环境 */
export function nativeMusicAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** 查系统媒体库。权限被拒按「没扫到」处理，不抛异常打断界面。 */
export async function scanNativeMusic(): Promise<NativeScanResult> {
  try {
    const res = await MusicScanner.scan();
    return {
      granted: res?.granted === true,
      tracks: Array.isArray(res?.tracks) ? res.tracks : [],
      raw: Number(res?.raw ?? 0),
      note: String(res?.note ?? '')
    };
  } catch (error) {
    return {
      granted: false,
      tracks: [],
      raw: 0,
      note: (error as Error)?.message || '扫描失败'
    };
  }
}
