/* ============================================================================
 * _audio.js — Pensieve AUDIO engine (vanilla, zero deps).
 * ----------------------------------------------------------------------------
 * The shared behaviour every audio prototype reuses, so every demo plays,
 * scrubs, syncs and themes IDENTICALLY. The per-surface agents call this API;
 * they do NOT re-implement playback, waveform drawing, or transcript sync.
 *
 * ──────────────────────────── PUBLIC API ──────────────────────────────────
 *
 * Pensieve.Audio.loadAssets() -> Promise<{peaks, transcript}>
 *     Loads assets/peaks.json + assets/transcript.json. Tries fetch() first
 *     (works under a localhost server); on failure (file:// double-click, where
 *     fetch of local JSON is blocked) falls back to window.__PEAKS__ /
 *     window.__TRANSCRIPT__ injected by assets/peaks.js + assets/transcript.js.
 *     => include those two <script> tags for zero-setup file:// support.
 *
 * Pensieve.Audio.fmt(seconds) -> "m:ss" | "h:mm:ss"   (mono time formatter)
 *
 * Pensieve.Audio.controller(src) -> AudioController   (one shared <audio>)
 *     .play() .pause() .toggle() .seek(sec) .seekFrac(0..1)
 *     .time()      -> currentTime (sec)
 *     .duration()  -> duration (sec, falls back to peaks/transcript meta)
 *     .playing()   -> bool
 *     .on(evt, cb) -> unsubscribe fn;  evts: "play" "pause" "time" "seek" "end" "ready"
 *   ENFORCES one-plays-at-a-time across EVERY bar on the page: starting one
 *   pauses any other. A single <audio> element is shared, re-pointed on play.
 *
 * Pensieve.Audio.Waveform(canvas, peaks, opts) -> wave
 *     Draws the baked waveform on a canvas (HiDPI-aware). opts: {barW,gap,min}.
 *     .render(progress0to1)   redraw with a played/unplayed split
 *     .resize()               re-read CSS box + redraw (call on container resize)
 *     .fracFromClientX(x)     map a pointer x to a 0..1 position (for scrub)
 *
 * Pensieve.Audio.bindScrub(waveEl, wave, { onSeek, onPreview }) -> cleanup
 *     Wires click + drag scrubbing and the hover scrubline/time bubble on a
 *     `.audio-wave` element. onSeek(frac) commits; onPreview(frac|null) hovers.
 *
 * Pensieve.Audio.sync(transcript) -> TranscriptSync
 *     .at(timeSec) -> { segIndex, wordIndex, seg, word }  active position
 *     .wordTime(segIndex, wordIndex) -> start seconds (for click-to-seek)
 *     .segments    the raw segments
 *     .flatWords   [{segIndex, wordIndex, w, s, e}] convenience index
 *
 * Pensieve.Audio.theme.init()   wire the .theme-toggle button + restore choice
 * Pensieve.Audio.theme.set("light"|"dark")
 *
 * Pensieve.Audio.icon(name)     -> SVG string for shared glyphs:
 *     play pause spinner more download transcript waveform locate sun moon
 * ========================================================================= */
(function (global) {
  "use strict";

  const BASE = "assets/";

  /* ── asset loading with the file:// global fallback ───────────────────── */
  async function loadJSON(file, globalKey) {
    try {
      const res = await fetch(BASE + file, { cache: "no-store" });
      if (res.ok) return await res.json();
      throw new Error("bad status " + res.status);
    } catch (_e) {
      if (global[globalKey]) return global[globalKey];
      throw new Error(
        "Could not load " + file + ". Under file:// include " +
        "<script src=\"assets/" + file.replace(".json", ".js") + "\"></script> " +
        "(it sets window." + globalKey + "), or serve over localhost."
      );
    }
  }
  async function loadAssets() {
    const [peaks, transcript] = await Promise.all([
      loadJSON("peaks.json", "__PEAKS__"),
      loadJSON("transcript.json", "__TRANSCRIPT__"),
    ]);
    return { peaks, transcript };
  }

  /* ── time formatter (mono, stable width) ──────────────────────────────── */
  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const ss = String(s).padStart(2, "0");
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + ss;
    return m + ":" + ss;
  }

  /* ── global one-plays-at-a-time controller ────────────────────────────── */
  const _registry = new Set();           // every live controller on the page
  function _pauseOthers(except) {
    _registry.forEach((c) => { if (c !== except) c.pause(); });
  }

  function controller(src) {
    const audio = new Audio();
    audio.preload = "metadata";
    if (src) audio.src = src;
    const listeners = {};               // evt -> Set<cb>
    let fallbackDur = 0;                // from meta if the element has none yet

    function emit(evt, payload) {
      (listeners[evt] || []).forEach((cb) => cb(payload));
    }
    function on(evt, cb) {
      (listeners[evt] || (listeners[evt] = new Set())).add(cb);
      return () => listeners[evt] && listeners[evt].delete(cb);
    }

    audio.addEventListener("timeupdate", () => emit("time", audio.currentTime));
    audio.addEventListener("play", () => { _pauseOthers(api); emit("play"); });
    audio.addEventListener("pause", () => emit("pause"));
    audio.addEventListener("ended", () => emit("end"));
    audio.addEventListener("loadedmetadata", () => emit("ready", audio.duration));
    audio.addEventListener("seeked", () => emit("seek", audio.currentTime));

    const api = {
      el: audio,
      play() { const p = audio.play(); if (p && p.catch) p.catch(() => {}); },
      pause() { if (!audio.paused) audio.pause(); },
      toggle() { audio.paused ? api.play() : api.pause(); },
      seek(sec) {
        const d = api.duration();
        audio.currentTime = Math.max(0, Math.min(d || sec, sec));
        emit("time", audio.currentTime);
      },
      seekFrac(f) { api.seek((api.duration() || 0) * Math.max(0, Math.min(1, f))); },
      time() { return audio.currentTime || 0; },
      duration() { return (audio.duration && isFinite(audio.duration)) ? audio.duration : fallbackDur; },
      playing() { return !audio.paused && !audio.ended; },
      setFallbackDuration(d) { fallbackDur = d || 0; },
      on,
      destroy() { api.pause(); _registry.delete(api); },
    };
    _registry.add(api);
    return api;
  }

  /* ── canvas waveform renderer ─────────────────────────────────────────── */
  function cssVar(name, el) {
    return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  }
  function Waveform(canvas, peaksObj, opts) {
    opts = opts || {};
    const peaks = (peaksObj && peaksObj.peaks) || peaksObj || [];
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, lastProgress = 0;

    const read = () => ({
      barW: opts.barW || parseFloat(cssVar("--wave-bar-w")) || 2,
      gap: opts.gap != null ? opts.gap : (parseFloat(cssVar("--wave-bar-gap")) || 1),
      min: opts.min != null ? opts.min : (parseFloat(cssVar("--wave-min")) || 0.12),
      played: "hsl(" + cssVar("--accent") + ")",
      unplayed: "hsl(" + cssVar("--text-muted") + " / 0.35)",
      head: "hsl(" + cssVar("--accent-glow") + ")",
    });

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.max(1, global.devicePixelRatio || 1);
      W = Math.max(1, Math.floor(rect.width));
      H = Math.max(1, Math.floor(rect.height));
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(lastProgress);
    }

    function render(progress) {
      lastProgress = progress = Math.max(0, Math.min(1, progress || 0));
      const s = read();
      const pitch = s.barW + s.gap;
      const n = Math.max(1, Math.floor((W + s.gap) / pitch));
      ctx.clearRect(0, 0, W, H);
      const mid = H / 2;
      const r = Math.min(s.barW / 2, 1.5);
      const headBar = Math.floor(progress * n);
      for (let i = 0; i < n; i++) {
        // sample the baked peaks (resampled to however many bars fit the box)
        const srcIdx = Math.floor((i / n) * peaks.length);
        let amp = peaks[srcIdx] != null ? peaks[srcIdx] : 0;
        amp = s.min + (1 - s.min) * amp;
        const h = Math.max(1, amp * (H - 2));
        const x = i * pitch;
        const y = mid - h / 2;
        ctx.fillStyle = i < headBar ? s.played : (i === headBar ? s.head : s.unplayed);
        roundRect(ctx, x, y, s.barW, h, r);
        ctx.fill();
      }
    }
    function roundRect(c, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
    function fracFromClientX(clientX) {
      const rect = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
    }

    // auto-resize with the element
    if (global.ResizeObserver) {
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
    } else {
      global.addEventListener("resize", resize);
    }
    requestAnimationFrame(resize);
    return { render, resize, fracFromClientX, canvas };
  }

  /* ── scrub binding (click + drag + hover affordance) ──────────────────── */
  function bindScrub(waveEl, wave, handlers) {
    handlers = handlers || {};
    const line = waveEl.querySelector(".audio-scrubline");
    const bubble = waveEl.querySelector(".audio-scrubtime");
    let dragging = false;

    function place(clientX) {
      const rect = waveEl.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width || 1)));
      const px = f * rect.width;
      if (line) line.style.left = px + "px";
      if (bubble) { bubble.style.left = px + "px"; if (handlers.previewTime) bubble.textContent = handlers.previewTime(f); }
      return f;
    }
    function onMove(e) {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const f = place(x);
      if (dragging && handlers.onSeek) handlers.onSeek(f);
      else if (handlers.onPreview) handlers.onPreview(f);
    }
    function onDown(e) {
      dragging = true;
      waveEl.classList.add("is-scrubbing");
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const f = place(x);
      if (handlers.onSeek) handlers.onSeek(f);
      global.addEventListener("mousemove", onMove);
      global.addEventListener("touchmove", onMove, { passive: true });
      global.addEventListener("mouseup", onUp);
      global.addEventListener("touchend", onUp);
      e.preventDefault();
    }
    function onUp() {
      dragging = false;
      waveEl.classList.remove("is-scrubbing");
      global.removeEventListener("mousemove", onMove);
      global.removeEventListener("touchmove", onMove);
      global.removeEventListener("mouseup", onUp);
      global.removeEventListener("touchend", onUp);
    }
    waveEl.addEventListener("mousemove", (e) => { if (!dragging) onMove(e); });
    waveEl.addEventListener("mouseleave", () => { if (!dragging && handlers.onPreview) handlers.onPreview(null); });
    waveEl.addEventListener("mousedown", onDown);
    waveEl.addEventListener("touchstart", onDown, { passive: false });
    return function cleanup() { onUp(); };
  }

  /* ── transcript sync ──────────────────────────────────────────────────── */
  function sync(transcript) {
    const segments = (transcript && transcript.segments) || [];
    const flatWords = [];
    segments.forEach((seg, si) => {
      (seg.words || []).forEach((w, wi) => {
        flatWords.push({ segIndex: si, wordIndex: wi, w: w.w, s: w.s, e: w.e });
      });
    });

    function at(t) {
      // active segment: last seg whose start <= t (binary search)
      let lo = 0, hi = segments.length - 1, segIndex = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (segments[mid].start <= t) { segIndex = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      if (segIndex < 0) return { segIndex: -1, wordIndex: -1, seg: null, word: null };
      const seg = segments[segIndex];
      let wordIndex = -1, word = null;
      const words = seg.words || [];
      for (let i = 0; i < words.length; i++) {
        if (t >= words[i].s && t < words[i].e) { wordIndex = i; word = words[i]; break; }
        if (words[i].s <= t) { wordIndex = i; word = words[i]; }  // past this word → keep as last-read
      }
      return { segIndex, wordIndex, seg, word };
    }
    function wordTime(si, wi) {
      const seg = segments[si];
      if (!seg || !seg.words || !seg.words[wi]) return seg ? seg.start : 0;
      return seg.words[wi].s;
    }
    return { at, wordTime, segments, flatWords, meta: transcript && transcript.meta };
  }

  /* ── theme toggle ─────────────────────────────────────────────────────── */
  const theme = {
    set(mode) {
      document.documentElement.setAttribute("data-theme", mode);
      try { localStorage.setItem("pensieve-theme", mode); } catch (_e) {}
      const btn = document.querySelector(".theme-toggle");
      if (btn) btn.innerHTML = mode === "dark" ? icon("sun") : icon("moon");
    },
    current() { return document.documentElement.getAttribute("data-theme") || "light"; },
    init() {
      let saved = "light";
      try { saved = localStorage.getItem("pensieve-theme") || (global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch (_e) {}
      theme.set(saved);
      const btn = document.querySelector(".theme-toggle");
      if (btn) btn.addEventListener("click", () => theme.set(theme.current() === "dark" ? "light" : "dark"));
    },
  };

  /* ── shared SVG glyphs (stroke, currentColor — matches the app icon set) ─ */
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a.75.75 0 0 0 1.14.64l10.5-6.5a.75.75 0 0 0 0-1.28L9.14 4.86A.75.75 0 0 0 8 5.5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/></svg>',
    transcript: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 6h14"/><path d="M5 10h10"/><path d="M5 14h14"/><path d="M5 18h8"/></svg>',
    waveform: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 8v8"/><path d="M20 10v4"/></svg>',
    locate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"/></svg>',
  };
  function icon(name) { return ICONS[name] || ""; }

  global.Pensieve = global.Pensieve || {};
  global.Pensieve.Audio = {
    loadAssets, fmt, controller, Waveform, bindScrub, sync, theme, icon, ICONS,
  };
})(window);
