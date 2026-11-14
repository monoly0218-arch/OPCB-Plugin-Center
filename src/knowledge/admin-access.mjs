export function effectiveAccess(policy,owner,library){
  if(policy.disabled.includes(owner))return false;
  let granted=false;const seen=new Set();
  while(library!==null){if(seen.has(library))return false;seen.add(library);const lib=policy.libraries.find(l=>l.id===library);if(!lib)return false;const rule=policy.grants.find(g=>g.owner===owner&&g.library===library);if(rule){if(!rule.allow)return false;granted=true;}library=lib.parent;}
  return granted;
}
