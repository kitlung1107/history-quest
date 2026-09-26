import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, characterKey } from '../client/src/lib/characters.ts';

test('legacy persisted keys resolve to the corresponding new character', () => {
  for (const [key, name] of Object.entries({explorer:'探險家',scholar:'學者',archaeologist:'考古學家',navigator:'航海家'})) {
    assert.equal(characterKey(key), key);
    assert.equal(CHARACTERS[characterKey(key)].name, name);
  }
});

test('missing, unsupported and prototype values fall back to an actual character', () => {
  for (const value of [undefined, null, '', 'boat', 'compass', 'toString', '__proto__', 1, {}]) {
    assert.equal(characterKey(value), 'explorer');
    assert.equal(CHARACTERS[characterKey(value)].image, 'explorer.webp');
  }
});
