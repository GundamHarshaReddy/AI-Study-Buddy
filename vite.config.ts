import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1000, // Increase warning limit to 1000kb
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'markdown': ['react-markdown', 'react-syntax-highlighter'],
          'auth': ['@supabase/supabase-js'],
          'icons': ['lucide-react'],
        }
      }
    }
  },
  server: {
    port: 3000,
    strictPort: true,
  }
});
