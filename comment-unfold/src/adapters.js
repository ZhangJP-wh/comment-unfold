(function () {
  const CU = globalThis.CU;

  function hasClass(el, name) {
    return CU.className(el).split(/\s+/).includes(name);
  }

function pagerKind(el) {
  const text = CU.controlText(el);
  if (!text || text.length > 16) return "";
  if (/^(上一页|上页)$/.test(text) || /^(prev|previous)$/i.test(text)) return "prev";
  if (/^(下一页|下页)$/.test(text) || /^next$/i.test(text)) return "next";
  if (/^共\s*\d+\s*页$/.test(text)) return "total";
  if (/^\d{1,4}$/.test(text)) return "num";
  return "";
}

function containsDeep(ancestor, node) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    if (current.parentElement) {
      current = current.parentElement;
      continue;
    }
    const root = current.getRootNode?.();
    current = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

function pagerParts(scope) {
  const nodes = CU.deepQueryAll(scope, "button, a, [role='button'], bili-text-button, span, div, li, p");
  const tagged = [];
  for (const el of nodes) {
    if (el.closest?.("#cu-host")) continue;
    const kind = pagerKind(el);
    if (!kind) continue;
    tagged.push({ el, kind, text: CU.controlText(el) });
  }
  return tagged.filter((item) => !tagged.some((other) => other !== item && containsDeep(item.el, other.el)));
}

function isCurrentPage(el) {
  if (el.getAttribute?.("aria-current") === "page" || el.getAttribute?.("aria-selected") === "true") return true;
  return /(^|[\s_-])(active|current|selected)([\s_-]|$)/i.test(CU.className(el));
}

function parentNodeOf(node) {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode?.();
  return root instanceof ShadowRoot ? root.host : null;
}

function pagerBar(el) {
  let node = el;
  let bar = el;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const parent = parentNodeOf(node);
    if (!parent || parent === node) break;
    const compact = (parent.innerText || "").replace(/\s+/g, "");
    const structural = parent.id === "pagination-body" || /pagination|paging|bottom-page/.test(CU.className(parent));
    const looksLikeBar = compact.length > 0 && compact.length <= 48 && /共\d+页/.test(compact) && /下一页|上一页|\d/.test(compact);
    const passthrough = parent.tagName === "BILI-TEXT-BUTTON" || parent.tagName === "BUTTON";
    if (!structural && !looksLikeBar && !passthrough) break;
    if (structural || looksLikeBar) bar = parent;
    node = parent;
  }
  return bar;
}

function clickPart(part) {
  if (!part || CU.disabled(part.el)) return;
  if (/(^|[\s_-])disabled([\s_-]|$)/i.test(CU.className(part.el))) return;
  CU.clickControl(part.el);
}

function makePager(hoverRoot, bar) {
  if (!hoverRoot || !bar) return null;
  const parts = pagerParts(bar);
  const hasStep = parts.some((part) => part.kind === "prev" || part.kind === "next");
  const numbers = parts.filter((part) => part.kind === "num");
  if (!hasStep && numbers.length < 2) return null;
  const go = (dir) => {
    const live = pagerParts(bar.isConnected ? bar : hoverRoot);
    const step = live.find((part) => part.kind === dir);
    if (step) {
      clickPart(step);
      return;
    }
    const nums = live
      .filter((part) => part.kind === "num")
      .sort((a, b) => a.el.getBoundingClientRect().left - b.el.getBoundingClientRect().left);
    const current = nums.find((part) => isCurrentPage(part.el));
    if (!current) return;
    const target = Number(current.text) + (dir === "next" ? 1 : -1);
    clickPart(nums.find((part) => Number(part.text) === target));
  };
  return {
    root: hoverRoot,
    prev() {
      go("prev");
    },
    next() {
      go("next");
    },
  };
}

function pagersIn(region) {
  if (!region) return [];
  const parts = pagerParts(region);
  const anchors = parts.filter((part) => part.kind === "next" || part.kind === "prev" || part.kind === "total");
  const bars = [];
  for (const anchor of anchors) {
    const bar = pagerBar(anchor.el);
    if (!bars.includes(bar)) bars.push(bar);
  }
  const pagers = [];
  for (const bar of bars) {
    const thread = CU.closestHost(bar, "bili-comment-thread-renderer, .reply-item");
    const hover = thread && containsDeep(region, thread) ? thread : region;
    const pager = makePager(hover, bar);
    if (pager && !pagers.some((item) => item.root === pager.root)) pagers.push(pager);
  }
  return pagers;
}

  const youtube = {
    id: "youtube",
    label: "YouTube",
    matches(href) {
      try {
        const url = new URL(href);
        if (!/(^|\.)youtube\.com$/.test(url.hostname)) return false;
        return url.pathname === "/watch" || url.pathname.startsWith("/live/");
      } catch {
        return false;
      }
    },
    getRegion() {
      const named = document.querySelector("ytd-comments#comments");
      if (named) return named;
      return document.querySelector("ytd-comments");
    },
    count(region) {
      return (
        region.querySelectorAll("ytd-comment-thread-renderer").length * 1000 +
        region.querySelectorAll("ytd-comment-view-model, ytd-comment-renderer").length
      );
    },
    expandables(region) {
      const found = [];
      region.querySelectorAll("ytd-button-renderer#more-replies, #more-replies").forEach((host) => {
        const buttons = [
          ...host.querySelectorAll("button, [role='button']"),
          ...(host.shadowRoot ? [...host.shadowRoot.querySelectorAll("button, [role='button']")] : []),
        ];
        const target = buttons.find((btn) => /条回复|\breplies\b|show more/i.test(CU.controlText(btn)));
        if (!target) return;
        const text = CU.controlText(target);
        if (CU.disabled(target) || CU.isReject(text)) return;
        found.push(target);
      });

      region.querySelectorAll("ytd-comment-view-model ytd-expander #more, ytd-comment-renderer ytd-expander #more").forEach((more) => {
        if (CU.disabled(more) || CU.layoutHidden(more)) return;
        const expander = more.closest("ytd-expander");
        if (expander?.hasAttribute("expanded") && !expander.hasAttribute("collapsed")) return;
        const text = CU.controlText(more);
        if (CU.isReject(text)) return;
        if (text && !CU.looksLikeExpand(text) && text !== "了解详情" && text !== "更多") return;
        found.push(more);
      });

      CU.deepQueryAll(region, "ytd-comment-replies-renderer button, ytd-comment-replies-renderer [role='button']").forEach((btn) => {
        const text = CU.controlText(btn);
        if (!CU.looksLikeExpand(text) || CU.disabled(btn)) return;
        found.push(btn);
      });

      return CU.dedupeInnermost(found);
    },
    async pump(region) {
      const main = [...region.querySelectorAll("ytd-continuation-item-renderer")].filter(
        (el) => !el.closest("ytd-comment-replies-renderer")
      );
      const target = main[main.length - 1];
      if (!target) return false;
      target.scrollIntoView({ block: "end", inline: "nearest" });
      window.scrollBy(0, 120);
      return true;
    },
    pagers() {
      return [];
    },
  };

  function findBiliHost(deep) {
    const direct = document.querySelector("bili-comments");
    if (direct) return direct;
    const holders = document.querySelectorAll("#commentapp, #comment, .comment");
    for (const holder of holders) {
      const inner = holder.shadowRoot?.querySelector("bili-comments");
      if (inner) return inner;
    }
    if (deep) {
      const stack = [document];
      const seen = new Set();
      let walked = 0;
      while (stack.length) {
        const node = stack.pop();
        if (!node?.querySelector || seen.has(node)) continue;
        seen.add(node);
        const hit = node.querySelector("bili-comments");
        if (hit) return hit;
        const all = node.querySelectorAll("*");
        for (const el of all) {
          walked += 1;
          if (walked > 6000) return null;
          if (el.shadowRoot) stack.push(el.shadowRoot);
        }
      }
    }
    return document.querySelector("#comment .reply-list, #comment .comment-list, #comment, .comment-container");
  }

  const bilibili = {
    id: "bilibili",
    label: "哔哩哔哩",
    matches(href) {
      try {
        const url = new URL(href);
        if (!/(^|\.)bilibili\.com$/.test(url.hostname)) return false;
        if (url.hostname.startsWith("m.")) return false;
        return url.pathname.startsWith("/video/");
      } catch {
        return false;
      }
    },
    getRegion(options) {
      return findBiliHost(!!options?.deep);
    },
    count(region) {
      const threads = CU.deepQueryAll(region, "bili-comment-thread-renderer, .reply-item").length;
      const replies = CU.deepQueryAll(region, "bili-comment-reply-renderer, .sub-reply-item").length;
      return threads * 1000 + replies;
    },
    expandables(region) {
      const found = [];
      const buttons = CU.deepQueryAll(
        region,
        "button, a, [role='button'], .view-more, .view-more-btn, #view-more, bili-text-button"
      );
      for (const el of buttons) {
        if (hasClass(el, "pagination-btn") || hasClass(el, "next") || hasClass(el, "prev")) continue;
        const text = CU.controlText(el);
        if (!CU.looksLikeExpand(text) || CU.disabled(el)) continue;
        found.push(el);
      }
      return CU.dedupeInnermost(found);
    },
    async pump() {
      return false;
    },
    pagers(region) {
      return pagersIn(region);
    },
  };

  function xhsDetail(href) {
    try {
      const url = new URL(href);
      return /\/explore\/[^/]+/.test(url.pathname) || /\/discovery\/item\//.test(url.pathname) || /\/search_result\//.test(url.pathname);
    } catch {
      return false;
    }
  }

  function xhsRegion() {
    const selectors = [
      ".comments-container",
      ".comments-el",
      ".comment-list",
      ".interaction-container .comment",
    ];
    const found = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => found.push(el));
    }
    if (!found.length) return null;
    found.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
    return found[0];
  }

  const xiaohongshu = {
    id: "xiaohongshu",
    label: "小红书",
    matches(href) {
      try {
        const host = new URL(href).hostname;
        return /(^|\.)xiaohongshu\.com$/.test(host) || /(^|\.)rednote\.com$/.test(host);
      } catch {
        return false;
      }
    },
    isDetail: xhsDetail,
    getRegion() {
      return xhsRegion();
    },
    count(region) {
      const parents = region.querySelectorAll(".parent-comment").length;
      const items = region.querySelectorAll(".comment-item, .comment-item-sub").length;
      return (parents || items) * 1000 + items;
    },
    expandables(region) {
      const found = [];
      const nodes = CU.deepQueryAll(region, "button, a, [role='button'], .show-more, .view-more, span, div");
      for (const el of nodes) {
        if (el.closest?.("#cu-host")) continue;
        const text = CU.controlText(el);
        if (!CU.looksLikeExpand(text) || CU.disabled(el) || CU.layoutHidden(el)) continue;
        if (el.children?.length > 4 && !el.matches("button, a, [role='button'], .show-more")) continue;
        found.push(el);
      }
      return CU.dedupeInnermost(found);
    },
    async pump(region) {
      const scroller = CU.scrollableParent(region);
      const before = scroller.scrollTop;
      const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      if (room < 24 && scroller === document.scrollingElement) return false;
      scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(scroller.clientHeight * 0.85, 240));
      if (scroller !== document.scrollingElement) {
        region.scrollIntoView({ block: "nearest" });
      }
      return scroller.scrollTop !== before || room >= 24;
    },
    pagers(region) {
      return pagersIn(region);
    },
  };

  CU.adapters = [youtube, bilibili, xiaohongshu];

  CU.currentAdapter = function currentAdapter() {
    const forced = document.documentElement.dataset.cuAdapter;
    if (forced) return CU.adapters.find((adapter) => adapter.id === forced) || null;
    return CU.adapters.find((adapter) => adapter.matches(location.href)) || null;
  };

  CU.shouldShowButton = function shouldShowButton(adapter) {
    if (!adapter) return false;
    if (adapter.id === "xiaohongshu") return adapter.isDetail(location.href) || !!adapter.getRegion();
    return adapter.matches(location.href) || document.documentElement.dataset.cuAdapter === adapter.id;
  };
})();
