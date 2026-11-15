const BEGIN='<!-- opcb-brand-growth-plan-v1:begin -->',END='<!-- opcb-brand-growth-plan-v1:end -->';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Read the original shared plan, not a second copy bundled with the plugin.
export function operationSections(content){
 const a=content.split(BEGIN),b=content.split(END);
 if(a.length===1&&b.length===1)return [];
 if(a.length!==2||b.length!==2||content.indexOf(END)<content.indexOf(BEGIN))throw Error('运营计划章节不完整，请核对共享来源');
 const text=a[1].split(END)[0],matches=[...text.matchAll(/^#{2,4} (\d+)\. (.+)$/gm)];
 return matches.map((m,i)=>{const body=text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).trim();return {id:m[1],title:m[2],body,summary:body.split('\n').find(l=>l.trim()&&!/^[#|]/.test(l))?.replace(/\*\*/g,'').split(/[。；]/)[0].slice(0,80)||'展开查看执行明细'};});
}
const inline=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>');
const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
// Deliberately small Markdown subset: source HTML and links remain inert text.
// Wide tables become disclosure rows so every column remains readable on phones.
export function renderOperationMarkdown(markdown){
 const lines=markdown.split('\n'),out=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();if(!line)continue;
  if(line.startsWith('|')&&/^\|?[\s:|-]+\|?$/.test(lines[i+1]?.trim()||'')){
   const headers=cells(line);i++;
   while(i+1<lines.length&&lines[i+1].trim().startsWith('|')){
    const row=cells(lines[++i]);out.push(`<details class="operation-row"><summary>${inline(row[0])}</summary><dl>${headers.slice(1).map((h,k)=>`<div><dt>${inline(h)}</dt><dd>${inline(row[k+1]||'未登记')}</dd></div>`).join('')}</dl></details>`);
   }
  }else if(/^#{1,6} /.test(line))out.push(`<h2>${inline(line.replace(/^#+ /,''))}</h2>`);
  else if(/^[-*] /.test(line)||/^\d+[.)、] /.test(line))out.push(`<p class="operation-bullet">${inline(line)}</p>`);
  else out.push(`<p>${inline(line)}</p>`);
 }
 return out.join('');
}

export function operationTables(markdown=''){
 const lines=markdown.split('\n'),tables=[];
 for(let i=0;i<lines.length-1;i++)if(lines[i].trim().startsWith('|')&&/^\|?[\s:|-]+\|?$/.test(lines[i+1].trim())){
  const headers=cells(lines[i]),rows=[];i++;
  while(i+1<lines.length&&lines[i+1].trim().startsWith('|'))rows.push(cells(lines[++i]));
  tables.push({headers,rows});
 }
 return tables;
}
