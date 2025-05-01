
(() => {


const $ = id => document.getElementById(id);
const cvs = $('drawArea'), ctx = cvs.getContext('2d');
const toolSel=$('tool');            // <select id="tool">
const sizeSel=$('size'), sizeLbl=$('sizeVal');
const offSel =$('offset'), offLbl =$('offsetVal');
const erWrap =$('eraserWrap'), erMode=$('eraserMode');
const undoB  =$('undoBtn'), redoB  =$('redoBtn');
const clearB =$('clear'),   saveB  =$('save');


['pointer','eraser','brush','rectangle','square',
 'circle','oval'].forEach(v=>{
    if (![...toolSel.options].some(o=>o.value===v))
        toolSel.add(new Option(v[0].toUpperCase()+v.slice(1), v));
});


const syncLbls=()=>{sizeLbl.textContent=sizeSel.value;offLbl.textContent=offSel.value};
sizeSel.oninput=offSel.oninput=syncLbls; syncLbls();


let objs=[], undo=[], redo=[];
let drawing=false, sel=-1, drag=null, corner=null, sx=0,sy=0, preview=-1;
const HANDLE=6, HIT=6;

const pos=e=>{if(e.touches)e=e.touches[0];const r=cvs.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
const saveState=()=>{undo.push(structuredClone(objs));if(undo.length>50)undo.shift();redo.length=0};
const inBox=(x,y,x0,y0,w,h)=>{const[minX,maxX]=w>=0?[x0,x0+w]:[x0+w,x0], [minY,maxY]=h>=0?[y0,y0+h]:[y0+h,y0];return x>=minX&&x<=maxX&&y>=minY&&y<=maxY};
const dSeg=(px,py,x1,y1,x2,y2)=>{const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy)));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))};

const star=(cx,cy,R,r)=>{ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,len=i%2?r:R;(i?ctx.lineTo:ctx.moveTo)(cx+len*Math.cos(a),cy+len*Math.sin(a));}ctx.closePath();};
const twin=(fn,w,o)=>{ctx.lineCap=ctx.lineJoin='round';ctx.lineWidth=w;ctx.strokeStyle='rgb(0,255,0)';fn(0);ctx.strokeStyle='rgb(255,0,255)';fn(o);};


function draw(o,i){
  if(o.type==='eraserLine'){
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.lineCap='round';ctx.lineWidth=o.eWidth;
    ctx.beginPath();o.pts.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore();return;
  }
  twin(sh=>{
    switch(o.type){
      case'rectangle':ctx.strokeRect(o.x+sh,o.y,o.w,o.h);break;
      case'square':ctx.strokeRect(o.x+sh,o.y,o.w,o.w);break;
      case'circle':{const r=Math.hypot(o.w,o.h)/2;ctx.beginPath();ctx.arc(o.x+o.w/2+sh,o.y+o.h/2,r,0,2*Math.PI);ctx.stroke();break;}
      case'oval':{ctx.beginPath();ctx.ellipse(o.x+o.w/2+sh,o.y+o.h/2,Math.abs(o.w)/2,Math.abs(o.h)/2,0,0,2*Math.PI);ctx.stroke();break;}
      case'star':{const R=Math.min(Math.abs(o.w),Math.abs(o.h))/2;star(o.x+o.w/2+sh,o.y+o.h/2,R,R*0.5);ctx.stroke();break;}
      case'path':{ctx.beginPath();o.pts.forEach(([x,y],j)=>j?ctx.lineTo(x+sh,y):ctx.moveTo(x+sh,y));ctx.stroke();break;}
    }
  },o.wid,o.off);

  if(sel===i&&o.type!=='path'&&o.type!=='eraserLine'){
    ctx.save();ctx.fillStyle='#000';[[o.x,o.y],[o.x+o.w,o.y],[o.x,o.y+o.h],[o.x+o.w,o.y+o.h]]
      .forEach(([cx,cy])=>ctx.fillRect(cx-HANDLE,cy-HANDLE,HANDLE*2,HANDLE*2));ctx.restore();
  }
  if(preview===i){
    ctx.save();ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeStyle='#000';ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.restore();
  }
}
const redraw=()=>{ctx.clearRect(0,0,cvs.width,cvs.height);objs.forEach(draw)};


const hitPath=(o,x,y)=>o.type==='path'&&o.pts.some((p,i)=>i&&dSeg(x,y,...o.pts[i-1],...p)<=HIT);
function hitShape(o,x,y){
  if(o.type==='path'||o.type==='eraserLine'||!inBox(x,y,o.x,o.y,o.w,o.h))return null;
  const C={nw:[o.x,o.y],ne:[o.x+o.w,o.y],sw:[o.x,o.y+o.h],se:[o.x+o.w,o.y+o.h]};
  for(const[k,[cx,cy]] of Object.entries(C))if(Math.abs(x-cx)<=HANDLE&&Math.abs(y-cy)<=HANDLE)return k;
  return'inside';
}


let confB=null;
const askDel=cb=>{
  if(!confB){confB=document.createElement('button');confB.textContent='Confirm Erase Shape';confB.style.marginLeft='1rem';clearB.parentElement.appendChild(confB);}
  confB.onclick=()=>{cb();confB.remove();confB=null;preview=-1;redraw();};
};


function down(e){
  e.preventDefault();const{x,y}=pos(e), tool=toolSel.value;
  erWrap.style.display=tool==='eraser'?'inline-flex':'none';
  sel=-1;drag=null;corner=null;preview=-1;

  for(let i=objs.length-1;i>=0;i--){
    const o=objs[i];let h=hitShape(o,x,y);if(!h&&hitPath(o,x,y))h='inside';
    if(!h)continue;
    if(tool==='eraser'&&erMode.value==='shape'){preview=i;askDel(()=>{saveState();objs.splice(i,1);});redraw();return;}
    if(tool==='pointer'){sel=i;drag=['nw','ne','sw','se'].includes(h)?'resize':'move';corner=h;sx=x;sy=y;redraw();return;}
    break;
  }
  redraw();
  if(tool==='pointer'||(tool==='eraser'&&erMode.value==='shape'))return;

  saveState();drawing=true;sx=x;sy=y;
  const base={wid:+sizeSel.value,off:+offSel.value};
  if(tool==='brush')objs.push({type:'path',pts:[[x,y]],...base});
  else if(tool==='eraser'&&erMode.value==='line')objs.push({type:'eraserLine',pts:[[x,y]],eWidth:+sizeSel.value});
  else objs.push({type:tool,x,y,w:0,h:0,...base});
}
function move(e){
  if(!drawing&&!drag)return;const{x,y}=pos(e);
  if(drawing){
    const o=objs.at(-1);
    if(o.type==='path'||o.type==='eraserLine')o.pts.push([x,y]);
    else{ o.w=x-sx;o.h=y-sy;if(o.type==='square'){const s=Math.sign(o.w)*Math.max(Math.abs(o.w),Math.abs(o.h));o.w=o.h=s;} }
    redraw();return;
  }
  const o=objs[sel],dx=x-sx,dy=y-sy;
  if(drag==='move'){o.x+=dx;o.y+=dy;}
  else{
    switch(corner){
      case'nw':o.x+=dx;o.y+=dy;o.w-=dx;o.h-=dy;break;
      case'ne':          o.y+=dy;o.w+=dx;o.h-=dy;break;
      case'sw':o.x+=dx;          o.w-=dx;o.h+=dy;break;
      case'se':                    o.w+=dx;o.h+=dy;break;
    }
    if(o.type==='square'){const s=Math.sign(o.w)*Math.max(Math.abs(o.w),Math.abs(o.h));o.w=o.h=s;}
  }
  sx=x;sy=y;redraw();
}
const up=()=>{drawing=false;drag=null;corner=null};

cvs.addEventListener('mousedown',down);cvs.addEventListener('touchstart',down,{passive:false});
window.addEventListener('mousemove',move);window.addEventListener('touchmove',move,{passive:false});
window.addEventListener('mouseup',up);window.addEventListener('touchend',up);


undoB.onclick=()=>{if(!undo.length)return;redo.push(structuredClone(objs));objs=undo.pop();sel=-1;redraw();};
redoB.onclick=()=>{if(!redo.length)return;undo.push(structuredClone(objs));objs=redo.pop();sel=-1;redraw();};


clearB.onclick=()=>{saveState();objs=[];sel=-1;preview=-1;redraw();};
saveB.onclick=()=>{const a=document.createElement('a');a.download='trioscopic_art.png';a.href=cvs.toDataURL();a.click();};


const fit=()=>{const r=cvs.getBoundingClientRect();cvs.width=r.width;cvs.height=r.height;redraw();};
fit();window.addEventListener('resize',fit);

})();  
