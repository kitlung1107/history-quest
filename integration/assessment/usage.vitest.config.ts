import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:process.env.USAGE_TEACHER?['integration/assessment/teacher-usage.test.ts']:['integration/assessment/usage.test.ts'],testTimeout:240000,hookTimeout:60000,pool:'forks',poolOptions:{forks:{singleFork:true}}}});
