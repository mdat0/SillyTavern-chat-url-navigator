# Chat URL Navigator

SillyTavern extension that assigns unique URLs to individual chats, allowing you to bookmark and share direct links to specific conversations.

## Features

- **URL-based Chat Navigation**: Each chat gets a unique URL with query parameters
- **Auto-update URLs**: Browser URL automatically updates when switching chats
- **Copy Chat URL**: One-click button to copy the current chat's URL to clipboard
- **Open in New Tab**: Open the current chat in a new browser tab
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
4. **Share Links**: Copy the URL from the address bar and share it - it will open the specific chat directly
5. **Browser Navigation**: Use browser back/forward buttons to navigate between previously viewed chats
6. **Settings**: Access extension settings in the Extensions panel to enable/disable features

## URL Format

URLs use query parameters for reliable navigation:

- Character chats: `http://localhost:8000/?nav=char&avatar={avatar}&cid={chatFileName}`
- Group chats: `http://localhost:8000/?nav=group&gid={groupId}&cid={chatId}`

Example:
```
http://127.0.0.1:8000/?nav=char&avatar=MyCharacter.png&cid=MyCharacter%20-%202025-11-15%4010h30m00s
```

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
3. When you paste a URL with these parameters, the extension parses them at page load
4. The extension then automatically navigates to the specified character and opens the correct chat
5. Browser history is maintained, allowing back/forward navigation

## Limitations

- URLs contain encoded chat filenames which can be long
- Sharing URLs requires the recipient to have access to the same characters/chats
- "Open in New Tab" uses localStorage for cross-tab communication (same browser only)

## Support and Contributions

For issues and feature requests, please open an issue on GitHub.

Contributions are welcome! Feel free to submit pull requests.

## License

MIT License
