import assert from 'node:assert/strict';
import test from 'node:test';
import { publicGroupHref, readRoute } from '../public/routes';
import { groupRoute } from '../test/assertions';
import { currentPeriod, periodTitle } from './seasonPeriods';

test('calendar-month seasons follow northern periods and keep the year separate', () => {
  const expected = [
    'winter',
    'winter',
    'spring',
    'spring',
    'spring',
    'summer',
    'summer',
    'summer',
    'fall',
    'fall',
    'fall',
    'winter',
  ];
  for (let month = 0; month < 12; month++)
    assert.equal(currentPeriod(new Date(2026, month, 15)), expected[month]);
  assert.equal(periodTitle(2026, 'fall'), 'Fall 2026');
  assert.equal(periodTitle(2026, 'all'), '2026');
});

test('period filters survive deep links, pagination and detail navigation', () => {
  const group = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const matchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  for (const period of ['all', 'winter', 'spring', 'summer', 'fall']) {
    const route = readRoute(
      publicGroupHref(group, { season: 2025, period, page: 3, pageSize: 10, matchId }),
    );
    assert.equal(groupRoute(route).period, period);
    assert.equal(groupRoute(route).season, 2025);
    assert.equal(groupRoute(route).page, 3);
    assert.equal(groupRoute(route).matchId, matchId);
  }
  assert.equal(readRoute(`#/groups/${group}?period=unknown`).kind, 'missing');
});
