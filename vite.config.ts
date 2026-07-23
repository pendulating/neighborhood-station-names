import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { readFileSync } from 'fs';

// Read the manifest version at build time and inject it so the version the mod
// logs never drifts from the published one.
const manifest = JSON.parse(readFileSync(path.resolve(__dirname, 'manifest.json'), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __MOD_VERSION__: JSON.stringify(manifest.version),
  },
  resolve: {
    alias: {
      'react/jsx-runtime': path.resolve(__dirname, 'src/types/react.ts'),
      'react': path.resolve(__dirname, 'src/types/react.ts'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
    keepNames: true,
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      formats: ['iife'],
      name: 'SubwayMod',
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.',
        },
        {
          src: 'neighborhood-station-names-mod.png',
          dest: '.',
        },
      ],
    }),
  ],
});
