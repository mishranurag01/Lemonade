import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
export default function LiquidMetalCanvas(){
 const mount=useRef<HTMLDivElement>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{
  const node=mount.current;if(!node)return;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:"low-power"});}catch{setFailed(true);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.1,100);camera.position.z=6;
  const envCanvas=document.createElement("canvas");envCanvas.width=512;envCanvas.height=256;
  const ctx=envCanvas.getContext("2d");if(ctx){const g=ctx.createLinearGradient(0,0,512,256);g.addColorStop(0,"#b8d0ff");g.addColorStop(.3,"#11182b");g.addColorStop(.55,"#faf3e0");g.addColorStop(.75,"#10131c");g.addColorStop(1,"#c6a66b");ctx.fillStyle=g;ctx.fillRect(0,0,512,256);}
  const env=new THREE.CanvasTexture(envCanvas);env.mapping=THREE.EquirectangularReflectionMapping;scene.environment=env;
  const geo=new THREE.TorusKnotGeometry(1.15,.4,160,28,2,3);
  const mat=new THREE.MeshStandardMaterial({color:"#d4dce9",metalness:1,roughness:.12,envMapIntensity:1.6});
  const mesh=new THREE.Mesh(geo,mat);scene.add(mesh);
  scene.add(new THREE.AmbientLight(0x8099cb,1.8));
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(-3,4,4);scene.add(key);
  const rim=new THREE.DirectionalLight(0xc6a66b,2);rim.position.set(4,-3,2);scene.add(rim);
  node.appendChild(renderer.domElement);
  const resize=()=>{const w=node.clientWidth||1,h=node.clientHeight||1;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};
  const observer=new ResizeObserver(resize);observer.observe(node);resize();
  let visible=true,raf=0,angle=0,last=0;
  const visibility=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??false;});visibility.observe(node);
  const animate=(time:number)=>{raf=requestAnimationFrame(animate);if(!visible||document.hidden)return;const dt=Math.min((time-last)/1000||0,.05);last=time;if(!reduce)angle+=dt;mesh.rotation.y=angle*.22;mesh.rotation.x=Math.sin(angle*.18)*.16;renderer.render(scene,camera);};
  raf=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(raf);visibility.disconnect();observer.disconnect();geo.dispose();mat.dispose();env.dispose();renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div ref={mount} className="metalCanvas" aria-hidden="true">{failed&&<div className="metalFallback"/>}</div>;
}
