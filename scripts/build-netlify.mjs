import { cp, mkdir, rm } from 'node:fs/promises';
// Only public assets are published. API source, reports and credentials stay private.
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'assets', 'favicon.png', 'robots.txt', 'cgu.html', 'confidentialite.html', 'mentions-legales.html']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
