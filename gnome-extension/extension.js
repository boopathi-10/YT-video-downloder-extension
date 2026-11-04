/**
 * YouTube Video & Audio Downloader - GNOME Shell Extension
 * Compatible with GNOME 45, 46, and 47 (ESM)
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const BACKEND_URL = 'http://127.0.0.1:8765';

const YouTubeIndicator = GObject.registerClass(
class YouTubeIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'YouTube Downloader');

        this._httpSession = new Soup.Session({ timeout: 5 });

        // Indicator Icon in top panel
        const icon = new St.Icon({
            icon_name: 'folder-download-symbolic',
            style_class: 'system-status-icon ytdl-indicator-icon',
        });
        this.add_child(icon);

        this._buildMenu();

        // Refresh status when menu opens
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._checkBackendStatus();
                this._checkClipboardUrl();
            }
        });
    }

    _buildMenu() {
        // Title & Status
        this._headerItem = new PopupMenu.PopupMenuItem('🎬 YouTube Downloader', { reactive: false });
        this.menu.addMenuItem(this._headerItem);

        this._statusItem = new PopupMenu.PopupMenuItem('Checking helper status...', { reactive: true });
        this._statusItem.connect('activate', () => this._checkBackendStatus());
        this.menu.addMenuItem(this._statusItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Clipboard URL preview label
        this._clipboardLabel = new PopupMenu.PopupMenuItem('📋 Clipboard: No YouTube link found', { reactive: false });
        this.menu.addMenuItem(this._clipboardLabel);

        // Download Options Submenu
        this._downloadSubmenu = new PopupMenu.PopupSubMenuMenuItem('📥 Download Options');
        this.menu.addMenuItem(this._downloadSubmenu);

        this._addOption(this._downloadSubmenu.menu, '📹 Video — 1080p (Full HD)', 'video', '1080p', 'mp4');
        this._addOption(this._downloadSubmenu.menu, '📹 Video — 720p (HD)', 'video', '720p', 'mp4');
        this._addOption(this._downloadSubmenu.menu, '📹 Video — Best Available', 'video', 'best', 'mp4');
        this._downloadSubmenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._addOption(this._downloadSubmenu.menu, '🎵 Audio — MP3 (320 kbps HQ)', 'audio', '320k', 'mp3');
        this._addOption(this._downloadSubmenu.menu, '🎵 Audio — MP3 (192 kbps Standard)', 'audio', '192k', 'mp3');
        this._addOption(this._downloadSubmenu.menu, '🎵 Audio — M4A (Original)', 'audio', 'best', 'm4a');

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Open Downloads Folder
        const openFolderItem = new PopupMenu.PopupMenuItem('📂 Open Downloads Folder');
        openFolderItem.connect('activate', () => this._openDownloadsFolder());
        this.menu.addMenuItem(openFolderItem);
    }

    _addOption(menu, label, mediaType, quality, format) {
        const item = new PopupMenu.PopupMenuItem(label);
        item.connect('activate', () => {
            this._startDownloadFromClipboard(mediaType, quality, format);
        });
        menu.addMenuItem(item);
    }

    _checkBackendStatus() {
        try {
            const message = Soup.Message.new('GET', `${BACKEND_URL}/health`);
            this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, res) => {
                try {
                    const bytes = session.send_and_read_finish(res);
                    if (message.get_status() === Soup.Status.OK) {
                        this._statusItem.label.text = '🟢 Local Helper Online';
                    } else {
                        this._statusItem.label.text = '🔴 Helper Offline (Start: ./backend/run_backend.sh)';
                    }
                } catch (e) {
                    this._statusItem.label.text = '🔴 Helper Offline (Start: ./backend/run_backend.sh)';
                }
            });
        } catch (e) {
            this._statusItem.label.text = '🔴 Helper Offline';
        }
    }

    _checkClipboardUrl() {
        const clipboard = St.Clipboard.get_default();
        clipboard.get_text(St.ClipboardType.CLIPBOARD, (clip, text) => {
            if (text && (text.includes('youtube.com/watch') || text.includes('youtu.be/') || text.includes('youtube.com/shorts/'))) {
                this._detectedUrl = text.trim();
                const shortUrl = this._detectedUrl.length > 38 ? this._detectedUrl.substring(0, 35) + '...' : this._detectedUrl;
                this._clipboardLabel.label.text = `📋 Ready: ${shortUrl}`;
                this._downloadSubmenu.setSensitive(true);
            } else {
                this._detectedUrl = null;
                this._clipboardLabel.label.text = '📋 Clipboard: Copy a YouTube link first';
                this._downloadSubmenu.setSensitive(false);
            }
        });
    }

    _startDownloadFromClipboard(mediaType, quality, format) {
        if (!this._detectedUrl) {
            Main.notify('YouTube Downloader', 'Please copy a YouTube link to your clipboard first!');
            return;
        }

        const url = this._detectedUrl;
        Main.notify('YouTube Downloader', `Starting download: ${mediaType.toUpperCase()} (${quality})...`);

        try {
            const payload = JSON.stringify({
                url: url,
                media_type: mediaType,
                quality: quality,
                audio_format: format || 'mp3'
            });

            const bytes = new GLib.Bytes(payload);
            const message = Soup.Message.new('POST', `${BACKEND_URL}/download`);
            message.set_request_body_from_bytes('application/json', bytes);

            this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, res) => {
                try {
                    const respBytes = session.send_and_read_finish(res);
                    if (message.get_status() === Soup.Status.OK) {
                        const decoder = new TextDecoder('utf-8');
                        const data = JSON.parse(decoder.decode(respBytes.get_data()));
                        if (data && data.task_id) {
                            this._pollTask(data.task_id);
                        }
                    } else {
                        Main.notify('YouTube Downloader', 'Failed to start download. Is helper running?');
                    }
                } catch (e) {
                    Main.notify('YouTube Downloader', `Error: ${e.message}`);
                }
            });
        } catch (e) {
            Main.notify('YouTube Downloader', `Error: ${e.message}`);
        }
    }

    _pollTask(taskId) {
        let attempts = 0;
        const intervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            attempts++;
            if (attempts > 120) { // 3 minute timeout
                return GLib.SOURCE_REMOVE;
            }

            try {
                const message = Soup.Message.new('GET', `${BACKEND_URL}/progress/${taskId}`);
                this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, res) => {
                    try {
                        const bytes = session.send_and_read_finish(res);
                        if (message.get_status() === Soup.Status.OK) {
                            const decoder = new TextDecoder('utf-8');
                            const task = JSON.parse(decoder.decode(bytes.get_data()));
                            if (task.status === 'completed') {
                                Main.notify('YouTube Downloader', `✅ Finished: ${task.title || 'Video'} saved in Downloads!`);
                                GLib.source_remove(intervalId);
                            } else if (task.status === 'error') {
                                Main.notify('YouTube Downloader', `❌ Failed: ${task.error || 'Unknown error'}`);
                                GLib.source_remove(intervalId);
                            }
                        }
                    } catch (e) {
                        // ignore poll error
                    }
                });
            } catch (e) {
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _openDownloadsFolder() {
        try {
            const message = Soup.Message.new('POST', `${BACKEND_URL}/open-folder`);
            this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, () => {});
        } catch (e) {
            // Fallback to desktop Gio open
            const downloadsUri = GLib.filename_to_uri(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD), null);
            Gio.AppInfo.launch_default_for_uri_async(downloadsUri, null, null, null);
        }
    }

    destroy() {
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }
        super.destroy();
    }
});

export default class YouTubeDownloaderExtension extends Extension {
    enable() {
        this._indicator = new YouTubeIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
