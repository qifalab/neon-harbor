/**
 * Small, side-effect free graphics capability probe used before Three.js boots.
 *
 * Three's current WebGLRenderer intentionally requests WebGL 2.  Keeping this
 * probe separate lets the startup screen distinguish a disabled browser GPU,
 * a WebGL 1-only device, and a renderer setup failure instead of presenting
 * the same generic error for all three cases.
 */

const PROFILES = Object.freeze([
  { antialias: true, powerPreference: 'high-performance', label: 'antialias/high-performance' },
  { antialias: false, powerPreference: 'high-performance', label: 'no-antialias/high-performance' },
  { antialias: false, powerPreference: 'default', label: 'no-antialias/default' },
  { antialias: false, powerPreference: 'low-power', label: 'no-antialias/low-power' },
]);

const CONTEXT_ATTRIBUTES = Object.freeze({
  alpha: true,
  depth: true,
  stencil: false,
  antialias: true,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
});

function contextDetails(context) {
  if (!context || typeof context.getParameter !== 'function') return {};
  const details = {};
  try { details.version = String(context.getParameter(context.VERSION) || ''); } catch { /* optional diagnostic */ }
  try { details.renderer = String(context.getParameter(context.RENDERER) || ''); } catch { /* optional diagnostic */ }
  try { details.vendor = String(context.getParameter(context.VENDOR) || ''); } catch { /* optional diagnostic */ }
  return details;
}

function readContext(canvas, kind, profile = PROFILES[0]) {
  try {
    const { label: _label, ...attributes } = profile;
    return { context: canvas?.getContext?.(kind, { ...CONTEXT_ATTRIBUTES, ...attributes }) || null, error: null };
  } catch (error) {
    return { context: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Try WebGL 2 context attributes on the final canvas.  Browsers can reject a
 * context because of antialiasing or adapter preference while still accepting
 * a plain WebGL 2 context; trying profiles before Three boots avoids wasting a
 * context on a detached probe and lets the selected context be reused.
 */
export function createWebGL2Context(canvas) {
  const attempts = [];
  for (const profile of PROFILES) {
    const result = readContext(canvas, 'webgl2', profile);
    if (result.context) {
      return { context: result.context, profile: profile.label, attempts, error: null };
    }
    attempts.push({ profile: profile.label, error: result.error || 'getContext returned null' });
  }
  return { context: null, profile: null, attempts, error: attempts.at(-1)?.error || null };
}

/**
 * @param {HTMLCanvasElement|{getContext?:Function}} canvas
 * @returns {{webgl2:boolean,webgl1:boolean,mode:string,version:string,renderer:string,vendor:string,error:string|null}}
 */
export function inspectGraphics(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return { webgl2: false, webgl1: false, mode: 'unsupported', version: '', renderer: '', vendor: '', error: 'canvas.getContext unavailable' };
  }

  const webgl2 = createWebGL2Context(canvas);
  if (webgl2.context) {
    const details = contextDetails(webgl2.context);
    return { webgl2: true, webgl1: false, mode: 'webgl2', profile: webgl2.profile, attempts: webgl2.attempts, context: webgl2.context, ...details, error: null };
  }

  // Only probe WebGL 1 after WebGL 2 failed.  Creating another context first
  // can consume a browser's single context slot and hide the useful distinction.
  const webgl1 = readContext(canvas, 'webgl', { antialias: false, powerPreference: 'default' });
  const details = contextDetails(webgl1.context);
  return {
    webgl2: false,
    webgl1: !!webgl1.context,
    mode: webgl1.context ? 'webgl1-only' : 'unavailable',
    ...details,
    attempts: webgl2.attempts,
    error: webgl2.error || webgl1.error || null,
  };
}

export class GraphicsUnavailableError extends Error {
  constructor(capability) {
    const reason = capability?.mode === 'webgl1-only'
      ? 'WebGL 2 is unavailable; this browser exposes WebGL 1 only.'
      : 'WebGL 2 is unavailable in this browser context.';
    super(reason);
    this.name = 'GraphicsUnavailableError';
    this.capability = capability;
  }
}

/**
 * Construct Three's renderer with conservative fallbacks.  A context can be
 * rejected for antialiasing or adapter preference even when a plain WebGL 2
 * context is available, especially in remote desktops and power-saving modes.
 * The caller supplies the constructor so this helper remains easy to test
 * without importing Three or opening a real browser context.
 */
export function createRendererWithFallback(Renderer, canvas, capability = inspectGraphics(canvas)) {
  if (!capability?.context) {
    const unavailable = new GraphicsUnavailableError(capability || { mode: 'unavailable' });
    unavailable.contextAttempts = capability?.attempts || [];
    throw unavailable;
  }
  try {
    const renderer = new Renderer({
      canvas,
      context: capability.context,
      antialias: capability.profile === 'antialias/high-performance',
      powerPreference: capability.profile === 'antialias/high-performance' ? 'high-performance' : 'default',
    });
    return { renderer, profile: capability.profile, attempts: capability.attempts, capability };
  } catch (error) {
    const setupFailure = error instanceof Error ? error : new Error(String(error));
    setupFailure.name = 'RendererInitializationError';
    setupFailure.rendererAttempts = [...(capability.attempts || []), { profile: capability.profile, error: setupFailure.message }];
    throw setupFailure;
  }
}

export function graphicsFailureCopy(capability, error = null) {
  const mode = capability?.mode || 'unavailable';
  if (mode === 'webgl1-only') {
    return {
      title: '当前浏览器只有 WebGL 1',
      body: '霓港的高画质城市渲染需要 WebGL 2。请更新浏览器并开启硬件加速；若在远程桌面或内嵌预览中打开，请改用本机 Chrome、Edge、Firefox 或 Safari。',
      action: 'WebGL 1 仍可用于旧网页，但不能安全承载当前城市的材质、阴影和室内流式加载。',
    };
  }
  if (mode === 'renderer-failure') {
    return {
      title: 'WebGL 2 已检测到，但图形上下文启动失败',
      body: '浏览器报告了 WebGL 2，却没有完成当前渲染器的初始化。请刷新页面、关闭占用 GPU 的标签页，或暂时把浏览器硬件加速切换一次。',
      action: error?.message || '请重试并查看下方诊断信息。',
    };
  }
  return {
    title: '暂时无法启动三维画面',
    body: '当前页面没有拿到可用的 WebGL 2 上下文。常见原因是硬件加速关闭、浏览器 GPU 黑名单、远程桌面限制，或应用被嵌在禁用 WebGL 的预览窗口中。',
    action: '请用新版 Chrome、Edge、Firefox 或 Safari 直接打开页面；本地解压运行时请先执行 npm start。',
  };
}

export function graphicsDiagnosticText(capability, error = null) {
  const lines = [
    `mode=${capability?.mode || 'unknown'}`,
    `webgl2=${capability?.webgl2 ? 'yes' : 'no'}`,
    `webgl1=${capability?.webgl1 ? 'yes' : 'no'}`,
  ];
  if (capability?.version) lines.push(`version=${capability.version}`);
  if (capability?.renderer) lines.push(`renderer=${capability.renderer}`);
  if (capability?.vendor) lines.push(`vendor=${capability.vendor}`);
  if (capability?.error) lines.push(`probeError=${capability.error}`);
  if (Array.isArray(capability?.attempts) && capability.attempts.length) lines.push(`contextAttempts=${JSON.stringify(capability.attempts)}`);
  if (error?.message) lines.push(`startupError=${error.message}`);
  if (Array.isArray(error?.rendererAttempts)) lines.push(`rendererAttempts=${JSON.stringify(error.rendererAttempts)}`);
  return lines.join('\n');
}
