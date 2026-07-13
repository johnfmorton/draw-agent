import { defineConfig } from 'vite';
import { artFilesPlugin } from './src/vite-plugins/art-files';

export default defineConfig({
  plugins: [artFilesPlugin()],
  server: {
    port: 5173,
    open: true,
  },
});
