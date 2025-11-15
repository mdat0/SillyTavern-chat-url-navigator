// Chat URL Navigator Extension
// Assigns URLs to individual chats and allows opening them in new tabs

const {
    eventSource,
    event_types,
} = SillyTavern.getContext();

import { extension_settings } from "../../../extensions.js";

const extensionName = "SillyTavern-chat-url-navigator";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: true,
};

let isNavigatingFromUrl = false;
let lastNavigationTime = 0;
let appReady = false;
let chatHistoryObserver = null;

// Store the original URL at load time (before it gets cleaned up)
const originalUrl = window.location.href;
const originalSearch = window.location.search;
const originalHash = window.location.hash;
console.log('[Chat URL Navigator] Original URL at load:', originalUrl);

// Extract readable chat title from chatId
function extractChatTitle(chatId, charName) {
    if (!chatId) return '';

    // Remove file extension (.jsonl)
    let title = chatId.replace(/\.jsonl$/i, '');

    // If character name is provided, remove it from the beginning
    // "Alice - The user edited title - 2024-11-15@10h30m45s" -> "The user edited title - 2024-11-15@10h30m45s"
    if (charName && title.startsWith(charName + ' - ')) {
        title = title.substring(charName.length + 3); // +3 for " - "
    }

    return title;
}

// Generate page title based on chat info
function generatePageTitle(chatInfo) {
    if (!chatInfo) {
        return 'SillyTavern';
    }

    // For character chats, pass the name to remove it from the beginning of chatId
    const chatTitle = chatInfo.type === 'character'
        ? extractChatTitle(chatInfo.chatId, chatInfo.name)
        : extractChatTitle(chatInfo.chatId);

    if (chatInfo.type === 'group') {
        return chatTitle
            ? `${chatInfo.name} - ${chatTitle} - SillyTavern`
            : `${chatInfo.name} (Group) - SillyTavern`;
    } else {
        return chatTitle
            ? `${chatInfo.name} - ${chatTitle} - SillyTavern`
            : `${chatInfo.name} - SillyTavern`;
    }
}

// Update document title
function updateDocumentTitle(chatInfo) {
    const newTitle = generatePageTitle(chatInfo);
    if (document.title !== newTitle) {
        document.title = newTitle;
    }
}

// Scroll to a specific message by its ID
function scrollToMessage(messageId) {
    if (messageId === null || messageId === undefined) return false;

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) {
        console.log(`[Chat URL Navigator] Message ${messageId} not found`);
        return false;
    }

    // Scroll to the message instantly, aligned to top
    messageElement.scrollIntoView({ behavior: 'instant', block: 'start' });

    // Add highlight effect
    messageElement.classList.add('flash');
    setTimeout(() => {
        messageElement.classList.remove('flash');
    }, 2000);

    console.log(`[Chat URL Navigator] Scrolled to message ${messageId}`);
    return true;
}

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
    if (!extension_settings[extensionName].enabled) return;
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
            const defaultTitle = 'SillyTavern';
            window.history.pushState(null, defaultTitle, window.location.pathname);
            document.title = defaultTitle;
        }
        return;
    }

    // Use query parameters for consistency (they survive server redirects)
    // Remove .jsonl extension from chatId for cleaner URLs
    const cleanChatId = chatInfo.chatId.replace(/\.jsonl$/i, '');
    let newUrl;
    if (chatInfo.type === 'group') {
        newUrl = `${window.location.pathname}?nav=group&gid=${encodeURIComponent(chatInfo.groupId)}&cid=${encodeURIComponent(cleanChatId)}`;
    } else {
        newUrl = `${window.location.pathname}?nav=char&avatar=${encodeURIComponent(chatInfo.avatar)}&cid=${encodeURIComponent(cleanChatId)}`;
    }

    // Generate page title
    const pageTitle = generatePageTitle(chatInfo);

    // Check if URL needs updating
    const currentUrl = window.location.pathname + window.location.search;
    console.log('[Chat URL Navigator] currentUrl:', currentUrl, 'newUrl:', newUrl);
    if (currentUrl !== newUrl) {
        console.log('[Chat URL Navigator] Updating URL to:', newUrl, 'title:', pageTitle);
        window.history.pushState(null, pageTitle, newUrl);
    }

    // Always update document title (even if URL didn't change)
    updateDocumentTitle(chatInfo);
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

    // Parse message ID if present
    const msgParam = params.get('msg');
    const messageId = msgParam ? parseInt(msgParam, 10) : null;

    if (navType === 'char') {
        const avatar = params.get('avatar');
        const chatId = params.get('cid');
        if (avatar && chatId) {
            return {
                type: 'character',
                avatar: avatar,
                chatId: chatId,
                messageId: messageId
            };
        }
    } else if (navType === 'group') {
        const groupId = params.get('gid');
        const chatId = params.get('cid');
        if (groupId && chatId) {
            return {
                type: 'group',
                groupId: groupId,
                chatId: chatId,
                messageId: messageId
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
                    // Remove .jsonl extension if present (openCharacterChat expects filename without extension)
                    const chatFileName = urlInfo.chatId.replace(/\.jsonl$/i, '');
                    await context.openCharacterChat(chatFileName);
                    console.log(`[Chat URL Navigator] Opened chat: ${chatFileName}`);
                } catch (err) {
                    console.error('[Chat URL Navigator] Error opening chat:', err);
                    toastr.error(`Failed to open chat: ${urlInfo.chatId}`, 'Chat URL Navigator');
                    return false;
                }
            }
        } else if (urlInfo.type === 'group') {
            // Open group chat
            try {
                // Remove .jsonl extension if present
                const groupChatId = urlInfo.chatId.replace(/\.jsonl$/i, '');
                await context.openGroupChat(urlInfo.groupId, groupChatId);
                console.log(`[Chat URL Navigator] Opened group chat`);
            } catch (err) {
                console.error('[Chat URL Navigator] Error opening group chat:', err);
                toastr.error(`Failed to open group chat`, 'Chat URL Navigator');
                return false;
            }
        }

        // Scroll to specific message if specified
        if (urlInfo.messageId !== null && urlInfo.messageId !== undefined) {
            // Try to scroll immediately, retry if message not found yet
            if (!scrollToMessage(urlInfo.messageId)) {
                // Retry after a short delay if message wasn't found
                setTimeout(() => {
                    scrollToMessage(urlInfo.messageId);
                }, 500);
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

// Load extension settings
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
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
                    <div class="chat_url_nav_info">
                        <small>Browser URL and title automatically update when switching chats. Right-click chat history items for link options.</small>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// Generate URL for a specific chat item in the history panel
function generateChatHistoryItemUrl(fileName) {
    const context = SillyTavern.getContext();
    const baseUrl = window.location.origin + window.location.pathname;
    // Remove .jsonl extension from fileName for cleaner URLs
    const cleanFileName = fileName.replace(/\.jsonl$/i, '');

    if (context.groupId) {
        // Group chat
        const params = `?nav=group&gid=${encodeURIComponent(context.groupId)}&cid=${encodeURIComponent(cleanFileName)}`;
        return baseUrl + params;
    } else if (context.characterId !== undefined && context.characters[context.characterId]) {
        // Character chat
        const char = context.characters[context.characterId];
        const params = `?nav=char&avatar=${encodeURIComponent(char.avatar)}&cid=${encodeURIComponent(cleanFileName)}`;
        return baseUrl + params;
    }

    return null;
}

// Add link overlay to a single chat history item
function addLinkToChatHistoryItem(wrapper) {
    // Skip if already processed
    if (wrapper.querySelector('.chat-url-nav-link')) return;

    const selectChatBlock = wrapper.querySelector('.select_chat_block');
    if (!selectChatBlock) return;

    const fileName = selectChatBlock.getAttribute('file_name');
    if (!fileName) return;

    const url = generateChatHistoryItemUrl(fileName);
    if (!url) return;

    // Create transparent link overlay
    const link = document.createElement('a');
    link.href = url;
    link.className = 'chat-url-nav-link';
    link.setAttribute('data-chat-filename', fileName);

    // Prevent left-click navigation, simulate click on underlying element
    link.addEventListener('click', (e) => {
        e.preventDefault();
        // Temporarily hide link, click through to underlying element
        link.style.pointerEvents = 'none';
        const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
        link.style.pointerEvents = 'auto';
        if (elementBelow && elementBelow !== link) {
            elementBelow.click();
        }
    });

    // Handle middle-click to open in new tab
    link.addEventListener('auxclick', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            // Trigger our middle-click handler
            handleChatHistoryMiddleClick(e);
        }
    });

    // Make wrapper position relative for absolute positioning of link
    wrapper.style.position = 'relative';

    wrapper.appendChild(link);
}

// Process all chat history items in the panel
function processChatHistoryItems() {
    const chatItems = document.querySelectorAll('#select_chat_div .select_chat_block_wrapper');
    chatItems.forEach(wrapper => {
        addLinkToChatHistoryItem(wrapper);
    });
}

// Handle middle-click on chat history items to open in new tab
function handleChatHistoryMiddleClick(event) {
    // Check if it's a middle click (button === 1)
    if (event.button !== 1) return;

    const wrapper = event.target.closest('.select_chat_block_wrapper');
    if (!wrapper) return;

    const selectChatBlock = wrapper.querySelector('.select_chat_block');
    if (!selectChatBlock) return;

    const fileName = selectChatBlock.getAttribute('file_name');
    if (!fileName) return;

    // Prevent default middle-click behavior
    event.preventDefault();
    event.stopPropagation();

    // Get current context to determine chat type
    const context = SillyTavern.getContext();

    // Prepare chat info for new tab
    // Note: fileName from file_name attribute does NOT include .jsonl extension
    let chatInfo;
    if (context.groupId) {
        chatInfo = {
            type: 'group',
            groupId: context.groupId,
            chatId: fileName
        };
    } else if (context.characterId !== undefined && context.characters[context.characterId]) {
        const char = context.characters[context.characterId];
        chatInfo = {
            type: 'character',
            avatar: char.avatar,
            chatId: fileName
        };
    } else {
        return;
    }

    // Store chat info in localStorage for the new tab
    const pendingNavigation = {
        timestamp: Date.now(),
        chatInfo: chatInfo
    };
    localStorage.setItem('chat_url_navigator_pending', JSON.stringify(pendingNavigation));

    // Open new tab
    const baseUrl = window.location.origin + window.location.pathname;
    window.open(baseUrl, '_blank');

    console.log(`[Chat URL Navigator] Opening chat in new tab: ${fileName}`);
}

// Setup observer for chat history panel
function setupChatHistoryObserver() {
    const selectChatDiv = document.getElementById('select_chat_div');
    if (!selectChatDiv) {
        console.log('[Chat URL Navigator] Chat history container not found, retrying...');
        setTimeout(setupChatHistoryObserver, 1000);
        return;
    }

    // Process existing items
    processChatHistoryItems();

    // Observe for new items being added
    chatHistoryObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Process newly added chat items
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList && node.classList.contains('select_chat_block_wrapper')) {
                            addLinkToChatHistoryItem(node);
                        } else {
                            // Check for nested wrappers
                            const wrappers = node.querySelectorAll ? node.querySelectorAll('.select_chat_block_wrapper') : [];
                            wrappers.forEach(wrapper => addLinkToChatHistoryItem(wrapper));
                        }
                    }
                });
            }
        }
    });

    chatHistoryObserver.observe(selectChatDiv, {
        childList: true,
        subtree: true
    });

    // Prevent default middle-click scroll behavior
    selectChatDiv.addEventListener('mousedown', (event) => {
        if (event.button === 1) {
            event.preventDefault();
        }
    });

    console.log('[Chat URL Navigator] Chat history observer setup complete');
}

// Initialize the extension
jQuery(async () => {
    // Add settings panel
    const settingsHtml = createSettingsHtml();
    $("#extensions_settings").append(settingsHtml);

    // Load settings
    await loadSettings();

    // Setup chat history observer
    setupChatHistoryObserver();

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
            // Update title after navigation completes
            setTimeout(() => {
                const chatInfo = getCurrentChatInfo();
                updateDocumentTitle(chatInfo);
            }, 600);
            // Keep the URL as-is (don't clean up) so it can be shared
            return;
        }

        // Also check current URL (in case it wasn't cleaned up)
        urlInfo = parseUrlQueryParams(false);
        if (urlInfo) {
            console.log('[Chat URL Navigator] URL info from current query params:', urlInfo);
            await navigateToChat(urlInfo);
            // Update title after navigation completes
            setTimeout(() => {
                const chatInfo = getCurrentChatInfo();
                updateDocumentTitle(chatInfo);
            }, 600);
            return;
        }

        // Fall back to hash-based routing
        urlInfo = parseUrlHash();
        console.log('[Chat URL Navigator] URL info on APP_READY:', urlInfo);
        if (urlInfo) {
            console.log('[Chat URL Navigator] Navigating to chat from URL:', urlInfo);
            await navigateToChat(urlInfo);
            // Update title after navigation completes
            setTimeout(() => {
                const chatInfo = getCurrentChatInfo();
                updateDocumentTitle(chatInfo);
            }, 600);
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
            // Update title after navigation completes
            setTimeout(() => {
                const chatInfo = getCurrentChatInfo();
                updateDocumentTitle(chatInfo);
            }, 600);
        } else {
            // No chat info in URL, reset title
            document.title = 'SillyTavern';
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
