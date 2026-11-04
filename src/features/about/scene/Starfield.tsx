import { useEffect, useRef } from "react";

/** Lightweight independent star twinkles, no Framer runtime required. */
export default function Starfield(){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  const ctx=canvas.getContext("2d");if(!ctx)return;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w=1,h=1,dpr=1,frame=0,visible=true,raf=0;
  type Star={x:number;y:number;r:number;phase:number;speed:number;brightness:number;};
  let stars:Star[]=[];
  const resize=()=>{
   const bounds=canvas.getBoundingClientRect();w=Math.max(1,bounds.width);h=Math.max(1,bounds.height);
   dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
   ctx.setTransform(dpr,0,0,dpr,0,0);
   const count=Math.min(350,Math.max(90,Math.round(w*h/2600)));
   stars=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.15+.25,phase:Math.random()*Math.PI*2,speed:.3+Math.random()*1.5,brightness:.18+Math.random()*.5}));
  };
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;});intersection.observe(canvas);
  const draw=(t:number)=>{
   raf=requestAnimationFrame(draw);if(!visible||document.hidden)return;
   if(++frame%2!==0&&!reduced)return;
   ctx.clearRect(0,0,w,h);
   for(const star of stars){
    const twinkle=reduced?0.5:(.5+.5*Math.sin(t*.001*star.speed+star.phase));
    const alpha=Math.min(1,star.brightness+twinkle*.42);
    ctx.beginPath();ctx.arc(star.x,star.y,star.r,0,Math.PI*2);
    ctx.fillStyle="rgba(222,233,255,"+alpha.toFixed(3)+")";ctx.fill();
    if(star.r>1.1&&twinkle>.87){
     ctx.strokeStyle="rgba(205,220,255,"+(alpha*.28).toFixed(3)+")";
     ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(star.x-4,star.y);ctx.lineTo(star.x+4,star.y);ctx.moveTo(star.x,star.y-4);ctx.lineTo(star.x,star.y+4);ctx.stroke();
    }
   }
  };
  raf=requestAnimationFrame(draw);
  return()=>{cancelAnimationFrame(raf);observer.disconnect();intersection.disconnect();};
 },[]);
 return <canvas ref={canvasRef} aria-hidden="true" style={{display:"block",width:"100%",height:"100%"}}/>;
}
