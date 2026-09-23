import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import assert from "node:assert/strict";

function setup(value, src = "/history-quest/uploads/test.png") {
  let component, saved;
  vm.runInNewContext(readFileSync(new URL("../client/public/cms/image-position.js", import.meta.url), "utf8"), {
    CMS: { registerWidget: (_, control) => { component = control; } },
    createClass: spec => spec,
    h: (tag, props, ...children) => ({ tag, props, children }),
    URL, location: { href: "http://localhost:3000/cms/index.html" },
  });
  component.props = {
    field: { get: () => "image" }, entry: { getIn: () => src }, value, forID: "position",
    onChange: next => { saved = next; },
  };
  component.state = component.getInitialState();
  component.setState = next => Object.assign(component.state, next);
  const nodes = node => node && typeof node === "object" ? [node, ...node.children.flatMap(nodes)] : [];
  return { component, render: () => nodes(component.render()), saved: () => saved };
}

test("legacy values default to center; draft image URLs stay intact", () => {
  const view = setup(undefined, "blob:draft-image");
  const nodes = view.render();
  assert.equal(nodes.find(n => n.tag === "img").props.src, "blob:draft-image");
  assert.deepEqual(nodes.filter(n => n.props?.type === "range").map(n => n.props.value), [50, 50]);
});

test("crop rectangle matches object-fit cover and controls persist position", () => {
  const view = setup({ x: 100, y: 0 });
  let nodes = view.render();
  const original = nodes.find(n => n.tag === "img");
  assert.equal(original.props.src, "/uploads/test.png");
  original.props.onLoad({ target: { naturalWidth: 1200, naturalHeight: 600 } });
  nodes = view.render();
  const rect = nodes.find(n => n.props?.style?.pointerEvents === "none").props.style;
  assert.equal(rect.height, "100%");
  assert.ok(Math.abs(parseFloat(rect.width) - 100 * (220 / 335) / 2) < 0.001);
  assert.ok(Math.abs(parseFloat(rect.left) + parseFloat(rect.width) - 100) < 0.001);
  nodes.find(n => n.props?.id === "position-y").props.onChange({ target: { value: "80" } });
  assert.equal(view.saved().y, 80);
  assert.equal(view.saved().x, 100);
  nodes.find(n => n.tag === "button").props.onClick();
  assert.equal(view.saved().x, 50);
  assert.equal(view.saved().y, 50);
});

test("missing images and failed loads show helpful feedback", () => {
  const empty = setup(undefined, "").render();
  assert.ok(empty.filter(n => n.props?.type === "range").every(n => n.props.disabled));
  const view = setup();
  view.render().find(n => n.tag === "img").props.onError();
  assert.ok(view.render().some(n => n.props?.role === "alert"));
});
