# WhatsApp Catalog Scraper Extension

A Chrome browser extension that automates the extraction of product catalogs from WhatsApp Web contacts, streamlining business data collection and organization.

## Features

- **Automated Catalog Extraction**: Automatically searches WhatsApp Web contacts and extracts their business catalogs
- **Excel Integration**: Upload dealer contact lists and export comprehensive reports
- **Image Management**: Downloads and organizes product images with structured folder hierarchy
- **Professional Reports**: Generates detailed Excel reports with three organized sheets
- **Hands-free Operation**: Fully automated process once initiated

## How to Use

1. **Load Extension**: Install the extension in Chrome browser
2. **Prepare Excel File**: Create an Excel file with three sheets:
   - **Dealer List**: Contains `Dealer Name` and `Phone Number` columns
   - **Dealer Output**: Template for product details
   - **Dealer Image Output**: Template for image paths
3. **Upload & Execute**: Open WhatsApp Web, click the extension icon, upload your Excel file, and start scraping
4. **Download Results**: Receive organized folders with images and a comprehensive Excel report

## Project Structure

```
whatsapp-catalog-extension/
├── src/                    # Source code files
│   ├── background.js       # Background service worker
│   ├── content.js          # Content script for WhatsApp Web
│   ├── popup.html          # Extension popup interface
│   └── popup.js           # Popup functionality
├── assets/
│   └── icons/             # Extension icons (16x16, 32x32, 48x48, 128x128)
├── lib/                   # Third-party libraries
│   ├── xlsx.full.min.js   # Excel processing library
│   └── jszip.min.js       # ZIP file creation library
├── docs/                  # Documentation
├── manifest.json          # Extension configuration
└── README.md             # This file
```

## Output Structure

### Folder Organization
```
Downloads/
└── [YYYY-MM-DDTHH-MM-SS]/
    └── [Contact_Name]/
        └── [Product_Name]/
            ├── img1.jpg
            ├── img2.jpg
            └── ...
```

### Excel Report
- **Sheet 1**: Original dealer list (unchanged)
- **Sheet 2**: Product details (name, description, price, details)
- **Sheet 3**: Image file paths and references

## Technical Requirements

- Chrome Browser (Manifest V3 compatible)
- WhatsApp Web access
- Excel file with proper structure

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project directory
5. The extension will appear in your Chrome toolbar

## Support

For issues or questions, please refer to the documentation in the `docs/` folder or contact the development team.

## Version

Current Version: 1.0

---

© 2025 WhatsApp Catalog Scraper Extension. Professional business automation tool.
