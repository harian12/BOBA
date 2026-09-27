/**
 * Every shortcut listed here is implemented in the app. Keep this file in sync
 * with the key handlers when adding or removing one.
 */
export interface ShortcutItem {
  keys: string[];
  description: string;
}

export interface ShortcutGroup {
  title: string;
  hint: string;
  items: ShortcutItem[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Jendela & Proteksi Data',
    hint: 'Berlaku di mana saja',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Buka atau tutup command palette' },
      { keys: ['Ctrl', '/'], description: 'Buka atau tutup daftar pintasan ini' },
      { keys: ['Ctrl', 'Shift', 'L'], description: 'Kunci proteksi data' },
      { keys: ['Ctrl', 'Shift', 'A'], description: 'Buka atau tutup drawer AI Copilot' },
      { keys: ['Ctrl', 'B'], description: 'Ciutkan atau lebarkan sidebar' },
      { keys: ['Esc'], description: 'Tutup dialog atau batalkan aksi' },
    ],
  },
  {
    title: 'Tab Sesi',
    hint: 'Berlaku di mana saja',
    items: [
      { keys: ['Ctrl', 'Tab'], description: 'Pindah ke tab berikutnya' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Pindah ke tab sebelumnya' },
      { keys: ['Ctrl', '`'], description: 'Pindah ke tab berikutnya' },
      { keys: ['Ctrl', 'PageDown'], description: 'Pindah ke tab berikutnya' },
      { keys: ['Ctrl', 'PageUp'], description: 'Pindah ke tab sebelumnya' },
      { keys: ['Alt', '1'], description: 'Lompat ke tab urutan ke-n' },
      { keys: ['Alt', '←'], description: 'Pindah ke tab sebelumnya' },
      { keys: ['Alt', '→'], description: 'Pindah ke tab berikutnya' },
      { keys: ['Ctrl', 'W'], description: 'Tutup tab aktif' },
      { keys: ['Ctrl', 'Shift', 'W'], description: 'Tutup tab sesi teratas' },
      { keys: ['Ctrl', 'T'], description: 'Sub-tab query baru di tab DBMS' },
    ],
  },
  {
    title: 'Terminal SSH',
    hint: 'Saat tab terminal aktif',
    items: [
      { keys: ['Ctrl', 'V'], description: 'Tempel dari clipboard' },
      { keys: ['Ctrl', 'C'], description: 'Salin teks yang terseleksi' },
      { keys: ['Ctrl', '←'], description: 'Geser satu kata ke kiri' },
      { keys: ['Ctrl', '→'], description: 'Geser satu kata ke kanan' },
    ],
  },
  {
    title: 'SFTP Manager',
    hint: 'Saat tab SFTP aktif',
    items: [
      { keys: ['F5'], description: 'Muat ulang daftar file' },
      { keys: ['Ctrl', 'R'], description: 'Muat ulang daftar file' },
      { keys: ['Ctrl', 'H'], description: 'Tampilkan atau sembunyikan file tersembunyi' },
      { keys: ['Alt', '←'], description: 'Kembali ke folder sebelumnya' },
      { keys: ['Alt', '→'], description: 'Maju ke folder berikutnya' },
      { keys: ['Enter'], description: 'Buka folder atau file yang dipilih' },
      { keys: ['Backspace'], description: 'Naik ke folder induk' },
      { keys: ['↑', '↓'], description: 'Pindah seleksi di panel yang difokuskan' },
      { keys: ['Delete'], description: 'Hapus item yang terseleksi' },
      { keys: ['F2'], description: 'Rename item yang terseleksi' },
      { keys: ['Esc'], description: 'Bersihkan seleksi dan batalkan cut' },
    ],
  },
  {
    title: 'Editor Teks',
    hint: 'Saat tab editor aktif',
    items: [
      { keys: ['Ctrl', 'S'], description: 'Simpan dan sinkronkan ke remote' },
      { keys: ['Tab'], description: 'Indentasi satu tingkat' },
    ],
  },
  {
    title: 'Database',
    hint: 'Saat tab DBMS aktif',
    items: [
      { keys: ['Ctrl', 'Enter'], description: 'Jalankan query di kursor' },
      { keys: ['↑', '↓'], description: 'Pilih saran di daftar autocomplete' },
      { keys: ['Tab'], description: 'Terima saran autocomplete' },
      { keys: ['Enter'], description: 'Terima saran autocomplete' },
      { keys: ['Esc'], description: 'Tutup daftar autocomplete' },
    ],
  },
];

/** Chords that open this panel, matched against a keyboard event. */
export function matchesShortcutsPanel(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === '/';
}
