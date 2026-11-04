import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowUpRight, Volume2, Pause } from "lucide-react";
import { aboutContent as data } from "./content/aboutContent";
import s from "./styles/about.module.css";
import Starfield from "./scene/Starfield";
import TorchStory from "./scene/TorchStory";

// Keep the original story intact while combining sentence-sized entries into readable paragraphs.
function storyParagraphs(lines: readonly string[]): string[] {
 const paragraphs: string[] = [];
 let current = "";
 for (const line of lines) {
  if (current && current.length + line.length + 1 > 340) {
   paragraphs.push(current);
   current = "";
  }
  current = current ? `${current} ${line}` : line;
 }
 if (current) paragraphs.push(current);
 return paragraphs;
}
export default function AboutPage(){
 const reduce=useReducedMotion();
 const audioRef=useRef<HTMLAudioElement|null>(null);
 const [playingLanguage,setPlayingLanguage]=useState<"en"|"hi"|null>(null);
 const [audioError,setAudioError]=useState<string|null>(null);
 const audioSources={en:"/audio/about/purvaphalguni-en.opus",hi:"/audio/about/purvaphalguni-hi.opus"};
 const toggleNarration=async(language:"en"|"hi")=>{
  const audio=audioRef.current;
  if(!audio)return;
  setAudioError(null);
  if(playingLanguage===language){audio.pause();setPlayingLanguage(null);return;}
  audio.pause();
  audio.src=audioSources[language];
  audio.load();
  try{await audio.play();setPlayingLanguage(language);}
  catch{setPlayingLanguage(null);setAudioError("Narration unavailable. Please check that the audio file has been uploaded.");}
 };
 useEffect(()=>()=>{audioRef.current?.pause();},[]);
 useEffect(()=>{const old=document.title;document.title="About — PurvaPhalguni";return()=>{document.title=old;}},[]);
 const reveal={initial:reduce?false:{opacity:0,y:28},whileInView:{opacity:1,y:0},viewport:{once:true,amount:.15},transition:{duration:reduce?0:.85,ease:[.16,1,.3,1] as [number,number,number,number]}};
 return <div className={s.aboutRoot}>
  <div className={s.grain} aria-hidden="true"/>
  <header className={s.nav}><a href={data.brand.homeUrl}><ArrowLeft size={16}/>{data.brand.name}</a><span>ABOUT PURVAPHALGUNI</span><a href="#closing">CONTACT <ArrowUpRight size={15}/></a></header>
  <main><section className={s.hero}><div className={s.starfield}><Starfield/></div><div className={s.scene}><video className={s.heroVideo} src="https://framerusercontent.com/assets/bQaOKhgAU1CYPKfgZUqo3xPvs.mp4" autoPlay loop muted playsInline preload="metadata" aria-hidden="true"/></div><motion.div className={s.heroText} initial={reduce?false:{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:1}}>
   <p className={s.eyebrow}>{data.hero.eyebrow}</p><h1 className={s.heroHeadline}><span>Where Ancient Wisdom</span><span>Meets Modern Curiosity.</span></h1><p className={s.lead}>{data.hero.statement}</p><div className={s.audioChoices} role="group" aria-label="Listen to the About story"><audio ref={audioRef} preload="none" onEnded={()=>setPlayingLanguage(null)} onError={()=>{setPlayingLanguage(null);setAudioError("Narration unavailable. Please check that the audio file has been uploaded.");}}/>{(["en","hi"] as const).map(language=><button key={language} type="button" onClick={()=>void toggleNarration(language)} aria-pressed={playingLanguage===language} aria-label={`${playingLanguage===language?"Pause":"Play"} ${language==="en"?"English":"Hindi"} narration`}>{playingLanguage===language?<Pause size={18} aria-hidden="true"/>:<Volume2 size={18} strokeWidth={1.7} aria-hidden="true"/>}{language==="en"?"English":"Hindi"}</button>)}{audioError&&<span role="alert" style={{width:"100%",fontSize:12,color:"#ffcbab"}}>{audioError}</span>}</div><a className={s.scroll} href="#origin">EXPLORE THE GENESIS <ArrowDown size={16}/></a>
  </motion.div></section>
  <section className={s.section} id="introduction"><motion.div {...reveal} className={s.sectionGrid}><div className={s.label}><span>THE INTRODUCTION</span><div className={s.line}/></div><div><h2>{data.intro.headline}</h2>{storyParagraphs(data.intro.paragraphs).map((p,j)=><p key={j}>{p}</p>)}</div></motion.div></section>
  {data.sections.map((section,i)=><>{section.id==="belief"&&<TorchStory/>}<section id={section.id} className={s.section} key={section.id}><motion.div {...reveal} className={s.sectionGrid}><div className={s.label}><span>{section.label}</span><div className={s.line}/></div><div><h2>{section.headline}</h2>{section.id==="founder"&&<div className={s.portraitPlaceholder} role="img" aria-label="Founder portrait placeholder — replace with an approved photo"><span>FOUNDER PORTRAIT</span></div>}{storyParagraphs(section.paragraphs).map((p,j)=><p key={j}>{p}</p>)}</div></motion.div></section></>)}
  </main><footer id="closing" className={s.footer}><motion.div {...reveal}><p className={s.eyebrow}>PURVAPHALGUNI / 2026</p><h2>{data.closing.headline}</h2>{storyParagraphs(data.closing.paragraphs).map((p,j)=><p key={j}>{p}</p>)}<p>{data.closing.statement}</p><div className={s.actions}>{data.closing.feedbackEmail?<a href={data.closing.feedbackEmail}>{data.closing.feedbackLabel}</a>:<span>Feedback link coming soon</span>}<a href={data.brand.homeUrl}>RETURN HOME <ArrowUpRight size={16}/></a></div><div className={s.signature}>{data.brand.name}</div></motion.div></footer>
 </div>;
}
