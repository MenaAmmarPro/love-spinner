"use strict";

/*
 * Dependency-free test harness for love-spinner's pure logic.
 * Runs js/app.js inside a fake DOM and asserts on window.MenaSpinner.
 *
 *   node test/harness.js
 */

const fs = require("fs");
const vm = require("vm");

const store = {};

const makeEl = () => ({
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  dataset: {},
  children: [],
  appendChild() {},
  addEventListener() {},
  setAttribute() {},
  removeAttribute() {},
  getAttribute() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  focus() {},
  remove() {},
  getBoundingClientRect() { return { left: 0, top: 0, width: 620, height: 620 }; },
  getContext() { return null; },
  toDataURL() { return "data:,"; },
  innerHTML: "",
  textContent: "",
  value: ""
});

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Date,
  Math,
  JSON,
  Intl,
  isFinite,
  Number,
  String,
  Array,
  Object,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => makeEl(),
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } }
  },
  navigator: { language: "en", clipboard: { writeText: async () => {} } },
  requestAnimationFrame: (fn) => setTimeout(fn, 0)
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = process.argv.slice(2);
for (const f of (files.length ? files : ["js/app.js"])) {
  vm.runInContext(fs.readFileSync(f, "utf8"), sandbox, { filename: f });
}

const NS = sandbox.window.MenaSpinner;

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error("FAIL: " + msg);
  } else {
    console.log("ok - " + msg);
  }
}
function eq(a, b, msg) {
  assert(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")");
}
function near(a, b, msg) {
  assert(Math.abs(a - b) < 1e-9, msg + " (got " + a + ", want " + b + ")");
}

assert(!!NS, "namespace exposed on window");
eq(NS.STORE, "mena-spinner", "storage key is mena-spinner");

/* ---------------- pickIndex ---------------- */
eq(NS.pickIndex(0, 4), 0, "pickIndex(0,4) = 0");
eq(NS.pickIndex(0.25, 4), 1, "pickIndex(0.25,4) = 1");
eq(NS.pickIndex(0.5, 4), 2, "pickIndex(0.5,4) = 2");
eq(NS.pickIndex(0.999, 4), 3, "pickIndex(0.999,4) = 3");
eq(NS.pickIndex(1, 4), 3, "pickIndex clamps rand=1 to last index");
eq(NS.pickIndex(-0.5, 4), 0, "pickIndex clamps negative rand to 0");
eq(NS.pickIndex(NaN, 4), 0, "pickIndex tolerates NaN");
eq(NS.pickIndex(0.5, 0), 0, "pickIndex n=0 returns 0");
eq(NS.pickIndex(0.5, 1), 0, "pickIndex n=1 returns 0");

/* ---------------- geometry ---------------- */
const seg = NS.wheelSegment(0, 4);
near(seg.start, 0, "segment 0 start = 0");
near(seg.mid, Math.PI / 4, "segment 0 mid = pi/4");
near(seg.span, Math.PI / 2, "segment span = pi/2");
near(NS.wheelSegment(3, 4).end, Math.PI * 2, "segment 3 ends at tau");
near(NS.wheelSegment(-1, 4).start, Math.PI * 1.5, "negative index wraps");

eq(NS.indexAtPointer(0, 4), 3, "pointer at rotation 0 -> segment 3");
eq(NS.indexAtPointer(Math.PI / 2, 4), 2, "pointer at rotation pi/2 -> segment 2");
eq(NS.indexAtPointer(Math.PI, 4), 1, "pointer at rotation pi -> segment 1");
eq(NS.indexAtPointer(0, 0), 0, "indexAtPointer n=0 returns 0");

/* ---------------- targetRotation lands where we ask ---------------- */
for (let n = 2; n <= 8; n += 1) {
  for (let t = 0; t < n; t += 1) {
    const rot = NS.targetRotation(0, t, n, 5);
    eq(NS.indexAtPointer(rot, n), t, "targetRotation lands on " + t + " of " + n);
  }
}
eq(NS.targetRotation(0, 0, 0, 5), 0, "targetRotation n=0 is safe");
assert(NS.targetRotation(0, 2, 5, 6) > Math.PI * 12, "targetRotation adds full turns");

/* ---------------- ease ---------------- */
eq(NS.easeOutCubic(0), 0, "ease(0)=0");
eq(NS.easeOutCubic(1), 1, "ease(1)=1");

/* ---------------- options ---------------- */
eq(NS.cleanText("  hello   there "), "hello there", "cleanText collapses whitespace");
eq(NS.cleanText(null), "", "cleanText(null) = ''");
assert(NS.cleanText("x".repeat(100)).length === 40, "cleanText caps at 40 chars");

const opts = NS.sanitizeOptions(["Pizza", "  ", "Pasta", null, "Biryani"]);
eq(opts.length, 3, "sanitizeOptions drops blanks");
eq(opts[2], "Biryani", "sanitizeOptions keeps order");

const added = NS.addOption(["Pizza"], "  Sushi ");
eq(added.length, 2, "addOption appends");
eq(added[1], "Sushi", "addOption cleans text");
eq(NS.addOption(["Pizza"], "   ").length, 1, "addOption ignores blanks");
eq(NS.addOption(["a", "b"], "c").length, 3, "addOption works on a copy");
eq(NS.removeOption(["a", "b", "c"], 1).join(","), "a,c", "removeOption removes index 1");
eq(NS.removeOption(["a"], 5).length, 1, "removeOption ignores out-of-range");
eq(NS.removeOption(["a"], "x").length, 1, "removeOption ignores bad index");

/* ---------------- presets ---------------- */
const defs = NS.defaultPresets();
assert(Array.isArray(defs) && defs.length >= 3, "defaultPresets has entries");
assert(defs.every((p) => p.name && p.options.length >= 2), "defaults are well formed");
assert(defs.some((p) => /eat/i.test(p.name)), "defaults include 'what to eat'");
assert(defs.some((p) => /watch/i.test(p.name)), "defaults include 'what to watch'");
assert(defs.some((p) => /pays/i.test(p.name)), "defaults include 'who pays'");

const up = NS.upsertPreset([], "Date night", ["Cafe", "Walk", "Movie"]);
eq(up.length, 1, "upsertPreset adds");
eq(up[0].name, "Date night", "upsertPreset keeps name");
const up2 = NS.upsertPreset(up, "date night", ["Picnic", "Stars"]);
eq(up2.length, 1, "upsertPreset replaces case-insensitively");
eq(up2[0].options[0], "Picnic", "upsertPreset updates options");
eq(NS.upsertPreset([], "Too few", ["Only one"]).length, 0, "upsertPreset needs 2+ options");
eq(NS.upsertPreset([], "", ["a", "b"]).length, 0, "upsertPreset needs a name");
eq(NS.removePreset(up, "Date night").length, 0, "removePreset removes by name");
eq(NS.removePreset(up, "Nope").length, 1, "removePreset keeps others");

/* ---------------- shuffle (deterministic) ---------------- */
const shuffled = NS.shuffleOptions(["1", "2", "3", "4"], () => 0);
eq(shuffled.length, 4, "shuffle keeps all items");
assert(shuffled.slice().sort().join("") === "1234", "shuffle keeps the same items");

/* ---------------- storage round-trip ---------------- */
const st = NS.load();
assert(Array.isArray(st.options), "load gives an options array");
assert(st.presets.length >= 3, "fresh load seeds default presets");
st.options = ["Pizza", "Pasta"];
st.spins = 7;
st.lastResult = "Pasta";
NS.save();
const reloaded = NS.load();
eq(reloaded.options.join(","), "Pizza,Pasta", "options survive a save/load");
eq(reloaded.spins, 7, "spins survive a save/load");
eq(reloaded.lastResult, "Pasta", "lastResult survives a save/load");

/* ---------------- messy input is repaired, not fatal ---------------- */
sandbox.localStorage.setItem("mena-spinner", "{not valid json");
const salvaged = NS.load();
eq(salvaged.spins, 0, "broken JSON resets cleanly");
assert(salvaged.presets.length >= 3, "broken JSON reseeds presets");

sandbox.localStorage.setItem("mena-spinner", JSON.stringify({
  options: "nope",
  presets: [{ name: "x", options: [] }, { name: "", options: ["a", "b"] }],
  spins: -4,
  lastResult: 123
}));
const messy = NS.load();
eq(messy.options.length, 0, "non-array options become empty");
assert(messy.presets.length >= 3, "all-invalid presets reseed the defaults");
eq(messy.spins, 0, "negative spins clamp to 0");
eq(messy.lastResult, "", "non-string lastResult becomes empty");

eq(NS.sanitizePresets([{ name: "x", options: [] }, { name: "", options: ["a", "b"] }]).length, 0,
  "sanitizePresets drops names without 2+ options");

console.log("");
if (failures) {
  console.error(failures + " assertion(s) failed");
  process.exit(1);
} else {
  console.log("All love-spinner assertions passed \u2665");
}
