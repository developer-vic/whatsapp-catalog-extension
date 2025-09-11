# WhatsApp Catalog Scraper Extension - User Guide

## Overview
This extension automates the process of extracting product catalogs from WhatsApp Business contacts and organizing them into structured reports.

## Getting Started

### 1. Prepare Your Excel File
Create an Excel file (.xlsx) with exactly three sheets:

#### Sheet 1: "Dealer List"
| Dealer Name | Phone Number |
|-------------|--------------|
| John's Auto Parts | +1234567890 |
| Mike's Electronics | +0987654321 |

#### Sheet 2: "Dealer Output" (Template - will be filled automatically)
| Dealer Name | Car Detail | Car Price | Second Page Detail |
|-------------|------------|-----------|-------------------|
| | | | |

#### Sheet 3: "Dealer Image Output" (Template - will be filled automatically)
| Dealer Name | Car Detail | ImagePathName |
|-------------|------------|---------------|
| | | |

### 2. Using the Extension

1. **Open WhatsApp Web** in your Chrome browser
2. **Click the extension icon** in the Chrome toolbar
3. **Upload your Excel file** using the file picker
4. **Verify the contact count** shown in the interface
5. **Click "Start Scraping"** to begin the automated process
6. **Wait for completion** - the extension will process each contact automatically
7. **Download results** when the "Download Results" button appears

### 3. Understanding the Output

#### Downloaded Images
Images are organized in timestamped folders:
```
Downloads/2025-09-11T14-30-45/
├── Johns_Auto_Parts/
│   ├── Brake_Pads_Premium/
│   │   ├── img1.jpg
│   │   └── img2.jpg
│   └── Engine_Oil_Synthetic/
│       └── img1.jpg
└── Mikes_Electronics/
    └── Smartphone_Galaxy/
        ├── img1.jpg
        ├── img2.jpg
        └── img3.jpg
```

#### Excel Report
The generated Excel file contains:
- **Original dealer list** (unchanged)
- **Product details** with names, descriptions, and prices
- **Image file paths** corresponding to downloaded images

## Troubleshooting

### Common Issues

1. **"Missing required sheets" error**
   - Ensure your Excel file has exactly these sheet names: "Dealer List", "Dealer Output", "Dealer Image Output"

2. **No contacts found**
   - Check that your "Dealer List" sheet has data in "Dealer Name" or "Phone Number" columns
   - Verify the contacts exist in your WhatsApp

3. **Download failures**
   - Ensure you have sufficient disk space
   - Check Chrome's download settings allow multiple downloads

4. **Extension not responding**
   - Refresh WhatsApp Web page
   - Reload the extension in Chrome settings

### Best Practices

- **Use clear contact names** that match exactly with WhatsApp contacts
- **Ensure stable internet connection** during scraping
- **Don't navigate away** from WhatsApp Web during operation
- **Close unnecessary browser tabs** for better performance

## Tips for Success

1. **Test with small batches** first (2-3 contacts)
2. **Use phone numbers as fallback** if dealer names don't match exactly
3. **Keep WhatsApp Web active** and visible during scraping
4. **Allow time for processing** - larger catalogs take longer

## Support

If you encounter issues:
1. Check the browser console for error messages (F12 → Console)
2. Verify WhatsApp Web is functioning normally
3. Ensure all required permissions are granted to the extension

---

**Note**: This extension works only with WhatsApp Web and requires active WhatsApp Business contacts with catalogs.
