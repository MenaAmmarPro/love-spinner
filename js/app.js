"use strict";

/*
 * love-spinner — page logic.
 *
 * A little decision wheel. Options live on this device in localStorage under
 * `mena-spinner`. The geometry helpers are pure so they can be tested without
 * a canvas.
 */

(function () {
  var STORE = "mena-spinner";
  var TAU = Math.PI * 2;
  var MAX_OPTIONS = 24;
  var MAX_PRESETS = 16;
  var MAX_HISTORY = 6;
  var COLORS = ["#ff9fcf", "#bba6ff", "#ff72b8", "#ffd166", "#7fe0ff", "#9dffb0"];

  var state = {
    options: [],
    presets: [],
    spins: 0,
    lastResult: "",
    history: [],
    rotation: 0
  };

  var canvas = null;
  var ctx = null;
  var spinning = false;

  /* ---------------- pure geometry ---------------- */

  function norm(angle) {
    var a = Number(angle);
    if (!isFinite(a)) return 0;
    var t = a % TAU;
    return t < 0 ? t + TAU : t;
  }

  function pickIndex(rand, n) {
    var count = Math.floor(Number(n));
    if (!isFinite(count) || count <= 0) return 0;
    var r = Number(rand);
    if (!isFinite(r)) r = 0;
    var idx = Math.floor(r * count);
    if (idx < 0) idx = 0;
    if (idx > count - 1) idx = count - 1;
    return idx;
  }

  function wheelSegment(i, n) {
    var count = Math.floor(Number(n));
    if (!isFinite(count) || count <= 0) {
      return { start: 0, end: 0, mid: 0, span: 0 };
    }
    var span = TAU / count;
    var idx = ((Math.floor(Number(i)) % count) + count) % count;
    var start = idx * span;
    return { start: start, end: start + span, mid: start + span / 2, span: span };
  }

  // Which segment sits under the fixed top pointer for a given wheel rotation.
  function indexAtPointer(rotation, n) {
    var count = Math.floor(Number(n));
    if (!isFinite(count) || count <= 0) return 0;
    var span = TAU / count;
    var local = norm(-Math.PI / 2 - Number(rotation));
    var idx = Math.floor(local / span);
    if (idx < 0) idx = 0;
    if (idx > count - 1) idx = count - 1;
    return idx;
  }

  // Rotation that lands `targetIndex` under the pointer, after `turns` turns.
  function targetRotation(current, targetIndex, n, turns) {
    var count = Math.floor(Number(n));
    if (!isFinite(count) || count <= 0) return Number(current) || 0;
    var from = Number(current) || 0;
    var t = Math.floor(Number(targetIndex)) || 0;
    if (t < 0) t = 0;
    if (t > count - 1) t = count - 1;
    var span = TAU / count;
    var mid = (t + 0.5) * span;
    var want = -Math.PI / 2 - mid;
    var base = norm(want - from);
    var extra = turns > 0 ? Math.floor(turns) * TAU : 0;
    return from + extra + base;
  }

  function easeOutCubic(t) {
    var x = t < 0 ? 0 : (t > 1 ? 1 : t);
    return 1 - Math.pow(1 - x, 3);
  }

  /* ---------------- pure list helpers ---------------- */

  function cleanText(text) {
    if (text == null) return "";
    return String(text).replace(/\s+/g, " ").trim().slice(0, 40);
  }

  function sanitizeOptions(list) {
    var out = [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length && out.length < MAX_OPTIONS; i += 1) {
        var text = cleanText(list[i]);
        if (text) out.push(text);
      }
    }
    return out;
  }

  function addOption(list, text) {
    var out = Array.isArray(list) ? list.slice(0) : [];
    var clean = cleanText(text);
    if (clean && out.length < MAX_OPTIONS) out.push(clean);
    return out;
  }

  function removeOption(list, index) {
    var out = Array.isArray(list) ? list.slice(0) : [];
    var i = Math.floor(Number(index));
    if (isFinite(i) && i >= 0 && i < out.length) out.splice(i, 1);
    return out;
  }

  function shuffleOptions(list, rand) {
    var out = Array.isArray(list) ? list.slice(0) : [];
    var rnd = typeof rand === "function" ? rand : Math.random;
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function sanitizePresets(list) {
    var out = [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length && out.length < MAX_PRESETS; i += 1) {
        var p = list[i];
        if (!p) continue;
        var name = cleanText(p.name).slice(0, 30);
        var opts = sanitizeOptions(p.options);
        if (name && opts.length >= 2) out.push({ name: name, options: opts });
      }
    }
    return out;
  }

  function upsertPreset(presets, name, options) {
    var out = sanitizePresets(presets);
    var clean = cleanText(name).slice(0, 30);
    var opts = sanitizeOptions(options);
    if (!clean || opts.length < 2) return out;
    var found = false;
    for (var i = 0; i < out.length; i += 1) {
      if (out[i].name.toLowerCase() === clean.toLowerCase()) {
        out[i] = { name: clean, options: opts };
        found = true;
        break;
      }
    }
    if (!found) {
      if (out.length >= MAX_PRESETS) out.shift();
      out.push({ name: clean, options: opts });
    }
    return out;
  }

  function removePreset(presets, name) {
    var out = sanitizePresets(presets);
    var clean = cleanText(name).toLowerCase();
    return out.filter(function (p) { return p.name.toLowerCase() !== clean; });
  }

  function sanitizeHistory(list) {
    var out = [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length && out.length < MAX_HISTORY; i += 1) {
        var text = cleanText(list[i]);
        if (text) out.push(text);
      }
    }
    return out;
  }

  function pushResult(history, value, max) {
    var out = sanitizeHistory(history);
    var text = cleanText(value);
    var limit = Math.floor(Number(max));
    if (!isFinite(limit) || limit < 1) limit = MAX_HISTORY;
    if (text) {
      out.unshift(text);
      out = out.slice(0, limit);
    }
    return out;
  }

  function defaultPresets() {
    return [
      { name: "What to eat", options: ["Pizza", "Biryani", "Sushi", "Burgers", "Pasta", "Salad"] },
      { name: "What to watch", options: ["A rom-com", "An anime", "Our show", "Something scary", "A documentary"] },
      { name: "Who pays", options: ["Ammar pays", "Mena pays", "Split it", "Next time \u2665"] },
      { name: "Tonight", options: ["Call each other", "Watch together", "Play Free Fire", "Early night"] }
    ];
  }

  /* ---------------- storage ---------------- */

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { raw = null; }
    var saved = null;
    if (raw) { try { saved = JSON.parse(raw); } catch (e) { saved = null; } }
    if (!saved || typeof saved !== "object") saved = {};

    state.options = sanitizeOptions(saved.options);
    state.presets = sanitizePresets(saved.presets);
    if (!state.presets.length) state.presets = defaultPresets();
    state.spins = Math.max(0, Math.floor(Number(saved.spins)) || 0);
    state.lastResult = typeof saved.lastResult === "string" ? cleanText(saved.lastResult) : "";
    state.history = sanitizeHistory(saved.history);
    state.rotation = 0;
    return state;
  }

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        options: state.options,
        presets: state.presets,
        spins: state.spins,
        lastResult: state.lastResult,
        history: state.history
      }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- rendering ---------------- */

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function note(message) { setText("wheel-note", message); }

  function colorFor(i) { return COLORS[i % COLORS.length]; }

  function fitCanvas() {
    if (!canvas || !canvas.getBoundingClientRect) return;
    var rect = canvas.getBoundingClientRect();
    var cssSide = rect && rect.width ? rect.width : canvas.width;
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    var side = Math.max(1, Math.round(cssSide * dpr));
    canvas.width = side;
    canvas.height = side;
    drawWheel(state.rotation);
  }

  function drawWheel(rotation) {
    if (!ctx || !canvas) return;
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) / 2 - 6;

    ctx.clearRect(0, 0, w, h);
    var n = state.options.length;
    var span = TAU / (n || 1);

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(219,212,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#b9bbd5";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 " + Math.round(r * 0.11) + "px 'Segoe UI', Arial, sans-serif";
      ctx.fillText("Add options \u2665", cx, cy);
      return;
    }

    for (var i = 0; i < n; i += 1) {
      var start = rotation + i * span;
      var end = start + span;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = colorFor(i);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + span / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#2a2350";
      ctx.font = "600 " + Math.max(11, Math.round(r * 0.072)) + "px 'Segoe UI', Arial, sans-serif";
      var label = state.options[i];
      if (label.length > 18) label = label.slice(0, 17) + "\u2026";
      ctx.fillText(label, r - 14, 0);
      ctx.restore();
    }

    var hub = Math.max(16, r * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, hub, 0, TAU);
    ctx.fillStyle = "#090b20";
    ctx.fill();
    ctx.strokeStyle = "#ff9fcf";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ff9fcf";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.round(hub * 1.1) + "px Arial, sans-serif";
    ctx.fillText("\u2665", cx, cy + 1);
  }

  function renderOptions() {
    var list = document.getElementById("option-list");
    updateStats();
    if (!list) return;
    list.textContent = "";

    if (!state.options.length) {
      var empty = document.createElement("li");
      empty.className = "option-empty";
      empty.textContent = "Nothing here yet \u2014 add your first option above.";
      list.appendChild(empty);
      return;
    }

    state.options.forEach(function (text, index) {
      var li = document.createElement("li");
      li.className = "option-item";

      var dot = document.createElement("span");
      dot.className = "option-dot";
      dot.style.background = colorFor(index);

      var span = document.createElement("span");
      span.className = "option-text";
      span.textContent = text;

      var remove = document.createElement("button");
      remove.className = "option-remove";
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove " + text);
      remove.textContent = "\u00d7";
      remove.addEventListener("click", function () {
        state.options = removeOption(state.options, index);
        afterOptionsChange();
      });

      li.appendChild(dot);
      li.appendChild(span);
      li.appendChild(remove);
      list.appendChild(li);
    });
  }

  function renderHistory() {
    var list = document.getElementById("result-history");
    if (!list) return;
    list.textContent = "";

    if (!state.history.length) {
      var empty = document.createElement("li");
      empty.className = "is-empty";
      empty.textContent = "no spins yet";
      list.appendChild(empty);
      return;
    }

    state.history.forEach(function (text, index) {
      var li = document.createElement("li");
      if (index === 0) li.className = "is-latest";
      li.textContent = text;
      list.appendChild(li);
    });
  }

  function renderPresets() {
    var wrap = document.getElementById("preset-list");
    if (!wrap) return;
    wrap.textContent = "";

    state.presets.forEach(function (preset) {
      var chip = document.createElement("span");
      chip.className = "preset-chip";

      var apply = document.createElement("button");
      apply.className = "preset-apply";
      apply.type = "button";
      apply.textContent = preset.name;
      apply.title = preset.options.join(", ");
      apply.addEventListener("click", function () { applyPreset(preset); });

      var del = document.createElement("button");
      del.className = "preset-del";
      del.type = "button";
      del.textContent = "\u00d7";
      del.setAttribute("aria-label", "Delete preset " + preset.name);
      del.addEventListener("click", function () {
        state.presets = removePreset(state.presets, preset.name);
        save();
        renderPresets();
        presetNote("Removed \u201c" + preset.name + "\u201d.");
      });

      chip.appendChild(apply);
      chip.appendChild(del);
      wrap.appendChild(chip);
    });
  }

  function presetNote(message) { setText("preset-note", message); }

  function updateStats() {
    setText("spin-count", state.spins);
    setText("option-count", state.options.length);
    var btn = document.getElementById("spin-button");
    if (btn) btn.disabled = spinning || state.options.length < 2;
  }

  function setResult(text) {
    setText("result-text", text || "\u2014");
  }

  /* ---------------- actions ---------------- */

  function afterOptionsChange() {
    save();
    renderOptions();
    drawWheel(state.rotation);
  }

  function applyPreset(preset) {
    state.options = sanitizeOptions(preset.options);
    state.rotation = 0;
    afterOptionsChange();
    setResult("\u2014");
    note("Loaded \u201c" + preset.name + "\u201d \u2014 spin when ready \u2665");
  }

  function spin() {
    if (spinning) return;
    var n = state.options.length;
    if (n < 2) { note("Add at least two options first \u2665"); return; }

    var target = pickIndex(Math.random(), n);
    var from = state.rotation;
    var to = targetRotation(from, target, n, 4 + Math.floor(Math.random() * 3));

    var reduce = false;
    if (typeof window !== "undefined" && window.matchMedia) {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    setResult("\u2014");
    note("Spinning\u2026");

    function finish() {
      state.rotation = to;
      state.spins += 1;
      state.lastResult = state.options[target];
      state.history = pushResult(state.history, state.lastResult, MAX_HISTORY);
      spinning = false;
      save();
      updateStats();
      drawWheel(state.rotation);
      setResult(state.lastResult);
      renderHistory();
      note("The wheel has spoken \u2665");
      if (typeof window.heartBurst === "function") {
        window.heartBurst(window.innerWidth / 2, window.innerHeight / 3, 16);
      }
    }

    if (reduce || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
      finish();
      return;
    }

    spinning = true;
    updateStats();
    var started = Date.now();
    var duration = 3800;

    function frame() {
      var elapsed = Date.now() - started;
      var t = Math.min(1, elapsed / duration);
      state.rotation = from + (to - from) * easeOutCubic(t);
      drawWheel(state.rotation);
      if (t < 1) {
        window.requestAnimationFrame(frame);
      } else {
        finish();
      }
    }
    window.requestAnimationFrame(frame);
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    var form = document.getElementById("option-form");
    var input = document.getElementById("option-input");
    if (form && input) {
      form.addEventListener("submit", function (event) {
        if (event.preventDefault) event.preventDefault();
        var next = addOption(state.options, input.value);
        if (next.length === state.options.length) {
          note(state.options.length >= MAX_OPTIONS ? "That's the full wheel (24 options)." : "Type something first \u2665");
        } else {
          state.options = next;
          input.value = "";
          afterOptionsChange();
        }
      });
    }

    var clear = document.getElementById("clear-options");
    if (clear) clear.addEventListener("click", function () {
      state.options = [];
      state.rotation = 0;
      afterOptionsChange();
      setResult("\u2014");
      note("Cleared the wheel.");
    });

    var shuffle = document.getElementById("shuffle-options");
    if (shuffle) shuffle.addEventListener("click", function () {
      state.options = shuffleOptions(state.options);
      state.rotation = 0;
      afterOptionsChange();
      note("Shuffled the order.");
    });

    var spinBtn = document.getElementById("spin-button");
    if (spinBtn) spinBtn.addEventListener("click", spin);

    var presetForm = document.getElementById("preset-form");
    var presetInput = document.getElementById("preset-input");
    if (presetForm && presetInput) {
      presetForm.addEventListener("submit", function (event) {
        if (event.preventDefault) event.preventDefault();
        if (state.options.length < 2) { presetNote("Add at least two options first."); return; }
        var name = presetInput.value || ("Set " + (state.presets.length + 1));
        state.presets = upsertPreset(state.presets, name, state.options);
        presetInput.value = "";
        save();
        renderPresets();
        presetNote("Saved \u201c" + cleanText(name).slice(0, 30) + "\u201d \u2665");
      });
    }

    var share = document.getElementById("share-button");
    if (share) share.addEventListener("click", function () {
      var url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: url }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { presetNote("Link copied \u2665"); })
          .catch(function () { presetNote(url); });
        return;
      }
      presetNote(url);
    });

    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", fitCanvas);
    }

    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("keydown", function (event) {
        var target = event.target || {};
        var tag = target.tagName ? String(target.tagName).toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (event.key === " " || event.key === "s" || event.key === "S") {
          if (event.preventDefault) event.preventDefault();
          spin();
        }
      });
    }
  }

  function boot() {
    canvas = document.getElementById("wheel-canvas");
    if (canvas && canvas.getContext) ctx = canvas.getContext("2d");
    load();
    renderOptions();
    renderPresets();
    renderHistory();
    setResult(state.lastResult);
    drawWheel(state.rotation);
    fitCanvas();
    wire();
    updateStats();
  }

  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", boot);
  }

  var NS = {
    STORE: STORE,
    COLORS: COLORS,
    MAX_OPTIONS: MAX_OPTIONS,
    norm: norm,
    pickIndex: pickIndex,
    wheelSegment: wheelSegment,
    indexAtPointer: indexAtPointer,
    targetRotation: targetRotation,
    easeOutCubic: easeOutCubic,
    cleanText: cleanText,
    sanitizeOptions: sanitizeOptions,
    addOption: addOption,
    removeOption: removeOption,
    shuffleOptions: shuffleOptions,
    sanitizePresets: sanitizePresets,
    upsertPreset: upsertPreset,
    removePreset: removePreset,
    sanitizeHistory: sanitizeHistory,
    pushResult: pushResult,
    defaultPresets: defaultPresets,
    load: load,
    save: save,
    getState: function () { return state; },
    spin: spin
  };

  if (typeof window !== "undefined") window.MenaSpinner = NS;
  else if (typeof globalThis !== "undefined") globalThis.MenaSpinner = NS;
})();
