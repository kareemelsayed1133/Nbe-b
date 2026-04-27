import { execSync } from 'child_process';
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
try {
  console.log("Installing playwright browsers into node_modules...");
  execSync('npx playwright install chromium chromium-headless-shell', { stdio: 'inherit' });
  console.log("Installing playwright system dependencies...");
  try {
     execSync('npx playwright install-deps chromium', { stdio: 'inherit' });
  } catch(e) {
     console.log("Install-deps failed, but continuing.", e.message);
  }
} catch (e) {
  console.error("Failed to install playwright browsers.", e);
}
