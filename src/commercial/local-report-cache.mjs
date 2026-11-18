import {authorizeSource,requireReportChannel} from './model.mjs';

export const REPORT_CACHE_KEY='last-report';
const maxBytes=2*1024*1024;

export function reportScope(connection){
 return JSON.stringify([connection.session.viewer,connection.scope]);
}

export function createReportSnapshot(connection,data,sourceChannels,savedAt=Date.now()){
 const {mobileObjectURL,mobileRevision,...reviewAssets}=data.reviewAssets||{};
 const snapshot={
  schema:1,scope:reportScope(connection),savedAt,
  channels:[...new Set(sourceChannels)],
  data:{...data,reviewAssets}
 };
 return snapshot;
}

export function canStoreReportSnapshot(snapshot){
 return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength<=maxBytes;
}

export function readReportSnapshot(snapshot,connection,current){
 if(!snapshot||snapshot.schema!==1||snapshot.scope!==reportScope(connection)||
    !Number.isFinite(snapshot.savedAt)||!Array.isArray(snapshot.channels)||
    !snapshot.data?.renderKey||!Array.isArray(snapshot.data.tasks))return null;
 authorizeSource(connection,current);
 for(const id of snapshot.channels)requireReportChannel(connection.session,id);
 return snapshot.data;
}
