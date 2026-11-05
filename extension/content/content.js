/**
 * YouTube Video & Audio Downloader - Content Script
 * Injects modern download button directly into YouTube's action bar.
 * Uses background service worker bridge to bypass Mixed Content / Private Network restrictions.
 */

(function () {
  let activeTab = "video"; // "video" or "audio"
  let isBackendOnline = false;
  let observer = null;

  // Bridge helper to communicate with backend via background service worker
  // This bypasses Chrome's Mixed Content & Private Network restrictions on HTTPS YouTube pages
  function callBackend(endpoint, method = "GET", body = null) {
    return new Promise((resolve) => {
      if (!chrome.runtime || !chrome.runtime.sendMessage) {
        return resolve({ ok: false, error: "Extension context invalidated. Please refresh the page." });
      }
      chrome.runtime.sendMessage(
        {
          action: "BACKEND_FETCH",
          endpoint: endpoint,
          method: method,
          body: body
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return resolve({ ok: false, error: chrome.runtime.lastError.message });
          }
          resolve(response || { ok: false, error: "No response from background service worker" });
        }
      );
    });
  }

  // Check helper status
  async function checkBackend() {
    try {
      const res = await callBackend("/health", "GET");
      if (res && res.ok && res.data && res.data.status === "ok") {
        isBackendOnline = true;
        return true;
      }
    } catch (e) {
      // offline
    }
    isBackendOnline = false;
    return false;
  }

  // Check if current page is a video or short
  function isWatchPage() {
    const path = window.location.pathname;
    return path.includes("/watch") || path.includes("/shorts/");
  }

  // Find native YouTube action button bar
  function findActionBar() {
    const selectors = [
      "ytd-watch-metadata #actions #top-level-buttons-computed",
      "#actions-inner #top-level-buttons-computed",
      "#top-level-buttons-computed",
      "ytd-menu-renderer[class*='ytd-watch-metadata'] #top-level-buttons-computed",
      "#actions #top-level-buttons-computed",
      "ytd-reel-player-overlay-renderer #actions"
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
    return null;
  }

  // Inject or update the download button
  function injectButton() {
    if (!isWatchPage()) {
      removeExistingButton();
      return;
    }

    if (document.getElementById("ytdl-injected-container")) {
      return; // Already injected
    }

    const container = findActionBar();
    if (!container) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "ytdl-injected-container";
    wrapper.style.display = "inline-flex";
    wrapper.style.position = "relative";
    wrapper.style.alignItems = "center";

    // Download Button
    const btn = document.createElement("button");
    btn.id = "ytdl-injected-btn";
    btn.className = "ytdl-pill-btn";
    btn.title = "Download Video or Audio";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      <span>Download</span>
      <svg class="ytdl-arrow-icon" viewBox="0 0 24 24">
        <path d="M7 10l5 5 5-5z"/>
      </svg>
    `;

    // Dropdown Menu
    const menu = document.createElement("div");
    menu.id = "ytdl-injected-menu";
    menu.className = "ytdl-dropdown-menu";
    menu.style.display = "none";

    wrapper.appendChild(btn);
    wrapper.appendChild(menu);

    // Insert at beginning of action buttons
    if (container.firstChild) {
      container.insertBefore(wrapper, container.firstChild);
    } else {
      container.appendChild(wrapper);
    }

    // Toggle menu on click
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const isVisible = menu.style.display === "block";
      if (isVisible) {
        menu.style.display = "none";
        btn.classList.remove("open");
      } else {
        await checkBackend();
        renderMenuContent(menu);
        menu.style.display = "block";
        btn.classList.add("open");
      }
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        menu.style.display = "none";
        btn.classList.remove("open");
      }
    });
  }

  function removeExistingButton() {
    const existing = document.getElementById("ytdl-injected-container");
    if (existing) {
      existing.remove();
    }
  }

  // Render contents of dropdown
  function renderMenuContent(menu) {
    const statusClass = isBackendOnline ? "online" : "offline";
    const statusText = isBackendOnline ? "Helper Online" : "Helper Offline";

    menu.innerHTML = `
      <div class="ytdl-menu-header">
        <span class="ytdl-menu-title">
          <svg style="width: 16px; height: 16px; fill: #ff0033;" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          Download Format
        </span>
        <span class="ytdl-status-pill ${statusClass}">
          ● ${statusText}
        </span>
      </div>

      <div class="ytdl-tabs">
        <button class="ytdl-tab-btn ${activeTab === 'video' ? 'active' : ''}" id="ytdl-tab-video">📹 Video (MP4)</button>
        <button class="ytdl-tab-btn ${activeTab === 'audio' ? 'active' : ''}" id="ytdl-tab-audio">🎵 Audio (MP3)</button>
      </div>

      <div class="ytdl-options-list" id="ytdl-options-container">
        <!-- Rendered based on tab -->
      </div>

      ${!isBackendOnline ? `
        <div class="ytdl-offline-alert">
          ⚠️ <b>Local Helper is not running.</b><br/>
          To download in 1080p/4K or convert to MP3, run the helper in your terminal:<br/>
          <code>./backend/run_backend.sh</code>
        </div>
      ` : ''}

      <div class="ytdl-footer-actions">
        <span class="ytdl-footer-link" id="ytdl-open-folder-link">📂 Open Downloads Folder</span>
        <span style="color: #888; font-size: 11px;">v1.0</span>
      </div>
    `;

    // Tab buttons event
    const tabVideo = menu.querySelector("#ytdl-tab-video");
    const tabAudio = menu.querySelector("#ytdl-tab-audio");

    tabVideo.addEventListener("click", (e) => {
      e.stopPropagation();
      activeTab = "video";
      renderMenuContent(menu);
    });

    tabAudio.addEventListener("click", (e) => {
      e.stopPropagation();
      activeTab = "audio";
      renderMenuContent(menu);
    });

    // Open Folder link
    const folderLink = menu.querySelector("#ytdl-open-folder-link");
    if (folderLink) {
      folderLink.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          const res = await callBackend("/open-folder", "POST");
          if (!res || !res.ok) {
            alert("Please start the local helper first: ./backend/run_backend.sh");
          }
        } catch (err) {
          alert("Please start the local helper first: ./backend/run_backend.sh");
        }
      });
    }

    // Populate Options
    const optionsContainer = menu.querySelector("#ytdl-options-container");
    if (activeTab === "video") {
      const videoOptions = [
        { label: "1080p (Full HD)", quality: "1080p", badge: "MP4" },
        { label: "720p (HD)", quality: "720p", badge: "MP4" },
        { label: "480p (Standard)", quality: "480p", badge: "MP4" },
        { label: "360p (Fast Download)", quality: "360p", badge: "MP4" },
        { label: "Best Available Quality", quality: "best", badge: "Auto" }
      ];

      videoOptions.forEach(opt => {
        const item = document.createElement("div");
        item.className = "ytdl-option-item";
        item.innerHTML = `
          <span class="ytdl-opt-label">${opt.label}</span>
          <span class="ytdl-opt-badge">${opt.badge}</span>
        `;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          triggerDownload({ media_type: "video", quality: opt.quality });
          menu.style.display = "none";
          document.getElementById("ytdl-injected-btn")?.classList.remove("open");
        });
        optionsContainer.appendChild(item);
      });
    } else {
      const audioOptions = [
        { label: "MP3 — High Quality (320 kbps)", quality: "320k", format: "mp3", badge: "320k MP3" },
        { label: "MP3 — Standard Quality (192 kbps)", quality: "192k", format: "mp3", badge: "192k MP3" },
        { label: "MP3 — Compact (128 kbps)", quality: "128k", format: "mp3", badge: "128k MP3" },
        { label: "M4A / AAC — Original Stream", quality: "best", format: "m4a", badge: "M4A" },
        { label: "WAV — Lossless Audio", quality: "best", format: "wav", badge: "WAV" }
      ];

      audioOptions.forEach(opt => {
        const item = document.createElement("div");
        item.className = "ytdl-option-item";
        item.innerHTML = `
          <span class="ytdl-opt-label">${opt.label}</span>
          <span class="ytdl-opt-badge">${opt.badge}</span>
        `;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          triggerDownload({ media_type: "audio", quality: opt.quality, audio_format: opt.format });
          menu.style.display = "none";
          document.getElementById("ytdl-injected-btn")?.classList.remove("open");
        });
        optionsContainer.appendChild(item);
      });
    }
  }

  // Trigger download via local helper
  async function triggerDownload(params) {
    const videoUrl = window.location.href;
    const pageTitle = document.title.replace(" - YouTube", "").trim() || "YouTube Video";

    if (!isBackendOnline) {
      const onlineNow = await checkBackend();
      if (!onlineNow) {
        alert("Local helper server is offline!\n\nPlease open your terminal in the project directory and run:\n./backend/run_backend.sh");
        return;
      }
    }

    try {
      const res = await callBackend("/download", "POST", {
        url: videoUrl,
        media_type: params.media_type,
        quality: params.quality,
        audio_format: params.audio_format || "mp3"
      });

      if (!res || !res.ok) {
        const errMsg = res?.data?.detail || res?.error || "Server error";
        alert(`Download failed: ${errMsg}`);
        return;
      }

      const data = res.data;
      showDownloadToast(data.task_id, pageTitle, params.media_type);
    } catch (err) {
      console.error("[YT Downloader] Download start error:", err);
      alert("Could not connect to helper backend: " + err.message);
    }
  }

  // Floating Download Progress Toast
  function showDownloadToast(taskId, initialTitle, mediaType) {
    // Remove any existing toast with same id
    const existing = document.getElementById(`ytdl-toast-${taskId}`);
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = `ytdl-toast-${taskId}`;
    toast.className = "ytdl-toast";
    toast.innerHTML = `
      <div class="ytdl-toast-header">
        <div class="ytdl-toast-title" title="${initialTitle}">
          ${mediaType === "audio" ? "🎵" : "📹"} ${initialTitle}
        </div>
        <button class="ytdl-toast-close">&times;</button>
      </div>
      <div class="ytdl-toast-meta">
        <span class="ytdl-toast-status">Starting download...</span>
        <span class="ytdl-toast-percent">0%</span>
      </div>
      <div class="ytdl-progress-track">
        <div class="ytdl-progress-fill"></div>
      </div>
      <div class="ytdl-toast-footer" style="display: none;">
        <button class="ytdl-toast-btn" id="ytdl-open-btn-${taskId}">📂 Open in Downloads</button>
      </div>
    `;

    document.body.appendChild(toast);

    const closeBtn = toast.querySelector(".ytdl-toast-close");
    closeBtn.addEventListener("click", () => toast.remove());

    const statusEl = toast.querySelector(".ytdl-toast-status");
    const percentEl = toast.querySelector(".ytdl-toast-percent");
    const fillEl = toast.querySelector(".ytdl-progress-fill");
    const footerEl = toast.querySelector(".ytdl-toast-footer");
    const openBtn = toast.querySelector(`#ytdl-open-btn-${taskId}`);

    if (openBtn) {
      openBtn.addEventListener("click", async () => {
        try {
          await callBackend("/open-folder", "POST");
        } catch (e) {}
      });
    }

    // Polling interval
    const interval = setInterval(async () => {
      try {
        const res = await callBackend(`/progress/${taskId}`, "GET");
        if (!res || !res.ok) {
          if (res && res.status === 404) {
            clearInterval(interval);
          }
          return;
        }

        const task = res.data;
        if (!task) return;

        const percent = task.progress_percent || 0;
        fillEl.style.width = `${percent}%`;
        percentEl.textContent = `${Math.round(percent)}%`;

        if (task.status === "downloading") {
          let meta = "Downloading";
          if (task.speed) meta += ` • ${task.speed}`;
          if (task.eta) meta += ` • ETA ${task.eta}`;
          statusEl.textContent = meta;
        } else if (task.status === "processing") {
          statusEl.textContent = "Processing & Converting...";
          fillEl.style.width = "99%";
        } else if (task.status === "completed") {
          clearInterval(interval);
          statusEl.textContent = "✅ Download Complete!";
          statusEl.style.color = "#2ecc71";
          percentEl.textContent = "100%";
          fillEl.style.width = "100%";
          fillEl.classList.add("completed");
          footerEl.style.display = "block";

          // Optional chrome notification
          if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              action: "SHOW_NOTIFICATION",
              title: "Download Finished",
              message: task.title || initialTitle
            });
          }
        } else if (task.status === "error") {
          clearInterval(interval);
          statusEl.textContent = `❌ Error: ${task.error || "Failed"}`;
          statusEl.style.color = "#e74c3c";
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 750);
  }

  // MutationObserver to re-inject when YouTube updates dynamically
  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      if (isWatchPage() && !document.getElementById("ytdl-injected-container")) {
        injectButton();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Listen for YouTube SPA navigation events
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(injectButton, 500);
  });

  window.addEventListener("popstate", () => {
    setTimeout(injectButton, 500);
  });

  // Initial setup
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectButton();
      setupObserver();
    });
  } else {
    injectButton();
    setupObserver();
  }

  // Check helper status via background proxy
  checkBackend();
})();
