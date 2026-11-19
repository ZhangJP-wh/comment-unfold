async function expandTab(tabId) {
  if (!tabId) return;
  const send = () => chrome.tabs.sendMessage(tabId, { type: "cu-expand" });
  try {
    await send();
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          "src/shared.js",
          "src/pager.js",
          "src/adapters.js",
          "src/focus.js",
          "src/content.js",
        ],
      });
      await send();
    } catch {
      chrome.action.setBadgeText({ tabId, text: "无" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#8d3a32" });
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  expandTab(tab.id);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "cu-badge" || !sender.tab?.id) return;
  chrome.action.setBadgeText({ tabId: sender.tab.id, text: msg.text || "" });
  chrome.action.setBadgeBackgroundColor({
    tabId: sender.tab.id,
    color: "#1f6f5b",
  });
});
