// Chat URL Navigator Extension
// Assigns URLs to individual chats and allows opening them in new tabs

const {
    eventSource,
    event_types,
    saveSettingsDebounced,
} = SillyTavern.getContext();

import { extension_settings } from "../../../extensions.js";

const extensionName = "SillyTavern-chat-url-navigator";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
    autoUpdateUrl: true,
    showCopyButton: true,
};

let isNavigatingFromUrl = false;

// Get current chat information
function getCurrentChatInfo() {
    const context = SillyTavern.getContext();
    const currentThisChid = context.characterId;
    const currentCharacters = context.characters;
    const currentSelectedGroup = context.groupId;
    const currentGroups = context.groups;

    if (currentSelectedGroup) {
        const group = currentGroups.find(x => x.id === currentSelectedGroup);
        if (group) {
            return {
                type: 'group',
                groupId: currentSelectedGroup,
                chatId: group.chat_id,
                name: group.name
            };
        }
    } else if (currentThisChid !== undefined && currentCharacters[currentThisChid]) {
        const char = currentCharacters[currentThisChid];
        return {
            type: 'character',
            avatar: char.avatar,
            chatId: char.chat,
            name: char.name
        };
    }

    return null;
}

// Generate URL hash for current chat
function generateChatUrl() {
    const chatInfo = getCurrentChatInfo();
    if (!chatInfo) return null;

    const baseUrl = window.location.origin + window.location.pathname;

    if (chatInfo.type === 'group') {
        const hash = `#/group/${encodeURIComponent(chatInfo.groupId)}/${encodeURIComponent(chatInfo.chatId)}`;
        return baseUrl + hash;
    } else {
        const hash = `#/char/${encodeURIComponent(chatInfo.avatar)}/${encodeURIComponent(chatInfo.chatId)}`;
        return baseUrl + hash;
    }
}

// Update browser URL to reflect current chat
function updateBrowserUrl() {
    if (!extension_settings[extensionName].autoUpdateUrl) return;
    if (isNavigatingFromUrl) return;

    const chatInfo = getCurrentChatInfo();
    if (!chatInfo) {
        // Clear hash if no chat is open
        if (window.location.hash) {
            window.history.pushState(null, '', window.location.pathname);
        }
        return;
    }

    let newHash;
    if (chatInfo.type === 'group') {
        newHash = `#/group/${encodeURIComponent(chatInfo.groupId)}/${encodeURIComponent(chatInfo.chatId)}`;
    } else {
        newHash = `#/char/${encodeURIComponent(chatInfo.avatar)}/${encodeURIComponent(chatInfo.chatId)}`;
    }

    if (window.location.hash !== newHash) {
        window.history.pushState(null, '', newHash);
    }
}

// Parse URL hash and extract chat information
function parseUrlHash() {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return null;

    // Remove leading '#/'
    const path = hash.startsWith('#/') ? hash.slice(2) : hash.slice(1);
    const parts = path.split('/');

    if (parts[0] === 'char' && parts.length >= 3) {
        return {
            type: 'character',
            avatar: decodeURIComponent(parts[1]),
            chatId: decodeURIComponent(parts[2])
        };
    } else if (parts[0] === 'group' && parts.length >= 3) {
        return {
            type: 'group',
            groupId: decodeURIComponent(parts[1]),
            chatId: decodeURIComponent(parts[2])
        };
    }

    return null;
}

// Navigate to a specific chat based on URL information
async function navigateToChat(urlInfo) {
    if (!urlInfo) return false;

    const context = SillyTavern.getContext();
    isNavigatingFromUrl = true;

    try {
        if (urlInfo.type === 'character') {
            // Find character by avatar
            const currentCharacters = context.characters;
            const charIndex = currentCharacters.findIndex(c => c.avatar === urlInfo.avatar);
            if (charIndex === -1) {
                toastr.error(`Character not found: ${urlInfo.avatar}`, 'Chat URL Navigator');
                return false;
            }

            // Check if we need to switch character
            if (context.characterId !== charIndex) {
                await context.setCharacterId(charIndex);
            }

            // Open specific chat
            if (urlInfo.chatId) {
                try {
                    await context.openCharacterChat(urlInfo.chatId);
                    toastr.success(`Opened chat: ${urlInfo.chatId}`, 'Chat URL Navigator');
                } catch (err) {
                    toastr.error(`Failed to open chat: ${urlInfo.chatId}`, 'Chat URL Navigator');
                    return false;
                }
            }
        } else if (urlInfo.type === 'group') {
            // Open group chat
            try {
                await context.openGroupChat(urlInfo.groupId, urlInfo.chatId);
                toastr.success(`Opened group chat`, 'Chat URL Navigator');
            } catch (err) {
                toastr.error(`Failed to open group chat`, 'Chat URL Navigator');
                return false;
            }
        }

        return true;
    } finally {
        // Reset flag after a short delay to allow chat change events to fire
        setTimeout(() => {
            isNavigatingFromUrl = false;
        }, 500);
    }
}

// Copy current chat URL to clipboard
async function copyCurrentChatUrl() {
    const url = generateChatUrl();
    if (!url) {
        toastr.warning('No chat is currently open', 'Chat URL Navigator');
        return;
    }

    try {
        await navigator.clipboard.writeText(url);
        toastr.success('Chat URL copied to clipboard', 'Chat URL Navigator');
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        toastr.success('Chat URL copied to clipboard', 'Chat URL Navigator');
    }
}

// Open current chat in a new tab
function openChatInNewTab() {
    const url = generateChatUrl();
    if (!url) {
        toastr.warning('No chat is currently open', 'Chat URL Navigator');
        return;
    }

    window.open(url, '_blank');
    toastr.info('Opening chat in new tab', 'Chat URL Navigator');
}

// Load extension settings
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    // Update UI elements
    $("#chat_url_nav_enabled").prop("checked", extension_settings[extensionName].enabled).trigger("input");
    $("#chat_url_nav_auto_update").prop("checked", extension_settings[extensionName].autoUpdateUrl).trigger("input");
    $("#chat_url_nav_show_button").prop("checked", extension_settings[extensionName].showCopyButton).trigger("input");

    updateCopyButtonVisibility();
}

// Update copy button visibility
function updateCopyButtonVisibility() {
    if (extension_settings[extensionName].showCopyButton) {
        $("#chat_url_copy_btn").show();
        $("#chat_url_newtab_btn").show();
    } else {
        $("#chat_url_copy_btn").hide();
        $("#chat_url_newtab_btn").hide();
    }
}

// Settings change handlers
function onEnabledChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();

    if (value) {
        updateBrowserUrl();
    }
}

function onAutoUpdateChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].autoUpdateUrl = value;
    saveSettingsDebounced();

    if (value) {
        updateBrowserUrl();
    }
}

function onShowButtonChange(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].showCopyButton = value;
    saveSettingsDebounced();
    updateCopyButtonVisibility();
}

// Create settings HTML
function createSettingsHtml() {
    return `
    <div class="chat-url-navigator-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Chat URL Navigator</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="chat_url_nav_block">
                    <label class="checkbox_label" for="chat_url_nav_enabled">
                        <input type="checkbox" id="chat_url_nav_enabled" />
                        <span>Enable Chat URL Navigator</span>
                    </label>
                    <label class="checkbox_label" for="chat_url_nav_auto_update">
                        <input type="checkbox" id="chat_url_nav_auto_update" />
                        <span>Auto-update URL on chat change</span>
                    </label>
                    <label class="checkbox_label" for="chat_url_nav_show_button">
                        <input type="checkbox" id="chat_url_nav_show_button" />
                        <span>Show copy/new tab buttons</span>
                    </label>
                    <div class="chat_url_nav_actions">
                        <button id="chat_url_copy_btn" class="menu_button">
                            <i class="fa-solid fa-copy"></i> Copy Chat URL
                        </button>
                        <button id="chat_url_newtab_btn" class="menu_button">
                            <i class="fa-solid fa-up-right-from-square"></i> Open in New Tab
                        </button>
                    </div>
                    <div class="chat_url_nav_info">
                        <small>Current URL will be updated when you switch chats. Share the URL to link directly to a specific conversation.</small>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// Add buttons to chat header
function addChatHeaderButtons() {
    // Check if buttons already exist
    if ($("#chat_url_header_copy").length > 0) return;

    const headerButtons = `
        <div id="chat_url_header_copy" class="fa-solid fa-link" title="Copy Chat URL"></div>
        <div id="chat_url_header_newtab" class="fa-solid fa-up-right-from-square" title="Open in New Tab"></div>
    `;

    // Add to chat header actions (adjust selector based on actual SillyTavern structure)
    const chatHeader = $("#chat_header_back_button").parent();
    if (chatHeader.length > 0) {
        chatHeader.append(headerButtons);

        $("#chat_url_header_copy").on("click", copyCurrentChatUrl);
        $("#chat_url_header_newtab").on("click", openChatInNewTab);
    }
}

// Initialize the extension
jQuery(async () => {
    // Add settings panel
    const settingsHtml = createSettingsHtml();
    $("#extensions_settings").append(settingsHtml);

    // Bind settings event handlers
    $("#chat_url_nav_enabled").on("input", onEnabledChange);
    $("#chat_url_nav_auto_update").on("input", onAutoUpdateChange);
    $("#chat_url_nav_show_button").on("input", onShowButtonChange);

    // Bind button event handlers
    $("#chat_url_copy_btn").on("click", copyCurrentChatUrl);
    $("#chat_url_newtab_btn").on("click", openChatInNewTab);

    // Load settings
    await loadSettings();

    // Add buttons to chat header
    addChatHeaderButtons();

    // Handle URL navigation on app ready
    eventSource.on(event_types.APP_READY, async () => {
        if (!extension_settings[extensionName].enabled) return;

        const urlInfo = parseUrlHash();
        if (urlInfo) {
            console.log('[Chat URL Navigator] Navigating to chat from URL:', urlInfo);
            await navigateToChat(urlInfo);
        } else {
            // Update URL for current chat if any
            updateBrowserUrl();
        }
    });

    // Update URL when chat changes
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (!extension_settings[extensionName].enabled) return;
        updateBrowserUrl();
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', async () => {
        if (!extension_settings[extensionName].enabled) return;

        const urlInfo = parseUrlHash();
        if (urlInfo) {
            await navigateToChat(urlInfo);
        }
    });

    // Handle hash change (for manual URL edits)
    window.addEventListener('hashchange', async () => {
        if (!extension_settings[extensionName].enabled) return;
        if (isNavigatingFromUrl) return;

        const urlInfo = parseUrlHash();
        if (urlInfo) {
            await navigateToChat(urlInfo);
        }
    });

    console.log('[Chat URL Navigator] Extension loaded');
});
