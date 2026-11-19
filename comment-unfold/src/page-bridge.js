(function () {
  if (window.__cuPageBridge) return;
  window.__cuPageBridge = true;
  const mark = () => {
    if (document.documentElement) document.documentElement.dataset.cuBridge = "1";
  };
  mark();
  document.addEventListener("DOMContentLoaded", mark, { once: true });

  function findMarked() {
    const stack = [document];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node?.querySelectorAll || seen.has(node)) continue;
      seen.add(node);
      const found = node.querySelector("[data-cu-target]");
      if (found) return found;
      if (node instanceof Element && node.shadowRoot) stack.push(node.shadowRoot);
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) stack.push(el.shadowRoot);
      });
    }
    return null;
  }

  document.addEventListener("cu-click-request", () => {
    const marked = findMarked();
    if (!marked) return;
    const button = marked.matches?.("button, a, [role='button']")
      ? marked
      : marked.querySelector?.("button, [role='button']") || marked;
    marked.removeAttribute("data-cu-target");
    button.click();
  });
})();
