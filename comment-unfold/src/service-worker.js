const FILES = [
  "src/shared.js",
  "src/pager.js",
  "src/adapters.js",
  "src/focus.js",
  "src/content.js",
];

const queued = new Map();
const busy = new Set();

async function deliver(tabId) {
  if (!tabId || busy.has(tabId)) return;
  busy.add(tabId);
  try {
    while ((queued.get(tabId) || 0) > 0) {
      queued.set(tabId, queued.get(tabId) - 1);
      const send = () => chrome.tabs.sendMessage(tabId, { type: "cu-cycle" });
      try {
        await send();
      } catch {
        await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
        await send();
      }
    }
  } catch {
    chrome.action.setBadgeText({ tabId, text: "无" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#8d3a32" });
  } finally {
    busy.delete(tabId);
    if ((queued.get(tabId) || 0) > 0) deliver(tabId);
  }
}

function cycleTab(tabId) {
  if (!tabId) return;
  queued.set(tabId, (queued.get(tabId) || 0) + 1);
  deliver(tabId);
}

chrome.action.onClicked.addListener((tab) => {
  cycleTab(tab.id);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "cu-badge" || !sender.tab?.id) return;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.text || "" });
  chrome.action.setBadgeBackgroundColor({
    tabId: sender.tab.id,
    color: "#1f6f5b",
  });
});
