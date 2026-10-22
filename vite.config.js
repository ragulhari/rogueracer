import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // script clássico (IIFE): roda embutido no HTML e também aberto direto do disco
    modulePreload: false,
    chunkSizeWarningLimit: 1000, // o Three.js sozinho passa de 500 kB
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
