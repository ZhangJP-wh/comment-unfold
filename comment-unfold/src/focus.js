(function () {
  const CU = globalThis.CU;

  const MAX_HOLES = 240;
  const MAX_SHADOWS = 200;
  const PAD = 3;

  const state = {
    on: false,
    region: null,
    shade: null,
    resize: null,
    watched: new Set(),
    shadows: new Map(),
    regionObserver: null,
    scrollBound: false,
    frame: 0,
    dirtyShadows: false,
  };

  function offButton() {
    return document.getElementById("cu-host")?.shadowRoot?.querySelector("#cu-focus-off") || null;
  }

  function paintControls() {
    const button = offButton();
    if (!button) return;
    button.hidden = !state.on;
  }

  function ensureShade() {
    if (state.shade?.isConnected) return state.shade;
    const shade = document.createElement("div");
    shade.id = "cu-focus-shade";
    shade.setAttribute("aria-hidden", "true");
    shade.style.cssText = [
      "position:fixed",
      "z-index:2147483644",
      "pointer-events:none",
      "background:rgba(72,74,78,0.5)",
      "border-radius:0",
      "margin:0",
      "padding:0",
      "display:block",
    ].join(";");
    document.documentElement.appendChild(shade);
    state.shade = shade;
    return shade;
  }

  function removeShade() {
    state.shade?.remove();
    state.shade = null;
  }

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function clipPath(width, height, holes) {
    let d = `M0 0 H${round(width)} V${round(height)} H0 Z`;
    for (const hole of holes) {
      const x = round(hole.x);
      const y = round(hole.y);
      const w = round(hole.w);
      const h = round(hole.h);
      if (w < 1 || h < 1) continue;
      d += ` M${x} ${y} H${x + w} V${y + h} H${x} Z`;
    }
    return `path(evenodd, "${d}")`;
  }

  function bodyElements(adapter, region) {
    if (!adapter?.bodyNodes || !region) return [];
    try {
      return (adapter.bodyNodes(region) || []).filter((el) => el?.isConnected && !el.closest?.("#cu-host, #cu-focus-shade"));
    } catch {
      return [];
    }
  }

  function textBox(el) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      if (rect.width >= 2 && rect.height >= 2) return rect;
    } catch {
      /* 节点还不能做选区时退回元素盒子。 */
    }
    return el.getBoundingClientRect();
  }

  function holesFor(bodies, box) {
    const holes = [];
    for (const el of bodies) {
      if (holes.length >= MAX_HOLES) break;
      const rect = textBox(el);
      if (rect.width < 2 || rect.height < 2) continue;
      const left = Math.max(box.left, rect.left - PAD);
      const top = Math.max(box.top, rect.top - PAD);
      const right = Math.min(box.right, rect.right + PAD);
      const bottom = Math.min(box.bottom, rect.bottom + PAD);
      const w = right - left;
      const h = bottom - top;
      if (w < 2 || h < 2) continue;
      holes.push({ x: left - box.left, y: top - box.top, w, h });
    }
    return holes;
  }

  function collectShadowRoots(region) {
    const roots = [];
    const stack = [];
    const seen = new Set();
    if (region.shadowRoot) stack.push(region.shadowRoot);
    while (stack.length && roots.length < MAX_SHADOWS) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      roots.push(node);
      const list = node.querySelectorAll ? node.querySelectorAll("*") : [];
      for (const el of list) {
        if (!el.shadowRoot || seen.has(el.shadowRoot)) continue;
        stack.push(el.shadowRoot);
        if (roots.length + stack.length >= MAX_SHADOWS) break;
      }
    }
    return roots;
  }

  function disconnectObservers() {
    state.regionObserver?.disconnect();
    state.regionObserver = null;
    for (const observer of state.shadows.values()) observer.disconnect();
    state.shadows.clear();
    if (state.resize) {
      for (const el of state.watched) state.resize.unobserve(el);
    }
    state.watched = new Set();
    state.region = null;
  }

  function watchBodies(bodies, region) {
    if (!state.resize) return;
    const next = new Set();
    if (region) next.add(region);
    for (const el of bodies) {
      if (next.size >= MAX_HOLES) break;
      next.add(el);
    }
    for (const el of state.watched) {
      if (!next.has(el)) state.resize.unobserve(el);
    }
    for (const el of next) {
      if (!state.watched.has(el)) state.resize.observe(el);
    }
    state.watched = next;
  }

  function bindRegion(region) {
    if (state.region === region && !state.dirtyShadows) {
      return;
    }
    if (state.region !== region) {
      disconnectObservers();
      state.region = region;
      state.regionObserver = new MutationObserver(() => {
        state.dirtyShadows = true;
        schedule();
      });
      state.regionObserver.observe(region, { childList: true, subtree: true });
      if (state.resize) state.resize.observe(region);
      state.watched.add(region);
    }
    if (!state.dirtyShadows && state.shadows.size) return;
    state.dirtyShadows = false;
    const roots = collectShadowRoots(region);
    const live = new Set(roots);
    for (const [root, observer] of state.shadows) {
      if (!live.has(root)) {
        observer.disconnect();
        state.shadows.delete(root);
      }
    }
    for (const root of roots) {
      if (state.shadows.has(root)) continue;
      const observer = new MutationObserver(() => {
        state.dirtyShadows = true;
        schedule();
      });
      observer.observe(root, { childList: true, subtree: true });
      state.shadows.set(root, observer);
    }
  }

  function render() {
    state.frame = 0;
    if (!state.on) return;
    const adapter = CU.currentAdapter?.();
    const region = adapter?.getRegion?.({ deep: true });
    if (!region?.isConnected) {
      removeShade();
      return;
    }
    bindRegion(region);
    const rect = region.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(window.innerWidth, rect.right);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    if (width < 8 || height < 8) {
      removeShade();
      return;
    }
    const bodies = bodyElements(adapter, region);
    watchBodies(bodies, region);
    const shade = ensureShade();
    shade.style.left = `${left}px`;
    shade.style.top = `${top}px`;
    shade.style.width = `${width}px`;
    shade.style.height = `${height}px`;
    shade.style.clipPath = clipPath(width, height, holesFor(bodies, { left, top, right, bottom }));
  }

  function schedule() {
    if (!state.on || state.frame) return;
    state.frame = window.requestAnimationFrame(render);
  }

  function onViewport() {
    schedule();
  }

  function bindViewport() {
    if (state.scrollBound) return;
    state.scrollBound = true;
    window.addEventListener("scroll", onViewport, true);
    window.addEventListener("resize", onViewport);
    state.resize = new ResizeObserver(() => schedule());
  }

  function unbindViewport() {
    if (!state.scrollBound) return;
    state.scrollBound = false;
    window.removeEventListener("scroll", onViewport, true);
    window.removeEventListener("resize", onViewport);
    state.resize?.disconnect();
    state.resize = null;
    if (state.frame) window.cancelAnimationFrame(state.frame);
    state.frame = 0;
  }

  CU.focus = {
    enable() {
      state.on = true;
      bindViewport();
      paintControls();
      state.dirtyShadows = true;
      render();
    },
    disable() {
      state.on = false;
      unbindViewport();
      disconnectObservers();
      removeShade();
      paintControls();
    },
    sync() {
      if (!state.on) return;
      state.dirtyShadows = true;
      schedule();
    },
    isOn() {
      return state.on;
    },
    paintControls,
  };
})();
