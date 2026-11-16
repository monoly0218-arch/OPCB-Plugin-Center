import React from 'react';
import {createRoot} from 'react-dom/client';
import {createCalendarApp} from '../src/Calendar.jsx';
import styles from '../src/calendar.css';
async function api(path,options){const r=await fetch(path,{...options,headers:{'content-type':'application/json'}});const data=await r.json();if(!r.ok){const error=new Error(data.error);error.status=r.status;throw error;}return data;}
const App=createCalendarApp(React,{read:()=>api('/api/state'),write:payload=>api('/api/mutate',{method:'POST',body:JSON.stringify(payload)}),operation:id=>api('/api/operations/'+encodeURIComponent(id)),subscribe:fn=>{const events=new EventSource('/api/events');events.onmessage=fn;return()=>events.close();}},{styles,preview:true});
createRoot(document.getElementById('root')).render(<App/>);
