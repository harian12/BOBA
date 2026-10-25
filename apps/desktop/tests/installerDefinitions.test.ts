import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOsRelease,
  parseDetectionOutput,
  cleanVersionString,
  buildDetectionCommand,
  generateInstallScript,
  getPackageUpdateCommand,
  getPackageUninstallCommand,
  buildRunningCheckCommand,
  parseRunningStatus,
  buildKillSetupCommand,
  SOFTWARE_LIST,
  STACK_PRESETS
} from '../app/utils/installerDefinitions.ts';

test('parseOsRelease parses Ubuntu correctly', () => {
  const raw = `
NAME="Ubuntu"
VERSION="22.04.3 LTS (Jammy Jellyfish)"
ID=ubuntu
ID_LIKE=debian
PRETTY_NAME="Ubuntu 22.04.3 LTS"
VERSION_ID="22.04"
`;
  const info = parseOsRelease(raw);
  assert.equal(info.id, 'ubuntu');
  assert.equal(info.family, 'debian');
  assert.equal(info.version, '22.04');
  assert.equal(info.name, 'Ubuntu 22.04.3 LTS');
});

test('parseOsRelease parses CentOS / AlmaLinux correctly', () => {
  const raw = `
NAME="AlmaLinux"
VERSION="9.3 (Shamrock Pampas Cat)"
ID="almalinux"
ID_LIKE="rhel centos fedora"
VERSION_ID="9.3"
PRETTY_NAME="AlmaLinux 9.3 (Shamrock Pampas Cat)"
`;
  const info = parseOsRelease(raw);
  assert.equal(info.id, 'almalinux');
  assert.equal(info.family, 'rhel');
  assert.equal(info.version, '9.3');
});

test('cleanVersionString formats diverse CLI versions into clean badges', () => {
  assert.equal(cleanVersionString('1.1.29'), '1.1.29'); // Bun
  assert.equal(cleanVersionString('v20.11.0'), '20.11.0'); // Node
  assert.equal(cleanVersionString('deno 1.41.0 (release, x86_64-unknown-linux-gnu)'), '1.41.0'); // Deno
  assert.equal(cleanVersionString('openjdk version "21.0.2" 2024-01-16'), '21.0.2'); // Java OpenJDK
  assert.equal(cleanVersionString('java version "17.0.9" 2023-10-17'), '17.0.9'); // Oracle Java
  assert.equal(cleanVersionString('go version go1.22.1 linux/amd64'), 'go1.22.1'); // Go
  assert.equal(cleanVersionString('Python 3.10.12'), '3.10.12'); // Python
  assert.equal(cleanVersionString('ruby 3.2.3 (2024-01-18 revision 52bb2ac0a6) [x86_64-linux]'), '3.2.3'); // Ruby
  assert.equal(cleanVersionString('Composer version 2.7.2 2024-03-11 17:12:18'), '2.7.2'); // Composer
  assert.equal(cleanVersionString('Docker version 26.0.0, build 2ae903e'), '26.0.0'); // Docker
  assert.equal(cleanVersionString('Redis server v=7.0.15 sha=00000000:0 ...'), '7.0.15'); // Redis
  assert.equal(cleanVersionString('psql (PostgreSQL) 15.6 (Ubuntu 15.6-1.pgdg22.04+1)'), '15.6'); // Postgres
  assert.equal(cleanVersionString('PHP 8.2.10-2ubuntu1 (cli) (built: Oct 12 2023 14:15:35)'), '8.2.10'); // PHP
  assert.equal(cleanVersionString('mysql  Ver 8.0.36-0ubuntu0.22.04.1 for Linux on x86_64'), '8.0.36'); // MySQL
  assert.equal(cleanVersionString('mysql  Ver 15.1 Distrib 10.6.18-MariaDB, for debian-linux-gnu (x86_64)'), '10.6.18'); // MariaDB via mysql CLI
  assert.equal(cleanVersionString('mariadbd  Ver 10.11.6-MariaDB-0ubuntu0.23.10.2 for debian-linux-gnu on x86_64'), '10.11.6'); // MariaDB daemon
  assert.equal(cleanVersionString('mariadb from 11.2.2-MariaDB, client 15.2 for Linux'), '11.2.2'); // MariaDB
  assert.equal(cleanVersionString('nginx version: nginx/1.18.0 (Ubuntu)'), '1.18.0'); // Nginx
  assert.equal(cleanVersionString('1:10.6.18-0ubuntu0.22.04.1'), '10.6.18'); // Debian package version
  assert.equal(cleanVersionString('Description=MariaDB 10.6.18 database server'), '10.6.18'); // systemd description
  assert.equal(cleanVersionString('ii  mariadb-server-10.6  1:10.6.18-0ubuntu0.22.04.1  amd64  MariaDB database server'), '10.6.18'); // dpkg full row
  assert.equal(cleanVersionString('222'), 'Terpasang'); // Random digit rejection
  assert.equal(cleanVersionString('environment:'), 'Terpasang'); // Non-numeric fallback
  assert.equal(cleanVersionString('bash: /etc/mysql: Permission denied'), 'Terpasang'); // Error fallback
});

test('parseDetectionOutput parses installed runtimes with accurate badges', () => {
  const output = `
BOBA_CHK:nginx:1:nginx version: nginx/1.18.0 (Ubuntu)
BOBA_CHK:bun:1:1.1.29
BOBA_CHK:deno:1:deno 1.41.0 (release, x86_64-unknown-linux-gnu)
BOBA_CHK:java:1:openjdk version "21.0.2" 2024-01-16
BOBA_CHK:nodejs:1:v20.11.0
BOBA_CHK:ruby:0:
`;
  const parsed = parseDetectionOutput(output);
  assert.equal(parsed.bun?.installed, true);
  assert.equal(parsed.bun?.version, '1.1.29');
  assert.equal(parsed.deno?.installed, true);
  assert.equal(parsed.deno?.version, '1.41.0');
  assert.equal(parsed.java?.installed, true);
  assert.equal(parsed.java?.version, '21.0.2');
  assert.equal(parsed.nodejs?.installed, true);
  assert.equal(parsed.nodejs?.version, '20.11.0');
  assert.equal(parsed.ruby?.installed, false);
});

test('buildDetectionCommand includes custom PATHs for bun, deno, cargo, go', () => {
  const cmd = buildDetectionCommand(SOFTWARE_LIST);
  assert.equal(cmd.includes('.bun/bin'), true);
  assert.equal(cmd.includes('.deno/bin'), true);
  assert.equal(cmd.includes('.cargo/bin'), true);
  assert.equal(cmd.includes('.local/bin'), true);
  assert.equal(cmd.includes('find_candidate'), true);
});

test('generateInstallScript outputs valid sequential bash script with step banners', () => {
  const os = {
    id: 'ubuntu',
    name: 'Ubuntu 22.04 LTS',
    version: '22.04',
    family: 'debian' as const
  };

  const script = generateInstallScript(['nginx', 'bun', 'deno', 'java'], os, { updateRepo: true });

  assert.equal(script.includes('#!/usr/bin/env bash'), true);
  assert.equal(script.includes('set -e'), true);
  assert.equal(script.includes('boba_step'), true);
  assert.equal(script.includes('apt-get update'), true);
  assert.equal(script.includes('nginx'), true);
  assert.equal(script.includes('bun.sh/install'), true);
  assert.equal(script.includes('deno.land/install.sh'), true);
  assert.equal(script.includes('default-jdk'), true);
  assert.equal(script.includes('SEMUA PROSES SETUP SELESAI'), true);
});

test('generateInstallScript wraps in nohup and tail background runner when runInBackground is true', () => {
  const os = { id: 'ubuntu', name: 'Ubuntu', version: '24.04', family: 'debian' as const };
  const script = generateInstallScript(['nginx'], os, { runInBackground: true });

  assert.equal(script.includes('/tmp/boba-setup.sh'), true);
  assert.equal(script.includes('nohup /tmp/boba-setup.sh > /tmp/boba-setup.log 2>&1 &'), true);
  assert.equal(script.includes('tail -f /tmp/boba-setup.log'), true);
});

test('generateInstallScript for user-space tools (deno, bun, pnpm) does not require sudo or apt update', () => {
  const os = { id: 'ubuntu', name: 'Ubuntu', version: '24.04', family: 'debian' as const };
  const script = generateInstallScript(['deno', 'bun', 'pnpm'], os, { runInBackground: true });

  assert.equal(script.includes('apt-get update'), false);
  assert.equal(script.includes('sudo -v'), false);
  assert.equal(script.includes('deno.land/install.sh'), true);
  assert.equal(script.includes('bun.sh/install'), true);
  assert.equal(script.includes('get.pnpm.io/install.sh'), true);
});

test('presets contain valid software IDs from SOFTWARE_LIST', () => {
  const allIds = new Set(SOFTWARE_LIST.map((s) => s.id));
  for (const preset of STACK_PRESETS) {
    for (const pkgId of preset.packages) {
      assert.equal(allIds.has(pkgId), true, `Preset ${preset.id} references invalid package ${pkgId}`);
    }
  }
});

test('getPackageUpdateCommand generates correct upgrade commands', () => {
  const debianOs = { id: 'ubuntu', name: 'Ubuntu', version: '24.04', family: 'debian' as const };
  const rhelOs = { id: 'rocky', name: 'Rocky Linux', version: '9.3', family: 'rhel' as const };
  const alpineOs = { id: 'alpine', name: 'Alpine Linux', version: '3.19', family: 'alpine' as const };
  const archOs = { id: 'arch', name: 'Arch Linux', version: 'rolling', family: 'arch' as const };

  const bun = SOFTWARE_LIST.find((s) => s.id === 'bun')!;
  const nginx = SOFTWARE_LIST.find((s) => s.id === 'nginx')!;
  const mariadb = SOFTWARE_LIST.find((s) => s.id === 'mariadb')!;
  const go = SOFTWARE_LIST.find((s) => s.id === 'go')!;

  assert.equal(getPackageUpdateCommand(bun, debianOs), 'bun upgrade');
  assert.equal(getPackageUpdateCommand(nginx, debianOs).includes('apt-get install --only-upgrade -y nginx'), true);
  assert.equal(getPackageUpdateCommand(nginx, rhelOs).includes('dnf upgrade -y nginx'), true);
  assert.equal(getPackageUpdateCommand(nginx, alpineOs).includes('apk upgrade nginx'), true);
  assert.equal(getPackageUpdateCommand(nginx, archOs).includes('pacman -Sy --noconfirm nginx'), true);
  assert.equal(getPackageUpdateCommand(mariadb, debianOs).includes('mariadb_repo_setup'), true);
  assert.equal(getPackageUpdateCommand(go, debianOs).includes('golang-go'), true);
  assert.equal(getPackageUpdateCommand(go, rhelOs).includes('golang'), true);
  assert.equal(getPackageUpdateCommand(go, alpineOs).includes('go'), true);
  assert.equal(getPackageUpdateCommand(go, archOs).includes('go'), true);
});

test('getPackageUninstallCommand generates correct uninstall commands', () => {
  const debianOs = { id: 'ubuntu', name: 'Ubuntu', version: '24.04', family: 'debian' as const };
  const rhelOs = { id: 'almalinux', name: 'AlmaLinux', version: '9', family: 'rhel' as const };
  const alpineOs = { id: 'alpine', name: 'Alpine Linux', version: '3.19', family: 'alpine' as const };
  const archOs = { id: 'arch', name: 'Arch Linux', version: 'rolling', family: 'arch' as const };

  const deno = SOFTWARE_LIST.find((s) => s.id === 'deno')!;
  const bun = SOFTWARE_LIST.find((s) => s.id === 'bun')!;
  const nginx = SOFTWARE_LIST.find((s) => s.id === 'nginx')!;

  assert.equal(getPackageUninstallCommand(deno, debianOs).includes('.deno'), true);
  assert.equal(getPackageUninstallCommand(bun, debianOs).includes('.bun'), true);
  assert.equal(getPackageUninstallCommand(nginx, debianOs).includes('apt-get purge -y nginx'), true);
  assert.equal(getPackageUninstallCommand(nginx, rhelOs).includes('dnf remove -y nginx'), true);
  assert.equal(getPackageUninstallCommand(nginx, alpineOs).includes('apk del nginx'), true);
  assert.equal(getPackageUninstallCommand(nginx, archOs).includes('pacman -R --noconfirm nginx'), true);
});

test('every software definition provides valid install steps for Debian, RHEL, Alpine, and Arch', () => {
  const distros = [
    { id: 'ubuntu', name: 'Ubuntu', version: '24.04', family: 'debian' as const },
    { id: 'rocky', name: 'Rocky', version: '9', family: 'rhel' as const },
    { id: 'alpine', name: 'Alpine', version: '3.19', family: 'alpine' as const },
    { id: 'arch', name: 'Arch Linux', version: 'rolling', family: 'arch' as const }
  ];

  for (const sw of SOFTWARE_LIST) {
    for (const os of distros) {
      const steps = sw.getInstallSteps(os);
      assert.ok(steps.length > 0, `${sw.id} has no install steps for ${os.family}`);
      for (const step of steps) {
        assert.ok(step.stepName && step.stepName.trim().length > 0, `${sw.id} on ${os.family} step has no name`);
        assert.ok(step.cmd && step.cmd.trim().length > 0, `${sw.id} on ${os.family} step has no cmd`);
      }
    }
  }
});

test('buildRunningCheckCommand and parseRunningStatus detects running and idle states', () => {
  const cmd = buildRunningCheckCommand();
  assert.equal(cmd.includes('/tmp/boba-setup.lock'), true);
  assert.equal(cmd.includes('RUNNING:'), true);

  const runningStatus = parseRunningStatus('RUNNING:45123\n');
  assert.equal(runningStatus.isRunning, true);
  assert.equal(runningStatus.pid, '45123');
  assert.equal(runningStatus.reason, 'boba');

  const busyStatus = parseRunningStatus('SYSTEM_BUSY:apt\n');
  assert.equal(busyStatus.isRunning, true);
  assert.equal(busyStatus.reason, 'system');

  const idleStatus = parseRunningStatus('IDLE\n');
  assert.equal(idleStatus.isRunning, false);
});

test('buildKillSetupCommand contains kill and lockfile cleanup', () => {
  const killCmd = buildKillSetupCommand();
  assert.equal(killCmd.includes('kill -9'), true);
  assert.equal(killCmd.includes('/tmp/boba-setup.lock'), true);
  assert.equal(killCmd.includes('pkill -9 -f "boba-setup"'), true);
});
