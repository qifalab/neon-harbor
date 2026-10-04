/** WebAudio synthesizer: no downloaded music, and no playback before a gesture. */
export class CityAudio {
  constructor(){this.ctx=null;this.volume=.35;this.engine=null;this.gain=null;this.lastSiren=0;}
  start(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    try{
      if(!this.ctx){this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);
        this.engine=this.ctx.createOscillator();this.engine.type='sawtooth';this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=160;
        this.gain=this.ctx.createGain();this.gain.gain.value=0;this.engine.connect(this.filter);this.filter.connect(this.gain);this.gain.connect(this.master);this.engine.start();}
      this.ctx.resume().catch(()=>{});
    }catch{this.ctx=null;}
  }
  setVolume(value){this.volume=value;if(this.master)this.master.gain.setTargetAtTime(value,this.ctx.currentTime,.08);}
  tone(freq,duration=.13,type='sine',volume=.12){if(!this.ctx||this.ctx.state!=='running')return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration);}
  cue(type){if(type==='success'){this.tone(523,.2);setTimeout(()=>this.tone(784,.25),120);}else if(type==='warning')this.tone(160,.2,'triangle');else this.tone(440,.12,'sine',.04);}
  shot(){this.tone(75,.12,'sawtooth',.24);}
  update(speed,driving,wanted,paused){if(!this.ctx)return;const t=this.ctx.currentTime;this.engine.frequency.setTargetAtTime(32+Math.abs(speed)*2.5,t,.12);this.filter.frequency.setTargetAtTime(150+Math.abs(speed)*8,t,.15);this.gain.gain.setTargetAtTime(driving&&!paused?.055:0,t,.15);if(wanted&&!paused&&t-this.lastSiren>1.1){this.lastSiren=t;this.tone(530,.55,'sine',.025);setTimeout(()=>{if(this.ctx?.state==='running')this.tone(680,.5,'sine',.025);},550);}}
  pause(){if(this.gain&&this.ctx)this.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.05);}
}
