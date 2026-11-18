import test from 'node:test';
import assert from 'node:assert/strict';
import {routeEdges,crossesRect,roundedPath} from '../src/commercial/edge-router.mjs';
test('routes around a blocking node, follows moved nodes and chooses reversed ports',()=>{
 for(const nodes of [[{x:0,y:0,w:100,h:100},{x:400,y:0,w:100,h:100},{x:180,y:-60,w:100,h:220}],[{x:400,y:300,w:100,h:100},{x:0,y:0,w:100,h:100},{x:180,y:0,w:100,h:280}]]){
  const [path]=routeEdges(nodes,[[0,1]]);assert.ok(path.length>=4);for(let i=1;i<path.length;i++){assert.ok(path[i].x===path[i-1].x||path[i].y===path[i-1].y);assert.equal(crossesRect(path[i-1],path[i],nodes[2]),false);}assert.ok(roundedPath(path).includes('Q'));
 }
});
test('coincident nodes do not create a spurious through-node edge',()=>{const r={x:0,y:0,w:100,h:100};assert.deepEqual(routeEdges([r,r],[[0,1]])[0],[]);});
