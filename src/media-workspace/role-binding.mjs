// Transitional client mapping; server-side Buzz signature authorization is planned.
// Sources: current work-group membership (7dc199bc-755b-47bb-8f71-fe311b1f1ab1),
// plugin-center CONTRIBUTORS.json; owner request 76aa7052f80b658d7d8a8eaa83ade1651adc2c8bafa980d45c736da146a0811f.
export const COMMUNITY = '12f6870117eff1a6318bd38c82a65d51dd19879b7489f57247114d0ee8a96de3';
const bindings = Object.freeze({
 '96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d': {name:'潘涛',factory:'潘涛',assets:'pantao'},
 '5be409cbf6fd2933fa7cdee1beebfb1ccc6ecebdc60c086c989510dcc0d0c6af': {name:'小跑',factory:'小跑',assets:'xiaopao'},
 'b1a14093d2e2a28a0b1fb0140e153727e593b94990ed7cfe584af191efda2a88': {name:'小跑',factory:'小跑',assets:'xiaopao'},
 'f890a61d715d51467def06d8ee1d8e66bf0bcb8acb0b743121bc91c698421e0d': {name:'周洋',factory:'周洋'},
 '018e71f16a423938f5c5bbf19e40f2f8c88fb9a93c8da29481d01c5214fed285': {name:'Steven'},
 '5770c1ebb2a1d76ccd7fc7231036f74bb9ee13d95b5e0070b55d2b5b0a234f48': {name:'Moo',factory:'mo'},
});
export function roleBinding(connection,service) {
 if(!['factory','assets'].includes(service))throw Error('未知工作区');
 if(connection?.status!=='ready'||connection.cached||connection.session?.relayAuthor!==COMMUNITY)
   throw Error('请连接跑圈集团的当前 Buzz 账号');
 const binding = Object.hasOwn(bindings,connection.session.viewer)?bindings[connection.session.viewer]:null;
 if(!binding?.[service])throw Error('当前 Buzz 账号尚未分配此工作区角色，请联系管理员开通');
 return Object.freeze({owner:connection.session.viewer,community:COMMUNITY,name:binding.name,member:binding[service]});
}
