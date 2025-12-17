# Windows VM Setup Guide for Shamela ISO Extraction (Apple Silicon)

**Date:** 2025-12-17
**Mac Type:** Apple Silicon (M1/M2/M3)
**VM Solution:** UTM (Free)
**Purpose:** Extract Shamela databases from encrypted ISO

## Prerequisites

- Mac with Apple Silicon (M1/M2/M3)
- At least 60GB free disk space
- Shamela ISO already downloaded: `/Users/abdulrahman/Downloads/shamela.full.1446.1.iso`

## Step 1: Install UTM

```bash
# Install using Homebrew
brew install --cask utm

# Or download manually from:
# https://mac.getutm.app/
```

**Time:** 2-3 minutes

## Step 2: Download Windows 11 ARM ISO

You have two options:

### Option A: Windows 11 ARM Insider Preview (Recommended)

1. Go to: https://www.microsoft.com/en-us/software-download/windowsinsiderpreviewARM64
2. Sign in with Microsoft account (or create free account)
3. Select:
   - **Edition:** Windows 11 Client ARM64 Insider Preview (Dev Channel)
   - **Language:** English (United States)
4. Download the ISO (~5GB)
5. Save to Downloads folder

### Option B: Windows 11 Standard (with ARM emulation)

1. Go to: https://www.microsoft.com/software-download/windows11
2. Select "Create Windows 11 Installation Media"
3. Download ISO
4. Note: Will run slower on ARM Mac but more stable

**Time:** 15-30 minutes (download)

## Step 3: Create Windows VM in UTM

1. **Open UTM** (from Applications or Spotlight)

2. **Click "Create a New Virtual Machine"**

3. **Select "Virtualize"** (not Emulate - faster for ARM Windows)

4. **Choose "Windows"**

5. **Configure VM Settings:**

   - **Boot ISO Image:** Browse and select your Windows 11 ISO

   - **Memory:**
     - Recommended: **4096 MB (4 GB)** minimum
     - Better: **8192 MB (8 GB)** if you have 16GB+ RAM

   - **CPU Cores:**
     - Recommended: **4 cores**
     - You can use more if available

   - **Storage Size:**
     - Minimum: **40 GB**
     - Recommended: **60 GB** (Shamela extracted is ~15GB)

   - **Shared Directory:** (optional, setup later for file transfer)

6. **Click "Save"** and name it "Windows-Shamela"

**Time:** 5 minutes

## Step 4: Install Windows 11

1. **Start the VM** (click the play button)

2. **Windows Setup will start:**
   - **Language:** English
   - **Time and currency format:** Your preference
   - **Keyboard:** US or your layout

3. **Click "Install Now"**

4. **Product Key:**
   - Click **"I don't have a product key"** (bottom)
   - Windows will run in trial mode (fully functional)

5. **Select Windows Edition:**
   - Choose **"Windows 11 Pro"** or **"Windows 11 Home"**

6. **Accept License Terms**

7. **Installation Type:**
   - Select **"Custom: Install Windows only (advanced)"**

8. **Select Disk:**
   - You'll see one drive (the virtual disk you created)
   - Click **"Next"** to install on it

9. **Wait for Installation:**
   - Takes 10-20 minutes
   - VM will restart automatically

**Time:** 15-25 minutes

## Step 5: Windows First-Time Setup

After installation, Windows will boot into OOBE (Out of Box Experience):

1. **Region:** Select your region

2. **Keyboard Layout:** Select your layout

3. **Network:**
   - If asked to connect to network, you can **"Skip for now"** or connect

4. **Microsoft Account:**
   - Click **"Set up for personal use"**
   - Click **"Sign-in options"**
   - Click **"Domain join instead"** (bottom left)
   - This lets you create a local account without Microsoft account

5. **Create Local Account:**
   - **Username:** `shamela` (or your preference)
   - **Password:** Your choice (or leave blank for testing)
   - **Security questions:** Answer or skip

6. **Privacy Settings:**
   - Turn OFF everything (faster, more private)
   - Click through quickly

7. **Wait for Desktop** to load

**Time:** 10-15 minutes

## Step 6: Install UTM Guest Tools (Optional but Recommended)

This enables better integration (clipboard sharing, file sharing, better graphics):

1. In UTM menu bar: **CD/DVD → Change → Windows Guest Tools**

2. In Windows:
   - Open File Explorer
   - Click on "DVD Drive (D:)" or similar
   - Run `spice-guest-tools-xxx.exe`
   - Install with defaults
   - Restart Windows when prompted

**Time:** 5 minutes

## Step 7: Mount Shamela ISO in Windows

Now you're ready to extract Shamela!

### Method 1: Transfer ISO to Windows VM

1. **On macOS:**
   ```bash
   # Copy ISO to a shared location
   cp /Users/abdulrahman/Downloads/shamela.full.1446.1.iso ~/Desktop/
   ```

2. **In UTM:**
   - Stop the VM
   - Click **Edit** on the VM
   - Go to **Sharing** tab
   - Add **Shared Directory:** Browse to your Desktop
   - Start the VM

3. **In Windows:**
   - Open File Explorer
   - Look for Network Drive or `\\Mac\`
   - Copy `shamela.full.1446.1.iso` to `C:\Users\shamela\Desktop\`

### Method 2: Mount ISO directly in UTM

1. **In UTM:**
   - Click **CD/DVD → Change**
   - Browse to `/Users/abdulrahman/Downloads/shamela.full.1446.1.iso`
   - Click **"Open"**

2. **In Windows:**
   - ISO should appear as a DVD drive
   - Open File Explorer
   - Look for "DVD Drive (D:)" or similar

**Time:** 5-10 minutes

## Step 8: Extract Shamela Databases

1. **In Windows File Explorer:**
   - Open the Shamela ISO drive
   - You should see:
     - `shamela.exe` (84KB)
     - `data/` folder

2. **Run the Installer:**
   - Double-click `shamela.exe`
   - Windows may show security warning - click **"Run anyway"**

3. **Shamela will extract:**
   - Default location: `C:\Program Files\Shamela\`
   - Or: `C:\Users\shamela\AppData\Local\Shamela\`
   - Extraction takes **5-15 minutes**
   - You'll see progress bar

4. **Wait for completion**

**Time:** 10-20 minutes

## Step 9: Locate and Verify Databases

1. **Find the databases:**
   ```
   # Likely locations:
   C:\Program Files\Shamela\database\book\
   C:\Program Files (x86)\Shamela\database\book\
   C:\Users\shamela\AppData\Local\Shamela\database\book\
   ```

2. **Check the structure:**
   ```
   database/
   └── book/
       ├── 001/
       │   └── 1.db
       ├── 002/
       │   └── 2.db
       ├── 003/
       │   └── 3.db
       └── ... (8,000+ folders)
   ```

3. **Verify some databases:**
   - Each `.db` file should be 100KB - 50MB
   - Total size: ~12-15 GB

**Time:** 2-3 minutes

## Step 10: Copy Databases to macOS

### Method 1: Using Shared Folder (Recommended)

1. **In Windows:**
   - Open File Explorer
   - Navigate to the database folder
   - Select the entire `database` folder
   - Copy it

2. **Navigate to shared folder:**
   - Go to `\\Mac\Desktop` or your shared location
   - Paste the `database` folder
   - **This will take 15-30 minutes** (12-15 GB transfer)

3. **On macOS:**
   - Databases will appear on your Desktop
   - Move to project directory:
   ```bash
   mkdir -p ~/Documents/projects/arabic-texts-library/shamela-scraper/data/shamela/sqlite
   mv ~/Desktop/database ~/Documents/projects/arabic-texts-library/shamela-scraper/data/shamela/sqlite/
   ```

### Method 2: Compress and Transfer

1. **In Windows:**
   - Right-click the database folder
   - Select **"Send to → Compressed (zipped) folder"**
   - Creates `database.zip` (~8-10 GB)
   - Transfer via shared folder

2. **On macOS:**
   ```bash
   # Unzip
   cd ~/Documents/projects/arabic-texts-library/shamela-scraper/data/shamela/
   unzip ~/Desktop/database.zip -d sqlite/
   ```

**Time:** 20-40 minutes (transfer + verification)

## Step 11: Verify on macOS

```bash
# Check database count
cd ~/Documents/projects/arabic-texts-library/shamela-scraper/data/shamela/sqlite/database/book
ls -la | wc -l
# Should show ~8,000+ folders

# Check total size
du -sh .
# Should show ~12-15 GB

# Test opening a database
sqlite3 001/1.db "SELECT * FROM sqlite_master LIMIT 5;"
# Should show table structure
```

**Time:** 2 minutes

## Step 12: Clean Up (Optional)

Once databases are verified on macOS:

1. **Delete Windows VM** (to free up 40-60 GB):
   - In UTM, right-click VM
   - Select **"Delete"**
   - Confirm deletion

2. **Delete Windows ISO** (to free up ~5 GB):
   ```bash
   rm ~/Downloads/Windows11_ARM64.iso
   # Or wherever you saved it
   ```

3. **Keep Shamela ISO** for reference or future use

**Disk Space Freed:** 45-65 GB

## Troubleshooting

### Issue: VM won't start
- Make sure you selected **"Virtualize"** not "Emulate"
- Check you have enough RAM available
- Try reducing RAM allocation to 4GB

### Issue: Windows installer not booting
- Verify ISO download wasn't corrupted
- Try re-downloading Windows ISO
- Make sure you selected Windows edition in UTM setup

### Issue: Shamela.exe won't run
- Right-click → Properties → Unblock
- Run as Administrator
- Check that ISO is properly mounted

### Issue: Can't find databases after extraction
- Search Windows for `*.db` files
- Check:
  - `C:\Program Files\Shamela\`
  - `C:\Users\shamela\AppData\Local\`
  - `C:\Shamela\`
- Open `shamela.exe` again to see installation path

### Issue: Slow file transfer
- Use compression (zip) before transferring
- Or use an external USB drive
- Or set up network sharing instead of UTM sharing

### Issue: Not enough disk space
- Increase virtual disk size in UTM settings
- Or extract directly to shared folder
- Or use external drive for extraction

## Alternative: Network Transfer

If UTM sharing is slow:

1. **In Windows VM:**
   - Enable File Sharing
   - Share the database folder
   - Note the IP address (`ipconfig`)

2. **On macOS:**
   ```bash
   # Connect to Windows share
   # Finder → Go → Connect to Server
   # smb://192.168.x.x/database
   ```

## Summary Timeline

| Step | Time | Cumulative |
|------|------|------------|
| Install UTM | 3 min | 3 min |
| Download Windows ISO | 20 min | 23 min |
| Create VM | 5 min | 28 min |
| Install Windows | 20 min | 48 min |
| Windows Setup | 15 min | 63 min (1h 3m) |
| Mount Shamela ISO | 5 min | 68 min |
| Extract Databases | 15 min | 83 min |
| Copy to macOS | 30 min | 113 min |
| Verify | 2 min | **115 min (1h 55m)** |

**Total:** ~2 hours (mostly waiting)

## Next Steps After Extraction

Once you have the SQLite databases on macOS:

1. **Analyze database schema:**
   ```bash
   cd ~/Documents/projects/arabic-texts-library/shamela-scraper
   python3 scripts/analyze_shamela_db.py
   ```

2. **Create converter** from SQLite to your project format

3. **Compare** SQLite data with your web-scraped HTML

4. **Merge datasets** for complete collection

## Resources

- **UTM Documentation:** https://docs.getutm.app/
- **UTM Gallery** (pre-made VMs): https://mac.getutm.app/gallery/
- **Windows 11 ARM:** https://www.microsoft.com/software-download/windowsinsiderpreviewARM64
- **Shamela ISO Analysis:** See `SHAMELA_ISO_ANALYSIS.md` in this directory

## Notes

- Windows will run in trial mode but is fully functional
- No product key needed for this temporary use
- VM can be deleted after extraction
- Keep databases backed up (12-15 GB)
- SQLite format is better than HTML for structured access

---

**Questions?** Check troubleshooting section above or see SHAMELA_ISO_ANALYSIS.md for alternative approaches.
