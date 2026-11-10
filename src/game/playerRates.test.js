import test from 'node:test';
import assert from 'node:assert/strict';
import { percentage } from './playerRates.js';

test('win and attendance percentages distinguish absence or no wins from missing data', () => {
  assert.equal(percentage(3, 4), '75%');
  assert.equal(percentage(2, 3), '66.7%');
  assert.equal(percentage(1, 1), '100%');
  assert.equal(percentage(0, 5), '0%');
  assert.equal(percentage(0, 0), '—');
  assert.equal(percentage(0, undefined), '—');
  assert.equal(percentage(undefined, 5), '—');
});
