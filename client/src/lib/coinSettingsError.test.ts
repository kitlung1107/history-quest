import { test } from "node:test";
import assert from "node:assert/strict";
import { coinSettingsError } from "./coinSettingsError.ts";
test("settings errors distinguish permission, login and connectivity with project context", () => {
  assert.match(coinSettingsError({code:"permission-denied"},"test-project"), /coinRules.*permission-denied.*test-project/);
  assert.match(coinSettingsError({code:"unauthenticated"},"test-project"), /重新登入教師/);
  assert.match(coinSettingsError({code:"unavailable"},"test-project"), /網絡/);
  assert.match(coinSettingsError(new Error("unknown"),"test-project"), /unknown/);
});
