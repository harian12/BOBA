import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';

export interface TransferItem {
  id: string;
  sessionId: string;
  targetSessionId?: string;
  fileName: string;
  remotePath: string;
  localPath?: string;
  sourceLabel?: string;
  targetLabel?: string;
  direction: 'upload' | 'download' | 'remote-to-remote' | 'compress' | 'extract';
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
  const transferMap = new Map<string, TransferItem>();
  const isTrayExpanded = ref(true);
  const maxConcurrent = ref<number>(
    typeof window !== 'undefined' ? Math.max(1, Math.min(20, Number(localStorage.getItem('boba_sftp_concurrency') || 5))) : 5
  );
  const lastCompletedAt = ref<number>(0);
  let isListenerRegistered = false;
  let pendingBatch: TransferItem[] = [];
  let batchTimer: any = null;
  let isCancellingAll = false;
  let cancelAllTimeout: any = null;
  const concurrencyChangeResolvers: Set<() => void> = new Set();

  function onConcurrencyChange(): Promise<void> {
    return new Promise(resolve => {
      concurrencyChangeResolvers.add(resolve);
    });
  }

  function setMaxConcurrent(val: number) {
    maxConcurrent.value = Math.max(1, Math.min(20, val));
    if (typeof window !== 'undefined') {
      localStorage.setItem('boba_sftp_concurrency', String(maxConcurrent.value));
    }
    tauriBridge.sftpSetConcurrency(maxConcurrent.value).catch(() => {});

    // Wake up any waiting transfer loops immediately
    const resolvers = Array.from(concurrencyChangeResolvers);
    concurrencyChangeResolvers.clear();
    resolvers.forEach(r => r());
  }

  // File yang saat ini sedang aktif memompa data
  const activeTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'transferring');
  });

  // File yang menunggu giliran antrean
  const pendingTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'pending');
  });

  const completedTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'completed');
  });

  const failedTransfers = computed(() => {
    return transfers.value.filter(t => t.status === 'error' || t.status === 'cancelled');
  });

  const hasActiveTransfers = computed(() => {
    return activeTransfers.value.length > 0 || pendingTransfers.value.length > 0;
  });

  const totalSpeedBps = computed(() => {
    return activeTransfers.value.reduce((acc, t) => acc + (t.speedBps || 0), 0);
  });

  const overallRemainingBytes = computed(() => {
    const ongoing = transfers.value.filter(t => t.status === 'transferring' || t.status === 'pending');
    return ongoing.reduce((acc, t) => {
      const remaining = (t.totalBytes || 0) - (t.bytesTransferred || 0);
      return acc + (remaining > 0 ? remaining : 0);
    }, 0);
  });

  const overallEta = computed(() => {
    const speed = totalSpeedBps.value;
    const remaining = overallRemainingBytes.value;
    if (speed <= 0 || remaining <= 0) return '';
    const seconds = Math.round(remaining / speed);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSecs}s`;
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    return `${hours}h ${remMins}m`;
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

    function flushBatch() {
      if (pendingBatch.length > 0) {
        transfers.value.unshift(...pendingBatch);
        pendingBatch = [];
      }
      batchTimer = null;
    }

    tauriBridge.onSftpProgress((payload: any) => {
      if (isCancellingAll) {
        return;
      }
      const item = transferMap.get(payload.transfer_id) || transfers.value.find(t => t.id === payload.transfer_id);
      if (item) {
        if (item.status === 'cancelled') {
          return;
        }
        item.bytesTransferred = payload.bytes_transferred || 0;
        item.totalBytes = payload.total_bytes || item.totalBytes;
        item.percentage = payload.percentage || 0;
        item.speedBps = payload.status === 'cancelled' ? 0 : (payload.speed_bps || 0);
        const prevStatus = item.status;
        item.status = payload.status || item.status;
        if (payload.status === 'completed' && prevStatus !== 'completed') {
          lastCompletedAt.value = Date.now();
        }
        if (payload.error_message) {
          item.errorMessage = payload.error_message;
        }
        if (!transferMap.has(item.id)) {
          transferMap.set(item.id, item);
        }
      } else {
        // Abaikan jika status adalah cancelled atau error (sisa cancel yang lewat)
        if (payload.status === 'cancelled' || payload.status === 'error') {
          return;
        }
        // Auto-register items emitted by backend (e.g. recursive folder upload/download)
        const newItem: TransferItem = {
          id: payload.transfer_id,
          sessionId: payload.session_id || '',
          fileName: payload.file_name || 'File',
          remotePath: payload.remote_path || '',
          localPath: payload.local_path || undefined,
          direction: (payload.direction as any) || 'upload',
          bytesTransferred: payload.bytes_transferred || 0,
          totalBytes: payload.total_bytes || 0,
          percentage: payload.percentage || 0,
          speedBps: payload.speed_bps || 0,
          status: payload.status || 'transferring',
          errorMessage: payload.error_message,
          createdAt: Date.now(),
        };
        transferMap.set(newItem.id, newItem);
        pendingBatch.unshift(newItem);
        if (!batchTimer) {
          batchTimer = setTimeout(flushBatch, 50);
        }
      }
    }).catch(err => {
      console.warn('Failed to listen to sftp-progress', err);
    });
  }

  function addRemoteToRemote(
    sessionId: string,
    remotePath: string,
    fileName: string,
    totalBytes: number = 0,
    targetPath: string = '',
    sourceLabel?: string,
    targetLabel?: string,
    targetSessionId?: string
  ): string {
    initListener();
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: TransferItem = {
      id,
      sessionId,
      targetSessionId,
      fileName,
      remotePath,
      localPath: targetPath,
      sourceLabel,
      targetLabel,
      direction: 'remote-to-remote',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      speedBps: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    return id;
  }

  function addDownload(
    sessionId: string,
    remotePath: string,
    fileName: string,
    totalBytes: number = 0,
    localPath: string = '',
    sourceLabel?: string,
    targetLabel?: string
  ): string {
    initListener();
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: TransferItem = {
      id,
      sessionId,
      fileName,
      remotePath,
      localPath,
      sourceLabel,
      targetLabel,
      direction: 'download',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      speedBps: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    return id;
  }

  function addUpload(
    sessionId: string,
    remotePath: string,
    fileName: string,
    totalBytes: number = 0,
    localPath: string = '',
    sourceLabel?: string,
    targetLabel?: string
  ): string {
    initListener();
    const id = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: TransferItem = {
      id,
      sessionId,
      fileName,
      remotePath,
      localPath,
      sourceLabel,
      targetLabel,
      direction: 'upload',
      bytesTransferred: 0,
      totalBytes,
      percentage: 0,
      speedBps: 0,
      status: 'pending',
      createdAt: Date.now(),
    };

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    return id;
  }

  function addOperation(
    sessionId: string,
    type: 'compress' | 'extract',
    targetName: string,
    remotePath: string
  ): string {
    initListener();
    const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: TransferItem = {
      id,
      sessionId,
      fileName: (type === 'compress' ? '📦 ' : '📂 ') + targetName,
      remotePath,
      direction: type,
      bytesTransferred: 0,
      totalBytes: 0,
      percentage: 0,
      speedBps: 0,
      status: 'transferring',
      createdAt: Date.now(),
      startedAt: Date.now(),
    };

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    return id;
  }

  function updateStatus(id: string, status: TransferItem['status'], errorMessage?: string) {
    const item = transferMap.get(id) || transfers.value.find(t => t.id === id);
    if (item) {
      item.status = status;
      if (status === 'completed') {
        item.percentage = 100;
      }
      if (errorMessage) {
        item.errorMessage = errorMessage;
      }
    }
  }

  async function cancelTransfer(transferId: string) {
    const item = transferMap.get(transferId) || transfers.value.find(t => t.id === transferId);
    if (item) {
      if (item.direction === 'upload' || item.direction === 'download' || item.direction === 'remote-to-remote') {
        await tauriBridge.sftpCancelTransfer(transferId).catch(() => {});
      } else if (item.direction === 'compress' && item.remotePath) {
        // Hapus file parsial jika ada di remote
        const cleanCmd = `rm -f "${item.remotePath}"`;
        tauriBridge.sshExecCommand(item.sessionId, cleanCmd).catch(() => {});
      }
      // Langsung hapus item dari antrean agar tidak nyangkut di list UI
      transferMap.delete(transferId);
      transfers.value = transfers.value.filter(t => t.id !== transferId);
    }
  }

  function cancelAll() {
    isCancellingAll = true;
    if (cancelAllTimeout) clearTimeout(cancelAllTimeout);
    cancelAllTimeout = setTimeout(() => {
      isCancellingAll = false;
    }, 2000);

    tauriBridge.sftpCancelAll().catch(() => {});
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    pendingBatch = [];

    // Langsung hapus semua antrean aktif dan menunggu agar UI bersih seketika
    transfers.value = transfers.value.filter(t => t.status !== 'transferring' && t.status !== 'pending');
    transferMap.clear();
    for (const t of transfers.value) {
      transferMap.set(t.id, t);
    }
  }

  function clearCancelledAndFailed() {
    const toRemove = new Set(transfers.value.filter(t => t.status === 'error' || t.status === 'cancelled').map(t => t.id));
    toRemove.forEach(id => transferMap.delete(id));
    transfers.value = transfers.value.filter(t => t.status !== 'error' && t.status !== 'cancelled');
  }

  function clearAll() {
    cancelAll();
    transferMap.clear();
    transfers.value = [];
  }

  function clearCompleted() {
    const completedIds = new Set(transfers.value.filter(t => t.status === 'completed').map(t => t.id));
    completedIds.forEach(id => transferMap.delete(id));
    transfers.value = transfers.value.filter(t => t.status === 'transferring' || t.status === 'pending');
  }

  function removeTransfer(transferId: string) {
    cancelTransfer(transferId);
    transferMap.delete(transferId);
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
      } else if (item.direction === 'remote-to-remote' && item.localPath) {
        const dstId = item.targetSessionId || (
          item.localPath.startsWith('Remote:') ? item.localPath.replace('Remote:', '') : ''
        );
        if (dstId) {
          await tauriBridge.sftpTransferRemoteToRemote(
            item.sessionId,
            dstId,
            item.id,
            item.remotePath,
            item.localPath.startsWith('Remote:') ? item.remotePath : item.localPath,
            maxConcurrent.value
          );
        }
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
    pendingTransfers,
    completedTransfers,
    failedTransfers,
    maxConcurrent,
    setMaxConcurrent,
    onConcurrencyChange,
    totalSpeedBps,
    overallPercentage,
    overallRemainingBytes,
    overallEta,
    lastCompletedAt,
    initListener,
    addDownload,
    addUpload,
    addRemoteToRemote,
    addOperation,
    updateStatus,
    resumeTransfer,
    restartTransfer,
    cancelTransfer,
    cancelAll,
    hasActiveTransfers,
    clearCompleted,
    clearCancelledAndFailed,
    clearAll,
    removeTransfer,
  };
});
