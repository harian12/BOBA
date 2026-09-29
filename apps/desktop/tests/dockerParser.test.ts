import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDockerContainers,
  parseDockerImages,
  parseDockerVolumes,
  parseDockerNetworks,
  parseDockerStats,
  buildDockerCommand
} from '../app/utils/dockerParser.ts';

test('correctly parses docker container json output', () => {
  const rawOutput = `
{"id":"c3f1a2b3c4d5","names":"web-nginx","image":"nginx:alpine","status":"Up 2 hours","state":"running","ports":"0.0.0.0:80->80/tcp","created":"2 hours ago"}
{"id":"a1b2c3d4e5f6","names":"api-backend","image":"node:20","status":"Exited (0) 5 mins ago","state":"exited","ports":"","created":"1 day ago"}
`;
  const containers = parseDockerContainers(rawOutput);
  assert.equal(containers.length, 2);
  assert.equal(containers[0]?.id, 'c3f1a2b3c4d5');
  assert.equal(containers[0]?.names, 'web-nginx');
  assert.equal(containers[0]?.state, 'running');
  assert.equal(containers[1]?.names, 'api-backend');
  assert.equal(containers[1]?.state, 'exited');
});

test('correctly parses docker stats json output', () => {
  const rawStats = `
{"id":"c3f1a2b3c4d5","cpu":"0.45%","mem":"15.2MiB / 1.95GiB"}
{"id":"a1b2c3d4e5f6","cpu":"1.20%","mem":"120MiB / 1.95GiB"}
`;
  const stats = parseDockerStats(rawStats);
  assert.equal(stats['c3f1a2b3c4d5']?.cpu, '0.45%');
  assert.equal(stats['c3f1a2b3c4d5']?.mem, '15.2MiB / 1.95GiB');
});

test('correctly parses docker volumes json output', () => {
  const rawVolumes = `
{"name":"app_data","driver":"local","scope":"local"}
{"name":"postgres_pgdata","driver":"local","scope":"local"}
`;
  const volumes = parseDockerVolumes(rawVolumes);
  assert.equal(volumes.length, 2);
  assert.equal(volumes[0]?.name, 'app_data');
  assert.equal(volumes[1]?.name, 'postgres_pgdata');
});

test('correctly parses docker networks json output', () => {
  const rawNetworks = `
{"id":"net123456789","name":"bridge","driver":"bridge","scope":"local"}
{"id":"net987654321","name":"custom_net","driver":"overlay","scope":"swarm"}
`;
  const networks = parseDockerNetworks(rawNetworks);
  assert.equal(networks.length, 2);
  assert.equal(networks[0]?.name, 'bridge');
  assert.equal(networks[0]?.driver, 'bridge');
  assert.equal(networks[1]?.name, 'custom_net');
  assert.equal(networks[1]?.scope, 'swarm');
});

test('correctly parses docker images json output', () => {
  const rawOutput = `
{"id":"sha256:1234567890ab","repository":"nginx","tag":"alpine","size":"45MB","created":"2 weeks ago"}
{"id":"sha256:abcdef123456","repository":"redis","tag":"latest","size":"110MB","created":"1 month ago"}
`;
  const images = parseDockerImages(rawOutput);
  assert.equal(images.length, 2);
  assert.equal(images[0]?.repository, 'nginx');
  assert.equal(images[0]?.tag, 'alpine');
  assert.equal(images[0]?.size, '45MB');
});

test('builds command with and without sudo', () => {
  assert.equal(buildDockerCommand('docker ps'), 'docker ps');
  assert.equal(buildDockerCommand('docker ps', true), 'sudo docker ps');
  assert.equal(buildDockerCommand('docker ps', true, 'secret123'), "echo 'secret123' | sudo -S docker ps");
});
