export type OsFamily = 'debian' | 'rhel' | 'alpine' | 'arch' | 'unknown';

export interface OsInfo {
  id: string;
  name: string;
  version: string;
  family: OsFamily;
}

export type SoftwareCategory = 'web' | 'database' | 'runtime' | 'tools' | 'containers' | 'security';

export interface SoftwareCheatsheet {
  summary: string;
  configFiles: { label: string; path: string }[];
  commonCommands: { label: string; cmd: string }[];
  sampleConfig?: { title: string; filename: string; code: string };
}

export interface SoftwareDefinition {
  id: string;
  name: string;
  category: SoftwareCategory;
  icon: string;
  description: string;
  checkCmd: string;
  versionCmd: string;
  defaultPort?: number | string;
  configPath?: string;
  cheatsheet: SoftwareCheatsheet;
  getInstallSteps: (os: OsInfo) => { stepName: string; cmd: string }[];
}

export interface StackPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  packages: string[];
}

export interface DetectionResult {
  installed: boolean;
  version?: string;
}

/**
 * Clean raw CLI version output into a concise version badge (e.g., '1.1.29', '20.11.0', 'go1.22.1')
 */
export function cleanVersionString(raw: string): string {
  if (!raw) return 'Terpasang';
  let str = raw.trim();

  // Java: openjdk version "21.0.2" or java version "17.0.9"
  const javaMatch = str.match(/(?:openjdk|java)\s+version\s+["']?([0-9._]+)["']?/i);
  if (javaMatch && javaMatch[1]) return javaMatch[1];

  // Deno: deno 1.41.0
  const denoMatch = str.match(/deno\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (denoMatch && denoMatch[1]) return denoMatch[1];

  // Go: go version go1.22.1
  const goMatch = str.match(/go([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (goMatch && goMatch[0]) return goMatch[0];

  // Composer: Composer version 2.7.2
  const compMatch = str.match(/Composer\s+version\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (compMatch && compMatch[1]) return compMatch[1];

  // Docker: Docker version 26.0.0
  const dockerMatch = str.match(/Docker\s+version\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (dockerMatch && dockerMatch[1]) return dockerMatch[1];

  // Redis: Redis server v=7.0.15
  const redisMatch = str.match(/v=([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (redisMatch && redisMatch[1]) return redisMatch[1];

  // PostgreSQL: psql (PostgreSQL) 15.6
  const pgMatch = str.match(/PostgreSQL\)\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (pgMatch && pgMatch[1]) return pgMatch[1];

  // PHP: PHP 8.2.10
  const phpMatch = str.match(/PHP\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (phpMatch && phpMatch[1]) return phpMatch[1];

  // MariaDB: mysql Ver 15.1 Distrib 10.6.18-MariaDB, mariadbd Ver 10.11.6-MariaDB, or 11.2.2-MariaDB
  const mariaMatch = str.match(/(?:Distrib\s+|mariadb\s+(?:from\s+)?|Ver\s+)?([0-9]+\.[0-9]+(\.[0-9]+)?)-MariaDB/i)
    || str.match(/mariadb\s+(?:from\s+)?([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (mariaMatch && mariaMatch[1]) return mariaMatch[1];

  // MySQL: mysql Ver 8.0.36
  const sqlMatch = str.match(/Ver\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (sqlMatch && sqlMatch[1]) return sqlMatch[1];

  // Python: Python 3.10.12
  const pyMatch = str.match(/Python\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (pyMatch && pyMatch[1]) return pyMatch[1];

  // Ruby: ruby 3.2.3
  const rubyMatch = str.match(/ruby\s+([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
  if (rubyMatch && rubyMatch[1]) return rubyMatch[1];

  // Common prefixes strip
  str = str.replace(/^(nginx\s*version:\s*nginx\/|nginx\/|version\s*|v)/i, '').trim();

  // Clean semver at start (e.g. Bun "1.1.29")
  const startMatch = str.match(/^([0-9]+\.[0-9]+(\.[0-9]+)?)/);
  if (startMatch && startMatch[1]) {
    return startMatch[1];
  }

  // Any 3-part semver pattern first (e.g. 10.6.18, 1.1.29)
  const threePart = str.match(/([0-9]+\.[0-9]+\.[0-9]+)/);
  if (threePart && threePart[1]) {
    return threePart[1];
  }

  // Any 2-part semver pattern (e.g. 10.6, 8.0)
  const anySemver = str.match(/([0-9]+\.[0-9]+)/);
  if (anySemver && anySemver[1]) {
    return anySemver[1];
  }

  return 'Terpasang';
}

/**
 * Generate appropriate upgrade command for a specific installed software
 */
export function getPackageUpdateCommand(sw: SoftwareDefinition, os: OsInfo): string {
  // Self-upgrading tools (native upstream CLI)
  if (sw.id === 'bun') return 'bun upgrade';
  if (sw.id === 'deno') return 'deno upgrade';
  if (sw.id === 'composer') return 'sudo composer self-update';
  if (sw.id === 'rust') return 'rustup update';
  if (sw.id === 'pm2') return 'sudo npm install -g pm2@latest && (command -v timeout >/dev/null 2>&1 && timeout 15 pm2 update </dev/null || pm2 update </dev/null || true) && (pm2 save 2>/dev/null || true)';
  if (sw.id === 'pnpm') return 'pnpm self-update 2>/dev/null || sudo npm install -g pnpm@latest';
  if (sw.id === 'docker') {
    if (os.family === 'alpine') return 'sudo apk update && sudo apk upgrade docker docker-cli-compose && sudo rc-service docker restart 2>/dev/null || true';
    if (os.family === 'arch') return 'sudo pacman -Sy --noconfirm docker docker-compose && sudo systemctl restart docker 2>/dev/null || true';
    return 'curl -fsSL https://get.docker.com | sudo sh && sudo systemctl restart docker';
  }

  // Nginx
  if (sw.id === 'nginx') {
    if (os.family === 'debian') {
      return 'sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install --only-upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nginx && sudo systemctl restart nginx';
    }
    if (os.family === 'rhel') {
      return 'sudo dnf upgrade -y nginx && sudo systemctl restart nginx';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade nginx && sudo rc-service nginx restart 2>/dev/null || true';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm nginx && sudo systemctl restart nginx';
    }
  }

  // Node.js upstream LTS (NodeSource)
  if (sw.id === 'nodejs') {
    if (os.family === 'rhel') {
      return 'curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - && sudo dnf install -y nodejs';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade nodejs npm';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm nodejs npm';
    }
    return 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 bash - && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nodejs';
  }

  // PHP upstream (ppa:ondrej/php on Ubuntu / packages.sury.org on Debian)
  if (sw.id === 'php') {
    if (os.id === 'ubuntu') {
      return 'sudo -E env DEBIAN_FRONTEND=noninteractive add-apt-repository -y ppa:ondrej/php && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" php php-fpm php-cli php-curl php-mbstring php-xml php-zip php-gd php-mysql php-pgsql php-sqlite3 php-bcmath';
    }
    if (os.family === 'debian') {
      return 'curl -sSL https://packages.sury.org/php/README.txt | sudo -E env DEBIAN_FRONTEND=noninteractive bash - 2>/dev/null; sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" php php-fpm';
    }
    if (os.family === 'rhel') {
      return 'sudo dnf upgrade -y php php-fpm';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade php php-fpm';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm php php-fpm';
    }
  }

  // Go
  if (sw.id === 'go') {
    if (os.family === 'debian') {
      return 'sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" golang-go';
    }
    if (os.family === 'rhel') {
      return 'sudo dnf upgrade -y golang';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade go';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm go';
    }
  }

  // MariaDB upstream (official repo setup)
  if (sw.id === 'mariadb') {
    if (os.family === 'debian') {
      return 'curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 bash 2>/dev/null; sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" mariadb-server';
    }
    if (os.family === 'rhel') {
      return 'curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash 2>/dev/null; sudo dnf install -y MariaDB-server';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade mariadb mariadb-client';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm mariadb';
    }
  }

  // PostgreSQL upstream (official pgdg repository)
  if (sw.id === 'postgres') {
    if (os.family === 'debian') {
      return 'sudo sh -c "echo \\"deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main\\" > /etc/apt/sources.list.d/pgdg.list" && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg --yes && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" postgresql postgresql-contrib';
    }
    if (os.family === 'rhel') {
      return 'sudo dnf upgrade -y postgresql-server postgresql-contrib 2>/dev/null || sudo yum upgrade -y postgresql-server';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade postgresql postgresql-contrib';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm postgresql';
    }
  }

  // Redis upstream (official redis repository)
  if (sw.id === 'redis') {
    if (os.family === 'debian') {
      return 'curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg --yes 2>/dev/null && echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list 2>/dev/null && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" redis-server && sudo systemctl restart redis-server';
    }
    if (os.family === 'rhel') {
      return 'sudo dnf upgrade -y redis && sudo systemctl restart redis';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade redis && sudo rc-service redis restart 2>/dev/null || true';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm redis && sudo systemctl restart redis';
    }
  }

  // Git
  if (sw.id === 'git') {
    if (os.family === 'debian') {
      return 'sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install --only-upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" git';
    }
    if (os.family === 'rhel') {
      return 'sudo dnf upgrade -y git';
    }
    if (os.family === 'alpine') {
      return 'sudo apk update && sudo apk upgrade git';
    }
    if (os.family === 'arch') {
      return 'sudo pacman -Sy --noconfirm git';
    }
  }

  // Caddy upstream
  if (sw.id === 'caddy') {
    if (os.family === 'alpine') return 'sudo apk update && sudo apk upgrade caddy';
    if (os.family === 'arch') return 'sudo pacman -Sy --noconfirm caddy';
    return 'sudo caddy upgrade 2>/dev/null || (curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes 2>/dev/null && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" caddy)';
  }

  // Certbot upstream
  if (sw.id === 'certbot') {
    if (os.family === 'alpine') return 'sudo apk update && sudo apk upgrade certbot certbot-nginx';
    if (os.family === 'arch') return 'sudo pacman -Sy --noconfirm certbot certbot-nginx';
    return 'sudo snap refresh certbot 2>/dev/null || (sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get update -y && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1 apt-get install --only-upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" certbot python3-certbot-nginx)';
  }

  let pkgName = sw.checkCmd;
  if (sw.id === 'mariadb') {
    pkgName = (os.family === 'arch' || os.family === 'alpine') ? 'mariadb' : 'mariadb-server';
  } else if (sw.id === 'mysql') {
    pkgName = (os.family === 'arch' || os.family === 'alpine') ? 'mariadb' : 'mysql-server';
  } else if (sw.id === 'go') {
    pkgName = (os.family === 'debian') ? 'golang-go' : (os.family === 'rhel') ? 'golang' : 'go';
  } else if (sw.id === 'apache') {
    pkgName = (os.family === 'rhel' || os.family === 'arch') ? 'httpd' : 'apache2';
  } else if (sw.id === 'nodejs') {
    pkgName = 'nodejs';
  } else if (sw.id === 'python') {
    pkgName = (os.family === 'arch') ? 'python' : 'python3';
  } else if (sw.id === 'ruby') {
    pkgName = (os.family === 'debian') ? 'ruby-full' : 'ruby';
  } else if (sw.id === 'java') {
    pkgName = (os.family === 'debian') ? 'default-jdk' : (os.family === 'alpine') ? 'openjdk17' : (os.family === 'arch') ? 'jdk-openjdk' : 'java-latest-openjdk-devel';
  }

  if (os.family === 'rhel') {
    return `sudo dnf upgrade -y ${pkgName}`;
  }
  if (os.family === 'alpine') {
    return `sudo apk update && sudo apk upgrade ${pkgName}`;
  }
  if (os.family === 'arch') {
    return `sudo pacman -Sy --noconfirm ${pkgName}`;
  }

  return `sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 apt-get update && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 apt-get install --only-upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" ${pkgName}`;
}

/**
 * Generate a clean, distro-aware uninstall command for a software package
 */
export function getPackageUninstallCommand(sw: SoftwareDefinition, os: OsInfo): string {
  // User-space tools
  if (sw.id === 'deno') {
    return [
      'rm -rf "$HOME/.deno" 2>/dev/null || true',
      'sudo rm -rf /root/.deno 2>/dev/null || true',
      'sudo rm -f /usr/local/bin/deno /usr/bin/deno 2>/dev/null || rm -f /usr/local/bin/deno 2>/dev/null || true',
      'echo "Deno berhasil dihapus"'
    ].join('\n');
  }
  if (sw.id === 'bun') {
    return [
      'rm -rf "$HOME/.bun" 2>/dev/null || true',
      'sudo rm -rf /root/.bun 2>/dev/null || true',
      'sudo rm -f /usr/local/bin/bun /usr/bin/bun 2>/dev/null || rm -f /usr/local/bin/bun 2>/dev/null || true',
      'echo "Bun berhasil dihapus"'
    ].join('\n');
  }
  if (sw.id === 'pnpm') {
    return [
      'sudo npm uninstall -g pnpm 2>/dev/null || npm uninstall -g pnpm 2>/dev/null || true',
      'sudo rm -f /usr/local/bin/pnpm /usr/bin/pnpm "$HOME/.local/share/pnpm/pnpm" "$HOME/.bun/bin/pnpm" 2>/dev/null || true',
      'rm -rf "$HOME/.local/share/pnpm" "$HOME/.pnpm-state" "$HOME/.pnpm" 2>/dev/null || true',
      'sudo rm -rf /root/.local/share/pnpm 2>/dev/null || true',
      'echo "PNPM berhasil dihapus"'
    ].join('\n');
  }
  if (sw.id === 'rust') {
    return [
      'rustup self uninstall -y 2>/dev/null || true',
      'rm -rf "$HOME/.cargo" "$HOME/.rustup" 2>/dev/null || true',
      'sudo rm -rf /root/.cargo /root/.rustup 2>/dev/null || true',
      'sudo rm -f /usr/local/bin/cargo /usr/local/bin/rustc /usr/bin/cargo /usr/bin/rustc 2>/dev/null || true',
      'echo "Rust berhasil dihapus"'
    ].join('\n');
  }
  if (sw.id === 'composer') {
    return 'sudo rm -f /usr/local/bin/composer /usr/bin/composer "$HOME/.config/composer" 2>/dev/null || true; echo "Composer berhasil dihapus"';
  }
  if (sw.id === 'pm2') {
    return 'sudo npm uninstall -g pm2 2>/dev/null || npm uninstall -g pm2 2>/dev/null || true; sudo rm -f /usr/local/bin/pm2 /usr/bin/pm2 2>/dev/null || true; echo "PM2 berhasil dihapus"';
  }

  // System services & daemons
  const isDebian = os.family === 'debian';
  const isRhel = os.family === 'rhel';
  const isAlpine = os.family === 'alpine';
  const isArch = os.family === 'arch';

  if (sw.id === 'go') {
    if (isDebian) return 'sudo apt-get purge -y \'golang*\' 2>/dev/null; sudo apt-get autoremove -y 2>/dev/null; sudo rm -rf /usr/local/go 2>/dev/null; sudo rm -f /usr/local/bin/go /usr/local/bin/gofmt /usr/bin/go /usr/bin/gofmt 2>/dev/null; echo "Go berhasil dihapus"';
    if (isRhel) return 'sudo dnf remove -y golang 2>/dev/null; sudo rm -rf /usr/local/go 2>/dev/null; sudo rm -f /usr/local/bin/go /usr/local/bin/gofmt 2>/dev/null; echo "Go berhasil dihapus"';
    if (isAlpine) return 'sudo apk del go 2>/dev/null; sudo rm -rf /usr/local/go 2>/dev/null; echo "Go berhasil dihapus"';
    if (isArch) return 'sudo pacman -R --noconfirm go 2>/dev/null; sudo rm -rf /usr/local/go 2>/dev/null; echo "Go berhasil dihapus"';
  }

  if (sw.id === 'nginx') {
    if (isDebian) return 'sudo systemctl stop nginx 2>/dev/null; sudo apt-get purge -y nginx nginx-common nginx-core \'nginx*\' 2>/dev/null; sudo apt-get autoremove -y 2>/dev/null; sudo rm -rf /etc/nginx /usr/sbin/nginx 2>/dev/null';
    if (isRhel) return 'sudo systemctl stop nginx 2>/dev/null; sudo dnf remove -y nginx';
    if (isAlpine) return 'sudo rc-service nginx stop 2>/dev/null || true; sudo apk del nginx';
    if (isArch) return 'sudo systemctl stop nginx 2>/dev/null; sudo pacman -R --noconfirm nginx';
  }

  if (sw.id === 'caddy') {
    if (isDebian) return 'sudo systemctl stop caddy 2>/dev/null; sudo apt-get purge -y caddy 2>/dev/null; sudo rm -f /usr/bin/caddy /usr/local/bin/caddy';
    if (isRhel) return 'sudo systemctl stop caddy 2>/dev/null; sudo dnf remove -y caddy';
    if (isAlpine) return 'sudo rc-service caddy stop 2>/dev/null || true; sudo apk del caddy';
    if (isArch) return 'sudo systemctl stop caddy 2>/dev/null; sudo pacman -R --noconfirm caddy';
  }

  if (sw.id === 'apache') {
    if (isDebian) return 'sudo systemctl stop apache2 2>/dev/null; sudo apt-get purge -y apache2 apache2-bin apache2-data apache2-utils \'apache2*\' 2>/dev/null; sudo apt-get autoremove -y 2>/dev/null; sudo rm -rf /etc/apache2 /usr/sbin/apache2 2>/dev/null';
    if (isRhel) return 'sudo systemctl stop httpd 2>/dev/null; sudo dnf remove -y httpd';
    if (isAlpine) return 'sudo rc-service apache2 stop 2>/dev/null || true; sudo apk del apache2';
    if (isArch) return 'sudo systemctl stop httpd 2>/dev/null; sudo pacman -R --noconfirm apache';
  }

  if (sw.id === 'docker') {
    if (isDebian) return 'sudo systemctl stop docker 2>/dev/null; sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin 2>/dev/null || sudo apt-get remove -y docker docker-engine docker.io containerd runc';
    if (isRhel) return 'sudo systemctl stop docker 2>/dev/null; sudo dnf remove -y docker-ce docker-ce-cli containerd.io';
    if (isAlpine) return 'sudo rc-service docker stop 2>/dev/null || true; sudo apk del docker docker-cli-compose';
    if (isArch) return 'sudo systemctl stop docker 2>/dev/null; sudo pacman -R --noconfirm docker docker-compose';
  }

  if (sw.id === 'mysql') {
    if (isDebian) return 'sudo systemctl stop mysql 2>/dev/null; sudo apt-get purge -y mysql-server mysql-client 2>/dev/null';
    if (isRhel) return 'sudo systemctl stop mysqld 2>/dev/null; sudo dnf remove -y mysql-server mysql';
    if (isAlpine) return 'sudo rc-service mariadb stop 2>/dev/null || true; sudo apk del mariadb mariadb-client';
    if (isArch) return 'sudo systemctl stop mariadb 2>/dev/null; sudo pacman -R --noconfirm mariadb';
  }

  if (sw.id === 'mariadb') {
    if (isDebian) return 'sudo systemctl stop mariadb 2>/dev/null; sudo apt-get purge -y mariadb-server mariadb-client 2>/dev/null';
    if (isRhel) return 'sudo systemctl stop mariadb 2>/dev/null; sudo dnf remove -y MariaDB-server MariaDB-client';
    if (isAlpine) return 'sudo rc-service mariadb stop 2>/dev/null || true; sudo apk del mariadb mariadb-client';
    if (isArch) return 'sudo systemctl stop mariadb 2>/dev/null; sudo pacman -R --noconfirm mariadb';
  }

  if (sw.id === 'postgres') {
    if (isDebian) return 'sudo systemctl stop postgresql 2>/dev/null; sudo apt-get purge -y postgresql postgresql-contrib 2>/dev/null';
    if (isRhel) return 'sudo systemctl stop postgresql 2>/dev/null; sudo dnf remove -y postgresql-server postgresql';
    if (isAlpine) return 'sudo rc-service postgresql stop 2>/dev/null || true; sudo apk del postgresql postgresql-contrib';
    if (isArch) return 'sudo systemctl stop postgresql 2>/dev/null; sudo pacman -R --noconfirm postgresql';
  }

  if (sw.id === 'redis') {
    if (isDebian) return 'sudo systemctl stop redis-server 2>/dev/null; sudo apt-get purge -y redis-server redis-tools 2>/dev/null';
    if (isRhel) return 'sudo systemctl stop redis 2>/dev/null; sudo dnf remove -y redis';
    if (isAlpine) return 'sudo rc-service redis stop 2>/dev/null || true; sudo apk del redis';
    if (isArch) return 'sudo systemctl stop redis 2>/dev/null; sudo pacman -R --noconfirm redis';
  }

  if (sw.id === 'ufw') {
    return 'sudo ufw disable 2>/dev/null; sudo apt-get remove -y ufw 2>/dev/null || sudo dnf remove -y ufw 2>/dev/null || sudo apk del ufw 2>/dev/null || sudo pacman -R --noconfirm ufw 2>/dev/null || true';
  }

  if (sw.id === 'fail2ban') {
    if (isAlpine) return 'sudo rc-service fail2ban stop 2>/dev/null || true; sudo apk del fail2ban';
    if (isArch) return 'sudo systemctl stop fail2ban 2>/dev/null; sudo pacman -R --noconfirm fail2ban';
    return 'sudo systemctl stop fail2ban 2>/dev/null; sudo apt-get purge -y fail2ban 2>/dev/null || sudo dnf remove -y fail2ban';
  }

  if (sw.id === 'supervisor') {
    if (isAlpine) return 'sudo rc-service supervisord stop 2>/dev/null || true; sudo apk del supervisor';
    if (isArch) return 'sudo systemctl stop supervisor 2>/dev/null; sudo pacman -R --noconfirm supervisor';
    return 'sudo systemctl stop supervisor 2>/dev/null; sudo apt-get purge -y supervisor 2>/dev/null || sudo dnf remove -y supervisor';
  }

  if (sw.id === 'certbot') {
    if (isAlpine) return 'sudo apk del certbot certbot-nginx';
    if (isArch) return 'sudo pacman -R --noconfirm certbot certbot-nginx';
    return 'sudo snap remove certbot 2>/dev/null; sudo apt-get purge -y certbot 2>/dev/null || sudo dnf remove -y certbot';
  }

  // Fallback generic package removal
  let pkgName = sw.checkCmd;
  if (sw.id === 'mariadb') {
    pkgName = (isArch || isAlpine) ? 'mariadb' : 'mariadb-server';
  } else if (sw.id === 'mysql') {
    pkgName = (isArch || isAlpine) ? 'mariadb' : 'mysql-server';
  } else if (sw.id === 'go') {
    pkgName = isDebian ? 'golang-go' : isRhel ? 'golang' : 'go';
  } else if (sw.id === 'node') {
    pkgName = 'nodejs';
  } else if (sw.id === 'java') {
    pkgName = isDebian ? 'default-jdk' : isAlpine ? 'openjdk17' : isArch ? 'jdk-openjdk' : 'java-latest-openjdk-devel';
  }

  if (isRhel) {
    return `sudo dnf remove -y ${pkgName}`;
  }
  if (isAlpine) {
    return `sudo apk del ${pkgName}`;
  }
  if (isArch) {
    return `sudo pacman -R --noconfirm ${pkgName}`;
  }

  return `sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get remove -y ${pkgName}`;
}

/**
 * Wrap a single action (e.g. Uninstall, Update, or System Upgrade) in an isolated script
 * protected by /tmp/boba-setup.lock to prevent concurrent execution collisions.
 */
export function buildSingleActionScript(actionTitle: string, cmd: string, options?: { wrapNohup?: boolean }): string {
  const baseScript = [
    '#!/usr/bin/env bash',
    '# Ensure non-interactive execution and keep existing configurations by default',
    'export DEBIAN_FRONTEND=noninteractive',
    'export NEEDRESTART_MODE=a',
    'export NEEDRESTART_SUSPEND=1',
    'export UCF_FORCE_CONFFOLD=1',
    'export APT_LISTCHANGES_FRONTEND=none',
    '',
    '# Automatically set non-interactive dpkg force-confdef & force-confold rules for apt',
    'if command -v apt-get >/dev/null 2>&1 && [ -d /etc/apt/apt.conf.d ]; then',
    '  sudo -n tee /etc/apt/apt.conf.d/99boba-noninteractive >/dev/null 2>&1 << \'BOBA_APT_EOF\' || true',
    'Dpkg::Options {',
    '   "--force-confdef";',
    '   "--force-confold";',
    '}',
    'APT::Get::Assume-Yes "true";',
    'BOBA_APT_EOF',
    'fi',
    '',
    'LOCK_FILE="/tmp/boba-setup.lock"',
    'echo "$$" > "$LOCK_FILE"',
    'cleanup() {',
    '  rm -f "$LOCK_FILE" 2>/dev/null || true',
    '  sudo -n rm -f /etc/apt/apt.conf.d/99boba-noninteractive 2>/dev/null || true',
    '}',
    'trap cleanup EXIT INT TERM',
    '',
    'echo ""',
    'echo -e "\\033[1;35m============================================================\\033[0m"',
    `echo -e "\\033[1;33m[BOBA Action] ${actionTitle}\\033[0m"`,
    'echo -e "\\033[1;35m============================================================\\033[0m"',
    '',
    cmd,
    '',
    'echo ""',
    'echo -e "\\033[1;35m============================================================\\033[0m"',
    `echo -e "\\033[1;32m✓ Selesai: ${actionTitle}\\033[0m"`,
    'echo -e "\\033[1;35m============================================================\\033[0m"'
  ].join('\n');

  if (options?.wrapNohup) {
    return [
      '# Bersihkan file script dan log lama',
      'rm -f /tmp/boba-setup.sh /tmp/boba-setup.lock 2>/dev/null || true',
      'cat << \'BOBA_ACTION_EOF\' > /tmp/boba-setup.sh',
      baseScript,
      'BOBA_ACTION_EOF',
      'chmod +x /tmp/boba-setup.sh',
      '',
      '# Jalankan script via nohup dan pantau log live',
      'nohup /tmp/boba-setup.sh > /tmp/boba-setup.log 2>&1 &',
      'SETUP_PID=$!',
      'echo ""',
      'echo -e "\\033[1;35m============================================================\\033[0m"',
      `echo -e "\\033[1;32m🚀 ${actionTitle} sedang berjalan di BACKGROUND (PID: $SETUP_PID)\\033[0m"`,
      'echo -e "\\033[1;36mFile log tersimpan di: /tmp/boba-setup.log\\033[0m"',
      'echo -e "\\033[1;35m============================================================\\033[0m"',
      'echo -e "Memantau log proses (Tekan Ctrl+C kapan saja untuk keluar pantauan tanpa mematikan proses):\\n"',
      'sleep 1',
      'tail -f /tmp/boba-setup.log'
    ].join('\n');
  }

  return baseScript;
}

/**
 * Build command to check if an installation or package manager is actively running on server
 */
export function buildRunningCheckCommand(): string {
  return [
    'if [ -f /tmp/boba-setup.lock ]; then',
    '  PID=$(cat /tmp/boba-setup.lock 2>/dev/null || echo "")',
    '  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then',
    '    echo "RUNNING:$PID"',
    '    exit 0',
    '  else',
    '    rm -f /tmp/boba-setup.lock',
    '  fi',
    'fi',
    'BOBA_PID=$(pgrep -f "[b]oba-setup\\.sh" 2>/dev/null | grep -v "^$$\$" | head -n 1 || true)',
    'if [ -n "$BOBA_PID" ]; then',
    '  echo "RUNNING:$BOBA_PID"',
    'elif [ -f /var/lib/dpkg/lock-frontend ] && fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1; then',
    '  echo "SYSTEM_BUSY:apt"',
    'elif [ -f /var/lib/rpm/.rpm.lock ] && fuser /var/lib/rpm/.rpm.lock >/dev/null 2>&1; then',
    '  echo "SYSTEM_BUSY:dnf"',
    'else',
    '  echo "IDLE"',
    'fi'
  ].join('\n');
}

/**
 * Parse running check command output
 */
export function parseRunningStatus(raw: string): { isRunning: boolean; pid?: string; reason?: 'boba' | 'system' } {
  const trimmed = (raw || '').trim();
  if (trimmed.includes('RUNNING:')) {
    const match = trimmed.match(/RUNNING:(\d+)/);
    return { isRunning: true, pid: match ? match[1] : undefined, reason: 'boba' };
  }
  if (trimmed.includes('SYSTEM_BUSY:')) {
    const match = trimmed.match(/SYSTEM_BUSY:([a-zA-Z0-9_-]+)/);
    return { isRunning: true, pid: match ? match[1] : 'apt', reason: 'system' };
  }
  return { isRunning: false };
}

/**
 * Build command to terminate a running BOBA setup process on server
 */
export function buildKillSetupCommand(): string {
  return [
    'PID=$(cat /tmp/boba-setup.lock 2>/dev/null || echo "")',
    'if [ -n "$PID" ]; then',
    '  kill -9 "$PID" 2>/dev/null || true',
    '  sudo -n kill -9 "$PID" 2>/dev/null || true',
    'fi',
    'pkill -9 -f "boba-setup" 2>/dev/null || true',
    'sudo -n pkill -9 -f "boba-setup" 2>/dev/null || true',
    'pkill -9 -f "whiptail" 2>/dev/null || true',
    'sudo -n pkill -9 -f "whiptail" 2>/dev/null || true',
    'pkill -9 -f "needrestart" 2>/dev/null || true',
    'sudo -n pkill -9 -f "needrestart" 2>/dev/null || true',
    'pkill -9 -f "frontend" 2>/dev/null || true',
    'sudo -n pkill -9 -f "frontend" 2>/dev/null || true',
    'pkill -9 -f "pm2 update" 2>/dev/null || true',
    'sudo -n pkill -9 -f "pm2 update" 2>/dev/null || true',
    'rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh 2>/dev/null || true',
    'sudo -n rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh /etc/apt/apt.conf.d/99boba-noninteractive 2>/dev/null || true',
    'echo "STOPPED"'
  ].join('\n');
}

/**
 * Parse /etc/os-release raw output into structured OsInfo
 */
export function parseOsRelease(raw: string): OsInfo {
  const result: Record<string, string> = {};
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }

  const id = (result.ID || '').toLowerCase();
  const idLike = (result.ID_LIKE || '').toLowerCase();
  const version = result.VERSION_ID || result.VERSION || '';
  const name = result.PRETTY_NAME || result.NAME || id || 'Linux';

  let family: OsFamily = 'unknown';

  if (
    id === 'ubuntu' ||
    id === 'debian' ||
    id === 'pop' ||
    id === 'linuxmint' ||
    id === 'raspbian' ||
    idLike.includes('debian') ||
    idLike.includes('ubuntu')
  ) {
    family = 'debian';
  } else if (
    id === 'rhel' ||
    id === 'centos' ||
    id === 'rocky' ||
    id === 'almalinux' ||
    id === 'fedora' ||
    id === 'amzn' ||
    idLike.includes('rhel') ||
    idLike.includes('fedora') ||
    idLike.includes('centos')
  ) {
    family = 'rhel';
  } else if (id === 'alpine') {
    family = 'alpine';
  } else if (id === 'arch' || id === 'manjaro' || idLike.includes('arch')) {
    family = 'arch';
  }

  return { id, name, version, family };
}

/**
 * Build a robust bash command for SSH execution that detects tools across standard & custom user directories
 */
export function buildDetectionCommand(softwares: SoftwareDefinition[]): string {
  const toolCalls = softwares
    .map(
      (s) =>
        `check_tool "${s.id}" "${s.checkCmd.replace(/"/g, '\\"')}" "${s.versionCmd.replace(/"/g, '\\"')}"`
    )
    .join('\n');

  return `
# Comprehensive PATH expansion for non-interactive SSH shells (including sbin for daemons)
export PATH="/usr/local/sbin:/usr/sbin:/sbin:$HOME/.bun/bin:$HOME/.deno/bin:$HOME/.cargo/bin:$HOME/.local/bin:$HOME/.local/share/pnpm:$HOME/.local/share/fnm:/usr/local/go/bin:$HOME/go/bin:/usr/local/bin:/usr/bin:/bin:/snap/bin:$PATH"

# Load profile & environment files if available
[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1
[ -f "$HOME/.bash_profile" ] && . "$HOME/.bash_profile" >/dev/null 2>&1
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc" >/dev/null 2>&1

# NVM support
if [ -z "$(command -v node 2>/dev/null)" ] && [ -d "$HOME/.nvm" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
fi

find_candidate() {
  local chk="$1"

  # Database checks: MariaDB vs MySQL discrimination
  if [ "$chk" = "mariadb" ]; then
    command -v mariadb >/dev/null 2>&1 && command -v mariadb && return 0
    command -v mariadbd >/dev/null 2>&1 && command -v mariadbd && return 0
    for p in /usr/bin/mariadb /usr/sbin/mariadbd /usr/local/bin/mariadb /usr/local/mysql/bin/mariadb /usr/libexec/mariadbd /usr/bin/mariadb-admin /usr/bin/mariadb-check; do
      [ -x "$p" ] && echo "$p" && return 0
    done
    if command -v mysql >/dev/null 2>&1 && mysql --version 2>&1 | grep -iq "mariadb"; then
      command -v mysql && return 0
    fi
    if command -v mysqld >/dev/null 2>&1 && mysqld --version 2>&1 | grep -iq "mariadb"; then
      command -v mysqld && return 0
    fi
    for p in /usr/bin/mysql /usr/sbin/mysqld /usr/libexec/mysqld /usr/local/bin/mysql; do
      [ -x "$p" ] && "$p" --version 2>&1 | grep -iq "mariadb" && echo "$p" && return 0
    done
    if systemctl is-active --quiet mariadb 2>/dev/null || systemctl is-active --quiet mariadbd 2>/dev/null; then
      for p in /usr/bin/mariadb /usr/sbin/mariadbd /usr/bin/mysql /usr/sbin/mysqld; do
        [ -x "$p" ] && echo "$p" && return 0
      done
      echo "mariadb-service" && return 0
    fi
    if dpkg -l 'mariadb-server*' 2>/dev/null | grep -q '^ii'; then
      for p in /usr/bin/mariadb /usr/sbin/mariadbd /usr/bin/mysql /usr/sbin/mysqld; do
        [ -x "$p" ] && echo "$p" && return 0
      done
      echo "mariadb-pkg" && return 0
    fi
    if rpm -q mariadb-server >/dev/null 2>&1 || rpm -q MariaDB-server >/dev/null 2>&1; then
      for p in /usr/bin/mariadb /usr/sbin/mariadbd /usr/bin/mysql /usr/sbin/mysqld; do
        [ -x "$p" ] && echo "$p" && return 0
      done
      echo "mariadb-rpm" && return 0
    fi
    if apk info -e mariadb >/dev/null 2>&1; then
      echo "/etc/init.d/mariadb" && return 0
    fi
    if pacman -Q mariadb >/dev/null 2>&1; then
      echo "/usr/bin/mariadb" && return 0
    fi
    if pgrep -x mariadbd >/dev/null 2>&1; then
      for p in /usr/bin/mariadb /usr/sbin/mariadbd /usr/bin/mysql /usr/sbin/mysqld; do
        [ -x "$p" ] && echo "$p" && return 0
      done
      echo "mariadb-proc" && return 0
    fi
    return 1
  fi

  if [ "$chk" = "mysql" ]; then
    if command -v mysql >/dev/null 2>&1; then
      if ! mysql --version 2>&1 | grep -iq "mariadb"; then
        command -v mysql && return 0
      fi
    fi
    if command -v mysqld >/dev/null 2>&1; then
      if ! mysqld --version 2>&1 | grep -iq "mariadb"; then
        command -v mysqld && return 0
      fi
    fi
    for p in /usr/sbin/mysqld /usr/libexec/mysqld /usr/local/mysql/bin/mysql; do
      [ -x "$p" ] && ! "$p" --version 2>&1 | grep -iq "mariadb" && echo "$p" && return 0
    done
    return 1
  fi

  if [ "$chk" = "psql" ]; then
    command -v psql >/dev/null 2>&1 && command -v psql && return 0
    for p in $(ls -d /usr/lib/postgresql/*/bin/psql 2>/dev/null | tail -n 1); do
      [ -x "$p" ] && echo "$p" && return 0
    done
    command -v postgres >/dev/null 2>&1 && command -v postgres && return 0
    for p in $(ls -d /usr/lib/postgresql/*/bin/postgres 2>/dev/null | tail -n 1); do
      [ -x "$p" ] && echo "$p" && return 0
    done
    return 1
  fi

  if [ "$chk" = "redis-server" ]; then
    command -v redis-server >/dev/null 2>&1 && command -v redis-server && return 0
    command -v redis-cli >/dev/null 2>&1 && command -v redis-cli && return 0
    for p in /usr/bin/redis-server /usr/sbin/redis-server /usr/local/bin/redis-server /usr/bin/redis-cli; do
      [ -x "$p" ] && echo "$p" && return 0
    done
    return 1
  fi

  # Standard command -v
  if command -v "$chk" >/dev/null 2>&1; then
    command -v "$chk"
    return 0
  fi

  case "$chk" in
    bun)
      [ -x "$HOME/.bun/bin/bun" ] && echo "$HOME/.bun/bin/bun" && return 0
      [ -x "/usr/local/bin/bun" ] && echo "/usr/local/bin/bun" && return 0
      for udir in /home/*; do
        [ -x "$udir/.bun/bin/bun" ] && echo "$udir/.bun/bin/bun" && return 0
      done
      [ -x "/root/.bun/bin/bun" ] && echo "/root/.bun/bin/bun" && return 0
      ;;
    deno)
      [ -x "$HOME/.deno/bin/deno" ] && echo "$HOME/.deno/bin/deno" && return 0
      [ -x "/usr/local/bin/deno" ] && echo "/usr/local/bin/deno" && return 0
      for udir in /home/*; do
        [ -x "$udir/.deno/bin/deno" ] && echo "$udir/.deno/bin/deno" && return 0
      done
      [ -x "/root/.deno/bin/deno" ] && echo "/root/.deno/bin/deno" && return 0
      ;;
    node)
      for p in $(ls -d "$HOME/.nvm/versions/node/"*"/bin/node" 2>/dev/null | tail -n 1); do
        [ -x "$p" ] && echo "$p" && return 0
      done
      for p in $(ls -d /home/*/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1); do
        [ -x "$p" ] && echo "$p" && return 0
      done
      for p in $(ls -d /root/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1); do
        [ -x "$p" ] && echo "$p" && return 0
      done
      [ -x "/usr/local/bin/node" ] && echo "/usr/local/bin/node" && return 0
      [ -x "/snap/bin/node" ] && echo "/snap/bin/node" && return 0
      ;;
    go)
      [ -x "/usr/local/go/bin/go" ] && echo "/usr/local/go/bin/go" && return 0
      [ -x "$HOME/go/bin/go" ] && echo "$HOME/go/bin/go" && return 0
      for udir in /home/*; do
        [ -x "$udir/go/bin/go" ] && echo "$udir/go/bin/go" && return 0
      done
      [ -x "/root/go/bin/go" ] && echo "/root/go/bin/go" && return 0
      ;;
    rustc)
      [ -x "$HOME/.cargo/bin/rustc" ] && echo "$HOME/.cargo/bin/rustc" && return 0
      for udir in /home/*; do
        [ -x "$udir/.cargo/bin/rustc" ] && echo "$udir/.cargo/bin/rustc" && return 0
      done
      [ -x "/root/.cargo/bin/rustc" ] && echo "/root/.cargo/bin/rustc" && return 0
      ;;
    composer)
      [ -x "/usr/local/bin/composer" ] && echo "/usr/local/bin/composer" && return 0
      [ -x "$HOME/.config/composer/vendor/bin/composer" ] && echo "$HOME/.config/composer/vendor/bin/composer" && return 0
      ;;
    pnpm)
      [ -x "$HOME/.local/share/pnpm/pnpm" ] && echo "$HOME/.local/share/pnpm/pnpm" && return 0
      [ -x "$HOME/.bun/bin/pnpm" ] && echo "$HOME/.bun/bin/pnpm" && return 0
      for udir in /home/*; do
        [ -x "$udir/.local/share/pnpm/pnpm" ] && echo "$udir/.local/share/pnpm/pnpm" && return 0
        [ -x "$udir/.bun/bin/pnpm" ] && echo "$udir/.bun/bin/pnpm" && return 0
      done
      ;;
    pm2)
      for p in $(ls -d "$HOME/.nvm/versions/node/"*"/bin/pm2" 2>/dev/null | tail -n 1); do
        [ -x "$p" ] && echo "$p" && return 0
      done
      [ -x "/usr/local/bin/pm2" ] && echo "/usr/local/bin/pm2" && return 0
      ;;
    java)
      for p in $(ls -d /usr/lib/jvm/*/bin/java 2>/dev/null | tail -n 1); do
        [ -x "$p" ] && echo "$p" && return 0
      done
      ;;
    apache2)
      command -v httpd >/dev/null 2>&1 && command -v httpd && return 0
      [ -x "/usr/sbin/apache2" ] && echo "/usr/sbin/apache2" && return 0
      [ -x "/usr/sbin/httpd" ] && echo "/usr/sbin/httpd" && return 0
      ;;
    certbot)
      [ -x "/snap/bin/certbot" ] && echo "/snap/bin/certbot" && return 0
      ;;
    nginx)
      [ -x "/usr/sbin/nginx" ] && echo "/usr/sbin/nginx" && return 0
      ;;
    ufw)
      [ -x "/usr/sbin/ufw" ] && echo "/usr/sbin/ufw" && return 0
      ;;
  esac
  return 1
}

check_tool() {
  local sid="$1"
  local chk="$2"
  local ver="$3"

  local target=$(find_candidate "$chk")
  if [ -n "$target" ]; then
    [ -x "$target" ] && export PATH="$(dirname "$target"):$PATH"
    local v
    v=$(eval "$ver" 2>&1 | head -n 1)
    [ -z "$v" ] && [ -x "$target" ] && v=$("$target" --version 2>&1 | head -n 1)
    [ -z "$v" ] && [ -x "$target" ] && v=$("$target" -v 2>&1 | head -n 1)
    [ -z "$v" ] && v="Terpasang"
    echo "BOBA_CHK:$sid:1:$v"
  else
    echo "BOBA_CHK:$sid:0:"
  fi
}

${toolCalls}
`;
}

/**
 * Parse detection command output into record of status
 */
export function parseDetectionOutput(raw: string): Record<string, DetectionResult> {
  const result: Record<string, DetectionResult> = {};
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('BOBA_CHK:')) continue;

    const parts = trimmed.split(':');
    if (parts.length >= 3) {
      const id = parts[1];
      if (!id) continue;
      const isInstalled = parts[2] === '1';
      const rawVersion = parts.slice(3).join(':').trim();

      const versionBadge = isInstalled ? cleanVersionString(rawVersion) : undefined;

      result[id] = {
        installed: isInstalled,
        version: versionBadge
      };
    }
  }

  return result;
}

export const SOFTWARE_LIST: SoftwareDefinition[] = [
  // WEB SERVERS
  {
    id: 'nginx',
    name: 'Nginx',
    category: 'web',
    icon: 'lucide:globe',
    description: 'High-performance HTTP server & reverse proxy.',
    checkCmd: 'nginx',
    versionCmd: 'nginx -v 2>&1',
    defaultPort: '80 / 443',
    configPath: '/etc/nginx/sites-available/',
    cheatsheet: {
      summary: 'Virtualhost dikonfigurasi di sites-available lalu di-symlink ke sites-enabled. Selalu test konfigurasi sebelum reload.',
      configFiles: [
        { label: 'Main Config', path: '/etc/nginx/nginx.conf' },
        { label: 'Virtual Hosts', path: '/etc/nginx/sites-available/' },
        { label: 'Access Logs', path: '/var/log/nginx/access.log' },
        { label: 'Error Logs', path: '/var/log/nginx/error.log' }
      ],
      commonCommands: [
        { label: 'Test Config', cmd: '$SUDO nginx -t' },
        { label: 'Reload Server', cmd: '$SUDO systemctl reload nginx' },
        { label: 'Restart Server', cmd: '$SUDO systemctl restart nginx' },
        { label: 'Status Service', cmd: '$SUDO systemctl status nginx' }
      ],
      sampleConfig: {
        title: 'Reverse Proxy ke Node / Bun / Go (Port 3000)',
        filename: '/etc/nginx/sites-available/app.conf',
        code: `server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}`
      }
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install Nginx via DNF/YUM', cmd: '$SUDO dnf install -y nginx 2>/dev/null || $SUDO yum install -y nginx' },
          { stepName: 'Enable & Start Nginx Service', cmd: '$SUDO systemctl enable --now nginx' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Nginx via APK', cmd: '$SUDO apk add --no-cache nginx' },
          { stepName: 'Start Nginx Daemon', cmd: '$SUDO rc-update add nginx default 2>/dev/null || true; $SUDO rc-service nginx start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Nginx via Pacman', cmd: '$SUDO pacman -Sy --noconfirm nginx' },
          { stepName: 'Enable & Start Nginx', cmd: '$SUDO systemctl enable --now nginx' }
        ];
      }
      if (os.id === 'ubuntu') {
        return [
          { stepName: 'Install Latest Nginx via APT', cmd: '$SUDO apt-get update -y && $SUDO apt-get install -y nginx' },
          { stepName: 'Enable & Start Nginx Service', cmd: '$SUDO systemctl enable --now nginx' }
        ];
      }
      return [
        { stepName: 'Install Nginx via APT', cmd: '$SUDO apt-get install -y nginx' },
        { stepName: 'Enable & Start Nginx Service', cmd: '$SUDO systemctl enable --now nginx' }
      ];
    }
  },
  {
    id: 'caddy',
    name: 'Caddy',
    category: 'web',
    icon: 'lucide:shield-check',
    description: 'Fast, secure web server with automatic HTTPS Let\'s Encrypt out-of-the-box.',
    checkCmd: 'caddy',
    versionCmd: 'caddy version 2>&1',
    defaultPort: '80 / 443',
    configPath: '/etc/caddy/Caddyfile',
    cheatsheet: {
      summary: 'Caddy otomatis mengurus sertifikat SSL TLS tanpa konfigurasi certbot tambahan.',
      configFiles: [{ label: 'Caddyfile', path: '/etc/caddy/Caddyfile' }],
      commonCommands: [
        { label: 'Format Caddyfile', cmd: '$SUDO caddy fmt --overwrite /etc/caddy/Caddyfile' },
        { label: 'Reload Caddy', cmd: '$SUDO systemctl reload caddy' },
        { label: 'Validate Config', cmd: '$SUDO caddy validate --config /etc/caddy/Caddyfile' }
      ],
      sampleConfig: {
        title: 'Caddyfile Reverse Proxy',
        filename: '/etc/caddy/Caddyfile',
        code: `example.com {
    reverse_proxy localhost:3000
}`
      }
    },
    getInstallSteps: (os) => {
      if (os.family === 'debian') {
        return [
          {
            stepName: 'Setup Caddy Official Repository & Keyring',
            cmd: '$SUDO apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl && curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | $SUDO gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes && curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | $SUDO tee /etc/apt/sources.list.d/caddy-stable.list && $SUDO apt-get update -y'
          },
          { stepName: 'Install Caddy Web Server', cmd: '$SUDO apt-get install -y caddy' },
          { stepName: 'Enable & Start Caddy', cmd: '$SUDO systemctl enable --now caddy' }
        ];
      }
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install Caddy Package via Copr', cmd: '$SUDO dnf install -y \'dnf-command(copr)\' 2>/dev/null && $SUDO dnf copr enable -y @caddy/caddy && $SUDO dnf install -y caddy 2>/dev/null || $SUDO yum install -y yum-plugin-copr 2>/dev/null && $SUDO yum copr enable -y @caddy/caddy && $SUDO yum install -y caddy' },
          { stepName: 'Enable & Start Caddy', cmd: '$SUDO systemctl enable --now caddy' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Caddy via APK', cmd: '$SUDO apk add --no-cache caddy' },
          { stepName: 'Enable & Start Caddy', cmd: '$SUDO rc-update add caddy default 2>/dev/null || true; $SUDO rc-service caddy start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Caddy via Pacman', cmd: '$SUDO pacman -Sy --noconfirm caddy' },
          { stepName: 'Enable & Start Caddy', cmd: '$SUDO systemctl enable --now caddy' }
        ];
      }
      return [
        { stepName: 'Install Caddy via Official Script', cmd: 'curl -fsSL https://getcaddy.com | bash' },
        { stepName: 'Enable & Start Caddy', cmd: '$SUDO systemctl enable --now caddy 2>/dev/null || true' }
      ];
    }
  },
  {
    id: 'apache',
    name: 'Apache2',
    category: 'web',
    icon: 'lucide:feather',
    description: 'Classic & robust HTTP server with .htaccess support.',
    checkCmd: 'apache2',
    versionCmd: 'apache2 -v 2>&1 || httpd -v 2>&1',
    defaultPort: '80 / 443',
    configPath: '/etc/apache2/',
    cheatsheet: {
      summary: 'Gunakan a2enmod untuk mengaktifkan modul seperti rewrite, headers, atau ssl.',
      configFiles: [
        { label: 'Virtual Hosts', path: '/etc/apache2/sites-available/' },
        { label: 'Apache Config', path: '/etc/apache2/apache2.conf' }
      ],
      commonCommands: [
        { label: 'Enable Rewrite Mod', cmd: '$SUDO a2enmod rewrite ssl headers' },
        { label: 'Restart Apache', cmd: '$SUDO systemctl restart apache2 2>/dev/null || $SUDO systemctl restart httpd' },
        { label: 'Config Test', cmd: '$SUDO apache2ctl configtest 2>/dev/null || $SUDO apachectl configtest' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install Apache (httpd)', cmd: '$SUDO dnf install -y httpd 2>/dev/null || $SUDO yum install -y httpd' },
          { stepName: 'Enable & Start Apache', cmd: '$SUDO systemctl enable --now httpd' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Apache2 via APK', cmd: '$SUDO apk add --no-cache apache2' },
          { stepName: 'Start Apache2 Service', cmd: '$SUDO rc-update add apache2 default 2>/dev/null || true; $SUDO rc-service apache2 start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Apache via Pacman', cmd: '$SUDO pacman -Sy --noconfirm apache' },
          { stepName: 'Enable & Start Apache', cmd: '$SUDO systemctl enable --now httpd' }
        ];
      }
      return [
        { stepName: 'Install Apache2', cmd: '$SUDO apt-get install -y apache2' },
        { stepName: 'Enable Rewrite Module', cmd: '$SUDO a2enmod rewrite headers ssl 2>/dev/null || true' },
        { stepName: 'Enable & Start Apache2', cmd: '$SUDO systemctl enable --now apache2' }
      ];
    }
  },

  // RUNTIMES & LANGUAGES
  {
    id: 'nodejs',
    name: 'Node.js LTS & NPM',
    category: 'runtime',
    icon: 'lucide:terminal',
    description: 'V8 JavaScript runtime LTS (NodeSource) + npm package manager.',
    checkCmd: 'node',
    versionCmd: 'node -v 2>&1',
    cheatsheet: {
      summary: 'Termasuk npm. Disarankan menggunakan PM2 untuk menjalankan service production.',
      configFiles: [{ label: 'Global Node Modules', path: '/usr/lib/node_modules/' }],
      commonCommands: [
        { label: 'Check Version', cmd: 'node -v && npm -v' },
        { label: 'Install Global Tool', cmd: '$SUDO npm install -g <package>' },
        { label: 'Clear NPM Cache', cmd: 'npm cache clean --force' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Setup NodeSource LTS RPM Repository', cmd: 'curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -' },
          { stepName: 'Install Node.js & NPM', cmd: '$SUDO dnf install -y nodejs 2>/dev/null || $SUDO yum install -y nodejs' }
        ];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Node.js & NPM via APK', cmd: '$SUDO apk add --no-cache nodejs npm' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Node.js & NPM via Pacman', cmd: '$SUDO pacman -Sy --noconfirm nodejs npm' }];
      }
      return [
        { stepName: 'Setup NodeSource LTS APT Repository', cmd: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | $SUDO -E bash -' },
        { stepName: 'Install Node.js & NPM', cmd: '$SUDO apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nodejs' }
      ];
    }
  },
  {
    id: 'bun',
    name: 'Bun Runtime',
    category: 'runtime',
    icon: 'lucide:zap',
    description: 'Ultra-fast all-in-one JavaScript & TypeScript toolkit and package manager.',
    checkCmd: 'bun',
    versionCmd: 'bun -v 2>&1',
    cheatsheet: {
      summary: 'Bun adalah runtime dan package manager pengganti npm/yarn yang super cepat dengan native TypeScript support.',
      configFiles: [{ label: 'Bun Binary', path: '/usr/local/bin/bun' }],
      commonCommands: [
        { label: 'Check Version', cmd: 'bun --version' },
        { label: 'Install Dependencies', cmd: 'bun install' },
        { label: 'Run Script', cmd: 'bun run start' },
        { label: 'Upgrade Bun', cmd: 'bun upgrade' }
      ]
    },
    getInstallSteps: () => [
      {
        stepName: 'Install Bun via Official Script',
        cmd: 'curl -fsSL https://bun.sh/install | bash'
      },
      {
        stepName: 'Configure Bun in PATH & System Path',
        cmd: [
          'export BUN_INSTALL="$HOME/.bun"',
          'export PATH="$BUN_INSTALL/bin:$PATH"',
          'if ! grep -q "BUN_INSTALL" "$HOME/.bashrc" 2>/dev/null; then',
          '  echo \'export BUN_INSTALL="$HOME/.bun"\' >> "$HOME/.bashrc"',
          '  echo \'export PATH="$BUN_INSTALL/bin:$PATH"\' >> "$HOME/.bashrc"',
          'fi',
          'if sudo -n true 2>/dev/null; then',
          '  sudo -n cp -f "$BUN_INSTALL/bin/bun" /usr/local/bin/bun 2>/dev/null && sudo -n chmod 755 /usr/local/bin/bun 2>/dev/null || true',
          'fi'
        ].join('\n')
      }
    ]
  },
  {
    id: 'deno',
    name: 'Deno Runtime',
    category: 'runtime',
    icon: 'lucide:zap',
    description: 'Secure, modern runtime for JavaScript, TypeScript, and WebAssembly with built-in tooling.',
    checkCmd: 'deno',
    versionCmd: 'deno --version 2>&1',
    cheatsheet: {
      summary: 'Deno mengeksekusi TypeScript tanpa konfigurasi dan memiliki sistem izin keamanan granular bawaan.',
      configFiles: [{ label: 'Deno Directory', path: '~/.deno' }],
      commonCommands: [
        { label: 'Check Version', cmd: 'deno --version' },
        { label: 'Run Script', cmd: 'deno run --allow-net --allow-read main.ts' },
        { label: 'Compile Standalone', cmd: 'deno compile --allow-net main.ts' },
        { label: 'Self Upgrade', cmd: 'deno upgrade' }
      ]
    },
    getInstallSteps: () => [
      {
        stepName: 'Install Deno via Official Script',
        cmd: 'curl -fsSL https://deno.land/install.sh | sh'
      },
      {
        stepName: 'Configure Deno in PATH & System Path',
        cmd: [
          'export DENO_INSTALL="$HOME/.deno"',
          'export PATH="$DENO_INSTALL/bin:$PATH"',
          'if ! grep -q "DENO_INSTALL" "$HOME/.bashrc" 2>/dev/null; then',
          '  echo \'export DENO_INSTALL="$HOME/.deno"\' >> "$HOME/.bashrc"',
          '  echo \'export PATH="$DENO_INSTALL/bin:$PATH"\' >> "$HOME/.bashrc"',
          'fi',
          'if sudo -n true 2>/dev/null; then',
          '  sudo -n cp -f "$DENO_INSTALL/bin/deno" /usr/local/bin/deno 2>/dev/null && sudo -n chmod 755 /usr/local/bin/deno 2>/dev/null || true',
          'fi'
        ].join('\n')
      }
    ]
  },
  {
    id: 'java',
    name: 'Java JDK (OpenJDK)',
    category: 'runtime',
    icon: 'lucide:coffee',
    description: 'OpenJDK Java Development Kit & Virtual Machine for Java, Kotlin & Spring apps.',
    checkCmd: 'java',
    versionCmd: 'java -version 2>&1',
    cheatsheet: {
      summary: 'Termasuk compiler javac dan runtime JVM. Standar untuk enterprise backends (Spring Boot, Quarkus) dan tools berbasis Java.',
      configFiles: [{ label: 'JVM Directory', path: '/usr/lib/jvm/' }],
      commonCommands: [
        { label: 'Check Version', cmd: 'java -version' },
        { label: 'Compiler Version', cmd: 'javac -version' },
        { label: 'Run Jar with Memory Limits', cmd: 'java -Xms256m -Xmx512m -jar app.jar' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install OpenJDK Devel', cmd: '$SUDO dnf install -y java-latest-openjdk-devel 2>/dev/null || $SUDO yum install -y java-17-openjdk-devel' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install OpenJDK via APK', cmd: '$SUDO apk add --no-cache openjdk17' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install OpenJDK via Pacman', cmd: '$SUDO pacman -Sy --noconfirm jdk-openjdk' }];
      }
      return [{ stepName: 'Install Default OpenJDK Development Kit', cmd: '$SUDO apt-get install -y default-jdk' }];
    }
  },
  {
    id: 'go',
    name: 'Go (Golang)',
    category: 'runtime',
    icon: 'lucide:box',
    description: 'Fast, compiled programming language for backend & microservices.',
    checkCmd: 'go',
    versionCmd: 'go version 2>&1',
    cheatsheet: {
      summary: 'Go compiler dan runtime environment. Binary terkompilasi mandiri tanpa dependensi runtime tambahan.',
      configFiles: [{ label: 'Go Environment', path: 'go env' }],
      commonCommands: [
        { label: 'Go Version', cmd: 'go version' },
        { label: 'Check Environment', cmd: 'go env GOPATH GOROOT' },
        { label: 'Build Binary', cmd: 'go build -ldflags="-s -w" -o app .' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install Go via DNF/YUM', cmd: '$SUDO dnf install -y golang 2>/dev/null || $SUDO yum install -y golang' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Go via APK', cmd: '$SUDO apk add --no-cache go' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Go via Pacman', cmd: '$SUDO pacman -Sy --noconfirm go' }];
      }
      return [{ stepName: 'Install Go Compiler', cmd: '$SUDO apt-get install -y golang-go' }];
    }
  },
  {
    id: 'php',
    name: 'PHP & PHP-FPM',
    category: 'runtime',
    icon: 'lucide:code-2',
    description: 'PHP 8.x with FPM & common extensions (curl, mbstring, mysql, pgsql, zip, gd, xml, bcmath).',
    checkCmd: 'php',
    versionCmd: 'php -v 2>&1',
    defaultPort: '9000 (or Unix Socket)',
    configPath: '/etc/php/*/fpm/php.ini',
    cheatsheet: {
      summary: 'PHP-FPM berjalan sebagai unix socket di /run/php/php*-fpm.sock. Sangat cocok dipadukan dengan Nginx.',
      configFiles: [
        { label: 'CLI php.ini', path: '/etc/php/*/cli/php.ini' },
        { label: 'FPM php.ini', path: '/etc/php/*/fpm/php.ini' },
        { label: 'FPM Pool Config', path: '/etc/php/*/fpm/pool.d/www.conf' }
      ],
      commonCommands: [
        { label: 'List Extensions', cmd: 'php -m' },
        { label: 'Restart PHP-FPM', cmd: '$SUDO systemctl restart php*-fpm 2>/dev/null || true' },
        { label: 'Check Service', cmd: '$SUDO systemctl status php*-fpm 2>/dev/null || true' }
      ],
      sampleConfig: {
        title: 'Nginx FastCGI PHP-FPM Block',
        filename: 'nginx.conf snippet',
        code: `location ~ \\.php$ {
    include snippets/fastcgi-php.conf;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}`
      }
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install PHP & Common Modules', cmd: '$SUDO dnf install -y php php-fpm php-cli php-curl php-mbstring php-xml php-zip php-gd php-mysqlnd php-pgsql 2>/dev/null || $SUDO yum install -y php php-fpm' },
          { stepName: 'Enable & Start PHP-FPM Service', cmd: '$SUDO systemctl enable --now php-fpm' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install PHP & Modules via APK', cmd: '$SUDO apk add --no-cache php php-fpm php-curl php-mbstring php-xml php-zip php-gd php-mysqli php-pdo_mysql php-pgsql' },
          { stepName: 'Start PHP-FPM Service', cmd: '$SUDO rc-update add php-fpm default 2>/dev/null || true; $SUDO rc-service php-fpm start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install PHP & PHP-FPM via Pacman', cmd: '$SUDO pacman -Sy --noconfirm php php-fpm' },
          { stepName: 'Enable & Start PHP-FPM', cmd: '$SUDO systemctl enable --now php-fpm' }
        ];
      }
      if (os.id === 'ubuntu') {
        return [
          { stepName: 'Add PHP Upstream PPA (ppa:ondrej/php)', cmd: '$SUDO add-apt-repository -y ppa:ondrej/php 2>/dev/null && $SUDO apt-get update -y || true' },
          {
            stepName: 'Install Latest PHP, PHP-FPM, and Essential Extensions',
            cmd: '$SUDO apt-get install -y php php-fpm php-cli php-curl php-mbstring php-xml php-zip php-gd php-mysql php-pgsql php-sqlite3 php-bcmath'
          },
          {
            stepName: 'Enable & Start PHP-FPM',
            cmd: '$SUDO systemctl enable --now $(systemctl list-unit-files | grep -oE "php[0-9.]*-fpm\\.service" | head -n 1) 2>/dev/null || true'
          }
        ];
      }
      return [
        {
          stepName: 'Install PHP, PHP-FPM, and Essential Extensions',
          cmd: '$SUDO apt-get install -y php php-fpm php-cli php-curl php-mbstring php-xml php-zip php-gd php-mysql php-pgsql php-sqlite3 php-bcmath'
        },
        {
          stepName: 'Enable & Start PHP-FPM',
          cmd: '$SUDO systemctl enable --now $(systemctl list-unit-files | grep -oE "php[0-9.]*-fpm\\.service" | head -n 1) 2>/dev/null || true'
        }
      ];
    }
  },
  {
    id: 'composer',
    name: 'Composer (PHP)',
    category: 'tools',
    icon: 'lucide:package',
    description: 'Dependency Manager for PHP projects (Laravel, Symfony, WordPress).',
    checkCmd: 'composer',
    versionCmd: 'composer -V 2>&1',
    cheatsheet: {
      summary: 'Package manager PHP standar. Diletakkan secara global di /usr/local/bin/composer.',
      configFiles: [{ label: 'Global Composer Home', path: '~/.config/composer/' }],
      commonCommands: [
        { label: 'Check Version', cmd: 'composer --version' },
        { label: 'Install Prod Dependencies', cmd: 'composer install --no-dev --optimize-autoloader' },
        { label: 'Self Update', cmd: '$SUDO composer self-update' }
      ]
    },
    getInstallSteps: () => [
      {
        stepName: 'Download & Verify Official Composer Installer',
        cmd: 'curl -sS https://getcomposer.org/installer | php'
      },
      {
        stepName: 'Move Composer to /usr/local/bin',
        cmd: '$SUDO mv composer.phar /usr/local/bin/composer && $SUDO chmod +x /usr/local/bin/composer'
      }
    ]
  },
  {
    id: 'python',
    name: 'Python 3, Pip & Venv',
    category: 'runtime',
    icon: 'lucide:file-code',
    description: 'Python 3 runtime with pip package manager and virtual environment support.',
    checkCmd: 'python3',
    versionCmd: 'python3 --version 2>&1',
    cheatsheet: {
      summary: 'Disarankan selalu membuat virtual environment (venv) untuk setiap project Python.',
      configFiles: [{ label: 'Pip Configuration', path: '~/.pip/pip.conf' }],
      commonCommands: [
        { label: 'Create Virtual Env', cmd: 'python3 -m venv venv' },
        { label: 'Activate Virtual Env', cmd: 'source venv/bin/activate' },
        { label: 'Install Requirements', cmd: 'pip install -r requirements.txt' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install Python 3 & Pip', cmd: '$SUDO dnf install -y python3 python3-pip 2>/dev/null || $SUDO yum install -y python3 python3-pip' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Python 3 via APK', cmd: '$SUDO apk add --no-cache python3 py3-pip' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Python 3 & Pip via Pacman', cmd: '$SUDO pacman -Sy --noconfirm python python-pip' }];
      }
      return [{ stepName: 'Install Python 3, Pip, and Venv', cmd: '$SUDO apt-get install -y python3 python3-pip python3-venv' }];
    }
  },
  {
    id: 'ruby',
    name: 'Ruby & Gem',
    category: 'runtime',
    icon: 'lucide:gem',
    description: 'Ruby programming language runtime and RubyGems package manager.',
    checkCmd: 'ruby',
    versionCmd: 'ruby -v 2>&1',
    cheatsheet: {
      summary: 'Bahasa pemrograman berorientasi objek yang populer untuk web framework Ruby on Rails.',
      configFiles: [{ label: 'Gem Directory', path: '~/.local/share/gem/' }],
      commonCommands: [
        { label: 'Ruby Version', cmd: 'ruby -v' },
        { label: 'Gem Version', cmd: 'gem -v' },
        { label: 'Install Bundler', cmd: 'gem install bundler' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install Ruby & Devel Tools', cmd: '$SUDO dnf install -y ruby ruby-devel 2>/dev/null || $SUDO yum install -y ruby ruby-devel' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Ruby via APK', cmd: '$SUDO apk add --no-cache ruby ruby-dev build-base' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Ruby via Pacman', cmd: '$SUDO pacman -Sy --noconfirm ruby base-devel' }];
      }
      return [{ stepName: 'Install Ruby Full & Build Tools', cmd: '$SUDO apt-get install -y ruby-full build-essential' }];
    }
  },
  {
    id: 'rust',
    name: 'Rust & Cargo',
    category: 'runtime',
    icon: 'lucide:wrench',
    description: 'Rust programming language compiler & Cargo package manager via rustup.',
    checkCmd: 'rustc',
    versionCmd: 'rustc --version 2>&1',
    cheatsheet: {
      summary: 'Rustup mengelola versi compiler Rust dan Cargo toolchain.',
      configFiles: [{ label: 'Cargo Home', path: '$HOME/.cargo' }],
      commonCommands: [
        { label: 'Check Versions', cmd: 'rustc --version && cargo --version' },
        { label: 'Update Rust', cmd: 'rustup update' },
        { label: 'Build Release', cmd: 'cargo build --release' }
      ]
    },
    getInstallSteps: () => [
      {
        stepName: 'Install Rustup & Stable Toolchain Non-interactively',
        cmd: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y'
      },
      {
        stepName: 'Configure Cargo Path Symlink',
        cmd: [
          'export CARGO_HOME="$HOME/.cargo"',
          'export PATH="$CARGO_HOME/bin:$PATH"',
          'if sudo -n true 2>/dev/null; then',
          '  sudo -n ln -sf "$CARGO_HOME/bin/cargo" /usr/local/bin/cargo 2>/dev/null || true',
          '  sudo -n ln -sf "$CARGO_HOME/bin/rustc" /usr/local/bin/rustc 2>/dev/null || true',
          'fi'
        ].join('\n')
      }
    ]
  },

  // DATABASES
  {
    id: 'mysql',
    name: 'MySQL Server',
    category: 'database',
    icon: 'lucide:database',
    description: 'World\'s most popular open-source relational database.',
    checkCmd: 'mysql',
    versionCmd: 'mysql --version 2>&1 || mysqld --version 2>&1',
    defaultPort: 3306,
    configPath: '/etc/mysql/mysql.conf.d/mysqld.cnf',
    cheatsheet: {
      summary: 'Jalankan mysql_secure_installation setelah instalasi untuk mengatur root password dan menghapus test database.',
      configFiles: [
        { label: 'MySQL Config', path: '/etc/mysql/mysql.conf.d/mysqld.cnf' },
        { label: 'Error Log', path: '/var/log/mysql/error.log' }
      ],
      commonCommands: [
        { label: 'Secure Installation', cmd: '$SUDO mysql_secure_installation' },
        { label: 'Login as Root', cmd: '$SUDO mysql -u root' },
        { label: 'Restart MySQL', cmd: '$SUDO systemctl restart mysql' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install MySQL Server', cmd: '$SUDO dnf install -y mysql-server 2>/dev/null || $SUDO yum install -y mysql-server' },
          { stepName: 'Enable & Start MySQL', cmd: '$SUDO systemctl enable --now mysqld' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install MariaDB (MySQL drop-in) via APK', cmd: '$SUDO apk add --no-cache mariadb mariadb-client' },
          { stepName: 'Setup & Start MariaDB', cmd: '$SUDO /etc/init.d/mariadb setup 2>/dev/null || true; $SUDO rc-service mariadb start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install MariaDB (MySQL drop-in) via Pacman', cmd: '$SUDO pacman -Sy --noconfirm mariadb' },
          { stepName: 'Initialize & Start MariaDB', cmd: '$SUDO mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql 2>/dev/null || true; $SUDO systemctl enable --now mariadb' }
        ];
      }
      return [
        { stepName: 'Install MySQL Server', cmd: '$SUDO apt-get install -y mysql-server' },
        { stepName: 'Enable & Start MySQL', cmd: '$SUDO systemctl enable --now mysql' }
      ];
    }
  },
  {
    id: 'mariadb',
    name: 'MariaDB Server',
    category: 'database',
    icon: 'lucide:database',
    description: 'High-performance drop-in replacement for MySQL made by original creators.',
    checkCmd: 'mariadb',
    versionCmd: 'mariadb --version 2>&1 || mysql --version 2>&1 || mariadbd --version 2>&1 || mysqld --version 2>&1 || (systemctl show mariadb -p Description 2>/dev/null | grep -E "[0-9]+\\.[0-9]+") || (systemctl show mysql -p Description 2>/dev/null | grep -E "[0-9]+\\.[0-9]+") || (dpkg -l "mariadb*" 2>/dev/null | grep -E "^ii\\s+mariadb-(server|common)" | tr -s " " | cut -d" " -f3 | head -n 1) || (dpkg -l "mariadb*" 2>/dev/null | grep "^ii" | tr -s " " | cut -d" " -f3 | head -n 1) || rpm -q --qf "%{VERSION}" mariadb-server 2>/dev/null || systemctl status mariadb 2>/dev/null | grep -m 1 -ioE "MariaDB[ -]+[0-9]+\\.[0-9]+(\\.[0-9]+)?"',
    defaultPort: 3306,
    configPath: '/etc/mysql/mariadb.conf.d/50-server.cnf',
    cheatsheet: {
      summary: 'Kompatibel 100% dengan MySQL client dan libraries, performa query caching tinggi.',
      configFiles: [
        { label: 'Server Config', path: '/etc/mysql/mariadb.conf.d/50-server.cnf' },
        { label: 'Error Log', path: '/var/log/mysql/mariadb.err' }
      ],
      commonCommands: [
        { label: 'Secure Installation', cmd: '$SUDO mariadb-secure-installation' },
        { label: 'Login Root', cmd: '$SUDO mariadb -u root' },
        { label: 'Restart MariaDB', cmd: '$SUDO systemctl restart mariadb' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install MariaDB Server', cmd: '$SUDO dnf install -y mariadb-server 2>/dev/null || $SUDO yum install -y mariadb-server' },
          { stepName: 'Enable & Start MariaDB', cmd: '$SUDO systemctl enable --now mariadb' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install MariaDB via APK', cmd: '$SUDO apk add --no-cache mariadb mariadb-client' },
          { stepName: 'Setup & Start MariaDB', cmd: '$SUDO /etc/init.d/mariadb setup 2>/dev/null || true; $SUDO rc-service mariadb start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install MariaDB via Pacman', cmd: '$SUDO pacman -Sy --noconfirm mariadb' },
          { stepName: 'Initialize & Start MariaDB', cmd: '$SUDO mariadb-install-db --user=mysql --basedir=/usr --datadir=/var/lib/mysql 2>/dev/null || true; $SUDO systemctl enable --now mariadb' }
        ];
      }
      return [
        { stepName: 'Install MariaDB Server', cmd: '$SUDO apt-get install -y mariadb-server' },
        { stepName: 'Enable & Start MariaDB', cmd: '$SUDO systemctl enable --now mariadb' }
      ];
    }
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Server',
    category: 'database',
    icon: 'lucide:database',
    description: 'Advanced, enterprise-grade open-source object-relational database system.',
    checkCmd: 'psql',
    versionCmd: 'psql -V 2>&1',
    defaultPort: 5432,
    configPath: '/etc/postgresql/*/main/postgresql.conf',
    cheatsheet: {
      summary: 'PostgreSQL default user adalah postgres. Gunakan sudo -u postgres psql untuk masuk ke prompt database.',
      configFiles: [
        { label: 'Main Config', path: '/etc/postgresql/*/main/postgresql.conf' },
        { label: 'Client Auth Config', path: '/etc/postgresql/*/main/pg_hba.conf' }
      ],
      commonCommands: [
        { label: 'Open Postgres CLI', cmd: '$SUDO -u postgres psql' },
        { label: 'Create DB User', cmd: '$SUDO -u postgres createuser -P myuser' },
        { label: 'Create Database', cmd: '$SUDO -u postgres createdb -O myuser mydb' },
        { label: 'Restart Service', cmd: '$SUDO systemctl restart postgresql' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install PostgreSQL', cmd: '$SUDO dnf install -y postgresql-server postgresql-contrib 2>/dev/null || $SUDO yum install -y postgresql-server' },
          { stepName: 'Initialize Database Cluster', cmd: '$SUDO postgresql-setup --initdb 2>/dev/null || true' },
          { stepName: 'Enable & Start PostgreSQL', cmd: '$SUDO systemctl enable --now postgresql' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install PostgreSQL via APK', cmd: '$SUDO apk add --no-cache postgresql postgresql-contrib' },
          { stepName: 'Initialize & Start PostgreSQL', cmd: '$SUDO /etc/init.d/postgresql setup 2>/dev/null || true; $SUDO rc-service postgresql start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install PostgreSQL via Pacman', cmd: '$SUDO pacman -Sy --noconfirm postgresql' },
          { stepName: 'Initialize & Start PostgreSQL', cmd: '$SUDO -u postgres initdb -D /var/lib/postgres/data 2>/dev/null || true; $SUDO systemctl enable --now postgresql' }
        ];
      }
      return [
        { stepName: 'Install PostgreSQL & Contrib', cmd: '$SUDO apt-get install -y postgresql postgresql-contrib' },
        { stepName: 'Enable & Start PostgreSQL', cmd: '$SUDO systemctl enable --now postgresql' }
      ];
    }
  },
  {
    id: 'redis',
    name: 'Redis In-Memory Store',
    category: 'database',
    icon: 'lucide:layers',
    description: 'Ultra-fast in-memory key-value database, cache, message broker, and queue.',
    checkCmd: 'redis-server',
    versionCmd: 'redis-server -v 2>&1',
    defaultPort: 6379,
    configPath: '/etc/redis/redis.conf',
    cheatsheet: {
      summary: 'Redis menyimpan data di RAM untuk performa kecepatan kilat. Cocok untuk session caching dan background queues.',
      configFiles: [{ label: 'Redis Config', path: '/etc/redis/redis.conf' }],
      commonCommands: [
        { label: 'Ping Redis', cmd: 'redis-cli ping' },
        { label: 'Redis Monitor', cmd: 'redis-cli monitor' },
        { label: 'Restart Redis', cmd: '$SUDO systemctl restart redis-server 2>/dev/null || $SUDO systemctl restart redis' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install Redis via DNF/YUM', cmd: '$SUDO dnf install -y redis 2>/dev/null || $SUDO yum install -y redis' },
          { stepName: 'Enable & Start Redis', cmd: '$SUDO systemctl enable --now redis' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Redis via APK', cmd: '$SUDO apk add --no-cache redis' },
          { stepName: 'Start Redis Service', cmd: '$SUDO rc-update add redis default 2>/dev/null || true; $SUDO rc-service redis start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Redis via Pacman', cmd: '$SUDO pacman -Sy --noconfirm redis' },
          { stepName: 'Enable & Start Redis', cmd: '$SUDO systemctl enable --now redis' }
        ];
      }
      return [
        { stepName: 'Install Redis Server', cmd: '$SUDO apt-get install -y redis-server' },
        { stepName: 'Enable & Start Redis Service', cmd: '$SUDO systemctl enable --now redis-server' }
      ];
    }
  },
  {
    id: 'sqlite',
    name: 'SQLite 3',
    category: 'database',
    icon: 'lucide:hard-drive',
    description: 'Self-contained, serverless zero-configuration SQL database engine.',
    checkCmd: 'sqlite3',
    versionCmd: 'sqlite3 --version 2>&1',
    cheatsheet: {
      summary: 'Database file tunggal tanpa background process daemon.',
      configFiles: [],
      commonCommands: [
        { label: 'Open Database File', cmd: 'sqlite3 myapp.db' },
        { label: 'List Tables', cmd: 'sqlite3 myapp.db ".tables"' },
        { label: 'Dump Schema', cmd: 'sqlite3 myapp.db ".schema"' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install SQLite', cmd: '$SUDO dnf install -y sqlite 2>/dev/null || $SUDO yum install -y sqlite' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install SQLite via APK', cmd: '$SUDO apk add --no-cache sqlite sqlite-dev' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install SQLite via Pacman', cmd: '$SUDO pacman -Sy --noconfirm sqlite' }];
      }
      return [{ stepName: 'Install SQLite3 CLI', cmd: '$SUDO apt-get install -y sqlite3 libsqlite3-dev' }];
    }
  },

  // CONTAINERS & PROCESSES
  {
    id: 'docker',
    name: 'Docker Engine & Compose',
    category: 'containers',
    icon: 'lucide:container',
    description: 'Docker containerization engine and Docker Compose plugin via official installer.',
    checkCmd: 'docker',
    versionCmd: 'docker -v 2>&1',
    cheatsheet: {
      summary: 'Kelola container dan compose stack secara terisolasi. User saat ini akan ditambahkan ke grup docker.',
      configFiles: [{ label: 'Docker Daemon Config', path: '/etc/docker/daemon.json' }],
      commonCommands: [
        { label: 'List Containers', cmd: 'docker ps -a' },
        { label: 'Compose Up', cmd: 'docker compose up -d' },
        { label: 'Compose Down', cmd: 'docker compose down' },
        { label: 'Container Stats', cmd: 'docker stats --no-stream' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Docker via APK', cmd: '$SUDO apk add --no-cache docker docker-cli-compose' },
          { stepName: 'Add Current User to Docker Group', cmd: '$SUDO addgroup $USER docker 2>/dev/null || true' },
          { stepName: 'Start Docker Service', cmd: '$SUDO rc-update add docker default 2>/dev/null || true; $SUDO rc-service docker start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Docker via Pacman', cmd: '$SUDO pacman -Sy --noconfirm docker docker-compose' },
          { stepName: 'Add Current User to Docker Group', cmd: '$SUDO usermod -aG docker $USER 2>/dev/null || true' },
          { stepName: 'Enable & Start Docker Service', cmd: '$SUDO systemctl enable --now docker' }
        ];
      }
      return [
        {
          stepName: 'Install Docker via Official Script (get.docker.com)',
          cmd: 'curl -fsSL https://get.docker.com | $SUDO sh'
        },
        {
          stepName: 'Add Current User to Docker Group',
          cmd: '$SUDO usermod -aG docker $USER 2>/dev/null || true'
        },
        {
          stepName: 'Enable & Start Docker Service',
          cmd: '$SUDO systemctl enable --now docker'
        }
      ];
    }
  },
  {
    id: 'pm2',
    name: 'PM2 Process Manager',
    category: 'containers',
    icon: 'lucide:activity',
    description: 'Production runtime process manager for Node.js & binaries with auto-restart on boot.',
    checkCmd: 'pm2',
    versionCmd: 'pm2 -v 2>&1',
    cheatsheet: {
      summary: 'PM2 menjaga aplikasi Node.js tetap hidup (auto-restart saat crash) dan cluster mode multi-core.',
      configFiles: [{ label: 'Ecosystem Config', path: 'ecosystem.config.js' }],
      commonCommands: [
        { label: 'Start App', cmd: 'pm2 start index.js --name "my-app"' },
        { label: 'Save State to Boot', cmd: 'pm2 save && pm2 startup' },
        { label: 'Live Logs', cmd: 'pm2 logs' },
        { label: 'Monitor CPU/RAM', cmd: 'pm2 monit' }
      ]
    },
    getInstallSteps: () => [
      {
        stepName: 'Install PM2 Globally via NPM',
        cmd: '$SUDO npm install -g pm2'
      }
    ]
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    category: 'containers',
    icon: 'lucide:cog',
    description: 'Client/server system that allows users to monitor and control processes on UNIX-like OS.',
    checkCmd: 'supervisord',
    versionCmd: 'supervisord -v 2>&1',
    configPath: '/etc/supervisor/conf.d/',
    cheatsheet: {
      summary: 'Supervisor sering dipakai untuk menjalankan queue worker (seperti Laravel Horizon / artisan queue:work).',
      configFiles: [
        { label: 'Supervisor Config', path: '/etc/supervisor/supervisord.conf' },
        { label: 'Programs Folder', path: '/etc/supervisor/conf.d/' }
      ],
      commonCommands: [
        { label: 'Reread & Update Configs', cmd: '$SUDO supervisorctl reread && $SUDO supervisorctl update' },
        { label: 'Check Status', cmd: '$SUDO supervisorctl status' },
        { label: 'Restart Worker', cmd: '$SUDO supervisorctl restart all' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install Supervisor', cmd: '$SUDO dnf install -y supervisor 2>/dev/null || $SUDO yum install -y supervisor' },
          { stepName: 'Enable & Start Supervisor', cmd: '$SUDO systemctl enable --now supervisord' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Supervisor via APK', cmd: '$SUDO apk add --no-cache supervisor' },
          { stepName: 'Start Supervisor Service', cmd: '$SUDO rc-update add supervisord default 2>/dev/null || true; $SUDO rc-service supervisord start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Supervisor via Pacman', cmd: '$SUDO pacman -Sy --noconfirm supervisor' },
          { stepName: 'Enable & Start Supervisor', cmd: '$SUDO systemctl enable --now supervisord' }
        ];
      }
      return [
        { stepName: 'Install Supervisor via APT', cmd: '$SUDO apt-get install -y supervisor' },
        { stepName: 'Enable & Start Supervisor', cmd: '$SUDO systemctl enable --now supervisor' }
      ];
    }
  },

  // SECURITY & SSL
  {
    id: 'certbot',
    name: 'Certbot (Let\'s Encrypt SSL)',
    category: 'security',
    icon: 'lucide:lock',
    description: 'Free automated TLS/SSL certificates from Let\'s Encrypt with auto-renewal.',
    checkCmd: 'certbot',
    versionCmd: 'certbot --version 2>&1',
    cheatsheet: {
      summary: 'Certbot otomatis memasang sertifikat HTTPS ke web server Nginx atau Apache dan membuat cron auto-renew.',
      configFiles: [{ label: 'Live Certificates', path: '/etc/letsencrypt/live/' }],
      commonCommands: [
        { label: 'Issue SSL for Nginx', cmd: '$SUDO certbot --nginx -d example.com -d www.example.com' },
        { label: 'Test Auto-Renewal', cmd: '$SUDO certbot renew --dry-run' },
        { label: 'Check Certificates', cmd: '$SUDO certbot certificates' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install Certbot & Plugins', cmd: '$SUDO dnf install -y certbot python3-certbot-nginx 2>/dev/null || $SUDO yum install -y certbot python3-certbot-nginx' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Certbot via APK', cmd: '$SUDO apk add --no-cache certbot certbot-nginx' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Certbot via Pacman', cmd: '$SUDO pacman -Sy --noconfirm certbot certbot-nginx' }];
      }
      return [{ stepName: 'Install Certbot & Nginx Plugin via APT', cmd: '$SUDO apt-get install -y certbot python3-certbot-nginx' }];
    }
  },
  {
    id: 'ufw',
    name: 'UFW Firewall',
    category: 'security',
    icon: 'lucide:shield',
    description: 'Uncomplicated Firewall for managing iptables rules easily.',
    checkCmd: 'ufw',
    versionCmd: 'ufw version 2>&1',
    cheatsheet: {
      summary: 'PENTING: Selalu buka port SSH (sudo ufw allow 22/tcp atau OpenSSH) SEBELUM mengaktifkan firewall agar tidak terkunci keluar.',
      configFiles: [{ label: 'UFW Configuration', path: '/etc/ufw/ufw.conf' }],
      commonCommands: [
        { label: 'Allow SSH (Safety)', cmd: '$SUDO ufw allow 22/tcp' },
        { label: 'Allow HTTP & HTTPS', cmd: '$SUDO ufw allow 80/tcp && $SUDO ufw allow 443/tcp' },
        { label: 'Check Status', cmd: '$SUDO ufw status verbose' },
        { label: 'Enable Firewall', cmd: '$SUDO ufw --force enable' }
      ]
    },
    getInstallSteps: (os) => {
      const installCmd = os.family === 'rhel'
        ? '$SUDO dnf install -y ufw 2>/dev/null || $SUDO yum install -y ufw'
        : os.family === 'alpine'
        ? '$SUDO apk add --no-cache ufw'
        : os.family === 'arch'
        ? '$SUDO pacman -Sy --noconfirm ufw'
        : '$SUDO apt-get install -y ufw';
      return [
        { stepName: 'Install UFW Package', cmd: installCmd },
        { stepName: 'Safety Rule: Allow SSH Port 22', cmd: '$SUDO ufw allow 22/tcp 2>/dev/null || true; $SUDO ufw allow OpenSSH 2>/dev/null || true' }
      ];
    }
  },
  {
    id: 'fail2ban',
    name: 'Fail2ban',
    category: 'security',
    icon: 'lucide:shield-alert',
    description: 'Intrusion prevention software against SSH brute-force attacks.',
    checkCmd: 'fail2ban-client',
    versionCmd: 'fail2ban-client -v 2>&1',
    configPath: '/etc/fail2ban/jail.local',
    cheatsheet: {
      summary: 'Fail2ban memonitor log otentikasi SSH dan otomatis memblokir IP yang gagal login berkali-kali.',
      configFiles: [
        { label: 'Jail Config', path: '/etc/fail2ban/jail.conf' },
        { label: 'Custom Jail', path: '/etc/fail2ban/jail.local' }
      ],
      commonCommands: [
        { label: 'Status SSH Jail', cmd: '$SUDO fail2ban-client status sshd' },
        { label: 'Unban IP', cmd: '$SUDO fail2ban-client set sshd unbanip <IP_ADDRESS>' },
        { label: 'Restart Service', cmd: '$SUDO systemctl restart fail2ban' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [
          { stepName: 'Install Fail2ban via DNF/YUM', cmd: '$SUDO dnf install -y fail2ban 2>/dev/null || $SUDO yum install -y fail2ban' },
          { stepName: 'Enable & Start Fail2ban', cmd: '$SUDO systemctl enable --now fail2ban' }
        ];
      }
      if (os.family === 'alpine') {
        return [
          { stepName: 'Install Fail2ban via APK', cmd: '$SUDO apk add --no-cache fail2ban' },
          { stepName: 'Start Fail2ban Service', cmd: '$SUDO rc-update add fail2ban default 2>/dev/null || true; $SUDO rc-service fail2ban start 2>/dev/null || true' }
        ];
      }
      if (os.family === 'arch') {
        return [
          { stepName: 'Install Fail2ban via Pacman', cmd: '$SUDO pacman -Sy --noconfirm fail2ban' },
          { stepName: 'Enable & Start Fail2ban', cmd: '$SUDO systemctl enable --now fail2ban' }
        ];
      }
      return [
        { stepName: 'Install Fail2ban via APT', cmd: '$SUDO apt-get install -y fail2ban' },
        { stepName: 'Enable & Start Fail2ban', cmd: '$SUDO systemctl enable --now fail2ban' }
      ];
    }
  },

  // TOOLS & BUILD
  {
    id: 'pnpm',
    name: 'PNPM Package Manager',
    category: 'tools',
    icon: 'lucide:package-check',
    description: 'Fast, disk space efficient package manager using hard links.',
    checkCmd: 'pnpm',
    versionCmd: 'pnpm -v 2>&1',
    cheatsheet: {
      summary: 'PNPM menghemat kapasitas hard disk server hingga 50%+ dengan global content-addressable storage.',
      configFiles: [{ label: 'Global Store', path: '~/.local/share/pnpm/store' }],
      commonCommands: [
        { label: 'Check Version', cmd: 'pnpm -v' },
        { label: 'Install Dependencies', cmd: 'pnpm install' },
        { label: 'Run Script', cmd: 'pnpm run build' }
      ]
    },
    getInstallSteps: () => [
      {
        stepName: 'Install PNPM via Official Script',
        cmd: 'curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=latest SHELL="$(which bash 2>/dev/null || echo /bin/bash)" bash -'
      }
    ]
  },
  {
    id: 'git',
    name: 'Git VCS',
    category: 'tools',
    icon: 'lucide:git-branch',
    description: 'Distributed version control system for tracking code changes.',
    checkCmd: 'git',
    versionCmd: 'git --version 2>&1',
    cheatsheet: {
      summary: 'Tool wajib untuk deploy dan menarik kode repository git di server.',
      configFiles: [{ label: 'Global Git Config', path: '~/.gitconfig' }],
      commonCommands: [
        { label: 'Set Global Name', cmd: 'git config --global user.name "Deploy Bot"' },
        { label: 'Set Global Email', cmd: 'git config --global user.email "deploy@example.com"' },
        { label: 'Clone Repository', cmd: 'git clone <repo-url>' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install Git via DNF/YUM', cmd: '$SUDO dnf install -y git 2>/dev/null || $SUDO yum install -y git' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Git via APK', cmd: '$SUDO apk add --no-cache git' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Git via Pacman', cmd: '$SUDO pacman -Sy --noconfirm git' }];
      }
      if (os.id === 'ubuntu') {
        return [
          { stepName: 'Install Latest Git via APT', cmd: '$SUDO apt-get update -y && $SUDO apt-get install -y git' }
        ];
      }
      return [{ stepName: 'Install Git via APT', cmd: '$SUDO apt-get install -y git' }];
    }
  },
  {
    id: 'build_essential',
    name: 'Build Essentials & Dev Tools',
    category: 'tools',
    icon: 'lucide:hammer',
    description: 'C/C++ compilers (gcc, g++, make), curl, wget, and foundational compile tools.',
    checkCmd: 'make',
    versionCmd: 'make -v 2>&1',
    cheatsheet: {
      summary: 'Dibutuhkan ketika menginstall native npm modules (node-gyp), python packages dengan C extensions, atau compile software dari source.',
      configFiles: [],
      commonCommands: [
        { label: 'Check GCC', cmd: 'gcc --version' },
        { label: 'Check Make', cmd: 'make --version' }
      ]
    },
    getInstallSteps: (os) => {
      if (os.family === 'rhel') {
        return [{ stepName: 'Install Development Tools', cmd: '$SUDO dnf groupinstall -y "Development Tools" 2>/dev/null || $SUDO yum groupinstall -y "Development Tools"' }];
      }
      if (os.family === 'alpine') {
        return [{ stepName: 'Install Build Base via APK', cmd: '$SUDO apk add --no-cache build-base curl wget' }];
      }
      if (os.family === 'arch') {
        return [{ stepName: 'Install Base Devel via Pacman', cmd: '$SUDO pacman -Sy --noconfirm base-devel curl wget' }];
      }
      return [{ stepName: 'Install Build Essential & Utilities', cmd: '$SUDO apt-get install -y build-essential curl wget software-properties-common ca-certificates' }];
    }
  }
];

export const USER_SPACE_TOOL_IDS = new Set(['deno', 'bun', 'pnpm', 'rust']);

export function requiresRootPrivilege(toolIds: string[]): boolean {
  return toolIds.some((id) => !USER_SPACE_TOOL_IDS.has(id));
}

export const STACK_PRESETS: StackPreset[] = [
  {
    id: 'lemp',
    name: 'LEMP Stack (PHP/Laravel/WP)',
    icon: 'lucide:server',
    description: 'Nginx + PHP-FPM + Composer + MariaDB + Certbot + UFW',
    packages: ['nginx', 'php', 'composer', 'mariadb', 'certbot', 'ufw']
  },
  {
    id: 'node_bun',
    name: 'Node.js & Bun Production',
    icon: 'lucide:zap',
    description: 'Nginx + Node.js LTS + Bun + PNPM + PM2 + Redis + Certbot',
    packages: ['nginx', 'nodejs', 'bun', 'pnpm', 'pm2', 'redis', 'certbot']
  },
  {
    id: 'go_stack',
    name: 'Go & PostgreSQL Backend',
    icon: 'lucide:box',
    description: 'Nginx + Go Compiler + PostgreSQL + Redis + Certbot + UFW',
    packages: ['nginx', 'go', 'postgres', 'redis', 'certbot', 'ufw']
  },
  {
    id: 'java_stack',
    name: 'Java Spring Backend',
    icon: 'lucide:coffee',
    description: 'Nginx + OpenJDK Java + PostgreSQL + Redis + Certbot + UFW',
    packages: ['nginx', 'java', 'postgres', 'redis', 'certbot', 'ufw']
  },
  {
    id: 'docker_host',
    name: 'Docker Host & Security',
    icon: 'lucide:container',
    description: 'Docker Engine + Compose + Git + UFW + Fail2ban',
    packages: ['docker', 'git', 'ufw', 'fail2ban']
  },
  {
    id: 'essential_tools',
    name: 'Server Core Essentials',
    icon: 'lucide:wrench',
    description: 'Build Tools + Git + Python 3 + SQLite + UFW',
    packages: ['build_essential', 'git', 'python', 'sqlite', 'ufw']
  }
];

/**
 * Generate a sequential bash script with live progress banners and error traps
 */
export function generateInstallScript(
  selectedIds: string[],
  os: OsInfo,
  options?: { updateRepo?: boolean; runInBackground?: boolean }
): string {
  const selectedSoftwares = SOFTWARE_LIST.filter((s) => selectedIds.includes(s.id));
  if (selectedSoftwares.length === 0) {
    return '# Tidak ada paket yang dipilih.';
  }

  const allSteps: { title: string; cmd: string }[] = [];
  const requiresRoot = requiresRootPrivilege(selectedIds);

  // Update repository first if requested or by default (only when at least one package requires system package manager)
  const shouldUpdate = requiresRoot && options?.updateRepo !== false;
  if (shouldUpdate) {
    if (os.family === 'debian') {
      allSteps.push({
        title: 'Memperbarui Cache Repository Paket (APT Update)',
        cmd: 'DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a $SUDO apt-get update -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"'
      });
    } else if (os.family === 'rhel') {
      allSteps.push({
        title: 'Memperbarui Cache Repository Paket (DNF/YUM Check-Update)',
        cmd: '$SUDO dnf check-update -y 2>/dev/null || true'
      });
    } else if (os.family === 'alpine') {
      allSteps.push({
        title: 'Memperbarui Cache Repository Paket (APK Update)',
        cmd: '$SUDO apk update'
      });
    } else if (os.family === 'arch') {
      allSteps.push({
        title: 'Memperbarui Database Paket (Pacman Sync)',
        cmd: '$SUDO pacman -Sy --noconfirm'
      });
    }
  }

  // Collect steps from each selected software sequentially
  for (const sw of selectedSoftwares) {
    const steps = sw.getInstallSteps(os);
    for (const step of steps) {
      allSteps.push({
        title: `[${sw.name}] ${step.stepName}`,
        cmd: step.cmd
      });
    }
  }

  const totalSteps = allSteps.length;

  const scriptParts = [
    '#!/usr/bin/env bash',
    '# ========================================================',
    '# BOBA Automated Server Setup & Software Bootstrapper',
    `# Target OS: ${os.name} (${os.family})`,
    `# Total Packages: ${selectedSoftwares.length} | Total Sub-Steps: ${totalSteps}`,
    '# ========================================================',
    '',
    'set -e',
    '',
    '# Disable interactive prompts (Kernel upgrade, service restart whiptail dialogues)',
    'export DEBIAN_FRONTEND=noninteractive',
    'export NEEDRESTART_MODE=a',
    'export NEEDRESTART_SUSPEND=1',
    'export UCF_FORCE_CONFFOLD=1',
    'export APT_LISTCHANGES_FRONTEND=none',
    '',
    '# Automatically set non-interactive dpkg force-confdef & force-confold rules for apt',
    'if command -v apt-get >/dev/null 2>&1 && [ -d /etc/apt/apt.conf.d ]; then',
    '  sudo -n tee /etc/apt/apt.conf.d/99boba-noninteractive >/dev/null 2>&1 << \'BOBA_APT_EOF\' || true',
    'Dpkg::Options {',
    '   "--force-confdef";',
    '   "--force-confold";',
    '}',
    'APT::Get::Assume-Yes "true";',
    'BOBA_APT_EOF',
    'fi',
    '',
    '# Prevent concurrent installer execution lock',
    'LOCK_FILE="/tmp/boba-setup.lock"',
    'if [ -f "$LOCK_FILE" ]; then',
    '  EXISTING_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")',
    '  if [ -n "$EXISTING_PID" ] && [ "$EXISTING_PID" != "$$" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then',
    '    echo "" >&2',
    '    echo -e "\\033[1;31m============================================================\\033[0m" >&2',
    '    echo -e "\\033[1;31m[ERROR] Proses instalasi BOBA sedang berlangsung di server (PID: $EXISTING_PID)\\033[0m" >&2',
    '    echo -e "\\033[1;33mHarap tunggu hingga proses selesai atau pantau via: tail -f /tmp/boba-setup.log\\033[0m" >&2',
    '    echo -e "\\033[1;31m============================================================\\033[0m" >&2',
    '    exit 1',
    '  fi',
    'fi',
    '',
    'echo "$$" > "$LOCK_FILE"',
    'boba_cleanup() {',
    '  rm -f "$LOCK_FILE" 2>/dev/null || true',
    '  sudo -n rm -f /etc/apt/apt.conf.d/99boba-noninteractive 2>/dev/null || true',
    '}',
    'trap boba_cleanup EXIT INT TERM',
    '',
    '# Detect sudo privilege',
    'if [ "$(id -u)" -ne 0 ]; then',
    '  if command -v sudo >/dev/null 2>&1; then',
    '    SUDO="sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1"',
    '  else',
    requiresRoot
      ? '    echo -e "\\033[1;31m[ERROR] Script membutuhkan hak akses root atau sudo untuk paket sistem.\\033[0m" >&2\n    exit 1'
      : '    SUDO=""',
    '  fi',
    'else',
    '  SUDO="env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 UCF_FORCE_CONFFOLD=1"',
    'fi',
    '',
    `TOTAL_STEPS=${totalSteps}`,
    'CURRENT_STEP=0',
    '',
    'boba_step() {',
    '  CURRENT_STEP=$((CURRENT_STEP + 1))',
    '  echo ""',
    '  echo -e "\\033[1;35m============================================================\\033[0m"',
    '  echo -e "\\033[1;32m[BOBA Progress $CURRENT_STEP/$TOTAL_STEPS]\\033[0m \\033[1;37m$1\\033[0m"',
    '  echo -e "\\033[1;35m============================================================\\033[0m"',
    '}',
    '',
    'boba_success() {',
    '  echo -e "\\033[1;32m✓ Selesai: $1\\033[0m"',
    '}',
    ''
  ];

  for (const step of allSteps) {
    const escapedTitle = step.title.replace(/"/g, '\\"');
    scriptParts.push(`boba_step "${escapedTitle}"`);
    scriptParts.push(step.cmd);
    scriptParts.push(`boba_success "${escapedTitle}"`);
    scriptParts.push('');
  }

  scriptParts.push('echo ""');
  scriptParts.push('echo -e "\\033[1;35m============================================================\\033[0m"');
  scriptParts.push('echo -e "\\033[1;32m🎉 SEMUA PROSES SETUP SELESAI DENGAN SUKSES!\\033[0m"');
  scriptParts.push('echo -e "\\033[1;36mPaket Terpasang: ' + selectedSoftwares.map((s) => s.name).join(', ') + '\\033[0m"');
  scriptParts.push('echo -e "\\033[1;35m============================================================\\033[0m"');

  const baseScript = scriptParts.join('\n');

  // If running in background mode, wrap in detached runner with nohup & log tailing
  if (options?.runInBackground) {
    const bgLines = [
      '# Bersihkan file script dan log lama agar tidak konflik permission',
      'rm -f /tmp/boba-setup.sh /tmp/boba-setup.lock 2>/dev/null || true',
      'cat << \'BOBA_EOF\' > /tmp/boba-setup.sh',
      baseScript,
      'BOBA_EOF',
      'chmod +x /tmp/boba-setup.sh',
      ''
    ];

    if (requiresRoot) {
      bgLines.push(
        '# Validasi hak sudo interaktif terlebih dahulu sebelum background job dijalankan',
        'if [ "$(id -u)" -ne 0 ]; then',
        '  if command -v sudo >/dev/null 2>&1; then',
        '    sudo -v',
        '  fi',
        'fi',
        ''
      );
    }

    bgLines.push(
      '# Jalankan script di background via nohup',
      'nohup /tmp/boba-setup.sh > /tmp/boba-setup.log 2>&1 &',
      'SETUP_PID=$!',
      '',
      'echo ""',
      'echo -e "\\033[1;35m============================================================\\033[0m"',
      'echo -e "\\033[1;32m🚀 Instalasi sedang berjalan di BACKGROUND (PID: $SETUP_PID)\\033[0m"',
      'echo -e "\\033[1;36mFile log tersimpan di: /tmp/boba-setup.log\\033[0m"',
      'echo -e "\\033[1;33m✓ Proses ini AMAN tetap berjalan di server meskipun koneksi SSH ditutup.\\033[0m"',
      'echo -e "\\033[1;35m============================================================\\033[0m"',
      'echo -e "Memantau log instalasi (Tekan Ctrl+C kapan saja untuk keluar pantauan tanpa mematikan instalasi):\\n"',
      'sleep 1',
      'tail -f /tmp/boba-setup.log'
    );

    return bgLines.join('\n');
  }

  return baseScript;
}
