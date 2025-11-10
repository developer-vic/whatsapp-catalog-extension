# WhatsApp Catalog Scraper Extension

Chrome extension that automates WhatsApp Web catalog collection and streams each product directly into Firebase with a final completion summary.

## Key Features

- **Single-contact scraping** based on the phone number assigned to the authenticated operator.
- **Automated WhatsApp navigation** with a live overlay to show scrape progress.
- **Incremental uploads with summary**: each product (and its images) is written to Firestore/Storage as soon as it is scraped, and the session finishes with a clear success/failure breakdown.
- **Smart catalog sync**: existing cars are left untouched, removed cars are cleaned up automatically, and no more than five images per car are stored.
- **Optional item cap**: operators can enable a limit in the popup to scrape only the first _N_ catalog entries (unchecked defaults to scraping everything).
- **Firebase-integrated popup** that shows session progress once the background worker finishes uploading.
- **Admin console** (`admin.html`) with two tabs:
  - **Operator Management** to create users, assign catalog numbers, and inspect latest sessions.
  - **Item Management** to review catalog entries, preview all uploaded images in a carousel, delete individual items (auto-cleaning storage), or wipe entire sessions.

## Usage

1. **Install**  
   - Clone or download the repo.  
   - In Chrome, open `chrome://extensions`, enable *Developer mode*, choose **Load unpacked**, and select this project directory.
   - Copy `src/firebase-init.example.js` to `src/firebase-init.js` and update it with your Firebase project credentials (the real file is ignored by git).

2. **Sign in**  
   - Open the extension popup.  
   - Sign in with your Firebase Auth credentials.  
   - The popup shows the phone number assigned to your account.

3. **Start scraping**  
   - Make sure you are logged in to [web.whatsapp.com](https://web.whatsapp.com) in a browser tab.  
   - Click **Start scraping** in the popup. The popup closes automatically.  
   - (Optional) Check **Limit catalog items** to scrape only the first _N_ products.  
   - The content script opens the assigned contact’s catalog and scrapes every product, capturing descriptions and product images (skipping the first two thumbnails).

4. **Wait for completion**  
   - Watch the overlay inside WhatsApp Web for progress (success counter increases as uploads succeed).  
   - When the process finishes, the background worker patches the session summary and broadcasts the final success/failure counts.  
   - Reopen the popup to view updated totals, failure counts (if any), and the item list.

5. **Optional Admin tasks**  
   - Open `admin.html` directly in the extension directory.  
   - Use the **Operator Management** tab to onboard operators or reassign catalog numbers.  
   - Use the **Item Management** tab to preview uploaded items, remove individual entries, or delete entire sessions (images are cleaned up automatically).

## Data Flow

```
popup.js        -> creates the session document and triggers scraping
content.js      -> scrapes WhatsApp catalog items and streams each upload request to the background worker
background.js   -> authenticates against Firebase, stores each item immediately, tracks progress, and finalizes the session summary
Firestore/Storage -> persist session metadata, catalog documents, and uploaded images
```

## Requirements

- Chrome (Manifest V3)
- Firebase project with Auth and Firestore
- WhatsApp Web account with catalog access for the assigned contact

## Repository Layout

```
whatsapp-catalog-extension/
├── src/
│   ├── background.js             # Background worker handling Firebase writes & storage uploads
│   ├── content.js                # WhatsApp Web scraper and overlay
│   ├── popup.js                  # Popup UI and Firebase Auth integration
│   ├── firebase-init.example.js  # Template for project-specific Firebase config
│   └── firebase-init.js          # Local Firebase config (git-ignored)
├── lib/                          # Firebase compat SDK bundles
├── manifest.json                 # Extension manifest
├── admin.html                    # Admin console (operators + item management)
└── README.md
```

## Support

Report issues or feature requests via the project tracker, or contact the engineering team managing the Firebase project.
