import { useEffect, useRef } from "react";
import styles from "./TorchStory.module.css";

const beats = [
  "Imagine entering a dark room filled with furniture.",
  "Without light, you may stumble over something you cannot see.",
  "Now imagine someone hands you a torch.",
  "The torch does not remove the furniture. It does not guarantee that you will never stumble.",
  "It simply helps you see."
];

const vertex = `attribute vec2 a; void main(){gl_Position=vec4(a,0.,1.);}`;
const fragment = `
precision highp float;
uniform vec2 uRes,uL,uO;
uniform float uT,uI,uP,uM,uK;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float box(vec2 p,vec2 c,vec2 h){vec2 d=abs(p-c)-h;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float seg(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));}
vec4 put(vec4 base,float d,vec3 color,float relief){float m=1.-smoothstep(-.002,.002,d);return mix(base,vec4(color,relief),m);}
vec4 scene(vec2 q){
 vec3 wall=vec3(.115,.15,.145)*(.75+.5*noise(q*15.));
 vec4 s=vec4(wall,.003*noise(q*70.));
 float floorY=-.19;
 if(q.y<floorY){float row=floor((-q.y-floorY)*10.);float seam=max(1.-step(.02,fract(q.x*6.+hash(vec2(row,2.)))),1.-step(.04,fract((-q.y-floorY)*10.)));s=vec4(mix(vec3(.28,.16,.09),vec3(.16,.09,.05),seam)*(.8+.35*noise(q*50.)),.005);}
 s=put(s,box(q,vec2(0.,-.19),vec2(3.,.012)),vec3(.31,.25,.19),.05);
 s=put(s,box(q,vec2(0.,-.1),vec2(3.,.008)),vec3(.25,.15,.09),.04);
 vec2 rug=(q-vec2(0.,-.35))/vec2(.55,.11);float rr=length(rug);
 s=put(s,(rr-1.)*.1,mix(vec3(.36,.08,.09),vec3(.12,.12,.25),step(.5,fract(rr*4.))),.015);
 s=put(s,box(q,vec2(-.52,.2),vec2(.15,.21)),vec3(.36,.22,.12),.045);
 s=put(s,box(q,vec2(-.52,.2),vec2(.12,.18)),vec3(.025,.045,.09)+vec3(.03,.045,.08)*q.y,.015);
 s=put(s,box(q,vec2(-.52,.2),vec2(.005,.18)),vec3(.38,.24,.14),.05);
 s=put(s,box(q,vec2(-.52,.21),vec2(.12,.005)),vec3(.38,.24,.14),.05);
 s=put(s,length(q-vec2(-.47,.3))-.025,vec3(.83,.87,.95),.02);
 s=put(s,box(q,vec2(-.7,.17),vec2(.045,.27)),vec3(.31,.045,.07)*(.8+.2*sin(q.x*190.)),.065);
 s=put(s,box(q,vec2(-.34,.17),vec2(.04,.27)),vec3(.31,.045,.07)*(.8+.2*sin(q.x*190.)),.065);
 s=put(s,length(q-vec2(0.,.3))-.085,vec3(.52,.37,.13),.06);
 s=put(s,length(q-vec2(0.,.3))-.072,vec3(.78,.72,.61),.05);
 s=put(s,seg(q,vec2(0.,.3),vec2(.015,.36))-.003,vec3(.06),.08);
 s=put(s,seg(q,vec2(0.,.3),vec2(-.027,.32))-.004,vec3(.06),.08);
 s=put(s,seg(q,vec2(0.,.3),vec2(0.,.3)+.06*vec2(sin(uT*.1047),cos(uT*.1047)))-.0015,vec3(.6,.04,.04),.085);
 s=put(s,box(q,vec2(-.2,.27),vec2(.075,.095)),vec3(.55,.4,.16),.05);
 s=put(s,box(q,vec2(-.2,.27),vec2(.06,.08)),vec3(.2,.27,.3)+.2*noise(q*30.),.03);
 s=put(s,box(q,vec2(.55,.08),vec2(.2,.34)),vec3(.18,.1,.05),.07);
 s=put(s,box(q,vec2(.55,.08),vec2(.18,.32)),vec3(.035,.023,.018),.03);
 float row=floor((q.y+.23)/.155),bx=floor((q.x-.38)*38.);
 float hh=hash(vec2(bx,row)),bh=.07+.07*hh;
 if(row>=0.&&row<4.&&hh<.88){
 float d=max(box(q,vec2(.38+(bx+.5)/38.,-.23+.155*row+.008+.5*bh),vec2(.011,.5*bh)),box(q,vec2(.55,.08),vec2(.18,.32)));
 s=put(s,d,vec3(.2,.25,.32)+.28*cos(6.283*hash(vec2(bx,row+4.))+vec3(0.,.33,.67)),.05);
 }
 for(int j=0;j<4;j++){float y=-.23+float(j)*.155;s=put(s,max(abs(q.y-y)-.008,box(q,vec2(.55,.08),vec2(.18,.32))),vec3(.25,.13,.07),.065);}
 vec3 wood=vec3(.29,.17,.09);
 s=put(s,box(q,vec2(-.17,-.215),vec2(.012,.095)),wood,.05);
 s=put(s,box(q,vec2(.17,-.215),vec2(.012,.095)),wood,.05);
 s=put(s,box(q,vec2(0.,-.13),vec2(.2,.012)),wood,.07);
 s=put(s,length((q-vec2(0.,-.082))/vec2(.8,1.))-.04,vec3(.1,.25,.3),.09);
 s=put(s,seg(q,vec2(0.,-.03),vec2(-.04,.04))-.002,vec3(.1,.28,.1),.06);
 s=put(s,seg(q,vec2(0.,-.03),vec2(.035,.05))-.002,vec3(.1,.28,.1),.06);
 s=put(s,length(q-vec2(-.04,.05))-.022,vec3(.85,.35,.45),.1);
 s=put(s,length(q-vec2(.035,.06))-.02,vec3(.9,.7,.3),.1);
 vec3 fabric=vec3(.29,.09,.12)*(.8+.35*noise(q*110.));
 s=put(s,box(q,vec2(-.46,-.02),vec2(.14,.12))-.01,fabric,.09);
 s=put(s,box(q,vec2(-.62,-.12),vec2(.03,.07))-.01,fabric*1.1,.11);
 s=put(s,box(q,vec2(-.3,-.12),vec2(.03,.07))-.01,fabric*1.1,.11);
 s=put(s,box(q,vec2(-.46,-.15),vec2(.13,.045))-.01,fabric*1.2,.13);
 return s;
}
void main(){
 vec2 q=(gl_FragCoord.xy-.5*uRes)/uRes.y*uK;
 vec2 dl=uL-q;float d2=dot(dl,dl);
 float rad=.19+.15*smoothstep(.04,.85,uP);
 float att=1./pow(1.+d2/(rad*rad),1.5)+.55*exp(-d2/(.15*rad*rad));
 vec4 s=scene(q);float e=.002;
 vec3 n=normalize(vec3(-(scene(q+vec2(e,0.)).a-s.a)/e,-(scene(q+vec2(0.,e)).a-s.a)/e,1.));
 vec3 light=normalize(vec3(dl,.32));
 float diffuse=max(dot(n,light),0.);
 float ambient=.001+.006*smoothstep(.62,1.,uP);
 vec3 warm=vec3(1.,.81,.58);
 vec3 col=s.rgb*(vec3(ambient*uI)+warm*diffuse*att*uI*2.4);
 col+=warm*pow(max(dot(n,normalize(light+vec3(0.,0.,1.))),0.),38.)*att*uI*.2;
 vec2 beam=uL-uO;float t=clamp(dot(q-uO,beam)/max(dot(beam,beam),.0001),0.,1.);
 float dist=length(q-uO-beam*t);float width=mix(.015,rad*.75,t);
 col+=warm*exp(-dist*dist/(width*width))*(.04+.04*noise(vec2(t*6.,dist*15.)+uT*.08*uM))*uI;
 for(int i=0;i<2;i++){float fi=float(i),scale=10.+fi*8.;vec2 g=q*scale+vec2(uT*.04,-uT*.03)*uM;vec2 id=floor(g),f=fract(g);vec2 dotPos=vec2(hash(id),hash(id+17.));float particle=1.-smoothstep(.012,.06,length(f-dotPos));col+=warm*particle*att*uI*.25*step(.7,hash(id+9.));}
 col*=1.-.25*dot(q/uK,q/uK);
 col=pow(1.-exp(-col*1.3),vec3(.65));
 gl_FragColor=vec4(col,1.);
}`;

const points: [number,number][] = [[0,-.32],[-.44,-.26],[-.46,-.06],[-.52,.22],[-.12,.3],[0,-.05],[.55,.12],[.55,-.15],[0,0]];
const smooth = (a:number,b:number,x:number) => {const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function position(p:number,t:number):[number,number] {
 const f=Math.min(.99999,Math.max(0,p))*(points.length-1),i=Math.floor(f),k=smooth(0,1,f-i);
 return [points[i][0]+(points[i+1][0]-points[i][0])*k+.005*Math.sin(t*9.1),points[i][1]+(points[i+1][1]-points[i][1])*k+.004*Math.sin(t*7.7)];
}
export default function TorchStory(){
 const section=useRef<HTMLElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const el=section.current,cv=canvas.current;if(!el||!cv)return;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl=cv.getContext("webgl",{alpha:false,antialias:false,powerPreference:"low-power"});
  let ctx:CanvasRenderingContext2D|null=null,program:WebGLProgram|null=null,raf=0,disposed=false,progress=0,last=performance.now(),start=last;
  const uniforms:Record<string,WebGLUniformLocation|null>={};
  if(gl){
   const compile=(type:number,source:string)=>{const sh=gl.createShader(type);if(!sh)return null;gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){console.warn("Torch shader:",gl.getShaderInfoLog(sh));gl.deleteShader(sh);return null;}return sh;};
   const v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment);
   if(v&&f){program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){console.warn("Torch program:",gl.getProgramInfoLog(program));gl.deleteProgram(program);program=null;}else{
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const attr=gl.getAttribLocation(program,"a");gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    for(const key of ["uRes","uL","uO","uT","uI","uP","uM","uK"])uniforms[key]=gl.getUniformLocation(program,key);
   }}
   if(v)gl.deleteShader(v);if(f)gl.deleteShader(f);
  }
  if(!program)ctx=cv.getContext("2d");
  let width=1,height=1,k=1,scale=1,frames=0,avg=.016;
  const resize=()=>{width=Math.max(1,el.clientWidth);height=Math.max(1,window.innerHeight);k=Math.max(1,1.6*height/width);scale=Math.min(window.devicePixelRatio||1,1.25);cv.width=Math.round(width*scale);cv.height=Math.round(height*scale);gl?.viewport(0,0,cv.width,cv.height);};
  const onContextLost=(event:Event)=>{event.preventDefault();disposed=true;cancelAnimationFrame(raf);};
  cv.addEventListener("webglcontextlost",onContextLost);
  resize();window.addEventListener("resize",resize,{passive:true});
  const render=(now:number)=>{
   if(disposed)return;
   const dt=Math.min(.05,(now-last)/1000);last=now;
   const bounds=el.getBoundingClientRect(),distance=Math.max(1,bounds.height-window.innerHeight);
   const target=Math.max(0,Math.min(1,-bounds.top/distance));
   progress+=(target-progress)*(1-Math.exp(-dt*5));
   const p=progress,t=(now-start)/1000;
   // First two story beats stay dark; third introduces the dim torch.
   // Fourth starts the sweep, fifth keeps the beam active.
   const torchOn=smooth(.43,.55,p),sweep=smooth(.61,.92,p);
   const [x,y]=position(sweep,reduced?0:t);
   const intensity=torchOn*(.22+.78*smooth(.58,.72,p));
   if(gl&&program){
    gl.useProgram(program);gl.uniform2f(uniforms.uRes,cv.width,cv.height);gl.uniform2f(uniforms.uL,x,y);
    gl.uniform2f(uniforms.uO,.3,-.5*k-.25);gl.uniform1f(uniforms.uT,t);gl.uniform1f(uniforms.uI,intensity);
    gl.uniform1f(uniforms.uP,sweep);gl.uniform1f(uniforms.uM,reduced?.1:1);gl.uniform1f(uniforms.uK,k);
    gl.drawArrays(gl.TRIANGLES,0,3);
    avg=avg*.95+dt*.05;
    if(++frames%90===0){const max=Math.min(window.devicePixelRatio||1,1.25);const next=avg>.026?Math.max(.5,scale*.85):avg<.014?Math.min(max,scale*1.1):scale;if(Math.abs(next-scale)>.01){scale=next;cv.width=Math.round(width*scale);cv.height=Math.round(height*scale);gl.viewport(0,0,cv.width,cv.height);}}
   }else if(ctx){
    ctx.fillStyle="#010102";ctx.fillRect(0,0,cv.width,cv.height);
    const px=cv.width/2+x*cv.height/k,py=cv.height/2-y*cv.height/k;
    const gradient=ctx.createRadialGradient(px,py,0,px,py,cv.height*.48);
    gradient.addColorStop(0,`rgba(255,205,150,${intensity*.65})`);gradient.addColorStop(.5,`rgba(95,62,38,${intensity*.12})`);gradient.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=gradient;ctx.fillRect(0,0,cv.width,cv.height);
   }
   raf=requestAnimationFrame(render);
  };
  raf=requestAnimationFrame(render);
  return()=>{disposed=true;cancelAnimationFrame(raf);window.removeEventListener("resize",resize);cv.removeEventListener("webglcontextlost",onContextLost);if(gl&&program)gl.deleteProgram(program);};
 },[]);
 return <section ref={section} className={styles.story} aria-label="The torch experiment: explore a dark room using a moving beam of light">
  <div className={styles.sticky}><canvas ref={canvas} className={styles.canvas} role="img" aria-label="A dark furnished room revealed by a moving torch as you scroll"/></div>
  <div className={styles.copy}><span className={styles.chapter}>03 / THE TORCH EXPERIMENT</span>{beats.map((beat,i)=><p key={i} className={styles.beat}>{beat}</p>)}</div>
 </section>;
}
