#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSLATIONS_DIR = path.join(__dirname, '../src/translations');

function stripCommentsFromJSONC(content) {
  // Remove /* */ style comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove // style comments but preserve them in strings
  content = content.replace(/\/\/.*$/gm, '');
  return content;
}

function buildTranslationFiles() {
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    console.log('No translations directory found');
    return;
  }

  const files = fs.readdirSync(TRANSLATIONS_DIR)
    .filter(file => file.endsWith('.jsonc'));

  if (files.length === 0) {
    console.log('No JSONC files found');
    return;
  }

  files.forEach(file => {
    const jsoncPath = path.join(TRANSLATIONS_DIR, file);
    const jsonPath = path.join(TRANSLATIONS_DIR, file.replace('.jsonc', '.json'));

    try {
      const jsoncContent = fs.readFileSync(jsoncPath, 'utf8');
      const cleanContent = stripCommentsFromJSONC(jsoncContent);

      // Validate JSON
      JSON.parse(cleanContent);

      fs.writeFileSync(jsonPath, cleanContent, 'utf8');
      console.log(`Generated ${file.replace('.jsonc', '.json')} from ${file}`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildTranslationFiles();
}

export { buildTranslationFiles };