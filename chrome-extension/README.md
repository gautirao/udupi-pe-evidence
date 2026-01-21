# Udupi Property Tracker - Chrome Extension

A browser extension to extract property posts from Facebook groups for the Udupi Land & House Price Tracker.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project

## Setup

1. Click the extension icon in Chrome
2. Configure the API endpoint: `https://ynctsqjakvxvfcywzptf.supabase.co/functions/v1/ingest-posts`
3. Enter your Supabase anon key (get it from the app settings)
4. Click "Save Configuration"

## Usage

1. Navigate to a Facebook group page (e.g., `facebook.com/groups/udupi-properties`)
2. Scroll down to load more posts
3. Click the extension icon
4. Select individual posts by checking the checkbox on each post, OR click "Select All"
5. Click "Extract Selected Posts" to send them to the tracker

## How It Works

- The extension adds a selection overlay to each post on Facebook group pages
- When you extract posts, it sends the raw text content to your API
- The server-side AI then parses property details (price, location, type, etc.)
- Posts appear in your admin panel for review

## Important Notes

- This extension only works on Facebook group pages
- You must be logged into Facebook to see group content
- The extension respects your privacy - data is only sent when you explicitly click extract
- No Facebook credentials are stored or transmitted

## Icons

Replace the placeholder icons in the `icons/` folder with your own:
- `icon16.png` (16x16)
- `icon48.png` (48x48)  
- `icon128.png` (128x128)

## Troubleshooting

- **Posts not detected**: Facebook frequently changes their DOM structure. The extension uses multiple selectors to find posts.
- **API errors**: Check that your API endpoint and key are correct
- **Extension not loading**: Make sure you're on a Facebook group page (not a profile or page)
