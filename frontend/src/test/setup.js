import { expect, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { i18nReady } from "../i18n";

expect.extend(matchers);

beforeAll(async () => {
  await i18nReady;
});

afterEach(() => {
  cleanup();
});
