// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://kvizovi.hr',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory', assets: '_a' },
  devToolbar: { enabled: false },
  vite: { build: { cssCodeSplit: true } },
});
