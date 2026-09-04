<template>
  <div class="h-full w-full flex flex-col bg-[#0b0d13] text-slate-200 font-mono text-xs select-none overflow-hidden">
    <!-- Top Quick Connection / Path Bar -->
    <div class="h-9 bg-[#131722] border-b border-[#232a3b] px-3 flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2 truncate">
        <span class="text-sky-400 font-bold">📁 SFTP DUAL PANE</span>
        <span class="text-slate-600">|</span>
        <span class="text-slate-300 font-semibold truncate">
          {{ tab.sessionConfig.username }}@{{ tab.sessionConfig.host }}:{{ tab.sessionConfig.port }}
        </span>
      </div>

      <div class="flex items-center space-x-2">
        <button
          @click="refreshBoth"
          :disabled="loadingLocal || loadingRemote"
          class="px-2.5 py-1 bg-[#1c2233] hover:bg-[#283248] text-slate-300 rounded text-[11px] transition flex items-center space-x-1"
          title="Refresh Local & Remote"
        >
          <span>🔄</span>
          <span>Refresh All</span>
        </button>
      </div>
    </div>

    <!-- Main Dual Pane Workspace (Left: Local | Right: Remote) -->
    <div class="flex-1 flex overflow-hidden">
      <!-- LEFT PANE: LOCAL COMPUTER -->
      <div class="flex-1 flex flex-col border-r border-[#232a3b] bg-[#0e111a] overflow-hidden">
        <!-- Local Header & Path Navigation -->
        <div class="p-2 bg-[#161a26] border-b border-[#232a3b] space-y-1.5 shrink-0">
          <div class="flex items-center justify-between text-[11px]">
            <div class="flex items-center space-x-1.5 font-bold text-slate-200 truncate flex-1 mr-2">
              <span>{{ leftPaneTarget === 'local' ? '💻' : '🌐' }}</span>
              <!-- Left Pane Target Selector (Local or Remote Session) -->
              <select
                v-model="leftPaneTarget"
                @change="onLeftTargetChange(leftPaneTarget)"
                class="bg-[#0e121c] text-sky-300 font-semibold border border-[#2b354b] rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="local">💻 Local Machine</option>
                <optgroup label="Remote Sessions">
                  <option v-for="s in availableSessions" :key="'l_' + s.id" :value="s.id">
                    🌐 {{ s.name || s.username + '@' + s.host }}
                  </option>
                </optgroup>
              </select>
            </div>
            <!-- Toggle Hide / Show System & Hidden Files (when in local mode) -->
            <label v-if="leftPaneTarget === 'local'" class="flex items-center space-x-1.5 cursor-pointer select-none text-[10px] text-slate-400 hover:text-slate-200" title="Sembunyikan atau tampilkan file/folder sistem Windows dan tersembunyi (hidden/system)">
              <input
                type="checkbox"
                v-model="hideLocalSystemFiles"
                class="rounded bg-[#121520] border-[#262f42] text-sky-500 focus:ring-0 focus:ring-offset-0 h-3 w-3 cursor-pointer"
              />
              <span>Hide system files</span>
            </label>
          </div>

          <!-- Quick Drive & Quick Folder Badges (Windows C:, D:, E:, User Home / Linux /) -->
          <div class="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
            <span class="text-slate-500 font-sans text-[10px] shrink-0">Drive:</span>
            <button
              v-for="d in localDrives"
              :key="d.path"
              @click="setLocalDrive(d.path)"
              :class="[
                'px-1.5 py-0.5 rounded border transition shrink-0 font-mono',
                isDriveActive(d.path)
                  ? 'bg-sky-950 border-sky-600 text-sky-300 font-bold'
                  : 'bg-[#10141f] border-[#252e42] text-slate-400 hover:text-slate-200 hover:border-slate-500'
              ]"
              :title="d.path"
            >
              {{ d.name }}
            </button>
          </div>

          <div class="flex items-center space-x-1">
            <!-- Back & Up Buttons directly beside input -->
            <button
              @click="navigateLocalBack"
              :disabled="localHistoryIndex <= 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Kembali ke folder sebelumnya (Back)"
            >
              <span>◀</span>
              <span>Back</span>
            </button>
            <button
              @click="navigateLocalUp"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Ke folder di atasnya (Up)"
            >
              <span>⬆</span>
              <span>Up</span>
            </button>

            <input
              v-model="localPathInput"
              @keydown.enter="handleLocalEnter"
              type="text"
              class="flex-1 bg-[#090b10] border border-[#262f42] focus:border-sky-500 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none font-mono"
              placeholder="C:\..."
            />
            <button
              @click="handleLocalEnter"
              class="px-2.5 py-1 bg-[#202738] hover:bg-[#2c364d] rounded text-[10px] transition font-sans"
            >
              Buka
            </button>
            <button
              @click="refreshLocal"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 hover:text-white rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Refresh folder lokal saat ini"
            >
              <span>🔄</span>
            </button>
          </div>
        </div>

        <!-- Local File Table List -->
        <div
          ref="localPaneRef"
          class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative transition-colors duration-150"
          :class="isDraggingOverLocal ? 'bg-emerald-950/20 ring-2 ring-emerald-500/50 ring-inset' : ''"
          @dragenter.prevent="onLocalDragEnter"
          @dragover.prevent="onLocalDragOver"
          @dragleave.prevent="onLocalDragLeave"
          @drop.prevent="onLocalDrop"
        >
          <!-- Table Header -->
          <div class="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#121520] border-b border-[#232a3b] text-[10px] text-slate-400 uppercase font-semibold sticky top-0 z-10">
            <div class="col-span-7">Filename</div>
            <div class="col-span-2 text-right">Size</div>
            <div class="col-span-3 text-right">Action</div>
          </div>

          <!-- Drag over drop hint overlay -->
          <div
            v-if="isDraggingOverLocal"
            class="absolute inset-0 bg-emerald-900/30 backdrop-blur-[1px] border-2 border-dashed border-emerald-400 rounded flex flex-col items-center justify-center z-20 pointer-events-none"
          >
            <span class="text-2xl">📥</span>
            <span class="text-xs font-bold text-emerald-200 mt-1">Drop file/folder di sini untuk Download</span>
            <span class="text-[10px] text-emerald-400">Target: {{ localPathInput }}</span>
          </div>

          <div v-if="loadingLocal" class="p-4 text-center text-slate-500 text-[11px]">
            Loading local directory...
          </div>

          <div
            v-else
            v-for="item in displayLocalFiles"
            :key="item.path"
            draggable="true"
            @dragstart="onLocalDragStart($event, item)"
            @dblclick="handleLocalDblClick(item)"
            @click="selectedLocalPath = item.path"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              selectedLocalPath === item.path ? 'bg-sky-950/40 text-sky-200' : 'text-slate-300'
            ]"
          >
            <div class="col-span-7 flex items-center space-x-2 truncate">
              <span class="shrink-0">{{ item.is_dir ? '📁' : '📄' }}</span>
              <span class="truncate" :title="item.name">{{ item.name }}</span>
            </div>
            <div class="col-span-2 text-right text-[10px] text-slate-400 font-mono">
              {{ item.is_dir ? '<DIR>' : formatSize(item.size) }}
            </div>
            <div class="col-span-3 text-right flex items-center justify-end space-x-1">
              <button
                @click.stop="transferItemLeftToRight(item)"
                class="px-2 py-0.5 bg-sky-900/60 hover:bg-sky-700 text-sky-100 rounded text-[10px] transition shadow flex items-center space-x-1"
                :title="item.is_dir ? 'Transfer Folder ke Pane Kanan' : 'Transfer File ke Pane Kanan'"
              >
                <span>{{ item.is_dir ? '📁 ➡️' : '📄 ➡️' }}</span>
                <span>Transfer</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT PANE: REMOTE SERVER (SFTP) -->
      <div class="flex-1 flex flex-col bg-[#0b0e16] overflow-hidden">
        <!-- Remote Header & Path Navigation -->
        <div class="p-2 bg-[#161a26] border-b border-[#232a3b] space-y-1.5 shrink-0">
          <div class="flex items-center justify-between text-[11px]">
            <div class="flex items-center space-x-1.5 font-bold text-slate-200 truncate flex-1 mr-2">
              <span>{{ rightPaneTarget === 'local' ? '💻' : '🌐' }}</span>
              <!-- Right Pane Target Selector -->
              <select
                v-model="rightPaneTarget"
                @change="onRightTargetChange(rightPaneTarget)"
                class="bg-[#0e121c] text-emerald-300 font-semibold border border-[#2b354b] rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option v-if="props.tab.sessionConfig?.id" :value="props.tab.sessionConfig.id">
                  🌐 {{ props.tab.sessionConfig.name || props.tab.sessionConfig.username + '@' + props.tab.sessionConfig.host }} (Active)
                </option>
                <option value="local">💻 Local Machine</option>
                <optgroup label="Other Sessions">
                  <option
                    v-for="s in availableSessions.filter(s => s.id !== props.tab.sessionConfig?.id)"
                    :key="'r_' + s.id"
                    :value="s.id"
                  >
                    🌐 {{ s.name || s.username + '@' + s.host }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div class="flex items-center space-x-1.5 shrink-0">
              <button
                @click="promptNewRemoteFolder"
                class="px-2 py-0.5 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[10px] transition"
                title="Buat Folder Baru di Server"
              >
                + Folder
              </button>
            </div>
          </div>

          <!-- Quick Server Locations Badges (Home ~, Root /, /var/www, /etc) -->
          <div class="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
            <span class="text-slate-500 font-sans text-[10px] shrink-0">Quick:</span>
            <button
              v-for="loc in serverLocations"
              :key="loc.path"
              @click="setRemoteLocation(loc.path)"
              :class="[
                'px-1.5 py-0.5 rounded border transition shrink-0 font-mono',
                remotePathInput === loc.path || (loc.path !== '.' && remotePathInput.startsWith(loc.path))
                  ? 'bg-emerald-950 border-emerald-600 text-emerald-300 font-bold'
                  : 'bg-[#10141f] border-[#252e42] text-slate-400 hover:text-slate-200 hover:border-slate-500'
              ]"
              :title="loc.description || loc.path"
            >
              {{ loc.name }}
            </button>
          </div>

          <div class="flex items-center space-x-1">
            <!-- Back & Up Buttons directly beside remote input -->
            <button
              @click="navigateRemoteBack"
              :disabled="remoteHistoryIndex <= 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Kembali ke folder sebelumnya (Back)"
            >
              <span>◀</span>
              <span>Back</span>
            </button>
            <button
              @click="navigateRemoteUp"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Ke folder di atasnya (Up)"
            >
              <span>⬆</span>
              <span>Up</span>
            </button>

            <input
              v-model="remotePathInput"
              @keydown.enter="handleRemoteEnter"
              type="text"
              class="flex-1 bg-[#090b10] border border-[#262f42] focus:border-sky-500 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none font-mono"
              placeholder="/var/www/..."
            />
            <button
              @click="handleRemoteEnter"
              class="px-2.5 py-1 bg-[#202738] hover:bg-[#2c364d] rounded text-[10px] transition font-sans"
            >
              Buka
            </button>
            <button
              @click="refreshRemote"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 hover:text-white rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Refresh folder remote saat ini"
            >
              <span>🔄</span>
            </button>
          </div>
        </div>

        <!-- Remote File Table List -->
        <div
          ref="remotePaneRef"
          class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative transition-colors duration-150"
          :class="isDraggingOverRemote ? 'bg-sky-950/20 ring-2 ring-sky-500/50 ring-inset' : ''"
          @dragenter.prevent="onRemoteDragEnter"
          @dragover.prevent="onRemoteDragOver"
          @dragleave.prevent="onRemoteDragLeave"
          @drop.prevent="onRemoteDrop"
        >
          <!-- Table Header -->
          <div class="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#121520] border-b border-[#232a3b] text-[10px] text-slate-400 uppercase font-semibold sticky top-0 z-10">
            <div class="col-span-7">Filename</div>
            <div class="col-span-2 text-right">Size</div>
            <div class="col-span-3 text-right">Action</div>
          </div>

          <!-- Drag over drop hint overlay -->
          <div
            v-if="isDraggingOverRemote"
            class="absolute inset-0 bg-sky-900/30 backdrop-blur-[1px] border-2 border-dashed border-sky-400 rounded flex flex-col items-center justify-center z-20 pointer-events-none"
          >
            <span class="text-2xl">📤</span>
            <span class="text-xs font-bold text-sky-200 mt-1">Drop file/folder di sini untuk Upload ke Server</span>
            <span class="text-[10px] text-sky-400">Target: {{ remotePathInput }}</span>
          </div>

          <div v-if="loadingRemote" class="p-4 text-center text-slate-500 text-[11px]">
            Loading remote directory...
          </div>

          <div
            v-else
            v-for="file in remoteFiles"
            :key="file.path"
            draggable="true"
            @dragstart="onRemoteDragStart($event, file)"
            @dblclick="handleRemoteDblClick(file)"
            @click="selectedRemotePath = file.path"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              selectedRemotePath === file.path ? 'bg-sky-950/40 text-sky-200' : 'text-slate-300'
            ]"
          >
            <div class="col-span-7 flex items-center space-x-2 truncate">
              <span class="shrink-0">{{ file.is_dir ? '📁' : '📄' }}</span>
              <span class="truncate" :title="file.name">{{ file.name }}</span>
            </div>
            <div class="col-span-2 text-right text-[10px] text-slate-400 font-mono">
              {{ file.is_dir ? '<DIR>' : formatSize(file.size) }}
            </div>
            <div class="col-span-3 text-right flex items-center justify-end space-x-1">
              <button
                @click.stop="downloadRemoteItem(file)"
                class="px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-700 text-emerald-100 rounded text-[10px] transition shadow flex items-center space-x-1"
                :title="file.is_dir ? 'Download Folder ke Komputer Ini' : 'Download File ke Komputer Ini'"
              >
                <span>{{ file.is_dir ? '📁 ⬅️' : '📄 ⬅️' }}</span>
                <span>Download</span>
              </button>
              <button
                @click.stop="deleteRemoteItem(file)"
                class="p-0.5 text-slate-500 hover:text-rose-400 rounded text-[10px] transition"
                title="Hapus"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- BOTTOM PANEL: TRANSFER QUEUE TRAY (FileZilla Bottom Style: 3 Tabs) -->
    <div
      :style="{ height: isQueueCollapsed ? '32px' : `${queueHeight}px` }"
      class="border-t border-[#232a3b] bg-[#10131d] flex flex-col shrink-0 relative transition-[height] duration-75"
    >
      <!-- Resize Handle Bar (Drag to Resize) -->
      <div
        @mousedown="startResizeQueue"
        class="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize hover:bg-sky-500/40 active:bg-sky-500 z-30 transition-colors"
        title="Tahan & geser untuk mengubah tinggi antrean transfer"
      ></div>

      <!-- Queue Header & 3 Tabs Bar -->
      <div class="h-8 bg-[#151926] border-b border-[#232a3b] px-3 flex items-center justify-between shrink-0 select-none">
        <div class="flex items-center space-x-4 h-full">
          <button
            @click="toggleQueueCollapse"
            class="text-[11px] font-bold text-slate-300 hover:text-white flex items-center space-x-1.5 transition"
            :title="isQueueCollapsed ? 'Tampilkan Antrean Transfer' : 'Sembunyikan / Minimalisir Antrean'"
          >
            <span class="text-xs transition-transform duration-200" :class="isQueueCollapsed ? 'rotate-180' : ''">🔽</span>
            <span>Antrean Transfer</span>
          </button>

          <div v-show="!isQueueCollapsed" class="flex h-full space-x-1">
            <!-- Tab 1: Berjalan -->
            <button
              @click="queueTab = 'active'"
              :class="[
                'px-3 text-[11px] font-semibold border-b-2 flex items-center space-x-1.5 transition',
                queueTab === 'active'
                  ? 'border-sky-500 text-sky-400 bg-sky-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span>Berjalan</span>
              <span
                v-if="sessionActiveTransfers.length > 0"
                class="px-1.5 py-0.2 rounded-full text-[9px] bg-sky-500/20 text-sky-300"
              >
                {{ sessionActiveTransfers.length }}
              </span>
            </button>

            <!-- Tab 2: Sukses -->
            <button
              @click="queueTab = 'completed'"
              :class="[
                'px-3 text-[11px] font-semibold border-b-2 flex items-center space-x-1.5 transition',
                queueTab === 'completed'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span>Sukses</span>
              <span
                v-if="sessionCompletedTransfers.length > 0"
                class="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300"
              >
                {{ sessionCompletedTransfers.length }}
              </span>
            </button>

            <!-- Tab 3: Gagal / Terputus -->
            <button
              @click="queueTab = 'failed'"
              :class="[
                'px-3 text-[11px] font-semibold border-b-2 flex items-center space-x-1.5 transition',
                queueTab === 'failed'
                  ? 'border-rose-500 text-rose-400 bg-rose-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span>Gagal / Terputus</span>
              <span
                v-if="sessionFailedTransfers.length > 0"
                class="px-1.5 py-0.2 rounded-full text-[9px] bg-rose-500/20 text-rose-300"
              >
                {{ sessionFailedTransfers.length }}
              </span>
            </button>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <!-- Quick Status info when collapsed -->
          <div v-if="isQueueCollapsed" class="flex items-center space-x-3 text-[10px] text-slate-400 mr-2">
            <span v-if="sessionActiveTransfers.length > 0" class="text-sky-400 flex items-center space-x-1">
              <span>⚡</span>
              <span>{{ sessionActiveTransfers.length }} aktif</span>
            </span>
            <span v-if="sessionFailedTransfers.length > 0" class="text-rose-400 flex items-center space-x-1">
              <span>⚠️</span>
              <span>{{ sessionFailedTransfers.length }} gagal</span>
            </span>
          </div>

          <button
            v-show="!isQueueCollapsed"
            @click="queueStore.clearCompleted"
            class="text-[10px] text-slate-400 hover:text-slate-200 bg-[#1c2233] px-2 py-0.5 rounded transition"
          >
            Bersihkan Selesai
          </button>

          <!-- Toggle Minimize / Maximize Button -->
          <button
            @click="toggleQueueCollapse"
            class="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-[#202636] transition text-[10px]"
            :title="isQueueCollapsed ? 'Perbesar panel antrean' : 'Sembunyikan panel antrean'"
          >
            {{ isQueueCollapsed ? '▲ Buka' : '▼ Sembunyikan' }}
          </button>
        </div>
      </div>

      <!-- Queue Items Table / List (Hidden when collapsed) -->
      <div v-show="!isQueueCollapsed" class="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
        <div v-if="currentQueueItems.length === 0" class="h-full flex items-center justify-center text-slate-500 text-xs italic">
          <span v-if="queueTab === 'active'">Tidak ada transfer yang sedang aktif.</span>
          <span v-else-if="queueTab === 'completed'">Belum ada transfer yang selesai di sesi ini.</span>
          <span v-else>Tidak ada transfer yang gagal atau terputus.</span>
        </div>

        <div
          v-for="item in currentQueueItems"
          :key="item.id"
          class="bg-[#151926] border border-[#232a3b] rounded-lg p-2 text-xs flex items-center justify-between space-x-3"
        >
          <!-- Left: Direction Icon & File Name -->
          <div class="flex items-center space-x-2 truncate flex-1">
            <span>{{ item.direction === 'upload' ? '⬆️' : '⬇️' }}</span>
            <span class="text-slate-200 font-semibold truncate max-w-xs" :title="item.remotePath">
              {{ item.fileName }}
            </span>
            <span class="text-[10px] text-slate-500 truncate hidden sm:inline">
              ({{ item.direction === 'upload' ? 'Local ➔ Remote' : 'Remote ➔ Local' }})
            </span>
          </div>

          <!-- Middle: Progress Bar & Transfer Stats -->
          <div class="w-64 shrink-0 space-y-1">
            <div class="flex justify-between text-[10px] text-slate-400">
              <span>{{ formatSize(item.bytesTransferred) }} / {{ formatSize(item.totalBytes) }}</span>
              <span>{{ Math.round(item.percentage) }}%</span>
            </div>
            <div class="w-full bg-[#0b0e16] rounded-full h-1.5 overflow-hidden">
              <div
                :class="[
                  'h-full transition-all duration-150',
                  item.status === 'completed'
                    ? 'bg-emerald-400'
                    : item.status === 'error' || item.status === 'cancelled'
                    ? 'bg-rose-500'
                    : 'bg-sky-400'
                ]"
                :style="{ width: `${item.percentage}%` }"
              ></div>
            </div>
          </div>

          <!-- Right: Actions (Resume, Restart, Cancel, Delete) -->
          <div class="flex items-center space-x-1.5 shrink-0">
            <!-- If transferring, show speed or Cancel -->
            <button
              v-if="item.status === 'transferring' || item.status === 'pending'"
              @click="queueStore.cancelTransfer(item.id)"
              class="text-rose-400 hover:text-rose-300 text-[10px] px-2 py-0.5 rounded bg-rose-950/40 border border-rose-900/50 transition"
            >
              Cancel
            </button>

            <!-- If Failed, show RESUME & RESTART buttons -->
            <button
              v-if="item.status === 'error' || item.status === 'cancelled'"
              @click="queueStore.resumeTransfer(item.id)"
              class="text-sky-300 hover:text-white text-[10px] px-2.5 py-0.5 rounded bg-sky-950 hover:bg-sky-800 border border-sky-700/60 transition flex items-center space-x-1 shadow"
              title="Lanjutkan dari byte terakhir"
            >
              <span>⚡</span>
              <span>Resume</span>
            </button>

            <button
              v-if="item.status === 'error' || item.status === 'cancelled'"
              @click="queueStore.restartTransfer(item.id)"
              class="text-amber-300 hover:text-white text-[10px] px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-800 transition"
              title="Ulangi dari 0%"
            >
              🔄 Ulang
            </button>

            <button
              v-if="item.status !== 'transferring' && item.status !== 'pending'"
              @click="queueStore.removeTransfer(item.id)"
              class="text-slate-500 hover:text-slate-300 text-xs px-1"
              title="Hapus"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue';
import type { ActiveTab, LocalFileItem, RemoteFileItem } from '../types/index.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { useTransferQueueStore } from '../stores/transferQueueStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';

const props = defineProps<{ tab: ActiveTab }>();

const queueStore = useTransferQueueStore();
const sessionStore = useSessionStore();
const vaultStore = useVaultStore();
const dialogStore = useDialogStore();

// Resolusi session ID aktif untuk SFTP backend
const sftpSessionId = computed(() => {
  // Jika ada parentSessionId dan tab parent masih ada
  if (props.tab.parentSessionId) {
    const parent = sessionStore.tabs.find(t => t.id === props.tab.parentSessionId);
    if (parent && parent.connected) {
      return parent.id;
    }
  }
  // Atau cari terminal tab lain yang menggunakan sessionConfig yang sama
  const sameSessionTab = sessionStore.tabs.find(
    t => t.type === 'terminal' && t.sessionConfig.id === props.tab.sessionConfig.id && t.connected
  );
  if (sameSessionTab) {
    return sameSessionTab.id;
  }
  // Fallback ke ID tab ini sendiri
  return props.tab.id;
});

// Local Files State & History
const localPathInput = ref('');
const localFiles = ref<LocalFileItem[]>([]);
const localDrives = ref<{ name: string; path: string }[]>([]);
const selectedLocalPath = ref<string | null>(null);
const loadingLocal = ref(false);
const localHistory = ref<string[]>([]);
const localHistoryIndex = ref(-1);
const hideLocalSystemFiles = ref(true);

// Filtered local files
const displayLocalFiles = computed(() => {
  if (!hideLocalSystemFiles.value) {
    return localFiles.value;
  }
  return localFiles.value.filter(item => !item.is_hidden && !item.is_system);
});

// Remote Files State & History
const remotePathInput = ref('.');
const remoteFiles = ref<RemoteFileItem[]>([]);
const selectedRemotePath = ref<string | null>(null);
const loadingRemote = ref(false);
const remoteHistory = ref<string[]>([]);
const remoteHistoryIndex = ref(-1);

// Drag and Drop States
const localPaneRef = useTemplateRef<HTMLElement>('localPaneRef');
const remotePaneRef = useTemplateRef<HTMLElement>('remotePaneRef');
const isDraggingOverRemote = ref(false);
const isDraggingOverLocal = ref(false);
let draggedLocalItem: LocalFileItem | null = null;
let draggedRemoteItem: RemoteFileItem | null = null;

// Pane Mode States ('local' | session_id)
const leftPaneTarget = ref<string>('local');
const rightPaneTarget = ref<string>('');

// Available remote sessions from vault
const availableSessions = computed(() => {
  return vaultStore.vault.sessions;
});

// Watch changes to pane target
function onLeftTargetChange(newTarget: string) {
  leftPaneTarget.value = newTarget;
  if (newTarget === 'local') {
    fetchLocalFiles(true);
  } else {
    fetchLeftRemoteFiles(true);
  }
}

function onRightTargetChange(newTarget: string) {
  rightPaneTarget.value = newTarget;
  if (newTarget === 'local') {
    fetchRightLocalFiles(true);
  } else {
    fetchRemoteFiles(true);
  }
}

// Queue Tab State ('active' | 'completed' | 'failed')
const queueTab = ref<'active' | 'completed' | 'failed'>('active');

// Footer Queue Resizing & Collapse States
const isQueueCollapsed = ref(false);
const queueHeight = ref(176); // default 176px (h-44)
const isResizingQueue = ref(false);
let startY = 0;
let startHeight = 0;

function toggleQueueCollapse() {
  isQueueCollapsed.value = !isQueueCollapsed.value;
}

function startResizeQueue(e: MouseEvent) {
  isResizingQueue.value = true;
  startY = e.clientY;
  startHeight = queueHeight.value;
  if (isQueueCollapsed.value) {
    isQueueCollapsed.value = false;
  }
  window.addEventListener('mousemove', onResizeQueueMove);
  window.addEventListener('mouseup', stopResizeQueue);
}

function onResizeQueueMove(e: MouseEvent) {
  if (!isResizingQueue.value) return;
  const delta = startY - e.clientY; // drag up = increase height
  const newH = Math.min(Math.max(startHeight + delta, 32), 600);
  queueHeight.value = newH;
}

function stopResizeQueue() {
  isResizingQueue.value = false;
  window.removeEventListener('mousemove', onResizeQueueMove);
  window.removeEventListener('mouseup', stopResizeQueue);
}

const sessionActiveTransfers = computed(() => {
  const activeId = sftpSessionId.value;
  return queueStore.transfers.filter(
    t => (t.sessionId === activeId || t.sessionId === props.tab.id) && (t.status === 'transferring' || t.status === 'pending')
  );
});

const sessionCompletedTransfers = computed(() => {
  const activeId = sftpSessionId.value;
  return queueStore.transfers.filter(
    t => (t.sessionId === activeId || t.sessionId === props.tab.id) && t.status === 'completed'
  );
});

const sessionFailedTransfers = computed(() => {
  const activeId = sftpSessionId.value;
  return queueStore.transfers.filter(
    t => (t.sessionId === activeId || t.sessionId === props.tab.id) && (t.status === 'error' || t.status === 'cancelled')
  );
});

const currentQueueItems = computed(() => {
  if (queueTab.value === 'active') return sessionActiveTransfers.value;
  if (queueTab.value === 'completed') return sessionCompletedTransfers.value;
  return sessionFailedTransfers.value;
});

onMounted(async () => {
  queueStore.initListener();

  if (props.tab.sessionConfig?.id) {
    rightPaneTarget.value = props.tab.sessionConfig.id;
  } else if (availableSessions.value.length > 0) {
    rightPaneTarget.value = availableSessions.value[0].id;
  }

  // Load available local drives dynamically (User Home, C:, D:, etc.)
  try {
    const drives = await tauriBridge.fsGetLocalDrives();
    if (drives && drives.length > 0) {
      localDrives.value = drives;
      if (!localPathInput.value) {
        localPathInput.value = drives[0].path;
      }
    }
  } catch (e) {
    console.warn('Failed to load local drives:', e);
  }

  if (!localPathInput.value) {
    localPathInput.value = 'C:\\';
  }

  await fetchLocalFiles();
  if (rightPaneTarget.value) {
    await fetchRemoteFiles();
  }
});

function setLocalDrive(path: string) {
  navigateToLocalPath(path);
}

function isDriveActive(drivePath: string): boolean {
  const current = localPathInput.value.toLowerCase().replace(/\\+$/, '');
  const drive = drivePath.toLowerCase().replace(/\\+$/, '');

  // Jika drivePath adalah User Home (panjang > 3), cek startsWith
  if (drive.length > 3) {
    return current === drive || current.startsWith(drive + '\\');
  }

  // Jika drivePath adalah root drive seperti C:, pastikan User Home tidak sedang aktif
  const userHomeDrive = localDrives.value.find(d => d.path.length > 3);
  if (userHomeDrive) {
    const home = userHomeDrive.path.toLowerCase().replace(/\\+$/, '');
    if (current === home || current.startsWith(home + '\\')) {
      return false;
    }
  }

  return current.startsWith(drive);
}

function setRemoteLocation(path: string) {
  navigateToRemotePath(path);
}

async function refreshBoth() {
  await Promise.all([fetchLocalFiles(false), fetchRemoteFiles(false)]);
}

async function refreshLocal() {
  await fetchLocalFiles(false);
}

async function refreshRemote() {
  await fetchRemoteFiles(false);
}

// Local File Operations
async function fetchLocalFiles(recordHistory = true) {
  loadingLocal.value = true;
  try {
    const items = await tauriBridge.fsListLocalDir(localPathInput.value);
    localFiles.value = items;
    if (recordHistory) {
      if (localHistoryIndex.value === -1 || localHistory.value[localHistoryIndex.value] !== localPathInput.value) {
        localHistory.value = localHistory.value.slice(0, localHistoryIndex.value + 1);
        localHistory.value.push(localPathInput.value);
        localHistoryIndex.value = localHistory.value.length - 1;
      }
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Local Path Error',
      description: String(err),
      variant: 'error',
    });
  } finally {
    loadingLocal.value = false;
  }
}

function navigateToLocalPath(path: string) {
  localPathInput.value = path;
  fetchLocalFiles(true);
}

function handleLocalEnter() {
  fetchLocalFiles(true);
}

function navigateLocalBack() {
  if (localHistoryIndex.value > 0) {
    localHistoryIndex.value--;
    localPathInput.value = localHistory.value[localHistoryIndex.value];
    fetchLocalFiles(false);
  }
}

function navigateLocalUp() {
  const current = localPathInput.value.replace(/\\+$/, '');
  const lastSlash = Math.max(current.lastIndexOf('\\'), current.lastIndexOf('/'));
  let target = '';
  if (lastSlash > 0) {
    target = current.substring(0, lastSlash);
  } else if (lastSlash === 0) {
    target = current.substring(0, 1) + '\\';
  } else if (current.endsWith(':')) {
    target = current + '\\';
  }
  if (target) {
    navigateToLocalPath(target);
  }
}

function handleLocalDblClick(item: LocalFileItem) {
  if (item.is_dir) {
    navigateToLocalPath(item.path);
  }
}

// Remote File Operations
async function ensureConnected(): Promise<string> {
  const activeId = sftpSessionId.value;
  // Check if session exists in open tabs
  const tabRef = sessionStore.tabs.find(t => t.id === activeId);
  if (tabRef && tabRef.connected) {
    return activeId;
  }

  // Auto connect if tab is not connected yet
  let keyItem = undefined;
  if (props.tab.sessionConfig.auth_type === 'key' && props.tab.sessionConfig.key_id) {
    keyItem = vaultStore.vault.keys.find(k => k.id === props.tab.sessionConfig.key_id);
  }

  await tauriBridge.sshConnect(
    activeId,
    props.tab.sessionConfig,
    keyItem,
    80,
    24
  );
  return activeId;
}

async function fetchRemoteFiles(recordHistory = true) {
  loadingRemote.value = true;
  try {
    const activeId = await ensureConnected();
    const items = await tauriBridge.sftpList(activeId, remotePathInput.value);
    remoteFiles.value = items;
    if (recordHistory) {
      if (remoteHistoryIndex.value === -1 || remoteHistory.value[remoteHistoryIndex.value] !== remotePathInput.value) {
        remoteHistory.value = remoteHistory.value.slice(0, remoteHistoryIndex.value + 1);
        remoteHistory.value.push(remotePathInput.value);
        remoteHistoryIndex.value = remoteHistory.value.length - 1;
      }
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Remote SFTP Error',
      description: String(err),
      variant: 'error',
    });
  } finally {
    loadingRemote.value = false;
  }
}

function navigateToRemotePath(path: string) {
  remotePathInput.value = path;
  fetchRemoteFiles(true);
}

function handleRemoteEnter() {
  fetchRemoteFiles(true);
}

function navigateRemoteBack() {
  if (remoteHistoryIndex.value > 0) {
    remoteHistoryIndex.value--;
    remotePathInput.value = remoteHistory.value[remoteHistoryIndex.value];
    fetchRemoteFiles(false);
  }
}

function navigateRemoteUp() {
  const current = remotePathInput.value.replace(/\/+$/, '');
  if (!current || current === '.' || current === '/') return;
  const lastSlash = current.lastIndexOf('/');
  let target = '';
  if (lastSlash <= 0) {
    target = '/';
  } else {
    target = current.substring(0, lastSlash);
  }
  navigateToRemotePath(target);
}

function handleRemoteDblClick(file: RemoteFileItem) {
  if (file.is_dir) {
    navigateToRemotePath(file.path);
  }
}

async function promptNewRemoteFolder() {
  const folderName = await dialogStore.prompt({
    title: 'New Remote Folder',
    description: `Create directory in: ${remotePathInput.value}`,
    placeholder: 'Folder name...',
    confirmText: 'Create',
  });
  if (!folderName) return;

  const sep = remotePathInput.value.endsWith('/') ? '' : '/';
  const targetPath = `${remotePathInput.value}${sep}${folderName}`;

  try {
    const activeId = await ensureConnected();
    await tauriBridge.sftpCreateDir(activeId, targetPath);
    await fetchRemoteFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to create folder',
      description: String(err),
      variant: 'error',
    });
  }
}

async function deleteRemoteItem(file: RemoteFileItem) {
  const confirm = await dialogStore.confirm({
    title: `Delete ${file.is_dir ? 'Folder' : 'File'}?`,
    description: `Are you sure you want to delete "${file.name}" on remote server?`,
    confirmText: 'Delete',
    isDestructive: true,
  });
  if (!confirm) return;

  try {
    const activeId = await ensureConnected();
    await tauriBridge.sftpDelete(activeId, file.path, file.is_dir);
    await fetchRemoteFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Delete Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

// Transfer Operations (Upload & Download Stream for File & Folder, plus Server-to-Server)
async function transferItemLeftToRight(item: LocalFileItem | RemoteFileItem) {
  if (leftPaneTarget.value === 'local') {
    // Local to Right Pane
    await uploadLocalItem(item as LocalFileItem);
  } else {
    // Left Pane is Remote Session
    if (rightPaneTarget.value === 'local') {
      await downloadRemoteItem(item as RemoteFileItem);
    } else {
      // Remote Session -> Remote Session (Server to Server Pipe)
      await transferRemoteToRemote(item as RemoteFileItem);
    }
  }
}

async function transferRemoteToRemote(item: RemoteFileItem) {
  const sep = remotePathInput.value.endsWith('/') ? '' : '/';
  const targetRemotePath = `${remotePathInput.value === '.' ? '' : remotePathInput.value}${sep}${item.name}`;

  try {
    const srcId = leftPaneTarget.value;
    const dstId = rightPaneTarget.value;
    const transferId = queueStore.addUpload(
      srcId,
      targetRemotePath,
      item.name,
      item.size,
      `Remote:${srcId}`
    );

    await tauriBridge.sftpTransferRemoteToRemote(
      srcId,
      dstId,
      transferId,
      item.path,
      targetRemotePath
    );

    await fetchRemoteFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Inter-Server Transfer Failed',
      description: String(err),
      variant: 'error',
    });
  }
}
async function uploadLocalItem(item: LocalFileItem) {
  const sep = remotePathInput.value.endsWith('/') ? '' : '/';
  const targetRemotePath = `${remotePathInput.value === '.' ? '' : remotePathInput.value}${sep}${item.name}`;

  try {
    const activeId = await ensureConnected();
    // Auto deteksi folder bila upload berasal dari drag-drop explorer (item.size == 0)
    let isDirectory = item.is_dir;
    if (!isDirectory) {
      try {
        const checkLocal = await tauriBridge.fsListLocalDir(item.path);
        // Bila bisa di-list sebagai dir, maka ini folder
        if (Array.isArray(checkLocal)) {
          isDirectory = true;
        }
      } catch (_) {
        // Bukan folder, berarti file biasa
        isDirectory = false;
      }
    }

    if (isDirectory) {
      // Recursive folder upload
      await tauriBridge.sftpUploadFolder(activeId, item.path, remotePathInput.value);
    } else {
      // Single file upload
      const transferId = queueStore.addUpload(
        activeId,
        targetRemotePath,
        item.name,
        item.size,
        item.path
      );

      await tauriBridge.sftpUploadStream(
        activeId,
        transferId,
        item.path,
        targetRemotePath,
        0
      );
    }
    await fetchRemoteFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Upload Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

async function downloadRemoteItem(file: RemoteFileItem) {
  const sep = localPathInput.value.endsWith('\\') || localPathInput.value.endsWith('/') ? '' : '\\';
  const targetLocalPath = `${localPathInput.value}${sep}${file.name}`;

  try {
    const activeId = await ensureConnected();
    if (file.is_dir) {
      // Recursive folder download
      await tauriBridge.sftpDownloadFolder(activeId, file.path, localPathInput.value);
    } else {
      // Single file download
      const transferId = queueStore.addDownload(
        activeId,
        file.path,
        file.name,
        file.size,
        targetLocalPath
      );

      await tauriBridge.sftpDownloadStream(
        activeId,
        transferId,
        file.path,
        targetLocalPath,
        0
      );
    }
    await fetchLocalFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Download Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

// Drag and Drop Event Handlers (HTML5 In-App Drag & Drop)
function onLocalDragStart(event: DragEvent, item: LocalFileItem) {
  draggedLocalItem = item;
  draggedRemoteItem = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'local', item }));
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'local', item }));
  }
}

function onRemoteDragStart(event: DragEvent, file: RemoteFileItem) {
  draggedRemoteItem = file;
  draggedLocalItem = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'remote', file }));
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'remote', file }));
  }
}

function onRemoteDragEnter(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  isDraggingOverRemote.value = true;
}

function onRemoteDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  isDraggingOverRemote.value = true;
}

function onRemoteDragLeave(event: DragEvent) {
  const target = event.currentTarget as HTMLElement;
  const related = event.relatedTarget as Node | null;
  if (!related || !target.contains(related)) {
    isDraggingOverRemote.value = false;
  }
}

async function onRemoteDrop(event: DragEvent) {
  event.preventDefault();
  isDraggingOverRemote.value = false;
  let localItem = draggedLocalItem;

  // 1. Cek dari HTML5 internal drag antar pane
  if (!localItem && event.dataTransfer) {
    try {
      const dataStr = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data && data.type === 'local') {
          localItem = data.item;
        }
      }
    } catch (_) {}
  }

  if (localItem) {
    await uploadLocalItem(localItem);
    draggedLocalItem = null;
    return;
  }

  // 2. Cek apakah ada file yang di-drop dari OS File Explorer langsung ke web container (event.dataTransfer.files)
  if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
    for (let i = 0; i < event.dataTransfer.files.length; i++) {
      const f: any = event.dataTransfer.files[i];
      // Di WebView2 Windows dengan dragDropEnabled: false, file HTML5 File objek memiliki .path
      const filePath = f.path || f.name;
      await uploadLocalItem({
        name: f.name,
        path: filePath,
        is_dir: false,
        size: f.size || 0,
        modified_time: f.lastModified || 0,
      });
    }
  }
}

function onLocalDragEnter(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  isDraggingOverLocal.value = true;
}

function onLocalDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  isDraggingOverLocal.value = true;
}

function onLocalDragLeave(event: DragEvent) {
  const target = event.currentTarget as HTMLElement;
  const related = event.relatedTarget as Node | null;
  if (!related || !target.contains(related)) {
    isDraggingOverLocal.value = false;
  }
}

async function onLocalDrop(event: DragEvent) {
  event.preventDefault();
  isDraggingOverLocal.value = false;
  let remoteFile = draggedRemoteItem;

  if (!remoteFile && event.dataTransfer) {
    try {
      const dataStr = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data && data.type === 'remote') {
          remoteFile = data.file;
        }
      }
    } catch (_) {}
  }

  if (remoteFile) {
    await downloadRemoteItem(remoteFile);
    draggedRemoteItem = null;
  }
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
</script>
