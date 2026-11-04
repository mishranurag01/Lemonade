import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUpRight } from "lucide-react";
import { aboutContent as data } from "./content/aboutContent";
import s from "./styles/about.module.css";
import Starfield from "./scene/Starfield";
import TorchStory from "./scene/TorchStory";
export default function AboutPage(){
 const reduce=useReducedMotion();
 useEffect(()=>{const old=document.title;document.title="About — PurvaPhalguni | The Sky is a Map, Not a Verdict";return()=>{document.title=old;}},[]);
 const reveal={initial:reduce?false:{opacity:0,y:28},whileInView:{opacity:1,y:0},viewport:{once:true,amount:.15},transition:{duration:reduce?0:.85,ease:[.16,1,.3,1] as [number,number,number,number]}};
 return <div className={s.aboutRoot}>
  <div className={s.grain} aria-hidden="true"/>
  <header className={s.nav}><a href={data.brand.homeUrl}><ArrowLeft size={16}/>{data.brand.name}</a><span>THE SKY IS A MAP, NOT A VERDICT.</span><a href="#closing">CONTACT <ArrowUpRight size={15}/></a></header>
  <main><section className={s.hero}><div className={s.starfield}><Starfield/></div><div className={s.scene}><video className={s.heroVideo} src="https://framerusercontent.com/assets/bQaOKhgAU1CYPKfgZUqo3xPvs.mp4" autoPlay loop muted playsInline preload="metadata" aria-hidden="true"/></div><motion.div className={s.heroText} initial={reduce?false:{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:1}}>
   <p className={s.eyebrow}>{data.hero.eyebrow}</p><h1>{data.hero.headline}</h1><p className={s.lead}>{data.hero.statement}</p><a className={s.scroll} href="#origin">EXPLORE THE GENESIS <ArrowDown size={16}/></a>
  </motion.div></section>
  <section className={s.section} id="introduction"><motion.div {...reveal} className={s.sectionGrid}><div className={s.label}><span>THE INTRODUCTION</span><div className={s.line}/></div><div><h2>{data.intro.headline}</h2>{data.intro.paragraphs.map((p,j)=><p key={j}>{p}</p>)}</div></motion.div></section>
  {data.sections.map((section,i)=><>{section.id==="belief"&&<TorchStory/>}<section id={section.id} className={s.section} key={section.id}><motion.div {...reveal} className={s.sectionGrid}><div className={s.label}><span>{section.label}</span><div className={s.line}/></div><div><h2>{section.headline}</h2>{section.id==="founder"&&<div className={s.portraitPlaceholder} role="img" aria-label="Founder portrait placeholder — replace with an approved photo"><span>FOUNDER PORTRAIT</span></div>}{section.paragraphs.map((p,j)=><p key={j}>{p}</p>)}</div></motion.div></section></>)}
  </main><footer id="closing" className={s.footer}><motion.div {...reveal}><p className={s.eyebrow}>PURVAPHALGUNI / 2026</p><h2>{data.closing.headline}</h2>{data.closing.paragraphs.map((p,j)=><p key={j}>{p}</p>)}<p>{data.closing.statement}</p><div className={s.actions}>{data.closing.feedbackEmail?<a href={data.closing.feedbackEmail}>{data.closing.feedbackLabel}</a>:<span>Feedback link coming soon</span>}<a href={data.brand.homeUrl}>RETURN HOME <ArrowUpRight size={16}/></a></div><div className={s.signature}>{data.brand.name}<small>{data.brand.motto}</small></div></motion.div></footer>
 </div>;
}
