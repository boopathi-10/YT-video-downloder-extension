/**
 * Background Service Worker
 * Handles lifecycle events, notifications, and acts as an elevated API bridge
 * between YouTube content script / popup and the local helper server.
 */

const BACKEND_URL = "http://127.0.0.1:8765";

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[YT Downloader] Extension installed:", details.reason);
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

// Elevated fetch proxy to avoid Mixed Content / PNA blocks from in-page scripts
async function handleBackendFetch(request, sendResponse) {
  try {
    const endpoint = request.endpoint.startsWith("/") ? request.endpoint : `/${request.endpoint}`;
    const url = `${BACKEND_URL}${endpoint}`;
    const options = {
      method: request.method || "GET",
      headers: {}
    };

    if (request.body) {
      options.headers["Content-Type"] = "application/json";
      options.body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    }

    const res = await fetch(url, options);
    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }

    sendResponse({
      ok: res.ok,
      status: res.status,
      data: data
    });
  } catch (err) {
    sendResponse({
      ok: false,
      status: 0,
      error: err.message || "Failed to reach backend helper"
    });
  }
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

  if (request.action === "BACKEND_FETCH") {
    handleBackendFetch(request, sendResponse);
    return true; // Keep message channel open for async response
  }
});
