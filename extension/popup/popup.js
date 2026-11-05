/**
 * YouTube Downloader - Popup Script
 * Uses background service worker bridge to bypass Mixed Content / Private Network restrictions.
 */

let currentVideoUrl = "";
let currentMediaType = "video"; // "video" or "audio"
let isBackendOnline = false;
let pollingInterval = null;

// Bridge helper to communicate with backend via background service worker
function callBackend(endpoint, method = "GET", body = null) {
  return new Promise((resolve) => {
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      return resolve({ ok: false, error: "Extension context not available" });
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

document.addEventListener("DOMContentLoaded", async () => {
  setupUI();
  await checkBackendStatus();
  await detectActiveTab();
  loadTasks();

  // Poll tasks & health periodically while popup is open
  pollingInterval = setInterval(() => {
    checkBackendStatus();
    loadTasks();
  }, 1000);
});

// Setup event listeners
function setupUI() {
  const tabVideo = document.getElementById("tab-video");
  const tabAudio = document.getElementById("tab-audio");
  const videoControls = document.getElementById("video-controls");
  const audioControls = document.getElementById("audio-controls");
  const downloadBtn = document.getElementById("download-btn");
  const downloadBtnText = document.getElementById("download-btn-text");
  const copyCmdBtn = document.getElementById("copy-cmd-btn");
  const openFolderBtn = document.getElementById("open-folder-btn");
  const fetchUrlBtn = document.getElementById("fetch-url-btn");

  // Tab switching
  tabVideo.addEventListener("click", () => {
    currentMediaType = "video";
    tabVideo.classList.add("active");
    tabAudio.classList.remove("active");
    videoControls.style.display = "block";
    audioControls.style.display = "none";
    downloadBtnText.textContent = "Download Video";
  });

  tabAudio.addEventListener("click", () => {
    currentMediaType = "audio";
    tabAudio.classList.add("active");
    tabVideo.classList.remove("active");
    videoControls.style.display = "none";
    audioControls.style.display = "block";
    downloadBtnText.textContent = "Download Audio (MP3)";
  });

  // Download Trigger
  downloadBtn.addEventListener("click", handleDownload);

  // Copy command
  copyCmdBtn.addEventListener("click", () => {
    navigator.clipboard.writeText("./backend/run_backend.sh");
    copyCmdBtn.textContent = "✓";
    setTimeout(() => { copyCmdBtn.textContent = "📋"; }, 1500);
  });

  // Open Folder
  openFolderBtn.addEventListener("click", async () => {
    try {
      const res = await callBackend("/open-folder", "POST");
      if (!res || !res.ok) {
        alert("Please start the local helper server first: ./backend/run_backend.sh");
      }
    } catch (e) {
      alert("Please start the local helper server first: ./backend/run_backend.sh");
    }
  });

  // Clear Tasks History Button (Does NOT delete any actual files on disk)
  const clearTasksBtn = document.getElementById("clear-tasks-btn");
  if (clearTasksBtn) {
    clearTasksBtn.addEventListener("click", async () => {
      try {
        await callBackend("/clear-tasks", "POST");
        const tasksContainer = document.getElementById("tasks-list");
        const countBadge = document.getElementById("tasks-count");
        if (tasksContainer) {
          tasksContainer.innerHTML = '<div class="empty-tasks">✓ List cleared<br><span style="font-size: 10px; color: #888;">(Your downloaded files remain safe in your Downloads folder)</span></div>';
        }
        if (countBadge) {
          countBadge.style.display = "none";
        }
      } catch (err) {
        console.warn("Could not clear tasks:", err);
      }
    });
  }

  // Custom URL Load
  fetchUrlBtn.addEventListener("click", async () => {
    const input = document.getElementById("custom-url-input");
    const url = input.value.trim();
    if (url) {
      currentVideoUrl = url;
      fetchVideoMetadata(url);
    }
  });
}

// Check Backend Health
async function checkBackendStatus() {
  const indicator = document.getElementById("backend-status");
  const offlineBanner = document.getElementById("offline-banner");

  try {
    const res = await callBackend("/health", "GET");
    if (res && res.ok && res.data && res.data.status === "ok") {
      isBackendOnline = true;
      indicator.className = "status-indicator online";
      indicator.querySelector(".status-text").textContent = "Helper Online";
      offlineBanner.style.display = "none";
      return true;
    }
  } catch (err) {
    // Offline
  }

  isBackendOnline = false;
  indicator.className = "status-indicator offline";
  indicator.querySelector(".status-text").textContent = "Helper Offline";
  offlineBanner.style.display = "block";
  return false;
}

// Detect current active YouTube tab
async function detectActiveTab() {
  const videoCard = document.getElementById("video-card");
  const urlSection = document.getElementById("url-input-section");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && (tab.url.includes("youtube.com/watch") || tab.url.includes("youtube.com/shorts/"))) {
      currentVideoUrl = tab.url;
      videoCard.style.display = "flex";
      urlSection.style.display = "none";

      // If backend is online, query rich info
      fetchVideoMetadata(tab.url, tab.title);
    } else {
      // Not on a watch page, show custom input
      videoCard.style.display = "none";
      urlSection.style.display = "flex";
    }
  } catch (err) {
    console.error("Tab query error:", err);
    videoCard.style.display = "none";
    urlSection.style.display = "flex";
  }
}

// Fetch video info from helper
async function fetchVideoMetadata(url, fallbackTitle) {
  const titleEl = document.getElementById("video-title");
  const authorEl = document.getElementById("video-author");
  const thumbEl = document.getElementById("video-thumb");
  const durationEl = document.getElementById("video-duration");
  const videoCard = document.getElementById("video-card");

  titleEl.textContent = fallbackTitle ? fallbackTitle.replace(" - YouTube", "") : "Loading details...";
  authorEl.textContent = "Fetching channel info...";
  videoCard.style.display = "flex";

  if (!isBackendOnline) {
    return;
  }

  try {
    const res = await callBackend(`/info?url=${encodeURIComponent(url)}`, "GET");
    if (res && res.ok && res.data) {
      const data = res.data;
      titleEl.textContent = data.title;
      authorEl.textContent = data.uploader || "YouTube";
      durationEl.textContent = data.duration || "--:--";
      if (data.thumbnail) {
        thumbEl.src = data.thumbnail;
      }

      // Populate available qualities
      if (data.available_resolutions && data.available_resolutions.length > 0) {
        const qualitySelect = document.getElementById("video-quality-select");
        qualitySelect.innerHTML = "";
        data.available_resolutions.forEach(res => {
          const opt = document.createElement("option");
          opt.value = res.value;
          opt.textContent = `${res.label} (MP4)`;
          if (res.value === data.default_resolution) {
            opt.selected = true;
          }
          qualitySelect.appendChild(opt);
        });
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote metadata:", err);
  }
}

// Start Download
async function handleDownload() {
  if (!currentVideoUrl) {
    alert("Please enter or navigate to a YouTube video!");
    return;
  }

  if (!isBackendOnline) {
    const online = await checkBackendStatus();
    if (!online) {
      alert("Local helper server is offline!\n\nPlease run in terminal:\n./backend/run_backend.sh");
      return;
    }
  }

  let quality = "1080p";
  let audioFormat = "mp3";

  if (currentMediaType === "video") {
    const qSelect = document.getElementById("video-quality-select");
    quality = qSelect.value;
  } else {
    const aSelect = document.getElementById("audio-format-select");
    const val = aSelect.value; // e.g. "mp3-320", "m4a-best"
    const [fmt, q] = val.split("-");
    audioFormat = fmt;
    quality = q === "best" ? "best" : `${q}k`;
  }

  const downloadBtn = document.getElementById("download-btn");
  downloadBtn.disabled = true;
  downloadBtn.style.opacity = "0.7";

  try {
    const res = await callBackend("/download", "POST", {
      url: currentVideoUrl,
      media_type: currentMediaType,
      quality: quality,
      audio_format: audioFormat
    });

    if (res && res.ok) {
      loadTasks();
    } else {
      const err = res?.data?.detail || res?.error || "Error";
      alert(`Download failed: ${err}`);
    }
  } catch (err) {
    alert("Error sending download request: " + err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.style.opacity = "1";
  }
}

// Load and render downloads list
async function loadTasks() {
  if (!isBackendOnline) return;

  const tasksContainer = document.getElementById("tasks-list");
  const countBadge = document.getElementById("tasks-count");

  try {
    const res = await callBackend("/tasks", "GET");
    if (!res || !res.ok || !res.data) return;

    const tasks = res.data;
    if (!tasks || tasks.length === 0) {
      if (countBadge) countBadge.style.display = "none";
      tasksContainer.innerHTML = '<div class="empty-tasks">No recent downloads</div>';
      return;
    }

    if (countBadge) {
      countBadge.textContent = tasks.length;
      countBadge.style.display = "inline-block";
    }

    tasksContainer.innerHTML = "";
    tasks.slice(0, 5).forEach(task => {
      const card = document.createElement("div");
      card.className = "task-card";

      const percent = Math.round(task.progress_percent || 0);
      const isCompleted = task.status === "completed";
      const isAudio = task.media_type === "audio";
      const icon = isAudio ? "🎵" : "📹";

      let statusText = task.status;
      if (task.status === "downloading") {
        statusText = `${percent}%`;
        if (task.speed) statusText += ` • ${task.speed}`;
      } else if (task.status === "processing") {
        statusText = "Converting / Merging...";
      } else if (task.status === "completed") {
        statusText = "✅ Ready";
      } else if (task.status === "error") {
        statusText = "❌ Failed";
      }

      const qualityBadge = `${task.quality || ""}${task.audio_format ? " " + task.audio_format.toUpperCase() : ""}`;

      card.innerHTML = `
        <div class="task-card-main">
          <span class="task-media-icon">${icon}</span>
          <div class="task-card-content">
            <div class="task-card-title" title="${task.title || task.filename || "Video"}">
              ${task.title || task.filename || "YouTube Media"}
            </div>
            <div class="task-card-meta">
              <span class="task-format-tag">${qualityBadge}</span>
              <span>${statusText}</span>
              ${isCompleted && task.filepath ? `<button class="task-open-btn" title="Open file in player">▶ Play</button>` : ""}
            </div>
          </div>
        </div>
        ${!isCompleted ? `
          <div class="task-bar-track">
            <div class="task-bar-fill" style="width: ${percent}%;"></div>
          </div>
        ` : ""}
      `;

      // Hook up direct play/open button if completed
      const playBtn = card.querySelector(".task-open-btn");
      if (playBtn && task.filepath) {
        playBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            await callBackend("/open-file", "POST", { filepath: task.filepath });
          } catch (err) {
            console.warn("Could not open file:", err);
          }
        });
      }

      tasksContainer.appendChild(card);
    });
  } catch (err) {
    //
  }
}
