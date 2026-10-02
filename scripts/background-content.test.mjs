import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { __debug as prettierDebug } from "prettier";
import { z } from "zod";
import {
  backgroundReferenceWarnings,
  cardBackgroundIdSchema,
  validateBackgroundLibrary,
} from "./background-content.mjs";

const background = {
  id: "nile-river",
  name: "尼羅河",
  image: "/history-quest/uploads/nile-river.webp",
};
const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  backgroundId: cardBackgroundIdSchema,
});
const roundTrip = value => JSON.parse(JSON.stringify(value));

test("an omitted, cleared or empty background list remains a valid empty library", () => {
  for (const data of [{}, { backgrounds: null }, { backgrounds: [] }]) {
    assert.deepEqual(validateBackgroundLibrary(roundTrip(data)), []);
  }
});

test("multiple cards can reference the same named image without copying it", () => {
  const source = { backgrounds: [background] };
  const snapshot = roundTrip(source);
  const backgrounds = validateBackgroundLibrary(source);
  const cards = ["card-boy", "card-girl"].map(id =>
    cardSchema.parse({ id, name: id, backgroundId: background.id })
  );
  assert.deepEqual(backgroundReferenceWarnings(cards, backgrounds), []);
  assert.equal(backgrounds.length, 1);
  assert.equal(roundTrip(cards)[1].backgroundId, background.id);
  assert.equal(Object.hasOwn(cards[0], "image"), false);
  assert.deepEqual(
    source,
    snapshot,
    "validation must not rewrite saved content"
  );
});

test("old cards and cleared optional relation values survive JSON serialization", () => {
  for (const value of [undefined, null, ""]) {
    const card = { id: "old-card", name: "Existing card", backgroundId: value };
    const serialized = roundTrip(card);
    assert.deepEqual(cardSchema.parse(serialized), serialized);
    assert.deepEqual(backgroundReferenceWarnings([serialized], []), []);
  }
});

test("malformed relation values fail validation rather than being saved as IDs", () => {
  for (const backgroundId of [[], {}, false, 7, "x", "bad id"]) {
    assert.equal(cardBackgroundIdSchema.safeParse(backgroundId).success, false);
  }
});

test("whitespace-only and padded relation IDs normalize consistently with the homepage", () => {
  assert.equal(cardBackgroundIdSchema.parse(" \t "), "");
  const card = cardSchema.parse({
    id: "padded-card",
    name: "Padded",
    backgroundId: "  nile-river  ",
  });
  assert.equal(card.backgroundId, background.id);
  assert.deepEqual(backgroundReferenceWarnings([card], [background]), []);
});

test("library shapes, required fields and media sources are validated", () => {
  const badInputs = [
    null,
    [],
    { backgrounds: "" },
    { backgrounds: {} },
    { backgrounds: [null] },
    { backgrounds: [{ ...background, id: "bad id" }] },
    { backgrounds: [{ ...background, name: "  " }] },
    { backgrounds: [{ ...background, name: "a".repeat(81) }] },
    { backgrounds: [{ id: background.id, name: background.name }] },
    { backgrounds: [{ ...background, image: "" }] },
    { backgrounds: [{ ...background, image: "/history-quest/uploads/" }] },
    { backgrounds: [{ ...background, image: "/history-quest/uploads/   " }] },
    { backgrounds: [{ ...background, image: "https://" }] },
    { backgrounds: [{ ...background, image: "https://   " }] },
    {
      backgrounds: [{ ...background, image: "http://example.com/image.webp" }],
    },
    { backgrounds: [{ ...background, image: "javascript:alert(1)" }] },
  ];
  for (const data of badInputs)
    assert.throws(() => validateBackgroundLibrary(data));
  assert.equal(
    validateBackgroundLibrary({
      backgrounds: [{ ...background, image: "https://example.com/image.webp" }],
    }).length,
    1
  );
  assert.equal(
    validateBackgroundLibrary({
      backgrounds: [{ ...background, image: `  ${background.image}  ` }],
    })[0].image,
    background.image
  );
  const existingUpload = "/history-quest/uploads/  首頁 背景 圖.webp";
  assert.equal(
    validateBackgroundLibrary({
      backgrounds: [{ ...background, image: existingUpload }],
    })[0].image,
    existingUpload
  );
});

test("duplicate permanent background IDs fail even when labels differ", () => {
  assert.throws(
    () =>
      validateBackgroundLibrary({
        backgrounds: [background, { ...background, name: "另一張背景" }],
      }),
    /識別碼不可重複/
  );
});

test("a deleted or unknown background emits an actionable warning without blocking fallback", () => {
  const cards = [
    { id: "linked-card", name: "Linked", backgroundId: "removed-background" },
    { id: "valid-card", name: "Valid", backgroundId: background.id },
    { id: "old-card", name: "Old" },
    { id: "cleared-card", name: "Cleared", backgroundId: null },
  ];
  const warnings = backgroundReferenceWarnings(cards, [background]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /linked-card/);
  assert.match(warnings[0], /removed-background/);
  assert.match(warnings[0], /預設背景/);
});

// Use the project's existing YAML parser to check the actual CMS structure,
// including file/list relation paths, without adding a runtime dependency.
function yamlValue(node) {
  if (node.type === "document")
    return yamlValue(
      node.children.find(child => child.type === "documentBody")
    );
  if (node.type === "mapping" || node.type === "flowMapping")
    return Object.fromEntries(
      node.children.map(item => item.children.map(yamlValue))
    );
  if (node.type === "sequence" || node.type === "flowSequence")
    return node.children.map(yamlValue);
  if (Object.hasOwn(node, "value")) return node.value;
  if (node.children?.length === 1) return yamlValue(node.children[0]);
  throw new Error(`Unsupported CMS YAML node: ${node.type}`);
}

test("CMS relation resolves background list IDs and shows/searches names", async () => {
  const source = fs.readFileSync(
    new URL("../client/public/cms/config.yml", import.meta.url),
    "utf8"
  );
  const { ast } = await prettierDebug.parse(source, { parser: "yaml" });
  const config = yamlValue(ast);
  const cards = config.collections
    .find(collection => collection.name === "card_library")
    .files.find(file => file.name === "cards")
    .fields.find(field => field.name === "cards");
  const relation = cards.fields.find(field => field.name === "backgroundId");
  assert.equal(relation.widget, "relation");
  assert.equal(relation.multiple, "false");
  assert.equal(relation.required, "false");
  const library = config.collections
    .find(collection => collection.name === relation.collection)
    .files.find(file => file.name === relation.file);
  assert.equal(library.file, "client/src/content/settings/backgrounds.json");
  const list = library.fields.find(field => field.name === "backgrounds");
  assert.equal(list.widget, "list");
  assert.equal(list.required, "false");
  assert.deepEqual(
    list.fields.map(field => field.name),
    ["id", "name", "image"]
  );
  assert.equal(relation.value_field, `${list.name}.*.id`);
  assert.deepEqual(relation.display_fields, [`${list.name}.*.name`]);
  assert.deepEqual(relation.search_fields, [
    `${list.name}.*.name`,
    `${list.name}.*.id`,
  ]);
  const site = config.collections
    .find(collection => collection.name === "settings")
    .files.find(file => file.name === "site");
  assert.equal(
    site.fields.find(field => field.name === "hero").widget,
    "image"
  );
  assert.equal(
    site.fields.find(field => field.name === "heroPosition").widget,
    "image-position"
  );
});
