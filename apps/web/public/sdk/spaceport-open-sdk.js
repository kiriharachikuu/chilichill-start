/**
 * 厚嘴唇空间站开放平台 SDK v1.0.0
 * ------------------------------------------------------------------
 * 零依赖、单文件 UMD 构建，浏览器与 Node.js 双端可用：
 *
 * 浏览器（<script> 引入）：
 *   <script src="https://<空间站域名>/sdk/spaceport-open-sdk.js"></script>
 *   SpaceportOpen.buildAuthorizeUrl({ apiBase, clientId, redirectUri })
 *   SpaceportOpen.handleCallback()
 *
 * Node.js（CommonJS）：
 *   const SpaceportOpen = require('./spaceport-open-sdk.js');
 *   await SpaceportOpen.exchangeCode({ apiBase, clientId, clientSecret, redirectUri, code });
 *   await SpaceportOpen.fetchUserInfo({ apiBase, accessToken });
 *
 * 授权流程遵循 OAuth2 授权码模式：
 *   1. 引导用户跳转 authorize 授权页（buildAuthorizeUrl 自动生成并暂存 state）
 *   2. 用户确认后回到回调地址，前端用 handleCallback 校验 state 并取出 code
 *   3. 服务端用 exchangeCode 以 client_secret 换取访问令牌（secret 不得出现在浏览器）
 *   4. 用 fetchUserInfo 读取用户基础信息（id / uid / 昵称 / 头像）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SpaceportOpen = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SDK_VERSION = '1.0.0';
  // 授权范围当前固定为基础信息，预留扩展
  var DEFAULT_SCOPE = 'basic';
  var STATE_STORAGE_KEY = 'spaceport_open_oauth_state';

  function assertNonEmpty(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('[SpaceportOpen] 参数 ' + name + ' 不能为空');
    }
    return value.trim();
  }

  function normalizeBase(apiBase) {
    var base = assertNonEmpty(apiBase, 'apiBase');
    return base.replace(/\/+$/, '');
  }

  /** 生成 32 字节随机 state（优先 Web Crypto，Node 与旧环境回退 Math.random） */
  function randomState() {
    var bytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var hex = '';
    for (var j = 0; j < bytes.length; j += 1) {
      hex += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
    }
    return hex;
  }

  /**
   * 构造授权页地址并暂存 state（浏览器专用）。
   * @param {object} options
   * @param {string} options.apiBase     空间站 API 根地址，如 https://spaceport.example.com
   * @param {string} options.clientId    后台「接入应用」分配的 client_id
   * @param {string} options.redirectUri 已在后台白名单注册的回调地址（精确匹配）
   * @param {string} [options.scope]     授权范围，默认 basic
   * @returns {string} 授权页完整 URL，直接 window.location.href 跳转即可
   */
  function buildAuthorizeUrl(options) {
    options = options || {};
    var base = normalizeBase(options.apiBase);
    var clientId = assertNonEmpty(options.clientId, 'clientId');
    var redirectUri = assertNonEmpty(options.redirectUri, 'redirectUri');
    var state = randomState();

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem(STATE_STORAGE_KEY, state);
      } catch (error) {
        // 隐私模式下可能禁用存储：state 校验将退化为仅透传比对
      }
    }

    var params = [
      'client_id=' + encodeURIComponent(clientId),
      'redirect_uri=' + encodeURIComponent(redirectUri),
      'state=' + encodeURIComponent(state),
      'scope=' + encodeURIComponent(options.scope || DEFAULT_SCOPE),
    ];
    return base + '/oauth/authorize?' + params.join('&');
  }

  /**
   * 处理授权回调（浏览器专用）：在回调地址页调用。
   * 校验 state 防 CSRF，返回 { ok, code } / { ok:false, error } / { ok:false, error:'invalid_state' }。
   * @param {object} [options]
   * @param {string} [options.search] 回调 URL 的 query 串，默认取当前页面 location.search
   */
  function handleCallback(options) {
    options = options || {};
    var search = options.search;
    if (typeof search !== 'string') {
      if (typeof location === 'undefined') {
        throw new Error('[SpaceportOpen] handleCallback 仅能在浏览器环境调用，或显式传入 options.search');
      }
      search = location.search;
    }

    var params = new URLSearchParams(search);
    var error = params.get('error');
    if (error) {
      return { ok: false, error: error, errorDescription: params.get('error_description') };
    }

    var code = params.get('code');
    var state = params.get('state');
    if (!code || !state) {
      return { ok: false, error: 'invalid_request', errorDescription: '回调缺少 code 或 state 参数' };
    }

    var expectedState = null;
    if (typeof sessionStorage !== 'undefined') {
      try {
        expectedState = sessionStorage.getItem(STATE_STORAGE_KEY);
        sessionStorage.removeItem(STATE_STORAGE_KEY);
      } catch (error2) {
        // 同上：读取失败时跳过本地比对
      }
    }
    if (expectedState && expectedState !== state) {
      return { ok: false, error: 'invalid_state', errorDescription: 'state 校验失败，可能存在 CSRF 风险' };
    }

    return { ok: true, code: code, state: state };
  }

  /**
   * 授权码换取访问令牌（服务端专用，client_secret 绝不能在前端使用）。
   * @param {object} options
   * @param {string} options.apiBase       空间站 API 根地址
   * @param {string} options.clientId
   * @param {string} options.clientSecret
   * @param {string} options.redirectUri   必须与授权时完全一致
   * @param {string} options.code          回调拿到的授权码
   * @returns {Promise<{access_token, token_type, expires_in, scope, user}>}
   */
  function exchangeCode(options) {
    options = options || {};
    var base = normalizeBase(options.apiBase);
    var body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: assertNonEmpty(options.clientId, 'clientId'),
      client_secret: assertNonEmpty(options.clientSecret, 'clientSecret'),
      redirect_uri: assertNonEmpty(options.redirectUri, 'redirectUri'),
      code: assertNonEmpty(options.code, 'code'),
    });

    return fetch(base + '/api/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var message = (data && data.error && data.error.message) || '令牌交换失败';
          throw new Error('[SpaceportOpen] ' + message + '（code=' + ((data && data.error && data.error.code) || 'UNKNOWN') + '）');
        }
        return data;
      });
    });
  }

  /**
   * 读取授权用户的基础信息（服务端专用）。
   * @param {object} options
   * @param {string} options.apiBase    空间站 API 根地址
   * @param {string} options.accessToken 访问令牌
   * @returns {Promise<{user:{id,uid,nickname,avatarUrl}}>}
   */
  function fetchUserInfo(options) {
    options = options || {};
    var base = normalizeBase(options.apiBase);
    var token = assertNonEmpty(options.accessToken, 'accessToken');

    return fetch(base + '/api/oauth/userinfo', {
      headers: { authorization: 'Bearer ' + token },
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var message = (data && data.error && data.error.message) || '读取用户信息失败';
          throw new Error('[SpaceportOpen] ' + message + '（code=' + ((data && data.error && data.error.code) || 'UNKNOWN') + '）');
        }
        return data;
      });
    });
  }

  return {
    version: SDK_VERSION,
    defaultScope: DEFAULT_SCOPE,
    buildAuthorizeUrl: buildAuthorizeUrl,
    handleCallback: handleCallback,
    exchangeCode: exchangeCode,
    fetchUserInfo: fetchUserInfo,
  };
});
