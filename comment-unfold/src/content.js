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
    idle: "",
  };

  const ui = {
    host: null,
    button: null,
    runId: 0,
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
    off.id = "cu-focus-off";
    off.textContent = "取消变暗";
    off.title = "去掉评论区的灰色遮罩，不刷新页面";
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
      if (ui.host.dataset.state === "running") {
        stopRun();
        return;
      }
      CU.expandCurrent();
    });
    off.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      CU.focus?.disable();
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

  function refreshChrome() {
    const adapter = CU.currentAdapter();
    const show = CU.shouldShowButton(adapter);
    if (!show) {
      CU.focus?.disable();
      if (ui.host?.dataset.state !== "running") removeUi();
      CU.pager.clear();
      return;
    }
    ensureUi();
    if (CU.focus?.isOn()) CU.focus.sync();
    if (ui.host.dataset.state === "running") return;
    if (!ui.host.dataset.state || ui.host.dataset.state === "idle") setState("idle", "展开评论");
    const region = adapter.getRegion({ deep: true });
    const pagers = region ? adapter.pagers(region) : [];
    CU.pager.sync(pagers);
    if (ui.host?.dataset.state === "done" && pagers.length && !/翻页/.test(ui.host.dataset.message || "")) {
      setState("done", "当前页已展开。悬停评论区，点一下后用左右键翻页。");
    }
  }

  function stopRun() {
    ui.runId += 1;
    setState("stopped", "已停止");
  }

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
    if (!adapter || !CU.shouldShowButton(adapter)) {
      setState("missing", "这个页面没有可展开的评论");
      return { ok: false, reason: "unsupported" };
    }

    const my = ++ui.runId;
    ui.attempts = new WeakMap();
    setState("running", "展开中…");
    CU.focus?.enable();

    let region = await nudge(adapter);
    const waitUntil = Date.now() + 8000;
    while ((!region || !region.isConnected) && Date.now() < waitUntil) {
      if (my !== ui.runId) return { ok: false, reason: "aborted" };
      await CU.sleep(400);
      region = adapter.getRegion({ deep: true });
    }
    if (!region) {
      if (my === ui.runId) setState("missing", "没有找到评论区。若页面要求登录或验证，请先完成后再试。");
      return { ok: false, reason: "missing" };
    }

    for (let i = 0; i < 8 && my === ui.runId && region && adapter.count(region) === 0; i += 1) {
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
    const alive = () => my === ui.runId;

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
        try {
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
      CU.focus?.sync();
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
    const pagers = region ? adapter.pagers(region) : [];
    CU.pager.sync(pagers);

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
      ui.runId += 1;
      CU.pager.clear();
      CU.focus?.disable();
      if (ui.host) setState("idle", "展开评论");
      refreshChrome();
    };
    window.addEventListener("cu-navigate", onNavigate);
    window.setInterval(refreshChrome, 2000);
    CU.refresh = refreshChrome;
    refreshChrome();

    if (globalThis.chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type !== "cu-expand") return;
        CU.expandCurrent().then(sendResponse);
        return true;
      });
    }
  }

  if (!globalThis.__CU_BOOTED) {
    globalThis.__CU_BOOTED = true;
    boot();
  }
})();
