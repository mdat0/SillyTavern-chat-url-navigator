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
let lastNavigationTime = 0;
let appReady = false;

// Store the original URL at load time (before it gets cleaned up)
const originalUrl = window.location.href;
const originalSearch = window.location.search;
const originalHash = window.location.hash;
console.log('[Chat URL Navigator] Original URL at load:', originalUrl);

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

    // Use query parameters instead of hash (hash gets lost on server redirect)
    if (chatInfo.type === 'group') {
        const params = `?nav=group&gid=${encodeURIComponent(chatInfo.groupId)}&cid=${encodeURIComponent(chatInfo.chatId)}`;
        return baseUrl + params;
    } else {
        const params = `?nav=char&avatar=${encodeURIComponent(chatInfo.avatar)}&cid=${encodeURIComponent(chatInfo.chatId)}`;
        return baseUrl + params;
    }
}

// Generate a short URL using localStorage
function generateShortUrl() {
    const chatInfo = getCurrentChatInfo();
    if (!chatInfo) return null;

    const shortId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const shortUrlData = {
        timestamp: Date.now(),
        chatInfo: chatInfo
    };

    // Store in localStorage with the short ID
    localStorage.setItem(`chat_url_nav_${shortId}`, JSON.stringify(shortUrlData));

    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?chatlink=${shortId}`;
}

// Update browser URL to reflect current chat
function updateBrowserUrl() {
    console.log('[Chat URL Navigator] updateBrowserUrl called, isNavigatingFromUrl:', isNavigatingFromUrl, 'appReady:', appReady);
    if (!extension_settings[extensionName].autoUpdateUrl) return;
    if (!appReady) {
        console.log('[Chat URL Navigator] Skipping - app not ready yet');
        return;
    }
    if (isNavigatingFromUrl) {
        console.log('[Chat URL Navigator] Skipping - isNavigatingFromUrl is true');
        return;
    }

    const chatInfo = getCurrentChatInfo();
    console.log('[Chat URL Navigator] chatInfo:', chatInfo);
    if (!chatInfo) {
        // Don't clear URL if we just navigated (avoid race condition)
        if (Date.now() - lastNavigationTime < 2000) {
            console.log('[Chat URL Navigator] Skipping URL clear - recent navigation');
            return;
        }
        // Clear URL if no chat is open
        if (window.location.search || window.location.hash) {
            console.log('[Chat URL Navigator] Clearing URL to pathname');
            window.history.pushState(null, '', window.location.pathname);
        }
        return;
    }

    // Use query parameters for consistency (they survive server redirects)
    let newUrl;
    if (chatInfo.type === 'group') {
        newUrl = `${window.location.pathname}?nav=group&gid=${encodeURIComponent(chatInfo.groupId)}&cid=${encodeURIComponent(chatInfo.chatId)}`;
    } else {
        newUrl = `${window.location.pathname}?nav=char&avatar=${encodeURIComponent(chatInfo.avatar)}&cid=${encodeURIComponent(chatInfo.chatId)}`;
    }

    // Check if URL needs updating
    const currentUrl = window.location.pathname + window.location.search;
    console.log('[Chat URL Navigator] currentUrl:', currentUrl, 'newUrl:', newUrl);
    if (currentUrl !== newUrl) {
        console.log('[Chat URL Navigator] Updating URL to:', newUrl);
        window.history.pushState(null, '', newUrl);
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

// Parse URL query parameters for chat navigation
function parseUrlQueryParams(useOriginal = false) {
    // Use original URL if specified (before it gets cleaned up)
    const searchString = useOriginal ? originalSearch : window.location.search;
    const params = new URLSearchParams(searchString);

    // Check for short URL first
    const chatlink = params.get('chatlink');
    if (chatlink) {
        const shortUrlData = localStorage.getItem(`chat_url_nav_${chatlink}`);
        if (shortUrlData) {
            try {
                const data = JSON.parse(shortUrlData);
                // Check if not too old (7 days)
                if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
                    return {
                        type: data.chatInfo.type,
                        avatar: data.chatInfo.avatar,
                        chatId: data.chatInfo.chatId,
                        groupId: data.chatInfo.groupId
                    };
                }
            } catch (err) {
                console.error('[Chat URL Navigator] Error parsing short URL data:', err);
            }
        }
    }

    const navType = params.get('nav');

    if (!navType) return null;

    if (navType === 'char') {
        const avatar = params.get('avatar');
        const chatId = params.get('cid');
        if (avatar && chatId) {
            return {
                type: 'character',
                avatar: avatar,
                chatId: chatId
            };
        }
    } else if (navType === 'group') {
        const groupId = params.get('gid');
        const chatId = params.get('cid');
        if (groupId && chatId) {
            return {
                type: 'group',
                groupId: groupId,
                chatId: chatId
            };
        }
    }

    return null;
}

// Navigate to a specific chat based on URL information
async function navigateToChat(urlInfo) {
    if (!urlInfo) return false;

    const context = SillyTavern.getContext();
    isNavigatingFromUrl = true;
    lastNavigationTime = Date.now();

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
                // Use selectCharacterById instead of setCharacterId
                await context.selectCharacterById(String(charIndex));
            }

            // Open specific chat
            if (urlInfo.chatId) {
                try {
                    await context.openCharacterChat(urlInfo.chatId);
                    toastr.success(`Opened chat: ${urlInfo.chatId}`, 'Chat URL Navigator');
                } catch (err) {
                    console.error('[Chat URL Navigator] Error opening chat:', err);
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
                console.error('[Chat URL Navigator] Error opening group chat:', err);
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
    const chatInfo = getCurrentChatInfo();
    if (!chatInfo) {
        toastr.warning('No chat is currently open', 'Chat URL Navigator');
        return;
    }

    // Store chat info in localStorage for the new tab to pick up
    const pendingNavigation = {
        timestamp: Date.now(),
        chatInfo: chatInfo
    };
    localStorage.setItem('chat_url_navigator_pending', JSON.stringify(pendingNavigation));

    // Open new tab - it will check localStorage on load
    const baseUrl = window.location.origin + window.location.pathname;
    window.open(baseUrl, '_blank');
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
        console.log('[Chat URL Navigator] APP_READY event fired');
        console.log('[Chat URL Navigator] Current URL:', window.location.href);
        console.log('[Chat URL Navigator] Current hash:', window.location.hash);
        appReady = true;
        if (!extension_settings[extensionName].enabled) return;

        // First check localStorage for pending navigation (from "Open in New Tab")
        const pendingNavStr = localStorage.getItem('chat_url_navigator_pending');
        if (pendingNavStr) {
            try {
                const pendingNav = JSON.parse(pendingNavStr);
                // Only use if less than 10 seconds old
                if (Date.now() - pendingNav.timestamp < 10000) {
                    console.log('[Chat URL Navigator] Found pending navigation:', pendingNav.chatInfo);
                    localStorage.removeItem('chat_url_navigator_pending');

                    const urlInfo = {
                        type: pendingNav.chatInfo.type,
                        avatar: pendingNav.chatInfo.avatar,
                        chatId: pendingNav.chatInfo.chatId,
                        groupId: pendingNav.chatInfo.groupId
                    };
                    await navigateToChat(urlInfo);
                    // Update URL to reflect the opened chat (wait for flag to reset)
                    setTimeout(() => {
                        updateBrowserUrl();
                    }, 600);
                    return;
                } else {
                    // Too old, remove it
                    localStorage.removeItem('chat_url_navigator_pending');
                }
            } catch (err) {
                console.error('[Chat URL Navigator] Error parsing pending navigation:', err);
                localStorage.removeItem('chat_url_navigator_pending');
            }
        }

        // Check query parameters first (more reliable than hash)
        // Use original URL in case current URL has been cleaned up
        let urlInfo = parseUrlQueryParams(true);
        if (urlInfo) {
            console.log('[Chat URL Navigator] URL info from original query params:', urlInfo);
            await navigateToChat(urlInfo);
            // Keep the URL as-is (don't clean up) so it can be shared
            return;
        }

        // Also check current URL (in case it wasn't cleaned up)
        urlInfo = parseUrlQueryParams(false);
        if (urlInfo) {
            console.log('[Chat URL Navigator] URL info from current query params:', urlInfo);
            await navigateToChat(urlInfo);
            return;
        }

        // Fall back to hash-based routing
        urlInfo = parseUrlHash();
        console.log('[Chat URL Navigator] URL info on APP_READY:', urlInfo);
        if (urlInfo) {
            console.log('[Chat URL Navigator] Navigating to chat from URL:', urlInfo);
            await navigateToChat(urlInfo);
        }
        // Don't call updateBrowserUrl() here - it would clear query params before they're processed
        // URL will be updated on CHAT_CHANGED event instead
    });

    // Also check URL immediately in case APP_READY already fired
    setTimeout(async () => {
        console.log('[Chat URL Navigator] Delayed URL check');
        console.log('[Chat URL Navigator] Current URL (delayed):', window.location.href);
        console.log('[Chat URL Navigator] Current hash (delayed):', window.location.hash);
        if (!extension_settings[extensionName].enabled) return;

        const urlInfo = parseUrlHash();
        if (urlInfo) {
            console.log('[Chat URL Navigator] Attempting delayed navigation:', urlInfo);
            await navigateToChat(urlInfo);
        }
    }, 1000);

    // Update URL when chat changes
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (!extension_settings[extensionName].enabled) return;
        console.log('[Chat URL Navigator] CHAT_CHANGED event fired');
        updateBrowserUrl();
    });

    // Handle browser back/forward navigation
    window.addEventListener('popstate', async () => {
        console.log('[Chat URL Navigator] popstate event fired');
        if (!extension_settings[extensionName].enabled) return;

        // Check query parameters first (new format)
        let urlInfo = parseUrlQueryParams();
        if (!urlInfo) {
            // Fall back to hash-based routing (old format for compatibility)
            urlInfo = parseUrlHash();
        }
        console.log('[Chat URL Navigator] URL info on popstate:', urlInfo);
        if (urlInfo) {
            await navigateToChat(urlInfo);
        }
    });

    // Handle hash change (for manual URL edits)
    window.addEventListener('hashchange', async () => {
        console.log('[Chat URL Navigator] hashchange event fired');
        if (!extension_settings[extensionName].enabled) return;
        if (isNavigatingFromUrl) return;

        const urlInfo = parseUrlHash();
        if (urlInfo) {
            await navigateToChat(urlInfo);
        }
    });

    console.log('[Chat URL Navigator] Extension loaded');
});
