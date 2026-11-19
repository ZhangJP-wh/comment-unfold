(function () {
  const CU = globalThis.CU;

  const UI_CSS = `
    :host { all: initial; }
    .cu-btn, .cu-hint, .cu-off {
      font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    }
    .cu-btn {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483646;
      max-width: min(280px, calc(100vw - 32px));
      border: 0;
      border-radius: 999px;
      padding: 10px 16px;
      background: #1f6f5b;
      color: #fff;
      font-size: 14px;
      line-height: 1.35;
      text-align: center;
      white-space: normal;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
    }
    .cu-btn:hover { background: #18594a; }
    .cu-btn[data-state="running"] { background: #8a5a12; }
    .cu-btn[data-state="missing"],
    .cu-btn[data-state="stopped"] { background: #5c6562; }
    .cu-off {
      position: fixed;
      right: 20px;
      bottom: 76px;
      z-index: 2147483646;
      border: 0;
      border-radius: 999px;
      padding: 8px 14px;
      background: #3d4348;
      color: #fff;
      font-size: 13px;
      line-height: 1.35;
      cursor: pointer;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22);
    }
    .cu-off:hover { background: #2c3135; }
    .cu-off[hidden] { display: none; }
    .cu-hint {
      position: fixed;
      z-index: 2147483645;
      max-width: min(420px, calc(100vw - 24px));
      box-sizing: border-box;
      padding: 8px 12px;
      border-radius: 10px;
      background: rgba(20, 24, 28, 0.55);
      color: #fff;
      font-size: 13px;
      line-height: 1.45;
      text-align: center;
      pointer-events: none;
      opacity: 0;
      border: 1px solid rgba(255, 255, 255, 0.28);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }
    .cu-hint[data-show="1"] { opacity: 1; }
    @media (max-width: 640px) {
      .cu-btn { right: 12px; bottom: 12px; font-size: 13px; padding: 8px 12px; }
      .cu-off { right: 12px; bottom: 64px; }
    }
  `;

  const BADGE = {
    running: "…",
    done: "完",
    capped: "限",
    missing: "无",
    stopped: "停",
    plain: "开",
    idle: "",
  };

  const THREAD_SELECTOR = [
    "ytd-comment-thread-renderer",
    "ytd-comment-view-model",
    "ytd-comment-renderer",
    "ytd-expander",
    "bili-comment-thread-renderer",
    "bili-comment-reply-renderer",
    ".reply-item",
    ".sub-reply-item",
    ".parent-comment",
    ".comment-item",
    ".comment-item-sub",
  ].join(", ");

  const ui = {
    host: null,
    button: null,
    runId: 0,
    restoreId: 0,
    phase: "off",
    managedFocus: false,
    restoring: false,
    snapshotted: false,
    preexpanded: new Set(),
    opened: new Set(),
    attempts: new WeakMap(),
  };

  function sendBadge(state) {
    try {
      chrome.runtime.sendMessage({ type: "cu-badge", text: BADGE[state] || "" });
    } catch {
      /* 夹具页面或未连接扩展时没有 runtime。 */
    }
  }

  function setState(state, message) {
    if (!ui.host || !ui.button) return;
    ui.host.dataset.state = state;
    ui.host.dataset.message = message || "";
    ui.button.dataset.state = state;
    ui.button.textContent = message || "展开评论";
    ui.button.title = message || "展开当前页评论";
    sendBadge(state);
    paintCycle();
  }

  function ensureUi() {
    if (ui.host?.isConnected) return;
    const host = document.createElement("div");
    host.id = "cu-host";
    host.style.cssText = "position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0;overflow:visible;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = UI_CSS;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cu-btn";
    button.id = "cu-btn";
    button.textContent = "展开评论";
    button.title = "展开当前页评论";
    button.dataset.state = "idle";
    const off = document.createElement("button");
    off.type = "button";
    off.className = "cu-off";
    off.id = "cu-cycle";
    off.textContent = "关闭高亮";
    off.title = "只去掉评论区变暗，已展开的回复保留";
    off.hidden = true;
    const hint = document.createElement("div");
    hint.className = "cu-hint";
    hint.dataset.show = "0";
    hint.setAttribute("aria-hidden", "true");
    shadow.append(style, off, button, hint);
    (document.documentElement || document.body).appendChild(host);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (ui.phase === "off") {
        CU.cycle();
        return;
      }
      if (ui.host.dataset.state === "running" || ui.restoring) return;
      CU.expandCurrent();
    });
    off.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (ui.phase === "off") return;
      CU.cycle();
    });
    ui.host = host;
    ui.button = button;
    CU.focus?.paintControls();
  }

  function removeUi() {
    ui.host?.remove();
    ui.host = null;
    ui.button = null;
  }

  function paintCycle() {
    if (ui.host) ui.host.dataset.phase = ui.phase;
    const next = ui.host?.shadowRoot?.querySelector("#cu-cycle");
    if (!next) return;
    if (ui.phase === "focus") {
      next.hidden = false;
      next.textContent = "关闭高亮";
      next.title = "只去掉评论区变暗，已展开的回复保留";
    } else if (ui.phase === "plain") {
      next.hidden = false;
      next.textContent = "恢复收起";
      next.title = "收起这次展开的回复，并关掉翻页。打开扩展之前就已经展开的不会动";
      if (ui.host.dataset.state !== "running") sendBadge("plain");
    } else {
      next.hidden = true;
    }
  }

  function refreshChrome() {
    const adapter = CU.currentAdapter();
    const show = CU.shouldShowButton(adapter);
    if (!show) {
      if (ui.phase !== "off") shutdown({ restore: false });
      if (ui.host?.dataset.state !== "running") removeUi();
      CU.pager.clear();
      return;
    }
    ensureUi();
    paintCycle();
    if (ui.phase === "off") {
      if (!ui.restoring) {
        if (ui.managedFocus) {
          CU.focus?.disable();
          ui.managedFocus = false;
        }
        CU.pager.clear();
        if (ui.host.dataset.state !== "running") setState("idle", "展开评论");
      }
      return;
    }
    if (ui.phase === "focus") {
      ui.managedFocus = true;
      if (!CU.focus?.isOn()) CU.focus?.enable();
      else CU.focus.sync();
    }
    if (ui.host.dataset.state === "running" || ui.restoring) return;
    if (!ui.host.dataset.state || ui.host.dataset.state === "idle") setState("idle", "展开评论");
    const region = adapter.getRegion({ deep: true });
    const pagers = region ? adapter.pagers(region) : [];
    CU.pager.sync(pagers);
    if (ui.host?.dataset.state === "done" && pagers.length && !/翻页/.test(ui.host.dataset.message || "")) {
      setState("done", "当前页已展开。悬停评论区，点一下后用左右键翻页。");
    }
  }

  function isCollapseControl(el) {
    if (!el || CU.disabled(el) || CU.layoutHidden(el)) return false;
    if (el.tagName === "A") {
      const href = el.getAttribute("href") || "";
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) return false;
    }
    if (el.id === "less") return true;
    const text = CU.controlText(el);
    if (!text || text.length > 24) return false;
    return /^(收起|收起回复|收起评论|隐藏回复|隐藏更多|隐藏更多回复)$/.test(text) || /^(hide replies|hide reply|show less)$/i.test(text);
  }

  function owningThreads(el) {
    const found = [];
    let node = el;
    while (node && node !== document) {
      if (node.matches?.(THREAD_SELECTOR)) found.push(node);
      if (node.parentElement) {
        node = node.parentElement;
        continue;
      }
      const root = node.getRootNode?.();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return found;
  }

  function findCollapse(thread) {
    const nodes = CU.deepQueryAll(thread, "button, a, [role='button'], bili-text-button, #less, .show-less");
    for (const el of nodes) {
      if (!isCollapseControl(el)) continue;
      const owner = owningThreads(el)[0];
      if (owner && owner !== thread) continue;
      return el;
    }
    return null;
  }

  function snapshotPreexpanded(region) {
    const set = new Set();
    if (!region) return set;
    for (const thread of CU.deepQueryAll(region, THREAD_SELECTOR)) {
      if (findCollapse(thread)) set.add(thread);
    }
    for (const expander of CU.deepQueryAll(region, "ytd-expander")) {
      if (expander.hasAttribute("expanded") && !expander.hasAttribute("collapsed")) set.add(expander);
    }
    return set;
  }

  function ensureSnapshot(region) {
    if (ui.snapshotted || !region) return;
    ui.snapshotted = true;
    ui.preexpanded = snapshotPreexpanded(region);
  }

  function allowClick(el) {
    return !owningThreads(el).some((thread) => ui.preexpanded.has(thread));
  }

  function noteExpand(el) {
    const expander = CU.closestHost(el, "ytd-expander");
    const target = expander && (el.id === "more" || el.closest?.("#more")) ? expander : owningThreads(el)[0] || el;
    if (!target || ui.preexpanded.has(target)) return;
    ui.opened.add(target);
  }

  function depth(node) {
    let count = 0;
    let current = node;
    while (current && current !== document) {
      count += 1;
      current = current.parentElement || (current.getRootNode?.() instanceof ShadowRoot ? current.getRootNode().host : null);
    }
    return count;
  }

  async function restoreOpened(threads, token) {
    const ordered = [...threads].sort((a, b) => depth(b) - depth(a));
    let restored = 0;
    let missed = 0;
    for (const thread of ordered) {
      if (token !== ui.restoreId || ui.phase !== "off") return { aborted: true, restored, missed };
      if (!thread?.isConnected || ui.preexpanded.has(thread)) continue;
      const button = findCollapse(thread);
      if (!button) {
        missed += 1;
        continue;
      }
      try {
        CU.clickControl(button);
        restored += 1;
      } catch {
        missed += 1;
      }
      await CU.sleep(CU.LIMITS.clickGapMs);
      if (restored >= 40) break;
    }
    return { aborted: false, restored, missed };
  }

  function shutdown({ restore }) {
    const threads = [...ui.opened];
    ui.phase = "off";
    ui.runId += 1;
    ui.restoreId += 1;
    ui.opened = new Set();
    ui.snapshotted = false;
    ui.managedFocus = false;
    const token = ui.restoreId;
    CU.focus?.disable();
    CU.pager.clear();
    paintCycle();
    if (!restore || !threads.length) {
      ui.restoring = false;
      ui.preexpanded = new Set();
      setState("idle", "展开评论");
      return { phase: ui.phase };
    }
    ui.restoring = true;
    setState("idle", "正在收起…");
    restoreOpened(threads, token).then(() => {
      if (token !== ui.restoreId) return;
      ui.restoring = false;
      ui.preexpanded = new Set();
      if (ui.phase !== "off") return;
      setState("idle", "展开评论");
      paintCycle();
    });
    return { phase: ui.phase };
  }

  CU.cycle = function cycle() {
    if (ui.phase === "off") {
      ui.phase = "focus";
      ui.restoreId += 1;
      ui.restoring = false;
      ui.managedFocus = true;
      ui.sessionGuard = (ui.sessionGuard || 0) + 1;
      ui.snapshotted = false;
      ui.opened = new Set();
      ui.preexpanded = new Set();
      ensureUi();
      CU.focus?.enable();
      paintCycle();
      const guard = ui.sessionGuard;
      queueMicrotask(() => {
        if (guard !== ui.sessionGuard || ui.phase === "off") return;
        CU.expandCurrent();
      });
      return { phase: ui.phase };
    }
    if (ui.phase === "focus") {
      ui.phase = "plain";
      ui.managedFocus = false;
      CU.focus?.disable();
      ensureUi();
      paintCycle();
      return { phase: ui.phase };
    }
    ensureUi();
    return shutdown({ restore: true });
  };

  CU.phase = function phase() {
    return ui.phase;
  };

  async function nudge(adapter) {
    const region = adapter.getRegion({ deep: true });
    if (region) {
      region.scrollIntoView({ block: "center", inline: "nearest" });
      return region;
    }
    const anchor = document.querySelector("#comments, #comment, #commentapp, ytd-comments, bili-comments");
    if (anchor) anchor.scrollIntoView({ block: "center" });
    else window.scrollBy(0, Math.max(600, window.innerHeight * 0.7));
    await CU.sleep(500);
    return adapter.getRegion({ deep: true });
  }

  CU.expandCurrent = async function expandCurrent() {
    const adapter = CU.currentAdapter();
    ensureUi();
    if (ui.phase === "off") return { ok: false, reason: "off" };
    if (!adapter || !CU.shouldShowButton(adapter)) {
      setState("missing", "这个页面没有可展开的评论");
      return { ok: false, reason: "unsupported" };
    }

    const my = ++ui.runId;
    ui.attempts = new WeakMap();
    setState("running", "展开中…");
    if (ui.phase === "focus") CU.focus?.enable();

    let region = await nudge(adapter);
    const waitUntil = Date.now() + 8000;
    while ((!region || !region.isConnected) && Date.now() < waitUntil) {
      if (my !== ui.runId) return { ok: false, reason: "aborted" };
      await CU.sleep(400);
      region = adapter.getRegion({ deep: true });
    }
    if (!region) {
      if (my === ui.runId && ui.phase !== "off") setState("missing", "没有找到评论区。若页面要求登录或验证，请先完成后再试。");
      return { ok: false, reason: "missing" };
    }
    ensureSnapshot(region);
    if (ui.phase !== "off") CU.pager.sync(adapter.pagers(region));

    for (let i = 0; i < 8 && my === ui.runId && ui.phase !== "off" && region && adapter.count(region) === 0; i += 1) {
      try {
        await adapter.pump(region);
      } catch {
        /* 站点还没把评论节点挂上。 */
      }
      await CU.sleep(700);
      region = adapter.getRegion({ deep: true }) || region;
    }
    if (my !== ui.runId) return { ok: false, reason: "aborted" };

    const started = Date.now();
    let clicks = 0;
    let stale = 0;
    let grew = false;
    let round = 0;
    let natural = false;
    const alive = () => my === ui.runId && ui.phase !== "off";

    while (alive() && clicks < CU.LIMITS.maxClicks && Date.now() - started < CU.LIMITS.maxMs && round < CU.LIMITS.maxRounds) {
      round += 1;
      if (!region.isConnected) {
        region = adapter.getRegion({ deep: true });
        if (!region) break;
      }
      const before = adapter.count(region);
      const targets = adapter.expandables(region).filter((el) => {
        const used = ui.attempts.get(el) || 0;
        return used < CU.LIMITS.perNode && !CU.disabled(el);
      });
      let clickedThisRound = 0;
      for (const el of targets.slice(0, 6)) {
        if (!alive() || clicks >= CU.LIMITS.maxClicks) break;
        if (!allowClick(el)) {
          ui.attempts.set(el, CU.LIMITS.perNode);
          continue;
        }
        try {
          noteExpand(el);
          CU.clickControl(el);
          ui.attempts.set(el, (ui.attempts.get(el) || 0) + 1);
          clicks += 1;
          clickedThisRound += 1;
          if (ui.host) ui.host.dataset.clicks = String(clicks);
        } catch {
          ui.attempts.set(el, CU.LIMITS.perNode);
        }
        await CU.sleep(CU.LIMITS.clickGapMs);
      }

      let pumped = false;
      if (alive() && targets.length === 0) {
        try {
          pumped = !!(await adapter.pump(region));
        } catch {
          pumped = false;
        }
      }
      await CU.sleep(clickedThisRound || pumped ? CU.LIMITS.settleMs : 200);
      if (ui.phase === "focus") CU.focus?.sync();
      if (!alive()) break;
      if (!region.isConnected) region = adapter.getRegion({ deep: true });
      const after = region ? adapter.count(region) : before;
      if (after > before) {
        grew = true;
        stale = 0;
      } else {
        stale += 1;
      }
      if (stale >= CU.LIMITS.staleRounds || (!targets.length && !pumped)) {
        natural = true;
        break;
      }
    }

    if (!alive()) return { ok: false, reason: "aborted" };
    region = region?.isConnected ? region : adapter.getRegion({ deep: true });
    const pagers = region && ui.phase !== "off" ? adapter.pagers(region) : [];
    if (ui.phase === "off") CU.pager.clear();
    else CU.pager.sync(pagers);

    const capped =
      !natural &&
      (clicks >= CU.LIMITS.maxClicks ||
        round >= CU.LIMITS.maxRounds ||
        Date.now() - started >= CU.LIMITS.maxMs);
    let message = "没有更多可展开的内容";
    let state = "done";
    if (capped) {
      state = "capped";
      message = "已到本次上限，可再点一次继续";
    } else if (pagers.length) {
      message = clicks > 0 || grew ? "当前页已展开。悬停评论区，点一下后用左右键翻页。" : "悬停评论区，点一下后用左右键翻页。";
    } else if (clicks > 0 || grew) {
      message = "已展开当前评论";
    }
    setState(state, message);
    return { ok: true, state, clicks, grew };
  };

  function hookNavigation() {
    const fire = () => window.dispatchEvent(new Event("cu-navigate"));
    for (const name of ["pushState", "replaceState"]) {
      const original = history[name];
      if (!original || original.__cu) continue;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        fire();
        return result;
      };
      wrapped.__cu = true;
      history[name] = wrapped;
    }
    window.addEventListener("popstate", fire);
    document.addEventListener("yt-navigate-finish", fire);
  }

  function pageKey(href) {
    try {
      const url = new URL(href, location.origin);
      const host = url.hostname;
      if (host.endsWith("youtube.com")) return `yt:${url.pathname}:${url.searchParams.get("v") || ""}`;
      if (host.endsWith("bilibili.com")) return `bili:${url.pathname}`;
      if (host.endsWith("xiaohongshu.com") || host.endsWith("rednote.com")) return `xhs:${url.pathname}`;
      return `${host}${url.pathname}${url.search}`;
    } catch {
      return href;
    }
  }

  function boot() {
    hookNavigation();
    let key = pageKey(location.href);
    const onNavigate = () => {
      const nextKey = pageKey(location.href);
      if (nextKey === key) return;
      key = nextKey;
      shutdown({ restore: false });
      if (ui.host) setState("idle", "展开评论");
      refreshChrome();
    };
    window.addEventListener("cu-navigate", onNavigate);
    window.setInterval(refreshChrome, 2000);
    CU.refresh = refreshChrome;
    refreshChrome();

    if (globalThis.chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type !== "cu-cycle" && msg?.type !== "cu-expand") return;
        sendResponse(CU.cycle());
      });
    }
  }

  if (!globalThis.__CU_BOOTED) {
    globalThis.__CU_BOOTED = true;
    boot();
  }
})();
