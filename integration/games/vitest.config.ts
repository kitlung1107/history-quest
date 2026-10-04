import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['integration/games/*.test.ts'],testTimeout:90000,hookTimeout:30000,pool:'forks',poolOptions:{forks:{singleFork:true}}}});
