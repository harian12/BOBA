<template>
  <aside
    v-show="aiStore.isDrawerOpen"
    :style="{ width: `${drawerWidth}px` }"
    :class="[
      'relative border-l border-boba-800 bg-[#0d101a] flex flex-col h-full shrink-0 select-none z-30 font-sans shadow-2xl',
      isResizing ? 'select-none pointer-events-auto' : 'transition-[width] duration-150'
    ]"
  >
    <!-- Resize Handle (Left Edge) -->
    <div
      @mousedown="startResize"
      @dblclick="toggleExpandWidth"
      class="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 transition-colors z-40 group flex items-center justify-center"
      title="Tarik untuk ubah ukuran chat (klik ganda untuk perlebar/kecilkan)"
    >
      <div class="h-8 w-0.5 rounded-full bg-slate-600/30 group-hover:bg-purple-300 transition-colors"></div>
    </div>

    <!-- Drawer Header -->
    <div class="h-11 px-3 bg-[#090b12] border-b border-[#1b2234] flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2 truncate">
        <span class="text-sm">✨</span>
        <span class="font-bold text-xs text-purple-300">AI Server Copilot</span>

        <!-- Active Model Pill -->
        <span
          v-if="aiStore.activeProvider"
          @click="aiStore.isProviderModalOpen = true"
          class="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/60 text-[10px] text-purple-300 truncate max-w-[120px] font-mono cursor-pointer hover:border-purple-400"
          :title="`Klik untuk ganti model (${aiStore.activeProvider.model})`"
        >
          {{ aiStore.activeProvider.model }}
        </span>
      </div>

      <div class="flex items-center space-x-1">
        <!-- Execution Mode Switch (Confirm vs Auto) -->
        <button
          @click="aiStore.setExecutionMode(aiStore.executionMode === 'confirm' ? 'auto' : 'confirm')"
          :class="[
            'px-2 py-0.5 rounded text-[10px] font-mono font-medium transition flex items-center space-x-1 border',
            aiStore.executionMode === 'auto'
              ? 'bg-amber-950/80 border-amber-600 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
              : 'bg-sky-950/60 border-sky-800 text-sky-300'
          ]"
          :title="aiStore.executionMode === 'auto' ? 'Mode Otomatis: Perintah non-berbahaya langsung dieksekusi' : 'Mode Konfirmasi: AI meminta persetujuan sebelum mengeksekusi perintah'"
        >
          <span>{{ aiStore.executionMode === 'auto' ? '⚡ Auto' : '🛡️ Confirm' }}</span>
        </button>

        <!-- Provider Settings Button -->
        <button
          @click="aiStore.isProviderModalOpen = true"
          class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 text-xs transition"
          title="Pengaturan Provider & Model AI"
        >
          ⚙️
        </button>

        <!-- Clear Chat History -->
        <button
          @click="handleClearChat"
          class="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 text-xs transition"
          title="Bersihkan riwayat chat sesi ini"
        >
          🗑️
        </button>

        <!-- Toggle Expand / Shrink Width -->
        <button
          @click="toggleExpandWidth"
          class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 text-xs transition"
          :title="drawerWidth > 550 ? 'Kembalikan ukuran normal' : 'Perlebar room chat'"
        >
          {{ drawerWidth > 550 ? '⤡' : '⤢' }}
        </button>

        <!-- Close Drawer Button -->
        <button
          @click="aiStore.closeDrawer"
          class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 text-xs transition"
          title="Tutup drawer AI Copilot (Ctrl+Shift+A)"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Target Server Bar -->
    <div class="px-3 py-1.5 bg-[#0b0e17] border-b border-[#181f30] flex items-center justify-between text-[11px] text-slate-400">
      <span class="text-[10px] uppercase font-mono text-slate-500">Target Server:</span>
      <div class="flex-1 ml-2">
        <select
          v-model="aiStore.selectedSessionId"
          class="w-full bg-[#07090f] border border-[#212a3d] text-sky-300 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-purple-500 font-mono cursor-pointer"
        >
          <option value="">-- Pilih Server Sesi SSH --</option>
          <option v-for="s in availableSessions" :key="s.id" :value="s.id">
            {{ s.name }} ({{ s.username }}@{{ s.host }})
          </option>
        </select>
      </div>
    </div>

    <!-- Chat Messages Feed -->
    <div
      ref="chatFeedRef"
      class="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar text-xs text-slate-200"
    >
      <!-- Empty State with Quick Starter Chips -->
      <div
        v-if="currentMessages.length === 0"
        class="h-full flex flex-col items-center justify-center text-center space-y-4 px-4 py-8 text-slate-400"
      >
        <div class="w-12 h-12 rounded-full bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-2xl shadow-lg">
          ✨
        </div>
        <div class="space-y-1">
          <h4 class="font-bold text-slate-200 text-sm">BOBA AI Server Copilot</h4>
          <p class="text-[11px] text-slate-400 leading-relaxed max-w-xs">
            Perintahkan AI untuk mengecek log, memperbaiki konfigurasi Nginx/Apache, memantau metrik, atau menjalankan diagnosa di server target.
          </p>
        </div>

        <!-- Quick Starter Action Chips -->
        <div class="w-full space-y-1.5 pt-2">
          <div class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider text-left">Contoh Perintah:</div>
          <button
            v-for="chip in starterChips"
            :key="chip"
            @click="handleSendChip(chip)"
            class="w-full text-left p-2 rounded-lg bg-[#111624] border border-[#212c44] hover:border-purple-500 hover:bg-[#182033] text-slate-300 hover:text-purple-200 text-[11px] transition flex items-center space-x-2"
          >
            <span class="text-purple-400 shrink-0">💡</span>
            <span class="truncate">{{ chip }}</span>
          </button>
        </div>
      </div>

      <!-- Messages Stream -->
      <template v-else>
        <div
          v-for="msg in currentMessages"
          :key="msg.id"
          :class="[
            'flex flex-col space-y-1.5',
            msg.role === 'user' ? 'items-end' : 'items-start'
          ]"
        >
          <!-- Message Bubble -->
          <div
            :class="[
              'max-w-[95%] p-2.5 rounded-xl leading-relaxed text-[11.5px] select-text break-words',
              msg.role === 'user'
                ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-br-none shadow'
                : 'bg-[#131826] border border-[#232d42] text-slate-200 rounded-bl-none shadow'
            ]"
          >
            <!-- Markdown / Pre-formatted Text -->
            <div class="whitespace-pre-wrap font-sans">{{ msg.content }}</div>

            <!-- Tool Call Cards if any -->
            <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="mt-2.5 space-y-2">
              <div
                v-for="tc in msg.toolCalls"
                :key="tc.id"
                class="rounded-lg bg-[#0a0d16] border border-[#253047] p-2.5 space-y-2 text-[11px] font-mono"
              >
                <div class="flex items-center justify-between border-b border-[#1b2336] pb-1.5">
                  <div class="flex items-center space-x-1.5 text-purple-300 font-semibold">
                    <span>⚡</span>
                    <span>{{ tc.name }}</span>
                  </div>
                  <!-- Status Badge -->
                  <span
                    :class="[
                      'px-1.5 py-0.2 rounded text-[9px] font-bold uppercase',
                      tc.status === 'completed' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                      tc.status === 'failed' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                      tc.status === 'running' ? 'bg-sky-950 text-sky-300 border border-sky-800 animate-pulse' :
                      tc.status === 'rejected' ? 'bg-slate-800 text-slate-400' :
                      'bg-amber-950 text-amber-300 border border-amber-800'
                    ]"
                  >
                    {{ tc.status }}
                  </span>
                </div>

                <!-- Tool Arguments / Command to run -->
                <div class="bg-[#06080e] p-1.5 rounded text-[10px] text-slate-300 overflow-x-auto no-scrollbar">
                  <span v-if="tc.name === 'exec_command'" class="text-amber-200">$ {{ tc.args.command }}</span>
                  <span v-else-if="tc.name === 'read_file'" class="text-sky-300">📄 Baca: {{ tc.args.path }}</span>
                  <span v-else-if="tc.name === 'write_file'" class="text-emerald-300">✏️ Tulis: {{ tc.args.path }} ({{ (tc.args.content || '').length }} bytes)</span>
                  <span v-else class="text-slate-400">{{ JSON.stringify(tc.args) }}</span>
                </div>

                <!-- Approval Actions for Pending Tool Calls -->
                <div v-if="tc.status === 'pending_approval'" class="flex items-center justify-end space-x-2 pt-1">
                  <button
                    @click="aiStore.rejectToolCall(tc.id)"
                    class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition"
                  >
                    Tolak
                  </button>
                  <button
                    @click="aiStore.approveToolCall(tc.id)"
                    class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[10px] transition shadow"
                  >
                    ✓ Jalankan di Server
                  </button>
                </div>

                <!-- Terminal Execution Result Output Box -->
                <div v-if="tc.result" class="pt-1">
                  <div class="text-[9px] text-slate-500 uppercase mb-0.5">Hasil Output:</div>
                  <pre class="bg-[#05060a] p-2 rounded text-[10px] text-slate-300 overflow-x-auto max-h-36 no-scrollbar whitespace-pre-wrap">{{ typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2) }}</pre>
                </div>

                <div v-if="tc.error" class="text-rose-400 text-[10px] bg-rose-950/40 p-1.5 rounded border border-rose-900/50">
                  {{ tc.error }}
                </div>
              </div>
            </div>
          </div>

          <span class="text-[9px] text-slate-500 font-mono px-1">
            {{ formatTime(msg.createdAt) }}
          </span>
        </div>
      </template>

      <!-- Thinking / Token Streaming Indicator -->
      <div v-if="aiStore.isThinking" class="flex items-center space-x-2 text-purple-400 text-xs p-2 animate-pulse">
        <span>✨</span>
        <span>AI sedang berpikir & menganalisis server...</span>
      </div>
    </div>

    <!-- Input Footer -->
    <div class="p-3 bg-[#0a0d16] border-t border-[#1a2236] space-y-2 shrink-0">
      <div class="relative">
        <textarea
          v-model="promptInput"
          @keydown.enter.exact.prevent="handleSend"
          :disabled="aiStore.isThinking"
          rows="2"
          placeholder="Ketik instruksi untuk server... (Enter untuk kirim, Shift+Enter untuk baris baru)"
          class="w-full bg-[#05070d] border border-[#212b40] focus:border-purple-500 rounded-lg p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none font-sans"
        ></textarea>

        <!-- Send / Stop Button -->
        <div class="absolute right-2 bottom-3 flex items-center space-x-1">
          <button
            v-if="aiStore.isThinking"
            @click="aiStore.stopThinking"
            class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-semibold transition shadow flex items-center space-x-1"
          >
            <span>⏹</span>
            <span>Stop</span>
          </button>
          <button
            v-else
            @click="handleSend"
            :disabled="!promptInput.trim()"
            class="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded text-[10px] font-semibold transition shadow flex items-center space-x-1"
          >
            <span>Kirim</span>
            <span>➔</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useAiAgentStore } from '../stores/aiAgentStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';

const aiStore = useAiAgentStore();
const sessionStore = useSessionStore();
const vaultStore = useVaultStore();
const dialogStore = useDialogStore();

const promptInput = ref('');
const chatFeedRef = ref<HTMLElement | null>(null);

const DEFAULT_WIDTH = 430;
const MIN_WIDTH = 340;
const drawerWidth = ref<number>(DEFAULT_WIDTH);
const isResizing = ref(false);

function initWidth() {
  if (typeof window === 'undefined') return;
  const saved = localStorage.getItem('boba_ai_drawer_width');
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed) && parsed >= MIN_WIDTH) {
      drawerWidth.value = parsed;
    }
  }
}

function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = drawerWidth.value;

  function onMouseMove(moveEvent: MouseEvent) {
    const deltaX = startX - moveEvent.clientX; // geser ke kiri memperlebar panel
    const maxWidth = Math.min(window.innerWidth * 0.85, 1200);
    const newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, startWidth + deltaX));
    drawerWidth.value = Math.round(newWidth);
  }

  function onMouseUp() {
    isResizing.value = false;
    localStorage.setItem('boba_ai_drawer_width', String(drawerWidth.value));
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function toggleExpandWidth() {
  const expandedWidth = Math.min(window.innerWidth * 0.7, 850);
  if (drawerWidth.value > 550) {
    drawerWidth.value = DEFAULT_WIDTH;
  } else {
    drawerWidth.value = Math.round(expandedWidth);
  }
  localStorage.setItem('boba_ai_drawer_width', String(drawerWidth.value));
}

onMounted(() => {
  initWidth();
});

const starterChips = [
  'Cek status Nginx dan error log terakhir',
  'Cek penggunaan CPU, RAM, dan kapasitas Disk',
  'Diagnosa port terbuka dan aturan firewall (UFW)',
  'Cek versi Node.js, PHP, Python, dan Docker yang terpasang',
];

const availableSessions = computed(() => {
  return vaultStore.vault.sessions || [];
});

const currentMessages = computed(() => {
  return aiStore.getSessionMessages(aiStore.selectedSessionId);
});

function scrollToBottom() {
  nextTick(() => {
    if (chatFeedRef.value) {
      chatFeedRef.value.scrollTop = chatFeedRef.value.scrollHeight;
    }
  });
}

watch(
  () => currentMessages.value.length,
  () => scrollToBottom()
);

watch(
  () => currentMessages.value[currentMessages.value.length - 1]?.content,
  () => scrollToBottom()
);

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function handleSend() {
  const text = promptInput.value.trim();
  if (!text || aiStore.isThinking) return;
  if (!aiStore.selectedSessionId) {
    dialogStore.showToast('Silakan pilih Target Server terlebih dahulu', 'warning', 2500);
    return;
  }
  promptInput.value = '';
  aiStore.sendMessage(text);
  scrollToBottom();
}

function handleSendChip(chip: string) {
  if (!aiStore.selectedSessionId) {
    dialogStore.showToast('Silakan pilih Target Server terlebih dahulu', 'warning', 2500);
    return;
  }
  aiStore.sendMessage(chip);
  scrollToBottom();
}

async function handleClearChat() {
  const isConfirmed = await dialogStore.confirm({
    title: 'Bersihkan Percakapan',
    description: 'Apakah Anda yakin ingin membersihkan seluruh percakapan pada sesi ini?',
    confirmText: 'Bersihkan',
    cancelText: 'Batal',
    isDestructive: true,
  });
  if (isConfirmed) {
    aiStore.clearMessages(aiStore.selectedSessionId);
  }
}
</script>
