import { createClient } from '@supabase/supabase-js'

// Environment variables with fallback support
export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://whtbepsvagdvvauhrlji.supabase.co'
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_DT8Uh9fYZPfWhNsP6xZRgA_Tr9i2vmy'
export const N8N_WEBHOOK_URL = (import.meta as any).env?.VITE_N8N_WEBHOOK_URL || 'https://gairikz8.app.n8n.cloud/webhook/parikrama-upload'

export const isSupabaseConfigured = () => {
  return (
    SUPABASE_URL &&
    !SUPABASE_URL.includes('your-project') &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_ANON_KEY.includes('your-anon-key')
  )
}

export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

export interface SubmissionPayload {
  selectedFile: File
  selectedFiles?: File[]
  pandalName: string
  neighborhood: string
  coords: { lat: number; lng: number }
  locationSource: string
  source: 'camera' | 'gallery'
  userName?: string
  userId?: string
  userAvatar?: string
}

export interface SupabaseSubmissionRow {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  image_path?: string
  image_url?: string
  metadata?: {
    [key: string]: any
    pandalName?: string
    pandal?: string
    neighborhood?: string
    userName?: string
    uploader?: string
    userAvatar?: string
    avatar?: string
    userId?: string
    mediaUrl?: string
    imageUrl?: string
    lat?: number
    lng?: number
    source?: string
    locationSource?: string
    viewsCount?: number
    likesCount?: number
    emoji?: string
  }
  llm_verdict?: any
  published_at?: string
  created_at?: string
  pandal_name?: string
  neighborhood_col?: string
  lat?: number
  lng?: number
  user_name?: string
}

/**
 * Dispatches a multipart/form-data upload to the n8n moderation webhook
 */
export async function submitPhotoToN8n(payload: SubmissionPayload): Promise<{ ok: boolean; status: number; message?: string }> {
  try {
    const formData = new FormData()
    formData.append('photo', payload.selectedFile, payload.selectedFile.name || 'pandal-snap.jpg')
    if (payload.selectedFiles && payload.selectedFiles.length > 0) {
      payload.selectedFiles.forEach((file, idx) => {
        formData.append('photos', file, file.name || `photo-${idx}.jpg`)
      })
      formData.append('photoCount', String(payload.selectedFiles.length))
    }
    formData.append('pandalName', payload.pandalName)
    formData.append('neighborhood', payload.neighborhood || 'Agartala')
    formData.append('userName', payload.userName || 'Devotee')
    formData.append('userId', payload.userId || 'anon-user')
    formData.append('userAvatar', payload.userAvatar || '')
    formData.append('lat', String(payload.coords.lat))
    formData.append('lng', String(payload.coords.lng))
    formData.append('source', payload.source || 'gallery')
    formData.append('locationSource', payload.locationSource || 'auto')

    console.log('📡 Submitting multipart/form-data to n8n webhook:', N8N_WEBHOOK_URL)
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    })

    if (response.ok) {
      console.log('✅ n8n webhook received submission successfully!')
      return { ok: true, status: response.status }
    } else {
      console.warn('⚠️ n8n webhook response status:', response.status, response.statusText)
      return { ok: false, status: response.status, message: `Status ${response.status}: ${response.statusText}` }
    }
  } catch (err: any) {
    console.error('❌ Failed to dispatch photo to n8n webhook:', err)
    return { ok: false, status: 0, message: err?.message || 'Network error' }
  }
}

/**
 * Fetches approved submissions from Supabase table `submissions`
 */
export async function fetchApprovedSubmissions(): Promise<SupabaseSubmissionRow[]> {
  if (!isSupabaseConfigured() || !supabase) {
    console.log('ℹ️ Supabase not configured; returning empty approved list (demo seed fallback active).')
    return []
  }

  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('status', 'approved')
      .order('published_at', { ascending: false })

    if (error) {
      console.warn('⚠️ Supabase fetch notice:', error.message)
      return []
    }

    console.log(`✅ Loaded ${data?.length || 0} approved pandal snaps from Supabase.`)
    return (data as SupabaseSubmissionRow[]) || []
  } catch (e) {
    console.warn('⚠️ Error querying Supabase submissions:', e)
    return []
  }
}
