import { ROOM_PROTOCOL, ROOM_WORLD, PeerSnapshots } from './multiplayer-protocol.js';
const messages={WORLD_MISMATCH:'游戏和房间版本不同，请刷新后重试。',ROOM_NOT_FOUND:'没有找到这个房间，请核对房间码。',ROOM_FULL:'房间已满，请换一个房间。',VEHICLE_TAKEN:'这辆车已有其他玩家驾驶。',VEHICLE_TOO_FAR:'请靠近停稳的车辆。',RATE_LIMIT:'操作太快，请稍后再试。',ORIGIN_DENIED:'这个房间服务尚未允许当前游戏网址连接。',SESSION_EXPIRED:'连接已结束，请重新加入房间。'};
export class MultiplayerClient{
  constructor({onStatus=()=>{},onSnapshot=()=>{}}={}){this.onStatus=onStatus;this.onSnapshot=onSnapshot;this.peers=new PeerSnapshots();this.status='offline';this.epoch=0;}
  get connected(){return this.status==='connected';}
  setStatus(value){if(this.status===value)return;this.status=value;this.onStatus(value);}
  async request(path,data,session=this.session){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(`${this.base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.token}`}:{})},body:JSON.stringify(data),signal:controller.signal});
      const result=await response.json();if(!response.ok)throw new Error(messages[result.error]||'房间服务暂时不可用。');return result;
    }catch(error){if(error instanceof SyntaxError)throw new Error('这个网址没有可用的房间服务，单人模式可继续游玩。');if(error.name==='AbortError'||error instanceof TypeError)throw new Error('无法连接房间服务，请检查地址或网络。');throw error;}
    finally{clearTimeout(timer);}
  }
  async join({server,name,code,pose}){
    await this.leave();const epoch=++this.epoch;
    const url=new URL(server);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('请输入完整的房间服务网址。');
    if(location.protocol==='https:'&&url.protocol!=='https:')throw new Error('请使用 HTTPS 房间服务网址。');
    this.base=url.origin;this.setStatus('connecting');
    try{
      const session=await this.request('join',{protocol:ROOM_PROTOCOL,world:ROOM_WORLD,name,code:code.trim().toUpperCase(),pose},null);
      if(epoch!==this.epoch){await this.request('leave',{},session).catch(()=>{});return;}
      this.session=session;this.receive(session);
      const source=new EventSource(`${this.base}/api/events?token=${session.token}`);this.source=source;
      source.onmessage=event=>{if(epoch!==this.epoch)return;clearTimeout(this.failureTimer);this.failureTimer=null;this.setStatus('connected');this.receive(JSON.parse(event.data));};
      source.onerror=()=>{if(epoch!==this.epoch)return;this.setStatus('reconnecting');this.failureTimer??=setTimeout(()=>this.leave(),8000);};
      // State keepalive continues while a menu is open; hidden tabs leave cleanly.
      this.timer=setInterval(()=>this.sendState(),100);this.setStatus('connected');
    }catch(error){this.setStatus('offline');throw error;}
  }
  receive(snapshot){this.snapshot=snapshot;this.peers.push(snapshot,performance.now());this.onSnapshot(snapshot);}
  async sendState(){
    if(!this.session||!this.pendingState||this.sending)return;
    if(performance.now()-(this.lastSendTime||0)<90)return;this.lastSendTime=performance.now();
    this.sending=true;const epoch=this.epoch,packet=this.pendingState;
    try{await this.request('state',packet);if(epoch===this.epoch&&this.pendingState?.revision===packet.revision)this.pendingState.travel=false;}
    catch(error){if(epoch===this.epoch)this.setStatus('reconnecting');}
    finally{this.sending=false;}
  }
  state(value){const travel=value.travel||this.pendingState?.travel;this.pendingState={...value,travel};this.lastSent=this.pendingState;}
  async claim(carId){await this.sendState();return this.request('claim',{carId});}
  async release(){return this.request('release',{});}
  async chat(text){return this.request('chat',{text});}
  async leave(){
    ++this.epoch;clearInterval(this.timer);clearTimeout(this.failureTimer);this.failureTimer=null;this.source?.close();this.source=null;
    const session=this.session;this.session=null;this.snapshot=null;this.pendingState=null;this.peers=new PeerSnapshots();this.setStatus('offline');
    if(session)await this.request('leave',{},session).catch(()=>{});
  }
}
