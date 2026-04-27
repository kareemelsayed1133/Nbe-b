import fs from 'fs';
import path from 'path';

let executablePath = undefined;
const possiblePaths = [
  path.resolve('./node_modules/playwright-core/.local-browsers'),
  path.resolve('./node_modules/playwright/.local-browsers')
];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    const folders = fs.readdirSync(p);
    console.log("Found folders in", p, folders);
    const headlessFolder = folders.find(f => f.startsWith('chromium_headless_shell-'));
    if (headlessFolder) {
       executablePath = path.join(p, headlessFolder, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
       break;
    }
    const chromiumFolder = folders.find(f => f.startsWith('chromium-'));
    if (chromiumFolder) {
       executablePath = path.join(p, chromiumFolder, 'chrome-linux', 'chrome');
       break;
    }
  }
}
console.log('Executable:', executablePath);
