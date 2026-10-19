import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const apiArgument = process.argv.find(a => a.startsWith('--api-url='));
let apiUrl;
if (apiArgument) {
  const parsed = new URL(apiArgument.slice('--api-url='.length));
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error('API URL must be an http(s) base URL without credentials, query, or fragment');
  apiUrl = parsed.toString().replace(/\/$/, '');
}
for (const workspace of ['api', 'mobile']) {
  const target = resolve(root, `apps/${workspace}/.env`);
  if (!existsSync(target)) { copyFileSync(`${target}.example`, target); console.log(`Created apps/${workspace}/.env`); }
  else console.log(`Kept existing apps/${workspace}/.env`);
}
if (apiUrl) {
  const target = resolve(root, 'apps/mobile/.env');
  const previous = readFileSync(target, 'utf8');
  const line = `EXPO_PUBLIC_API_URL=${apiUrl}`;
  writeFileSync(target, /^EXPO_PUBLIC_API_URL=.*$/m.test(previous)
    ? previous.replace(/^EXPO_PUBLIC_API_URL=.*$/m, line) : `${previous}\n${line}\n`);
  console.log('Updated mobile API base URL');
}
console.log('Next: npm ci, add server-only provider credentials to apps/api/.env, then npm run dev:api and npm run dev:mobile.');
