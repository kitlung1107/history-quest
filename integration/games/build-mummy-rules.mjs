import {readFileSync} from 'node:fs';
export function addMummyRules(input){
  if(input.includes('// Mummy: five final choices'))throw Error('Mummy Rules already added');
  input=input.replace('allow create: if grSessionCreate(session);',"allow create: if request.resource.data.get('protocol','')=='rules-game/1' && grSessionCreate(session);");
  input=input.replace("allow create: if session.matches('[a-zA-Z0-9-]{1,80}') && gameOwner(request.resource.data)","allow create: if request.resource.data.get('protocol','')=='' && request.resource.data.gameId!='mummy-workshop' && session.matches('[a-zA-Z0-9-]{1,80}') && gameOwner(request.resource.data)");
  // Reserve this ledger key in every older reward path, including teacher confirmations.
  const start=input.indexOf('    match /coinAccounts/{sid}/entries/{entry} {');
  const end=input.indexOf('\n    match /',start+20);
  if(start<0||end<0)throw Error('Ledger block missing');
  let ledger=input.slice(start,end).replaceAll('allow create: if ',"allow create: if entry!='S1_Mummy_Workshop' && ").replaceAll('allow update: if ',"allow update: if entry!='S1_Mummy_Workshop' && ");
  // Parenthesize the legacy ternary, otherwise the false arm can bypass the reservation.
  ledger=ledger.replace("entry!='S1_Mummy_Workshop' && request.resource.data.kind == 'cardDraw'", "entry!='S1_Mummy_Workshop' && (request.resource.data.kind == 'cardDraw'").replace(': positiveReward();',': positiveReward());');
  input=input.slice(0,start)+ledger+input.slice(end);
  input=input.replace("allow create: if teacher() && request.resource.data.keys().hasOnly(['enabled','title','taskId','questionCount'])", "allow create: if teacher() && (request.resource.data.keys().hasOnly(['enabled','title','taskId','questionCount']) || (game=='mummy-workshop' && request.resource.data.keys().hasOnly(['enabled','title','taskId','questionCount','protocol','answerKey']) && request.resource.data.protocol=='mummy-game/1' && request.resource.data.taskId=='S1_Mummy_Workshop' && request.resource.data.questionCount==5 && mmAnswers(request.resource.data.answerKey)))");
  return input.replace(/  }\s*}\s*$/,readFileSync('integration/games/mummy.rules','utf8')+'\n  }\n}\n');
}
