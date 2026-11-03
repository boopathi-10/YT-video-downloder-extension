/**
 * YouTube Downloader - Popup Script
 */

const BACKEND_URL = "http://127.0.0.1:8765";

let currentVideoUrl = "";
let currentMediaType = "video"; // "video" or "audio"
let isBackendOnline = false;
let pollingInterval = null;

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
      await fetch(`${BACKEND_URL}/open-folder`, { method: "POST" });
    } catch (e) {
      alert("Please start the local helper server first: ./backend/run_backend.sh");
    }
  });

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
    const res = await fetch(`${BACKEND_URL}/health`, { method: "GET" });
    if (res.ok) {
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
    const res = await fetch(`${BACKEND_URL}/info?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
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
    const res = await fetch(`${BACKEND_URL}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentVideoUrl,
        media_type: currentMediaType,
        quality: quality,
        audio_format: audioFormat
      })
    });

    if (res.ok) {
      loadTasks();
    } else {
      const err = await res.json();
      alert(`Download failed: ${err.detail || "Error"}`);
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

  try {
    const res = await fetch(`${BACKEND_URL}/tasks`);
    if (!res.ok) return;

    const tasks = await res.json();
    if (!tasks || tasks.length === 0) {
      tasksContainer.innerHTML = '<div class="empty-tasks">No active downloads</div>';
      return;
    }

    tasksContainer.innerHTML = "";
    tasks.slice(0, 5).forEach(task => {
      const card = document.createElement("div");
      card.className = "task-card";

      const percent = Math.round(task.progress_percent || 0);
      let statusText = task.status;
      if (task.status === "downloading") {
        statusText = `${percent}%`;
        if (task.speed) statusText += ` • ${task.speed}`;
      } else if (task.status === "processing") {
        statusText = "Converting / Merging...";
      } else if (task.status === "completed") {
        statusText = "✅ Finished";
      } else if (task.status === "error") {
        statusText = "❌ Failed";
      }

      const isCompleted = task.status === "completed";
      const icon = task.media_type === "audio" ? "🎵" : "📹";

      card.innerHTML = `
        <div class="task-card-title" title="${task.title || task.url}">
          ${icon} ${task.title || task.filename || "Video"}
        </div>
        <div class="task-card-meta">
          <span>${task.quality || ""} ${task.audio_format ? `(${task.audio_format.toUpperCase()})` : ""}</span>
          <span>${statusText}</span>
        </div>
        <div class="task-bar-track">
          <div class="task-bar-fill ${isCompleted ? 'completed' : ''}" style="width: ${percent}%;"></div>
        </div>
      `;

      tasksContainer.appendChild(card);
    });
  } catch (err) {
    //
  }
}
