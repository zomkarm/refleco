# Refleco

A quiet, distraction-free personal journal that lives as a file you control.

Refleco is designed for simple reflection — no feeds, no notifications, no accounts. Just pages, entries, and your thoughts, stored locally or in a file you choose.

---

## Overview

Refleco is a browser-based journaling app built with a focus on:

* Minimal friction while writing
* A calm, book-like experience
* Full ownership of your data

Instead of storing data on servers, Refleco lets you write directly into a `.json` file on your system using the File System Access API, with a localStorage fallback when needed.

---

## Features

###  Book-style interface

* Swipe or navigate between pages
* Cover page with journal stats
* Smooth page transitions

###  Entry system

* Add entries to any page
* Automatic page creation when full
* Character-based page limits for readability

###  Edit & manage

* Tap any entry to edit
* Update or delete entries
* Preserves original timestamp

###  Local-first storage

* Save journal to a file on your system
* Reopen and continue anytime
* Fallback to browser storage if file access is unavailable

###  No accounts, no tracking

* No backend
* No login
* No data leaves your device

---

## Tech Stack

* HTML, CSS, JavaScript (Vanilla)
* File System Access API
* IndexedDB (for persisting file handle)
* localStorage (fallback storage)
* Service Worker (for PWA support)

---

## How It Works

1. On first launch, choose:

   * Create a new journal file
   * Open an existing one
   * Or use browser storage

2. Entries are stored as structured JSON:

   ```json
   {
     "pages": [
       [
         { "id": "...", "text": "...", "date": 123456789 }
       ]
     ]
   }
   ```

3. The app mirrors data to localStorage for safety and quick access.

---

## Running Locally

Because the app uses browser APIs like the File System Access API and Service Workers, it must be served over HTTP.

### Option 1: Python

```bash
python -m http.server
```

### Option 2: Node.js

```bash
npx serve
```

Then open:

```
http://localhost:8000
```

---

## Project Structure

```
/root
  index.html
  style.css
  app.js
  sw.js
  manifest.json
  /src
    storage.js
    utils.js
```

---

## Design Philosophy

Refleco is intentionally simple.

It avoids:

* Feeds
* Social features
* Notifications
* Cloud dependency

The goal is to create a space where writing feels natural and uninterrupted, closer to a physical notebook than a modern app.

---

## Limitations

* File System Access API is not supported in all browsers (Safari has limited support)
* No cloud sync (by design)
* Data format is simple JSON (not encrypted)

---

## Future Improvements (Optional Ideas)

* Export to text / markdown
* Search within entries
* Tags or lightweight categorization
* Encryption layer for journal file
* Theming / visual customization

---

## License

Personal project. Use and modify freely.

---

## Closing Note

Refleco is not trying to be a productivity tool or a social platform.

It’s just a place to write things you don’t want to forget.
