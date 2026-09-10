const http=require('http');
const fs=require('fs');
const path=require('path');

const ROOT=__dirname;
const PORT=Number(process.env.PORT||4173);
const MIME={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp'
};

function safePath(urlPath){
  const clean=decodeURIComponent(urlPath.split('?')[0]);
  const relative=clean==='/'?'app/index.html':clean.replace(/^\/+/, '');
  const resolved=path.resolve(ROOT,relative);
  return resolved.startsWith(ROOT)?resolved:null;
}

const server=http.createServer((req,res)=>{
  let file=safePath(req.url||'/');
  if(!file){res.writeHead(403);res.end('Forbidden');return}
  try{
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return}
    res.writeHead(200,{
      'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream',
      'Cache-Control':'no-store'
    });
    fs.createReadStream(file).pipe(res);
  }catch(error){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end(error.message)}
});

server.listen(PORT,'127.0.0.1',()=>{
  console.log('\nFantasy Intel local app is running.\n');
  console.log(`House of the Dragon: http://localhost:${PORT}/app/?league=497223&team=6`);
  console.log(`TEAM DOG SCIENCE:    http://localhost:${PORT}/app/?league=497223&team=1`);
  console.log(`Choose a team:       http://localhost:${PORT}/app/?league=497223`);
  console.log('\nPress Ctrl+C to stop.\n');
});
