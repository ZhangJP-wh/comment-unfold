(function () {
  const CU = globalThis.CU;

  const HINT_IDLE = "点击此区域后，可用左右方向键翻页";

  const pager = {
    regions: [],
    active: null,
    activated: false,
    hovering: false,
    point: null,
    hint: null,
    lastKeyAt: 0,
    bound: false,
  };

  function hintEl() {
    return document.getElementById("cu-host")?.shadowRoot?.querySelector(".cu-hint") || null;
  }

  const HINT_GAP_X = 12;
  const HINT_MARGIN = 8;

  function placeHint(point) {
    const hint = hintEl();
    if (!hint || !point) return;
    const width = hint.offsetWidth;
    const height = hint.offsetHeight;
    let left = point.x + HINT_GAP_X;
    let top = point.y - height / 2;
    const maxLeft = window.innerWidth - HINT_MARGIN - width;
    const maxTop = window.innerHeight - HINT_MARGIN - height;
    if (left > maxLeft) left = maxLeft;
    if (left < HINT_MARGIN) left = HINT_MARGIN;
    if (top > maxTop) top = maxTop;
    if (top < HINT_MARGIN) top = HINT_MARGIN;
    hint.style.left = `${Math.round(left)}px`;
    hint.style.top = `${Math.round(top)}px`;
  }

  function showHint(text, point) {
    const hint = hintEl();
    if (!hint) return;
    hint.textContent = text;
    hint.dataset.show = "1";
    placeHint(point);
  }

  function hideHint() {
    const hint = hintEl();
    if (!hint) return;
    hint.dataset.show = "0";
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

  function onMove(event) {
    if (!pager.regions.length || isOurUi(event)) return;
    const region = pickRegion(event);
    if (!region) {
      pager.hovering = false;
      hideHint();
      return;
    }
    pager.point = { x: event.clientX, y: event.clientY };
    pager.hovering = true;
    if (pager.activated) {
      hideHint();
      return;
    }
    showHint(HINT_IDLE, pager.point);
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
    pager.point = { x: event.clientX, y: event.clientY };
    hideHint();
  }

  function onKey(event) {
    if (!pager.activated || !pager.active?.root?.isConnected) return;
    if (event.key === "Escape") {
      pager.activated = false;
      pager.active = null;
      if (pager.hovering && pager.point) showHint(HINT_IDLE, pager.point);
      else hideHint();
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
