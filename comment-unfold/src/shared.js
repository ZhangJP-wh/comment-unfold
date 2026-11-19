(function () {
  const CU = (globalThis.CU = globalThis.CU || {});

  CU.LIMITS = Object.freeze({
    maxClicks: 70,
    maxRounds: 24,
    maxMs: 45000,
    staleRounds: 4,
    clickGapMs: 280,
    settleMs: 800,
    perNode: 8,
  });

  CU.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  CU.className = function className(el) {
    if (!el) return "";
    if (typeof el.className === "string") return el.className;
    if (el.className && typeof el.className.baseVal === "string") return el.className.baseVal;
    return "";
  };

  CU.ownText = function ownText(el) {
    if (!el?.childNodes) return "";
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent || "";
    }
    return text.replace(/\s+/g, " ").trim();
  };

  CU.controlText = function controlText(el) {
    if (!el) return "";
    const aria = (el.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim();
    const own = CU.ownText(el);
    const inner = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (aria && aria.length <= 40) return aria;
    if (own && own.length <= 40) return own;
    if (inner && inner.length <= 40) return inner;
    return "";
  };

  CU.isReject = function isReject(text) {
    if (!text) return false;
    return /收起|隐藏回复|隐藏更多|取消回复|^回复$|写评论|写回复|发表|发送|举报|删除|分享|登录|注册|上一页|下一页|上页|下页|^next$|^previous$|^prev$/i.test(
      text.trim()
    );
  };

  CU.looksLikeExpand = function looksLikeExpand(text) {
    if (!text) return false;
    const value = text.replace(/\s+/g, " ").trim();
    if (!value || value.length > 40 || CU.isReject(value)) return false;
    return (
      /^(展开|展开回复|展开更多|展开更多回复|查看更多|查看更多回复|查看全部|查看全部回复|显示更多|加载更多|更多回复|点击加载更多)$/.test(value) ||
      /^展开\s*[\d,.]+\s*条回复$/.test(value) ||
      /^共\s*[\d,.]+\s*条回复/.test(value) ||
      /点击查看/.test(value) ||
      /^(查看\s*)?[\d,.]+\s*条回复$/.test(value) ||
      /^[\d,.]+\s+replies$/i.test(value) ||
      /^show more( replies)?$/i.test(value) ||
      /^read more$/i.test(value) ||
      /^view( \d+)? replies$/i.test(value) ||
      /^more replies$/i.test(value) ||
      /^load more( replies| comments)?$/i.test(value)
    );
  };

  CU.isPrevLabel = function isPrevLabel(text) {
    return /^(上一页|上页|prev|previous|‹|<|＜)$/i.test((text || "").trim());
  };

  CU.isNextLabel = function isNextLabel(text) {
    return /^(下一页|下页|next|›|>|＞)$/i.test((text || "").trim());
  };

  CU.isTypingTarget = function isTypingTarget(el) {
    let node = el;
    while (node && node !== document) {
      if (node.nodeType === 1) {
        const tag = node.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (node.isContentEditable) return true;
        const role = node.getAttribute?.("role");
        if (role === "textbox" || role === "searchbox") return true;
      }
      const root = node.getRootNode?.();
      node = node.parentElement || (root instanceof ShadowRoot ? root.host : null);
    }
    return false;
  };

  CU.disabled = function disabled(el) {
    return !el || !el.isConnected || !!el.disabled || el.getAttribute?.("aria-disabled") === "true";
  };

  CU.layoutHidden = function layoutHidden(el) {
    if (!el || el.hasAttribute?.("hidden")) return true;
    const style = getComputedStyle(el);
    return style.display === "none" || style.visibility === "hidden";
  };

  CU.deepQueryAll = function deepQueryAll(root, selector) {
    const out = [];
    const stack = [];
    const seen = new Set();
    const push = (node) => {
      if (node) stack.push(node);
    };
    push(root);
    if (root?.shadowRoot) push(root.shadowRoot);
    while (stack.length) {
      const node = stack.pop();
      if (!node?.querySelectorAll || seen.has(node)) continue;
      seen.add(node);
      node.querySelectorAll(selector).forEach((el) => out.push(el));
      if (node instanceof Element && node.shadowRoot) push(node.shadowRoot);
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) push(el.shadowRoot);
      });
    }
    return out;
  };

  CU.closestHost = function closestHost(el, selector) {
    let node = el;
    while (node) {
      if (node.matches?.(selector)) return node;
      if (node.parentElement) {
        node = node.parentElement;
        continue;
      }
      const root = node.getRootNode?.();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    return null;
  };

  CU.clickControl = function clickControl(el) {
    if (!el) return false;
    const inner =
      el.shadowRoot?.querySelector("button:not([disabled]), [role='button']") ||
      (el.matches?.("button, a, [role='button']") ? el : el.querySelector?.("button, [role='button']"));
    const target = inner || el;
    const bridged = document.documentElement?.dataset.cuBridge === "1";
    if (!bridged) {
      target.click();
      return true;
    }
    target.setAttribute("data-cu-target", "1");
    document.dispatchEvent(new CustomEvent("cu-click-request", { bubbles: true }));
    target.removeAttribute("data-cu-target");
    return true;
  };

  CU.dedupeInnermost = function dedupeInnermost(list) {
    const unique = [...new Set(list.filter(Boolean))];
    return unique.filter((el) => !unique.some((other) => other !== el && el.contains?.(other)));
  };

  CU.scrollableParent = function scrollableParent(el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      const oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 40) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  CU.inViewport = function inViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0;
  };
})();
