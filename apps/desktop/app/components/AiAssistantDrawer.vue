<template>
  <aside
    v-show="aiStore.isDrawerOpen"
    :style="{ width: `${drawerWidth}px` }"
    :class="[
      'relative border-l border-boba-800 bg-boba-950 flex flex-col h-full shrink-0 select-none z-30 font-sans shadow-2xl',
      isResizing ? 'select-none pointer-events-auto' : 'transition-[width] duration-150'
    ]"
  >
    <!-- Resize Handle (Left Edge) -->
    <div
      @mousedown="startResize"
      @dblclick="toggleExpandWidth"
      class="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-boba-accent/60 active:bg-boba-accent transition-colors z-40 group flex items-center justify-center"
      title="Tarik untuk ubah ukuran chat (klik ganda untuk perlebar/kecilkan)"
    >
      <div class="h-8 w-0.5 rounded-full bg-slate-600/40 group-hover:bg-sky-400 transition-colors"></div>
    </div>

    <!-- Drawer Header -->
    <div class="h-11 px-3 bg-boba-900 border-b border-boba-800 flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2 truncate">
        <span class="text-sm">✨</span>
        <span class="font-bold text-xs text-sky-300">AI Server Copilot</span>

        <!-- Active Model Pill -->
        <span
          v-if="aiStore.activeProvider"
          @click="aiStore.isProviderModalOpen = true"
          class="px-2 py-0.5 rounded bg-boba-850 border border-boba-700 text-[10px] text-sky-300 truncate max-w-[120px] font-mono cursor-pointer hover:border-boba-accent hover:text-white transition"
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
              ? 'bg-amber-950/80 border-amber-600 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
              : 'bg-boba-850 border-boba-700 text-sky-300 hover:border-boba-600'
          ]"
          :title="aiStore.executionMode === 'auto' ? 'Mode Otomatis: Perintah non-berbahaya langsung dieksekusi' : 'Mode Konfirmasi: AI meminta persetujuan sebelum mengeksekusi perintah'"
        >
          <span>{{ aiStore.executionMode === 'auto' ? '⚡ Auto' : '🛡️ Confirm' }}</span>
        </button>

        <!-- Provider Settings Button -->
        <button
          @click="aiStore.isProviderModalOpen = true"
          class="p-1 rounded text-slate-400 hover:text-white hover:bg-boba-800 text-xs transition"
          title="Pengaturan Provider & Model AI"
        >
          ⚙️
        </button>

        <!-- Clear Chat History -->
        <button
          @click="handleClearChat"
          class="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-boba-800 text-xs transition"
          title="Bersihkan riwayat chat sesi ini"
        >
          🗑️
        </button>

        <!-- Toggle Expand / Shrink Width -->
        <button
          @click="toggleExpandWidth"
          class="p-1 rounded text-slate-400 hover:text-white hover:bg-boba-800 text-xs transition font-mono"
          :title="drawerWidth > 550 ? 'Kembalikan ukuran normal' : 'Perlebar room chat'"
        >
          {{ drawerWidth > 550 ? '⤡' : '⤢' }}
        </button>

        <!-- Close Drawer Button -->
        <button
          @click="aiStore.closeDrawer"
          class="p-1 rounded text-slate-400 hover:text-white hover:bg-boba-800 text-xs transition"
          title="Tutup drawer AI Copilot (Ctrl+Shift+A)"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Target Server Bar -->
    <div class="px-3 py-1.5 bg-boba-900/70 border-b border-boba-800 flex items-center justify-between text-[11px] text-slate-400">
      <span class="text-[10px] uppercase font-mono text-slate-400 font-semibold tracking-wider">Target Server:</span>
      <div class="flex-1 ml-2">
        <select
          v-model="aiStore.selectedSessionId"
          class="w-full bg-boba-950 border border-boba-800 text-sky-300 rounded px-2 py-0.5 text-[11px] focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono cursor-pointer transition"
        >
          <option value="">-- Pilih Server Sesi SSH --</option>
          <option v-for="s in availableSessions" :key="s.id" :value="s.id">
            {{ s.name }} ({{ s.username }}@{{ s.host }})
          </option>
        </select>
      </div>
    </div>

    <!-- Percakapan Aktif, Riwayat & Chat Baru Bar -->
    <div class="px-3 py-1.5 bg-boba-950/90 border-b border-boba-800/80 flex items-center justify-between text-xs shrink-0">
      <div class="flex items-center space-x-1.5 truncate flex-1 mr-2">
        <button
          @click="isHistoryOpen = !isHistoryOpen"
          type="button"
          :class="[
            'px-2 py-0.8 rounded border text-[10.5px] flex items-center space-x-1.5 transition truncate max-w-[200px] sm:max-w-[250px]',
            isHistoryOpen
              ? 'bg-sky-950 text-sky-200 border-sky-600/60 shadow-sm'
              : 'bg-boba-900/90 hover:bg-boba-850 text-slate-300 hover:text-white border-boba-800'
          ]"
          :title="`Klik untuk ${isHistoryOpen ? 'tutup' : 'buka'} riwayat chat server ini`"
        >
          <span>💬</span>
          <span class="truncate font-medium">{{ aiStore.activeThread?.title || 'Percakapan Baru' }}</span>
          <span class="text-[9px] text-slate-400">▼</span>
        </button>

        <span class="text-[10px] text-slate-500 font-mono hidden sm:inline">
          ({{ currentMessages.length }} pesan)
        </span>
      </div>

      <div class="flex items-center space-x-1.5 shrink-0">
        <!-- Tombol Riwayat Chat -->
        <button
          @click="isHistoryOpen = !isHistoryOpen"
          type="button"
          :class="[
            'px-2 py-0.8 rounded text-[10.5px] border transition flex items-center space-x-1 font-medium',
            isHistoryOpen
              ? 'bg-sky-600/30 border-sky-500/60 text-sky-200'
              : 'bg-boba-900 hover:bg-boba-850 border-boba-800 text-slate-400 hover:text-slate-200'
          ]"
          title="Buka / tutup daftar riwayat chat server ini"
        >
          <span>🕒</span>
          <span>Riwayat ({{ aiStore.currentSessionThreads.length }})</span>
        </button>

        <!-- Tombol Buat Chat Baru -->
        <button
          @click="handleNewChat"
          type="button"
          class="px-2.5 py-0.8 rounded-lg bg-sky-600/20 hover:bg-sky-600/35 text-sky-200 border border-sky-500/40 hover:border-sky-400 text-[10.5px] font-semibold transition flex items-center space-x-1 shadow-sm"
          title="Mulai topik percakapan baru untuk server ini"
        >
          <span>+</span>
          <span>Chat Baru</span>
        </button>
      </div>
    </div>

    <!-- Panel Riwayat Percakapan (History View) -->
    <div
      v-if="isHistoryOpen"
      class="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar bg-boba-950/70"
    >
      <div class="flex items-center justify-between pb-2 border-b border-boba-800/80">
        <div class="flex items-center space-x-1.5 truncate mr-2">
          <span class="text-sm">🕒</span>
          <span class="font-bold text-xs text-slate-200">Riwayat Percakapan</span>
          <span class="text-[10px] text-sky-300/80 font-mono truncate max-w-[120px]">({{ selectedServerName }})</span>
        </div>
        <button
          @click="handleNewChat"
          type="button"
          class="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-lg text-[10.5px] transition flex items-center space-x-1 shadow shrink-0"
        >
          <span>+</span>
          <span>Buat Chat Baru</span>
        </button>
      </div>

      <!-- Thread Cards List -->
      <div v-if="aiStore.currentSessionThreads.length === 0" class="py-16 text-center text-slate-500 text-xs space-y-2">
        <div class="text-2xl">💬</div>
        <p>Belum ada riwayat percakapan untuk server ini.</p>
        <button
          @click="handleNewChat"
          type="button"
          class="px-3 py-1 bg-boba-900 hover:bg-boba-800 border border-boba-750 text-slate-300 rounded text-[11px] transition inline-flex items-center space-x-1"
        >
          <span>+ Mulai Chat Pertama</span>
        </button>
      </div>
      <div v-else class="space-y-2 pt-1">
        <div
          v-for="thread in aiStore.currentSessionThreads"
          :key="thread.id"
          @click="handleSelectThread(thread.id)"
          :class="[
            'p-3 rounded-xl border transition-all cursor-pointer group flex flex-col space-y-1.5 relative',
            thread.id === aiStore.activeThread?.id
              ? 'bg-sky-950/30 border-sky-500/60 shadow-[0_0_10px_rgba(14,165,233,0.15)]'
              : 'bg-boba-900/70 hover:bg-boba-900 border-boba-800 hover:border-boba-700'
          ]"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 truncate mr-2">
              <span class="text-xs">{{ thread.id === aiStore.activeThread?.id ? '💬' : '🗨️' }}</span>
              <span
                :class="[
                  'font-semibold text-[11.5px] truncate',
                  thread.id === aiStore.activeThread?.id ? 'text-sky-300' : 'text-slate-200 group-hover:text-white'
                ]"
              >
                {{ thread.title || 'Percakapan Tanpa Judul' }}
              </span>
              <span
                v-if="thread.id === aiStore.activeThread?.id"
                class="px-1.5 py-0.2 rounded text-[8.5px] bg-sky-900/60 text-sky-300 border border-sky-700 uppercase font-mono font-bold"
              >
                Aktif
              </span>
            </div>

            <!-- Action: Delete Thread -->
            <button
              @click.stop="handleDeleteThread(thread.id)"
              type="button"
              class="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition"
              title="Hapus percakapan ini dari riwayat"
            >
              🗑️
            </button>
          </div>

          <!-- Snippet preview of last message -->
          <div class="text-[10.5px] text-slate-400 truncate pr-6 font-sans">
            {{ getThreadSnippet(thread) }}
          </div>

          <div class="flex items-center justify-between text-[9.5px] text-slate-500 font-mono pt-0.5">
            <span>{{ (thread.messages || []).filter(m => m.role !== 'tool').length }} pesan</span>
            <span>{{ formatDateTime(thread.updatedAt || thread.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Chat Messages Feed -->
    <div
      v-else
      ref="chatFeedRef"
      class="flex-1 overflow-y-auto p-3 space-y-3.5 text-xs text-slate-200"
    >
      <!-- Empty State with Quick Starter Chips -->
      <div
        v-if="currentMessages.length === 0"
        class="h-full flex flex-col items-center justify-center text-center space-y-4 px-4 py-8 text-slate-400"
      >
        <div class="w-12 h-12 rounded-xl bg-boba-900 border border-boba-800 flex items-center justify-center text-2xl shadow-lg">
          ✨
        </div>
        <div class="space-y-1">
          <h4 class="font-bold text-slate-100 text-sm">BOBA AI Server Copilot</h4>
          <p class="text-[11px] text-slate-400 leading-relaxed max-w-xs">
            Perintahkan AI untuk mengecek log, memperbaiki konfigurasi Nginx/Apache, memantau metrik, atau menjalankan diagnosa di server target.
          </p>
        </div>

        <!-- Quick Starter Action Chips -->
        <div class="w-full space-y-2 pt-2">
          <div class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider text-left">Contoh Perintah Cepat:</div>
          <button
            v-for="chip in starterChips"
            :key="chip"
            @click="handleSendChip(chip)"
            class="w-full text-left p-2.5 rounded-lg bg-boba-900 border border-boba-800 hover:border-boba-accent/60 hover:bg-boba-850 text-slate-300 hover:text-white text-[11px] transition flex items-center space-x-2.5 shadow-sm group"
          >
            <span class="text-boba-accent group-hover:scale-110 transition-transform shrink-0">💡</span>
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
              'max-w-[95%] p-3 rounded-2xl leading-relaxed text-[11.5px] select-text break-words shadow-sm',
              msg.role === 'user'
                ? 'bg-boba-accent/15 border border-boba-accent/40 text-slate-100 rounded-br-sm'
                : 'bg-boba-900 border border-boba-800 text-slate-200 rounded-bl-sm'
            ]"
          >
            <!-- Markdown / Pre-formatted Text -->
            <div v-if="msg.content" class="whitespace-pre-wrap font-sans">{{ msg.content }}</div>

            <!-- Connection Error Retry Button -->
            <div
              v-if="msg.role === 'assistant' && (msg.content.includes('⚠️ Connection Error') || msg.content.includes('⚠️ Error'))"
              class="mt-2.5 pt-2 border-t border-boba-800/80 flex items-center justify-end"
            >
              <button
                @click="retryConnection"
                :disabled="aiStore.isThinking"
                type="button"
                class="px-3 py-1 bg-amber-600/25 hover:bg-amber-600/40 text-amber-200 border border-amber-500/50 hover:border-amber-400 rounded-lg text-[10.5px] font-semibold transition flex items-center space-x-1.5 shadow disabled:opacity-50"
              >
                <span>🔄</span>
                <span>Coba Hubungkan Ulang</span>
              </button>
            </div>

            <!-- Tool Call Cards if any -->
            <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="mt-2.5 space-y-2">
              <div
                v-for="tc in msg.toolCalls"
                :key="tc.id"
                class="rounded-xl bg-boba-950 border border-boba-800 p-2.5 space-y-2 text-[11px] font-mono shadow-inner"
              >
                <div class="flex items-center justify-between border-b border-boba-800/80 pb-1.5">
                  <div class="flex items-center space-x-1.5 text-sky-300 font-semibold">
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
                      tc.status === 'rejected' ? 'bg-boba-800 text-slate-400' :
                      'bg-amber-950 text-amber-300 border border-amber-800'
                    ]"
                  >
                    {{ tc.status }}
                  </span>
                </div>

                <!-- Tool Arguments / Command to run -->
                <div class="bg-boba-900/90 border border-boba-800/60 p-2 rounded-lg text-[10px] text-slate-300 overflow-x-auto no-scrollbar">
                  <span v-if="tc.name === 'exec_command'" class="text-amber-200">$ {{ tc.args.command }}</span>
                  <span v-else-if="tc.name === 'read_file'" class="text-sky-300">📄 Baca: {{ tc.args.path }}</span>
                  <span v-else-if="tc.name === 'write_file'" class="text-emerald-300">✏️ Tulis: {{ tc.args.path }} ({{ (tc.args.content || '').length }} bytes)</span>
                  <span v-else class="text-slate-400">{{ JSON.stringify(tc.args) }}</span>
                </div>

                <!-- Approval Actions for Pending Tool Calls -->
                <div v-if="tc.status === 'pending_approval'" class="flex items-center justify-end space-x-2 pt-1">
                  <button
                    @click="aiStore.rejectToolCall(tc.id)"
                    class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-[10px] transition"
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
                  <div class="flex items-center justify-between text-[9px] text-slate-500 uppercase mb-0.5">
                    <span>Hasil Output:</span>
                    <button
                      @click="copyCommand(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2))"
                      type="button"
                      class="hover:text-slate-300 transition text-[9px] normal-case lowercase flex items-center space-x-1"
                      title="Salin hasil output"
                    >
                      <span>📋 salin</span>
                    </button>
                  </div>
                  <pre class="bg-boba-950 border border-boba-800/60 p-2 rounded-lg text-[10px] text-slate-300 overflow-x-auto max-h-40 no-scrollbar whitespace-pre-wrap font-mono">{{ typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2) }}</pre>
                </div>

                <!-- Error Display & Retry Actions -->
                <div v-if="tc.error || tc.status === 'failed'" class="space-y-1.5 pt-1">
                  <div v-if="tc.error" class="text-rose-400 text-[10px] bg-rose-950/40 p-2 rounded border border-rose-900/50">
                    {{ tc.error }}
                  </div>
                  <div class="flex items-center justify-between pt-0.5">
                    <span class="text-[9.5px] text-rose-400/80">Eksekusi gagal / timeout</span>
                    <div class="flex items-center space-x-1.5">
                      <button
                        v-if="tc.name === 'exec_command' && tc.args.command"
                        @click="copyCommand(tc.args.command)"
                        type="button"
                        class="px-2.5 py-1 bg-boba-900 hover:bg-boba-800 text-slate-300 border border-boba-750 rounded text-[10px] transition flex items-center space-x-1"
                        title="Salin perintah ke clipboard"
                      >
                        <span>📋</span>
                        <span>Salin</span>
                      </button>
                      <button
                        @click="aiStore.retryToolCall(tc.id)"
                        :disabled="aiStore.isThinking"
                        type="button"
                        class="px-3 py-1 bg-rose-600/25 hover:bg-rose-600/40 text-rose-200 border border-rose-500/50 hover:border-rose-400 rounded text-[10px] font-semibold transition flex items-center space-x-1 shadow-sm disabled:opacity-50"
                        title="Jalankan ulang perintah ini di server"
                      >
                        <span>🔄</span>
                        <span>Jalankan Ulang</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <span class="text-[9px] text-slate-500 font-mono px-1">
            {{ formatTime(msg.createdAt) }}
          </span>
        </div>
      </template>

      <!-- Tombol Generate Balasan jika pesan user belum dijawab / terputus -->
      <div
        v-if="!aiStore.isThinking && currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === 'user'"
        class="flex items-center justify-end pt-1"
      >
        <button
          @click="aiStore.continueAgentLoop(aiStore.selectedSessionId)"
          type="button"
          class="px-3 py-1 bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-500/50 rounded-lg text-[10.5px] font-semibold transition flex items-center space-x-1.5 shadow"
        >
          <span>✨</span>
          <span>Dapatkan Balasan AI</span>
        </button>
      </div>

      <!-- Thinking / Token Streaming Indicator -->
      <div v-if="aiStore.isThinking" class="flex items-center space-x-2 text-sky-400 text-xs p-2.5 bg-boba-900/80 border border-boba-800/80 rounded-xl animate-pulse">
        <span class="text-sm">✨</span>
        <span class="font-medium">AI sedang berpikir & menganalisis server...</span>
      </div>
    </div>

    <!-- Input Footer (Revamped Chat Form) -->
    <div class="p-3 bg-boba-950 border-t border-boba-800 shrink-0">
      <div class="bg-boba-900 border border-boba-800 focus-within:border-boba-accent focus-within:ring-1 focus-within:ring-boba-accent/30 rounded-xl p-2.5 transition-all shadow-inner space-y-2">
        <textarea
          v-model="promptInput"
          @keydown.enter.exact.prevent="handleSend"
          :disabled="aiStore.isThinking"
          rows="2"
          placeholder="Ketik instruksi untuk server... (cth: Cek penggunaan CPU dan RAM, analisa error log Nginx)"
          class="w-full bg-transparent border-none focus:outline-none text-xs text-slate-100 placeholder-slate-500 resize-none font-sans leading-relaxed"
        ></textarea>

        <!-- Form Action Bar -->
        <div class="flex items-center justify-between pt-1 border-t border-boba-800/60">
          <div class="flex items-center space-x-2 text-[10px] text-slate-500">
            <span class="hidden sm:inline">Enter ↵ Kirim · Shift+Enter Baris baru</span>
          </div>

          <div class="flex items-center space-x-1.5">
            <!-- Clear input button if typed -->
            <button
              v-if="promptInput.trim()"
              @click="promptInput = ''"
              type="button"
              class="px-2 py-1 text-[10px] text-slate-400 hover:text-rose-400 transition"
              title="Kosongkan teks"
            >
              Hapus
            </button>

            <!-- Send / Stop Button -->
            <button
              v-if="aiStore.isThinking"
              @click="aiStore.stopThinking"
              class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition shadow flex items-center space-x-1.5 animate-pulse"
            >
              <span>⏹</span>
              <span>Stop</span>
            </button>
            <button
              v-else
              @click="handleSend"
              :disabled="!promptInput.trim()"
              class="px-3.5 py-1.5 bg-boba-accent hover:bg-boba-accent-hover disabled:opacity-40 disabled:hover:bg-boba-accent text-white rounded-lg text-xs font-semibold transition shadow flex items-center space-x-1.5"
            >
              <span>Kirim</span>
              <span>➔</span>
            </button>
          </div>
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
const isHistoryOpen = ref(false);

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

const selectedServerName = computed(() => {
  const s = availableSessions.value.find(sess => sess.id === aiStore.selectedSessionId);
  return s ? `${s.name} (${s.username}@${s.host})` : 'Server';
});

const currentMessages = computed(() => {
  const sid = aiStore.selectedSessionId || 'default';
  const thread = aiStore.activeThread;
  // Akses thread?.updatedAt agar computed selalu re-trigger jika ada event streaming token atau tool execution
  const _ = thread?.updatedAt;
  const rawList = aiStore.getSessionMessages(sid);
  // Saring pesan teknis internal tool role dan pesan assistant kosong tanpa konten/tool calls
  const msgs = rawList.filter(m => {
    if (m.role === 'tool') return false;
    if (m.role === 'assistant') {
      return (m.content && m.content.trim().length > 0) || (m.toolCalls && m.toolCalls.length > 0);
    }
    return true;
  });
  // Pastikan urutan selalu terurut secara kronologis dari waktu paling awal ke paling akhir
  return [...msgs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
});

function handleNewChat() {
  if (!aiStore.selectedSessionId) {
    dialogStore.showToast('Silakan pilih Target Server terlebih dahulu', 'warning', 2500);
    return;
  }
  aiStore.createNewThread(aiStore.selectedSessionId);
  isHistoryOpen.value = false;
  dialogStore.showToast('Percakapan baru dibuat', 'info', 1500);
  scrollToBottom();
}

function handleSelectThread(threadId: string) {
  aiStore.switchThread(threadId);
  isHistoryOpen.value = false;
  scrollToBottom();
}

async function handleDeleteThread(threadId: string) {
  const isConfirmed = await dialogStore.confirm({
    title: 'Hapus Percakapan',
    description: 'Apakah Anda yakin ingin menghapus percakapan ini dari riwayat?',
    confirmText: 'Hapus',
    cancelText: 'Batal',
    isDestructive: true,
  });
  if (isConfirmed) {
    aiStore.deleteThread(threadId);
    dialogStore.showToast('Percakapan berhasil dihapus', 'info', 1500);
  }
}

function getThreadSnippet(thread: any): string {
  const visible = (thread.messages || []).filter((m: any) => m.role !== 'tool');
  if (visible.length === 0) return 'Belum ada pesan.';
  const last = visible[visible.length - 1];
  const prefix = last.role === 'user' ? 'Anda: ' : 'AI: ';
  const content = last.content || (last.toolCalls?.length ? `[${last.toolCalls[0].name}]` : '...');
  return prefix + (content.length > 55 ? content.slice(0, 55) + '...' : content);
}

function formatDateTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Hari ini, ${timeStr}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
}

function copyCommand(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
    dialogStore.showToast('Berhasil disalin ke clipboard', 'success', 2000);
  }
}

async function retryConnection() {
  if (aiStore.isThinking || !aiStore.selectedSessionId) return;
  const thread = aiStore.activeThread;
  if (!thread) return;

  // Bersihkan pesan error terakhir atau pesan assistant kosong dari thread
  while (thread.messages.length > 0) {
    const last = thread.messages[thread.messages.length - 1];
    if (last.role === 'assistant' && (!last.content || last.content.includes('⚠️ Connection Error') || last.content.includes('⚠️ Error'))) {
      if (last.toolCalls && last.toolCalls.length > 0) {
        last.content = last.content.replace(/\n*⚠️ (Connection Error|Error):[\s\S]*$/, '').trim();
        break;
      } else {
        thread.messages.pop();
      }
    } else {
      break;
    }
  }
  thread.updatedAt = Date.now();
  aiStore.saveState();

  await aiStore.continueAgentLoop(aiStore.selectedSessionId);
}

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
