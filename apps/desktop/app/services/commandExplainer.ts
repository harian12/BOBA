export type CommandRiskLevel = 'safe' | 'moderate' | 'danger';

export interface CommandInsight {
  description: string;
  impact: string;
  riskLevel: CommandRiskLevel;
  riskLabel: string;
  badgeClass: string;
  buttonClass: string;
  icon: string;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+-[a-z]*r[a-z]*f?\s+\//i,
  /\brm\s+-[a-z]*f[a-z]*r?\s+\//i,
  /\brm\s+-[a-z]*rf\b/i,
  /\bmkfs\b/i,
  /\bfdisk\b/i,
  /\bparted\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /\binit\s+[06]\b/i,
  /\bpasswd\b/i,
  /\bchmod\s+-r\s+777\s+\//i,
  /\bkill\s+-9\s+-1\b/i,
  /\biptables\s+-f\b/i,
  /\bufw\s+(disable|reset)\b/i,
  /\b(sed|tee|cat|echo|cp|mv)\b.*(\/etc\/ssh\/sshd_config|\/etc\/sudoers)/i,
];

const MODERATE_PATTERNS = [
  /\bsystemctl\s+(restart|stop|reload|disable|mask)\b/i,
  /\bservice\s+\S+\s+(restart|stop|reload)\b/i,
  /\bdocker\s+(stop|restart|rm|rmi|down|prune)\b/i,
  /\bdocker-compose\s+(down|stop|restart)\b/i,
  /\b(apt|apt-get|yum|dnf|pacman|apk)\s+(install|remove|purge|upgrade|autoremove)\b/i,
  /\b(npm|yarn|pnpm)\s+(install|remove|update)\s+-g\b/i,
  /\b(pip|pip3)\s+install\b/i,
  /\b(git\s+pull|git\s+clone|git\s+checkout|git\s+reset)\b/i,
  /\b(kill|pkill|killall)\b/i,
  /\bsed\s+-i\b/i,
  /\b(mv|cp|mkdir|rmdir|touch|chmod|chown)\b/i,
  /\b(ufw|iptables)\s+(enable|disable|delete|reset)\b/i,
];

const READONLY_PATTERNS = [
  /\b(cat|less|more|head|tail|grep|zgrep|find|locate|which|whereis)\b/i,
  /\b(ls|dir|pwd)\b/i,
  /\b(df|free|du|lsblk|blkid)\b/i,
  /\b(top|htop|uptime|w|whoami|id|uname|hostname)\b/i,
  /\b(ps|pstree|pgrep)\b/i,
  /\b(netstat|ss|ip\s+a|ifconfig|ping|traceroute|curl|wget)\b/i,
  /\bsystemctl\s+(status|is-active|is-failed|list-units)\b/i,
  /\bdocker\s+(ps|logs|inspect|stats|images)\b/i,
  /\b(journalctl|dmesg)\b/i,
  /\bufw\s+status\b/i,
  /\bnginx\s+-t\b/i,
  /\bapache2ctl\s+configtest\b/i,
  /\b(sudo\s+)?git\s+(remote|status|log|diff|branch|show)\b/i,
];

export function inspectCommandRisk(cmd: string): CommandRiskLevel {
  const lower = (cmd || '').trim().toLowerCase();
  if (!lower) return 'safe';

  if (DANGEROUS_PATTERNS.some(p => p.test(lower))) {
    return 'danger';
  }
  if (MODERATE_PATTERNS.some(p => p.test(lower))) {
    return 'moderate';
  }
  if (READONLY_PATTERNS.some(p => p.test(lower))) {
    return 'safe';
  }
  return 'moderate';
}

function generateFallbackDescription(cmd: string): string {
  const trimmed = cmd.trim();
  const lower = trimmed.toLowerCase();

  // Service management
  const sysMatch = lower.match(/\bsystemctl\s+(status|restart|stop|start|reload)\s+([a-zA-Z0-9_-]+)/);
  if (sysMatch) {
    const action = sysMatch[1];
    const service = sysMatch[2];
    if (action && service) {
      const actionMap: Record<string, string> = {
        status: 'Memeriksa status aktif dan log error layanan',
        restart: 'Memulai ulang (restart) layanan',
        stop: 'Menghentikan layanan sementara',
        start: 'Menjalankan layanan',
        reload: 'Memuat ulang konfigurasi layanan tanpa mematikan koneksi',
      };
      return `${actionMap[action] || 'Mengelola layanan'} ${service}`;
    }
  }

  // Docker
  const docMatch = lower.match(/\bdocker\s+(ps|logs|restart|stop|start|rm)\s*([a-zA-Z0-9_-]*)/);
  if (docMatch) {
    const act = docMatch[1] || '';
    const target = docMatch[2] ? `container ${docMatch[2]}` : 'container';
    if (act === 'ps') return 'Melihat daftar container Docker yang sedang berjalan';
    if (act === 'logs') return `Melihat riwayat catatan log ${target}`;
    if (act === 'restart') return `Memulai ulang ${target}`;
    if (act === 'stop') return `Menghentikan ${target}`;
    if (act === 'rm') return `Menghapus ${target}`;
  }

  // Git
  if (lower.includes('git remote')) return 'Melihat konfigurasi remote repository Git (kredensial token disamarkan otomatis)';
  if (lower.startsWith('git pull')) return 'Mengambil dan memperbarui kode dari repositori Git';
  if (lower.startsWith('git clone')) return 'Mengkloning repositori kode baru ke direktori server';
  if (lower.startsWith('git checkout') || lower.startsWith('git switch')) return 'Berpindah branch atau mengembalikan versi kode';

  // Process & Permissions
  if (lower.startsWith('kill') || lower.startsWith('pkill')) return 'Menghentikan proses aplikasi yang sedang berjalan';
  if (lower.startsWith('chmod')) return 'Mengubah izin hak akses (permission) file atau direktori';
  if (lower.startsWith('chown')) return 'Mengubah pemilik akun/grup kepemilikan file atau direktori';

  // Network & web test
  if (lower.startsWith('curl') || lower.startsWith('wget')) return 'Mengirim request HTTP atau mengunduh data dari URL';
  if (lower.startsWith('ping')) return 'Menguji konektivitas dan latensi jaringan ke host tujuan';

  // Logs & inspection
  if (lower.startsWith('journalctl')) return 'Membaca catatan log aktivitas sistem operasi Linux';
  if (lower.includes('nginx -t')) return 'Menguji keabsahan sintaks konfigurasi web server Nginx';
  if (lower.startsWith('cat ') || lower.startsWith('tail ') || lower.startsWith('head ')) {
    return 'Membaca baris teks isi file konfigurasi atau catatan sistem';
  }
  if (lower.startsWith('df') || lower.startsWith('lsblk')) return 'Memeriksa kapasitas ruang penyimpanan harddisk server';
  if (lower.startsWith('free')) return 'Memeriksa kapasitas dan penggunaan memori RAM server';
  if (lower.startsWith('uptime') || lower.startsWith('top') || lower.startsWith('htop')) {
    return 'Memeriksa beban kerja processor CPU dan waktu aktif server';
  }
  if (lower.startsWith('ss') || lower.startsWith('netstat')) return 'Mengecek port jaringan dan koneksi yang sedang aktif';
  if (lower.startsWith('ufw') || lower.startsWith('iptables')) return 'Mengatur atau mengecek aturan firewall jaringan server';
  if (lower.includes('apt update') || lower.includes('apt-get update')) {
    return 'Memperbarui daftar paket aplikasi dari server repository';
  }
  if (lower.includes('apt install') || lower.includes('apt-get install')) {
    return 'Memasang software atau pustaka baru ke sistem server';
  }
  if (lower.startsWith('rm ') || lower.startsWith('unlink ')) return 'Menghapus file atau folder dari sistem server';

  return 'Menjalankan perintah bash di server remote';
}

function generateFallbackImpact(cmd: string, risk: CommandRiskLevel): string {
  const lower = cmd.trim().toLowerCase();

  if (risk === 'danger') {
    return 'Operasi berisiko tinggi. Dapat menghapus data secara permanen, mematikan server, atau mereset aturan firewall.';
  }

  if (lower.includes('restart')) {
    return 'Layanan akan dimuat ulang. Aplikasi web/database mungkin mengalami jeda koneksi sesaat (1-3 detik).';
  }
  if (lower.includes('stop')) {
    return 'Layanan akan dinonaktifkan sampai dihidupkan kembali secara manual.';
  }
  if (lower.startsWith('kill') || lower.startsWith('pkill')) {
    return 'Proses akan dimatikan paksa. Sesi pengguna atau pekerjaan yang sedang berjalan pada proses ini akan terhenti.';
  }
  if (lower.startsWith('git pull')) {
    return 'File kode aplikasi akan diperbarui ke versi commit terbaru dari repositori.';
  }
  if (lower.includes('install') || lower.includes('upgrade')) {
    return 'Mengunduh paket dari internet dan menulis file baru ke sistem. Membutuhkan ruang disk dan kuota bandwidth.';
  }
  if (lower.startsWith('chmod') || lower.startsWith('chown')) {
    return 'Mengubah hak akses file. Memastikan service/web server memiliki izin yang sesuai untuk membaca/menulis file.';
  }
  if (lower.startsWith('rm ') || lower.includes(' rm ')) {
    return 'File atau folder yang dihapus tidak masuk recycle bin dan hilang permanen.';
  }

  if (risk === 'safe') {
    return 'Aman (Hanya Membaca). Tidak ada pengaturan yang diubah dan tidak mengganggu layanan yang sedang berjalan.';
  }

  return 'Mengubah konfigurasi atau memodifikasi file pada sistem server.';
}

export function explainBashCommand(
  cmd: string,
  aiDescription?: string,
  aiImpact?: string
): CommandInsight {
  const cleanCmd = (cmd || '').trim();
  const riskLevel = inspectCommandRisk(cleanCmd);

  const description = (aiDescription && aiDescription.trim().length > 0)
    ? aiDescription.trim()
    : generateFallbackDescription(cleanCmd);

  const impact = (aiImpact && aiImpact.trim().length > 0)
    ? aiImpact.trim()
    : generateFallbackImpact(cleanCmd, riskLevel);

  if (riskLevel === 'danger') {
    return {
      description,
      impact,
      riskLevel: 'danger',
      riskLabel: 'Berisiko Tinggi',
      badgeClass: 'bg-rose-950 text-rose-300 border border-rose-800',
      buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white',
      icon: '🚨',
    };
  }

  if (riskLevel === 'moderate') {
    return {
      description,
      impact,
      riskLevel: 'moderate',
      riskLabel: 'Modifikasi Sistem',
      badgeClass: 'bg-amber-950 text-amber-300 border border-amber-800',
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
      icon: '⚠️',
    };
  }

  return {
    description,
    impact,
    riskLevel: 'safe',
    riskLabel: 'Aman: Read-only',
    badgeClass: 'bg-emerald-950 text-emerald-300 border border-emerald-800',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    icon: '🛡️',
  };
}
