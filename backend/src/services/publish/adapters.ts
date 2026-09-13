/**
 * Adapter platform sosial — kerangka integrasi YouTube / TikTok / Meta (Facebook+Instagram)
 * Setiap platform mengimplementasikan:
 *  - buildAuthUrl: URL OAuth untuk memulai otentikasi
 *  - exchangeCode: menukar kode OAuth dengan access token (berbeda-beda tiap platform)
 *  - upload: nantinya mengunggah video (placeholder — belum diuji e2e, menunggu kredensial user)
 */

export interface PublishProviderConfig {
  provider: string
  clientId: string
  clientSecret: string
  scopes?: string
  authUrl?: string
  tokenUrl?: string
}

export interface TokenResult {
  accessToken: string
  refreshToken?: string
  channelId?: string
  channelName?: string
  expiresIn?: number
}

export interface PublishAdapter {
  provider: string
  name: string
  buildAuthUrl(config: PublishProviderConfig, redirectUri: string): string
  exchangeCode(config: PublishProviderConfig, code: string, redirectUri: string): Promise<TokenResult>
  upload(input: {
    accessToken: string
    videoPath: string
    thumbnailPath?: string
    title: string
    description: string
    tags: string[]
  }): Promise<{ platformVideoId?: string; platformUrl?: string }>
}

/** YouTube / Google OAuth2 (form POST token endpoint) */
const youtube: PublishAdapter = {
  provider: 'youtube',
  name: 'YouTube',
  buildAuthUrl(config, redirectUri) {
    const scopes = config.scopes || 'https://www.googleapis.com/auth/youtube.upload'
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      include_granted_scopes: 'true',
    })
    return `${config.authUrl || 'https://accounts.google.com/o/oauth2/v2/auth'}?${params.toString()}`
  },
  async exchangeCode(config, code, redirectUri) {
    const params = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    const resp = await fetch(config.tokenUrl || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!resp.ok) throw new Error(`Token YouTube gagal: ${resp.status} ${await resp.text()}`)
    const json = await resp.json() as any
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      channelId: json.channel_id,
      expiresIn: json.expires_in,
    }
  },
  upload() {
    return Promise.reject(new Error('Upload YouTube memerlukan kredensial user; implementasi aktif menyusul'))
  },
}

/** TikTok Content Posting API */
const tiktok: PublishAdapter = {
  provider: 'tiktok',
  name: 'TikTok',
  buildAuthUrl(config, redirectUri) {
    const scopes = config.scopes || 'user.info.basic,video.publish,video.upload'
    const params = new URLSearchParams({
      client_key: config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
    })
    return `${config.authUrl || 'https://www.tiktok.com/v2/auth/authorize/'}?${params.toString()}`
  },
  async exchangeCode(config, code, redirectUri) {
    const resp = await fetch(config.tokenUrl || 'https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    })
    if (!resp.ok) throw new Error(`Token TikTok gagal: ${resp.status} ${await resp.text()}`)
    const json = await resp.json() as any
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in }
  },
  upload() {
    return Promise.reject(new Error('Upload TikTok memerlukan kredensial user; implementasi aktif menyusul'))
  },
}

/** Meta Graph API (Halaman Facebook / Business Instagram) */
const meta: PublishAdapter = {
  provider: 'meta',
  name: 'Facebook / Instagram',
  buildAuthUrl(config, redirectUri) {
    const scopes = config.scopes || 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish'
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
    })
    return `${config.authUrl || 'https://www.facebook.com/v22.0/dialog/oauth'}?${params.toString()}`
  },
  async exchangeCode(config, code, redirectUri) {
    // Meta mengekspos token via query GET
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    })
    const resp = await fetch(`https://graph.facebook.com/v22.0/oauth/access_token?${params.toString()}`)
    if (!resp.ok) throw new Error(`Token Meta gagal: ${resp.status} ${await resp.text()}`)
    const json = await resp.json() as any
    return { accessToken: json.access_token, expiresIn: json.expires_in }
  },
  upload() {
    return Promise.reject(new Error('Upload Meta memerlukan kredensial user; implementasi aktif menyusul'))
  },
}

export const publishAdapters: Record<string, PublishAdapter> = {
  youtube,
  tiktok,
  meta,
}

export function getPublishAdapter(provider: string): PublishAdapter {
  const adapter = publishAdapters[provider]
  if (!adapter) throw new Error(`Penyedia publikasi tidak didukung: ${provider}`)
  return adapter
}