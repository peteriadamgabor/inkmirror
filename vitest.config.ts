import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      passWithNoTests: true,
      setupFiles: [],
      deps: {
        optimizer: {
          web: {
            include: ['solid-js'],
          },
        },
      },
    },
  }),
);
