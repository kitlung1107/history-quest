// Run only for an explicitly authorized production release using Firebase CLI login.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
(async () => {
  const project = read('.firebaserc').projects.default;
  assert.equal(project, 'history-discovery-center');
  const grades = read('client/src/content/settings/grades.json').grades;
  const topics = fs.readdirSync('client/src/content/topics').filter(f => f.endsWith('.json')).map(f => read(`client/src/content/topics/${f}`));
  const tasks = fs.readdirSync('client/src/content/tasks').filter(f => f.endsWith('.json')).map(f => read(`client/src/content/tasks/${f}`));
  const base = `projects/${project}/databases/(default)/documents`;
  const docs = tasks.map(task => {
    const topic = topics.find(t => t.id === task.topicId);
    assert.ok(topic && Number.isInteger(topic.grade) && topic.grade >= 1 && topic.grade <= 6, `Invalid topic: ${task.task_id}`);
    return { name: `${base}/taskAccess/${task.task_id}`, fields: {
      grade: { integerValue: String(topic.grade) },
      enabled: { booleanValue: Boolean(task.visible && topic.visible && grades.some(g => g.grade === topic.grade && g.visible)) },
    } };
  });
  assert.ok(docs.length && new Set(docs.map(d => d.name)).size === docs.length);
  const opts = { project, nonInteractive: true };
  auth.setActiveAccount(opts, auth.getGlobalDefaultAccount());
  await requireAuth(opts);
  const api = new Client({ auth: true, apiVersion: 'v1', urlPrefix: 'https://firestore.googleapis.com' });
  const before = await api.post(`${base}:batchGet`, { documents: docs.map(d => d.name) });
  const backup = `tmp/task-access-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(backup, JSON.stringify(before.body, null, 2));
  const found = new Map(before.body.filter(r => r.found).map(r => [r.found.name, r.found]));
  for (const d of docs) {
    const old = found.get(d.name);
    await api.post(`${base}:commit`, { writes: [{ update: d, currentDocument: old ? { updateTime: old.updateTime } : { exists: false } }] });
  }
  const after = await api.post(`${base}:batchGet`, { documents: docs.map(d => d.name) });
  const verified = new Map(after.body.filter(r => r.found).map(r => [r.found.name, r.found]));
  for (const d of docs) assert.deepEqual(verified.get(d.name)?.fields, d.fields);
  console.log(JSON.stringify({ project, backup, verified: true, tasks: docs.map(d => ({ taskId: d.name.split('/').pop(), grade: Number(d.fields.grade.integerValue), enabled: d.fields.enabled.booleanValue })) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
