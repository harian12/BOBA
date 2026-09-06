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
              title="Kembali ke folder sebelumnya (Back)"
            >
              <span>◀</span>
              <span>Back</span>
            </button>
            <button
              @click="leftPaneTarget === 'local' ? navigateLocalUp() : navigateLeftRemoteUp()"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition shrink-0 flex items-center space-x-1"
              title="Ke folder di atasnya (Up)"
            >
              <span>⬆</span>
              <span>Up</span>
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
              <span class="text-sky-300 font-semibold">{{ selectedLeftPaths.size }} terpilih</span>
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
                title="Hapus semua terpilih"
              >
                Hapus
              </button>
            </div>
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
        >
          <!-- Table Header -->
          <div class="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#121520] border-b border-[#232a3b] text-[10px] text-slate-400 uppercase font-semibold sticky top-0 z-10 items-center select-none">
            <div class="col-span-7 flex items-center space-x-2">
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
            <div class="col-span-3 text-right">Action</div>
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
            @dblclick="handleLocalDblClick(item)"
            @click="selectedLocalPath = item.path"
            @contextmenu.prevent="openContextMenu($event, 'left', item)"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
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
            <div class="col-span-2 text-right text-[10px] text-slate-400 font-mono">
              {{ item.is_dir ? '<DIR>' : formatSize(item.size) }}
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
            @dblclick="handleLeftRemoteDblClick(item)"
            @click="selectedLeftRemotePath = item.path"
            @contextmenu.prevent="openContextMenu($event, 'left', item)"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              selectedLeftPaths.has(item.path) ? 'bg-sky-950/60 text-sky-100' : selectedLeftRemotePath === item.path ? 'bg-sky-950/30 text-sky-200' : 'text-slate-300'
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
            <div class="col-span-2 text-right text-[10px] text-slate-400 font-mono">
              {{ item.is_dir ? '<DIR>' : formatSize(item.size) }}
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
                <option value="">-- Pilih Sesi / Target --</option>
                <option value="local">💻 Local Machine</option>
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
              <!-- Empty spacer -->
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
            <!-- Back & Up Buttons directly beside remote input -->
            <button
              @click="navigateRemoteBack"
              :disabled="!rightPaneTarget || remoteHistoryIndex <= 0"
              class="px-2 py-1 bg-[#202738] hover:bg-[#2c364d] text-slate-300 rounded text-[11px] transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center space-x-1"
              title="Kembali ke folder sebelumnya (Back)"
            >
              <span>◀</span>
              <span>Back</span>
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
              <span class="text-emerald-300 font-semibold">{{ selectedRightPaths.size }} terpilih</span>
              <button
                @click="transferSelectedRight"
                class="text-emerald-200 hover:text-white underline"
                title="Download semua terpilih ke lokal"
              >
                Download
              </button>
              <span class="text-slate-600">|</span>
              <button
                @click="deleteSelectedItems('right')"
                class="text-rose-400 hover:text-rose-300 underline"
                title="Hapus semua terpilih"
              >
                Hapus
              </button>
            </div>
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
          <div class="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#121520] border-b border-[#232a3b] text-[10px] text-slate-400 uppercase font-semibold sticky top-0 z-10 items-center select-none">
            <div class="col-span-7 flex items-center space-x-2">
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
            @dblclick="handleRemoteDblClick(file)"
            @click="selectedRemotePath = file.path"
            @contextmenu.prevent="openContextMenu($event, 'right', file)"
            :class="[
              'grid grid-cols-12 gap-2 px-3 py-1.5 items-center border-b border-[#1b202e] hover:bg-[#1a2030] cursor-pointer transition text-[11px] select-none',
              selectedRightPaths.has(file.path) ? 'bg-emerald-950/60 text-emerald-100' : selectedRemotePath === file.path ? 'bg-sky-950/40 text-sky-200' : 'text-slate-300'
            ]"
          >
            <div class="col-span-7 flex items-center space-x-2 truncate">
              <input
                type="checkbox"
                :checked="selectedRightPaths.has(file.path)"
                @click.stop="toggleSelectRight(file.path)"
                class="rounded bg-[#090b10] border-[#2b364e] text-emerald-500 focus:ring-0 h-3 w-3 cursor-pointer shrink-0"
              />
              <span class="shrink-0">{{ file.is_dir ? '📁' : '📄' }}</span>
              <span class="truncate" :title="file.name">{{ file.name }}</span>
            </div>
            <div class="col-span-2 text-right text-[10px] text-slate-400 font-mono">
              {{ file.is_dir ? '<DIR>' : formatSize(file.size) }}
            </div>
            <div class="col-span-3 text-right flex items-center justify-end space-x-1">
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
                @click.stop="downloadRemoteItem(file)"
                class="px-2 py-0.5 bg-emerald-900/60 hover:bg-emerald-700 text-emerald-100 rounded text-[10px] transition shadow flex items-center space-x-1"
                :title="file.is_dir ? 'Download Folder ke Komputer Ini' : 'Download File ke Komputer Ini'"
              >
                <span>⬅️</span>
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

    <!-- Context Menu Floating Overlay -->
    <div
      v-if="contextMenu.visible && contextMenu.item"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      class="fixed z-50 bg-[#161a26] border border-[#2b354b] shadow-2xl rounded py-1 w-48 text-[11px] text-slate-200 select-none"
      @click.stop
    >
      <div class="px-2.5 py-1 text-[10px] text-slate-400 font-semibold truncate border-b border-[#232b3d] mb-0.5">
        {{ contextMenu.item.name }}
      </div>

      <button
        v-if="!contextMenu.item.is_dir"
        @click="openInEditor(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>👁️</span>
        <span>Edit di Tab</span>
      </button>

      <button
        v-if="contextMenu.item.is_dir"
        @click="contextMenu.side === 'left' ? (leftPaneTarget === 'local' ? navigateToLocalPath(contextMenu.item.path) : navigateToLeftRemotePath(contextMenu.item.path)) : navigateToRemotePath(contextMenu.item.path); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📁</span>
        <span>Buka Folder</span>
      </button>

      <button
        @click="contextMenu.side === 'left' ? transferItemLeftToRight(contextMenu.item!) : downloadRemoteItem(contextMenu.item! as RemoteFileItem); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>{{ contextMenu.side === 'left' ? '➡️' : '⬅️' }}</span>
        <span>{{ contextMenu.side === 'left' ? 'Transfer ke Kanan' : 'Download ke Lokal' }}</span>
      </button>

      <button
        @click="copyPath(contextMenu.item.path); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>📋</span>
        <span>Salin Path Lengkap</span>
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
        @click="renameItem(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-sky-600/30 hover:text-sky-200 flex items-center space-x-2 transition"
      >
        <span>✏️</span>
        <span>Ganti Nama</span>
      </button>

      <button
        @click="deleteItem(contextMenu.side, contextMenu.item!); closeContextMenu()"
        class="w-full text-left px-2.5 py-1.5 hover:bg-rose-600/30 text-rose-300 hover:text-rose-200 flex items-center space-x-2 transition"
      >
        <span>🗑️</span>
        <span>Hapus</span>
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
  if (leftSearchQuery.value.trim()) {
    const q = leftSearchQuery.value.trim().toLowerCase();
    list = list.filter(item => item.name.toLowerCase().includes(q));
  }
  return sortItems(list, leftSortField.value, leftSortOrder.value);
});

// Filtered right remote files
const displayRemoteFiles = computed(() => {
  let list = remoteFiles.value;
  if (rightSearchQuery.value.trim()) {
    const q = rightSearchQuery.value.trim().toLowerCase();
    list = list.filter(item => item.name.toLowerCase().includes(q));
  }
  return sortItems(list, rightSortField.value, rightSortOrder.value);
});

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

function openContextMenu(e: MouseEvent, side: 'left' | 'right', item: LocalFileItem | RemoteFileItem) {
  e.preventDefault();
  contextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 190),
    y: Math.min(e.clientY, window.innerHeight - 240),
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

  try {
    await tauriBridge.sshExecCommand(activeId, cmd);
    if (isLeft) {
      await fetchLeftRemoteFiles(false);
    } else {
      await fetchRemoteFiles(false);
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Extraction Failed',
      description: String(err),
      variant: 'error',
    });
  }
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

  const cmd = `cd "${currentDir}" && tar -czf "${archiveName.trim()}" "${item.name}"`;
  try {
    await tauriBridge.sshExecCommand(activeId, cmd);
    if (isLeft) {
      await fetchLeftRemoteFiles(false);
    } else {
      await fetchRemoteFiles(false);
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Compression Failed',
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

// Resolusi session config aktif untuk pane kanan
const rightSessionConfig = computed(() => {
  if (!rightPaneTarget.value || rightPaneTarget.value === 'local') return null;
  return vaultStore.vault.sessions.find(s => s.id === rightPaneTarget.value) || props.tab.sessionConfig;
});

// Resolusi session ID aktif untuk SFTP backend (right pane)
const sftpSessionId = computed(() => {
  if (!rightPaneTarget.value || rightPaneTarget.value === 'local') {
    return props.tab.id;
  }
  const targetId = rightPaneTarget.value;
  // Cari tab terminal aktif yang memiliki session config ini
  const activeTab = sessionStore.tabs.find(
    t => t.type === 'terminal' && t.sessionConfig.id === targetId && t.connected
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
  window.addEventListener('click', closeContextMenu);
  loadBookmarks();
  queueStore.initListener();

  // Biarkan pane kanan kosong terlebih dahulu sesuai permintaan (jangan auto select session)
  rightPaneTarget.value = '';

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
});

onUnmounted(() => {
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
  return vaultStore.vault.sessions.find(s => s.id === leftPaneTarget.value);
});

async function ensureLeftConnected(): Promise<string> {
  const targetId = leftPaneTarget.value;
  const activeTab = sessionStore.tabs.find(
    t => t.type === 'terminal' && t.sessionConfig.id === targetId && t.connected
  );
  if (activeTab) {
    return activeTab.id;
  }
  const sftpLeftId = `sftp_conn_left_${targetId}`;
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
  return sftpLeftId;
}

async function fetchLeftRemoteFiles(recordHistory = true) {
  loadingLeftRemote.value = true;
  try {
    const activeId = await ensureLeftConnected();
    const items = await tauriBridge.sftpList(activeId, leftRemotePathInput.value);
    leftRemoteFiles.value = items;
    if (recordHistory) {
      if (leftRemoteHistoryIndex.value === -1 || leftRemoteHistory.value[leftRemoteHistoryIndex.value] !== leftRemotePathInput.value) {
        leftRemoteHistory.value = leftRemoteHistory.value.slice(0, leftRemoteHistoryIndex.value + 1);
        leftRemoteHistory.value.push(leftRemotePathInput.value);
        leftRemoteHistoryIndex.value = leftRemoteHistory.value.length - 1;
      }
    }
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Left Remote SFTP Error',
      description: String(err),
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

async function deleteItem(side: 'left' | 'right', item: LocalFileItem | RemoteFileItem) {
  const isLeft = side === 'left';
  const isLocal = isLeft ? leftPaneTarget.value === 'local' : rightPaneTarget.value === 'local';

  const confirm = await dialogStore.confirm({
    title: `Delete ${item.is_dir ? 'Folder' : 'File'}?`,
    description: `Are you sure you want to permanently delete "${item.name}"?`,
    confirmText: 'Delete',
    isDestructive: true,
  });
  if (!confirm) return;

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
  for (const it of items) {
    await transferItemLeftToRight(it);
  }
  selectedLeftPaths.value.clear();
}

async function transferSelectedRight() {
  const selected = selectedRightPaths.value;
  if (selected.size === 0) return;
  const items = remoteFiles.value.filter(i => selected.has(i.path));
  for (const it of items) {
    await downloadRemoteItem(it);
  }
  selectedRightPaths.value.clear();
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
    const srcId = await ensureLeftConnected();
    const dstId = await ensureConnected();
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
