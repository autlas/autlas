import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tauriBuildDir = path.join(__dirname, 'src-tauri', 'target', 'release', 'bundle');

// User requested paths relative to project root (c:\Users\Heavym\Desktop\chest\code\AutoHotkeys\autlas)
const buildsRoot = path.join(root, 'builds');
const exeDest = path.join(buildsRoot, 'exe');
const msiDest = path.join(buildsRoot, 'msi');

const now = new Date();
const timestamp = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function archiveBuilds() {
    console.log(`[Archiving] Starting build capture at ${timestamp}...`);
    ensureDir(exeDest);
    ensureDir(msiDest);

    // 1. Capture MSI
    const msiFolder = path.join(tauriBuildDir, 'msi');
    if (fs.existsSync(msiFolder)) {
        const files = fs.readdirSync(msiFolder);
        files.forEach(file => {
            if (file.endsWith('.msi')) {
                const ext = path.extname(file);
                const name = path.basename(file, ext);
                const newName = `${name}_${timestamp}${ext}`;
                const src = path.join(msiFolder, file);
                const dest = path.join(msiDest, newName);
                fs.copyFileSync(src, dest);
                console.log(`[Archive] Copied MSI: ${newName}`);
            }
        });
    }

    // 2. Capture NSIS (EXE)
    const nsisFolder = path.join(tauriBuildDir, 'nsis');
    if (fs.existsSync(nsisFolder)) {
        const files = fs.readdirSync(nsisFolder);
        files.forEach(file => {
            if (file.endsWith('.exe')) {
                const ext = path.extname(file);
                const name = path.basename(file, ext);
                // Handle the "-setup" suffix if present
                const cleanName = name.replace('-setup', '');
                const newName = `${cleanName}_${timestamp}-setup${ext}`;
                const src = path.join(nsisFolder, file);
                const dest = path.join(exeDest, newName);
                fs.copyFileSync(src, dest);
                console.log(`[Archive] Copied EXE: ${newName}`);
            }
        });
    }
}

try {
    archiveBuilds();
} catch (err) {
    console.error(`[Archive Error] ${err.message}`);
}
