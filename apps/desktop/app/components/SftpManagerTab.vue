<template>
  <div
    tabindex="0"
    class="h-full w-full flex flex-col bg-[#0b0d13] text-slate-200 font-mono text-xs select-none overflow-hidden outline-none"
    @keydown="handleSftpKeydown"
  >
    <!-- Top Quick Connection / Path Bar -->
    <div class="h-9 bg-[#131722] border-b border-[#232a3b] px-3 flex items-center justify-between shrink-0">
      <div class="flex items-center space-x-2 truncate">
        <span class="text-sky-400 font-bold">📁 SFTP DUAL PANE</span>
        <span class="text-slate-600">|</span>
        <span class="text-slate-300 font-semibold truncate">
          {{ tab.sessionConfig?.username ? `${tab.sessionConfig.username}@${tab.sessionConfig.host}:${tab.sessionConfig.port}` : 'Dual SFTP Workspace' }}
        </span>
      </div>

      <div class="flex items-center space-x-2">
        <button
          @click="refreshBoth"
          :disabled="loadingLocal || loadingRemote"
          class="px-2.5 py-1 bg-[#1c2233] hover:bg-[#283248] text-slate-300 rounded text-[11px] transition flex items-center space-x-1"
          title="Refresh Local & Remote (F5)"
        >
          <span>🔄</span>
          <span>Refresh All (F5)</span>
        </button>
      </div>
    </div>

    <!-- Main Dual Pane Workspace (Left: Local | Right: Remote) -->
    <div class="flex-1 flex overflow-hidden">
      <!-- LEFT PANE: LOCAL COMPUTER -->
      <div
        @click="focusedPane = 'left'"
        class="flex-1 flex flex-col border-r border-[#232a3b] bg-[#0e111a] overflow-hidden transition-all duration-150"
        :class="focusedPane === 'left' ? 'ring-1 ring-sky-500/25' : ''"
      >
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
                <optgroup
                  v-if="activeTerminalTabs.length > 0"
                  label="🟢 Tab Sesi Aktif"
                >
                  <option
                    v-for="t in activeTerminalTabs"
                    :key="'left_tab_' + t.id"
                    :value="t.sessionConfig.id || t.id"
                  >
                    ⚡ {{ t.title }} ({{ t.sessionConfig.username }}@{{ t.sessionConfig.host }})
                  </option>
                </optgroup>
                <optgroup
                  v-for="group in groupedSessions"
                  :key="'left_group_' + group.folderName"
                  :label="'📁 ' + group.folderName"
                >
                  <option v-for="s in group.sessions" :key="'l_' + s.id" :value="s.id">
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

            <!-- Sudo Mode Toggle (when remote mode) -->
            <button
              v-if="leftPaneTarget !== 'local'"
              @click="toggleLeftSudo"
              :disabled="togglingLeftSudo"
              :class="[
                'px-2 py-0.5 rounded border text-[10px] font-medium transition flex items-center space-x-1 shrink-0',
                isLeftSudoActive
                  ? 'bg-rose-950 border-rose-500 text-rose-300 font-bold shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                  : 'bg-[#121622] border-[#2b354b] text-slate-400 hover:text-slate-200 hover:border-slate-500'
              ]"
              :title="isLeftSudoActive ? 'Sudo SFTP Aktif (Root). Akses semua file server tanpa batasan izin. Klik untuk nonaktifkan.' : 'Jalankan SFTP dengan Sudo (Root) untuk akses file/folder root'"
            >
              <span>{{ isLeftSudoActive ? '🛡️' : '🔒' }}</span>
              <span>{{ isLeftSudoActive ? 'Root SFTP (ON)' : 'Sudo SFTP' }}</span>
            </button>
          </div>

          <!-- Quick Drive Badges (when local) OR Server Locations (when remote) -->
          <div v-if="leftPaneTarget === 'local'" class="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
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
          <div v-else class="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5 text-[10px]">
            <span class="text-slate-500 font-sans text-[10px] shrink-0">Quick:</span>
            <button
              v-for="loc in serverLocations"
              :key="'left_loc_' + loc.path"
              @click="navigateToLeftRemotePath(loc.path)"
              :class="[
                'px-1.5 py-0.5 rounded border transition shrink-0 font-mono',
                leftRemotePathInput === loc.path || (loc.path !== '.' && leftRemotePathInput.startsWith(loc.path))
                  ? 'bg-sky-950 border-sky-600 text-sky-300 font-bold'
                  : 'bg-[#10141f] border-[#252e42] text-slate-400 hover:text-slate-200 hover:border-slate-500'
              ]"
              :title="loc.description || loc.path"
            >
              {{ loc.name }}
            </button>

            <!-- Left Remote Bookmarks -->
            <button
              v-for="bm in getActiveBookmarks(leftPaneTarget)"
              :key="'left_bm_' + bm"
              @click="navigateToLeftRemotePath(bm)"
              class="px-1.5 py-0.5 rounded border border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-mono shrink-0 flex items-center space-x-1"
              :title="bm"
            >
              <span>★</span>
              <span class="max-w-[70px] truncate">{{ bm }}</span>
              <span @click.stop="removeBookmark(leftPaneTarget, bm)" class="text-slate-500 hover:text-white ml-0.5">✕</span>
            </button>

            <button
              @click="addBookmark(leftPaneTarget, leftRemotePathInput)"
              class="px-1.5 py-0.5 rounded border border-amber-900/40 bg-[#161a26] text-amber-400 hover:text-amber-200 text-[10px] shrink-0 flex items-center space-x-1"
              title="Bookmark direktori remote ini"
            >
              <span>+ ⭐</span>
            </button>
          </div>

          <div class="flex items-center space-x-1">
            <!-- Back & Up Buttons directly beside input -->
            <button
              @click="leftPaneTarget === 'local' ? navigateLocalBack() : navigateLeftRemoteBack()"
              :disabled="leftPaneTarget === 'local' ? localHistoryIndex <= 0 : leftRemoteHistoryIndex <= 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Kembali ke folder sebelumnya (Back - Alt+Left)"
            >
              <span>◀</span>
            </button>
            <button
              @click="leftPaneTarget === 'local' ? navigateLocalForward() : navigateLeftRemoteForward()"
              :disabled="leftPaneTarget === 'local' ? localHistoryIndex >= localHistory.length - 1 : leftRemoteHistoryIndex >= leftRemoteHistory.length - 1"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Maju ke folder sesudahnya (Forward - Alt+Right)"
            >
              <span>▶</span>
            </button>
            <button
              @click="leftPaneTarget === 'local' ? navigateLocalUp() : navigateLeftRemoteUp()"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Ke folder di atasnya (Up)"
            >
              <span>⬆</span>
              <span>Up</span>
            </button>

            <!-- Toggle Hidden Files / Dotfiles Left -->
            <button
              @click="showHiddenFilesLeft = !showHiddenFilesLeft"
              :class="[
                'px-2 py-1 rounded text-[11px] transition shrink-0 flex items-center space-x-1',
                showHiddenFilesLeft ? 'bg-[#202738] text-sky-400' : 'bg-[#141824] text-slate-500 hover:text-slate-300'
              ]"
              :title="showHiddenFilesLeft ? 'Sembunyikan dotfiles/file tersembunyi (Ctrl+H)' : 'Tampilkan dotfiles/file tersembunyi (Ctrl+H)'"
            >
              <span>{{ showHiddenFilesLeft ? '👁️' : '👁️‍🗨️' }}</span>
            </button>

            <!-- New Folder & New File Buttons -->
            <button
              @click="promptNewFolder('left')"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-emerald-300 hover:text-emerald-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 font-semibold"
              title="Buat folder baru di direktori ini"
            >
              <span>📁+</span>
            </button>
            <button
              @click="promptNewFile('left')"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-sky-300 hover:text-sky-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 font-semibold"
              title="Buat file baru di direktori ini"
            >
              <span>📄+</span>
            </button>
            <button
              @click="cutSelectedItems('left')"
              :disabled="selectedLeftPaths.size === 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-amber-300 hover:text-amber-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Potong file/folder terpilih (Ctrl+X)"
            >
              <span>✂️</span>
            </button>
            <button
              @click="copySelectedItems('left')"
              :disabled="selectedLeftPaths.size === 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-sky-300 hover:text-sky-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Salin file/folder terpilih (Ctrl+C)"
            >
              <span>📋</span>
            </button>
            <button
              v-if="sftpClipboard"
              @click="pasteClipboard('left')"
              class="px-2 py-1 bg-emerald-950/80 border border-emerald-700/80 hover:bg-emerald-900 text-emerald-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 font-semibold animate-pulse"
              title="Tempel file/folder ke direktori ini (Ctrl+V)"
            >
              <span>📥</span>
              <span>Tempel ({{ sftpClipboard.items.length }})</span>
            </button>

            <input
              v-if="leftPaneTarget === 'local'"
              v-model="localPathInput"
              @keydown.enter="handleLocalEnter"
              type="text"
              class="flex-1 bg-[#090b10] border border-[#262f42] focus:border-sky-500 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none font-mono"
              placeholder="C:\..."
            />
            <input
              v-else
              v-model="leftRemotePathInput"
              @keydown.enter="fetchLeftRemoteFiles(true)"
              type="text"
              class="flex-1 bg-[#090b10] border border-[#262f42] focus:border-sky-500 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none font-mono"
              placeholder="/var/www/..."
            />

            <button
              @click="leftPaneTarget === 'local' ? handleLocalEnter() : fetchLeftRemoteFiles(true)"
              class="px-2.5 py-1 bg-[#202738] hover:bg-[#2c364d] rounded text-[10px] transition font-sans"
            >
              Buka
            </button>
            <button
              @click="leftPaneTarget === 'local' ? refreshLocal() : fetchLeftRemoteFiles(false)"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 hover:text-white rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Refresh folder saat ini"
            >
              <span>🔄</span>
            </button>
          </div>

          <!-- Secondary Filter & Selection Bar -->
          <div class="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
            <div class="flex items-center space-x-1 flex-1 mr-2">
              <span class="text-slate-500">🔍</span>
              <input
                v-model="leftSearchQuery"
                type="text"
                placeholder="Cari file/folder..."
                class="bg-[#090b10] border border-[#21293a] focus:border-sky-500 rounded px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none w-40"
              />
              <span v-if="leftSearchQuery" @click="leftSearchQuery = ''" class="cursor-pointer text-slate-500 hover:text-white">✕</span>
            </div>
            <div v-if="selectedLeftPaths.size > 0" class="flex items-center space-x-1.5 shrink-0 bg-sky-950/60 border border-sky-800/60 rounded px-2 py-0.5">
              <span class="text-sky-300 font-semibold">{{ selectedLeftPaths.size }} terpilih <span v-if="leftSelectionSummary" class="text-[9px] text-sky-400">({{ leftSelectionSummary.sizeFormatted }})</span></span>
              <button
                @click="cutSelectedItems('left')"
                class="text-amber-300 hover:text-amber-100 underline"
                title="Potong file/folder terpilih (Ctrl+X)"
              >
                Potong
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="copySelectedItems('left')"
                class="text-sky-200 hover:text-white underline"
                title="Salin file/folder terpilih (Ctrl+C)"
              >
                Salin
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="transferSelectedLeft"
                class="text-sky-200 hover:text-white underline"
                title="Transfer semua terpilih ke kanan"
              >
                Transfer
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="deleteSelectedItems('left')"
                class="text-rose-400 hover:text-rose-300 underline"
                title="Hapus semua terpilih (Del)"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>

        <!-- Floating Clipboard Notification Bar (Left) -->
        <div
          v-if="sftpClipboard"
          class="bg-sky-950/70 border-b border-sky-800/60 px-3 py-1 flex items-center justify-between text-xs text-sky-200 shrink-0"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <span>{{ sftpClipboard.mode === 'cut' ? '✂️' : '📋' }}</span>
            <span class="font-semibold text-white">{{ sftpClipboard.items.length }} item</span>
            <span class="text-sky-300/80 text-[11px] truncate">siap {{ sftpClipboard.mode === 'cut' ? 'dipindahkan' : 'disalin' }} dari {{ sftpClipboard.targetName }}</span>
          </div>
          <div class="flex items-center space-x-1.5 shrink-0">
            <button
              @click="pasteClipboard('left')"
              class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-[10px] transition shadow flex items-center space-x-1"
              title="Tempel ke folder aktif ini (Ctrl+V)"
            >
              <span>📥</span>
              <span>Tempel di Sini</span>
            </button>
            <button
              @click="clearSftpClipboard"
              class="text-slate-400 hover:text-white text-xs px-1"
              title="Batalkan Clipboard (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Left Pane File Table List (Local or Remote) -->
        <div
          ref="localPaneRef"
          class="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar relative transition-colors duration-150"
          :class="isDraggingOverLocal ? 'bg-emerald-950/20 ring-2 ring-emerald-500/50 ring-inset' : ''"
          @dragenter.prevent="onLocalDragEnter"
          @dragover.prevent="onLocalDragOver"
          @dragleave.prevent="onLocalDragLeave"
          @drop.prevent="onLocalDrop"
          @contextmenu.self.prevent="openContextMenu($event, 'left', null)"
        >
          <!-- Table Header -->
          <div class="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#121520] border-b border-[#232a3b] text-[10px] text-slate-400 uppercase font-semibold sticky top-0 z-10 items-center select-none">
            <div :class="leftPaneTarget === 'local' ? 'col-span-7' : 'col-span-6'" class="flex items-center space-x-2">
              <input
                type="checkbox"
                :checked="(leftPaneTarget === 'local' ? displayLocalFiles.length > 0 && selectedLeftPaths.size === displayLocalFiles.length : displayLeftRemoteFiles.length > 0 && selectedLeftPaths.size === displayLeftRemoteFiles.length)"
                @change="toggleSelectAllLeft"
                class="rounded bg-[#090b10] border-[#2b364e] text-sky-500 focus:ring-0 h-3 w-3 cursor-pointer"
                title="Pilih Semua"
              />
              <span @click="toggleLeftSort('name')" class="cursor-pointer hover:text-white flex items-center space-x-1">
                <span>Filename</span>
                <span v-if="leftSortField === 'name'" class="text-sky-400 font-bold">{{ leftSortOrder === 'asc' ? '▲' : '▼' }}</span>
              </span>
            </div>
            <div @click="toggleLeftSort('size')" class="col-span-2 text-right cursor-pointer hover:text-white flex items-center justify-end space-x-1">
              <span>Size</span>
              <span v-if="leftSortField === 'size'" class="text-sky-400 font-bold">{{ leftSortOrder === 'asc' ? '▲' : '▼' }}</span>
            </div>
            <div v-if="leftPaneTarget !== 'local'" class="col-span-2 text-center">Perms</div>
            <div :class="leftPaneTarget === 'local' ? 'col-span-3' : 'col-span-2'" class="text-right">Action</div>
          </div>

          <!-- Drag over drop hint overlay -->
          <div
            v-if="isDraggingOverLocal"
            class="absolute inset-0 bg-emerald-900/30 backdrop-blur-[1px] border-2 border-dashed border-emerald-400 rounded flex flex-col items-center justify-center z-20 pointer-events-none"
          >
            <span class="text-2xl">📥</span>
            <span class="text-xs font-bold text-emerald-200 mt-1">Drop file/folder di sini untuk Download/Transfer</span>
            <span class="text-[10px] text-emerald-400">Target: {{ leftPaneTarget === 'local' ? localPathInput : leftRemotePathInput }}</span>
          </div>

          <!-- Loading States with Spinner Animation -->
          <div v-if="leftPaneTarget === 'local' && loadingLocal" class="h-48 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <svg class="animate-spin h-6 w-6 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Memuat direktori lokal...</span>
          </div>
          <div v-else-if="leftPaneTarget !== 'local' && loadingLeftRemote" class="h-48 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <svg class="animate-spin h-6 w-6 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Menghubungkan & memuat direktori remote...</span>
          </div>

          <!-- Local Items -->
          <div
            v-else-if="leftPaneTarget === 'local'"
            v-for="item in displayLocalFiles"
            :key="item.path"
            draggable="true"
            @dragstart="onLocalDragStart($event, item)"
            @dragover="item.is_dir ? onFolderDragOver($event, item.path) : null"
            @dragleave="item.is_dir ? onFolderDragLeave(item.path) : null"
            @drop="item.is_dir ? onFolderDrop('left', item) : null"
            @dblclick="handleLocalDblClick(item)"
            @click="selectedLocalPath = item.path"
            @contextmenu.prevent="openContextMenu($event, 'left', item)"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              dragOverFolderPath === item.path ? 'bg-sky-900/60 ring-2 ring-sky-400 font-semibold' : '',
              isItemCut(item.path) ? 'opacity-40 italic' : '',
              selectedLeftPaths.has(item.path) ? 'bg-sky-950/60 text-sky-100' : selectedLocalPath === item.path ? 'bg-sky-950/30 text-sky-200' : 'text-slate-300'
            ]"
          >
            <div class="col-span-7 flex items-center space-x-2 truncate">
              <input
                type="checkbox"
                :checked="selectedLeftPaths.has(item.path)"
                @click.stop="toggleSelectLeft(item.path)"
                class="rounded bg-[#090b10] border-[#2b364e] text-sky-500 focus:ring-0 h-3 w-3 cursor-pointer shrink-0"
              />
              <span class="shrink-0">{{ item.is_dir ? '📁' : '📄' }}</span>
              <span class="truncate" :title="item.name">{{ item.name }}</span>
            </div>
            <div
              @click.stop="item.is_dir ? calculateFolderSize('left', item) : null"
              :class="[
                'col-span-2 text-right text-[10px] font-mono',
                item.is_dir ? 'text-sky-400/80 hover:text-sky-200 cursor-pointer hover:underline' : 'text-slate-400'
              ]"
              :title="item.is_dir ? 'Klik untuk menghitung total ukuran folder' : undefined"
            >
              {{ item.is_dir ? (calculatingFolderSizes.has(item.path) ? '⏳...' : (folderSizes[item.path] || '<DIR>')) : formatSize(item.size) }}
            </div>
            <div class="col-span-3 text-right flex items-center justify-end space-x-1">
              <button
                v-if="!item.is_dir"
                @click.stop="openInEditor('left', item)"
                class="p-1 hover:bg-sky-950/60 text-slate-400 hover:text-sky-300 rounded text-[10px] transition"
                title="Buka / Edit di Tab"
              >
                👁️
              </button>
              <button
                @click.stop="renameItem('left', item)"
                class="p-1 hover:bg-[#252f44] text-slate-400 hover:text-white rounded text-[10px] transition"
                title="Ganti nama"
              >
                ✏️
              </button>
              <button
                @click.stop="deleteItem('left', item)"
                class="p-1 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded text-[10px] transition"
                title="Hapus"
              >
                🗑️
              </button>
              <button
                @click.stop="transferItemLeftToRight(item)"
                class="px-2 py-0.5 bg-sky-900/60 hover:bg-sky-700 text-sky-100 rounded text-[10px] transition shadow flex items-center space-x-1"
                :title="item.is_dir ? 'Transfer Folder ke Pane Kanan' : 'Transfer File ke Pane Kanan'"
              >
                <span>➡️</span>
              </button>
            </div>
          </div>

          <!-- Left Remote Items -->
          <div
            v-else
            v-for="item in displayLeftRemoteFiles"
            :key="item.path"
            draggable="true"
            @dragstart="onLeftRemoteDragStart($event, item)"
            @dragover="item.is_dir ? onFolderDragOver($event, item.path) : null"
            @dragleave="item.is_dir ? onFolderDragLeave(item.path) : null"
            @drop="item.is_dir ? onFolderDrop('left', item) : null"
            @dblclick="handleLeftRemoteDblClick(item)"
            @click="selectedLeftRemotePath = item.path"
            @contextmenu.prevent="openContextMenu($event, 'left', item)"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              dragOverFolderPath === item.path ? 'bg-sky-900/60 ring-2 ring-sky-400 font-semibold' : '',
              isItemCut(item.path) ? 'opacity-40 italic' : '',
              selectedLeftPaths.has(item.path) ? 'bg-sky-950/60 text-sky-100' : selectedLeftRemotePath === item.path ? 'bg-sky-950/30 text-sky-200' : 'text-slate-300'
            ]"
          >
            <div class="col-span-6 flex items-center space-x-2 truncate">
              <input
                type="checkbox"
                :checked="selectedLeftPaths.has(item.path)"
                @click.stop="toggleSelectLeft(item.path)"
                class="rounded bg-[#090b10] border-[#2b364e] text-sky-500 focus:ring-0 h-3 w-3 cursor-pointer shrink-0"
              />
              <span class="shrink-0">{{ item.is_dir ? '📁' : '📄' }}</span>
              <span class="truncate" :title="item.name">{{ item.name }}</span>
            </div>
            <div
              @click.stop="item.is_dir ? calculateFolderSize('left', item) : null"
              :class="[
                'col-span-2 text-right text-[10px] font-mono',
                item.is_dir ? 'text-sky-400/80 hover:text-sky-200 cursor-pointer hover:underline' : 'text-slate-400'
              ]"
              :title="item.is_dir ? 'Klik untuk menghitung total ukuran folder' : undefined"
            >
              {{ item.is_dir ? (calculatingFolderSizes.has(item.path) ? '⏳...' : (folderSizes[item.path] || '<DIR>')) : formatSize(item.size) }}
            </div>
            <div class="col-span-2 text-center text-[10px] font-mono">
              <span
                @click.stop="openChmodModal('left', item)"
                class="cursor-pointer px-1.5 py-0.5 rounded text-[9px] font-semibold transition hover:brightness-125 inline-block"
                :class="[
                  item.is_dir
                    ? (formatPermissions(item.permissions) === '0755'
                        ? 'bg-sky-950/70 text-sky-300 border border-sky-800/60'
                        : 'bg-amber-950/70 text-amber-300 border border-amber-800/60')
                    : (formatPermissions(item.permissions) === '0644'
                        ? 'bg-sky-950/70 text-sky-300 border border-sky-800/60'
                        : 'bg-slate-800 text-slate-300 border border-slate-700')
                ]"
                :title="`${formatPermString(item.permissions, item.is_dir)} (Klik untuk ubah Chmod)`"
              >
                {{ formatPermissions(item.permissions) }}
              </span>
            </div>
            <div class="col-span-2 text-right flex items-center justify-end space-x-1">
              <button
                v-if="!item.is_dir"
                @click.stop="openInEditor('left', item)"
                class="p-1 hover:bg-sky-950/60 text-slate-400 hover:text-sky-300 rounded text-[10px] transition"
                title="Buka / Edit di Tab"
              >
                👁️
              </button>
              <button
                @click.stop="renameItem('left', item)"
                class="p-1 hover:bg-[#252f44] text-slate-400 hover:text-white rounded text-[10px] transition"
                title="Ganti nama"
              >
                ✏️
              </button>
              <button
                @click.stop="deleteItem('left', item)"
                class="p-1 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded text-[10px] transition"
                title="Hapus"
              >
                🗑️
              </button>
              <button
                @click.stop="transferItemLeftToRight(item)"
                class="px-2 py-0.5 bg-sky-900/60 hover:bg-sky-700 text-sky-100 rounded text-[10px] transition shadow flex items-center space-x-1"
                :title="item.is_dir ? 'Transfer Folder ke Pane Kanan' : 'Transfer File ke Pane Kanan'"
              >
                <span>➡️</span>
              </button>
            </div>
          </div>

          <!-- Empty Directory Placeholder (Left) -->
          <div
            v-if="(leftPaneTarget === 'local' ? displayLocalFiles.length === 0 : displayLeftRemoteFiles.length === 0) && !loadingLocal && !loadingLeftRemote"
            @contextmenu.prevent="openContextMenu($event, 'left', null)"
            class="h-40 flex flex-col items-center justify-center space-y-1.5 text-slate-500 text-xs italic select-none"
          >
            <span>Folder kosong</span>
            <button
              v-if="sftpClipboard"
              @click="pasteClipboard('left')"
              class="text-[11px] text-sky-400 hover:text-sky-300 not-italic font-medium hover:underline flex items-center space-x-1"
            >
              <span>📥</span>
              <span>Tempel {{ sftpClipboard.items.length }} item di sini (Ctrl+V)</span>
            </button>
          </div>
        </div>

        <!-- Left Pane Footer Status Bar -->
        <div class="h-6 bg-[#0c0f17] border-t border-[#1e2535] px-3 flex items-center justify-between text-[10px] text-slate-400 font-mono shrink-0 select-none">
          <div class="flex items-center space-x-2">
            <span v-if="leftSelectionSummary" class="text-sky-300 font-semibold flex items-center space-x-1">
              <span>✓</span>
              <span>{{ leftSelectionSummary.count }} terpilih ({{ leftSelectionSummary.sizeFormatted }})</span>
            </span>
            <span v-else class="text-slate-400">
              {{ leftFolderSummary.count }} item ({{ leftFolderSummary.sizeFormatted }})
            </span>
          </div>
          <div class="flex items-center space-x-2 text-[9px] text-slate-500">
            <span class="hover:text-slate-300" title="Ctrl+C / Ctrl+X / Ctrl+V">Ctrl+C/X/V: Copy/Cut/Paste</span>
            <span>•</span>
            <span class="hover:text-slate-300">F5: Refresh</span>
            <span>•</span>
            <span class="hover:text-slate-300">F2: Rename</span>
            <span>•</span>
            <span class="hover:text-slate-300">Del: Hapus</span>
          </div>
        </div>
      </div>

      <!-- RIGHT PANE: REMOTE SERVER (SFTP) -->
      <div
        @click="focusedPane = 'right'"
        class="flex-1 flex flex-col bg-[#0b0e16] overflow-hidden transition-all duration-150"
        :class="focusedPane === 'right' ? 'ring-1 ring-emerald-500/25' : ''"
      >
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
                <option value="">-- Pilih Sesi / Target --</option>
                <option value="local">💻 Local Machine</option>
                <optgroup
                  v-if="activeTerminalTabs.length > 0"
                  label="🟢 Tab Sesi Aktif"
                >
                  <option
                    v-for="t in activeTerminalTabs"
                    :key="'r_active_' + t.id"
                    :value="t.sessionConfig.id || t.id"
                  >
                    ⚡ {{ t.title }} ({{ t.sessionConfig.username }}@{{ t.sessionConfig.host }})
                  </option>
                </optgroup>
                <optgroup
                  v-for="group in groupedSessions"
                  :key="'right_group_' + group.folderName"
                  :label="'📁 ' + group.folderName"
                >
                  <option
                    v-for="s in group.sessions"
                    :key="'r_' + s.id"
                    :value="s.id"
                  >
                    🌐 {{ s.name || s.username + '@' + s.host }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div class="flex items-center space-x-1.5 shrink-0">
              <!-- Sudo Mode Toggle -->
              <button
                v-if="rightPaneTarget && rightPaneTarget !== 'local'"
                @click="toggleRightSudo"
                :disabled="togglingRightSudo"
                :class="[
                  'px-2 py-0.5 rounded border text-[10px] font-medium transition flex items-center space-x-1 shrink-0',
                  isRightSudoActive
                    ? 'bg-rose-950 border-rose-500 text-rose-300 font-bold shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                    : 'bg-[#121622] border-[#2b354b] text-slate-400 hover:text-slate-200 hover:border-slate-500'
                ]"
                :title="isRightSudoActive ? 'Sudo SFTP Aktif (Root Privileges). Akses semua file server tanpa batasan izin. Klik untuk nonaktifkan.' : 'Jalankan SFTP dengan Sudo (Root) untuk akses file/folder yang dibatasi permission (memerlukan user memiliki NOPASSWD di /etc/sudoers)'"
              >
                <span>{{ isRightSudoActive ? '🛡️' : '🔒' }}</span>
                <span>{{ isRightSudoActive ? 'Root SFTP (ON)' : 'Sudo SFTP' }}</span>
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

            <!-- Right Remote Bookmarks -->
            <button
              v-for="bm in getActiveBookmarks(rightPaneTarget)"
              :key="'right_bm_' + bm"
              @click="setRemoteLocation(bm)"
              class="px-1.5 py-0.5 rounded border border-amber-800/60 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-mono shrink-0 flex items-center space-x-1"
              :title="bm"
            >
              <span>★</span>
              <span class="max-w-[70px] truncate">{{ bm }}</span>
              <span @click.stop="removeBookmark(rightPaneTarget, bm)" class="text-slate-500 hover:text-white ml-0.5">✕</span>
            </button>

            <button
              v-if="rightPaneTarget && rightPaneTarget !== 'local'"
              @click="addBookmark(rightPaneTarget, remotePathInput)"
              class="px-1.5 py-0.5 rounded border border-amber-900/40 bg-[#161a26] text-amber-400 hover:text-amber-200 text-[10px] shrink-0 flex items-center space-x-1"
              title="Bookmark direktori remote ini"
            >
              <span>+ ⭐</span>
            </button>
          </div>

          <div class="flex items-center space-x-1">
            <!-- Back, Forward, Up Buttons -->
            <button
              @click="navigateRemoteBack"
              :disabled="!rightPaneTarget || remoteHistoryIndex <= 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Kembali ke folder sebelumnya (Back - Alt+Left)"
            >
              <span>◀</span>
            </button>
            <button
              @click="navigateRemoteForward"
              :disabled="!rightPaneTarget || remoteHistoryIndex >= remoteHistory.length - 1"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Maju ke folder sesudahnya (Forward - Alt+Right)"
            >
              <span>▶</span>
            </button>
            <button
              @click="navigateRemoteUp"
              :disabled="!rightPaneTarget"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Ke folder di atasnya (Up)"
            >
              <span>⬆</span>
              <span>Up</span>
            </button>

            <!-- Toggle Hidden Files / Dotfiles Right -->
            <button
              @click="showHiddenFilesRight = !showHiddenFilesRight"
              :disabled="!rightPaneTarget"
              :class="[
                'px-2 py-1 rounded text-[11px] transition shrink-0 flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed',
                showHiddenFilesRight ? 'bg-[#202738] text-emerald-400' : 'bg-[#141824] text-slate-500 hover:text-slate-300'
              ]"
              :title="showHiddenFilesRight ? 'Sembunyikan dotfiles/file tersembunyi (Ctrl+H)' : 'Tampilkan dotfiles/file tersembunyi (Ctrl+H)'"
            >
              <span>{{ showHiddenFilesRight ? '👁️' : '👁️‍🗨️' }}</span>
            </button>

            <!-- New Folder & New File Buttons on Remote -->
            <button
              @click="promptNewFolder('right')"
              :disabled="!rightPaneTarget"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-emerald-300 hover:text-emerald-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              title="Buat folder baru di remote server"
            >
              <span>📁+</span>
            </button>
            <button
              @click="promptNewFile('right')"
              :disabled="!rightPaneTarget"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-sky-300 hover:text-sky-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              title="Buat file baru di remote server"
            >
              <span>📄+</span>
            </button>
            <button
              @click="cutSelectedItems('right')"
              :disabled="!rightPaneTarget || selectedRightPaths.size === 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-amber-300 hover:text-amber-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Potong file/folder terpilih (Ctrl+X)"
            >
              <span>✂️</span>
            </button>
            <button
              @click="copySelectedItems('right')"
              :disabled="!rightPaneTarget || selectedRightPaths.size === 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-sky-300 hover:text-sky-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Salin file/folder terpilih (Ctrl+C)"
            >
              <span>📋</span>
            </button>
            <button
              v-if="sftpClipboard && rightPaneTarget"
              @click="pasteClipboard('right')"
              class="px-2 py-1 bg-emerald-950/80 border border-emerald-700/80 hover:bg-emerald-900 text-emerald-200 rounded text-[11px] transition shrink-0 flex items-center space-x-1 font-semibold animate-pulse"
              title="Tempel file/folder ke direktori ini (Ctrl+V)"
            >
              <span>📥</span>
              <span>Tempel ({{ sftpClipboard.items.length }})</span>
            </button>

            <input
              v-model="remotePathInput"
              @keydown.enter="handleRemoteEnter"
              :disabled="!rightPaneTarget"
              type="text"
              class="flex-1 bg-[#090b10] border border-[#262f42] focus:border-sky-500 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="/var/www/..."
            />
            <button
              @click="handleRemoteEnter"
              :disabled="!rightPaneTarget"
              class="px-2.5 py-1 bg-[#202738] hover:bg-[#2c364d] rounded text-[10px] transition font-sans disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Buka
            </button>
            <button
              @click="refreshRemote"
              :disabled="!rightPaneTarget"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 hover:text-white rounded text-[11px] transition shrink-0 flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh folder remote saat ini"
            >
              <span>🔄</span>
            </button>
          </div>

          <!-- Secondary Filter & Selection Bar (Right Pane) -->
          <div class="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
            <div class="flex items-center space-x-1 flex-1 mr-2">
              <span class="text-slate-500">🔍</span>
              <input
                v-model="rightSearchQuery"
                :disabled="!rightPaneTarget"
                type="text"
                placeholder="Cari file/folder remote..."
                class="bg-[#090b10] border border-[#21293a] focus:border-emerald-500 rounded px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none w-40 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span v-if="rightSearchQuery" @click="rightSearchQuery = ''" class="cursor-pointer text-slate-500 hover:text-white">✕</span>
            </div>
            <div v-if="selectedRightPaths.size > 0" class="flex items-center space-x-1.5 shrink-0 bg-emerald-950/60 border border-emerald-800/60 rounded px-2 py-0.5">
              <span class="text-emerald-300 font-semibold">{{ selectedRightPaths.size }} terpilih <span v-if="rightSelectionSummary" class="text-[9px] text-emerald-400">({{ rightSelectionSummary.sizeFormatted }})</span></span>
              <button
                @click="cutSelectedItems('right')"
                class="text-amber-300 hover:text-amber-100 underline"
                title="Potong file/folder terpilih (Ctrl+X)"
              >
                Potong
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="copySelectedItems('right')"
                class="text-emerald-200 hover:text-white underline"
                title="Salin file/folder terpilih (Ctrl+C)"
              >
                Salin
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="transferSelectedRight"
                class="text-emerald-200 hover:text-white underline"
                :title="leftPaneTarget === 'local' ? 'Download semua terpilih ke lokal' : 'Transfer semua terpilih ke server kiri'"
              >
                {{ leftPaneTarget === 'local' ? 'Download' : 'Transfer' }}
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="deleteSelectedItems('right')"
                class="text-rose-400 hover:text-rose-300 underline"
                title="Hapus semua terpilih (Del)"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>

        <!-- Floating Clipboard Notification Bar (Right) -->
        <div
          v-if="sftpClipboard && rightPaneTarget"
          class="bg-sky-950/70 border-b border-sky-800/60 px-3 py-1 flex items-center justify-between text-xs text-sky-200 shrink-0"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <span>{{ sftpClipboard.mode === 'cut' ? '✂️' : '📋' }}</span>
            <span class="font-semibold text-white">{{ sftpClipboard.items.length }} item</span>
            <span class="text-sky-300/80 text-[11px] truncate">siap {{ sftpClipboard.mode === 'cut' ? 'dipindahkan' : 'disalin' }} dari {{ sftpClipboard.targetName }}</span>
          </div>
          <div class="flex items-center space-x-1.5 shrink-0">
            <button
              @click="pasteClipboard('right')"
              class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-[10px] transition shadow flex items-center space-x-1"
              title="Tempel ke folder aktif ini (Ctrl+V)"
            >
              <span>📥</span>
              <span>Tempel di Sini</span>
            </button>
            <button
              @click="clearSftpClipboard"
              class="text-slate-400 hover:text-white text-xs px-1"
              title="Batalkan Clipboard (Esc)"
            >
              ✕
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
          @contextmenu.self.prevent="openContextMenu($event, 'right', null)"
        >
          <!-- Table Header -->
          <div class="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#121520] border-b border-[#232a3b] text-[10px] text-slate-400 uppercase font-semibold sticky top-0 z-10 items-center select-none">
            <div class="col-span-6 flex items-center space-x-2">
              <input
                v-if="rightPaneTarget"
                type="checkbox"
                :checked="displayRemoteFiles.length > 0 && selectedRightPaths.size === displayRemoteFiles.length"
                @change="toggleSelectAllRight"
                class="rounded bg-[#090b10] border-[#2b364e] text-emerald-500 focus:ring-0 h-3 w-3 cursor-pointer"
                title="Pilih Semua"
              />
              <span @click="toggleRightSort('name')" class="cursor-pointer hover:text-white flex items-center space-x-1">
                <span>Filename</span>
                <span v-if="rightSortField === 'name'" class="text-emerald-400 font-bold">{{ rightSortOrder === 'asc' ? '▲' : '▼' }}</span>
              </span>
            </div>
            <div @click="toggleRightSort('size')" class="col-span-2 text-right cursor-pointer hover:text-white flex items-center justify-end space-x-1">
              <span>Size</span>
              <span v-if="rightSortField === 'size'" class="text-emerald-400 font-bold">{{ rightSortOrder === 'asc' ? '▲' : '▼' }}</span>
            </div>
            <div class="col-span-2 text-center">Perms</div>
            <div class="col-span-2 text-right">Action</div>
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

          <!-- State Jika Belum Ada Sesi yang Dipilih di Pane Kanan -->
          <div
            v-if="!rightPaneTarget"
            class="h-full flex flex-col items-center justify-center p-6 text-center space-y-4 bg-[#0d1017] overflow-y-auto"
          >
            <div class="text-4xl">🌐</div>
            <div class="max-w-xs space-y-1">
              <h3 class="text-xs font-semibold text-slate-200">Pilih Target Remote / Lokal</h3>
              <p class="text-[11px] text-slate-400">
                Pilih sesi server tujuan untuk mulai melihat direktori remote atau mentransfer file antar-sesi.
              </p>
            </div>

            <!-- Folders & Sessions Grid View -->
            <div class="w-full max-w-md space-y-3 text-left">
              <div
                v-for="group in groupedSessions"
                :key="'center_group_' + group.folderName"
                class="bg-[#121722] border border-[#232d42] rounded-lg p-2.5 space-y-2"
              >
                <div class="text-[11px] font-bold text-sky-400 flex items-center space-x-1.5 border-b border-[#1f283d] pb-1">
                  <span>📁</span>
                  <span>{{ group.folderName }}</span>
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    v-for="s in group.sessions"
                    :key="'quick_' + s.id"
                    @click="onRightTargetChange(s.id)"
                    class="px-2.5 py-1.5 bg-[#171e2c] hover:bg-sky-900/40 hover:border-sky-500 border border-[#263147] text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1.5 truncate"
                  >
                    <span>🌐</span>
                    <span class="truncate">{{ s.name || s.username + '@' + s.host }}</span>
                  </button>
                </div>
              </div>

              <div v-if="groupedSessions.length === 0" class="text-center text-[11px] text-slate-500 italic">
                Belum ada sesi server tersimpan di vault.
              </div>
            </div>
          </div>

          <!-- Loading State with Spinner Animation -->
          <div v-else-if="loadingRemote" class="h-48 flex flex-col items-center justify-center space-y-2 text-slate-400 text-xs">
            <svg class="animate-spin h-6 w-6 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Menghubungkan & memuat direktori remote...</span>
          </div>

          <div
            v-else
            v-for="file in displayRemoteFiles"
            :key="file.path"
            draggable="true"
            @dragstart="onRemoteDragStart($event, file)"
            @dragover="file.is_dir ? onFolderDragOver($event, file.path) : null"
            @dragleave="file.is_dir ? onFolderDragLeave(file.path) : null"
            @drop="file.is_dir ? onFolderDrop('right', file) : null"
            @dblclick="handleRemoteDblClick(file)"
            @click="selectedRemotePath = file.path"
            @contextmenu.prevent="openContextMenu($event, 'right', file)"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              dragOverFolderPath === file.path ? 'bg-emerald-900/60 ring-2 ring-emerald-400 font-semibold' : '',
              isItemCut(file.path) ? 'opacity-40 italic' : '',
              selectedRightPaths.has(file.path) ? 'bg-emerald-950/60 text-emerald-100' : selectedRemotePath === file.path ? 'bg-sky-950/40 text-sky-200' : 'text-slate-300'
            ]"
          >
            <div class="col-span-6 flex items-center space-x-2 truncate">
              <input
                type="checkbox"
                :checked="selectedRightPaths.has(file.path)"
                @click.stop="toggleSelectRight(file.path)"
                class="rounded bg-[#090b10] border-[#2b364e] text-emerald-500 focus:ring-0 h-3 w-3 cursor-pointer shrink-0"
              />
              <span class="shrink-0">{{ file.is_dir ? '📁' : '📄' }}</span>
              <span class="truncate" :title="file.name">{{ file.name }}</span>
            </div>
            <div
              @click.stop="file.is_dir ? calculateFolderSize('right', file) : null"
              :class="[
                'col-span-2 text-right text-[10px] font-mono',
                file.is_dir ? 'text-emerald-400/80 hover:text-emerald-200 cursor-pointer hover:underline' : 'text-slate-400'
              ]"
              :title="file.is_dir ? 'Klik untuk menghitung total ukuran folder' : undefined"
            >
              {{ file.is_dir ? (calculatingFolderSizes.has(file.path) ? '⏳...' : (folderSizes[file.path] || '<DIR>')) : formatSize(file.size) }}
            </div>
            <div class="col-span-2 text-center text-[10px] font-mono">
              <span
                @click.stop="openChmodModal('right', file)"
                class="cursor-pointer px-1.5 py-0.5 rounded text-[9px] font-semibold transition hover:brightness-125 inline-block"
                :class="[
                  file.is_dir
                    ? (formatPermissions(file.permissions) === '0755'
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                        : 'bg-amber-950/70 text-amber-300 border border-amber-800/60')
                    : (formatPermissions(file.permissions) === '0644'
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                        : 'bg-slate-800 text-slate-300 border border-slate-700')
                ]"
                :title="`${formatPermString(file.permissions, file.is_dir)} (Klik untuk ubah Chmod)`"
              >
                {{ formatPermissions(file.permissions) }}
              </span>
            </div>
            <div class="col-span-2 text-right flex items-center justify-end space-x-1">
              <button
                v-if="!file.is_dir"
                @click.stop="openInEditor('right', file)"
                class="p-1 hover:bg-emerald-950/60 text-slate-400 hover:text-emerald-300 rounded text-[10px] transition"
                title="Buka / Edit di Tab"
              >
                👁️
              </button>
              <button
                @click.stop="renameItem('right', file)"
                class="p-1 hover:bg-[#252f44] text-slate-400 hover:text-white rounded text-[10px] transition"
                title="Ganti nama"
              >
                ✏️
              </button>
              <button
                @click.stop="deleteItem('right', file)"
                class="p-1 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded text-[10px] transition"
                title="Hapus"
              >
                🗑️
              </button>
              <button
                @click.stop="transferItemRightToLeft(file)"
                class="px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-700 text-emerald-100 rounded text-[10px] transition shadow flex items-center space-x-1"
                :title="leftPaneTarget === 'local' ? (file.is_dir ? 'Download Folder ke Komputer Ini' : 'Download File ke Komputer Ini') : (file.is_dir ? 'Transfer Folder ke Server Kiri' : 'Transfer File ke Server Kiri')"
              >
                <span>⬅️</span>
              </button>
            </div>
          </div>

          <!-- Empty Directory Placeholder (Right) -->
          <div
            v-if="rightPaneTarget && displayRemoteFiles.length === 0 && !loadingRemote"
            @contextmenu.prevent="openContextMenu($event, 'right', null)"
            class="h-40 flex flex-col items-center justify-center space-y-1.5 text-slate-500 text-xs italic select-none"
          >
            <span>Folder kosong</span>
            <button
              v-if="sftpClipboard"
              @click="pasteClipboard('right')"
              class="text-[11px] text-emerald-400 hover:text-emerald-300 not-italic font-medium hover:underline flex items-center space-x-1"
            >
              <span>📥</span>
              <span>Tempel {{ sftpClipboard.items.length }} item di sini (Ctrl+V)</span>
            </button>
          </div>
        </div>

        <!-- Right Pane Footer Status Bar -->
        <div class="h-6 bg-[#0c0f17] border-t border-[#1e2535] px-3 flex items-center justify-between text-[10px] text-slate-400 font-mono shrink-0 select-none">
          <div class="flex items-center space-x-2">
            <span v-if="rightSelectionSummary" class="text-emerald-300 font-semibold flex items-center space-x-1">
              <span>✓</span>
              <span>{{ rightSelectionSummary.count }} terpilih ({{ rightSelectionSummary.sizeFormatted }})</span>
            </span>
            <span v-else class="text-slate-400">
              {{ rightFolderSummary.count }} item ({{ rightFolderSummary.sizeFormatted }})
            </span>
          </div>
          <div class="flex items-center space-x-2 text-[9px] text-slate-500">
            <span class="hover:text-slate-300" title="Ctrl+C / Ctrl+X / Ctrl+V">Ctrl+C/X/V: Copy/Cut/Paste</span>
            <span>•</span>
            <span class="hover:text-slate-300">F5: Refresh</span>
            <span>•</span>
            <span class="hover:text-slate-300">F2: Rename</span>
            <span>•</span>
            <span class="hover:text-slate-300">Del: Hapus</span>
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
            <!-- Tab 1: Proses (Aktif) -->
            <button
              @click="queueTab = 'active'"
              :class="[
                'min-w-[95px] px-2 text-[11px] font-semibold border-b-2 flex items-center justify-between transition',
                queueTab === 'active'
                  ? 'border-sky-500 text-sky-400 bg-sky-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span class="flex items-center space-x-1">
                <span>⚡</span>
                <span>Proses</span>
              </span>
              <span
                :class="[
                  'px-1.5 py-0.2 rounded-full text-[9px] font-mono min-w-[18px] text-center transition-colors',
                  sessionActiveTransfers.length > 0
                    ? 'bg-sky-500/20 text-sky-300 font-bold'
                    : 'bg-slate-800/40 text-slate-500'
                ]"
              >
                {{ sessionActiveTransfers.length }}
              </span>
            </button>

            <!-- Tab 2: Antrean (Pending) -->
            <button
              @click="queueTab = 'pending'"
              :class="[
                'min-w-[95px] px-2 text-[11px] font-semibold border-b-2 flex items-center justify-between transition',
                queueTab === 'pending'
                  ? 'border-amber-500 text-amber-400 bg-amber-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span class="flex items-center space-x-1">
                <span>⏳</span>
                <span>Antrean</span>
              </span>
              <span
                :class="[
                  'px-1.5 py-0.2 rounded-full text-[9px] font-mono min-w-[18px] text-center transition-colors',
                  sessionPendingTransfers.length > 0
                    ? 'bg-amber-500/20 text-amber-300 font-bold'
                    : 'bg-slate-800/40 text-slate-500'
                ]"
              >
                {{ sessionPendingTransfers.length }}
              </span>
            </button>

            <!-- Tab 3: Sukses -->
            <button
              @click="queueTab = 'completed'"
              :class="[
                'min-w-[95px] px-2 text-[11px] font-semibold border-b-2 flex items-center justify-between transition',
                queueTab === 'completed'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span class="flex items-center space-x-1">
                <span>✓</span>
                <span>Sukses</span>
              </span>
              <span
                :class="[
                  'px-1.5 py-0.2 rounded-full text-[9px] font-mono min-w-[18px] text-center transition-colors',
                  sessionCompletedTransfers.length > 0
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'bg-slate-800/40 text-slate-500'
                ]"
              >
                {{ sessionCompletedTransfers.length }}
              </span>
            </button>

            <!-- Tab 4: Gagal / Terputus -->
            <button
              @click="queueTab = 'failed'"
              :class="[
                'min-w-[95px] px-2 text-[11px] font-semibold border-b-2 flex items-center justify-between transition',
                queueTab === 'failed'
                  ? 'border-rose-500 text-rose-400 bg-rose-950/30'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              ]"
            >
              <span class="flex items-center space-x-1">
                <span>⚠️</span>
                <span>Gagal</span>
              </span>
              <span
                :class="[
                  'px-1.5 py-0.2 rounded-full text-[9px] font-mono min-w-[18px] text-center transition-colors',
                  sessionFailedTransfers.length > 0
                    ? 'bg-rose-500/20 text-rose-300 font-bold'
                    : 'bg-slate-800/40 text-slate-500'
                ]"
              >
                {{ sessionFailedTransfers.length }}
              </span>
            </button>
          </div>
        </div>

        <div class="flex items-center space-x-3">
          <!-- Concurrency Setting Selector: khusus di tab Proses (active) -->
          <div v-show="!isQueueCollapsed && queueTab === 'active'" class="flex items-center space-x-1.5 text-[10px] text-slate-400 bg-[#0f131d] px-2 py-0.5 rounded border border-[#232b3d]">
            <span>⚡ Paralel:</span>
            <select
              :value="queueStore.maxConcurrent"
              @change="queueStore.setMaxConcurrent(Number(($event.target as HTMLSelectElement).value))"
              class="bg-transparent text-sky-400 font-semibold font-mono text-[10px] focus:outline-none cursor-pointer"
              title="Batas file yang ditransfer sekaligus (5, 10, 15, 20 worker simultan)"
            >
              <option v-for="n in [5, 10, 15, 20]" :key="n" :value="n" class="bg-[#121520] text-slate-200">{{ n }} file</option>
            </select>
          </div>

          <!-- Overall Speed & ETA Indicator (Expanded) -->
          <div
            v-if="!isQueueCollapsed && (sessionActiveTransfers.length > 0 || sessionPendingTransfers.length > 0) && queueStore.totalSpeedBps > 0"
            class="flex items-center space-x-2 text-[10px] font-mono bg-sky-950/60 border border-sky-800/60 rounded px-2 py-0.5 text-sky-200"
            title="Total kecepatan dan sisa waktu estimasi transfer antrean"
          >
            <span class="text-sky-400 font-bold">⚡ {{ formatSpeed(queueStore.totalSpeedBps) }}</span>
            <span v-if="queueStore.overallEta" class="text-slate-400">· ETA {{ queueStore.overallEta }}</span>
          </div>

          <!-- Quick Status info when collapsed -->
          <div v-if="isQueueCollapsed" class="flex items-center space-x-3 text-[10px] text-slate-400 mr-2">
            <span v-if="sessionActiveTransfers.length > 0" class="text-sky-400 flex items-center space-x-1.5 font-mono">
              <span>⚡</span>
              <span class="font-bold">{{ sessionActiveTransfers.length }} aktif</span>
              <span v-if="queueStore.totalSpeedBps > 0" class="text-sky-300">({{ formatSpeed(queueStore.totalSpeedBps) }})</span>
              <span v-if="queueStore.overallEta" class="text-slate-400">· ETA {{ queueStore.overallEta }}</span>
            </span>
            <span v-if="sessionPendingTransfers.length > 0" class="text-amber-400 flex items-center space-x-1">
              <span>⏳</span>
              <span>{{ sessionPendingTransfers.length }} antre</span>
            </span>
            <span v-if="sessionCompletedTransfers.length > 0" class="text-emerald-400 flex items-center space-x-1">
              <span>✓</span>
              <span>{{ sessionCompletedTransfers.length }} selesai</span>
            </span>
            <span v-if="sessionFailedTransfers.length > 0" class="text-rose-400 flex items-center space-x-1">
              <span>⚠️</span>
              <span>{{ sessionFailedTransfers.length }} gagal</span>
            </span>
          </div>

          <button
            v-show="!isQueueCollapsed"
            @click="tauriBridge.openLogFile()"
            class="text-[10px] text-sky-400 hover:text-sky-200 bg-[#162033] border border-sky-900/50 px-2 py-0.5 rounded transition flex items-center space-x-1"
            title="Buka file log transfer BOBA (%APPDATA%\boba\boba.log)"
          >
            <span>📄</span>
            <span>File Log</span>
          </button>

          <!-- Tombol Batalkan Semua saat di tab Proses/Antrean dan ada transfer berjalan -->
          <button
            v-if="!isQueueCollapsed && (queueTab === 'active' || queueTab === 'pending') && (sessionActiveTransfers.length > 0 || sessionPendingTransfers.length > 0)"
            @click="queueStore.cancelAll()"
            class="text-[10px] text-rose-300 hover:text-rose-100 bg-rose-950/70 border border-rose-800 px-2 py-0.5 rounded transition flex items-center space-x-1 font-semibold"
            title="Hentikan dan batalkan semua transfer aktif dan antrean seketika"
          >
            <span>🛑</span>
            <span>Batalkan Semua</span>
          </button>

          <!-- Bersihkan Selesai: khusus di tab Sukses (completed) -->
          <button
            v-if="!isQueueCollapsed && queueTab === 'completed' && sessionCompletedTransfers.length > 0"
            @click="queueStore.clearCompleted"
            class="text-[10px] text-emerald-300 hover:text-emerald-100 bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-0.5 rounded transition flex items-center space-x-1 font-medium"
            title="Hapus riwayat file yang sukses ditransfer"
          >
            <span>✓</span>
            <span>Bersihkan Selesai</span>
          </button>

          <!-- Bersihkan file Gagal / Dibatalkan: khusus di tab Gagal (failed) -->
          <button
            v-if="!isQueueCollapsed && queueTab === 'failed' && sessionFailedTransfers.length > 0"
            @click="queueStore.clearCancelledAndFailed()"
            class="text-[10px] text-rose-300 hover:text-rose-100 bg-rose-950/40 border border-rose-900/50 px-2 py-0.5 rounded transition font-medium"
            title="Hapus riwayat file yang gagal/dibatalkan"
          >
            Bersihkan Gagal
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
          <span v-if="queueTab === 'active'">Tidak ada transfer yang sedang aktif berjalan.</span>
          <span v-else-if="queueTab === 'pending'">Tidak ada file dalam antrean.</span>
          <span v-else-if="queueTab === 'completed'">Belum ada transfer yang selesai.</span>
          <span v-else>Tidak ada transfer yang gagal atau terputus.</span>
        </div>

        <!-- Lightweight Pending Queue View (Fast render without animation) -->
        <template v-if="queueTab === 'pending'">
          <div
            v-for="item in sessionPendingTransfers.slice(0, 150)"
            :key="item.id"
            class="bg-[#121622] border border-[#1f2636] rounded px-3 py-1.5 text-xs flex items-center justify-between space-x-3 hover:bg-[#161b2a] transition"
          >
            <div class="flex items-center space-x-2 truncate flex-1 min-w-0">
              <span class="text-amber-400 text-xs shrink-0">⏳</span>
              <span class="text-slate-200 font-mono text-[11px] truncate" :title="item.remotePath">
                {{ item.fileName }}
              </span>
              <span class="text-[10px] text-slate-400 font-sans truncate shrink-0">
                ({{ getTransferItemLabel(item) }})
              </span>
            </div>
            <div class="flex items-center space-x-3 shrink-0">
              <span class="text-[10px] text-slate-400 font-mono">
                {{ formatSize(item.totalBytes) }}
              </span>
              <span class="text-[10px] text-amber-300/80 italic font-sans">
                Menunggu giliran
              </span>
              <button
                @click="queueStore.cancelTransfer(item.id)"
                class="text-rose-400 hover:text-rose-300 text-[10px] px-2 py-0.5 rounded bg-rose-950/40 border border-rose-900/50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
          <div
            v-if="sessionPendingTransfers.length > 150"
            class="text-center py-2 text-[11px] text-slate-500 italic bg-[#0f121a] rounded border border-dashed border-[#232b3d]"
          >
            ...dan {{ sessionPendingTransfers.length - 150 }} file lainnya dalam antrean menunggu giliran.
          </div>
        </template>

        <!-- Lightweight Completed Queue View (Limited to top 100 to keep UI ultra responsive) -->
        <template v-else-if="queueTab === 'completed'">
          <div
            v-for="item in sessionCompletedTransfers.slice(0, 100)"
            :key="item.id"
            class="bg-[#121824] border border-[#1d2638] rounded px-3 py-1.5 text-xs flex items-center justify-between space-x-3 hover:bg-[#161f30] transition"
          >
            <div class="flex items-center space-x-2 truncate flex-1 min-w-0">
              <span class="text-emerald-400 text-xs shrink-0 font-bold">✓</span>
              <span class="text-slate-200 font-mono text-[11px] truncate" :title="item.remotePath">
                {{ item.fileName }}
              </span>
              <span class="text-[10px] text-slate-400 font-sans truncate shrink-0">
                ({{ getTransferItemLabel(item) }})
              </span>
            </div>
            <div class="flex items-center space-x-3 shrink-0">
              <span class="text-[10px] text-slate-400 font-mono">
                {{ formatSize(item.totalBytes) }}
              </span>
              <span class="text-[10px] text-emerald-400/90 font-mono">
                100% Selesai
              </span>
              <button
                @click="queueStore.removeTransfer(item.id)"
                class="text-slate-500 hover:text-rose-400 text-xs px-1 transition"
                title="Hapus dari riwayat"
              >
                ✕
              </button>
            </div>
          </div>
          <div
            v-if="sessionCompletedTransfers.length > 100"
            class="text-center py-2 text-[11px] text-slate-500 italic bg-[#0f121a] rounded border border-dashed border-[#232b3d]"
          >
            Menampilkan 100 transfer terbaru dari total {{ sessionCompletedTransfers.length }} file yang berhasil ditransfer.
          </div>
        </template>

        <!-- Rich Active or Failed Transfer View -->
        <template v-else>
          <div
            v-for="item in currentQueueItems"
            :key="item.id"
            class="bg-[#151926] border border-[#232a3b] rounded-lg p-2 text-xs flex items-center justify-between space-x-3"
          >
            <!-- Left: Direction Icon & File Name -->
            <div class="flex items-center space-x-2 truncate flex-1 min-w-0">
              <span class="shrink-0">{{ item.direction === 'upload' ? '⬆️' : item.direction === 'compress' ? '📦' : item.direction === 'extract' ? '📂' : item.direction === 'remote-to-remote' ? '🔄' : '⬇️' }}</span>
              <div class="flex flex-col min-w-0 truncate">
                <div class="flex items-center space-x-1.5 truncate">
                  <span class="text-slate-200 font-semibold truncate max-w-xs" :title="item.remotePath">
                    {{ item.fileName }}
                  </span>
                  <span class="text-[10px] text-slate-400 truncate hidden sm:inline shrink-0">
                    ({{ getTransferItemLabel(item) }})
                  </span>
                </div>
                <span v-if="item.errorMessage" class="text-[10px] text-rose-400 font-mono truncate max-w-sm" :title="item.errorMessage">
                  ⚠️ {{ item.errorMessage }}
                </span>
              </div>
            </div>

          <!-- Middle: Progress Bar & Transfer Stats -->
          <div class="w-64 shrink-0 space-y-1">
            <div class="flex justify-between text-[10px] text-slate-400">
              <template v-if="item.direction === 'compress' || item.direction === 'extract'">
                <span class="text-amber-300 font-mono">{{ item.status === 'completed' ? '✓ Selesai di server' : item.status === 'error' ? '⚠️ Gagal' : 'Sedang diproses di server...' }}</span>
                <span>{{ item.status === 'completed' ? '100%' : '⏳' }}</span>
              </template>
              <template v-else>
                <div class="flex items-center space-x-1.5 truncate">
                  <span>{{ formatSize(item.bytesTransferred) }} / {{ formatSize(item.totalBytes) }}</span>
                  <span v-if="calculateEta(item)" class="text-slate-400 font-mono text-[9px]">• ETA {{ calculateEta(item) }}</span>
                </div>
                <span>{{ Math.round(item.percentage) }}% ({{ formatSpeed(item.speedBps) }})</span>
              </template>
            </div>
            <div class="w-full bg-[#0b0e16] rounded-full h-1.5 overflow-hidden">
              <div
                :class="[
                  'h-full transition-all duration-150',
                  item.status === 'completed'
                    ? 'bg-emerald-400'
                    : item.status === 'error' || item.status === 'cancelled'
                    ? 'bg-rose-500'
                    : item.direction === 'compress' || item.direction === 'extract'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-sky-400'
                ]"
                :style="{ width: item.status === 'completed' ? '100%' : (item.direction === 'compress' || item.direction === 'extract' ? '100%' : `${item.percentage}%`) }"
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
        </template>
      </div>
    </div>

    <!-- Context Menu Floating Overlay -->
    <div
      v-if="contextMenu.visible && contextMenu.item"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      class="fixed z-50 bg-[#161a26] border border-[#2b354b] shadow-2xl rounded py-1 w-52 text-[11px] text-slate-200 select-none"
      @click.stop
    >
      <div class="px-2.5 py-1 text-[10px] text-slate-400 font-semibold truncate border-b border-[#232b3d] mb-0.5">
        {{ contextMenuSelectionCount > 1 ? `${contextMenuSelectionCount} item terpilih` : contextMenu.item.name }}
      </div>

      <button
        v-if="!contextMenu.item.is_dir && contextMenuSelectionCount <= 1"
        @click="openInEditor(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>👁️</span>
        <span>Edit di Tab</span>
      </button>

      <!-- Analisis File dengan AI Copilot -->
      <button
        v-if="!contextMenu.item.is_dir && contextMenuSelectionCount <= 1"
        @click="askAiAboutFile(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-purple-600/30 text-purple-300 hover:text-purple-200 flex items-center space-x-2 transition font-medium"
        title="Minta AI Copilot menganalisis dan menjelaskan isi file ini"
      >
        <span>✨</span>
        <span>Analisis dengan AI Copilot</span>
      </button>

      <button
        v-if="contextMenu.item.is_dir && contextMenuSelectionCount <= 1"
        @click="contextMenu.side === 'left' ? (leftPaneTarget === 'local' ? navigateToLocalPath(contextMenu.item.path) : navigateToLeftRemotePath(contextMenu.item.path)) : navigateToRemotePath(contextMenu.item.path); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📁</span>
        <span>Buka Folder</span>
      </button>

      <!-- Hitung Ukuran Folder (jika direktori) -->
      <button
        v-if="contextMenu.item.is_dir && contextMenuSelectionCount <= 1"
        @click="calculateFolderSize(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center justify-between transition"
      >
        <div class="flex items-center space-x-2">
          <span>📊</span>
          <span>Hitung Ukuran Folder</span>
        </div>
        <span class="text-[9px] text-sky-400 font-mono">{{ folderSizes[contextMenu.item.path] || '' }}</span>
      </button>

      <button
        @click="contextMenuSelectionCount > 1 ? (contextMenu.side === 'left' ? transferSelectedLeft() : transferSelectedRight()) : (contextMenu.side === 'left' ? transferItemLeftToRight(contextMenu.item!) : transferItemRightToLeft(contextMenu.item! as RemoteFileItem)); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center justify-between transition"
      >
        <div class="flex items-center space-x-2">
          <span>{{ contextMenu.side === 'left' ? '➡️' : '⬅️' }}</span>
          <span>{{ contextMenuSelectionCount > 1 ? `Transfer ${contextMenuSelectionCount} Item` : (contextMenu.side === 'left' ? (rightPaneTarget === 'local' ? 'Download ke Lokal' : 'Transfer ke Pane Kanan') : (leftPaneTarget === 'local' ? 'Download ke Lokal' : 'Transfer ke Server Kiri')) }}</span>
        </div>
      </button>

      <button
        @click="copyPath(contextMenu.item.path); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📋</span>
        <span>Salin Path Lengkap</span>
      </button>

      <div class="h-px bg-[#232b3d] my-1"></div>

      <!-- Cut, Copy, Paste Actions (Multi-select aware) -->
      <button
        @click="cutSelectedItems(contextMenu.side, contextMenuSelectionCount > 1 ? undefined : contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center justify-between transition"
      >
        <div class="flex items-center space-x-2">
          <span>✂️</span>
          <span>{{ contextMenuSelectionCount > 1 ? `Potong ${contextMenuSelectionCount} Item` : 'Potong (Cut)' }}</span>
        </div>
        <span class="text-[9px] text-slate-500 font-mono">Ctrl+X</span>
      </button>

      <button
        @click="copySelectedItems(contextMenu.side, contextMenuSelectionCount > 1 ? undefined : contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center justify-between transition"
      >
        <div class="flex items-center space-x-2">
          <span>📋</span>
          <span>{{ contextMenuSelectionCount > 1 ? `Salin ${contextMenuSelectionCount} Item` : 'Salin (Copy)' }}</span>
        </div>
        <span class="text-[9px] text-slate-500 font-mono">Ctrl+C</span>
      </button>

      <button
        v-if="contextMenu.item.is_dir && sftpClipboard"
        @click="pasteClipboard(contextMenu.side, contextMenu.item!.path); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 flex items-center justify-between transition font-medium"
      >
        <div class="flex items-center space-x-2">
          <span>📥</span>
          <span>Tempel ke Folder Ini</span>
        </div>
        <span class="text-[9px] text-emerald-400/80 font-mono">{{ sftpClipboard.items.length }} item</span>
      </button>

      <!-- Remote specific actions: Chmod, Compress, Extract -->
      <template v-if="isContextMenuRemote">
        <div class="h-px bg-[#232b3d] my-1"></div>

        <button
          @click="openChmodModal(contextMenu.side, contextMenu.item as RemoteFileItem); closeContextMenu()"
          class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
        >
          <span>🔒</span>
          <span>Hak Akses (Chmod)</span>
        </button>

        <button
          @click="fixWebPermissions(contextMenu.side, contextMenu.item as RemoteFileItem); closeContextMenu()"
          class="w-full text-left px-2.5 py-1.5 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 flex items-center space-x-2 transition"
          title="Terapkan chmod 755 (folder) & 644 (file) untuk mencegah error 403 Forbidden"
        >
          <span>🛡️</span>
          <span>Perbaiki Izin Web (755/644)</span>
        </button>

        <button
          v-if="isArchiveFile(contextMenu.item.name)"
          @click="extractRemoteArchive(contextMenu.side, contextMenu.item as RemoteFileItem); closeContextMenu()"
          class="w-full text-left px-2.5 py-1.5 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 flex items-center space-x-2 transition"
        >
          <span>📦</span>
          <span>Ekstrak Arsip di Sini</span>
        </button>

        <button
          @click="compressRemoteItem(contextMenu.side, contextMenu.item as RemoteFileItem); closeContextMenu()"
          class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
        >
          <span>🗜️</span>
          <span>Kompres (.tar.gz)</span>
        </button>
      </template>

      <div class="h-px bg-[#232b3d] my-1"></div>

      <button
        v-if="contextMenuSelectionCount <= 1"
        @click="duplicateItem(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📋</span>
        <span>Duplikat / Salin File</span>
      </button>

      <button
        v-if="contextMenuSelectionCount <= 1"
        @click="renameItem(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>✏️</span>
        <span>Ganti Nama (F2)</span>
      </button>

      <button
        @click="contextMenuSelectionCount > 1 ? deleteSelectedItems(contextMenu.side) : deleteItem(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-rose-600/30 text-rose-300 hover:text-rose-200 flex items-center justify-between transition"
      >
        <div class="flex items-center space-x-2">
          <span>🗑️</span>
          <span>{{ contextMenuSelectionCount > 1 ? `Hapus ${contextMenuSelectionCount} Item` : 'Hapus' }}</span>
        </div>
        <span class="text-[9px] text-rose-400/70 font-mono">Del</span>
      </button>
    </div>

    <!-- Context Menu: Pane Background / Empty Area -->
    <div
      v-if="contextMenu.visible && !contextMenu.item"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      class="fixed z-50 bg-[#161a26] border border-[#2b354b] shadow-2xl rounded py-1 w-52 text-[11px] text-slate-200 select-none animate-in fade-in duration-75"
      @click.stop
    >
      <button
        v-if="sftpClipboard"
        @click="pasteClipboard(contextMenu.side); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 flex items-center justify-between transition font-medium"
      >
        <div class="flex items-center space-x-2">
          <span>📥</span>
          <span>Tempel di Sini (Paste)</span>
        </div>
        <span class="text-[9px] text-emerald-400 font-mono">Ctrl+V</span>
      </button>

      <button
        @click="promptNewFolder(contextMenu.side); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📁</span>
        <span>Folder Baru</span>
      </button>

      <button
        @click="promptNewFile(contextMenu.side); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📄</span>
        <span>File Baru</span>
      </button>

      <div class="h-px bg-[#232b3d] my-1"></div>

      <button
        @click="contextMenu.side === 'left' ? (leftPaneTarget === 'local' ? fetchLocalFiles() : fetchLeftRemoteFiles()) : fetchRemoteFiles(); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center justify-between transition"
      >
        <div class="flex items-center space-x-2">
          <span>🔄</span>
          <span>Segarkan (Refresh)</span>
        </div>
        <span class="text-[9px] text-slate-500 font-mono">F5</span>
      </button>
    </div>

    <!-- Chmod Modal Dialog -->
    <div
      v-if="chmodModal.visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      @click.self="chmodModal.visible = false"
    >
      <div class="bg-[#161a26] border border-[#2b354b] shadow-2xl rounded-lg w-80 text-[11px] text-slate-200 overflow-hidden font-sans">
        <div class="px-4 py-2.5 bg-[#121520] border-b border-[#232b3d] flex items-center justify-between font-semibold text-slate-200">
          <div class="flex items-center space-x-1.5">
            <span>🔒</span>
            <span>Ubah Hak Akses (Permissions)</span>
          </div>
          <button @click="chmodModal.visible = false" class="text-slate-500 hover:text-white">✕</button>
        </div>

        <div class="p-4 space-y-3 font-mono text-xs">
          <div class="text-[11px] text-slate-400 truncate">
            Target: <span class="text-sky-300 font-semibold">{{ chmodModal.item?.name }}</span>
          </div>

          <!-- Permission Matrix (Owner, Group, Others) -->
          <div class="grid grid-cols-3 gap-2 bg-[#0e121c] p-2.5 rounded border border-[#212a3d] text-center text-[10px]">
            <div class="space-y-1.5">
              <span class="font-bold text-slate-300">Owner</span>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.uR" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Read</span>
              </label>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.uW" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Write</span>
              </label>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.uX" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Exec</span>
              </label>
            </div>

            <div class="space-y-1.5">
              <span class="font-bold text-slate-300">Group</span>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.gR" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Read</span>
              </label>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.gW" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Write</span>
              </label>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.gX" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Exec</span>
              </label>
            </div>

            <div class="space-y-1.5">
              <span class="font-bold text-slate-300">Others</span>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.oR" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Read</span>
              </label>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.oW" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Write</span>
              </label>
              <label class="flex items-center justify-center space-x-1 cursor-pointer">
                <input type="checkbox" v-model="chmodModal.oX" @change="updateOctalFromBits" class="rounded bg-[#161a26] text-sky-500" />
                <span>Exec</span>
              </label>
            </div>
          </div>

          <div class="flex items-center justify-between text-xs pt-1">
            <span class="text-slate-400">Octal:</span>
            <input
              v-model="chmodModal.octal"
              @input="setChmodFromOctal(chmodModal.octal)"
              type="text"
              maxlength="4"
              class="w-20 bg-[#090b10] border border-[#2b354b] rounded px-2 py-1 text-center font-mono text-sky-300 font-bold focus:outline-none focus:border-sky-500"
            />
          </div>

          <label v-if="chmodModal.item?.is_dir" class="flex items-center space-x-2 text-[11px] text-slate-400 cursor-pointer select-none">
            <input type="checkbox" v-model="chmodModal.recursive" class="rounded bg-[#090b10] border-[#2b354b] text-sky-500" />
            <span>Terapkan rekursif ke subfolder & file (-R)</span>
          </label>
        </div>

        <div class="px-4 py-2 bg-[#121520] border-t border-[#232b3d] flex items-center justify-end space-x-2">
          <button
            @click="chmodModal.visible = false"
            class="px-3 py-1 bg-[#1e2536] hover:bg-[#283248] text-slate-300 rounded text-xs transition"
          >
            Batal
          </button>
          <button
            @click="applyChmod"
            class="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded text-xs transition shadow"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, useTemplateRef } from 'vue';
import type { ActiveTab, LocalFileItem, RemoteFileItem } from '../types/index.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { useTransferQueueStore } from '../stores/transferQueueStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { useAiAgentStore } from '../stores/aiAgentStore.js';

const props = defineProps<{ tab: ActiveTab }>();

const queueStore = useTransferQueueStore();
const sessionStore = useSessionStore();
const vaultStore = useVaultStore();
const dialogStore = useDialogStore();
const aiStore = useAiAgentStore();

// Local Files State & History
const localPathInput = ref('');
const localFiles = ref<LocalFileItem[]>([]);
const localDrives = ref<{ name: string; path: string }[]>([]);
const selectedLocalPath = ref<string | null>(null);
const loadingLocal = ref(false);
const localHistory = ref<string[]>([]);
const localHistoryIndex = ref(-1);
const hideLocalSystemFiles = ref(true);

// Search / Filter inputs
const leftSearchQuery = ref('');
const rightSearchQuery = ref('');

// Toggle hidden files / dotfiles (Ctrl+H)
const showHiddenFilesLeft = ref(true);
const showHiddenFilesRight = ref(true);

// Calculated folder sizes (path -> formatted string)
const folderSizes = ref<Record<string, string>>({});
const calculatingFolderSizes = ref<Set<string>>(new Set());

// Multi-selection states (Set of paths)
const selectedLeftPaths = ref<Set<string>>(new Set());
const selectedRightPaths = ref<Set<string>>(new Set());

// Sort states
const leftSortField = ref<'name' | 'size'>('name');
const leftSortOrder = ref<'asc' | 'desc'>('asc');
const rightSortField = ref<'name' | 'size'>('name');
const rightSortOrder = ref<'asc' | 'desc'>('asc');

function toggleLeftSort(field: 'name' | 'size') {
  if (leftSortField.value === field) {
    leftSortOrder.value = leftSortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    leftSortField.value = field;
    leftSortOrder.value = 'asc';
  }
}

function toggleRightSort(field: 'name' | 'size') {
  if (rightSortField.value === field) {
    rightSortOrder.value = rightSortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    rightSortField.value = field;
    rightSortOrder.value = 'asc';
  }
}

function sortItems<T extends { name: string; size: number; is_dir: boolean }>(items: T[], field: 'name' | 'size', order: 'asc' | 'desc'): T[] {
  return [...items].sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1;
    if (!a.is_dir && b.is_dir) return 1;

    let res = 0;
    if (field === 'size') {
      res = a.size - b.size;
    } else {
      res = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }
    return order === 'asc' ? res : -res;
  });
}

// Filtered local files
const displayLocalFiles = computed(() => {
  let list = localFiles.value;
  if (!showHiddenFilesLeft.value) {
    list = list.filter(item => !item.name.startsWith('.'));
  }
  if (hideLocalSystemFiles.value) {
    list = list.filter(item => !item.is_hidden && !item.is_system);
  }
  if (leftSearchQuery.value.trim()) {
    const q = leftSearchQuery.value.trim().toLowerCase();
    list = list.filter(item => item.name.toLowerCase().includes(q));
  }
  return sortItems(list, leftSortField.value, leftSortOrder.value);
});

// Remote Files State & History (Right Pane)
const remotePathInput = ref('.');
const remoteFiles = ref<RemoteFileItem[]>([]);
const selectedRemotePath = ref<string | null>(null);
const loadingRemote = ref(false);
const remoteHistory = ref<string[]>([]);
const remoteHistoryIndex = ref(-1);

// Left Remote Files State & History (When Left Pane is in Remote Session Mode)
const leftRemotePathInput = ref('.');
const leftRemoteFiles = ref<RemoteFileItem[]>([]);
const selectedLeftRemotePath = ref<string | null>(null);
const loadingLeftRemote = ref(false);
const leftRemoteHistory = ref<string[]>([]);
const leftRemoteHistoryIndex = ref(-1);

// Filtered left remote files
const displayLeftRemoteFiles = computed(() => {
  let list = leftRemoteFiles.value;
  if (!showHiddenFilesLeft.value) {
    list = list.filter(item => !item.name.startsWith('.'));
  }
  if (leftSearchQuery.value.trim()) {
    const q = leftSearchQuery.value.trim().toLowerCase();
    list = list.filter(item => item.name.toLowerCase().includes(q));
  }
  return sortItems(list, leftSortField.value, leftSortOrder.value);
});

// Filtered right remote files
const displayRemoteFiles = computed(() => {
  let list = remoteFiles.value;
  if (!showHiddenFilesRight.value) {
    list = list.filter(item => !item.name.startsWith('.'));
  }
  if (rightSearchQuery.value.trim()) {
    const q = rightSearchQuery.value.trim().toLowerCase();
    list = list.filter(item => item.name.toLowerCase().includes(q));
  }
  return sortItems(list, rightSortField.value, rightSortOrder.value);
});

// Active Focused Pane & Selection Summaries
const focusedPane = ref<'left' | 'right'>('right');

const leftSelectionSummary = computed(() => {
  const selected = selectedLeftPaths.value;
  if (selected.size === 0) return null;
  const items = (leftPaneTarget.value === 'local' ? localFiles.value : leftRemoteFiles.value).filter(i => selected.has(i.path));
  const totalSize = items.reduce((acc, i) => acc + (i.size || 0), 0);
  return {
    count: items.length,
    sizeFormatted: formatSize(totalSize),
  };
});

const leftFolderSummary = computed(() => {
  const items = leftPaneTarget.value === 'local' ? displayLocalFiles.value : displayLeftRemoteFiles.value;
  const totalSize = items.reduce((acc, i) => acc + (i.size || 0), 0);
  return {
    count: items.length,
    sizeFormatted: formatSize(totalSize),
  };
});

const rightSelectionSummary = computed(() => {
  const selected = selectedRightPaths.value;
  if (selected.size === 0) return null;
  const items = remoteFiles.value.filter(i => selected.has(i.path));
  const totalSize = items.reduce((acc, i) => acc + (i.size || 0), 0);
  return {
    count: items.length,
    sizeFormatted: formatSize(totalSize),
  };
});

const rightFolderSummary = computed(() => {
  const items = displayRemoteFiles.value;
  const totalSize = items.reduce((acc, i) => acc + (i.size || 0), 0);
  return {
    count: items.length,
    sizeFormatted: formatSize(totalSize),
  };
});

function handleSftpKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable);
  if (isInput) return;
  if (chmodModal.value.visible) return;

  const side = focusedPane.value;

  // F5 or Ctrl+R: Refresh
  if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) {
    e.preventDefault();
    if (side === 'left') {
      if (leftPaneTarget.value === 'local') fetchLocalFiles();
      else fetchLeftRemoteFiles();
    } else {
      fetchRemoteFiles();
    }
    dialogStore.showToast('Memperbarui daftar file...', 'info', 1500);
    return;
  }

  // Ctrl+H: Toggle hidden files (dotfiles)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    if (side === 'left') {
      showHiddenFilesLeft.value = !showHiddenFilesLeft.value;
      dialogStore.showToast(`File tersembunyi (kiri): ${showHiddenFilesLeft.value ? 'Ditampilkan' : 'Disembunyikan'}`, 'info', 1500);
    } else {
      showHiddenFilesRight.value = !showHiddenFilesRight.value;
      dialogStore.showToast(`File tersembunyi (kanan): ${showHiddenFilesRight.value ? 'Ditampilkan' : 'Disembunyikan'}`, 'info', 1500);
    }
    return;
  }

  // Alt+Left: Back history
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    if (side === 'left') {
      if (leftPaneTarget.value === 'local') navigateLocalBack();
      else navigateLeftRemoteBack();
    } else {
      navigateRemoteBack();
    }
    return;
  }

  // Alt+Right: Forward history
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    if (side === 'left') {
      if (leftPaneTarget.value === 'local') navigateLocalForward();
      else navigateLeftRemoteForward();
    } else {
      navigateRemoteForward();
    }
    return;
  }

  // Ctrl+C: Copy selected
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    copySelectedItems(side);
    return;
  }

  // Ctrl+X: Cut selected
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
    e.preventDefault();
    cutSelectedItems(side);
    return;
  }

  // Ctrl+V: Paste clipboard
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    pasteClipboard(side);
    return;
  }

  // Enter: Buka folder atau buka file di editor
  if (e.key === 'Enter') {
    e.preventDefault();
    if (side === 'left') {
      const items = leftPaneTarget.value === 'local' ? displayLocalFiles.value : displayLeftRemoteFiles.value;
      const activePath = selectedLocalPath.value || selectedLeftRemotePath.value || Array.from(selectedLeftPaths.value)[0];
      const item = items.find(i => i.path === activePath);
      if (item) {
        if (item.is_dir) {
          if (leftPaneTarget.value === 'local') navigateToLocalPath(item.path);
          else navigateToLeftRemotePath(item.path);
        } else {
          openInEditor('left', item);
        }
      }
    } else {
      const items = displayRemoteFiles.value;
      const activePath = selectedRemotePath.value || Array.from(selectedRightPaths.value)[0];
      const item = items.find(i => i.path === activePath);
      if (item) {
        if (item.is_dir) {
          navigateToRemotePath(item.path);
        } else {
          openInEditor('right', item);
        }
      }
    }
    return;
  }

  // Backspace: Navigasi ke folder induk (Up)
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (side === 'left') {
      if (leftPaneTarget.value === 'local') navigateLocalUp();
      else navigateLeftRemoteUp();
    } else {
      navigateRemoteUp();
    }
    return;
  }

  // ArrowDown / ArrowUp: Pindahkan fokus seleksi file
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = side === 'left'
      ? (leftPaneTarget.value === 'local' ? displayLocalFiles.value : displayLeftRemoteFiles.value)
      : displayRemoteFiles.value;
    if (items.length === 0) return;

    const currentPath = side === 'left'
      ? (selectedLocalPath.value || selectedLeftRemotePath.value || Array.from(selectedLeftPaths.value)[0])
      : (selectedRemotePath.value || Array.from(selectedRightPaths.value)[0]);

    const curIdx = items.findIndex(i => i.path === currentPath);
    let nextIdx = curIdx;
    if (e.key === 'ArrowDown') {
      nextIdx = curIdx < items.length - 1 ? curIdx + 1 : 0;
    } else {
      nextIdx = curIdx > 0 ? curIdx - 1 : items.length - 1;
    }

    const nextItem = items[nextIdx];
    if (nextItem) {
      if (side === 'left') {
        if (leftPaneTarget.value === 'local') selectedLocalPath.value = nextItem.path;
        else selectedLeftRemotePath.value = nextItem.path;
        selectedLeftPaths.value.clear();
        selectedLeftPaths.value.add(nextItem.path);
      } else {
        selectedRemotePath.value = nextItem.path;
        selectedRightPaths.value.clear();
        selectedRightPaths.value.add(nextItem.path);
      }
    }
    return;
  }

  // Ctrl+A: Select all
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    if (side === 'left') {
      const items = leftPaneTarget.value === 'local' ? displayLocalFiles.value : displayLeftRemoteFiles.value;
      for (const it of items) selectedLeftPaths.value.add(it.path);
    } else {
      for (const it of displayRemoteFiles.value) selectedRightPaths.value.add(it.path);
    }
    return;
  }

  // Delete: Delete selected
  if (e.key === 'Delete') {
    e.preventDefault();
    if (side === 'left' && selectedLeftPaths.value.size > 0) {
      deleteSelectedItems('left');
    } else if (side === 'right' && selectedRightPaths.value.size > 0) {
      deleteSelectedItems('right');
    }
    return;
  }

  // F2: Rename first selected
  if (e.key === 'F2') {
    e.preventDefault();
    if (side === 'left' && selectedLeftPaths.value.size > 0) {
      const firstPath = Array.from(selectedLeftPaths.value)[0];
      const it = (leftPaneTarget.value === 'local' ? localFiles.value : leftRemoteFiles.value).find(i => i.path === firstPath);
      if (it) renameItem('left', it);
    } else if (side === 'right' && selectedRightPaths.value.size > 0) {
      const firstPath = Array.from(selectedRightPaths.value)[0];
      const it = remoteFiles.value.find(i => i.path === firstPath);
      if (it) renameItem('right', it);
    }
    return;
  }

  // Escape: Clear selections & cancel cut
  if (e.key === 'Escape') {
    selectedLeftPaths.value.clear();
    selectedRightPaths.value.clear();
    closeContextMenu();
    if (sftpClipboard.value?.mode === 'cut') {
      sftpClipboard.value = null;
      dialogStore.showToast('Operasi potong dibatalkan', 'info', 1500);
    }
    return;
  }
}

// SFTP Clipboard State (Copy & Cut files / folders)
interface SftpClipboardItem {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
}

interface SftpClipboard {
  mode: 'copy' | 'cut';
  side: 'left' | 'right';
  target: string;
  targetName: string;
  items: SftpClipboardItem[];
}

const sftpClipboard = ref<SftpClipboard | null>(null);

function isItemCut(path: string): boolean {
  if (!sftpClipboard.value || sftpClipboard.value.mode !== 'cut') return false;
  return sftpClipboard.value.items.some(i => i.path === path);
}

function clearSftpClipboard() {
  sftpClipboard.value = null;
}

function copySelectedItems(side: 'left' | 'right', singleItem?: LocalFileItem | RemoteFileItem) {
  const isLeft = side === 'left';
  const selectedPaths = isLeft ? selectedLeftPaths.value : selectedRightPaths.value;
  const allItems = isLeft
    ? (leftPaneTarget.value === 'local' ? localFiles.value : leftRemoteFiles.value)
    : remoteFiles.value;

  let itemsToCopy: SftpClipboardItem[] = [];
  if (singleItem && (!selectedPaths.has(singleItem.path) || selectedPaths.size <= 1)) {
    itemsToCopy = [{ name: singleItem.name, path: singleItem.path, is_dir: singleItem.is_dir, size: singleItem.size }];
  } else if (selectedPaths.size > 0) {
    itemsToCopy = allItems
      .filter(i => selectedPaths.has(i.path))
      .map(i => ({ name: i.name, path: i.path, is_dir: i.is_dir, size: i.size }));
  } else if (singleItem) {
    itemsToCopy = [{ name: singleItem.name, path: singleItem.path, is_dir: singleItem.is_dir, size: singleItem.size }];
  }

  if (itemsToCopy.length === 0) return;

  const target = isLeft ? leftPaneTarget.value : (rightPaneTarget.value || 'remote');
  const targetName = isLeft ? leftServerName.value : rightServerName.value;

  sftpClipboard.value = {
    mode: 'copy',
    side,
    target,
    targetName,
    items: itemsToCopy,
  };

  dialogStore.showToast(`${itemsToCopy.length} file/folder disalin (Ctrl+V untuk tempel)`, 'info', 2000);
}

function cutSelectedItems(side: 'left' | 'right', singleItem?: LocalFileItem | RemoteFileItem) {
  const isLeft = side === 'left';
  const selectedPaths = isLeft ? selectedLeftPaths.value : selectedRightPaths.value;
  const allItems = isLeft
    ? (leftPaneTarget.value === 'local' ? localFiles.value : leftRemoteFiles.value)
    : remoteFiles.value;

  let itemsToCut: SftpClipboardItem[] = [];
  if (singleItem && (!selectedPaths.has(singleItem.path) || selectedPaths.size <= 1)) {
    itemsToCut = [{ name: singleItem.name, path: singleItem.path, is_dir: singleItem.is_dir, size: singleItem.size }];
  } else if (selectedPaths.size > 0) {
    itemsToCut = allItems
      .filter(i => selectedPaths.has(i.path))
      .map(i => ({ name: i.name, path: i.path, is_dir: i.is_dir, size: i.size }));
  } else if (singleItem) {
    itemsToCut = [{ name: singleItem.name, path: singleItem.path, is_dir: singleItem.is_dir, size: singleItem.size }];
  }

  if (itemsToCut.length === 0) return;

  const target = isLeft ? leftPaneTarget.value : (rightPaneTarget.value || 'remote');
  const targetName = isLeft ? leftServerName.value : rightServerName.value;

  sftpClipboard.value = {
    mode: 'cut',
    side,
    target,
    targetName,
    items: itemsToCut,
  };

  dialogStore.showToast(`${itemsToCut.length} file/folder dipotong (pilih folder lalu tekan Ctrl+V untuk memindahkan)`, 'info', 2000);
}

async function pasteClipboard(destSide: 'left' | 'right', destFolderOverride?: string) {
  if (!sftpClipboard.value || sftpClipboard.value.items.length === 0) return;

  const clip = sftpClipboard.value;
  const isDestLeft = destSide === 'left';
  const isDestLocal = isDestLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';
  const isSrcLocal = clip.target === 'local';
  const destTarget = isDestLeft ? leftPaneTarget.value : (rightPaneTarget.value || 'remote');
  const isSameTarget = clip.target === destTarget;

  // Tentukan direktori tujuan
  let destFolder = destFolderOverride;
  if (!destFolder) {
    if (isDestLeft) {
      destFolder = isDestLocal ? localPathInput.value : leftRemotePathInput.value;
    } else {
      destFolder = isDestLocal ? localPathInput.value : remotePathInput.value;
    }
  }

  const modeText = clip.mode === 'cut' ? 'Memindahkan' : 'Menyalin';
  dialogStore.showToast(`${modeText} ${clip.items.length} file/folder...`, 'info', 2000);

  try {
    // KASUS 1: Di dalam server remote yang SAMA
    if (!isDestLocal && !isSrcLocal && isSameTarget) {
      const activeId = isDestLeft ? await ensureLeftConnected() : await ensureConnected();
      const sep = destFolder.endsWith('/') ? '' : '/';
      const existingItems = !destFolderOverride
        ? (isDestLeft ? leftRemoteFiles.value : remoteFiles.value)
        : [];

      for (const item of clip.items) {
        let targetPath = `${destFolder}${sep}${item.name}`;

        if (clip.mode === 'cut') {
          if (item.path === targetPath) continue;

          // Cek konflik nama file jika ada di tujuan
          const existing = existingItems.find(i => i.name.toLowerCase() === item.name.toLowerCase());
          if (existing) {
            const confirm = await dialogStore.confirm({
              title: 'Konflik File: Timpa File?',
              description: `"${item.name}" sudah ada di folder tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
              confirmText: 'Timpa',
              cancelText: 'Lewati',
              isDestructive: true,
            });
            if (!confirm) continue;
          }

          await tauriBridge.sftpRenamePath(activeId, item.path, targetPath);
        } else {
          if (item.path === targetPath) {
            if (item.is_dir) {
              targetPath = `${destFolder}${sep}${item.name}-copy`;
            } else {
              const lastDot = item.name.lastIndexOf('.');
              if (lastDot > 0) {
                targetPath = `${destFolder}${sep}${item.name.substring(0, lastDot)}-copy${item.name.substring(lastDot)}`;
              } else {
                targetPath = `${destFolder}${sep}${item.name}-copy`;
              }
            }
          } else {
            const existing = existingItems.find(i => i.name.toLowerCase() === item.name.toLowerCase());
            if (existing) {
              const confirm = await dialogStore.confirm({
                title: 'Konflik File: Timpa File?',
                description: `"${item.name}" sudah ada di folder tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
                confirmText: 'Timpa',
                cancelText: 'Lewati',
                isDestructive: true,
              });
              if (!confirm) continue;
            }
          }
          await tauriBridge.sftpDuplicatePath(activeId, item.path, targetPath);
        }
      }

      if (isDestLeft) await fetchLeftRemoteFiles();
      else await fetchRemoteFiles();

      if (clip.side !== destSide) {
        if (clip.side === 'left') await fetchLeftRemoteFiles();
        else await fetchRemoteFiles();
      }
    }
    // KASUS 2: Di dalam mesin lokal yang SAMA
    else if (isDestLocal && isSrcLocal) {
      const sep = destFolder.includes('/') ? '/' : '\\';
      const existingItems = !destFolderOverride ? localFiles.value : [];

      for (const item of clip.items) {
        let targetPath = `${destFolder}${sep}${item.name}`;

        if (clip.mode === 'cut') {
          if (item.path === targetPath) continue;

          const existing = existingItems.find(i => i.name.toLowerCase() === item.name.toLowerCase());
          if (existing) {
            const confirm = await dialogStore.confirm({
              title: 'Konflik File: Timpa File?',
              description: `"${item.name}" sudah ada di folder tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
              confirmText: 'Timpa',
              cancelText: 'Lewati',
              isDestructive: true,
            });
            if (!confirm) continue;
          }

          await tauriBridge.fsRenamePath(item.path, targetPath);
        } else {
          if (item.path === targetPath) {
            if (item.is_dir) {
              targetPath = `${destFolder}${sep}${item.name}-copy`;
            } else {
              const lastDot = item.name.lastIndexOf('.');
              if (lastDot > 0) {
                targetPath = `${destFolder}${sep}${item.name.substring(0, lastDot)}-copy${item.name.substring(lastDot)}`;
              } else {
                targetPath = `${destFolder}${sep}${item.name}-copy`;
              }
            }
          } else {
            const existing = existingItems.find(i => i.name.toLowerCase() === item.name.toLowerCase());
            if (existing) {
              const confirm = await dialogStore.confirm({
                title: 'Konflik File: Timpa File?',
                description: `"${item.name}" sudah ada di folder tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
                confirmText: 'Timpa',
                cancelText: 'Lewati',
                isDestructive: true,
              });
              if (!confirm) continue;
            }
          }
          await tauriBridge.fsDuplicatePath(item.path, targetPath, item.is_dir);
        }
      }

      await fetchLocalFiles();
    }
    // KASUS 3: Antar Server atau Antar Lokal <-> Remote
    else {
      for (const item of clip.items) {
        if (clip.side === 'left' && destSide === 'right') {
          await transferItemLeftToRight(item as any);
          if (clip.mode === 'cut') {
            await deleteItem('left', item as any, true);
          }
        } else if (clip.side === 'right' && destSide === 'left') {
          await transferItemRightToLeft(item as any);
          if (clip.mode === 'cut') {
            await deleteItem('right', item as any, true);
          }
        }
      }
    }

    dialogStore.showToast(`${clip.items.length} file/folder berhasil ${clip.mode === 'cut' ? 'dipindahkan' : 'disalin'}.`, 'success');

    if (clip.mode === 'cut') {
      sftpClipboard.value = null;
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: `Gagal ${modeText} File/Folder`,
      description: String(err),
      variant: 'error',
    });
  }
}

// Context Menu State
const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  side: 'left' | 'right';
  item: LocalFileItem | RemoteFileItem | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  side: 'left',
  item: null,
});

function openContextMenu(e: MouseEvent, side: 'left' | 'right', item: LocalFileItem | RemoteFileItem | null = null) {
  e.preventDefault();
  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 220),
    y: Math.min(e.clientY, window.innerHeight - 320),
    side,
    item,
  };
}

function closeContextMenu() {
  if (contextMenu.value.visible) {
    contextMenu.value.visible = false;
  }
}

const isContextMenuRemote = computed(() => {
  if (!contextMenu.value.item) return false;
  return contextMenu.value.side === 'left'
    ? leftPaneTarget.value !== 'local'
    : rightPaneTarget.value !== 'local';
});

const contextMenuSelectionCount = computed(() => {
  if (!contextMenu.value.item) return 0;
  const side = contextMenu.value.side;
  const selected = side === 'left' ? selectedLeftPaths.value : selectedRightPaths.value;
  if (selected.has(contextMenu.value.item.path) && selected.size > 1) {
    return selected.size;
  }
  return 1;
});

async function calculateFolderSize(side: 'left' | 'right', folder: LocalFileItem | RemoteFileItem) {
  if (!folder.is_dir) return;
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  calculatingFolderSizes.value.add(folder.path);
  try {
    if (isLocal) {
      const bytes = await tauriBridge.fsGetFolderSize(folder.path);
      const formatted = formatSize(bytes);
      folderSizes.value[folder.path] = formatted;
      dialogStore.showToast(`Ukuran "${folder.name}": ${formatted}`, 'info', 3000);
    } else {
      const activeId = isLeft ? await ensureLeftConnected() : await ensureConnected();
      const escapedPath = folder.path.replace(/'/g, "'\\''");
      const cmd = `du -sb '${escapedPath}' 2>/dev/null || du -sh '${escapedPath}' 2>/dev/null`;
      const output = await tauriBridge.sshExecCommand(activeId, cmd);
      const firstToken = output.trim().split(/\s+/)[0];
      if (firstToken && !isNaN(Number(firstToken))) {
        const bytes = Number(firstToken);
        const formatted = formatSize(bytes);
        folderSizes.value[folder.path] = formatted;
        dialogStore.showToast(`Ukuran "${folder.name}": ${formatted}`, 'info', 3000);
      } else if (firstToken) {
        folderSizes.value[folder.path] = firstToken;
        dialogStore.showToast(`Ukuran "${folder.name}": ${firstToken}`, 'info', 3000);
      } else {
        folderSizes.value[folder.path] = '-';
      }
    }
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghitung ukuran folder: ${err}`, 'warning', 3000);
  } finally {
    calculatingFolderSizes.value.delete(folder.path);
  }
}

async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
  } catch (_) {}
}

// Bookmarks State per session
const sessionBookmarks = ref<Record<string, string[]>>({});

function loadBookmarks() {
  try {
    const saved = localStorage.getItem('boba_sftp_bookmarks');
    if (saved) {
      sessionBookmarks.value = JSON.parse(saved);
    }
  } catch (_) {}
}

function saveBookmarks() {
  try {
    localStorage.setItem('boba_sftp_bookmarks', JSON.stringify(sessionBookmarks.value));
  } catch (_) {}
}

function getActiveBookmarks(sessionId: string): string[] {
  return sessionBookmarks.value[sessionId] || [];
}

function addBookmark(sessionId: string, path: string) {
  if (!sessionId || sessionId === 'local' || !path) return;
  if (!sessionBookmarks.value[sessionId]) {
    sessionBookmarks.value[sessionId] = [];
  }
  if (!sessionBookmarks.value[sessionId].includes(path)) {
    sessionBookmarks.value[sessionId].push(path);
    saveBookmarks();
  }
}

function removeBookmark(sessionId: string, path: string) {
  if (!sessionBookmarks.value[sessionId]) return;
  sessionBookmarks.value[sessionId] = sessionBookmarks.value[sessionId].filter(p => p !== path);
  saveBookmarks();
}

// Chmod / Permissions Modal State
const chmodModal = ref<{
  visible: boolean;
  side: 'left' | 'right';
  item: RemoteFileItem | null;
  octal: string;
  recursive: boolean;
  uR: boolean; uW: boolean; uX: boolean;
  gR: boolean; gW: boolean; gX: boolean;
  oR: boolean; oW: boolean; oX: boolean;
}>({
  visible: false,
  side: 'right',
  item: null,
  octal: '0755',
  recursive: false,
  uR: true, uW: true, uX: true,
  gR: true, gW: false, gX: true,
  oR: true, oW: false, oX: true,
});

function openChmodModal(side: 'left' | 'right', item: RemoteFileItem) {
  chmodModal.value.visible = true;
  chmodModal.value.side = side;
  chmodModal.value.item = item;
  chmodModal.value.recursive = false;
  const defaultOctal = item.is_dir ? '0755' : '0644';
  setChmodFromOctal(defaultOctal);
}

function updateOctalFromBits() {
  const m = chmodModal.value;
  const u = (m.uR ? 4 : 0) + (m.uW ? 2 : 0) + (m.uX ? 1 : 0);
  const g = (m.gR ? 4 : 0) + (m.gW ? 2 : 0) + (m.gX ? 1 : 0);
  const o = (m.oR ? 4 : 0) + (m.oW ? 2 : 0) + (m.oX ? 1 : 0);
  chmodModal.value.octal = `0${u}${g}${o}`;
}

function setChmodFromOctal(val: string) {
  const clean = val.replace(/^0+/, '').padStart(3, '0');
  const u = parseInt(clean[0] || '0', 10);
  const g = parseInt(clean[1] || '0', 10);
  const o = parseInt(clean[2] || '0', 10);
  const m = chmodModal.value;
  m.octal = '0' + clean.slice(-3);
  m.uR = (u & 4) !== 0; m.uW = (u & 2) !== 0; m.uX = (u & 1) !== 0;
  m.gR = (g & 4) !== 0; m.gW = (g & 2) !== 0; m.gX = (g & 1) !== 0;
  m.oR = (o & 4) !== 0; m.oW = (o & 2) !== 0; m.oX = (o & 1) !== 0;
}

async function applyChmod() {
  const m = chmodModal.value;
  if (!m.item) return;
  const isLeft = m.side === 'left';
  const activeId = isLeft ? await ensureLeftConnected() : await ensureConnected();
  const flag = m.recursive ? '-R ' : '';
  const cmd = `chmod ${flag}${m.octal.replace(/^0+/, '')} "${m.item.path}"`;
  try {
    await tauriBridge.sshExecCommand(activeId, cmd);
    chmodModal.value.visible = false;
    if (isLeft) {
      await fetchLeftRemoteFiles(false);
    } else {
      await fetchRemoteFiles(false);
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to Change Permissions',
      description: String(err),
      variant: 'error',
    });
  }
}

// Remote Archive Compress & Extract
function isArchiveFile(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith('.tar.gz') || n.endsWith('.tgz') || n.endsWith('.zip') || n.endsWith('.tar.bz2') || n.endsWith('.tar.xz') || n.endsWith('.tar');
}

async function extractRemoteArchive(side: 'left' | 'right', item: RemoteFileItem) {
  const isLeft = side === 'left';
  const activeId = isLeft ? await ensureLeftConnected() : await ensureConnected();
  const currentDir = isLeft ? leftRemotePathInput.value : remotePathInput.value;

  const confirm = await dialogStore.confirm({
    title: 'Extract Archive on Server?',
    description: `Ekstrak "${item.name}" ke direktori saat ini: ${currentDir}?`,
    confirmText: 'Extract',
  });
  if (!confirm) return;

  let cmd = '';
  const n = item.name.toLowerCase();
  if (n.endsWith('.tar.gz') || n.endsWith('.tgz')) {
    cmd = `cd "${currentDir}" && tar -xzf "${item.path}"`;
  } else if (n.endsWith('.tar.bz2')) {
    cmd = `cd "${currentDir}" && tar -xjf "${item.path}"`;
  } else if (n.endsWith('.tar.xz')) {
    cmd = `cd "${currentDir}" && tar -xJf "${item.path}"`;
  } else if (n.endsWith('.zip')) {
    cmd = `cd "${currentDir}" && (unzip -q -o "${item.path}" 2>/dev/null || tar -xf "${item.path}")`;
  } else {
    cmd = `cd "${currentDir}" && tar -xf "${item.path}"`;
  }

  // Non-blocking background task in footer transfer queue
  const opId = queueStore.addOperation(activeId, 'extract', item.name, currentDir);
  queueTab.value = 'active';

  tauriBridge.sshExecCommand(activeId, cmd).then(async () => {
    queueStore.updateStatus(opId, 'completed');
    dialogStore.showToast(`Ekstraksi selesai: ${item.name}`, 'success');
    if (isLeft) {
      await fetchLeftRemoteFiles(false);
    } else {
      await fetchRemoteFiles(false);
    }
  }).catch((err: any) => {
    queueStore.updateStatus(opId, 'error', String(err));
    dialogStore.showToast(`Ekstraksi gagal: ${err}`, 'error');
  });
}

async function compressRemoteItem(side: 'left' | 'right', item: RemoteFileItem) {
  const isLeft = side === 'left';
  const activeId = isLeft ? await ensureLeftConnected() : await ensureConnected();
  const currentDir = isLeft ? leftRemotePathInput.value : remotePathInput.value;

  const defaultArchive = `${item.name}.tar.gz`;
  const archiveName = await dialogStore.prompt({
    title: 'Compress on Server',
    description: `Buat arsip tar.gz untuk "${item.name}":`,
    placeholder: defaultArchive,
    confirmText: 'Compress',
  });
  if (!archiveName?.trim()) return;

  const targetArchive = archiveName.trim();
  const cmd = `cd "${currentDir}" && tar -czf "${targetArchive}" "${item.name}"`;

  // Non-blocking background task in footer transfer queue
  const opId = queueStore.addOperation(activeId, 'compress', `${item.name} ➔ ${targetArchive}`, `${currentDir}/${targetArchive}`);
  queueTab.value = 'active';

  tauriBridge.sshExecCommand(activeId, cmd).then(async () => {
    queueStore.updateStatus(opId, 'completed');
    dialogStore.showToast(`Kompresi selesai: ${targetArchive}`, 'success');
    if (isLeft) {
      await fetchLeftRemoteFiles(false);
    } else {
      await fetchRemoteFiles(false);
    }
  }).catch((err: any) => {
    queueStore.updateStatus(opId, 'error', String(err));
    dialogStore.showToast(`Kompresi gagal: ${err}`, 'error');
  });
}

async function fixWebPermissions(side: 'left' | 'right', item: RemoteFileItem) {
  const isLeft = side === 'left';
  const activeId = isLeft ? await ensureLeftConnected() : await ensureConnected();

  const confirm = await dialogStore.confirm({
    title: 'Perbaiki Izin Web (755/644)?',
    description: `Setel izin folder 755 dan file 644 untuk "${item.name}" agar web server (Apache/cPanel/Nginx) tidak 403 Forbidden?`,
    confirmText: 'Perbaiki Izin',
  });
  if (!confirm) return;

  try {
    await tauriBridge.sftpFixPermissions(activeId, item.path);
    dialogStore.showToast(`Izin web diterapkan: ${item.name}`, 'success');
    if (isLeft) {
      await fetchLeftRemoteFiles(false);
    } else {
      await fetchRemoteFiles(false);
    }
  } catch (err: any) {
    dialogStore.alert({
      title: 'Gagal Memperbaiki Izin',
      description: String(err),
      variant: 'error',
    });
  }
}

// Pane Mode States ('local' | session_id)
const leftPaneTarget = ref<string>('local');
const rightPaneTarget = ref<string>('');

// Common Server Locations for Linux/BSD/Unix and Windows
const serverLocations = [
  { name: 'Home (~)', path: '.', description: 'User Home Directory' },
  { name: 'Root (/)', path: '/', description: 'Filesystem Root' },
  { name: '/var/www', path: '/var/www', description: 'Web Server Directory' },
  { name: '/etc', path: '/etc', description: 'Configuration Files' },
  { name: '/var/log', path: '/var/log', description: 'System Logs' },
  { name: '/tmp', path: '/tmp', description: 'Temporary Files' },
];

// Active terminal tabs for quick selection
const activeTerminalTabs = computed(() => {
  return sessionStore.tabs.filter(t => t.type === 'terminal' && t.connected);
});

// Sudo SFTP states
const isRightSudoActive = ref(false);
const togglingRightSudo = ref(false);
const isLeftSudoActive = ref(false);
const togglingLeftSudo = ref(false);
const backgroundConnectedSessions = ref<Set<string>>(new Set());

// Resolusi session config aktif untuk pane kanan
const rightSessionConfig = computed(() => {
  if (!rightPaneTarget.value || rightPaneTarget.value === 'local') return null;
  const targetId = rightPaneTarget.value;
  const tabRef = sessionStore.tabs.find(t => t.id === targetId || t.sessionConfig?.id === targetId);
  return vaultStore.vault.sessions.find(s => s.id === targetId) || tabRef?.sessionConfig || props.tab.sessionConfig;
});

// Resolusi session ID aktif untuk SFTP backend (right pane)
const sftpSessionId = computed(() => {
  if (!rightPaneTarget.value || rightPaneTarget.value === 'local') {
    return props.tab.parentSessionId || props.tab.id;
  }
  const targetId = rightPaneTarget.value;
  // Cari tab terminal aktif yang memiliki session config ini atau matching tab ID
  const activeTab = sessionStore.tabs.find(
    t => t.type === 'terminal' && (t.sessionConfig?.id === targetId || t.id === targetId) && t.connected
  );
  if (activeTab) {
    return activeTab.id;
  }
  return `sftp_conn_${targetId}`;
});

// Available remote sessions & folders from vault
const availableFolders = computed(() => {
  return vaultStore.vault.folders || [];
});

const availableSessions = computed(() => {
  return vaultStore.vault.sessions;
});

// Group sessions by folder
const groupedSessions = computed(() => {
  const folders = availableFolders.value;
  const sessions = availableSessions.value;
  const result: { folderName: string; sessions: typeof sessions }[] = [];

  // Folder-based sessions
  for (const f of folders) {
    const sInFolder = sessions.filter(s => s.folder_id === f.id);
    if (sInFolder.length > 0) {
      result.push({ folderName: f.name, sessions: sInFolder });
    }
  }

  // Unorganized sessions
  const unorganized = sessions.filter(s => !s.folder_id || !folders.some(f => f.id === s.folder_id));
  if (unorganized.length > 0) {
    result.push({ folderName: 'Uncategorized', sessions: unorganized });
  }

  return result;
});

// Watch changes to pane target
function onLeftTargetChange(newTarget: string) {
  leftPaneTarget.value = newTarget;
  if (newTarget === 'local') {
    fetchLocalFiles(true);
  } else {
    leftRemotePathInput.value = '.';
    leftRemoteHistory.value = ['.'];
    leftRemoteHistoryIndex.value = 0;
    fetchLeftRemoteFiles(true);
  }
}

function onRightTargetChange(newTarget: string) {
  rightPaneTarget.value = newTarget;
  if (newTarget === 'local') {
    fetchRightLocalFiles(true);
  } else {
    remotePathInput.value = '.';
    remoteHistory.value = ['.'];
    remoteHistoryIndex.value = 0;
    fetchRemoteFiles(true);
  }
}

// Queue Tab State ('active' | 'pending' | 'completed' | 'failed')
const queueTab = ref<'active' | 'pending' | 'completed' | 'failed'>('active');

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

const leftServerName = computed(() => {
  if (leftPaneTarget.value === 'local') return 'Local Machine';
  return leftSessionConfig.value?.name || leftSessionConfig.value?.host || 'Remote Kiri';
});

const rightServerName = computed(() => {
  if (!rightPaneTarget.value || rightPaneTarget.value === 'local') return 'Local Machine';
  return rightSessionConfig.value?.name || rightSessionConfig.value?.host || 'Remote Kanan';
});

function getTransferItemLabel(item: any): string {
  if (item.sourceLabel && item.targetLabel) {
    return `${item.sourceLabel} ➔ ${item.targetLabel}`;
  }
  if (item.direction === 'remote-to-remote') {
    const sId = String(item.sessionId || '');
    if (sId.startsWith('sftp_conn_left_') || (leftPaneTarget.value && sId.includes(leftPaneTarget.value))) {
      return `${leftServerName.value} ➔ ${rightServerName.value}`;
    }
    return `${rightServerName.value} ➔ ${leftServerName.value}`;
  }
  if (item.direction === 'upload') {
    return `Local Machine ➔ ${rightServerName.value}`;
  }
  if (item.direction === 'download') {
    return `${rightServerName.value} ➔ Local Machine`;
  }
  if (item.direction === 'compress') return 'Server Compress';
  if (item.direction === 'extract') return 'Server Extract';
  return '';
}

const sessionActiveTransfers = computed(() => {
  return queueStore.transfers.filter(t => t.status === 'transferring');
});

const sessionPendingTransfers = computed(() => {
  return queueStore.transfers.filter(t => t.status === 'pending');
});

const sessionCompletedTransfers = computed(() => {
  return queueStore.transfers.filter(t => t.status === 'completed');
});

const sessionFailedTransfers = computed(() => {
  return queueStore.transfers.filter(t => t.status === 'error' || t.status === 'cancelled');
});

const currentQueueItems = computed(() => {
  if (queueTab.value === 'active') return sessionActiveTransfers.value;
  if (queueTab.value === 'pending') return sessionPendingTransfers.value;
  if (queueTab.value === 'completed') return sessionCompletedTransfers.value;
  return sessionFailedTransfers.value;
});

onMounted(async () => {
  window.addEventListener('click', closeContextMenu);
  loadBookmarks();
  queueStore.initListener();

  // Load available local drives dynamically (User Home, C:, D:, etc.)
  try {
    const drives = await tauriBridge.fsGetLocalDrives();
    if (drives && drives.length > 0) {
      localDrives.value = drives;
      localPathInput.value = drives[0].path;
    }
  } catch (e) {
    console.warn('Failed to load local drives:', e);
  }

  if (!localPathInput.value) {
    localPathInput.value = 'C:\\';
  }

  // Muat file lokal untuk pane kiri
  await fetchLocalFiles();

  // Inisialisasi pane kanan:
  // Jika tab SFTP ini dibuka dari tab sesi terminal aktif (ada sessionConfig atau parentSessionId),
  // langsung otomatis pilih sesi tersebut dan load direktori remote!
  if (props.tab.sessionConfig?.id) {
    rightPaneTarget.value = props.tab.sessionConfig.id;
    await fetchRemoteFiles();
  } else if (props.tab.parentSessionId) {
    rightPaneTarget.value = props.tab.parentSessionId;
    await fetchRemoteFiles();
  } else {
    // Dibuka mandiri dari menu Sidebar "SFTP Manager"
    rightPaneTarget.value = '';
  }
});

// Auto-refresh pane ketika ada transfer yang selesai di background
let autoRefreshTimer: any = null;
watch(() => queueStore.lastCompletedAt, (newVal) => {
  if (!newVal) return;
  clearTimeout(autoRefreshTimer);
  autoRefreshTimer = setTimeout(async () => {
    if (leftPaneTarget.value === 'local') {
      await fetchLocalFiles(false);
    } else if (leftPaneTarget.value) {
      await fetchLeftRemoteFiles(false);
    }
    if (rightPaneTarget.value) {
      await fetchRemoteFiles(false);
    }
  }, 750);
});

onUnmounted(() => {
  clearTimeout(autoRefreshTimer);
  window.removeEventListener('click', closeContextMenu);
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
    // Pastikan path lokal valid, default ke Home atau C:\
    let target = localPathInput.value?.trim();
    if (!target) {
      target = localDrives.value.length > 0 ? localDrives.value[0].path : 'C:\\';
      localPathInput.value = target;
    }
    const items = await tauriBridge.fsListLocalDir(target);
    localFiles.value = items;
    if (recordHistory) {
      if (localHistoryIndex.value === -1 || localHistory.value[localHistoryIndex.value] !== target) {
        localHistory.value = localHistory.value.slice(0, localHistoryIndex.value + 1);
        localHistory.value.push(target);
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

function navigateLocalForward() {
  if (localHistoryIndex.value < localHistory.value.length - 1) {
    localHistoryIndex.value++;
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

// Left Remote Session Helpers
const leftSessionConfig = computed(() => {
  if (!leftPaneTarget.value || leftPaneTarget.value === 'local') return null;
  const targetId = leftPaneTarget.value;
  const tabRef = sessionStore.tabs.find(t => t.id === targetId || t.sessionConfig?.id === targetId);
  return vaultStore.vault.sessions.find(s => s.id === targetId) || tabRef?.sessionConfig || null;
});

async function ensureLeftConnected(): Promise<string> {
  const targetId = leftPaneTarget.value;
  const activeTab = sessionStore.tabs.find(
    t => t.type === 'terminal' && (t.sessionConfig?.id === targetId || t.id === targetId) && t.connected
  );
  if (activeTab) {
    return activeTab.id;
  }
  const sftpLeftId = `sftp_conn_left_${targetId}`;
  if (backgroundConnectedSessions.value.has(sftpLeftId)) {
    return sftpLeftId;
  }
  const config = leftSessionConfig.value;
  if (!config || !config.host) {
    throw new Error('Konfigurasi sesi kiri tidak ditemukan.');
  }
  let keyItem = undefined;
  if (config.auth_type === 'key' && config.key_id) {
    keyItem = vaultStore.vault.keys.find(k => k.id === config.key_id);
  }
  await tauriBridge.sshConnect(
    sftpLeftId,
    config,
    keyItem,
    80,
    24
  );
  backgroundConnectedSessions.value.add(sftpLeftId);
  return sftpLeftId;
}

async function toggleLeftSudo() {
  if (togglingLeftSudo.value || !leftPaneTarget.value || leftPaneTarget.value === 'local') return;
  togglingLeftSudo.value = true;
  try {
    const activeId = await ensureLeftConnected();
    const newStatus = !isLeftSudoActive.value;
    const config = leftSessionConfig.value;
    const customCmd = config?.sftp_sudo_command;

    await tauriBridge.sftpSetSudo(activeId, newStatus, customCmd);
    isLeftSudoActive.value = newStatus;

    // Refresh file list with new privileges
    await fetchLeftRemoteFiles(false);
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Sudo SFTP Error',
      description: String(err),
      variant: 'error',
    });
  } finally {
    togglingLeftSudo.value = false;
  }
}

async function fetchLeftRemoteFiles(recordHistory = true) {
  loadingLeftRemote.value = true;
  try {
    const activeId = await ensureLeftConnected();
    const items = await tauriBridge.sftpList(activeId, leftRemotePathInput.value);
    leftRemoteFiles.value = items;
    // Cek status sudo aktif
    try {
      isLeftSudoActive.value = await tauriBridge.sftpGetSudoStatus(activeId);
    } catch {}
    if (recordHistory) {
      if (leftRemoteHistoryIndex.value === -1 || leftRemoteHistory.value[leftRemoteHistoryIndex.value] !== leftRemotePathInput.value) {
        leftRemoteHistory.value = leftRemoteHistory.value.slice(0, leftRemoteHistoryIndex.value + 1);
        leftRemoteHistory.value.push(leftRemotePathInput.value);
        leftRemoteHistoryIndex.value = leftRemoteHistory.value.length - 1;
      }
    }
  } catch (err: any) {
    const errStr = String(err);
    const isPermissionError = errStr.toLowerCase().includes('permission denied');
    await dialogStore.alert({
      title: 'Left Remote SFTP Error',
      description: isPermissionError
        ? `${errStr}\n\n💡 Tip: Folder ini dibatasi izin akses (Permission denied). Anda dapat mengaktifkan tombol '🛡️ Sudo SFTP' di toolbar atas untuk membaca/mengubah file sebagai Root.`
        : errStr,
      variant: 'error',
    });
  } finally {
    loadingLeftRemote.value = false;
  }
}

function navigateToLeftRemotePath(path: string) {
  leftRemotePathInput.value = path;
  fetchLeftRemoteFiles(true);
}

function navigateLeftRemoteBack() {
  if (leftRemoteHistoryIndex.value > 0) {
    leftRemoteHistoryIndex.value--;
    leftRemotePathInput.value = leftRemoteHistory.value[leftRemoteHistoryIndex.value];
    fetchLeftRemoteFiles(false);
  }
}

function navigateLeftRemoteForward() {
  if (leftRemoteHistoryIndex.value < leftRemoteHistory.value.length - 1) {
    leftRemoteHistoryIndex.value++;
    leftRemotePathInput.value = leftRemoteHistory.value[leftRemoteHistoryIndex.value];
    fetchLeftRemoteFiles(false);
  }
}

function navigateLeftRemoteUp() {
  const current = leftRemotePathInput.value.replace(/\/+$/, '');
  if (!current || current === '.' || current === '/') return;
  const lastSlash = current.lastIndexOf('/');
  let target = '';
  if (lastSlash <= 0) {
    target = '/';
  } else {
    target = current.substring(0, lastSlash);
  }
  navigateToLeftRemotePath(target);
}

function askAiAboutFile(side: 'left' | 'right', item: LocalFileItem | RemoteFileItem) {
  const isLeft = side === 'left';
  const targetSessionId = isLeft
    ? (leftPaneTarget.value === 'local' ? '' : leftPaneTarget.value)
    : (rightPaneTarget.value || '');

  const prompt = `Tolong baca dan analisis file berikut pada server target:\nPath: ${item.path}\nNama: ${item.name}\n\nJelaskan isi konfigurasi atau baris log ini dan berikan saran jika terdapat potensi kesalahan/masalah.`;
  aiStore.sendPromptWithContext(prompt, targetSessionId);
}

async function openInEditor(side: 'left' | 'right', item: LocalFileItem | RemoteFileItem) {
  if (item.is_dir) return;
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  try {
    let content = '';
    let parentSessionTab: ActiveTab;

    if (isLocal) {
      content = await tauriBridge.fsReadTextFile(item.path);
      parentSessionTab = {
        id: 'local',
        type: 'terminal',
        title: 'Local Machine',
        sessionConfig: {
          id: 'local',
          name: 'Local Machine',
          host: 'localhost',
          port: 0,
          username: '',
          auth_type: 'password',
          created_at: '',
          updated_at: '',
        },
        connected: true,
        sftpOpen: false,
      };
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      content = await tauriBridge.sftpReadFile(activeId, item.path);
      const conf = leftSessionConfig.value || props.tab.sessionConfig;
      parentSessionTab = {
        id: activeId,
        type: 'terminal',
        title: conf.name || `${conf.username}@${conf.host}`,
        sessionConfig: { ...conf },
        connected: true,
        sftpOpen: false,
      };
    } else {
      const activeId = await ensureConnected();
      content = await tauriBridge.sftpReadFile(activeId, item.path);
      const conf = rightSessionConfig.value || props.tab.sessionConfig;
      parentSessionTab = {
        id: activeId,
        type: 'terminal',
        title: conf.name || `${conf.username}@${conf.host}`,
        sessionConfig: { ...conf },
        connected: true,
        sftpOpen: false,
      };
    }

    sessionStore.openEditorTab(parentSessionTab, item.path, item.name, content);
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Cannot Open File in Editor',
      description: `Gagal membaca file sebagai teks: ${String(err)}`,
      variant: 'error',
    });
  }
}

function handleLeftRemoteDblClick(file: RemoteFileItem) {
  if (file.is_dir) {
    navigateToLeftRemotePath(file.path);
  } else {
    openInEditor('left', file);
  }
}

function handleLocalDblClick(item: LocalFileItem) {
  if (item.is_dir) {
    navigateToLocalPath(item.path);
  } else {
    openInEditor('left', item);
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
  if (backgroundConnectedSessions.value.has(activeId)) {
    return activeId;
  }

  const config = rightSessionConfig.value || props.tab.sessionConfig;
  if (!config || !config.host) {
    throw new Error('Konfigurasi sesi server tidak ditemukan.');
  }

  // Auto connect if tab is not connected yet
  let keyItem = undefined;
  if (config.auth_type === 'key' && config.key_id) {
    keyItem = vaultStore.vault.keys.find(k => k.id === config.key_id);
  }

  await tauriBridge.sshConnect(
    activeId,
    config,
    keyItem,
    80,
    24
  );
  backgroundConnectedSessions.value.add(activeId);
  return activeId;
}

async function toggleRightSudo() {
  if (togglingRightSudo.value || !rightPaneTarget.value || rightPaneTarget.value === 'local') return;
  togglingRightSudo.value = true;
  try {
    const activeId = await ensureConnected();
    const newStatus = !isRightSudoActive.value;
    const config = rightSessionConfig.value || props.tab.sessionConfig;
    const customCmd = config?.sftp_sudo_command;

    await tauriBridge.sftpSetSudo(activeId, newStatus, customCmd);
    isRightSudoActive.value = newStatus;

    // Refresh file list with new privileges
    await fetchRemoteFiles(false);
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Sudo SFTP Error',
      description: String(err),
      variant: 'error',
    });
  } finally {
    togglingRightSudo.value = false;
  }
}

async function fetchRemoteFiles(recordHistory = true) {
  loadingRemote.value = true;
  try {
    const activeId = await ensureConnected();
    const items = await tauriBridge.sftpList(activeId, remotePathInput.value);
    remoteFiles.value = items;
    // Cek status sudo aktif
    try {
      isRightSudoActive.value = await tauriBridge.sftpGetSudoStatus(activeId);
    } catch {}
    if (recordHistory) {
      if (remoteHistoryIndex.value === -1 || remoteHistory.value[remoteHistoryIndex.value] !== remotePathInput.value) {
        remoteHistory.value = remoteHistory.value.slice(0, remoteHistoryIndex.value + 1);
        remoteHistory.value.push(remotePathInput.value);
        remoteHistoryIndex.value = remoteHistory.value.length - 1;
      }
    }
  } catch (err: any) {
    const errStr = String(err);
    const isPermissionError = errStr.toLowerCase().includes('permission denied');
    await dialogStore.alert({
      title: 'Remote SFTP Error',
      description: isPermissionError
        ? `${errStr}\n\n💡 Tip: Folder ini dibatasi izin akses (Permission denied). Anda dapat mengaktifkan tombol '🛡️ Sudo SFTP' di toolbar atas untuk membaca/mengubah file sebagai Root.`
        : errStr,
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

function navigateRemoteForward() {
  if (remoteHistoryIndex.value < remoteHistory.value.length - 1) {
    remoteHistoryIndex.value++;
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
  } else {
    openInEditor('right', file);
  }
}

// Quick file operations (Local & Remote)
async function promptNewFolder(side: 'left' | 'right') {
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';
  const currentPath = isLeft
    ? (isLocal ? localPathInput.value : leftRemotePathInput.value)
    : (isLocal ? localPathInput.value : remotePathInput.value);

  const folderName = await dialogStore.prompt({
    title: `New Folder (${isLocal ? 'Local' : 'Remote'})`,
    description: `Create directory in: ${currentPath}`,
    placeholder: 'Folder name...',
    confirmText: 'Create',
  });
  if (!folderName?.trim()) return;

  try {
    if (isLocal) {
      const sep = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\';
      await tauriBridge.fsCreateDir(`${currentPath}${sep}${folderName.trim()}`);
      await fetchLocalFiles();
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      const sep = currentPath.endsWith('/') ? '' : '/';
      await tauriBridge.sftpCreateDir(activeId, `${currentPath}${sep}${folderName.trim()}`);
      await fetchLeftRemoteFiles();
    } else {
      const activeId = await ensureConnected();
      const sep = currentPath.endsWith('/') ? '' : '/';
      await tauriBridge.sftpCreateDir(activeId, `${currentPath}${sep}${folderName.trim()}`);
      await fetchRemoteFiles();
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to create folder',
      description: String(err),
      variant: 'error',
    });
  }
}

async function promptNewFile(side: 'left' | 'right') {
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';
  const currentPath = isLeft
    ? (isLocal ? localPathInput.value : leftRemotePathInput.value)
    : (isLocal ? localPathInput.value : remotePathInput.value);

  const fileName = await dialogStore.prompt({
    title: `New File (${isLocal ? 'Local' : 'Remote'})`,
    description: `Create empty file in: ${currentPath}`,
    placeholder: 'e.g. index.html, .env',
    confirmText: 'Create',
  });
  if (!fileName?.trim()) return;

  try {
    if (isLocal) {
      const sep = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\';
      await tauriBridge.fsCreateFile(`${currentPath}${sep}${fileName.trim()}`);
      await fetchLocalFiles();
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      const sep = currentPath.endsWith('/') ? '' : '/';
      await tauriBridge.sftpWriteText(activeId, `${currentPath}${sep}${fileName.trim()}`, '');
      await fetchLeftRemoteFiles();
    } else {
      const activeId = await ensureConnected();
      const sep = currentPath.endsWith('/') ? '' : '/';
      await tauriBridge.sftpWriteText(activeId, `${currentPath}${sep}${fileName.trim()}`, '');
      await fetchRemoteFiles();
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Failed to create file',
      description: String(err),
      variant: 'error',
    });
  }
}

async function renameItem(side: 'left' | 'right', item: LocalFileItem | RemoteFileItem) {
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  const newName = await dialogStore.prompt({
    title: `Rename ${item.is_dir ? 'Folder' : 'File'}`,
    description: `Enter new name for "${item.name}":`,
    placeholder: item.name,
    confirmText: 'Rename',
  });
  if (!newName?.trim() || newName.trim() === item.name) return;

  try {
    if (isLocal) {
      const parent = item.path.substring(0, Math.max(item.path.lastIndexOf('\\'), item.path.lastIndexOf('/')));
      const sep = item.path.includes('/') ? '/' : '\\';
      const newPath = `${parent}${sep}${newName.trim()}`;
      await tauriBridge.fsRenamePath(item.path, newPath);
      await fetchLocalFiles();
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      const parent = item.path.substring(0, item.path.lastIndexOf('/'));
      const newPath = `${parent ? parent : ''}/${newName.trim()}`;
      await tauriBridge.sftpRename(activeId, item.path, newPath);
      await fetchLeftRemoteFiles();
    } else {
      const activeId = await ensureConnected();
      const parent = item.path.substring(0, item.path.lastIndexOf('/'));
      const newPath = `${parent ? parent : ''}/${newName.trim()}`;
      await tauriBridge.sftpRename(activeId, item.path, newPath);
      await fetchRemoteFiles();
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Rename Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

async function duplicateItem(side: 'left' | 'right', item: LocalFileItem | RemoteFileItem) {
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  let defaultName = '';
  if (item.is_dir) {
    defaultName = `${item.name}-copy`;
  } else {
    const lastDot = item.name.lastIndexOf('.');
    if (lastDot > 0) {
      const base = item.name.substring(0, lastDot);
      const ext = item.name.substring(lastDot);
      defaultName = `${base}-copy${ext}`;
    } else {
      defaultName = `${item.name}.copy`;
    }
  }

  const newName = await dialogStore.prompt({
    title: `Duplikat / Salin ${item.is_dir ? 'Folder' : 'File'}`,
    description: `Nama file/folder baru:`,
    placeholder: defaultName,
    defaultValue: defaultName,
    confirmText: 'Duplikat',
  });
  if (!newName?.trim() || newName.trim() === item.name) return;

  try {
    if (isLocal) {
      const parent = item.path.substring(0, Math.max(item.path.lastIndexOf('\\'), item.path.lastIndexOf('/')));
      const sep = item.path.includes('/') ? '/' : '\\';
      const newPath = `${parent}${sep}${newName.trim()}`;
      await tauriBridge.fsDuplicatePath(item.path, newPath, item.is_dir);
      dialogStore.showToast(`Duplikasi berhasil: ${newName.trim()}`, 'success');
      await fetchLocalFiles();
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      const parent = item.path.substring(0, item.path.lastIndexOf('/'));
      const newPath = `${parent ? parent : ''}/${newName.trim()}`;
      await tauriBridge.sftpDuplicatePath(activeId, item.path, newPath);
      dialogStore.showToast(`Duplikasi berhasil: ${newName.trim()}`, 'success');
      await fetchLeftRemoteFiles();
    } else {
      const activeId = await ensureConnected();
      const parent = item.path.substring(0, item.path.lastIndexOf('/'));
      const newPath = `${parent ? parent : ''}/${newName.trim()}`;
      await tauriBridge.sftpDuplicatePath(activeId, item.path, newPath);
      dialogStore.showToast(`Duplikasi berhasil: ${newName.trim()}`, 'success');
      await fetchRemoteFiles();
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Duplikasi Gagal',
      description: String(err),
      variant: 'error',
    });
  }
}

async function deleteItem(side: 'left' | 'right', item: LocalFileItem | RemoteFileItem, skipConfirm = false) {
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  if (!skipConfirm) {
    const confirm = await dialogStore.confirm({
      title: `Delete ${item.is_dir ? 'Folder' : 'File'}?`,
      description: `Are you sure you want to permanently delete "${item.name}"?`,
      confirmText: 'Delete',
      isDestructive: true,
    });
    if (!confirm) return;
  }

  try {
    if (isLocal) {
      await tauriBridge.fsDeletePath(item.path, item.is_dir);
      selectedLeftPaths.value.delete(item.path);
      await fetchLocalFiles();
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      await tauriBridge.sftpDelete(activeId, item.path, item.is_dir);
      selectedLeftPaths.value.delete(item.path);
      await fetchLeftRemoteFiles();
    } else {
      const activeId = await ensureConnected();
      await tauriBridge.sftpDelete(activeId, item.path, item.is_dir);
      selectedRightPaths.value.delete(item.path);
      await fetchRemoteFiles();
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Delete Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

// Multi-select bulk actions
function toggleSelectLeft(path: string) {
  if (selectedLeftPaths.value.has(path)) {
    selectedLeftPaths.value.delete(path);
  } else {
    selectedLeftPaths.value.add(path);
  }
}

function toggleSelectAllLeft() {
  const items = leftPaneTarget.value === 'local' ? displayLocalFiles.value : displayLeftRemoteFiles.value;
  if (selectedLeftPaths.value.size === items.length && items.length > 0) {
    selectedLeftPaths.value.clear();
  } else {
    selectedLeftPaths.value = new Set(items.map(i => i.path));
  }
}

function toggleSelectRight(path: string) {
  if (selectedRightPaths.value.has(path)) {
    selectedRightPaths.value.delete(path);
  } else {
    selectedRightPaths.value.add(path);
  }
}

function toggleSelectAllRight() {
  const items = displayRemoteFiles.value;
  if (selectedRightPaths.value.size === items.length && items.length > 0) {
    selectedRightPaths.value.clear();
  } else {
    selectedRightPaths.value = new Set(items.map(i => i.path));
  }
}

async function deleteSelectedItems(side: 'left' | 'right') {
  const isLeft = side === 'left';
  const selected = isLeft ? selectedLeftPaths.value : selectedRightPaths.value;
  if (selected.size === 0) return;

  const count = selected.size;
  const confirm = await dialogStore.confirm({
    title: `Delete ${count} item(s)?`,
    description: `Are you sure you want to permanently delete the ${count} selected item(s)?`,
    confirmText: 'Delete All',
    isDestructive: true,
  });
  if (!confirm) return;

  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';
  try {
    if (isLocal) {
      const items = localFiles.value.filter(i => selected.has(i.path));
      for (const it of items) {
        await tauriBridge.fsDeletePath(it.path, it.is_dir);
      }
      selectedLeftPaths.value.clear();
      await fetchLocalFiles();
    } else if (isLeft) {
      const activeId = await ensureLeftConnected();
      const items = leftRemoteFiles.value.filter(i => selected.has(i.path));
      for (const it of items) {
        await tauriBridge.sftpDelete(activeId, it.path, it.is_dir);
      }
      selectedLeftPaths.value.clear();
      await fetchLeftRemoteFiles();
    } else {
      const activeId = await ensureConnected();
      const items = remoteFiles.value.filter(i => selected.has(i.path));
      for (const it of items) {
        await tauriBridge.sftpDelete(activeId, it.path, it.is_dir);
      }
      selectedRightPaths.value.clear();
      await fetchRemoteFiles();
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Bulk Delete Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

async function transferSelectedLeft() {
  const selected = selectedLeftPaths.value;
  if (selected.size === 0) return;
  const items = (leftPaneTarget.value === 'local' ? localFiles.value : leftRemoteFiles.value).filter(i => selected.has(i.path));
  selectedLeftPaths.value.clear();
  const executing = new Set<Promise<void>>();
  for (const it of items) {
    while (executing.size >= queueStore.maxConcurrent) {
      await Promise.race([...executing, queueStore.onConcurrencyChange()]);
    }
    const p = transferItemLeftToRight(it).finally(() => { executing.delete(p); });
    executing.add(p);
  }
  await Promise.all(executing);
}

async function transferSelectedRight() {
  const selected = selectedRightPaths.value;
  if (selected.size === 0) return;
  const items = remoteFiles.value.filter(i => selected.has(i.path));
  selectedRightPaths.value.clear();
  const executing = new Set<Promise<void>>();
  for (const it of items) {
    while (executing.size >= queueStore.maxConcurrent) {
      await Promise.race([...executing, queueStore.onConcurrencyChange()]);
    }
    const p = transferItemRightToLeft(it).finally(() => { executing.delete(p); });
    executing.add(p);
  }
  await Promise.all(executing);
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

async function transferItemRightToLeft(item: RemoteFileItem) {
  if (leftPaneTarget.value === 'local') {
    // Right Pane Remote -> Local Machine
    await downloadRemoteItem(item);
  } else {
    // Right Pane Remote -> Left Pane Remote (Inter-Server Pipe)
    await transferRemoteRightToLeft(item);
  }
}

async function transferRemoteRightToLeft(item: RemoteFileItem) {
  const sep = leftRemotePathInput.value.endsWith('/') ? '' : '/';
  const targetRemotePath = `${leftRemotePathInput.value === '.' ? '' : leftRemotePathInput.value}${sep}${item.name}`;

  // Cek apakah file sudah ada di server tujuan (Overwrite Warning)
  if (!item.is_dir) {
    const existing = leftRemoteFiles.value.find(f => f.name.toLowerCase() === item.name.toLowerCase());
    if (existing) {
      const confirm = await dialogStore.confirm({
        title: 'Timpa File di Server Tujuan?',
        description: `File "${item.name}" sudah ada di server tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
        confirmText: 'Timpa File',
        isDestructive: true,
      });
      if (!confirm) return;
    }
  }

  try {
    const srcId = await ensureConnected(); // Right server is source
    const dstId = await ensureLeftConnected(); // Left server is destination
    const transferId = queueStore.addRemoteToRemote(
      srcId,
      item.path,
      (item.is_dir ? '📁 ' : '') + item.name,
      item.size,
      targetRemotePath,
      rightServerName.value,
      leftServerName.value,
      dstId
    );

    try {
      await tauriBridge.sftpTransferRemoteToRemote(
        srcId,
        dstId,
        transferId,
        item.path,
        targetRemotePath,
        queueStore.maxConcurrent
      );
      queueStore.updateStatus(transferId, 'completed');
    } catch (e) {
      queueStore.updateStatus(transferId, 'error', String(e));
      throw e;
    }

    await fetchLeftRemoteFiles();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Inter-Server Transfer Failed',
      description: String(err),
      variant: 'error',
    });
  }
}

async function transferRemoteToRemote(item: RemoteFileItem) {
  const sep = remotePathInput.value.endsWith('/') ? '' : '/';
  const targetRemotePath = `${remotePathInput.value === '.' ? '' : remotePathInput.value}${sep}${item.name}`;

  // Cek apakah file sudah ada di server tujuan (Overwrite Warning)
  if (!item.is_dir) {
    const existing = remoteFiles.value.find(f => f.name.toLowerCase() === item.name.toLowerCase());
    if (existing) {
      const confirm = await dialogStore.confirm({
        title: 'Timpa File di Server Tujuan?',
        description: `File "${item.name}" sudah ada di server tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
        confirmText: 'Timpa File',
        isDestructive: true,
      });
      if (!confirm) return;
    }
  }

  try {
    const srcId = await ensureLeftConnected();
    const dstId = await ensureConnected();
    const transferId = queueStore.addRemoteToRemote(
      srcId,
      item.path,
      (item.is_dir ? '📁 ' : '') + item.name,
      item.size,
      targetRemotePath,
      leftServerName.value,
      rightServerName.value,
      dstId
    );

    try {
      await tauriBridge.sftpTransferRemoteToRemote(
        srcId,
        dstId,
        transferId,
        item.path,
        targetRemotePath,
        queueStore.maxConcurrent
      );
      queueStore.updateStatus(transferId, 'completed');
    } catch (e) {
      queueStore.updateStatus(transferId, 'error', String(e));
      throw e;
    }

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

  // Cek apakah file sudah ada di remote server (Overwrite Warning)
  if (!item.is_dir) {
    const existing = remoteFiles.value.find(f => f.name.toLowerCase() === item.name.toLowerCase());
    if (existing) {
      const confirm = await dialogStore.confirm({
        title: 'Timpa File Remote?',
        description: `File "${item.name}" sudah ada di server tujuan (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
        confirmText: 'Timpa File',
        isDestructive: true,
      });
      if (!confirm) return;
    }
  }

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
      // Add folder transfer item in queue so user sees the folder immediately!
      const folderTransferId = queueStore.addUpload(
        activeId,
        targetRemotePath,
        `📁 ${item.name}`,
        0,
        item.path,
        'Local Machine',
        rightServerName.value
      );
      try {
        await tauriBridge.sftpUploadFolder(activeId, item.path, remotePathInput.value, queueStore.maxConcurrent, folderTransferId);
        const folderItem = queueStore.transfers.find(t => t.id === folderTransferId);
        if (folderItem) {
          folderItem.status = 'completed';
          folderItem.percentage = 100;
        }
      } catch (e) {
        const folderItem = queueStore.transfers.find(t => t.id === folderTransferId);
        if (folderItem) {
          folderItem.status = 'error';
          folderItem.errorMessage = String(e);
        }
        throw e;
      }
    } else {
      // Single file upload
      const transferId = queueStore.addUpload(
        activeId,
        targetRemotePath,
        item.name,
        item.size,
        item.path,
        'Local Machine',
        rightServerName.value
      );

      try {
        await tauriBridge.sftpUploadStream(
          activeId,
          transferId,
          item.path,
          targetRemotePath,
          0
        );
      } catch (uploadErr: any) {
        queueStore.updateStatus(transferId, 'error', String(uploadErr));
        throw uploadErr;
      }
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

  // Cek apakah file sudah ada di komputer lokal (Overwrite Warning)
  if (!file.is_dir) {
    const existing = localFiles.value.find(f => f.name.toLowerCase() === file.name.toLowerCase());
    if (existing) {
      const confirm = await dialogStore.confirm({
        title: 'Timpa File Lokal?',
        description: `File "${file.name}" sudah ada di komputer Anda (${formatSize(existing.size)}). Apakah Anda ingin menimpanya?`,
        confirmText: 'Timpa File',
        isDestructive: true,
      });
      if (!confirm) return;
    }
  }

  try {
    const activeId = await ensureConnected();
    if (file.is_dir) {
      // Add folder transfer item in queue so user sees the folder immediately!
      const folderTransferId = queueStore.addDownload(
        activeId,
        file.path,
        `📁 ${file.name}`,
        0,
        targetLocalPath,
        rightServerName.value,
        'Local Machine'
      );
      try {
        await tauriBridge.sftpDownloadFolder(activeId, file.path, localPathInput.value, queueStore.maxConcurrent, folderTransferId);
        const folderItem = queueStore.transfers.find(t => t.id === folderTransferId);
        if (folderItem) {
          folderItem.status = 'completed';
          folderItem.percentage = 100;
        }
      } catch (e) {
        const folderItem = queueStore.transfers.find(t => t.id === folderTransferId);
        if (folderItem) {
          folderItem.status = 'error';
          folderItem.errorMessage = String(e);
        }
        throw e;
      }
    } else {
      // Single file download
      const transferId = queueStore.addDownload(
        activeId,
        file.path,
        file.name,
        file.size,
        targetLocalPath,
        rightServerName.value,
        'Local Machine'
      );

      try {
        await tauriBridge.sftpDownloadStream(
          activeId,
          transferId,
          file.path,
          targetLocalPath,
          0
        );
      } catch (downloadErr: any) {
        queueStore.updateStatus(transferId, 'error', String(downloadErr));
        throw downloadErr;
      }
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

// Drag and Drop States (HTML5 In-App Drag & Drop)
let draggedLocalItem: LocalFileItem | null = null;
let draggedRemoteItem: RemoteFileItem | null = null;
const isDraggingOverRemote = ref(false);
const isDraggingOverLocal = ref(false);
const dragOverFolderPath = ref<string | null>(null);

function onFolderDragOver(event: DragEvent, folderPath: string) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverFolderPath.value = folderPath;
}

function onFolderDragLeave(folderPath: string) {
  if (dragOverFolderPath.value === folderPath) {
    dragOverFolderPath.value = null;
  }
}

async function onFolderDrop(targetSide: 'left' | 'right', targetFolder: LocalFileItem | RemoteFileItem) {
  dragOverFolderPath.value = null;
  if (!targetFolder.is_dir) return;

  const isTargetLeft = targetSide === 'left';
  const isTargetLocal = isTargetLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  // Ambil item yang sedang di-drag
  const draggedItem: LocalFileItem | RemoteFileItem | null = draggedLocalItem || draggedRemoteItem;
  if (!draggedItem) return;

  // Jangan drop folder ke dirinya sendiri
  if (draggedItem.path === targetFolder.path) return;

  // Cek apakah draggedItem adalah parent dari targetFolder (mencegah move ke subfolder sendiri)
  if (draggedItem.is_dir && targetFolder.path.startsWith(draggedItem.path)) {
    dialogStore.showToast('Tidak dapat memindahkan folder ke dalam subfoldernya sendiri', 'warning', 2500);
    return;
  }

  const isSrcLocal = !!draggedLocalItem;
  const isSrcLeft = isSrcLocal ? true : (leftPaneTarget.value !== 'local' && leftRemoteFiles.value.some(i => i.path === draggedItem.path));
  const isSameTarget = (isSrcLocal && isTargetLocal) || (!isSrcLocal && !isTargetLocal && ((isSrcLeft && isTargetLeft) || (!isSrcLeft && !isTargetLeft)));

  try {
    // 1. DI DALAM SERVER REMOTE YANG SAMA: Move langsung via sftpRenamePath
    if (!isTargetLocal && !isSrcLocal && isSameTarget) {
      const activeId = isTargetLeft ? await ensureLeftConnected() : await ensureConnected();
      const targetPath = `${targetFolder.path.replace(/\/+$/, '')}/${draggedItem.name}`;

      await tauriBridge.sftpRenamePath(activeId, draggedItem.path, targetPath);
      dialogStore.showToast(`Dipindahkan: "${draggedItem.name}" ke "${targetFolder.name}"`, 'success', 2000);

      if (isTargetLeft) await fetchLeftRemoteFiles();
      else await fetchRemoteFiles();
    }
    // 2. DI DALAM LOKAL YANG SAMA: Move langsung via fsRenamePath
    else if (isTargetLocal && isSrcLocal) {
      const sep = targetFolder.path.includes('/') ? '/' : '\\';
      const targetPath = `${targetFolder.path.replace(/[\\/]+$/, '')}${sep}${draggedItem.name}`;

      await tauriBridge.fsRenamePath(draggedItem.path, targetPath);
      dialogStore.showToast(`Dipindahkan: "${draggedItem.name}" ke "${targetFolder.name}"`, 'success', 2000);

      await fetchLocalFiles();
    }
    // 3. ANTAR PANE: Upload / Download langsung ke folder tujuan
    else {
      if (isTargetLeft) {
        if (isTargetLocal) {
          const sep = targetFolder.path.endsWith('\\') || targetFolder.path.endsWith('/') ? '' : '\\';
          const targetLocalPath = `${targetFolder.path}${sep}${draggedItem.name}`;
          const activeId = await ensureConnected();
          if (draggedItem.is_dir) {
            await tauriBridge.sftpDownloadFolder(activeId, draggedItem.path, targetFolder.path, queueStore.maxConcurrent);
          } else {
            const transferId = queueStore.addDownload(activeId, draggedItem.path, draggedItem.name, draggedItem.size, targetLocalPath, rightServerName.value, 'Local Machine');
            await tauriBridge.sftpDownloadStream(activeId, transferId, draggedItem.path, targetLocalPath, 0);
          }
          await fetchLocalFiles();
        } else {
          const srcId = await ensureConnected();
          const dstId = await ensureLeftConnected();
          await tauriBridge.sftpTransferRemoteToRemote(srcId, dstId, '', draggedItem.path, `${targetFolder.path}/${draggedItem.name}`, queueStore.maxConcurrent);
          await fetchLeftRemoteFiles();
        }
        dialogStore.showToast(`Ditransfer ke "${targetFolder.name}"`, 'success', 2000);
      } else {
        if (isSrcLocal) {
          const activeId = await ensureConnected();
          if (draggedItem.is_dir) {
            await tauriBridge.sftpUploadFolder(activeId, draggedItem.path, targetFolder.path, queueStore.maxConcurrent);
          } else {
            const targetRemotePath = `${targetFolder.path.replace(/\/+$/, '')}/${draggedItem.name}`;
            const transferId = queueStore.addUpload(activeId, targetRemotePath, draggedItem.name, draggedItem.size, draggedItem.path, 'Local Machine', rightServerName.value);
            await tauriBridge.sftpUploadStream(activeId, transferId, draggedItem.path, targetRemotePath, 0);
          }
        } else {
          const srcId = await ensureLeftConnected();
          const dstId = await ensureConnected();
          await tauriBridge.sftpTransferRemoteToRemote(srcId, dstId, '', draggedItem.path, `${targetFolder.path}/${draggedItem.name}`, queueStore.maxConcurrent);
        }
        dialogStore.showToast(`Ditransfer ke "${targetFolder.name}"`, 'success', 2000);
        await fetchRemoteFiles();
      }
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Gagal Memindahkan ke Folder',
      description: String(err),
      variant: 'error',
    });
  } finally {
    draggedLocalItem = null;
    draggedRemoteItem = null;
  }
}

function onLeftRemoteDragStart(event: DragEvent, item: RemoteFileItem) {
  draggedRemoteItem = item;
  draggedLocalItem = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'left_remote', file: item }));
    event.dataTransfer.setData('application/json', JSON.stringify({ type: 'left_remote', file: item }));
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
    await transferItemRightToLeft(remoteFile);
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

function formatPermissions(perm?: number): string {
  if (typeof perm !== 'number' || isNaN(perm) || perm <= 0) return '0644';
  const octal = (perm & 0o777).toString(8).padStart(3, '0');
  return `0${octal}`;
}

function formatPermString(perm?: number, isDir = false): string {
  if (typeof perm !== 'number' || isNaN(perm) || perm <= 0) return isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const p = perm & 0o777;
  const r = (bit: number) => (p & bit ? 'r' : '-');
  const w = (bit: number) => (p & bit ? 'w' : '-');
  const x = (bit: number) => (p & bit ? 'x' : '-');
  return (isDir ? 'd' : '-') +
    r(0o400) + w(0o200) + x(0o100) +
    r(0o040) + w(0o020) + x(0o010) +
    r(0o004) + w(0o002) + x(0o001);
}

function formatSpeed(bps: number): string {
  if (!bps || bps <= 0) return '0 KB/s';
  const k = 1024;
  if (bps < k) return `${bps.toFixed(0)} B/s`;
  if (bps < k * k) return `${(bps / k).toFixed(1)} KB/s`;
  return `${(bps / (k * k)).toFixed(1)} MB/s`;
}

function calculateEta(item: any): string {
  if (!item.speedBps || item.speedBps <= 0 || !item.totalBytes) return '';
  const remainingBytes = item.totalBytes - item.bytesTransferred;
  if (remainingBytes <= 0) return '';
  const seconds = Math.round(remainingBytes / item.speedBps);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  return `${minutes}m ${remainingSecs}s`;
}
</script>
