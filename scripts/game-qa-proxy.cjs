const http=require('node:http');let blocked=false;const active=new Set();
http.createServer((req,res)=>{
 if(req.url.startsWith('/__qa/')){
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5177');
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.writeHead(204).end();return;}
  if(req.method!=='POST'){res.writeHead(405).end();return;}
  blocked=req.url==='/__qa/offline';
  if(blocked)for(const upstream of active)upstream.destroy();
  res.end(JSON.stringify({blocked}));console.log(blocked?'QA network disconnected':'QA network restored');return;
 }
 if(blocked){res.setHeader('Access-Control-Allow-Origin','*');res.writeHead(503).end('QA offline');return;}
 const upstream=http.request({hostname:'127.0.0.1',port:8086,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:8086'}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
 active.add(upstream);upstream.on('close',()=>active.delete(upstream));upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});req.pipe(upstream);res.on('close',()=>upstream.destroy());
}).listen(8088,'127.0.0.1',()=>console.log('Firestore local-only QA proxy on 8088 -> 8086'));
