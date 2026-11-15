// Buzz v1.0.2 uses session.media for remote avatars, including public profiles.
// The returned host URL may use a native scheme; do not re-filter it as HTTPS.
export function avatarSource(value,media) {
 if(typeof value!=='string')return;
 const source=value.trim();
 if(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/]+=*$/.test(source))return source.length<=512*1024?source:undefined;
 if(source.length>2048)return;
 try {
  const url=new URL(source);
  if(url.protocol!=='https:'||url.username||url.password||typeof media!=='function')return;
  return media(url.href,'small');
 }catch{return;}
}
