(function () {
  const CU = globalThis.CU;

  const HINT_IDLE = "点击此区域后，可用左右方向键翻页";
  const HINT_ON = "已激活，用 ← 和 → 翻页";
  const HINT_QUIET = "← 上一页 · → 下一页";

  const pager = {
    regions: [],
    active: null,
    activated: false,
    hovering: false,
    hint: null,
    fadeTimer: 0,
    lastKeyAt: 0,
    bound: false,
  };

  function hintEl() {
    return document.getElementById("cu-host")?.shadowRoot?.querySelector(".cu-hint") || null;
  }

  function placeHint(root) {
    const hint = hintEl();
    if (!hint || !root?.getBoundingClientRect) return;
    const rect = root.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 24));
    const right = Math.max(left + 24, Math.min(rect.right, window.innerWidth - 12));
    const top = Math.max(12, Math.min(rect.top + 10, window.innerHeight - 56));
    hint.style.top = `${top}px`;
    hint.style.left = `${(left + right) / 2}px`;
  }

  function showHint(text, root) {
    const hint = hintEl();
    if (!hint) return;
    hint.textContent = text;
    hint.dataset.show = "1";
    hint.dataset.fade = "0";
    placeHint(root);
  }

  function hideHint() {
    const hint = hintEl();
    if (!hint) return;
    hint.dataset.show = "0";
    hint.dataset.fade = "0";
  }

  function isOurUi(event) {
    return event.composedPath().some((node) => node?.id === "cu-host" || node?.id === "cu-btn");
  }

  function pickRegion(event) {
    const path = event.composedPath();
    let best = null;
    let bestIndex = Infinity;
    for (const region of pager.regions) {
      if (!region.root?.isConnected) continue;
      const index = path.indexOf(region.root);
      if (index >= 0 && index < bestIndex) {
        best = region;
        bestIndex = index;
      }
    }
    return best;
  }

  function fadeHint(delay) {
    window.clearTimeout(pager.fadeTimer);
    pager.fadeTimer = window.setTimeout(() => {
      const hint = hintEl();
      if (hint && pager.activated) hint.dataset.fade = "1";
    }, delay);
  }

  function onMove(event) {
    if (!pager.regions.length || isOurUi(event)) return;
    const region = pickRegion(event);
    if (!region) {
      pager.hovering = false;
      hideHint();
      return;
    }
    if (!pager.activated) {
      showHint(HINT_IDLE, region.root);
      return;
    }
    if (!pager.hovering) {
      pager.hovering = true;
      showHint(HINT_QUIET, region.root);
      fadeHint(900);
    }
  }

  function onClick(event) {
    if (!event.isTrusted || isOurUi(event)) return;
    const region = pickRegion(event);
    if (!region) {
      pager.activated = false;
      pager.active = null;
      pager.hovering = false;
      hideHint();
      return;
    }
    pager.activated = true;
    pager.hovering = true;
    pager.active = region;
    showHint(HINT_ON, region.root);
    fadeHint(1600);
  }

  function onKey(event) {
    if (!pager.activated || !pager.active?.root?.isConnected) return;
    if (event.key === "Escape") {
      pager.activated = false;
      pager.active = null;
      pager.hovering = false;
      hideHint();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (CU.isTypingTarget(event.target) || CU.isTypingTarget(document.activeElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - pager.lastKeyAt < 450) return;
    pager.lastKeyAt = now;
    if (event.key === "ArrowLeft") pager.active.prev();
    else pager.active.next();
  }

  function bindOnce() {
    if (pager.bound) return;
    pager.bound = true;
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  CU.pager = {
    sync(regions) {
      bindOnce();
      const connected = (regions || []).filter((region) => region?.root?.isConnected && region.next && region.prev);
      const same =
        connected.length === pager.regions.length &&
        connected.every((region, index) => region.root === pager.regions[index]?.root);
      pager.regions = connected;
      if (!connected.length) {
        pager.activated = false;
        pager.active = null;
        pager.hovering = false;
        hideHint();
        return;
      }
      if (!same) {
        pager.activated = false;
        pager.active = null;
        pager.hovering = false;
        hideHint();
      }
    },
    clear() {
      pager.regions = [];
      pager.activated = false;
      pager.active = null;
      pager.hovering = false;
      hideHint();
    },
    hasRegions() {
      return pager.regions.length > 0;
    },
  };
})();
