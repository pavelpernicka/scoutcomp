#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTranslationFiles } from './build-translations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSLATIONS_DIR = path.join(__dirname, '../src/translations');

function watchTranslations() {
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    console.log('Translations directory not found, creating...');
    fs.mkdirSync(TRANSLATIONS_DIR, { recursive: true });
  }

  console.log('Watching for JSONC file changes in src/translations/');

  buildTranslationFiles();

  fs.watch(TRANSLATIONS_DIR, { recursive: false }, (eventType, filename) => {
    if (filename && filename.endsWith('.jsonc')) {
      console.log(`JSONC file changed: ${filename}`);
      try {
        buildTranslationFiles();
        console.log('JSON files rebuilt successfully');
      } catch (error) {
        console.error('Error rebuilding translations:', error.message);
      }
    }
  });

  process.on('SIGINT', () => {
    console.log('\nStopping translation watcher');
    process.exit(0);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  watchTranslations();
}

export { watchTranslations };
