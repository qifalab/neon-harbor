/**
 * Optional local LLM adapter for authored scene dressing and resident dialogue.
 *
 * The adapter is deliberately deterministic by default. A game build can expose
 * it through diagnostics, but it never creates a network request until a caller
 * explicitly enables an endpoint. The LLM only proposes a bounded scene plan;
 * the renderer, navigation, economy, permissions and save systems remain the
 * authority for applying that plan.
 */

export const SCENE_CONFIG_VERSION = 1;

const ID_RE = /^[a-z][a-z0-9-]{1,47}$/;
const PROVIDERS = new Set(['openai-compatible', 'ollama']);
const DEFAULT_TIMEOUT_MS = 4500;
const MAX_TEXT = 280;
const MAX_PROPS = 24;

const RAW_DEFAULT_CONFIG = {
  version: SCENE_CONFIG_VERSION,
  styles: [
    {
      id: 'harbor-residential',
      label: 'Harbor residential',
      buildingKinds: ['residential', 'shophouse'],
      palette: ['plaster-warm', 'paint-faded', 'tile-ochre'],
      materials: ['plaster', 'tile', 'painted-metal'],
      facadeDetails: ['awning', 'laundry', 'window-planter'],
      lighting: 'warm-window',
    },
    {
      id: 'quay-workshop',
      label: 'Quay workshop',
      buildingKinds: ['workshop', 'warehouse', 'industrial'],
      palette: ['concrete-salt', 'oxide-red', 'signal-blue'],
      materials: ['concrete', 'corrugated-metal', 'rubber'],
      facadeDetails: ['loading-bay', 'roller-door', 'safety-rail'],
      lighting: 'cool-task',
    },
    {
      id: 'civic-art-deco',
      label: 'Civic art deco',
      buildingKinds: ['civic', 'office', 'hotel'],
      palette: ['stone-pale', 'brass', 'glass-smoke'],
      materials: ['stone', 'brass', 'glass'],
      facadeDetails: ['vertical-fins', 'canopy', 'plaque'],
      lighting: 'evening-gold',
    },
  ],
  socialModels: [
    {
      id: 'everyday-commuter',
      label: 'Everyday commuter',
      roles: ['resident', 'commuter', 'worker'],
      traits: ['punctual', 'observant', 'brief'],
      goals: ['reach-work', 'buy-necessities', 'return-home'],
      conversationTopics: ['weather', 'transit', 'opening-hours'],
      cadenceSeconds: 45,
    },
    {
      id: 'shopkeeper-host',
      label: 'Shopkeeper host',
      roles: ['shopkeeper', 'vendor', 'barista'],
      traits: ['welcoming', 'practical', 'inventory-aware'],
      goals: ['serve-customer', 'restock', 'close-shop'],
      conversationTopics: ['stock', 'neighborhood', 'delivery'],
      cadenceSeconds: 60,
    },
    {
      id: 'maker-collaborator',
      label: 'Maker collaborator',
      roles: ['craftsperson', 'worker', 'courier'],
      traits: ['hands-on', 'focused', 'helpful'],
      goals: ['finish-task', 'deliver-order', 'share-tip'],
      conversationTopics: ['materials', 'routes', 'weather'],
      cadenceSeconds: 50,
    },
  ],
};

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function validString(value, max = 80) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function configErrors(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['config must be an object'];
  if (config.version !== SCENE_CONFIG_VERSION) errors.push(`version must be ${SCENE_CONFIG_VERSION}`);
  if (!Array.isArray(config.styles) || config.styles.length === 0 || config.styles.length > 64) errors.push('styles must contain 1-64 entries');
  if (!Array.isArray(config.socialModels) || config.socialModels.length === 0 || config.socialModels.length > 64) errors.push('socialModels must contain 1-64 entries');
  const checkIds = (entries, name) => {
    const ids = new Set();
    for (const [index, entry] of (entries || []).entries()) {
      if (!entry || typeof entry !== 'object') { errors.push(`${name}[${index}] must be an object`); continue; }
      if (!ID_RE.test(entry.id || '')) errors.push(`${name}[${index}].id must match ${ID_RE}`);
      else if (ids.has(entry.id)) errors.push(`${name} contains duplicate id ${entry.id}`);
      ids.add(entry.id);
      if (!validString(entry.label, 100)) errors.push(`${name}[${index}].label is required`);
      if (name === 'styles') {
        for (const key of ['buildingKinds', 'palette', 'materials', 'facadeDetails']) if (!Array.isArray(entry[key]) || entry[key].length === 0 || entry[key].length > 32) errors.push(`${name}[${index}].${key} must be a non-empty array`);
        if (!validString(entry.lighting, 60)) errors.push(`${name}[${index}].lighting is required`);
      } else {
        for (const key of ['roles', 'traits', 'goals', 'conversationTopics']) if (!Array.isArray(entry[key]) || entry[key].length === 0 || entry[key].length > 32) errors.push(`${name}[${index}].${key} must be a non-empty array`);
        if (!Number.isFinite(entry.cadenceSeconds) || entry.cadenceSeconds < 5 || entry.cadenceSeconds > 3600) errors.push(`${name}[${index}].cadenceSeconds must be between 5 and 3600`);
      }
    }
  };
  checkIds(config.styles, 'styles');
  checkIds(config.socialModels, 'socialModels');
  return errors;
}

/** Return validation details without mutating the caller's configuration. */
export function validateSceneConfig(config) {
  const errors = configErrors(config);
  return { valid: errors.length === 0, errors };
}

/** Validate, clone and deep-freeze a scene configuration for runtime use. */
export function normalizeSceneConfig(config = RAW_DEFAULT_CONFIG) {
  const errors = configErrors(config);
  if (errors.length) throw new TypeError(`Invalid scene config: ${errors.join('; ')}`);
  return freezeDeep(clone(config));
}

export const DEFAULT_SCENE_CONFIG = normalizeSceneConfig(RAW_DEFAULT_CONFIG);

function findStyle(config, input = {}) {
  const requested = input.styleId || input.stylePreset;
  if (requested) {
    const exact = config.styles.find(style => style.id === requested);
    if (exact) return exact;
  }
  const kind = typeof input.buildingKind === 'string' ? input.buildingKind : 'residential';
  return config.styles.find(style => style.buildingKinds.includes(kind)) || config.styles[0];
}

function findSocialModel(config, input = {}) {
  const requested = input.socialModelId || input.socialPreset;
  if (requested) {
    const exact = config.socialModels.find(model => model.id === requested);
    if (exact) return exact;
  }
  const role = typeof input.role === 'string' ? input.role : 'resident';
  return config.socialModels.find(model => model.roles.includes(role)) || config.socialModels[0];
}

function boundedText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : fallback;
}

function deterministicPlan(config, input = {}) {
  const style = findStyle(config, input);
  const socialModel = findSocialModel(config, input);
  const place = boundedText(input.place || input.buildingName, '港湾街区');
  const role = boundedText(input.role, socialModel.roles[0]);
  return {
    version: SCENE_CONFIG_VERSION,
    source: 'deterministic',
    styleId: style.id,
    socialModelId: socialModel.id,
    mood: `在${place}保持${style.lighting}氛围`,
    socialIntent: `${role}按${socialModel.goals[0]}行动`,
    dialogue: `${socialModel.conversationTopics[0]}是今天在${place}最自然的话题。`,
    props: style.facadeDetails.slice(0, 4).map((kind, index) => ({ id: `${style.id}-prop-${index + 1}`, kind, anchor: 'facade', variation: index })),
  };
}

function planErrors(plan, config) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['plan must be an object'];
  if (plan.version !== SCENE_CONFIG_VERSION) errors.push(`version must be ${SCENE_CONFIG_VERSION}`);
  if (!config.styles.some(style => style.id === plan.styleId)) errors.push(`unknown styleId ${String(plan.styleId)}`);
  if (!config.socialModels.some(model => model.id === plan.socialModelId)) errors.push(`unknown socialModelId ${String(plan.socialModelId)}`);
  for (const key of ['mood', 'socialIntent', 'dialogue']) if (plan[key] !== undefined && !validString(plan[key], MAX_TEXT)) errors.push(`${key} must be a string up to ${MAX_TEXT} characters`);
  if (plan.props !== undefined) {
    if (!Array.isArray(plan.props) || plan.props.length > MAX_PROPS) errors.push(`props must contain 0-${MAX_PROPS} entries`);
    else for (const [index, prop] of plan.props.entries()) {
      if (!prop || typeof prop !== 'object' || !validString(prop.id, 80) || !validString(prop.kind, 60) || !validString(prop.anchor, 60)) errors.push(`props[${index}] requires id, kind and anchor`);
      if (prop.variation !== undefined && (!Number.isInteger(prop.variation) || prop.variation < 0 || prop.variation > 31)) errors.push(`props[${index}].variation must be 0-31`);
    }
  }
  return errors;
}

/** Validate and strip untrusted model output before it can reach game systems. */
export function validateScenePlan(plan, config = DEFAULT_SCENE_CONFIG) {
  const normalizedConfig = normalizeSceneConfig(config);
  const errors = planErrors(plan, normalizedConfig);
  if (errors.length) return { valid: false, errors };
  const safe = {
    version: SCENE_CONFIG_VERSION,
    source: plan.source === 'llm' ? 'llm' : 'deterministic',
    styleId: plan.styleId,
    socialModelId: plan.socialModelId,
    mood: boundedText(plan.mood),
    socialIntent: boundedText(plan.socialIntent),
    dialogue: boundedText(plan.dialogue),
    props: (plan.props || []).map(prop => ({ id: prop.id.trim(), kind: prop.kind.trim(), anchor: prop.anchor.trim(), variation: prop.variation === undefined ? 0 : prop.variation })),
  };
  return { valid: true, value: safe, errors: [] };
}

function parseModelContent(payload, provider) {
  const content = provider === 'ollama' ? payload?.message?.content : payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('LLM response did not contain message content');
  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : content);
}

function endpointFor(provider, endpoint) {
  if (endpoint) return endpoint;
  return provider === 'ollama' ? 'http://127.0.0.1:11434/api/chat' : 'http://127.0.0.1:1234/v1/chat/completions';
}

function localEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch { return false; }
}

function createPrompt(config, input) {
  return [
    'You are the Neon Harbor local scene director.',
    'Return JSON only. Never return code, URLs, executable actions, or unbounded coordinates.',
    `Use exactly one styleId from: ${config.styles.map(item => item.id).join(', ')}.`,
    `Use exactly one socialModelId from: ${config.socialModels.map(item => item.id).join(', ')}.`,
    'Schema: {version:1,styleId:string,socialModelId:string,mood:string,socialIntent:string,dialogue:string,props:[{id:string,kind:string,anchor:string,variation:integer}]}',
    `props has at most ${MAX_PROPS} entries; all text is at most ${MAX_TEXT} characters.`,
    `Input: ${JSON.stringify(input)}`,
  ].join('\n');
}

function requestBody(provider, model, prompt) {
  const messages = [
    { role: 'system', content: 'You propose bounded, non-authoritative scene dressing and social intent for a game. The deterministic simulation remains authoritative.' },
    { role: 'user', content: prompt },
  ];
  return provider === 'ollama'
    ? { model, messages, stream: false, format: 'json', options: { temperature: 0.2 } }
    : { model, messages, temperature: 0.2, response_format: { type: 'json_object' } };
}

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const abort = () => controller.abort(signal?.reason || new DOMException('Request cancelled', 'AbortError'));
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  timer = setTimeout(() => controller.abort(new DOMException('LLM request timed out', 'TimeoutError')), timeoutMs);
  return { signal: controller.signal, done: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); } };
}

export function createSceneDirector(options = {}) {
  let config = normalizeSceneConfig(options.config || DEFAULT_SCENE_CONFIG);
  let apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  let settings = {
    enabled: options.enabled === true,
    provider: PROVIDERS.has(options.provider) ? options.provider : 'ollama',
    endpoint: typeof options.endpoint === 'string' ? options.endpoint : '',
    model: validString(options.model, 100) ? options.model.trim() : 'llama3.2',
    timeoutMs: Number.isFinite(options.timeoutMs) ? Math.max(250, Math.min(30000, options.timeoutMs)) : DEFAULT_TIMEOUT_MS,
    stylePreset: options.stylePreset || '',
    socialPreset: options.socialPreset || '',
    allowExternalEndpoint: options.allowExternalEndpoint === true,
  };
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  function getSettings() {
    return { ...settings, endpoint: endpointFor(settings.provider, settings.endpoint), hasApiKey: Boolean(apiKey) };
  }
  function configure(next = {}) {
    if (next.config) config = normalizeSceneConfig(next.config);
    if (next.apiKey !== undefined) {
      if (typeof next.apiKey !== 'string' || next.apiKey.length > 500) throw new TypeError('apiKey must be a string up to 500 characters');
      apiKey = next.apiKey.trim();
    }
    const merged = { ...settings, ...next };
    if (next.provider !== undefined && !PROVIDERS.has(next.provider)) throw new TypeError(`Unsupported provider ${next.provider}`);
    if (next.model !== undefined && !validString(next.model, 100)) throw new TypeError('model must be a non-empty string up to 100 characters');
    if (next.timeoutMs !== undefined && (!Number.isFinite(next.timeoutMs) || next.timeoutMs < 250 || next.timeoutMs > 30000)) throw new TypeError('timeoutMs must be between 250 and 30000');
    if (next.stylePreset && !config.styles.some(style => style.id === next.stylePreset)) throw new TypeError(`Unknown stylePreset ${next.stylePreset}`);
    if (next.socialPreset && !config.socialModels.some(model => model.id === next.socialPreset)) throw new TypeError(`Unknown socialPreset ${next.socialPreset}`);
    settings = {
      enabled: merged.enabled === true,
      provider: PROVIDERS.has(merged.provider) ? merged.provider : settings.provider,
      endpoint: typeof merged.endpoint === 'string' ? merged.endpoint : settings.endpoint,
      model: typeof merged.model === 'string' ? merged.model.trim() : settings.model,
      timeoutMs: Number.isFinite(merged.timeoutMs) ? Math.max(250, Math.min(30000, merged.timeoutMs)) : settings.timeoutMs,
      stylePreset: merged.stylePreset || '', socialPreset: merged.socialPreset || '',
      allowExternalEndpoint: merged.allowExternalEndpoint === true,
    };
    return getSettings();
  }
  function plan(input = {}) {
    return deterministicPlan(config, { ...input, stylePreset: input.stylePreset || settings.stylePreset, socialPreset: input.socialPreset || settings.socialPreset });
  }
  async function request(input = {}, requestOptions = {}) {
    const fallback = plan(input);
    if (!settings.enabled) return { ...fallback, fallbackReason: 'disabled' };
    if (typeof fetchImpl !== 'function') return { ...fallback, fallbackReason: 'fetch-unavailable' };
    const endpoint = endpointFor(settings.provider, settings.endpoint);
    if (!settings.allowExternalEndpoint && !localEndpoint(endpoint)) return { ...fallback, fallbackReason: 'external-endpoint-blocked' };
    const timeout = withTimeout(requestOptions.signal, settings.timeoutMs);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(requestBody(settings.provider, settings.model, createPrompt(config, input))), signal: timeout.signal });
      if (!response?.ok) throw new Error(`LLM HTTP ${response?.status || 0}`);
      const payload = await response.json();
      const parsed = parseModelContent(payload, settings.provider);
      const checked = validateScenePlan({ ...parsed, source: 'llm' }, config);
      if (!checked.valid) throw new Error(`LLM schema rejected: ${checked.errors.join(', ')}`);
      return checked.value;
    } catch (error) {
      return { ...fallback, fallbackReason: error?.name === 'TimeoutError' || timeout.signal.aborted ? 'timeout' : 'request-failed' };
    } finally { timeout.done(); }
  }
  return Object.freeze({
    config: () => config,
    getSettings,
    configure,
    plan,
    request,
    validate: value => validateScenePlan(value, config),
    exportConfig: () => clone(config),
  });
}
