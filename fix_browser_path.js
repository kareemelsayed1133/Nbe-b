import fs from 'fs';
import path from 'path';

let content = fs.readFileSync('server.ts', 'utf8');

const replacement = `
    let executablePath = undefined;
    const possiblePaths = [
      path.resolve(process.cwd(), 'node_modules/playwright-core/.local-browsers'),
      path.resolve(process.cwd(), 'node_modules/playwright/.local-browsers')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const folders = fs.readdirSync(p);
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
    
    if (executablePath) {
        localBroadcast({ type: 'LOG', message: \`[SYSTEM] Found local browser at \${executablePath}\` });
    }

    // Launch browser with a promise timeout
    const launchPromise = chromium.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: [
`;

content = content.replace("    // Launch browser with a promise timeout\n    const launchPromise = chromium.launch({\n      headless: true,\n      args: [", replacement);

fs.writeFileSync('server.ts', content);
console.log('Fixed browser path!');
