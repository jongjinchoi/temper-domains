import assert from 'node:assert/strict';

export function assertRecovery({ events, requests, final, injectedMs }) {
  const states = events.filter(event => event.type === 'state');
  const admissions = states.filter(event => event.admitted.length);
  const transmissions = events.filter(event => event.type === 'transport');
  assert.equal(admissions.length, 3, 'each lookup must commit one shared admission');
  assert.equal(transmissions.length, 3, 'each admitted lookup must reach the transport');
  assert.equal(requests.length, 3, 'each lookup must reach the loopback server');
  assert.equal(new Set(admissions.map(event => event.pid)).size, 3, 'admissions must come from distinct CLI processes');
  for (const { state } of states) {
    assert.equal(state.level, 3, 'valid answers must not prematurely relax recovery pacing');
    assert.equal(state.recovery, true);
    assert.equal(state.strikes, 2);
    assert.equal(state.generation, 2);
    assert.ok(state.leases.length <= 1, 'recovery permits only one active shared lease');
  }
  assert.deepEqual(admissions.map(event => event.state.successes), [0, 1, 2]);
  const admissionTimes = admissions.map(event => event.state.nextStart - 2400);
  for (let i = 0; i < admissions.length; i++) {
    const admission = admissions[i];
    assert.equal(admission.admitted.length, 1);
    const lease = admission.admitted[0];
    assert.equal(lease.probe, true);
    assert.equal(lease.pid, admission.pid);
    assert.equal(lease.generation, 2);
    assert.deepEqual(admission.state.leases.map(value => value.id), [lease.id]);
    const sent = transmissions.filter(event => event.leaseId === lease.id);
    assert.equal(sent.length, 1, 'a transmission must match its committed admission');
    assert.equal(sent[0].pid, admission.pid);
    assert.ok(sent[0].before >= admission.at);
    assert.equal(sent[0].injectedMs, i === 1 ? injectedMs : 0);
    assert.ok(sent[0].at - sent[0].before >= sent[0].injectedMs, 'the controlled delay must actually elapse');
    const finishes = events.filter(event => event.type === 'finish' && event.leaseId === lease.id);
    assert.equal(finishes.length, 1);
    assert.ok(finishes[0].at >= sent[0].at);
    assert.equal(requests.filter(value => value.path === sent[0].path).length, 1);
    if (i > 0) {
      // The committed nextStart records the reservation, not server arrival.
      // The fake-clock policy test separately checks its exact 2400ms boundary.
      assert.ok(admissionTimes[i] >= admissions[i - 1].state.nextStart,
        'shared recovery admission must wait the full 2400ms');
    }
  }
  assert.equal(final.level, 3);
  assert.equal(final.recovery, true);
  assert.equal(final.strikes, 2);
  assert.equal(final.generation, 2);
  assert.equal(final.successes, 3);
  assert.deepEqual(final.leases, []);
  return {
    admissionGaps: admissionTimes.slice(1).map((at, i) => at - admissionTimes[i]),
    arrivalGaps: requests.slice(1).map((request, i) => request.at - requests[i].at),
  };
}
