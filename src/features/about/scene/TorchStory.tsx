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
  const brightness=useTransform(scrollYProgress,[0,.2,.42,.7,1],[.42,.58,.9,1.35,1.75]);
  const roomFilter=useTransform(brightness,v=>`brightness(${v})`);
  const darkness=useTransform(scrollYProgress,[0,.2,.42,.7,1],[.96,.9,.72,.5,.35]);
  return <section ref={ref} className={styles.story} aria-label="The torch metaphor: a room gradually illuminated as the story scrolls">
    <div className={styles.sticky}>
      <motion.div className={styles.room} style={{filter:reduce?"brightness(.9)":roomFilter}} aria-hidden="true">
        <div className={styles.backWall}/>
        <div className={styles.floor}/>
        <div className={styles.window}/>
        <div className={styles.cabinet}/>
        <div className={styles.table}/>
        <div className={styles.chair}/>
        <div className={styles.plant}/>
        <motion.div className={styles.blackout} style={{opacity:reduce?.4:darkness}}/>
        <div className={styles.vignette}/>
      </motion.div>
      <div className={styles.progress}><motion.div style={{scaleX:scrollYProgress}}/></div>
    </div>
    <div className={styles.copy}>
      <span className={styles.chapter}>03 / THE TORCH EXPERIMENT</span>
      {beats.map((beat,i)=><p key={i} className={styles.beat}>{beat}</p>)}
      <span className={styles.hint}>THE SKY IS A MAP, NOT A VERDICT.</span>
    </div>
  </section>;
}
