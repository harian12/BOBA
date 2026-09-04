import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';

export interface TransferItem {
  id: string;
  sessionId: string;
  fileName: string;
  remotePath: string;
  localPath?: string;
  direction: 'upload' | 'download';
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  speedBps: number;
  status: 'pending' | 'transferring' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
  createdAt: number;
  startedAt?: number;
}

export const useTransferQueueStore = defineStore('transferQueue', () => {
  const transfers = ref<TransferItem[]>([]);
  const isTrayExpanded = ref(true);
  let isListenerRegistered = false;

  const activeTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'transferring' || t.status === 'pending');
  });

  const completedTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'completed');
  });

  const failedTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'error' || t.status === 'cancelled');
  });

  const totalSpeedBps = computed(() => {
    return activeTransfers.value.reduce((acc, t) => acc + (t.speedBps || 0), 0);
  });

  const overallPercentage = computed(() => {
    const active = activeTransfers.value;
    if (active.length === 0) return 100;
    const totalBytes = active.reduce((acc, t) => acc + t.totalBytes, 0);
    const transferred = active.reduce((acc, t) => acc + t.bytesTransferred, 0);
    if (totalBytes === 0) return 0;
    return Math.min(100, Math.round((transferred / totalBytes) * 100));
  });

  function initListener() {
    if (isListenerRegistered) return;
    isListenerRegistered = true;

    tauriBridge.onSftpProgress((payload: any) => {
      const item = transfers.value.find(t => t.id === payload.transfer_id);
      if (item) {
        item.bytesTransferred = payload.bytes_transferred || 0;
        item.totalBytes = payload.total_bytes || item.totalBytes;
        item.percentage = payload.percentage || 0;
        item.speedBps = payload.speed_bps || 0;
        item.status = payload.status || item.status;
        if (payload.error_message) {
          item.errorMessage = payload.error_message;
        }
      }
    }).catch(err => {
      console.warn('Failed to listen to sftp-progress', err);
    });
  }

  function addDownload(sessionId: string, remotePath: string, fileName: string, totalBytes: number = 0, localPath: string = ''): string {
    initListener();
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: TransferItem = {
      id,
      sessionId,
      fileName,
      remotePath,
      localPath,
      direction: 'download',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      speedBps: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    transfers.value.unshift(newItem);
    return id;
  }

  function addUpload(sessionId: string, remotePath: string, fileName: string, totalBytes: number = 0, localPath: string = ''): string {
    initListener();
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: TransferItem = {
      id,
      sessionId,
      fileName,
      remotePath,
      localPath,
      direction: 'upload',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      speedBps: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    transfers.value.unshift(newItem);
    return id;
  }

  async function cancelTransfer(transferId: string) {
    const item = transfers.value.find(t => t.id === transferId);
    if (item && (item.status === 'transferring' || item.status === 'pending')) {
      item.status = 'cancelled';
      item.errorMessage = 'Cancelled by user';
      await tauriBridge.sftpCancelTransfer(transferId).catch(() => {});
    }
  }

  function clearCompleted() {
    transfers.value = transfers.value.filter(t => t.status === 'transferring' || t.status === 'pending');
  }

  function removeTransfer(transferId: string) {
    cancelTransfer(transferId);
    transfers.value = transfers.value.filter(t => t.id !== transferId);
  }

  async function resumeTransfer(transferId: string) {
    const item = transfers.value.find(t => t.id === transferId);
    if (!item) return;

    if (item.status !== 'error' && item.status !== 'cancelled') return;

    item.status = 'pending';
    item.errorMessage = undefined;

    try {
      if (item.direction === 'download' && item.localPath) {
        await tauriBridge.sftpDownloadStream(
          item.sessionId,
          item.id,
          item.remotePath,
          item.localPath,
          item.bytesTransferred
        );
      } else if (item.direction === 'upload' && item.localPath) {
        await tauriBridge.sftpUploadStream(
          item.sessionId,
          item.id,
          item.localPath,
          item.remotePath,
          item.bytesTransferred
        );
      }
    } catch (err: any) {
      item.status = 'error';
      item.errorMessage = String(err);
    }
  }

  async function restartTransfer(transferId: string) {
    const item = transfers.value.find(t => t.id === transferId);
    if (!item) return;

    item.bytesTransferred = 0;
    item.percentage = 0;
    item.status = 'pending';
    item.errorMessage = undefined;

    try {
      if (item.direction === 'download' && item.localPath) {
        await tauriBridge.sftpDownloadStream(
          item.sessionId,
          item.id,
          item.remotePath,
          item.localPath,
          0
        );
      } else if (item.direction === 'upload' && item.localPath) {
        await tauriBridge.sftpUploadStream(
          item.sessionId,
          item.id,
          item.localPath,
          item.remotePath,
          0
        );
      }
    } catch (err: any) {
      item.status = 'error';
      item.errorMessage = String(err);
    }
  }

  return {
    transfers,
    isTrayExpanded,
    activeTransfers,
    completedTransfers,
    failedTransfers,
    totalSpeedBps,
    overallPercentage,
    initListener,
    addDownload,
    addUpload,
    resumeTransfer,
    restartTransfer,
    cancelTransfer,
    clearCompleted,
    removeTransfer,
  };
});
