#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import globPkg from 'glob';
import { fileURLToPath } from 'url';

const { glob } = globPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SRC_DIR = path.join(__dirname, '../src');
const TRANSLATIONS_DIR = path.join(SRC_DIR, 'translations');
const SUPPORTED_LANGUAGES = ['cs', 'en'];
const TRANSLATION_FILE_EXT = '.jsonc';

// Extract translation keys from a file content
function extractKeysFromContent(content) {
  const keys = new Map(); // Changed to Map to store key with its variables
  const patterns = [
    // t("key")
    { pattern: /\bt\s*\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*?)["']\s*\)/g, hasParams: false },
    // t("key", { params })
    { pattern: /\bt\s*\(\s*["']([a-zA-Z][a-zA-Z0-9_.]*?)["']\s*,\s*\{([^}]*)\}\s*\)/g, hasParams: true }
  ];

  patterns.forEach(({ pattern, hasParams }) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const key = match[1];
      if (key &&
          !key.startsWith('/') &&
          !key.startsWith('http') &&
          key.length > 1 &&
          key.includes('.')) {

        let variables = [];
        if (hasParams && match[2]) {
          // Extract variable names from the parameters object
          const paramStr = match[2];
          const variableMatches = paramStr.match(/\b(\w+)\s*:/g);
          if (variableMatches) {
            variables = variableMatches.map(v => v.replace(':', '').trim());
          }
        }

        keys.set(key, variables);
      }
    }
  });

  return keys;
}

function getAllSourceFiles() {
  const patterns = [
    path.join(SRC_DIR, '**/*.jsx'),
    path.join(SRC_DIR, '**/*.js')
  ];

  let files = [];
  patterns.forEach(pattern => {
    try {
      const matchedFiles = glob.sync(pattern, {
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/*.test.js',
          '**/*.test.jsx'
        ]
      });
      files = files.concat(matchedFiles);
    } catch (error) {
      console.error(`Error with pattern ${pattern}:`, error.message);
    }
  });

  return files;
}

function extractAllKeys() {
  const files = getAllSourceFiles();
  const allKeys = new Map(); // Changed to Map to store variables

  console.log(`Scanning ${files.length} files for translation keys...`);

  files.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const keys = extractKeysFromContent(content);

      // Merge keys with their variables
      keys.forEach((variables, key) => {
        const existingVariables = allKeys.get(key) || [];
        const mergedVariables = [...new Set([...existingVariables, ...variables])];
        allKeys.set(key, mergedVariables);
      });

      if (keys.size > 0) {
        console.log(`${path.relative(SRC_DIR, file)}: ${keys.size} keys`);
      }
    } catch (error) {
      console.error(`Error reading ${file}:`, error.message);
    }
  });

  return allKeys;
}

function setNestedValue(obj, key, value) {
  const keys = key.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in current) || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k];
  }

  current[keys[keys.length - 1]] = value;
}

function extractVariablesFromValue(value) {
  // Extract variable patterns like {{variable}}, {variable}, etc. from translation values
  const patterns = [
    /\{\{(\w+)\}\}/g, // {{variable}}
    /\{(\w+)\}/g,     // {variable}
  ];

  const variables = new Set();
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(String(value))) !== null) {
      variables.add(match[1]);
    }
  });

  return Array.from(variables);
}

function generateJSONCContent(obj, englishTranslations, language, sourceVariables = new Map()) {
  let content = '{\n';

  function writeObject(currentObj, englishObj, indent = 1, keyPrefix = '') {
    const spaces = '  '.repeat(indent);
    const entries = Object.entries(currentObj);

    entries.forEach(([key, value], index) => {
      const isLast = index === entries.length - 1;
      const fullKey = keyPrefix ? `${keyPrefix}.${key}` : key;

      if (typeof value === 'object' && value !== null) {
        content += `${spaces}"${key}": {\n`;
        writeObject(value, englishObj ? englishObj[key] || {} : {}, indent + 1, fullKey);
        content += `${spaces}}${isLast ? '' : ','}\n`;
      } else {
        const englishValue = getNestedValue(englishTranslations, fullKey);
        // Get variables from source code or from translation value
        const sourceVars = sourceVariables.get(fullKey) || [];
        const valueVars = extractVariablesFromValue(String(value));
        const allVariables = [...new Set([...sourceVars, ...valueVars])];

        // Add comment with English translation before the key
        if (englishValue && englishValue !== value && !englishValue.startsWith('[EN]') && !englishValue.startsWith('[')) {
          content += `${spaces}// EN: ${englishValue}\n`;
        }

        content += `${spaces}"${key}": ${JSON.stringify(value)}${isLast ? '' : ','}`;

        // Add variable comment after the translation value
        if (allVariables.length > 0) {
          content += ` // Variables: ${allVariables.join(', ')}`;
        }

        content += '\n';
      }
    });
  }

  writeObject(obj, englishTranslations);
  content += '}\n';

  return content;
}

function getAllFlatKeys(obj, prefix = '') {
  const keys = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null) {
      keys.push(...getAllFlatKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

function readTranslationFile(language) {
  const filePath = path.join(TRANSLATIONS_DIR, `${language}${TRANSLATION_FILE_EXT}`);

  if (fs.existsSync(filePath)) {
    try {
      // Read JSONC and strip comments for parsing
      const content = fs.readFileSync(filePath, 'utf8');
      const jsonContent = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      return JSON.parse(jsonContent);
    } catch (error) {
      console.warn(`Error reading ${filePath}:`, error.message);
      return {};
    }
  }

  return {};
}

function writeTranslationFile(language, translations, englishTranslations = {}, sourceVariables = new Map()) {
  const filePath = path.join(TRANSLATIONS_DIR, `${language}${TRANSLATION_FILE_EXT}`);

  // Generate JSONC content with comments
  const content = generateJSONCContent(translations, englishTranslations, language, sourceVariables);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

function getNestedValue(obj, key) {
  return key.split('.').reduce((current, k) => current && current[k], obj);
}

function updateTranslationFiles(keys) {
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    fs.mkdirSync(TRANSLATIONS_DIR, { recursive: true });
    console.log(`Created translations directory: ${TRANSLATIONS_DIR}`);
  }

  const allExistingTranslations = {};
  SUPPORTED_LANGUAGES.forEach(language => {
    allExistingTranslations[language] = readTranslationFile(language);
  });

  SUPPORTED_LANGUAGES.forEach(language => {
    console.log(`\nProcessing ${language.toUpperCase()} translations...`);

    const existing = allExistingTranslations[language];
    const englishTranslations = allExistingTranslations['en'] || {};
    const updated = {};

    let newKeys = 0;
    let preservedKeys = 0;

    keys.forEach((variables, key) => {
      const existingValue = getNestedValue(existing, key);

      if (existingValue) {
        // Keep existing translation
        setNestedValue(updated, key, existingValue);
        preservedKeys++;
      } else {
        // Create new translation with placeholder
        let placeholder;

        if (language === 'en') {
          // For English, just use the key as placeholder
          placeholder = `[EN] ${key}`;
        } else {
          // For other languages, use standard placeholder
          placeholder = `[${language.toUpperCase()}] ${key}`;
        }

        setNestedValue(updated, key, placeholder);
        newKeys++;
      }
    });

    writeTranslationFile(language, updated, englishTranslations, keys);
    console.log(`${language.toUpperCase()}: ${preservedKeys} preserved, ${newKeys} new keys`);
  });
}

function main() {
  console.log('Starting translation key extraction...\n');

  const keys = extractAllKeys();

  console.log(`\nFound ${keys.size} unique translation keys`);

  if (keys.size > 0) {
    console.log('\nUpdating translation files...');
    updateTranslationFiles(keys);

    console.log('\nTranslation extraction completed!');
    console.log(`\nTranslation files location: ${path.relative(process.cwd(), TRANSLATIONS_DIR)}`);
    console.log(`Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
  } else {
    console.log('\nNo translation keys found');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  extractAllKeys,
  updateTranslationFiles,
  SUPPORTED_LANGUAGES
};
