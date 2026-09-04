<template>
  <div
    class="w-96 h-full bg-[#12141c] border-l border-[#232936] flex flex-col z-20 select-none shadow-2xl transition-all"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop.prevent="handleDrop"
  >
    <!-- SFTP Drawer Header -->
    <div class="h-10 bg-[#161922] border-b border-[#232936] flex items-center justify-between px-3 text-xs">
      <div class="flex items-center space-x-2 text-slate-300 font-semibold">
        <span>📁</span>
        <span>SFTP Explorer</span>
      </div>

      <div class="flex items-center space-x-1">
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          multiple
          @change="handleFileUpload"
        />

        <!-- New Folder -->
        <button
          @click="promptNewFolder"
          :disabled="!connected || loading"
          class="p-1 text-slate-400 hover:text-sky-400 disabled:opacity-30 rounded hover:bg-[#232936] transition"
          title="New Folder"
        >
          ➕📁
        </button>

        <!-- Upload File Button -->
        <button
          @click="triggerUploadDialog"
          :disabled="!connected || uploading"
          class="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded text-[11px] font-medium transition flex items-center space-x-1"
          title="Upload file"
        >
          <span>⬆️</span>
          <span>File</span>
        </button>

        <!-- Upload Folder Button -->
        <button
          @click="triggerFolderUploadDialog"
          :disabled="!connected || uploading"
          class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-[11px] font-medium transition flex items-center space-x-1"
          title="Upload entire folder directory"
        >
          <span>📁⬆️</span>
          <span>Folder</span>
        </button>

        <!-- Hidden inputs -->
        <input
          ref="fileInputRef"
          type="file"
          multiple
          class="hidden"
          @change="handleFileUpload"
        />
        <input
          ref="folderInputRef"
          type="file"
          webkitdirectory
          directory
          multiple
          class="hidden"
          @change="handleFolderUpload"
        />

        <!-- Refresh -->
        <button
          @click="fetchFiles"
          :disabled="!connected || loading"
          class="p-1 text-slate-400 hover:text-sky-400 disabled:opacity-30 rounded hover:bg-[#232936] transition"
          title="Refresh"
        >
          🔄
        </button>

        <!-- Close -->
        <button
          @click="$emit('close')"
          class="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-[#232936] transition"
          title="Close SFTP"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Breadcrumb & Path Bar -->
    <div class="p-2 border-b border-[#232936] bg-[#0f1117] flex flex-col space-y-1.5">
      <div class="flex items-center space-x-1">
        <button
          @click="navigateUp"
          :disabled="!connected || currentPath === '/' || currentPath === '.' || currentPath === '~'"
          class="px-2 py-1 bg-[#1a1e29] hover:bg-[#232936] disabled:opacity-40 text-slate-300 rounded text-xs transition font-bold"
          title="Parent Directory"
        >
          ↑
        </button>
        <button
          @click="goToHome"
          :disabled="!connected"
          class="px-2 py-1 bg-[#1a1e29] hover:bg-[#232936] disabled:opacity-40 text-slate-300 rounded text-xs transition"
          title="Home Directory (~)"
        >
          🏠
        </button>
        <form @submit.prevent="fetchFiles" class="flex-1 flex">
          <input
            v-model="currentPath"
            :disabled="!connected"
            type="text"
            class="w-full bg-[#161922] border border-[#232936] disabled:opacity-50 text-slate-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-sky-500 font-mono"
            placeholder="~ or /home/user"
          />
        </form>
      </div>

      <!-- Quick Breadcrumbs -->
      <div class="flex items-center space-x-1 overflow-x-auto text-[11px] text-slate-400 font-mono py-0.5 no-scrollbar">
        <button
          @click="goToHome"
          :disabled="!connected"
          class="hover:text-sky-400 transition hover:underline px-1 py-0.5 rounded font-semibold text-sky-400 disabled:opacity-40"
        >
          ~ (home)
        </button>
        <span>/</span>
        <button
          @click="goToPath('/')"
          :disabled="!connected"
          class="hover:text-sky-400 transition hover:underline px-1 py-0.5 rounded disabled:opacity-40"
        >
          root(/)
        </button>
        <template v-for="(seg, idx) in pathSegments" :key="idx">
          <span class="text-slate-600">/</span>
          <button
            @click="goToSegment(idx)"
            class="hover:text-sky-300 transition hover:underline px-1 py-0.5 rounded truncate max-w-[90px]"
          >
            {{ seg }}
          </button>
        </template>
      </div>
    </div>

    <!-- Search / Filter in folder -->
    <div class="px-2 py-1.5 border-b border-[#232936] bg-[#12141c]">
      <input
        v-model="searchQuery"
        :disabled="!connected"
        type="text"
        placeholder="Filter files in directory..."
        class="w-full bg-[#161922] border border-[#232936] disabled:opacity-50 text-slate-300 text-xs px-2 py-1 rounded focus:outline-none focus:border-sky-500"
      />
    </div>

    <!-- Drag & Drop Overlay Indicator -->
    <div
      v-if="isDragging"
      class="bg-sky-500/20 border-2 border-dashed border-sky-400 m-2 p-4 rounded-xl flex items-center justify-center text-xs font-semibold text-sky-200 animate-pulse"
    >
      📥 Drop files here to upload to {{ currentPath }}
    </div>

    <!-- Transfer / Upload Status Toast -->
    <div
      v-if="transferStatus"
      class="bg-sky-950/80 border-b border-sky-800/80 px-3 py-1.5 text-xs text-sky-300 flex items-center justify-between"
    >
      <div class="flex items-center space-x-1.5">
        <span class="animate-spin text-[10px]">⏳</span>
        <span>{{ transferStatus }}</span>
      </div>
    </div>

    <!-- File List / Content -->
    <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
      <!-- Waiting for SSH Connection -->
      <div v-if="!connected" class="flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
        <span class="animate-spin text-xl">⏳</span>
        <span class="text-xs">Connecting SSH session...</span>
      </div>

      <!-- Loading Skeleton -->
      <div v-else-if="loading" class="flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
        <span class="animate-spin text-xl">⏳</span>
        <span class="text-xs">Reading remote directory...</span>
      </div>

      <!-- Error Message -->
      <div v-else-if="error" class="p-3 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 space-y-2">
        <div class="font-bold flex items-center space-x-1">
          <span>⚠️</span>
          <span>Access Error:</span>
        </div>
        <div class="text-[11px] leading-relaxed break-all font-sans">{{ error }}</div>
        <div class="flex space-x-2 pt-2 border-t border-rose-900/40">
          <button
            @click="goToHome"
            class="px-2.5 py-1 bg-rose-900 hover:bg-rose-800 text-white rounded text-xs transition"
          >
            Go to Home (~)
          </button>
          <button
            @click="goToPath('/')"
            class="px-2.5 py-1 bg-[#1a1e29] hover:bg-[#232936] text-slate-300 rounded text-xs transition"
          >
            Go to /
          </button>
        </div>
      </div>

      <!-- Empty Folder -->
      <div
        v-else-if="filteredFiles.length === 0"
        class="flex flex-col items-center justify-center h-48 text-slate-600 space-y-1"
      >
        <span>📂</span>
        <span>Directory is empty</span>
      </div>

      <!-- Items List -->
      <div
        v-else
        v-for="file in filteredFiles"
        :key="file.path"
        @click="handleFileClick(file)"
        class="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#1a1e29] cursor-pointer transition text-slate-300 hover:text-white"
      >
        <div class="flex items-center space-x-2 truncate flex-1 mr-2">
          <span class="text-sm shrink-0">{{ file.is_dir ? '📁' : '📄' }}</span>
          <span class="truncate select-text">{{ file.name }}</span>
        </div>

        <div class="flex items-center space-x-1.5 text-[10px] text-slate-500 shrink-0">
          <span v-if="!file.is_dir" class="text-slate-400">{{ formatSize(file.size) }}</span>

          <!-- Actions -->
          <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
            <!-- Download Button -->
            <button
              v-if="!file.is_dir"
              @click.stop="downloadFile(file)"
              class="p-0.5 text-slate-400 hover:text-emerald-400 rounded transition"
              title="Download File"
            >
              ⬇️
            </button>

            <!-- Edit Text File Button -->
            <button
              v-if="!file.is_dir"
              @click.stop="openEditor(file)"
              class="p-0.5 text-slate-400 hover:text-sky-400 rounded transition"
              title="Edit File"
            >
              ✏️
            </button>

            <!-- Rename -->
            <button
              @click.stop="promptRename(file)"
              class="p-0.5 text-slate-400 hover:text-amber-400 rounded transition"
              title="Rename"
            >
              🏷️
            </button>

            <!-- Delete Button -->
            <button
              @click.stop="deleteItem(file)"
              class="p-0.5 text-slate-400 hover:text-rose-400 rounded transition"
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Text File Editor Modal -->
    <div
      v-if="editingFile"
      class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="w-full max-w-3xl bg-[#12141c] border border-[#232936] rounded-xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
        <div class="h-10 bg-[#161922] border-b border-[#232936] flex items-center justify-between px-4 text-xs font-semibold text-slate-200">
          <div class="flex items-center space-x-2">
            <span>📄</span>
            <span class="font-mono truncate max-w-md">{{ editingFile.name }} ({{ editingFile.path }})</span>
          </div>
          <button @click="editingFile = null" class="text-slate-400 hover:text-white">✕</button>
        </div>
        <div class="flex-1 p-2 bg-[#0b0d13]">
          <textarea
            v-model="editorContent"
            class="w-full h-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed select-text"
            spellcheck="false"
          ></textarea>
        </div>
        <div class="h-12 bg-[#161922] border-t border-[#232936] flex items-center justify-between px-4">
          <span class="text-[11px] text-slate-500 font-mono">{{ editorContent.length }} characters</span>
          <div class="flex items-center space-x-2">
            <button
              @click="editingFile = null"
              class="px-3 py-1.5 bg-[#232936] hover:bg-[#2d3546] text-slate-300 rounded text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              @click="saveFile"
              :disabled="saving"
              class="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-xs font-medium transition"
            >
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useTransferQueueStore } from '../stores/transferQueueStore.js';
import type { RemoteFileItem } from '../types/index.js';

const props = withDefaults(
  defineProps<{
    sessionId: string;
    connected?: boolean;
    host?: string;
    username?: string;
  }>(),
  {
    connected: false,
  }
);

defineEmits(['close']);
const dialogStore = useDialogStore();
const sessionStore = useSessionStore();
const queueStore = useTransferQueueStore();

// Default to user home directory '.' which SFTP natively resolves to current login home
const currentPath = ref('.');
const files = ref<RemoteFileItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');
const isDragging = ref(false);

const fileInputRef = ref<HTMLInputElement | null>(null);
const folderInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const downloading = ref(false);
const transferStatus = ref('');

const editingFile = ref<RemoteFileItem | null>(null);
const editorContent = ref('');
const saving = ref(false);

const pathSegments = computed(() => {
  if (currentPath.value === '.' || currentPath.value === '~' || currentPath.value === '/') return [];
  return currentPath.value.split('/').filter(Boolean);
});

const filteredFiles = computed(() => {
  if (!searchQuery.value.trim()) return files.value;
  const q = searchQuery.value.toLowerCase();
  return files.value.filter(f => f.name.toLowerCase().includes(q));
});

// Watch connection state: auto-fetch as soon as SSH connection is established
watch(
  () => props.connected,
  (isConn) => {
    if (isConn) {
      fetchFiles();
    }
  }
);

onMounted(() => {
  if (props.connected) {
    fetchFiles();
  }
});

async function fetchFiles() {
  if (!props.connected) return;
  loading.value = true;
  error.value = null;
  try {
    const target = currentPath.value.trim() || '.';
    const list = await tauriBridge.sftpList(props.sessionId, target);
    files.value = list;
  } catch (err: any) {
    error.value = String(err);
  } finally {
    loading.value = false;
  }
}

function handleFileClick(file: RemoteFileItem) {
  if (file.is_dir) {
    currentPath.value = file.path;
    fetchFiles();
  } else {
    openEditor(file);
  }
}

function goToHome() {
  currentPath.value = '.';
  fetchFiles();
}

function goToPath(target: string) {
  currentPath.value = target;
  fetchFiles();
}

function goToSegment(targetIndex: number) {
  const segs = pathSegments.value.slice(0, targetIndex + 1);
  currentPath.value = currentPath.value.startsWith('/') ? '/' + segs.join('/') : segs.join('/');
  fetchFiles();
}

function navigateUp() {
  if (currentPath.value === '.' || currentPath.value === '~' || currentPath.value === '/') {
    return;
  }
  const parts = currentPath.value.split('/').filter(Boolean);
  if (parts.length <= 1) {
    currentPath.value = currentPath.value.startsWith('/') ? '/' : '.';
  } else {
    parts.pop();
    currentPath.value = (currentPath.value.startsWith('/') ? '/' : '') + parts.join('/');
  }
  fetchFiles();
}

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function promptNewFolder() {
  const folderName = await dialogStore.prompt({
    title: 'Create Remote Folder',
    description: `Enter the name of the new directory to create in ${currentPath.value}.`,
    placeholder: 'new_folder',
    confirmText: 'Create',
  });
  if (!folderName || !folderName.trim()) return;

  try {
    const basePath = currentPath.value === '.' ? '' : currentPath.value.replace(/\/$/, '') + '/';
    const targetPath = `${basePath}${folderName.trim()}`;
    await tauriBridge.sftpCreateDir(props.sessionId, targetPath);
    await fetchFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to create folder',
      description: String(err),
      variant: 'error',
    });
  }
}

async function promptRename(file: RemoteFileItem) {
  const newName = await dialogStore.prompt({
    title: `Rename "${file.name}"`,
    description: 'Enter new filename or path.',
    defaultValue: file.name,
    confirmText: 'Rename',
  });
  if (!newName || newName.trim() === file.name) return;

  try {
    const parentDir = file.path.substring(0, file.path.lastIndexOf('/'));
    const newPath = parentDir ? `${parentDir}/${newName.trim()}` : newName.trim();
    await tauriBridge.sftpRename(props.sessionId, file.path, newPath);
    await fetchFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to rename item',
      description: String(err),
      variant: 'error',
    });
  }
}

async function deleteItem(file: RemoteFileItem) {
  const isConfirmed = await dialogStore.confirm({
    title: `Delete ${file.is_dir ? 'Folder' : 'File'}?`,
    description: `Are you sure you want to delete "${file.name}" permanently?`,
    confirmText: 'Delete Permanently',
    isDestructive: true,
  });
  if (!isConfirmed) return;

  try {
    await tauriBridge.sftpDelete(props.sessionId, file.path, file.is_dir);
    await fetchFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to delete item',
      description: String(err),
      variant: 'error',
    });
  }
}

async function openEditor(file: RemoteFileItem) {
  try {
    transferStatus.value = `Opening ${file.name}...`;
    const content = await tauriBridge.sftpReadFile(props.sessionId, file.path);
    
    // Find parent session tab
    const parentTab = sessionStore.tabs.find(t => t.id === props.sessionId);
    if (parentTab) {
      sessionStore.openEditorTab(parentTab, file.path, file.name, content);
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Could not open file as text',
      description: String(err),
      variant: 'error',
    });
  } finally {
    transferStatus.value = '';
  }
}

async function saveFile() {
  if (!editingFile.value) return;
  saving.value = true;
  try {
    await tauriBridge.sftpWriteText(props.sessionId, editingFile.value.path, editorContent.value);
    editingFile.value = null;
    await fetchFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to save file',
      description: String(err),
      variant: 'error',
    });
  } finally {
    saving.value = false;
  }
}

async function downloadFile(file: RemoteFileItem) {
  // Try native save dialog if available in Tauri environment
  let selectedLocalPath = '';
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const pathResult = await save({
      defaultPath: file.name,
    });
    if (pathResult) {
      selectedLocalPath = pathResult;
    } else {
      return; // User cancelled save dialog
    }
  } catch (dialogErr) {
    // Fallback if plugin-dialog is not active
    selectedLocalPath = '';
  }

  const transferId = queueStore.addDownload(props.sessionId, file.path, file.name, file.size, selectedLocalPath);
  queueStore.isTrayExpanded = true;

  try {
    if (selectedLocalPath) {
      // Use streaming chunked download directly to local disk (resumable)
      await tauriBridge.sftpDownloadStream(props.sessionId, transferId, file.path, selectedLocalPath, 0);
    } else {
      // Browser in-memory fallback
      const base64Content = await tauriBridge.sftpDownloadBinary(props.sessionId, file.path);
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/octet-stream' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      const item = queueStore.transfers.find(t => t.id === transferId);
      if (item) {
        item.bytesTransferred = file.size;
        item.percentage = 100;
        item.status = 'completed';
      }
    }
  } catch (err: any) {
    const item = queueStore.transfers.find(t => t.id === transferId);
    if (item) {
      item.status = 'error';
      item.errorMessage = String(err);
    }
  }
}

function triggerUploadDialog() {
  fileInputRef.value?.click();
}

function triggerFolderUploadDialog() {
  folderInputRef.value?.click();
}

async function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  await uploadFileList(Array.from(target.files));
  target.value = '';
}

async function handleFolderUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;
  await uploadFileList(Array.from(target.files), true);
  target.value = '';
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false;
  if (!event.dataTransfer) return;

  const items = event.dataTransfer.items;
  if (items && items.length > 0) {
    const filesToUpload: { file: File; relativePath: string }[] = [];
    const entries: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = (items[i] as any).webkitGetAsEntry ? (items[i] as any).webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        await traverseEntry(entry, '', filesToUpload);
      }
      await uploadStructuredFiles(filesToUpload);
      return;
    }
  }

  if (event.dataTransfer.files.length > 0) {
    await uploadFileList(Array.from(event.dataTransfer.files));
  }
}

async function traverseEntry(entry: any, currentRelPath: string, result: { file: File; relativePath: string }[]) {
  if (entry.isFile) {
    const file: File = await new Promise((resolve) => entry.file(resolve));
    const relPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;
    result.push({ file, relativePath: relPath });
  } else if (entry.isDirectory) {
    const dirReader = entry.createReader();
    // Read all entries in directory in batches (Chromium returns max 100 per readEntries)
    const readAllEntries = async (): Promise<any[]> => {
      let all: any[] = [];
      let batch: any[] = await new Promise(res => dirReader.readEntries(res));
      while (batch.length > 0) {
        all = all.concat(batch);
        batch = await new Promise(res => dirReader.readEntries(res));
      }
      return all;
    };

    const subEntries = await readAllEntries();
    const nextRelPath = currentRelPath ? `${currentRelPath}/${entry.name}` : entry.name;
    for (const sub of subEntries) {
      await traverseEntry(sub, nextRelPath, result);
    }
  }
}

async function uploadFileList(filesList: File[], isFolderInput = false) {
  const structured: { file: File; relativePath: string }[] = [];
  for (const f of filesList) {
    const rel = (isFolderInput && (f as any).webkitRelativePath) ? (f as any).webkitRelativePath : f.name;
    structured.push({ file: f, relativePath: rel });
  }
  await uploadStructuredFiles(structured);
}

async function uploadStructuredFiles(fileItems: { file: File; relativePath: string }[]) {
  if (fileItems.length === 0) return;

  // Custom Confirmation Modal for batch/folder upload
  if (fileItems.length > 1) {
    const totalBytes = fileItems.reduce((acc, f) => acc + f.file.size, 0);
    const confirm = await dialogStore.confirm({
      title: `Upload ${fileItems.length.toLocaleString()} files?`,
      description: `Target: ${currentPath.value}\nTotal Size: ${formatSize(totalBytes)}\nDo you want to proceed with the SFTP upload?`,
      confirmText: `Upload ${fileItems.length} Files`,
    });
    if (!confirm) return;
  }

  uploading.value = true;
  queueStore.isTrayExpanded = true;

  const basePath = currentPath.value === '.' ? '' : currentPath.value.replace(/\/$/, '') + '/';

  // Process uploads with a concurrency pool of 3 simultaneous file transfers
  const concurrency = 3;
  let index = 0;

  async function worker() {
    while (index < fileItems.length) {
      const currentIdx = index++;
      const item = fileItems[currentIdx];
      const fullRemotePath = `${basePath}${item.relativePath}`;

      const transferId = queueStore.addUpload(props.sessionId, fullRemotePath, item.file.name, item.file.size);
      const qItem = queueStore.transfers.find(t => t.id === transferId);
      if (qItem) qItem.status = 'transferring';

      try {
        const base64 = await fileToBase64(item.file);
        await tauriBridge.sftpUploadBinary(props.sessionId, fullRemotePath, base64);
        if (qItem) {
          qItem.bytesTransferred = item.file.size;
          qItem.percentage = 100;
          qItem.status = 'completed';
        }
      } catch (err: any) {
        if (qItem) {
          qItem.status = 'error';
          qItem.errorMessage = String(err);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, fileItems.length) }, () => worker());
  await Promise.all(workers);

  uploading.value = false;
  await fetchFiles();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.substring(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}
</script>
