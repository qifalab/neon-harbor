/** Room menu uses textContent for all server/user supplied text. */
export function renderMultiplayerMenu(content,client,{join,leave,refresh}={}){
  if(client.session){
    content.innerHTML='<p class="panel-intro" id="room-info"></p><div class="settings-actions"><button id="room-copy" class="secondary-button">复制邀请链接</button><button id="room-leave" class="secondary-button danger">离开房间</button></div><ul id="room-players" class="room-players"></ul><div id="room-chat" class="room-chat" aria-live="polite"></div><form id="room-chat-form" class="room-chat-form"><input id="room-message" aria-label="房间消息" maxlength="160" placeholder="和房间里的朋友说句话"><button class="primary-button compact">发送</button></form><p id="room-error" class="panel-intro" role="status"></p>';
    document.getElementById('room-leave').onclick=leave;
    document.getElementById('room-copy').onclick=async()=>{
      const invite=new URL(location.href);invite.search='';invite.searchParams.set('room',client.session.code);invite.searchParams.set('server',client.base);
      try{await navigator.clipboard.writeText(invite.href);document.getElementById('room-error').textContent='邀请链接已复制。';}
      catch{document.getElementById('room-error').textContent=invite.href;}
    };
    document.getElementById('room-chat-form').onsubmit=async event=>{event.preventDefault();const input=document.getElementById('room-message');try{await client.chat(input.value);input.value='';}catch(error){document.getElementById('room-error').textContent=error.message;}};
    refresh();return;
  }
  const params=new URLSearchParams(location.search);
  content.innerHTML='<p class="panel-intro">邀请朋友一起漫游霓港、驾驶车辆和探索建筑。每个房间最多 8 人。主站可直接单人游玩；多人需要连接已运行的房间服务。</p><form id="room-form"><div class="settings-grid"><label class="setting">你的昵称<input id="room-name" maxlength="20" value="漫游者" required autocomplete="nickname"></label><label class="setting">房间服务网址<input id="room-server" type="url" placeholder="https://rooms.example.com" required></label><label class="setting">房间码<input id="room-code" maxlength="6" placeholder="留空创建新房间" pattern="[A-Za-z0-9]{6}" autocomplete="off"></label></div><button id="room-join" class="primary-button compact">创建 / 加入房间 ↗</button><p id="room-error" class="panel-intro" role="status"></p></form><p class="panel-intro">联机模式当前支持玩家位置、共用车辆和房间聊天。委托与存档仍是个人进度。</p>';
  document.getElementById('room-server').value=params.get('server')||location.origin;
  document.getElementById('room-code').value=(params.get('room')||'').slice(0,6);
  document.getElementById('room-form').onsubmit=async event=>{
    event.preventDefault();const button=document.getElementById('room-join'),errorNode=document.getElementById('room-error');button.disabled=true;errorNode.textContent='正在连接…';
    try{await join({server:document.getElementById('room-server').value,name:document.getElementById('room-name').value,code:document.getElementById('room-code').value});}
    catch(error){errorNode.textContent=error.message;button.disabled=false;}
  };
}
export function refreshMultiplayerMenu(client){
  const info=document.getElementById('room-info');if(!info||!client.session)return;
  const peers=client.snapshot?.players||[];
  info.textContent=`房间 ${client.session.code} · ${peers.length} / 8 人 · ${client.connected?'已连接':'正在重连'}`;
  const list=document.getElementById('room-players');list.replaceChildren(...peers.map(peer=>{const item=document.createElement('li');item.textContent=peer.name+(peer.id===client.session.id?'（你）':'')+(peer.carId?' · 驾驶中':'');return item;}));
  const chat=document.getElementById('room-chat'),messages=client.snapshot?.chat||[];
  const key=messages.at(-1)?.id||'';if(chat.dataset.last===key)return;
  chat.dataset.last=key;chat.replaceChildren(...messages.map(message=>{const item=document.createElement('p');item.textContent=`${message.name}：${message.text}`;return item;}));chat.scrollTop=chat.scrollHeight;
}
