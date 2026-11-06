import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readSupabaseConfig } from './src/remote/config.js';

export default defineConfig(({ mode }) => {
  // Fail before bundling if a privileged key was accidentally put in public config.
  readSupabaseConfig(loadEnv(mode, process.cwd(), 'VITE_SUPABASE_'));
  return { plugins: [react()], base: './' };
});
