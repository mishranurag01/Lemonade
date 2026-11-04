import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import styles from "./TorchStory.module.css";

const beats = [
  "Imagine entering a dark room filled with furniture.",
  "Without light, you may stumble over something you cannot see.",
  "Now imagine someone hands you a torch.",
  "The torch does not remove the furniture. It does not guarantee that you will never stumble.",
  "It simply helps you see."
];

export default function TorchStory(){
  const ref=useRef<HTMLElement>(null);
  const reduce=useReducedMotion();
  const {scrollYProgress}=useScroll({target:ref,offset:["start start","end end"]});
  const beam=useTransform(scrollYProgress,[0,.18,.42,.7,1],[0,0,.65,.9,1]);
  const sweep=useTransform(scrollYProgress,[0,.25,.55,.8,1],["-34%","-25%","5%","28%","10%"]);
  const ambience=useTransform(scrollYProgress,[0,.3,.65,1],[0,.06,.17,.25]);
  const beamOpacity=reduce?1:beam;
  const beamX=reduce?"0%":sweep;
  return <section ref={ref} className={styles.story} aria-label="The torch metaphor: an interactive story about awareness">
    <div className={styles.sticky}>
      <div className={styles.room} aria-hidden="true">
        <div className={styles.backWall}/>
        <div className={styles.floor}/>
        <div className={styles.window}/>
        <div className={styles.cabinet}/>
        <div className={styles.table}/>
        <div className={styles.chair}/>
        <div className={styles.plant}/>
        <motion.div className={styles.ambient} style={{opacity:reduce?0.25:ambience}}/>
        <motion.div className={styles.light} style={{opacity:beamOpacity,x:beamX}}/>
        <div className={styles.vignette}/>
      </div>
      <div className={styles.copy}>
        <span className={styles.chapter}>03 / THE TORCH EXPERIMENT</span>
        {beats.map((beat,i)=><TorchBeat key={beat} index={i} text={beat} progress={scrollYProgress} reduced={!!reduce}/>)}
        <span className={styles.hint}>SCROLL TO REVEAL THE ROOM ↓</span>
      </div>
      <div className={styles.progress}><motion.div style={{scaleX:scrollYProgress}}/></div>
    </div>
  </section>;
}

function TorchBeat({index,text,progress,reduced}:{index:number;text:string;progress:ReturnType<typeof useScroll>["scrollYProgress"];reduced:boolean}){
 const centers=[.08,.29,.49,.70,.90];
 const center=centers[index];
 const opacity=useTransform(progress,[Math.max(0,center-.13),Math.max(0,center-.055),Math.min(1,center+.055),Math.min(1,center+.14)],[0,1,1,0]);
 const y=useTransform(progress,[Math.max(0,center-.13),center,Math.min(1,center+.14)],[28,0,-28]);
 return <motion.p className={styles.beat} style={reduced?{opacity:index===2?1:0,transform:"none"}:{opacity,y}}>{text}</motion.p>;
}
