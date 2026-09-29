// Local-only synthetic identity service. Never uses the production project.
const { AuthEmulator } = require('firebase-tools/lib/emulator/auth/index.js');
new AuthEmulator({ projectId: 'demo-game-sync', host: '127.0.0.1', port: 9098, singleProjectMode: 0 })
  .start().then(() => console.log('Local game Auth emulator ready on 9098'));
