# Chrome Extension

This package contains a Chrome Manifest V3 extension that helps fill comment boxes with prepared text.

## What the extension does

The extension has two comment sources:

- A saved draft comment stored in `chrome.storage.local`
- A URL-specific preset comment for specific pages

When you click into an empty comment-like input on a page, the content script tries to auto-fill it.

Current behavior:

- If the current page matches a configured URL preset, the preset comment is used
- If there is no matching URL preset, the saved draft comment is used
- If the field already has text, the extension does not overwrite it
- You can also manually force insertion from the popup with `Fill Comment Box`

The popup shows:

- The current saved draft text
- A list of URL presets
- The exact comment text each preset will use
- Whether the current tab matches one of those presets
- A live ready-to-publish queue loader from `https://api.thecopilotmarketer.ca`

## Files

- `manifest.json`: Chrome extension manifest
- `popup.html`, `popup.css`, `popup.js`: popup UI and behavior
- `content.js`: page-side logic that detects and fills editable comment fields
- `presets.json`: URL-to-comment mappings

## How to install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select `/Users/jeremytubongbanua/GitHub/ws_submission/packages/chrome_extension`.

After installation, the extension should appear in the Chrome toolbar. If not, open the extensions menu and pin it.

## How to use it

### Connect to the production DB API

1. Click the extension icon.
2. Paste the password into the `Password` field.
3. Click `Save API Key`.
4. Click `Load Ready Queue`.

The popup will call:

- `https://api.thecopilotmarketer.ca/v1/queues/ready-to-publish`

and render the returned ready-to-publish items.

### Save a general draft comment

1. Click the extension icon.
2. Enter text in the `Comment text` box.
3. Click `Save Draft For Auto-Fill`.

This saved draft will be used on pages that do not have a URL-specific preset.

### Auto-fill a comment box

1. Open a page with a comment or reply field.
2. Click into the comment box.

If the extension recognizes the field as a comment-like input and the field is empty, it will auto-fill the text.

### Manually fill the current page

1. Click the extension icon.
2. Confirm the text in the `Comment text` box.
3. Click `Fill Comment Box`.

This sends a message to the current tab and attempts immediate insertion.

## How URL-specific comments work

URL-specific comments are defined in `presets.json`.

Each preset contains:

- `id`: internal identifier
- `label`: human-readable name shown in the popup
- `urlPrefixes`: one or more URL prefixes that should match a page
- `text`: the comment to auto-fill on matching pages

Current example:

- Reddit Wild Rift post:
  `https://www.reddit.com/r/wildrift/comments/1ricbk2/every_jinx_mains_wet_dream/`

If the current page URL starts with one of the preset prefixes, that comment is used instead of the general saved draft.

## How to add a new URL and comment

Edit [presets.json](/Users/jeremytubongbanua/GitHub/ws_submission/packages/chrome_extension/presets.json) and add a new object to the JSON array.

Example:

```json
[
  {
    "id": "wildrift-jinx-1ricbk2",
    "label": "Wild Rift Jinx Post",
    "urlPrefixes": [
      "https://www.reddit.com/r/wildrift/comments/1ricbk2/",
      "https://reddit.com/r/wildrift/comments/1ricbk2/"
    ],
    "text": "This is peak Jinx brain. The second someone recalls on low HP, it stops being a teamfight and turns into a full-on physics exam."
  },
  {
    "id": "example-post",
    "label": "Example Reddit Post",
    "urlPrefixes": [
      "https://www.reddit.com/r/example/comments/abc123/",
      "https://reddit.com/r/example/comments/abc123/"
    ],
    "text": "Your custom comment goes here."
  }
]
```

Guidelines:

- Use a stable `id`
- Use a clear `label`
- Add all URL variants you want to support in `urlPrefixes`
- Keep `text` as the exact final comment you want inserted

## After changing presets

After editing `presets.json`:

1. Go back to `chrome://extensions`
2. Find `WS Comment Filler`
3. Click `Reload`

Then reopen the popup or refresh the target page.

## Notes and limitations

- The current field detection is generic and based on editable elements like `textarea`, `contenteditable`, and `role="textbox"`
- It tries to detect comment-like inputs using labels such as `comment` and `reply`
- Some sites may need more specific handling if they use custom editors
- This version does not submit comments automatically; it only fills the box
- URL presets are currently stored in `presets.json`

## Recommended next improvement

If you want this to scale, the next step is to make presets editable in the popup and store them in `chrome.storage.local` instead of hardcoding them in JavaScript.
