// Chat URL Navigator Extension
// Assigns URLs to individual chats and allows opening them in new tabs

const { eventSource, event_types } = SillyTavern.getContext();

import { extension_settings } from "../../../extensions.js";
import { closeCurrentChat } from "../../../../script.js";

const extensionName = "SillyTavern-chat-url-navigator";

const CONSTANTS = {
  DEFAULT_TITLE: "SillyTavern",
  STORAGE_KEY_PREFIX: "chat_url_nav_",
  STORAGE_PENDING_KEY: "chat_url_navigator_pending",
  TIMEOUT_NAVIGATION_FLAG_RESET: 500,
  TIMEOUT_TITLE_UPDATE_DELAY: 600,
  TIMEOUT_RACE_CONDITION_WINDOW: 2000,
  TIMEOUT_PENDING_NAV_EXPIRY: 10000,
  SHORT_URL_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  TIMEOUT_OBSERVER_RETRY: 1000,
  TIMEOUT_DELAYED_URL_CHECK: 1000,
  HIGHLIGHT_DURATION: 2000,
  DEBOUNCE_URL_UPDATE: 300, // Debounce for URL updates to avoid rapid consecutive changes
};

const defaultSettings = {
  enabled: true,
};

let isNavigatingFromUrl = false;
let lastNavigationTime = 0;
let appReady = false;
let chatHistoryObserver = null;
let urlUpdateDebounceTimer = null;

// Store the original URL at load time (before it gets cleaned up)
const originalUrl = window.location.href;
const originalSearch = window.location.search;
console.log("[Chat URL Navigator] Original URL at load:", originalUrl);

// Remove file extension from filename
function removeFileExtension(filename) {
  return filename.replace(/\.[^/.]+$/, "");
}

// Remove .jsonl extension from chat ID
function removeChatExtension(chatId) {
  return chatId ? chatId.replace(/\.jsonl$/i, "") : "";
}

// Show error message to user
function showError(message) {
  console.error(`[Chat URL Navigator] ${message}`);
  if (typeof toastr !== "undefined") {
    toastr.error(message, "Chat URL Navigator");
  }
}

// Schedule document title update after navigation
function scheduleDocumentTitleUpdate(
  delay = CONSTANTS.TIMEOUT_TITLE_UPDATE_DELAY
) {
  setTimeout(() => {
    const chatInfo = getCurrentChatInfo();
    updateDocumentTitle(chatInfo);
  }, delay);
}

// Build URL for chat info
function buildChatUrl(chatInfo, baseUrl = window.location.pathname) {
  const cleanChatId = removeChatExtension(chatInfo.chatId);

  if (chatInfo.type === "group") {
    return `${baseUrl}?nav=group&gid=${encodeURIComponent(
      chatInfo.groupId
    )}&cid=${encodeURIComponent(cleanChatId)}`;
  } else {
    const cleanAvatar = removeFileExtension(chatInfo.avatar);
    return `${baseUrl}?nav=char&avatar=${encodeURIComponent(
      cleanAvatar
    )}&cid=${encodeURIComponent(cleanChatId)}`;
  }
}

// Create chat info object for current context and given filename
function createChatInfoForFile(fileName) {
  const context = SillyTavern.getContext();
  if (context.groupId) {
    return {
      type: "group",
      groupId: context.groupId,
      chatId: fileName,
    };
  } else if (
    context.characterId !== undefined &&
    context.characters[context.characterId]
  ) {
    const char = context.characters[context.characterId];
    return {
      type: "character",
      avatar: removeFileExtension(char.avatar),
      chatId: fileName,
    };
  }
  return null;
}

// Generate page title based on chat info
function generatePageTitle(chatInfo) {
  if (!chatInfo) {
    return CONSTANTS.DEFAULT_TITLE;
  }

  // For character chats, pass the name to remove it from the beginning of chatId
  const chatTitle = removeFileExtension(chatInfo.chatId);

  return `${chatTitle} - ${CONSTANTS.DEFAULT_TITLE}`;
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

  const messageElement = document.querySelector(
    `#chat .mes[mesid="${messageId}"]`
  );
  if (!messageElement) {
    console.log(`[Chat URL Navigator] Message ${messageId} not found`);
    return false;
  }

  // Scroll to the message instantly, aligned to top
  messageElement.scrollIntoView({ behavior: "instant", block: "start" });

  // Add highlight effect
  messageElement.classList.add("flash");
  setTimeout(() => {
    messageElement.classList.remove("flash");
  }, CONSTANTS.HIGHLIGHT_DURATION);

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
    const group = currentGroups.find((x) => x.id === currentSelectedGroup);
    if (group) {
      return {
        type: "group",
        groupId: currentSelectedGroup,
        chatId: group.chat_id,
        name: group.name,
      };
    }
  } else if (
    currentThisChid !== undefined &&
    currentCharacters[currentThisChid]
  ) {
    const char = currentCharacters[currentThisChid];
    return {
      type: "character",
      avatar: char.avatar,
      chatId: char.chat,
      name: char.name,
    };
  }

  return null;
}

// Update browser URL to reflect current chat
function updateBrowserUrl() {
  console.log(
    "[Chat URL Navigator] updateBrowserUrl called, isNavigatingFromUrl:",
    isNavigatingFromUrl,
    "appReady:",
    appReady
  );
  if (!extension_settings[extensionName].enabled) return;
  if (!appReady) {
    console.log("[Chat URL Navigator] Skipping - app not ready yet");
    return;
  }
  if (isNavigatingFromUrl) {
    console.log("[Chat URL Navigator] Skipping - isNavigatingFromUrl is true");
    return;
  }

  const chatInfo = getCurrentChatInfo();
  console.log("[Chat URL Navigator] chatInfo:", chatInfo);
  if (!chatInfo) {
    // Don't clear URL if we just navigated (avoid race condition)
    if (
      Date.now() - lastNavigationTime <
      CONSTANTS.TIMEOUT_RACE_CONDITION_WINDOW
    ) {
      console.log(
        "[Chat URL Navigator] Skipping URL clear - recent navigation"
      );
      return;
    }
    // Clear URL if no chat is open
    if (window.location.search || window.location.hash) {
      console.log("[Chat URL Navigator] Clearing URL to pathname");
      window.history.pushState(
        null,
        CONSTANTS.DEFAULT_TITLE,
        window.location.pathname
      );
      document.title = CONSTANTS.DEFAULT_TITLE;
    }
    return;
  }

  // Use query parameters for consistency (they survive server redirects)
  const newUrl = buildChatUrl(chatInfo);

  // Generate page title
  const pageTitle = generatePageTitle(chatInfo);

  // Check if URL needs updating
  const currentUrl = window.location.pathname + window.location.search;
  console.log(
    "[Chat URL Navigator] currentUrl:",
    currentUrl,
    "newUrl:",
    newUrl
  );
  if (currentUrl !== newUrl) {
    console.log(
      "[Chat URL Navigator] Updating URL to:",
      newUrl,
      "title:",
      pageTitle
    );
    window.history.pushState(null, pageTitle, newUrl);
  }

  // Always update document title (even if URL didn't change)
  updateDocumentTitle(chatInfo);
}

// Parse URL query parameters for chat navigation
function parseUrlQueryParams(useOriginal = false) {
  // Use original URL if specified (before it gets cleaned up)
  const searchString = useOriginal ? originalSearch : window.location.search;
  const params = new URLSearchParams(searchString);

  // Check for short URL first
  const chatlink = params.get("chatlink");
  if (chatlink) {
    const shortUrlData = localStorage.getItem(
      `${CONSTANTS.STORAGE_KEY_PREFIX}${chatlink}`
    );
    if (shortUrlData) {
      try {
        const data = JSON.parse(shortUrlData);
        // Check if not too old (7 days)
        if (Date.now() - data.timestamp < CONSTANTS.SHORT_URL_EXPIRY_MS) {
          return {
            type: data.chatInfo.type,
            avatar: data.chatInfo.avatar,
            chatId: data.chatInfo.chatId,
            groupId: data.chatInfo.groupId,
          };
        }
      } catch (err) {
        console.error(
          "[Chat URL Navigator] Error parsing short URL data:",
          err
        );
      }
    }
  }

  const navType = params.get("nav");

  if (!navType) return null;

  // Parse message ID if present
  const msgParam = params.get("msg");
  const messageId = msgParam ? parseInt(msgParam, 10) : null;

  if (navType === "char") {
    const avatar = params.get("avatar");
    const chatId = params.get("cid");
    if (avatar && chatId) {
      return {
        type: "character",
        avatar: avatar,
        chatId: chatId,
        messageId: messageId,
      };
    }
  } else if (navType === "group") {
    const groupId = params.get("gid");
    const chatId = params.get("cid");
    if (groupId && chatId) {
      return {
        type: "group",
        groupId: groupId,
        chatId: chatId,
        messageId: messageId,
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
    if (urlInfo.type === "character") {
      // Find character by avatar (compare without extension)
      const currentCharacters = context.characters;
      const charIndex = currentCharacters.findIndex(
        (c) => removeFileExtension(c.avatar) === urlInfo.avatar
      );
      if (charIndex === -1) {
        showError(`Character not found: ${urlInfo.avatar}`);
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
          const chatFileName = removeChatExtension(urlInfo.chatId);
          await context.openCharacterChat(chatFileName);
          console.log(`[Chat URL Navigator] Opened chat: ${chatFileName}`);
        } catch (err) {
          console.error("[Chat URL Navigator] Error opening chat:", err);
          showError(`Failed to open chat: ${urlInfo.chatId}`);
          return false;
        }
      }
    } else if (urlInfo.type === "group") {
      // Open group chat
      try {
        // Remove .jsonl extension if present
        const groupChatId = removeChatExtension(urlInfo.chatId);
        await context.openGroupChat(urlInfo.groupId, groupChatId);
        console.log(`[Chat URL Navigator] Opened group chat`);
      } catch (err) {
        console.error("[Chat URL Navigator] Error opening group chat:", err);
        showError(`Failed to open group chat`);
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
        }, CONSTANTS.TIMEOUT_NAVIGATION_FLAG_RESET);
      }
    }

    return true;
  } finally {
    // Reset flag after a short delay to allow chat change events to fire
    setTimeout(() => {
      isNavigatingFromUrl = false;
    }, CONSTANTS.TIMEOUT_NAVIGATION_FLAG_RESET);
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
  const chatInfo = createChatInfoForFile(fileName);
  if (!chatInfo) return null;

  const baseUrl = window.location.origin + window.location.pathname;
  return buildChatUrl(chatInfo, baseUrl);
}

// Add link overlay to a single chat history item
function addLinkToChatHistoryItem(wrapper) {
  // Skip if already processed
  if (wrapper.querySelector(".chat-url-nav-link")) return;

  const selectChatBlock = wrapper.querySelector(".select_chat_block");
  if (!selectChatBlock) return;

  const fileName = selectChatBlock.getAttribute("file_name");
  if (!fileName) return;

  const url = generateChatHistoryItemUrl(fileName);
  if (!url) return;

  // Create transparent link overlay
  const link = document.createElement("a");
  link.href = url;
  link.className = "chat-url-nav-link";
  link.setAttribute("data-chat-filename", fileName);

  // Prevent left-click navigation, simulate click on underlying element
  link.addEventListener("click", (e) => {
    e.preventDefault();
    // Temporarily hide link, click through to underlying element
    link.style.pointerEvents = "none";
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    link.style.pointerEvents = "auto";
    if (elementBelow && elementBelow !== link) {
      elementBelow.click();
    }
  });

  // Handle middle-click to open in new tab
  link.addEventListener("auxclick", (e) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      // Trigger our middle-click handler
      handleChatHistoryMiddleClick(e);
    }
  });

  // Make wrapper position relative for absolute positioning of link
  wrapper.style.position = "relative";

  wrapper.appendChild(link);
}

// Process all chat history items in the panel
function processChatHistoryItems() {
  const chatItems = document.querySelectorAll(
    "#select_chat_div .select_chat_block_wrapper"
  );
  chatItems.forEach((wrapper) => {
    addLinkToChatHistoryItem(wrapper);
  });
}

// Handle middle-click on chat history items to open in new tab
function handleChatHistoryMiddleClick(event) {
  // Check if it's a middle click (button === 1)
  if (event.button !== 1) return;

  const wrapper = event.target.closest(".select_chat_block_wrapper");
  if (!wrapper) return;

  const selectChatBlock = wrapper.querySelector(".select_chat_block");
  if (!selectChatBlock) return;

  const fileName = selectChatBlock.getAttribute("file_name");
  if (!fileName) return;

  // Prevent default middle-click behavior
  event.preventDefault();
  event.stopPropagation();

  // Prepare chat info for new tab
  // Note: fileName from file_name attribute does NOT include .jsonl extension
  const chatInfo = createChatInfoForFile(fileName);
  if (!chatInfo) return;

  // Store chat info in localStorage for the new tab
  const pendingNavigation = {
    timestamp: Date.now(),
    chatInfo: chatInfo,
  };
  localStorage.setItem(
    CONSTANTS.STORAGE_PENDING_KEY,
    JSON.stringify(pendingNavigation)
  );

  // Open new tab
  const baseUrl = window.location.origin + window.location.pathname;
  window.open(baseUrl, "_blank");

  console.log(`[Chat URL Navigator] Opening chat in new tab: ${fileName}`);
}

// Setup observer for chat history panel
function setupChatHistoryObserver() {
  const selectChatDiv = document.getElementById("select_chat_div");
  if (!selectChatDiv) {
    console.log(
      "[Chat URL Navigator] Chat history container not found, retrying..."
    );
    setTimeout(setupChatHistoryObserver, CONSTANTS.TIMEOUT_OBSERVER_RETRY);
    return;
  }

  // Process existing items
  processChatHistoryItems();

  // Observe for new items being added
  chatHistoryObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        // Process newly added chat items
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.classList &&
              node.classList.contains("select_chat_block_wrapper")
            ) {
              addLinkToChatHistoryItem(node);
            } else {
              // Check for nested wrappers
              const wrappers = node.querySelectorAll
                ? node.querySelectorAll(".select_chat_block_wrapper")
                : [];
              wrappers.forEach((wrapper) => addLinkToChatHistoryItem(wrapper));
            }
          }
        });
      }
    }
  });

  chatHistoryObserver.observe(selectChatDiv, {
    childList: true,
    subtree: true,
  });

  // Prevent default middle-click scroll behavior
  selectChatDiv.addEventListener("mousedown", (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  console.log("[Chat URL Navigator] Chat history observer setup complete");
}

// Handle pending navigation from localStorage (Open in New Tab)
async function handlePendingNavigation() {
  const pendingNavStr = localStorage.getItem(CONSTANTS.STORAGE_PENDING_KEY);
  if (!pendingNavStr) return false;

  try {
    const pendingNav = JSON.parse(pendingNavStr);
    // Only use if less than 10 seconds old
    if (
      Date.now() - pendingNav.timestamp <
      CONSTANTS.TIMEOUT_PENDING_NAV_EXPIRY
    ) {
      console.log(
        "[Chat URL Navigator] Found pending navigation:",
        pendingNav.chatInfo
      );
      localStorage.removeItem(CONSTANTS.STORAGE_PENDING_KEY);

      const urlInfo = {
        type: pendingNav.chatInfo.type,
        avatar: pendingNav.chatInfo.avatar,
        chatId: pendingNav.chatInfo.chatId,
        groupId: pendingNav.chatInfo.groupId,
      };
      await navigateToChat(urlInfo);
      // Update URL to reflect the opened chat (wait for flag to reset)
      setTimeout(() => {
        updateBrowserUrl();
      }, CONSTANTS.TIMEOUT_TITLE_UPDATE_DELAY);
      return true;
    } else {
      // Too old, remove it
      localStorage.removeItem(CONSTANTS.STORAGE_PENDING_KEY);
    }
  } catch (err) {
    console.error(
      "[Chat URL Navigator] Error parsing pending navigation:",
      err
    );
    localStorage.removeItem(CONSTANTS.STORAGE_PENDING_KEY);
  }
  return false;
}

// Handle URL-based navigation (query params or hash)
async function handleUrlNavigation() {
  // Check query parameters first (more reliable than hash)
  // Use original URL in case current URL has been cleaned up
  let urlInfo = parseUrlQueryParams(true);
  if (urlInfo) {
    console.log(
      "[Chat URL Navigator] URL info from original query params:",
      urlInfo
    );
    await navigateToChat(urlInfo);
    scheduleDocumentTitleUpdate();
    return true;
  }

  // Also check current URL (in case it wasn't cleaned up)
  urlInfo = parseUrlQueryParams(false);
  if (urlInfo) {
    console.log(
      "[Chat URL Navigator] URL info from current query params:",
      urlInfo
    );
    await navigateToChat(urlInfo);
    scheduleDocumentTitleUpdate();
    return true;
  }

  return false;
}

// Main APP_READY handler
async function onAppReady() {
  console.log("[Chat URL Navigator] APP_READY event fired");
  console.log("[Chat URL Navigator] Current URL:", window.location.href);
  appReady = true;

  if (!extension_settings[extensionName].enabled) return;

  // First check localStorage for pending navigation (from "Open in New Tab")
  if (await handlePendingNavigation()) return;

  // Handle URL-based navigation
  await handleUrlNavigation();
  // Don't call updateBrowserUrl() here - it would clear query params before they're processed
  // URL will be updated on CHAT_CHANGED event instead
}

// Handle popstate event (browser back/forward)
async function handlePopstate() {
  console.log("[Chat URL Navigator] popstate event fired");
  console.log("[Chat URL Navigator] Current URL after popstate:", window.location.href);
  if (!extension_settings[extensionName].enabled) return;

  const urlInfo = parseUrlQueryParams();
  console.log("[Chat URL Navigator] URL info on popstate:", urlInfo);
  if (urlInfo) {
    const success = await navigateToChat(urlInfo);
    console.log("[Chat URL Navigator] Navigation result:", success);
    scheduleDocumentTitleUpdate();
  } else {
    // No chat info in URL, go back to home/hub page
    console.log("[Chat URL Navigator] No chat info in URL, returning to home page");
    document.title = CONSTANTS.DEFAULT_TITLE;

    // Close current chat and return to welcome screen
    const context = SillyTavern.getContext();
    if (context.groupId || context.characterId !== undefined) {
      try {
        await closeCurrentChat();
        console.log("[Chat URL Navigator] Closed chat and returned to home");
      } catch (err) {
        console.log("[Chat URL Navigator] closeCurrentChat failed:", err);
      }
    }
  }
}

// Handle chat changed event with debouncing
function handleChatChanged() {
  if (!extension_settings[extensionName].enabled) return;
  console.log("[Chat URL Navigator] CHAT_CHANGED event fired");

  // Debounce URL updates to handle rapid consecutive chat changes
  // (e.g., when SillyTavern restores previous chat before switching to selected one)
  if (urlUpdateDebounceTimer) {
    clearTimeout(urlUpdateDebounceTimer);
  }

  urlUpdateDebounceTimer = setTimeout(() => {
    urlUpdateDebounceTimer = null;
    updateBrowserUrl();
  }, CONSTANTS.DEBOUNCE_URL_UPDATE);
}

// Setup all event listeners
function setupEventListeners() {
  eventSource.on(event_types.APP_READY, onAppReady);
  eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
  window.addEventListener("popstate", handlePopstate);
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

  // Setup all event listeners
  setupEventListeners();

  console.log("[Chat URL Navigator] Extension loaded");
});
