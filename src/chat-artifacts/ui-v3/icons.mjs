/** Original vector assets. Geometry and palette stay identical across platforms. */
const p=(d,fill,extra={})=>['path',{d,fill,...extra}];
const r=(x,y,width,height,rx,fill)=>['rect',{x,y,width,height,rx,fill}];
const c=(cx,cy,radius,fill)=>['circle',{cx,cy,r:radius,fill}];
const line=(d,color,width=1.8)=>p(d,'none',{stroke:color,strokeWidth:width,strokeLinecap:'round',strokeLinejoin:'round'});
export const SHAPES=Object.freeze({
 calendar:[r(3,4,18,17,4,'#edb91f'),r(3,4,18,5,3,'#ffd851'),r(7,2,2,5,1,'#b58308'),r(15,2,2,5,1,'#b58308'),r(7,11,3,3,1,'#fff8d9'),r(12,11,5,3,1,'#fff8d9'),r(7,16,10,2,1,'#fff8d9')],
 inbox:[r(3,3,18,18,4,'#00a5d6'),r(5,5,14,9,2,'#e3f8ff'),p('M3 12h5l2 4h4l2-4h5v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z','#0091c0')],
 scheduled:[r(7,3,10,3,1.5,'#f2b9ee'),r(5,8,14,3,1.5,'#e781e1'),p('M3 13h18l-2 6a3 3 0 0 1-3 2H8a3 3 0 0 1-3-2z','#d957ce')],
 important:[r(3,3,4,12,2,'#f24e81'),r(10,3,4,12,2,'#e94372'),r(17,3,4,12,2,'#d93664'),c(5,19,2,'#f24e81'),c(12,19,2,'#e94372'),c(19,19,2,'#d93664')],
 done:[c(12,12,10,'#65bc43'),line('M7 12l3.3 3.2L17 8.5','#fff',2.4)],
 archive:[r(3,7,18,14,3,'#aaa294'),r(2,4,20,5,2,'#d4cfc5'),r(8,12,8,3,1.5,'#fffdf8')],
 folder:[p('M3 7a3 3 0 0 1 3-3h4l2 3h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z','#498bd8'),r(3,9,18,12,3,'#6aa9ef'),line('M6 12h12','#b9dbff',1.2)],
 briefcase:[line('M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2','#695043',2.2),r(2,7,20,14,4,'#8d6951'),r(2,7,20,6,3,'#ab866c'),line('M2 13q10 5 20 0','#614638',1.2),r(10,11,4,6,1.3,'#d8d2c4')],
 star:[p('m12 2 3.1 6.3 7 .9-5.1 5 1.2 7L12 18l-6.2 3.2 1.2-7-5.1-5 7-.9z','#e9ad20'),p('m12 3 2.7 5.9 6.4.8-4.8 4.4-4.3 2.4V3z','#ffd75b'),line('m10 7-1.1 2.6-3 .4','#fff0bb',1)],
 rocket:[p('M7 12 3 13l-1 7 6-3z','#d94538'),p('m12 17-1 5 7-2 1-5z','#f16b50'),p('M6 15C8 6 14 2 22 2c0 8-4 14-13 16z','#c5d2db'),p('M8 14C11 7 16 4 22 2c-2 6-5 11-12 14z','#edf2f3'),c(16,8,3,'#376582'),c(16,8,1.8,'#87c9e6'),p('M5 18 2 23l5-3z','#f5b13c')],
 pin:[p('M2 18 7 15l10 2 5 4-8 2z','#e1dac1'),p('m4 18 3-1 9 2 3 1-5 1z','#a7c5a6'),p('M12 2a6.5 6.5 0 0 0-6.5 6.5C5.5 13 12 20 12 20s6.5-7 6.5-11.5A6.5 6.5 0 0 0 12 2z','#e35443'),p('M12 2c-6 0-8 7-3 13L12 19V2z','#f97b60'),c(12,8.4,2.6,'#fff5ec')],
 compass:[c(12,12,10,'#b78b37'),c(12,12,8,'#f6e1a8'),c(12,12,6.5,'#e7cc88'),p('m15.5 5-1 9-6 5 1-9z','#805b32'),p('m15.5 5-3.5 7-2.5-2z','#fff8dd'),c(12,12,1.3,'#86633c')],
 bulb:[p('M7 14C2 7 6 2 12 2s10 5 5 12l-2 4H9z','#f4c23c'),p('M9 15C6 10 6 4 12 4c4 0 6 3 5 6-1 3-3 4-3 7h-4z','#ffec97'),r(9,17,6,4,1.4,'#9d9e96'),r(10,21,4,2,1,'#71756f'),line('m10 10 2 3 2-3','#d5a82a',1.1)],
 document:[r(4,2,16,20,3,'#69a6db'),p('M15 2v5h5z','#c5e6ff'),r(7,10,10,2,1,'#eff8ff'),r(7,14,8,2,1,'#eff8ff'),r(7,18,6,1.5,.75,'#d4edff')],
 book:[r(4,3,16,19,3,'#d1a52c'),r(6,2,14,18,2,'#ffe175'),r(3,3,3,18,1,'#b68d22'),r(8,6,9,2,1,'#fff6c9'),r(8,10,7,1.5,.75,'#f2c853'),line('M7 21h12','#fff2bf',1.4)],
 bookmark:[p('M6 2h12v21l-6-4-6 4z','#a999d7'),r(8,5,8,2,1,'#eae1ff'),r(8,9,6,1.5,.75,'#d9cef5')],
 dino:[p('M4 11q1-7 10-7l5 4v5l-6 2-1 6H8l-1-6-4 1z','#72a359'),p('m4 11 6-2 9 1v3l-7 2-6-1z','#a6c282'),c(14.5,7.5,1.3,'#293e28'),p('m6 4 2-3 2 3 3-3 1 3z','#4e7942'),line('M8 12h8','#3b5c35',1.1)]
});
export const ASSET_NAMES=Object.freeze(Object.keys(SHAPES));
export function createColoredIcons(React){
 if(typeof React?.createElement!=='function')throw new TypeError('Pass host React');
 const h=React.createElement;
 return function Asset({name,size=24,label,...props}){
  if(!SHAPES[name])throw new RangeError(`Unknown vector asset ${name}`);
  return h('svg',{...props,width:size,height:size,viewBox:'0 0 24 24',fill:'none',focusable:false,...(label?{role:'img','aria-label':label}:{'aria-hidden':true})},...SHAPES[name].map(([tag,p],i)=>h(tag,{...p,key:i})));
 };
}

/** Common control geometry matching the reference's compact rounded outline vocabulary. */
export const CONTROL_PATHS={
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',
 calendar:'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z M3 8h18 M8 3v3 M16 3v3 M7 12h.01 M12 12h.01 M17 12h.01 M7 16h.01 M12 16h.01 M17 16h.01',
 upcoming:'M5 4h14a2 2 0 0 1 2 2v7 M3 20V6a2 2 0 0 1 2-2 M3 8h18 M8 3v3 M16 3v3 M7 12h.01 M11 12h.01 M7 16h.01 M14 18a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M18 16v2l1 1',
 notes:'M4 5h16 M4 10h10 M4 15h16 M4 20h11',
 events:'M8 4h12v6H8z M8 14h12v6H8z M4 4v16 M2 7h4 M2 17h4',
 bell:'M7 9a5 5 0 0 1 10 0v5l2 3H5l2-3z M10 20h4',
 cloud:'M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 0 9z',
 link:'m10 14 4-4 M9 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M15 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
 import:'M12 3v11 M8 10l4 4 4-4 M4 14v6h16v-6',
 sparkle:'m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z',
 paintbrush:'m15 3 6 6-8 8-6-6z M7 11l6 6-4 4H3v-6z',
 command:'M8 8V5a3 3 0 1 0-3 3h14a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H5a3 3 0 1 0 3 3z',
 key:'M14 10a5 5 0 1 0-4 4v7h4v-3h3v-3h-3z',
 info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 10v7 M12 6h.01',
 gear:'m9 3 6 0 1 3 3 1 2 5-2 2-1 3-6 2-2-2-3-1-1-3-3-2 2-5 3-1z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8'
};
export function createControlIcons(React){const h=React.createElement;return function Control({name,size=20}){if(!CONTROL_PATHS[name])throw new RangeError('Unknown control');return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true,focusable:false},h('path',{d:CONTROL_PATHS[name]}));};}
