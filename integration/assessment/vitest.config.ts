import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['integration/assessment/integration.test.ts','integration/assessment/formal-readiness.test.ts'],testTimeout:60000,hookTimeout:60000,pool:'forks',poolOptions:{forks:{singleFork:true}}}});
