# Chat URL Navigator

SillyTavern extension that assigns unique URLs to individual chats, allowing you to bookmark and share direct links to specific conversations.

## Features

- **URL-based Chat Navigation**: Each chat gets a unique URL hash (e.g., `#/char/avatar/chatfile`)
- **Auto-update URLs**: Browser URL automatically updates when switching chats
- **Copy Chat URL**: One-click button to copy the current chat's URL to clipboard
- **Open in New Tab**: Open the current chat in a new browser tab
- **Browser History Support**: Use browser back/forward buttons to navigate between chats
- **Direct Link Sharing**: Share URLs that open specific chats directly

## Installation and Usage

### Installation

Use SillyTavern's built-in extension installer:

1. Open SillyTavern
2. Go to Extensions panel
3. Click "Install Extension"
4. Enter this repository URL: `https://github.com/YOUR_USERNAME/st-extension-example`
5. Click "Save"
6. Reload the page

### Usage

Once installed, the extension works automatically:

1. **Auto URL Update**: When you open a chat, the browser URL will update to include the chat identifier
2. **Copy URL**: Click the "Copy Chat URL" button in the extension settings or the link icon in the chat header
3. **Open in New Tab**: Click "Open in New Tab" to duplicate the current chat in a new browser tab
4. **Share Links**: Copy the URL and share it - others (or you on another device) can open it directly
5. **Settings**: Access extension settings in the Extensions panel to enable/disable features

### URL Format

- Character chats: `http://localhost:8000/#/char/{avatar}/{chatFileName}`
- Group chats: `http://localhost:8000/#/group/{groupId}/{chatId}`

## Prerequisites

- SillyTavern 1.12.0 or later (requires event system and extension API)

## Support and Contributions

For issues and feature requests, please open an issue on GitHub.

Contributions are welcome! Feel free to submit pull requests.

## License

MIT License
