import fs from 'node:fs';
import path from 'node:path';

const sourceExtensions = new Set(['.html', '.js', '.mjs', '.gs']);
const ignoredDirs = new Set(['.git', 'node_modules']);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && sourceExtensions.has(path.extname(full))) files.push(full);
  }
}

walk('.');
let failed = false;

const secretPatterns = [
  { label: 'Supabase secret key', pattern: /\bsb_secret_[A-Za-z0-9_-]{12,}|(?:SUPABASE_SERVICE_ROLE_KEY|service_role_key)\s*[:=]\s*['"][^'"]{20,}/i },
  { label: 'Telegram bot token', pattern: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ }
];

for (const file of files.filter(file => file !== path.join('scripts', 'check-security.mjs'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const secret of secretPatterns) {
    if (secret.pattern.test(source)) {
      failed = true;
      console.error(`Potential ${secret.label} found in client/source file: ${file}`);
    }
  }
}

const adminPages = files.filter(file => file.startsWith(`admin${path.sep}`) && file.endsWith('.html'));
for (const file of adminPages) {
  const source = fs.readFileSync(file, 'utf8');
  const isStaffSelfService = [path.join('admin', 'personnel-profile.html'), path.join('admin', 'staff-portal.html'), path.join('admin', 'change-password.html')].includes(file);
  const hasSessionCheck = file === path.join('admin', 'login.html')
    ? /signInWithPassword\s*\(/.test(source)
    : /auth\.getUser\s*\(/.test(source);
  const hasAdminGuard = /from\(['"]admin_users['"]\)/.test(source);
  const isPasswordSelfService = file === path.join('admin', 'change-password.html');
  const hasPersonnelOwnershipGuard = /from\(['"]personnel['"]\)/.test(source)
    && /auth_user_id/.test(source);
  if (!hasSessionCheck || (isStaffSelfService ? !hasPersonnelOwnershipGuard : (isPasswordSelfService ? false : !hasAdminGuard))) {
    failed = true;
    console.error(`Page is missing its required authenticated access guard: ${file}`);
  }
}

if (failed) process.exit(1);
console.log(`Security smoke check passed: scanned ${files.length} source files and verified ${adminPages.length} admin page guards.`);
