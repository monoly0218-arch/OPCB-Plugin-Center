import {exactFlowMessage} from '../tasks/lifecycle-agent.mjs';
import {agentContext} from '../mobile-design/binding.mjs';
export function registerProductionAgent(ctx,store){
 ctx.agents.addInstructions?.({id:'factory-production',text:'内容工厂制作：仅在对应素材的私人Solo收到本人明确执行要求后操作。先用opcb_factory_execution读取当前制作版本及revision；实际执行后才start，生成失败用fail并保留真实原因和版本回执；成片作为原生消息附件交付，回执独立一行包含production_version: 对应version_id，再调用deliver核对该消息。每次写入需本人request_id、expected_revision、version_id，失败/交付需evidence_id。工具不调用供应商、不认领账号、不付费。只有本人在页面验收当前版本后才显示绿色；不得替本人验收。提示词和物料封存后需新建版本修改；不同版本、失败记录与材料都保留。Higgsfield号池尚待接入，不凭空声称已认领或开始生成。'});
 ctx.agents.addTool({name:'opcb_factory_execution',description:'读取当前内容工厂素材Solo的制作版本；按本人明确指令及真实执行回执保存制作输入与物料，记录执行中、失败或成片待验收。不会调用生成、认领账号或代替本人验收。',inputSchema:{type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['read','save_inputs','add_material','start','fail','deliver']},expected_revision:{type:'integer',minimum:0},version_id:{type:'string'},request_id:{type:'string'},evidence_id:{type:'string'},result_url:{type:'string'},kind:{type:'string',enum:['reference','product','person','other']},prompt:{type:'string',maxLength:16000},plan:{type:'string',maxLength:16000},reason:{type:'string',maxLength:3000}}},
  async call(client,context,args){
   const {connection,check}=agentContext(ctx,client,context),s=connection.session;
   const channel=s.channels.list().channels.find(c=>c.id===context.channel);
   if(channel?.channelType!=='solo'||channel.private!==true||channel.creator!==client.owner||channel.members?.length!==2)throw Error('只能在本人和本Agent的素材专属Solo使用');
   const record=await store.load(context.channel);check();const doc=record.doc;
   if(doc.owner!==client.owner)throw Error('制作记录所属人不一致');
   if(!args.action||args.action==='read')return JSON.stringify({channel:record.channel,production:doc});
   const request=await exactFlowMessage(s,client,context.channel,args.request_id,check);
   if(request.authorId!==client.owner)throw Error('制作变更需要本人原始执行指令');
   const version=doc.versions.find(v=>v.id===args.version_id);if(!version||!Number.isFinite(request.createdAt)||request.createdAt*1000+999<version.createdAt)throw Error('需本制作版本建立后的本人执行指令');
   let file;
   if(['fail','deliver','add_material'].includes(args.action)){
    const evidence=await exactFlowMessage(s,client,context.channel,args.evidence_id,check);
    if(!Number.isFinite(evidence.createdAt)||evidence.createdAt<request.createdAt||evidence.createdAt*1000+999<version.createdAt||evidence.authorId!==client.pubkey||!(evidence.content||'').split('\n').some(line=>line.trim()==='production_version: '+args.version_id))throw Error('执行回执须由当前Agent发布并标明准确制作版本');
    if(['deliver','add_material'].includes(args.action)){
     const files=(evidence.attachments||[]).filter(a=>!args.result_url||a.url===args.result_url);
     if(files.length!==1)throw Error('请指定交付消息中唯一的成片附件');
     const a=files[0];if(args.action==='deliver'&&!/^(video\/|image\/)/.test(a.mime||a.type||''))throw Error('交付须为真实成片或结果图片');
     const hash=a.sha256||new URL(a.url).pathname.match(/(?:^|\/)([0-9a-f]{64})(?:\.|$)/)?.[1];
     file={name:a.name,url:a.url,type:a.mime||a.type,size:a.size,sha256:hash};
    }
   }
   check();const result=await store.mutate(doc.cardId,({save_inputs:'edit',add_material:'material'})[args.action]||args.action,{...args,file},{owner:client.owner,pubkey:client.pubkey});check();
   return JSON.stringify({saved:true,production:result.doc});
  }});
}
