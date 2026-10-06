import {readFileSync} from 'node:fs'
const r=JSON.parse(readFileSync(process.argv[2],'utf8'))
console.log('click',r.clickPerf,'end',r.endPerf,'stage',JSON.stringify(r.stage))
console.log('gaps>300',JSON.stringify(r.gaps.filter(g=>g.gap>300)))
console.log('long>=300',JSON.stringify(r.long.filter(l=>l.dur>=300)))
console.log('errors',JSON.stringify(r.console.filter(c=>c[1]==='error').slice(0,5)))
if(r.gpu){
 console.log('slow gpu calls:'); r.gpu.slow.filter(s=>s.at>=r.clickPerf).sort((a,b)=>b.ms-a.ms).slice(0,12).forEach(s=>console.log(s.at,s.ms,s.call,s.label,s.size,'\n    ',s.stack))
 console.log('tot',Object.entries(r.gpu.tot).sort((a,b)=>b[1].ms-a[1].ms).slice(0,8).map(([k,v])=>k+' n='+v.n+' ms='+v.ms).join(' | '))
}
if(r.worstWindow){console.log('worstWindow self');r.worstWindow.self.slice(0,6).forEach(x=>console.log(' ',x[1],x[0]))}
console.log('whole file');r.whole.file.slice(0,8).forEach(x=>console.log(' ',x[1],x[0]))
