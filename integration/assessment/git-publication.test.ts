import {test,expect} from 'vitest';
import {publishGitAssessment} from '../../client/src/lib/assessmentGitPublisher';
import {prepareAssessmentVersion} from '../../client/src/lib/assessmentPublication';
import {readFileSync} from 'node:fs';
const published=()=>prepareAssessmentVersion({id:'task-unicode',type:'quiz'} as any,[{id:'q1',type:'choice',prompt:'圖片題幹 ![](/images/example.webp)',points:10,options:['石器','青銅'],answer:1,explanation:'PRIVATE_EXPLANATION'}],'石器・重溫','繁體中文','opaque-v2');
function repository(initial:any,loseReply=false){
 let task=initial,sha=initial?'old-sha':null,puts=0;const sent:any[]=[];
 const request=async(url:any,options:any={})=>{
  expect(String(url)).toMatch(/^https:\/\/api.github.com\/repos\/kitlung1107\/history-quest\/contents\/client\/src\/content\/tasks\//);
  if(options.method==='PUT'){
   puts++;const body=JSON.parse(options.body);sent.push(body);expect(body.branch).toBe('main');expect(body.sha??null).toBe(sha);
   task=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));sha='new-sha';
   if(loseReply){loseReply=false;throw Error('network reply lost');}
   return new Response(JSON.stringify({commit:{sha:'commit-sha',html_url:'https://github.com/kitlung1107/history-quest/commit/commit-sha'}}),{status:201});
  }
  return task?new Response(JSON.stringify({type:'file',sha,content:Buffer.from(JSON.stringify(task)).toString('base64')})):new Response('{}',{status:404});
 };return{request:request as typeof fetch,sent,puts:()=>puts,task:()=>task};
}
test('CMS publication preserves Unicode and images and sends only public fields to the existing repository',async()=>{
 const split=published(),repo=repository(null);
 const result=await publishGitAssessment('client/src/content/tasks/task-unicode.json',split.publicTask,null,'existing-token',repo.request);
 expect(result.verified).toBe(true);expect(repo.task()).toEqual(split.publicTask);expect(JSON.stringify(repo.task())).not.toContain('PRIVATE_EXPLANATION');expect(repo.task().questions[0]).not.toHaveProperty('answer');expect(repo.puts()).toBe(1);
});
test('a lost publish reply retries the same public version without another commit',async()=>{
 const split=published(),repo=repository({task_id:'task-unicode',title:'舊版'},true);
 await expect(publishGitAssessment('client/src/content/tasks/task-unicode.json',split.publicTask,'old-sha','existing-token',repo.request)).rejects.toThrow('network reply lost');
 const retry=await publishGitAssessment('client/src/content/tasks/task-unicode.json',split.publicTask,'old-sha','existing-token',repo.request);
 expect(retry.alreadyPublished).toBe(true);expect(repo.puts()).toBe(1);
});
test('another editor, missing connection, private data, or an unrelated path prevents public writes',async()=>{
 const split=published(),repo=repository({title:'someone else'});
 await expect(publishGitAssessment('client/src/content/tasks/task-unicode.json',split.publicTask,'stale-sha','existing-token',repo.request)).rejects.toThrow('另一位');
 await expect(publishGitAssessment('client/src/content/tasks/task-unicode.json',split.publicTask,'old-sha','',repo.request)).rejects.toThrow('既有');
 await expect(publishGitAssessment('client/src/content/tasks/task-unicode.json',{...split.publicTask,nested:{rubric:'secret'}},'old-sha','existing-token',repo.request)).rejects.toThrow('公開教材');
 await expect(publishGitAssessment('.github/workflows/deploy-pages.yml',split.publicTask,'old-sha','existing-token',repo.request)).rejects.toThrow('只能');expect(repo.puts()).toBe(0);
});
test('the public CMS routes quiz authoring to private publication and offers no answer editor for articles',()=>{
 const y=readFileSync('client/public/cms/config.yml','utf8'),article=y.split('  - name: tasks_article')[1].split('  - name: tasks_game')[0];
 expect(y).not.toContain('  - name: tasks_quiz');expect(article).not.toContain('name: answer');expect(article).not.toContain('name: explanation');expect(readFileSync('client/public/cms/index.html','utf8')).toContain('href="../assessment-cms"');
});
