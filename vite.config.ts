import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readSupabaseConfig } from './src/remote/config.ts';

export default defineConfig(({ mode }) => {
  // Fail before bundling if a privileged key was accidentally put in public config.
  readSupabaseConfig(loadEnv(mode, process.cwd(), 'VITE_SUPABASE_'));
  return {
    plugins: [react()],
    base: './',
    ...(mode === 'public'
      ? {
          define: { 'import.meta.env.VITE_DEFAULT_VIEW': JSON.stringify('public') },
          build: { outDir: 'dist-public' },
        }
      : {}),
  };
});
