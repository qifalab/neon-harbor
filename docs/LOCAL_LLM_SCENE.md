# 本地 LLM 场景与居民互动

霓港提供一个可选的本地 LLM 提案层：它可以从数据驱动的建筑 / 设施风格和居民社交模型中选择布景、氛围和对话意图。LLM 只返回经过 schema 校验的提案；碰撞、导航、交通、库存、经济、权限和存档仍由确定性游戏代码负责。网络失败、超时、非法输出或未启用时会回退到同一套确定性规则。

`src/llm-scene-adapter.js` 是独立模块，默认配置也同步保存在 [`config/llm-scene-presets.json`](../config/llm-scene-presets.json)，格式约束在 [`config/llm-scene.schema.json`](../config/llm-scene.schema.json)。这让本地版可以替换一组风格或社交模型，而不需要改渲染器。

## 默认与 Pages 行为

- 默认 `enabled: false`，构造适配器或加载 Pages 不会发出请求。
- 本地回环地址（`localhost`、`127.0.0.1`、`::1`）可以显式启用；外部 endpoint 还需要明确设置 `allowExternalEndpoint: true`。
- Pages 只包含模块和内置预设，不包含 API key，也不会自动连接 Ollama 或其他服务。
- 推荐使用 Ollama 的 `/api/chat` 或任意 OpenAI-compatible `/v1/chat/completions` 服务。Ollama 示例：`ollama serve` 后在本地下载一个模型。

## 在本地浏览器中配置

启动 `npm start`，进入游戏后在开发者控制台执行。`window.__NEON__.llm` 是只读诊断对象中的可发现入口：

```js
const llm = window.__NEON__.llm;
llm.snapshot(); // 当前 endpoint、model、开关和完整预设（不返回 API key）
llm.configure({
  enabled: true,
  provider: 'ollama',
  endpoint: 'http://127.0.0.1:11434/api/chat',
  model: 'qwen2.5:7b',
  stylePreset: 'quay-workshop',
  socialPreset: 'maker-collaborator'
});
await llm.request({
  place: '东湾货栈', buildingKind: 'workshop', role: 'courier'
});

// 导出当前预设，作为项目自己的风格 / 社交配置起点。
copy(JSON.stringify(llm.exportConfig(), null, 2));
```

OpenAI-compatible 本地服务只需把 `provider` 改为 `openai-compatible` 并指向其本地地址。带认证的本地兼容服务可以在 `configure` 时提供 `apiKey`；它只保存在当前页面内存中，不进入快照、存档、构建产物或 Git：

```js
llm.configure({
  enabled: true,
  provider: 'openai-compatible',
  endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
  model: 'local-model',
  apiKey: 'optional-local-key'
});
```

如需更换整套定义，先在本地读取并编辑 `config/llm-scene-presets.json`，再把 JSON 对象传给 `configure({ config })`。适配器会拒绝重复 ID、缺失字段、过大的数组和不在配置中的风格 / 社交模型。

## 运行边界

模型输出限制为一个已知 `styleId`、一个已知 `socialModelId`、有限文本和最多 24 个道具提案。模块不执行模型返回的代码、URL、坐标脚本或游戏操作。生产联机房间应由房主 / 服务端决定是否采纳提案；不要把客户端 LLM 输出当成多人权威状态。
