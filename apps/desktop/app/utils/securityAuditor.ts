export type AuditStatus = 'pass' | 'warn' | 'fail' | 'info';
export type AuditSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AuditCategory = 'ssh' | 'network' | 'auth' | 'system';

export interface SecurityCheckItem {
  id: string;
  category: AuditCategory;
  title: string;
  description: string;
  status: AuditStatus;
  severity: AuditSeverity;
  observedValue: string;
  remediationCmd?: string;
  remediationDesc?: string;
}

export interface SecurityAuditReport {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  gradeLabel: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
    total: number;
  };
  items: SecurityCheckItem[];
  rawOutput: string;
  timestamp: string;
}

export function buildSecurityAuditScript(useSudo: boolean = false): string {
  const sudoPrefix = useSudo ? 'sudo ' : '';
  return `sh -c '
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

echo "===BOBA_SECTION:SSH==="
(${sudoPrefix}sshd -T 2>/dev/null | grep -iE "^(permitrootlogin|passwordauthentication|port|maxauthtries)") || (grep -iE "^\\s*(PermitRootLogin|PasswordAuthentication|Port|MaxAuthTries)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null) || true

echo "===BOBA_SECTION:FIREWALL==="
UFW_RAW=$(${sudoPrefix}ufw status 2>&1 || true)
if echo "$UFW_RAW" | grep -qi "status: active"; then
  echo "ufw:active"
elif echo "$UFW_RAW" | grep -qi "status: inactive"; then
  echo "ufw:inactive"
elif echo "$UFW_RAW" | grep -qi "need to be root\\|permission denied\\|password is required"; then
  echo "ufw:need_sudo"
else
  if command -v ufw >/dev/null 2>&1 || [ -x /usr/sbin/ufw ]; then
    echo "ufw:inactive"
  else
    echo "ufw:not_installed"
  fi
fi

IPT_RAW=$(${sudoPrefix}iptables -L -n 2>&1 || true)
if echo "$IPT_RAW" | grep -qv "Chain.*ACCEPT\\|need to be root\\|permission denied\\|not found"; then
  echo "iptables:configured"
else
  echo "iptables:default"
fi

${sudoPrefix}ss -H -tulpn 2>/dev/null | grep -E "(0\\.0\\.0\\.0|:::|\\*):(3306|5432|6379|27017|9200)\\b" || true

echo "===BOBA_SECTION:AUTH==="
${sudoPrefix}awk -F: '\''($2 == "") {print "empty_pass:" $1}'\'' /etc/shadow 2>/dev/null || true
awk -F: '\''($3 == 0 && $1 != "root") {print "extra_uid_0:" $1}'\'' /etc/passwd 2>/dev/null || true
if systemctl is-active --quiet fail2ban 2>/dev/null; then
  echo "fail2ban:active"
elif systemctl is-active --quiet crowdsec 2>/dev/null; then
  echo "crowdsec:active"
else
  echo "fail2ban:inactive"
fi

echo "===BOBA_SECTION:SYSTEM==="
if [ -f /var/run/reboot-required ]; then
  echo "reboot_required:yes"
else
  echo "reboot_required:no"
fi
if dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii" || rpm -q dnf-automatic >/dev/null 2>&1; then
  echo "auto_updates:yes"
else
  echo "auto_updates:no"
fi
echo "core_dumps:$(sysctl -n fs.suid_dumpable 2>/dev/null || echo 1)"
echo "tcp_syncookies:$(sysctl -n net.ipv4.tcp_syncookies 2>/dev/null || echo 0)"
echo "ip_forward:$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo 0)"
'`;
}

export function parseSecurityAuditOutput(raw: string): SecurityAuditReport {
  const items: SecurityCheckItem[] = [];

  const getSection = (name: string): string => {
    const startTag = `===BOBA_SECTION:${name}===`;
    const idx = raw.indexOf(startTag);
    if (idx === -1) return '';
    const slice = raw.slice(idx + startTag.length);
    const nextIdx = slice.indexOf('===BOBA_SECTION:');
    return nextIdx === -1 ? slice : slice.slice(0, nextIdx);
  };

  const sshSection = getSection('SSH').toLowerCase();
  const firewallSection = getSection('FIREWALL');
  const authSection = getSection('AUTH');
  const sysSection = getSection('SYSTEM');

  // 1. SSH Root Login
  const rootLoginMatch = sshSection.match(/permitrootlogin\s+([^\s]+)/);
  const rootLoginVal = rootLoginMatch ? rootLoginMatch[1] : '';
  if (rootLoginVal === 'no' || rootLoginVal === 'prohibit-password') {
    items.push({
      id: 'ssh_root_login',
      category: 'ssh',
      title: 'SSH Root Login Terproteksi',
      description: 'Login langsung sebagai user root dinonaktifkan atau hanya menggunakan SSH key.',
      status: 'pass',
      severity: 'critical',
      observedValue: rootLoginVal || 'prohibit-password'
    });
  } else if (rootLoginVal === 'yes') {
    items.push({
      id: 'ssh_root_login',
      category: 'ssh',
      title: 'SSH Root Login Terbuka',
      description: 'Login SSH sebagai root diizinkan menggunakan password. Risiko brute-force sangat tinggi.',
      status: 'fail',
      severity: 'critical',
      observedValue: 'yes',
      remediationCmd: `sudo sed -i 's/^\\s*#\\?\\s*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && sudo systemctl reload sshd`,
      remediationDesc: 'Ubah konfigurasi sshd ke PermitRootLogin prohibit-password lalu reload service sshd.'
    });
  } else {
    items.push({
      id: 'ssh_root_login',
      category: 'ssh',
      title: 'Pemeriksaan SSH Root Login',
      description: 'Nilai PermitRootLogin tidak terbaca secara eksplisit. Pastikan dibatasi ke prohibit-password.',
      status: 'warn',
      severity: 'high',
      observedValue: 'Tidak terdeteksi'
    });
  }

  // 2. SSH Password Authentication
  const passAuthMatch = sshSection.match(/passwordauthentication\s+([^\s]+)/);
  const passAuthVal = passAuthMatch ? passAuthMatch[1] : '';
  if (passAuthVal === 'no') {
    items.push({
      id: 'ssh_password_auth',
      category: 'ssh',
      title: 'Autentikasi SSH Hanya Key-Based',
      description: 'Login password SSH dinonaktifkan. Hanya SSH key yang diizinkan masuk.',
      status: 'pass',
      severity: 'high',
      observedValue: 'no (SSH Key only)'
    });
  } else if (passAuthVal === 'yes') {
    items.push({
      id: 'ssh_password_auth',
      category: 'ssh',
      title: 'Autentikasi Password SSH Aktif',
      description: 'Login SSH dapat menggunakan password akun biasa, rentan diserang credential stuffing.',
      status: 'warn',
      severity: 'high',
      observedValue: 'yes (Password diizinkan)',
      remediationCmd: `sudo sed -i 's/^\\s*#\\?\\s*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && sudo systemctl reload sshd`,
      remediationDesc: 'Nonaktifkan PasswordAuthentication setelah memastikan SSH Public Key Anda sudah terpasang di authorized_keys.'
    });
  } else {
    items.push({
      id: 'ssh_password_auth',
      category: 'ssh',
      title: 'Status Autentikasi Password SSH',
      description: 'PasswordAuthentication memakai default distro (biasanya yes). Disarankan beralih ke SSH Key.',
      status: 'info',
      severity: 'medium',
      observedValue: 'Default OS'
    });
  }

  // 3. Firewall (UFW / iptables)
  const isUfwActive = firewallSection.includes('ufw:active');
  const isIptablesConfigured = firewallSection.includes('iptables:configured');
  const isUfwNeedSudo = firewallSection.includes('ufw:need_sudo');

  if (isUfwActive || isIptablesConfigured) {
    items.push({
      id: 'firewall_active',
      category: 'network',
      title: 'Firewall Host Aktif',
      description: isUfwActive ? 'UFW aktif melindungi traffic masuk server.' : 'Aturan iptables terdeteksi aktif memfilter paket.',
      status: 'pass',
      severity: 'critical',
      observedValue: isUfwActive ? 'UFW Active' : 'iptables Active'
    });
  } else if (isUfwNeedSudo) {
    items.push({
      id: 'firewall_active',
      category: 'network',
      title: 'Izin Sudo Diperlukan untuk Membaca Firewall',
      description: 'Perintah ufw status memerlukan hak akses root. Pastikan user memiliki izin sudo.',
      status: 'warn',
      severity: 'high',
      observedValue: 'Permission Denied / Need Sudo'
    });
  } else {
    items.push({
      id: 'firewall_active',
      category: 'network',
      title: 'Firewall Host Tidak Aktif',
      description: 'UFW atau iptables belum aktif. Semua port yang dibuka proses dapat langsung diakses publik.',
      status: 'fail',
      severity: 'critical',
      observedValue: 'Inactive / Default Accept',
      remediationCmd: 'sudo ufw default deny incoming && sudo ufw default allow outgoing && sudo ufw allow ssh && sudo ufw --force enable',
      remediationDesc: 'Aktifkan UFW dengan memblokir semua koneksi masuk kecuali port SSH.'
    });
  }

  // 4. Database Port Exposure
  const exposedLines = firewallSection
    .split('\n')
    .filter((l) => /:(3306|5432|6379|27017|9200)\b/.test(l));
  if (exposedLines.length > 0) {
    const ports = exposedLines.map((l) => {
      const m = l.match(/:(\d+)\b/);
      return m ? m[1] : 'DB';
    });
    items.push({
      id: 'db_port_exposure',
      category: 'network',
      title: 'Port Database Terbuka ke Publik (0.0.0.0)',
      description: `Layanan database (${ports.join(', ')}) mendengarkan port pada semua antarmuka (0.0.0.0 atau [::]).`,
      status: 'fail',
      severity: 'critical',
      observedValue: `Port ${ports.join(', ')} listening on 0.0.0.0`,
      remediationCmd: `Ganti bind-address di konfigurasi database ke 127.0.0.1, atau blokir port via firewall: sudo ufw deny 3306`,
      remediationDesc: 'Ubah bind-address database ke localhost (127.0.0.1) atau kunci akses port dari internet via UFW.'
    });
  } else {
    items.push({
      id: 'db_port_exposure',
      category: 'network',
      title: 'Port Database Terisolasi',
      description: 'Tidak ada port database umum (MySQL, Postgres, Redis, MongoDB) yang terekspos ke 0.0.0.0.',
      status: 'pass',
      severity: 'high',
      observedValue: 'Aman / Localhost only'
    });
  }

  // 5. Brute-Force Defender (fail2ban / crowdsec)
  const isF2b = authSection.includes('fail2ban:active');
  const isCrowd = authSection.includes('crowdsec:active');
  if (isF2b || isCrowd) {
    items.push({
      id: 'intrusion_prevention',
      category: 'auth',
      title: 'Proteksi Brute-Force Aktif',
      description: `Layanan ${isF2b ? 'fail2ban' : 'crowdsec'} aktif memblokir IP yang gagal login berulang kali.`,
      status: 'pass',
      severity: 'medium',
      observedValue: isF2b ? 'fail2ban active' : 'crowdsec active'
    });
  } else {
    items.push({
      id: 'intrusion_prevention',
      category: 'auth',
      title: 'Proteksi Brute-Force Tidak Ditemukan',
      description: 'Layanan fail2ban atau crowdsec tidak terpasang/tidak berjalan. Server rentan spamming password.',
      status: 'warn',
      severity: 'medium',
      observedValue: 'Inactive',
      remediationCmd: 'sudo apt-get update && sudo apt-get install -y fail2ban && sudo systemctl enable --now fail2ban',
      remediationDesc: 'Install dan aktifkan fail2ban untuk otomatis memblokir IP penyerang SSH.'
    });
  }

  // 6. User accounts without passwords
  const emptyPassLines = authSection.split('\n').filter((l) => l.startsWith('empty_pass:'));
  if (emptyPassLines.length > 0) {
    const users = emptyPassLines.map((l) => l.replace('empty_pass:', '').trim());
    items.push({
      id: 'empty_passwords',
      category: 'auth',
      title: 'Ditemukan Akun Tanpa Password',
      description: `Akun berikut tidak memiliki password terenkripsi di /etc/shadow: ${users.join(', ')}.`,
      status: 'fail',
      severity: 'critical',
      observedValue: users.join(', '),
      remediationCmd: `sudo passwd -l ${users[0] || 'username'}`,
      remediationDesc: 'Kunci akun tanpa password atau beri password yang kuat.'
    });
  } else {
    items.push({
      id: 'empty_passwords',
      category: 'auth',
      title: 'Tidak Ada Akun Tanpa Password',
      description: 'Semua akun di /etc/shadow memiliki hash password atau terkunci dengan benar.',
      status: 'pass',
      severity: 'critical',
      observedValue: 'Aman'
    });
  }

  // 7. Non-root accounts with UID 0
  const extraUidZero = authSection.split('\n').filter((l) => l.startsWith('extra_uid_0:'));
  if (extraUidZero.length > 0) {
    const users = extraUidZero.map((l) => l.replace('extra_uid_0:', '').trim());
    items.push({
      id: 'extra_uid_zero',
      category: 'auth',
      title: 'Ditemukan Akun Non-Root dengan UID 0',
      description: `Akun (${users.join(', ')}) memiliki UID 0 selain root. Kemungkinan indikasi backdoor privilege.`,
      status: 'fail',
      severity: 'critical',
      observedValue: users.join(', '),
      remediationDesc: 'Investigasi akun mencurigakan tersebut dan cabut hak UID 0 di /etc/passwd.'
    });
  } else {
    items.push({
      id: 'extra_uid_zero',
      category: 'auth',
      title: 'UID 0 Eksklusif Hanya Root',
      description: 'Tidak ada akun backdoor tambahan yang menggunakan UID 0 selain akun root standar.',
      status: 'pass',
      severity: 'critical',
      observedValue: 'Normal (Hanya root)'
    });
  }

  // 8. Auto Security Updates
  const hasAutoUpdates = sysSection.includes('auto_updates:yes');
  if (hasAutoUpdates) {
    items.push({
      id: 'auto_updates',
      category: 'system',
      title: 'Automatic Security Updates Aktif',
      description: 'Paket unattended-upgrades / dnf-automatic terdeteksi aktif menginstall patch keamanan.',
      status: 'pass',
      severity: 'medium',
      observedValue: 'Enabled'
    });
  } else {
    items.push({
      id: 'auto_updates',
      category: 'system',
      title: 'Automatic Security Updates Belum Aktif',
      description: 'Pembaruan keamanan otomatis belum terpasang. Paket rentan jika tidak diupdate manual berkala.',
      status: 'warn',
      severity: 'medium',
      observedValue: 'Disabled',
      remediationCmd: 'sudo apt-get update && sudo apt-get install -y unattended-upgrades && sudo dpkg-reconfigure -f noninteractive unattended-upgrades',
      remediationDesc: 'Pasang unattended-upgrades untuk mengotomatisasi patching CVE distro.'
    });
  }

  // 9. SYN Flood Protection
  const synCookiesMatch = sysSection.match(/tcp_syncookies:(\d+)/);
  const synCookiesVal = synCookiesMatch ? synCookiesMatch[1] : '0';
  if (synCookiesVal === '1') {
    items.push({
      id: 'tcp_syncookies',
      category: 'network',
      title: 'SYN Flood Protection (TCP Syncookies)',
      description: 'Kernel mengaktifkan net.ipv4.tcp_syncookies untuk mitigasi serangan DoS SYN flood.',
      status: 'pass',
      severity: 'low',
      observedValue: '1 (Aktif)'
    });
  } else {
    items.push({
      id: 'tcp_syncookies',
      category: 'network',
      title: 'TCP Syncookies Tidak Aktif',
      description: 'Proteksi kernel terhadap SYN flood mati (net.ipv4.tcp_syncookies = 0).',
      status: 'warn',
      severity: 'low',
      observedValue: '0 (Nonaktif)',
      remediationCmd: 'sudo sysctl -w net.ipv4.tcp_syncookies=1',
      remediationDesc: 'Aktifkan tcp_syncookies di sysctl.'
    });
  }

  // 10. Reboot Required
  const isRebootReq = sysSection.includes('reboot_required:yes');
  if (isRebootReq) {
    items.push({
      id: 'reboot_required',
      category: 'system',
      title: 'Sistem Memerlukan Reboot',
      description: 'File /var/run/reboot-required terdeteksi. Kernel patch baru membutuhkan restart server untuk aktif.',
      status: 'warn',
      severity: 'medium',
      observedValue: 'Reboot Pending',
      remediationCmd: 'sudo reboot',
      remediationDesc: 'Jadwalkan reboot sistem pada jam pemeliharaan (maintenance window).'
    });
  } else {
    items.push({
      id: 'reboot_required',
      category: 'system',
      title: 'Kernel & Kernel Patch Up-to-Date',
      description: 'Tidak ada antrean reboot sistem operasi yang tertunda.',
      status: 'pass',
      severity: 'low',
      observedValue: 'Normal'
    });
  }

  // Calculate Score (Max 100)
  let score = 0;
  const weights: Record<string, { pass: number; warn: number }> = {
    ssh_root_login: { pass: 15, warn: 5 },
    ssh_password_auth: { pass: 15, warn: 5 },
    firewall_active: { pass: 15, warn: 0 },
    db_port_exposure: { pass: 15, warn: 0 },
    intrusion_prevention: { pass: 10, warn: 2 },
    empty_passwords: { pass: 10, warn: 0 },
    extra_uid_zero: { pass: 10, warn: 0 },
    auto_updates: { pass: 5, warn: 1 },
    tcp_syncookies: { pass: 3, warn: 0 },
    reboot_required: { pass: 2, warn: 1 }
  };

  for (const item of items) {
    const w = weights[item.id] || { pass: 5, warn: 2 };
    if (item.status === 'pass') {
      score += w.pass;
    } else if (item.status === 'warn') {
      score += w.warn;
    }
  }

  score = Math.min(100, Math.max(0, score));

  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  let gradeLabel = 'Risiko Kritis';

  if (score >= 90) {
    grade = 'A';
    gradeLabel = 'Sangat Aman (Hardened)';
  } else if (score >= 75) {
    grade = 'B';
    gradeLabel = 'Cukup Aman (Baik)';
  } else if (score >= 60) {
    grade = 'C';
    gradeLabel = 'Perlu Perhatian';
  } else if (score >= 40) {
    grade = 'D';
    gradeLabel = 'Rentan';
  } else {
    grade = 'F';
    gradeLabel = 'Bahaya Tinggi';
  }

  const passCount = items.filter((i) => i.status === 'pass').length;
  const warnCount = items.filter((i) => i.status === 'warn').length;
  const failCount = items.filter((i) => i.status === 'fail').length;

  return {
    score,
    grade,
    gradeLabel,
    summary: {
      pass: passCount,
      warn: warnCount,
      fail: failCount,
      total: items.length
    },
    items,
    rawOutput: raw,
    timestamp: new Date().toLocaleTimeString()
  };
}
