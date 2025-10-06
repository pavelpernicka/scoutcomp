#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TRANSLATIONS_DIR = path.join(__dirname, '../src/translations');

function getTranslationFiles() {
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    return [];
  }

  return fs.readdirSync(TRANSLATIONS_DIR)
    .filter(file => file.endsWith('.json') || file.endsWith('.jsonc'))
    .map(file => ({
      language: path.basename(file, path.extname(file)),
      path: path.join(TRANSLATIONS_DIR, file)
    }));
}

function countKeys(obj, prefix = '') {
  let count = 0;
  let translated = 0;
  let pending = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null) {
      const result = countKeys(value, fullKey);
      count += result.count;
      translated += result.translated;
      pending.push(...result.pending);
    } else {
      count++;
      const isPlaceholder = typeof value === 'string' &&
        (value.startsWith('[') || value === key || value === `{${key}}`);

      if (!isPlaceholder) {
        translated++;
      } else {
        pending.push(fullKey);
      }
    }
  }

  return { count, translated, pending };
}

function generateStats() {
  const files = getTranslationFiles();

  if (files.length === 0) {
    console.log('No translation files found in', TRANSLATIONS_DIR);
    console.log('Run `npm run translations:extract` first to generate translation files.');
    return;
  }

  console.log('Translation Statistics\n');
  console.log('=' .repeat(50));

  let totalKeys = 0;
  const languageStats = [];

  files.forEach(({ language, path: filePath }) => {
    try {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      // Strip comments for JSON parsing if it's a JSONC file
      const cleanContent = filePath.endsWith('.jsonc')
        ? rawContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        : rawContent;
      const content = JSON.parse(cleanContent);
      const stats = countKeys(content);

      if (totalKeys === 0) {
        totalKeys = stats.count;
      }

      const percentage = totalKeys > 0 ? Math.round((stats.translated / totalKeys) * 100) : 0;

      languageStats.push({
        language: language.toUpperCase(),
        total: stats.count,
        translated: stats.translated,
        pending: stats.count - stats.translated,
        percentage,
        pendingKeys: stats.pending
      });

    } catch (error) {
      console.error(`Error reading ${filePath}:`, error.message);
    }
  });

  languageStats.sort((a, b) => b.percentage - a.percentage);
  languageStats.forEach(stats => {
    console.log(`${stats.language.padEnd(5)} ${stats.percentage.toString().padStart(3)}% complete`);
    console.log(`   Translated: ${stats.translated}/${stats.total}`);
    console.log(`   Pending:    ${stats.pending}`);
    console.log();
  });

  const incompleteLanguage = languageStats.find(stats => stats.percentage < 100);
  if (incompleteLanguage && incompleteLanguage.pendingKeys.length > 0) {
    console.log('=' .repeat(50));
    console.log(`Pending translations for ${incompleteLanguage.language}:\n`);

    incompleteLanguage.pendingKeys.slice(0, 20).forEach(key => {
      console.log(`   ${key}`);
    });

    if (incompleteLanguage.pendingKeys.length > 20) {
      console.log(`   ... and ${incompleteLanguage.pendingKeys.length - 20} more`);
    }
    console.log();
  }

  console.log('=' .repeat(50));
  console.log('Tips:');
  console.log(' - Run `npm run translations:extract` to update translation files');
  console.log(' - Edit translation files in src/translations/ to add translations');
  console.log(' - Remove placeholder prefixes like "[CS]" and "[EN]" when translating');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateStats();
}

export { generateStats };
