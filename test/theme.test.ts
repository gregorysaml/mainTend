import test from 'node:test';
import assert from 'node:assert/strict';
import { oppositeTheme, readTheme, themeStorageKey } from '../frontend/src/utils/theme.ts';

test('MainTend defaults to light and does not accept unknown stored themes', () => {
  for (const value of [null, '', 'system', 'DARK', '<script>']) {
    assert.equal(readTheme({ getItem: () => value }), 'light');
  }
});
test('MainTend restores the explicit light preference from its own key', () => {
  assert.equal(readTheme({ getItem: key => { assert.equal(key, themeStorageKey); return 'light'; } }), 'light');
});
test('MainTend restores an explicit dark preference', () => {
  assert.equal(readTheme({ getItem: () => 'dark' }), 'dark');
});
test('MainTend remains usable when browser storage is blocked', () => {
  assert.equal(readTheme({ getItem: () => { throw new Error('Storage blocked'); } }), 'light');
});
test('Theme switching is reversible', () => {
  assert.equal(oppositeTheme('dark'), 'light');
  assert.equal(oppositeTheme('light'), 'dark');
});
