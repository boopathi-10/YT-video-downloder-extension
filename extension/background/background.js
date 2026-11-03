/**
 * Background Service Worker
 * Handles lifecycle events, notifications, and cross-component messaging.
 */

const BACKEND_URL = "http://127.0.0.1:8765";

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[YT Downloader] Extension installed:", details.reason);
  // Set initial badge status
  checkBackendStatus();
});

// Periodic or triggered backend check
async function checkBackendStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      console.log("[YT Downloader] Backend helper is online:", data);
      return true;
    }
  } catch (err) {
    // Backend offline
  }
  return false;
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SHOW_NOTIFICATION") {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: request.title || "YouTube Downloader",
        message: request.message || "Download complete!",
        priority: 2
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "CHECK_BACKEND") {
    checkBackendStatus().then(online => {
      sendResponse({ online });
    });
    return true; // Keep message channel open for async response
  }
});
