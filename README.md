# Chat URL Navigator

SillyTavern extension that assigns unique URLs to individual chats, allowing you to bookmark and share direct links to specific conversations.

## Features

- **URL-based Chat Navigation**: Each chat gets a unique URL with query parameters
- **Auto-update URLs**: Browser URL automatically updates when switching chats
- **Dynamic Browser Titles**: Browser tab title shows character name and chat timestamp
- **Message Navigation**: Jump to specific messages via URL parameter (`?msg=42`)
- **Copy Chat URL**: One-click button to copy the current chat's URL to clipboard
- **Open in New Tab**: Open the current chat in a new browser tab
- **Chat History Links**: Right-click on chat history items for native link menu (open in new tab, copy link)
- **Middle-click Support**: Middle-click chat history items to open them in a new tab
- **Browser History Support**: Use browser back/forward buttons to navigate between chats
- **Direct Link Sharing**: Share URLs that open specific chats directly
- **Configurable Settings**: Enable/disable features through the Extensions panel

## Installation

Use SillyTavern's built-in extension installer:

1. Open SillyTavern
2. Go to Extensions panel
3. Click "Install Extension"
4. Enter this repository URL: `https://github.com/mdat0/SillyTavern-chat-url-navigator`
5. Click "Save"
6. Reload the page

## Usage

Once installed, the extension works automatically:

1. **Auto URL Update**: When you open a chat, the browser URL will update to include the chat identifier
2. **Copy URL**: Click the "Copy Chat URL" button in the extension settings panel
3. **Open in New Tab**: Click "Open in New Tab" to duplicate the current chat in a new browser tab
4. **Chat History Panel**:
   - Right-click on any chat in the history list to see native link options (Open in New Tab, Copy Link Address)
   - Middle-click (wheel click) to directly open a chat in a new tab
   - Left-click works as normal (opens chat in current tab)
5. **Share Links**: Copy the URL from the address bar and share it - it will open the specific chat directly
6. **Browser Navigation**: Use browser back/forward buttons to navigate between previously viewed chats
7. **Settings**: Access extension settings in the Extensions panel to enable/disable features

## URL Format

URLs use query parameters for reliable navigation:

- Character chats: `http://localhost:8000/?nav=char&avatar={avatar}&cid={chatFileName}`
- Group chats: `http://localhost:8000/?nav=group&gid={groupId}&cid={chatId}`
- With message: Add `&msg={messageNumber}` to jump to a specific message

Example:
```
http://127.0.0.1:8000/?nav=char&avatar=MyCharacter.png&cid=MyCharacter%20-%202025-11-15%4010h30m00s&msg=42
```

### Browser Title Format

The browser tab title automatically updates to show:
- Character chats: `Alice - 2024-11-15@10h30m45s - SillyTavern`
- Group chats: `Party - chat_2024-11-15 - SillyTavern`
- No chat open: `SillyTavern`

## Settings

The extension provides the following configurable options:

- **Enable Chat URL Navigator**: Toggle the entire extension on/off
- **Auto-update URL on chat change**: Automatically update browser URL when switching chats
- **Show copy/new tab buttons**: Show or hide the action buttons in the settings panel

## Prerequisites

- SillyTavern 1.12.0 or later (requires event system and extension API)

## How It Works

1. When you open a chat, the extension captures the character/group information and chat file name
2. This information is encoded into URL query parameters
3. Browser title is updated to show character/group name and chat timestamp
4. When you paste a URL with these parameters, the extension parses them at page load
5. The extension then automatically navigates to the specified character and opens the correct chat
6. If a message number is specified, the page instantly scrolls to that message with a highlight effect
7. Browser history is maintained, allowing back/forward navigation

## Limitations

- URLs contain encoded chat filenames which can be long
- Sharing URLs requires the recipient to have access to the same characters/chats
- "Open in New Tab" uses localStorage for cross-tab communication (same browser only)

## Disclaimer

This extension is written by Claude except this comment and I don't understand how it works at all.

## License

MIT License
