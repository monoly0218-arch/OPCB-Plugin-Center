// Orthogonal visibility-grid routing. Nodes are obstacles; bends and shared lanes
// have a cost. Coordinates are in canvas space, independent of zoom and pan.
const inside=(p,r)=>p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h;
export function crossesRect(a,b,r){
 if(a.x===b.x)return a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h;
 return a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w;
}
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
function ports(r,gap){return [{x:r.x+r.w/2,y:r.y,dx:0,dy:-1},{x:r.x+r.w,y:r.y+r.h/2,dx:1,dy:0},{x:r.x+r.w/2,y:r.y+r.h,dx:0,dy:1},{x:r.x,y:r.y+r.h/2,dx:-1,dy:0}].map(p=>({...p,stub:{x:p.x+p.dx*gap,y:p.y+p.dy*gap}}));}
function simplify(points){return points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y).filter((p,i,a)=>!i||i===a.length-1||!(a[i-1].x===p.x&&p.x===a[i+1].x||a[i-1].y===p.y&&p.y===a[i+1].y));}
class Heap{
 values=[];
 push(v){const a=this.values;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p].rank<=v.rank)break;a[i]=a[p];i=p;}a[i]=v;}
 pop(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].rank<a[c].rank)c++;if(a[c].rank>=last.rank)break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
function findPath(start,end,rects,previous){
 const xs=[...new Set([start.x,end.x,...rects.flatMap(r=>[r.x,r.x+r.w])])].sort((a,b)=>a-b),ys=[...new Set([start.y,end.y,...rects.flatMap(r=>[r.y,r.y+r.h])])].sort((a,b)=>a-b);
 const width=xs.length,point=id=>({x:xs[id%width],y:ys[Math.floor(id/width)]}),begin=ys.indexOf(start.y)*width+xs.indexOf(start.x),finish=ys.indexOf(end.y)*width+xs.indexOf(end.x);
 if(rects.some(r=>inside(start,r)||inside(end,r)))return null;
 const costs=new Map(),parents=new Map(),queue=new Heap();queue.push({id:begin,dir:0,cost:0,rank:distance(start,end)});costs.set(begin*3,0);
 let terminal;
 while(queue.values.length){const cur=queue.pop(),key=cur.id*3+cur.dir;if(cur.cost!==costs.get(key))continue;if(cur.id===finish){terminal=key;break;}
  const x=cur.id%width,y=Math.floor(cur.id/width),a=point(cur.id);
  for(const [nx,ny,dir] of [[x-1,y,1],[x+1,y,1],[x,y-1,2],[x,y+1,2]]){
   if(nx<0||nx>=xs.length||ny<0||ny>=ys.length)continue;const id=ny*width+nx,b=point(id);if(rects.some(r=>inside(b,r)||crossesRect(a,b,r)))continue;
   let penalty=0;for(const path of previous)for(let i=1;i<path.length;i++){const c=path[i-1],d=path[i];if(a.x===b.x&&c.x===d.x&&a.x===c.x&&Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y))<Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))||a.y===b.y&&c.y===d.y&&a.y===c.y&&Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x)))penalty+=35;else if((a.x===b.x)!==(c.x===d.x)){const v=a.x===b.x?[a,b,c,d]:[c,d,a,b];if(v[0].x>Math.min(v[2].x,v[3].x)&&v[0].x<Math.max(v[2].x,v[3].x)&&v[2].y>Math.min(v[0].y,v[1].y)&&v[2].y<Math.max(v[0].y,v[1].y))penalty+=70;}}
   const cost=cur.cost+distance(a,b)+(cur.dir&&cur.dir!==dir?24:0)+penalty,next=id*3+dir;if(cost>=(costs.get(next)??Infinity))continue;costs.set(next,cost);parents.set(next,key);queue.push({id,dir,cost,rank:cost+distance(b,end)});
  }
 }
 if(terminal===undefined)return null;const result=[];for(let key=terminal;key!==undefined;key=parents.get(key))result.unshift(point(Math.floor(key/3)));return {points:simplify(result),cost:costs.get(terminal)};
}
export function routeEdges(nodes,edges,{clearance=16}={}){
 const rects=nodes.map(r=>({...r,x:r.x-clearance,y:r.y-clearance,w:r.w+clearance*2,h:r.h+clearance*2})),paths=[];
 return edges.map(([source,target])=>{
  const a=nodes[source],b=nodes[target];if(!a||!b)return [];
  const candidates=ports(a,clearance).flatMap(p=>ports(b,clearance).map(q=>({p,q,score:distance(p.stub,q.stub)+(p.dx*(q.x-p.x)+p.dy*(q.y-p.y)<0?100:0)+(q.dx*(p.x-q.x)+q.dy*(p.y-q.y)<0?100:0)}))).sort((a,b)=>a.score-b.score);
  let best;for(const {p,q} of candidates){if(rects.some((r,i)=>i!==source&&crossesRect(p,p.stub,r)||i!==target&&crossesRect(q,q.stub,r)))continue;const found=findPath(p.stub,q.stub,rects,paths);if(found){const points=simplify([{x:p.x,y:p.y},...found.points,{x:q.x,y:q.y}]);const cost=found.cost+points.length*10;if(!best||cost<best.cost)best={points,cost};}if(best&&best.cost<=distance(a,b)+120)break;}
  // Overlapping nodes may have no free port. Omit that edge until separated,
  // rather than drawing a misleading line through another module.
  const points=best?.points||[];paths.push(points);return points;
 });
}
export function roundedPath(points,radius=8){
 if(!points.length)return '';let d=`M${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length-1;i++){const a=points[i-1],b=points[i],c=points[i+1],r=Math.min(radius,distance(a,b)/2,distance(b,c)/2),before={x:b.x+Math.sign(a.x-b.x)*r,y:b.y+Math.sign(a.y-b.y)*r},after={x:b.x+Math.sign(c.x-b.x)*r,y:b.y+Math.sign(c.y-b.y)*r};d+=`L${before.x} ${before.y}Q${b.x} ${b.y} ${after.x} ${after.y}`;}
 const last=points.at(-1);return d+`L${last.x} ${last.y}`;
}
