import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, serverTimestamp, writeBatch, runTransaction } from 'firebase/firestore';
let env;
const claims=email=>({email,email_verified:true,firebase:{sign_in_provider:'google.com'}});
const profile={className:'1A',studentNo:'01',name:'測試學生',nickname:'探險家',avatar:'explorer',configured:false};
const student=()=>env.authenticatedContext('uid-a',claims('student@ctshkpcc.edu.hk')).firestore();
const teacher=()=>env.authenticatedContext('teacher',claims('kitlung1107@gmail.com')).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-hdc',firestore:{rules:await readFile('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();await setDoc(doc(db,'profiles','s1'),profile);await setDoc(doc(db,'profiles','s2'),{...profile,studentNo:'02'});
 await setDoc(doc(db,'access','student@ctshkpcc.edu.hk'),{studentId:'s1',enabled:true});
 await setDoc(doc(db,'access','approved@gmail.com'),{studentId:'s1',enabled:true});
});});
test('unauthenticated and unlisted school accounts cannot read student profiles',async()=>{
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'profiles','s1')));
 await assertFails(getDoc(doc(env.authenticatedContext('other',claims('other@ctshkpcc.edu.hk')).firestore(),'profiles','s1')));
});
test('approved student can read own profile but not another student or account list',async()=>{
 const db=student();await assertSucceeds(getDoc(doc(db,'profiles','s1')));await assertFails(getDoc(doc(db,'profiles','s2')));await assertFails(getDocs(collection(db,'access')));
});
test('students can customise role but cannot change identity or approve accounts',async()=>{
 const db=student();await assertSucceeds(updateDoc(doc(db,'profiles','s1'),{nickname:'新角色',configured:true}));
 await assertFails(updateDoc(doc(db,'profiles','s1'),{studentNo:'02'}));await assertFails(setDoc(doc(db,'profiles','uid-a'),profile));
 await assertFails(setDoc(doc(db,'access','other@gmail.com'),{studentId:'s1',enabled:true}));
});
test('approved Gmail uses same record; disabled or unverified account is denied',async()=>{
 await assertSucceeds(getDoc(doc(env.authenticatedContext('external',claims('approved@gmail.com')).firestore(),'profiles','s1')));
 await assertFails(getDoc(doc(env.authenticatedContext('fake',{...claims('approved@gmail.com'),email_verified:false}).firestore(),'profiles','s1')));
 await assertSucceeds(updateDoc(doc(teacher(),'access','approved@gmail.com'),{enabled:false}));
 await assertFails(getDoc(doc(env.authenticatedContext('external2',claims('approved@gmail.com')).firestore(),'profiles','s1')));
});
async function submit(db,id='attempt1'){
 return runTransaction(db,async tx=>{const ref=doc(db,'submissions',id);const prev=await tx.get(ref);if(prev.exists())return;tx.set(ref,{studentId:'s1',taskId:'task1',version:'v1',answers:[{question_id:'q1',value:0}],createdAt:serverTimestamp()});tx.set(doc(db,'progress','s1','tasks','task1'),{score:0,progress:100,attemptId:id,syncedAt:serverTimestamp()});});
}
test('submission + progress transaction succeeds and retry is idempotent',async()=>{
 const db=student();await assertSucceeds(submit(db));await assertSucceeds(submit(db));assert.equal((await getDoc(doc(db,'progress','s1','tasks','task1'))).data().score,0);
 await assertSucceeds(getDocs(query(collection(db,'submissions'),where('studentId','==','s1'))));
});
test('student cannot submit as another student, write scores, or replay old progress',async()=>{
 const db=student();await assertSucceeds(submit(db));
 await assertFails(setDoc(doc(db,'submissions','fake'),{studentId:'s2',taskId:'task1',version:'v1',answers:[],createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db,'submissions','attempt1'),{grade:{score:100}}));
 await assertFails(updateDoc(doc(db,'submissions','attempt1'),{answers:[]}));
 await assertFails(updateDoc(doc(db,'progress','s1','tasks','task1'),{score:100}));
 await assertSucceeds(updateDoc(doc(teacher(),'progress','s1','tasks','task1'),{score:80}));
 await assertFails(setDoc(doc(db,'progress','s1','tasks','task1'),{score:0,progress:100,attemptId:'attempt1',syncedAt:serverTimestamp()}));
});
test('teacher can grade, but cannot change original answers via client',async()=>{
 await submit(student());await assertSucceeds(updateDoc(doc(teacher(),'submissions','attempt1'),{grade:{score:80,revision:1}}));
 await assertFails(updateDoc(doc(teacher(),'submissions','attempt1'),{answers:[]}));
});
