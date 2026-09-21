import { expect, test } from 'bun:test';
import { detectStatus, parseWhoisRaw } from './whois.ts';

// Sanitized field excerpts from the official servers, captured 2026-09-22.
test('official CR, SR and SN records are matched to the queried domain', () => {
  for (const [domain, raw] of [
    ['nic.cr', 'domain: nic.cr\nregistered: 31.12.1995 18:00:00\nexpire: 01.01.2035\nnserver: ns.nic.cr'],
    ['whois.sr', 'Domain: whois.sr\nStatus: active\nCreation Date: 2025-02-25'],
    ['nic.sn', 'Nom de domaine: nic.sn\nDate de création: 1998-01-01T00:00:00Z\nStatut: actif'],
  ]) {
    expect(detectStatus(raw!, domain!)).toBe('taken');
    expect(detectStatus(raw!, `different.${domain!.split('.').at(-1)}`)).toBe('error');
  }
});
// Negative fixtures plus synthetic adversarial and date-field cases.
test('WHOIS negative responses are explicit and do not match prose in a registered record', () => {
  expect(detectStatus('%ERROR:101: no entries found\n% No entries found.', 'unused.cr')).toBe('available');
  expect(detectStatus('Domain: unused.sr\nMessage: No Object Found', 'unused.sr')).toBe('available');
  expect(detectStatus('%% NOT FOUND', 'unused.sn')).toBe('available');
  expect(detectStatus('Domain Name: nic.io\nRemarks: Contact support if your payment was not found', 'nic.io')).toBe('taken');
  expect(detectStatus('Domain Name: nic.io\nRemarks: A matching payment does not exist', 'nic.io')).toBe('taken');
  expect(detectStatus('Domain Name: unused.so\nThe queried object does not exist: No Object Found\n>>> Last update of WHOIS database: 2026-09-22 <<<\n\nTERMS OF USE: You are not authorized to access or query our WHOIS database through high-volume automated processes.', 'unused.so')).toBe('available');
  expect(detectStatus('% Access denied: not authorized', 'unused.so')).toBe('error');
  expect(detectStatus('Domain: wrong.sr\nMessage: No Object Found', 'unused.sr')).toBe('error');
  expect(parseWhoisRaw("Nom de domaine: nic.sn\nDate d'expiration: 2030-01-01\nStatut: actif", 'sn').expiryDate).toContain('2030');
  expect(parseWhoisRaw('domain: nic.cr\nexpire: 01.01.2035', 'cr').expiryDate).toContain('2035');
});

import { lookupPlan } from './services.ts';
import { parseBootstrap } from './bootstrap-cache.ts';
test('routing uses official complete endpoint lists and verified WHOIS profiles', () => {
  const registry = parseBootstrap({ services: [[['com'], ['https://first.example/', 'https://second.example/']], [['cr', 'sr', 'sn'], ['https://rdap.example/']]] });
  expect(lookupPlan('example.com', registry).endpoints).toHaveLength(2);
  for (const root of ['cr', 'sr', 'sn']) expect(lookupPlan(`nic.${root}`, registry).method).toBe('whois');
  expect(lookupPlan('example.unknown', registry).method).toBe('unsupported');
});
