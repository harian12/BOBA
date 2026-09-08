import { defineStore } from 'pinia';
import { ref, computed, reactive, triggerRef } from 'vue';
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
  if (typeof window !== 'undefined') {
    tauriBridge.sftpSetConcurrency(maxConcurrent.value).catch(() => {});
  }
  const lastCompletedAt = ref<number>(0);
  let isListenerRegistered = false;
  let pendingBatch: TransferItem[] = [];
  let batchTimer: any = null;
  let isCancellingAll = false;
  let cancelAllTimeout: any = null;
  const isRetryingAll = ref(false);
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
        triggerRef(transfers);
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
        if (payload.file_name) {
          item.fileName = payload.file_name;
        }
        item.bytesTransferred = payload.bytes_transferred !== undefined ? payload.bytes_transferred : item.bytesTransferred;
        if (payload.total_bytes !== undefined && payload.total_bytes > 0) {
          item.totalBytes = payload.total_bytes;
        }
        item.percentage = payload.percentage !== undefined ? payload.percentage : item.percentage;
        item.speedBps = payload.status === 'cancelled' ? 0 : (payload.speed_bps || 0);
        const prevStatus = item.status;
        item.status = payload.status || item.status;
        if (payload.status === 'completed') {
          item.percentage = 100;
          item.speedBps = 0;
          if (item.totalBytes > 0) {
            item.bytesTransferred = item.totalBytes;
          }
          if (prevStatus !== 'completed') {
            lastCompletedAt.value = Date.now();
          }
        }
        if (payload.error_message) {
          item.errorMessage = payload.error_message;
        }
        if (!transferMap.has(item.id)) {
          transferMap.set(item.id, item);
        }
        if (prevStatus !== item.status) {
          triggerRef(transfers);
        }
      } else {
        // Abaikan jika status adalah cancelled (sisa cancel yang lewat)
        if (payload.status === 'cancelled') {
          return;
        }
        // Auto-register items emitted by backend (e.g. recursive folder upload/download)
        const newItem: TransferItem = reactive({
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
        });
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
    const newItem: TransferItem = reactive({
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
    });

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    triggerRef(transfers);
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
    const newItem: TransferItem = reactive({
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
    });

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    triggerRef(transfers);
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
    const newItem: TransferItem = reactive({
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
    });

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    triggerRef(transfers);
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
    const newItem: TransferItem = reactive({
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
    });

    transferMap.set(id, newItem);
    transfers.value.unshift(newItem);
    triggerRef(transfers);
    return id;
  }

  function updateStatus(id: string, status: TransferItem['status'], errorMessage?: string) {
    const item = transferMap.get(id) || transfers.value.find(t => t.id === id);
    if (item) {
      const prevStatus = item.status;
      item.status = status;
      if (status === 'completed') {
        item.percentage = 100;
        item.speedBps = 0;
        if (item.totalBytes > 0) {
          item.bytesTransferred = item.totalBytes;
        }
        lastCompletedAt.value = Date.now();
      }
      if (errorMessage) {
        item.errorMessage = errorMessage;
      }
      if (prevStatus !== status) {
        triggerRef(transfers);
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
      triggerRef(transfers);
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
    triggerRef(transfers);
  }

  function clearCancelledAndFailed() {
    const toRemove = new Set(transfers.value.filter(t => t.status === 'error' || t.status === 'cancelled').map(t => t.id));
    toRemove.forEach(id => transferMap.delete(id));
    transfers.value = transfers.value.filter(t => t.status !== 'error' && t.status !== 'cancelled');
    triggerRef(transfers);
  }

  function clearAll() {
    cancelAll();
    transferMap.clear();
    transfers.value = [];
    triggerRef(transfers);
  }

  function clearCompleted() {
    const completedIds = new Set(transfers.value.filter(t => t.status === 'completed').map(t => t.id));
    completedIds.forEach(id => transferMap.delete(id));
    transfers.value = transfers.value.filter(t => t.status === 'transferring' || t.status === 'pending');
    triggerRef(transfers);
  }

  function removeTransfer(transferId: string) {
    cancelTransfer(transferId);
    transferMap.delete(transferId);
    transfers.value = transfers.value.filter(t => t.id !== transferId);
    triggerRef(transfers);
  }

  async function resumeTransfer(transferId: string, destinationSessionId?: string) {
    const item = transfers.value.find(t => t.id === transferId);
    if (!item) return;

    if (item.status === 'transferring' || item.status === 'completed') return;

    item.status = 'pending';
    item.errorMessage = undefined;
    triggerRef(transfers);

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
      } else if (item.direction === 'remote-to-remote' && item.localPath) {
        const dstId = destinationSessionId || item.targetSessionId || (
          item.localPath.startsWith('Remote:') ? '' : undefined
        );
        if (!dstId) {
          throw new Error('Sesi server tujuan tidak ditemukan untuk transfer ini.');
        }
        item.targetSessionId = dstId;
        const targetPath = item.localPath.startsWith('Remote:') ? item.remotePath : item.localPath;
        await tauriBridge.sftpTransferRemoteToRemote(
          item.sessionId,
          dstId,
          item.id,
          item.remotePath,
          targetPath,
          maxConcurrent.value
        );
      }
    } catch (err: any) {
      item.status = 'error';
      item.errorMessage = String(err);
      triggerRef(transfers);
    }
  }

  async function restartTransfer(transferId: string, destinationSessionId?: string) {
    const item = transfers.value.find(t => t.id === transferId);
    if (!item) return;

    if (item.status === 'transferring') return;

    item.bytesTransferred = 0;
    item.percentage = 0;
    item.status = 'pending';
    item.errorMessage = undefined;
    triggerRef(transfers);

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
        const dstId = destinationSessionId || item.targetSessionId || (
          item.localPath.startsWith('Remote:') ? '' : undefined
        );
        if (!dstId) {
          throw new Error('Sesi server tujuan tidak ditemukan untuk transfer ini.');
        }
        item.targetSessionId = dstId;
        const targetPath = item.localPath.startsWith('Remote:') ? item.remotePath : item.localPath;
        await tauriBridge.sftpTransferRemoteToRemote(
          item.sessionId,
          dstId,
          item.id,
          item.remotePath,
          targetPath,
          maxConcurrent.value
        );
      }
    } catch (err: any) {
      item.status = 'error';
      item.errorMessage = String(err);
      triggerRef(transfers);
    }
  }

  async function resumeAllFailed(resolveDstId?: (item: TransferItem) => Promise<string | undefined> | string | undefined) {
    if (isRetryingAll.value) return;
    let targetList = transfers.value.filter(
      t => t.status === 'error' || t.status === 'cancelled'
    );
    if (targetList.length === 0) return;

    // Jika ada file individual yang gagal, filter keluar folder induk agar tidak memicu re-scan ganda
    const hasFiles = targetList.some(t => !t.fileName.startsWith('📁'));
    if (hasFiles) {
      targetList = targetList.filter(t => !t.fileName.startsWith('📁'));
    }

    isRetryingAll.value = true;
    try {
      for (const item of targetList) {
        item.status = 'pending';
        item.errorMessage = undefined;
      }
      triggerRef(transfers);

      const executing = new Set<Promise<void>>();
      const limit = Math.min(5, maxConcurrent.value);
      for (const item of targetList) {
        if (isCancellingAll) break;

        while (executing.size >= limit) {
          await Promise.race([...executing, onConcurrencyChange()]);
          if (isCancellingAll) break;
        }
        if (isCancellingAll) break;

        let dstId: string | undefined;
        try {
          dstId = resolveDstId ? await resolveDstId(item) : item.targetSessionId;
        } catch {
          dstId = item.targetSessionId;
        }

        const p = Promise.race([
          resumeTransfer(item.id, dstId),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Transfer timeout setelah 45 detik')), 45000))
        ]).catch((err) => {
          item.status = 'error';
          item.errorMessage = String(err);
          triggerRef(transfers);
        }).finally(() => {
          executing.delete(p);
        });
        executing.add(p);
      }
      await Promise.all(executing);
    } finally {
      isRetryingAll.value = false;
    }
  }

  async function restartAllFailed(resolveDstId?: (item: TransferItem) => Promise<string | undefined> | string | undefined) {
    if (isRetryingAll.value) return;
    let targetList = transfers.value.filter(
      t => t.status === 'error' || t.status === 'cancelled'
    );
    if (targetList.length === 0) return;

    // Jika ada file individual yang gagal, filter keluar folder induk agar tidak memicu re-scan ganda
    const hasFiles = targetList.some(t => !t.fileName.startsWith('📁'));
    if (hasFiles) {
      targetList = targetList.filter(t => !t.fileName.startsWith('📁'));
    }

    isRetryingAll.value = true;
    try {
      for (const item of targetList) {
        item.bytesTransferred = 0;
        item.percentage = 0;
        item.status = 'pending';
        item.errorMessage = undefined;
      }
      triggerRef(transfers);

      const executing = new Set<Promise<void>>();
      const limit = Math.min(5, maxConcurrent.value);
      for (const item of targetList) {
        if (isCancellingAll) break;

        while (executing.size >= limit) {
          await Promise.race([...executing, onConcurrencyChange()]);
          if (isCancellingAll) break;
        }
        if (isCancellingAll) break;

        let dstId: string | undefined;
        try {
          dstId = resolveDstId ? await resolveDstId(item) : item.targetSessionId;
        } catch {
          dstId = item.targetSessionId;
        }

        const p = Promise.race([
          restartTransfer(item.id, dstId),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Transfer timeout setelah 45 detik')), 45000))
        ]).catch((err) => {
          item.status = 'error';
          item.errorMessage = String(err);
          triggerRef(transfers);
        }).finally(() => {
          executing.delete(p);
        });
        executing.add(p);
      }
      await Promise.all(executing);
    } finally {
      isRetryingAll.value = false;
    }
  }

  async function processPendingQueue(resolveDstId?: (item: TransferItem) => Promise<string | undefined> | string | undefined) {
    if (isRetryingAll.value) return;
    let targetList = transfers.value.filter(t => t.status === 'pending');
    if (targetList.length === 0) return;

    // Filter folder induk jika ada file individual di antrean
    const hasFiles = targetList.some(t => !t.fileName.startsWith('📁'));
    if (hasFiles) {
      targetList = targetList.filter(t => !t.fileName.startsWith('📁'));
    }

    isRetryingAll.value = true;
    try {
      const executing = new Set<Promise<void>>();
      const limit = Math.min(5, maxConcurrent.value);
      for (const item of targetList) {
        if (isCancellingAll) break;

        while (executing.size >= limit) {
          await Promise.race([...executing, onConcurrencyChange()]);
          if (isCancellingAll) break;
        }
        if (isCancellingAll) break;

        let dstId: string | undefined;
        try {
          dstId = resolveDstId ? await resolveDstId(item) : item.targetSessionId;
        } catch {
          dstId = item.targetSessionId;
        }

        const p = Promise.race([
          resumeTransfer(item.id, dstId),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Transfer timeout setelah 45 detik')), 45000))
        ]).catch((err) => {
          item.status = 'error';
          item.errorMessage = String(err);
          triggerRef(transfers);
        }).finally(() => {
          executing.delete(p);
        });
        executing.add(p);
      }
      await Promise.all(executing);
    } finally {
      isRetryingAll.value = false;
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
    resumeAllFailed,
    restartAllFailed,
    processPendingQueue,
    isRetryingAll,
    cancelTransfer,
    cancelAll,
    hasActiveTransfers,
    clearCompleted,
    clearCancelledAndFailed,
    clearAll,
    removeTransfer,
  };
});
