import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  submitPhotoToN8n,
  fetchApprovedSubmissions,
  type SubmissionPayload,
  type SupabaseSubmissionRow
} from './lib/supabase'

/* ─────────────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────────────── */
export interface AuthUser {
  uid: string
  displayName: string
  email?: string
  photoURL: string
}

export interface SnapPost {
  id: string
  userId: string
  userName: string
  userAvatar: string
  mediaUrl: string
  mediaType: 'image' | 'video'
  pandalName: string
  lat: number
  lng: number
  viewsCount: number
  likesCount: number
  createdAt: any
  // Optional / helper aliases
  pandal?: string
  neighborhood?: string
  uploader?: string
  avatar?: string
  imageUrl?: string
  coordinates?: { lat: number; lng: number }
  timestamp?: Date
  likes?: number
  views?: number
  emoji?: string
  locationSource?: string
}

declare global {
  interface Window {
    google: any
    initMap?: () => void
    exifr?: any
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Constants & Master Pandals (For Search & Proximity Auto-Complete)
   ───────────────────────────────────────────────────────────────────────── */
const AGARTALA_CENTER = { lat: 23.8315, lng: 91.2868 }
const MAPS_API_KEY = 'AIzaSyCV8RIIXa0kW_T63kKNkW-vOm30yDMAiYc'

export const AGARTALA_MASTER_PANDALS = [
  { name: 'Bharat Ratna Sangha', neighborhood: 'Usha Bazar', lat: 23.8820, lng: 91.2785, emoji: '🪔' },
  { name: 'Ujjayanta Palace Mandap', neighborhood: 'Palace Compound', lat: 23.8350, lng: 91.2880, emoji: '👑' },
  { name: 'Banamalipur Club & Youth Union', neighborhood: 'Banamalipur', lat: 23.8335, lng: 91.2915, emoji: '🎆' },
  { name: 'Battala Durga Puja', neighborhood: 'Battala', lat: 23.8361, lng: 91.2812, emoji: '🪔' },
  { name: 'Dhaleswar Netaji Play Center', neighborhood: 'Dhaleswar', lat: 23.8310, lng: 91.2965, emoji: '🌟' },
  { name: 'Ramnagar Road No. 2', neighborhood: 'Ramnagar', lat: 23.8430, lng: 91.2840, emoji: '✨' },
  { name: 'Shanti Para Youth Club', neighborhood: 'Shantipara', lat: 23.8375, lng: 91.2905, emoji: '🎊' },
  { name: 'Melarmath Sarbajanin Mandap', neighborhood: 'Melarmath', lat: 23.8305, lng: 91.2855, emoji: '🕊️' },
  { name: 'Kali Bari Puja Samiti', neighborhood: 'Kali Bari', lat: 23.8295, lng: 91.2940, emoji: '🌺' },
  { name: 'Polestar Club', neighborhood: 'Banamalipur', lat: 23.8368, lng: 91.2932, emoji: '⚡' },
  { name: 'Deshabandhu Chittaranjan Club', neighborhood: 'Dhaleswar', lat: 23.8285, lng: 91.2985, emoji: '🎺' },
  { name: 'Aikatan Sangha', neighborhood: 'Kunjaban', lat: 23.8480, lng: 91.2890, emoji: '🪕' },
  { name: 'Badharghat Sporting Club', neighborhood: 'Badharghat', lat: 23.8120, lng: 91.2740, emoji: '🥁' },
  { name: 'Pratapgarh Youth Federation', neighborhood: 'Pratapgarh', lat: 23.8210, lng: 91.2895, emoji: '🔥' }
]

function calcHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const rad = Math.PI / 180
  const φ1 = lat1 * rad
  const φ2 = lat2 * rad
  const Δφ = (lat2 - lat1) * rad
  const Δλ = (lon2 - lon1) * rad
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function fmtDistanceMeters(meters: number): string {
  return meters < 1000 ? `${meters}m away` : `${(meters / 1000).toFixed(1)}km away`
}

// Purged mock/sample data: initialized empty for real-time Firestore sync
const SEED_POSTS: SnapPost[] = []

/* ─────────────────────────────────────────────────────────────────────────
   Dark mode map styles (Snapchat-style night theme)
   ───────────────────────────────────────────────────────────────────────── */
const DARK_MAP_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d0d1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#3d3d52' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#35354a' }] },
  { featureType: 'administrative', elementType: 'labels.text.stroke', stylers: [{ color: '#0d0d1a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#44445c' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#2e2e42' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#262638' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#2e2e42' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#0d0d1a' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1f18' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#243b2d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212140' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#404058' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e1e40' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a55' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4a4a62' }] },
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#12122a' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#38384e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060614' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#242636' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#060614' }] },
]

/* ─────────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────────── */
function timeAgo(date?: any): string {
  if (!date) return 'Just now'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return 'Just now'
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return `${Math.max(0, diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function uid(): string { return `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }

/* ── Haversine Distance Formula (km) ── */
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`
  return `${km.toFixed(1)} km away`
}

/* ── Spotify Durga Puja Playlist Data (Connected to Spotify) ── */
export interface SpotifyTrack {
  id: string
  title: string
  artist: string
  cover: string
  durationSec: number
  initialSec: number
  spotifyUrl: string
}

export const SPOTIFY_DURGA_TRACKS: SpotifyTrack[] = [
  {
    id: '1',
    title: 'Dugga Ma Asche',
    artist: 'Infra',
    cover: '/dugga-ma-asche.png',
    durationSec: 213, // 3:33
    initialSec: 163, // 2:43 as in screenshot!
    spotifyUrl: 'https://open.spotify.com/playlist/2cjLMgWAt3S6YNCEKFtVtk',
  },
  {
    id: '2',
    title: 'Dhaker Taale',
    artist: 'Abhijeet Bhattacharya, Shreya Ghoshal',
    cover: '/dugga-ma-asche.png',
    durationSec: 232, // 3:52
    initialSec: 45,
    spotifyUrl: 'https://open.spotify.com/playlist/2cjLMgWAt3S6YNCEKFtVtk',
  },
  {
    id: '3',
    title: 'Bolo Durga Mai Ki Jai',
    artist: 'Nakash Aziz',
    cover: '/dugga-ma-asche.png',
    durationSec: 195, // 3:15
    initialSec: 30,
    spotifyUrl: 'https://open.spotify.com/playlist/2cjLMgWAt3S6YNCEKFtVtk',
  },
  {
    id: '4',
    title: 'Elo Maa Dugga',
    artist: 'Jeet Gannguli',
    cover: '/dugga-ma-asche.png',
    durationSec: 242, // 4:02
    initialSec: 60,
    spotifyUrl: 'https://open.spotify.com/playlist/2cjLMgWAt3S6YNCEKFtVtk',
  },
]

function formatSongTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/* ── Web Audio Dhak Synthesizer (Authentic Bengali Puja Dhak Beats) ── */
class DhakAudioEngine {
  private ctx: AudioContext | null = null
  private timer: any = null
  private active = false
  private step = 0
  private masterGain: GainNode | null = null
  private muted = false

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
        this.masterGain = this.ctx.createGain()
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime)
        this.masterGain.connect(this.ctx.destination)
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime)
    }
  }

  play() {
    const ctx = this.initCtx()
    if (!ctx || this.active) return
    this.active = true
    this.step = 0

    const pattern = [
      'dhang', 'rest', 'kash', 'kash',
      'dhang', 'kash', 'kash', 'rest',
      'dhang', 'rest', 'kash', 'ghanta',
      'dhang', 'kash', 'kash', 'kash',
    ]

    const loop = () => {
      if (!this.active) return
      const stroke = pattern[this.step % pattern.length]
      const t = ctx.currentTime
      const dest = this.masterGain || ctx.destination

      if (stroke === 'dhang') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(130, t)
        osc.frequency.exponentialRampToValueAtTime(45, t + 0.16)
        gain.gain.setValueAtTime(0.35, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
        osc.connect(gain)
        gain.connect(dest)
        osc.start(t)
        osc.stop(t + 0.2)
      } else if (stroke === 'kash') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(300, t)
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.07)
        gain.gain.setValueAtTime(0.18, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
        osc.connect(gain)
        gain.connect(dest)
        osc.start(t)
        osc.stop(t + 0.08)
      } else if (stroke === 'ghanta') {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(1760, t)
        gain.gain.setValueAtTime(0.1, t)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
        osc.connect(gain)
        gain.connect(dest)
        osc.start(t)
        osc.stop(t + 0.3)
      }

      this.step++
      this.timer = setTimeout(loop, 130)
    }

    loop()
  }

  stop() {
    this.active = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Toast notification
   ───────────────────────────────────────────────────────────────────────── */
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', bottom: 140, left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: 'none',
      }}
      className="glass px-5 py-3 rounded-2xl text-white text-sm font-medium whitespace-nowrap shadow-2xl"
    >
      {message}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Story Modal
   ───────────────────────────────────────────────────────────────────────── */
function StoryModal({ post, onClose }: { post: SnapPost | null; onClose: () => void }) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(0)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!post) return
    setLiked(false)
    setLikes(post.likes ?? post.likesCount ?? 0)
    // Auto-progress bar
    setTimeout(() => {
      if (progressRef.current) progressRef.current.classList.add('playing')
    }, 100)
    const timer = setTimeout(onClose, 5200)
    return () => clearTimeout(timer)
  }, [post, onClose])

  const handleLike = () => {
    setLiked(l => !l)
    setLikes(n => liked ? n - 1 : n + 1)
  }

  return (
    <div
      id="story-modal"
      className={`fixed inset-0 z-[150] flex flex-col ${post ? 'visible' : 'hidden'}`}
      style={{ background: '#000' }}
    >
      {post && (
        <>
          {/* Full-screen image */}
          <img
            src={post.imageUrl}
            alt={post.pandal}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'brightness(0.7)' }}
          />

          {/* Gradient overlays */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.85) 100%)' }} />

          {/* Top controls */}
          <div className="relative z-10 px-4 pt-12 pb-3">
            {/* Progress bar */}
            <div className="flex gap-1 mb-4">
              <div className="story-progress-bar">
                <div ref={progressRef} className="story-progress-fill" />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={post.avatar} alt={post.uploader} className="w-9 h-9 rounded-full border-2 border-saffron" style={{ borderColor: '#FF6B00' }} />
                <div>
                  <p className="text-white font-semibold text-sm leading-tight">{post.uploader}</p>
                  <p className="text-white/60 text-xs">{timeAgo(post.timestamp)}</p>
                </div>
              </div>
              <button
                id="story-close-btn"
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-10 pt-6">
            <div className="mb-3">
              <span className="text-3xl">{post.emoji}</span>
              <h2 className="text-white font-bold text-2xl leading-tight mt-1">{post.pandal}</h2>
              <p className="text-white/70 text-sm mt-1">📍 {post.neighborhood}, Agartala</p>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" opacity="0.7"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
                <span className="text-white text-sm font-medium">{(post.views ?? post.viewsCount ?? 0).toLocaleString()}</span>
              </div>

              <button
                id="story-like-btn"
                onClick={handleLike}
                className="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
                style={{ background: liked ? 'rgba(255,107,0,0.35)' : 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? '#FF6B00' : 'white'} opacity={liked ? 1 : 0.7}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span className="text-white text-sm font-medium">{likes.toLocaleString()}</span>
              </button>

              <button
                id="story-share-btn"
                className="ml-auto w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white" opacity="0.8">
                  <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Upload Modal
   ───────────────────────────────────────────────────────────────────────── */
interface UploadModalProps {
  visible: boolean
  currentUser: AuthUser | null
  onRequireAuth: () => void
  onClose: () => void
  onSubmit: (payload: SubmissionPayload) => Promise<boolean>
}

function UploadModal({ visible, currentUser, onRequireAuth, onClose, onSubmit }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mediaSource, setMediaSource] = useState<'camera' | 'gallery'>('gallery')
  const [preview, setPreview] = useState<string | null>(null)
  const [pandalName, setPandalName] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(AGARTALA_CENTER)
  const [locationSource, setLocationSource] = useState<'exif' | 'live_gps' | 'city_center' | 'custom'>('live_gps')
  const [sourceBadge, setSourceBadge] = useState({ text: '📡 Live Device GPS', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' })
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [step, setStep] = useState<'capture' | 'details'>('capture')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setSelectedFile(null)
    setPreview(null)
    setPandalName('')
    setNeighborhood('')
    setCoords(AGARTALA_CENTER)
    setStep('capture')
    setSubmitting(false)
    setShowDropdown(false)
    setSearchFilter('')
  }

  const handleClose = () => { reset(); onClose() }

  // Strategy 4 Waterfall: EXIF -> Live GPS -> City Center (Images only)
  const processFileWaterfall = async (file: File, source: 'camera' | 'gallery') => {
    if (file.type && !file.type.startsWith('image/')) {
      alert('⚠️ Only photos can be submitted for Durga Puja pandal moderation. Videos are not accepted by our AI review pipeline.')
      return
    }

    setSelectedFile(file)
    setMediaSource(source)

    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
    setStep('details')

    let detectedCoords: { lat: number; lng: number } | null = null
    let detectedSource: 'exif' | 'live_gps' | 'city_center' = 'live_gps'

    // Step 1: EXIF Metadata (for photos)
    if (window.exifr) {
      try {
        const gps = await window.exifr.gps(file)
        if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number' && gps.latitude !== 0) {
          detectedCoords = { lat: gps.latitude, lng: gps.longitude }
          detectedSource = 'exif'
        }
      } catch (e) {
        console.warn('EXIF extraction skipped:', e)
      }
    }

    // Step 2: Live Device GPS Fallback
    if (!detectedCoords) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!('geolocation' in navigator)) return reject(new Error('No geolocation'))
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 6000 })
        })
        detectedCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        detectedSource = 'live_gps'
      } catch {
        // Step 3: City Center Fallback
        detectedCoords = {
          lat: AGARTALA_CENTER.lat + (Math.random() - 0.5) * 0.015,
          lng: AGARTALA_CENTER.lng + (Math.random() - 0.5) * 0.015,
        }
        detectedSource = 'city_center'
      }
    }

    setCoords(detectedCoords)
    setLocationSource(detectedSource)
    if (detectedSource === 'exif') {
      setSourceBadge({ text: '📸 Photo EXIF GPS', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' })
    } else if (detectedSource === 'live_gps') {
      setSourceBadge({ text: '📡 Live Device GPS', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' })
    } else {
      setSourceBadge({ text: '📍 Agartala Center', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' })
    }

    // Auto-match nearest pandal silently
    const sorted = AGARTALA_MASTER_PANDALS.map(p => ({
      ...p,
      distance: calcHaversineMeters(detectedCoords!.lat, detectedCoords!.lng, p.lat, p.lng)
    })).sort((a, b) => a.distance - b.distance)

    if (sorted[0] && sorted[0].distance <= 500 && !pandalName.trim()) {
      setPandalName(sorted[0].name)
      setNeighborhood(sorted[0].neighborhood)
    }
  }

  // Calculate distances to all master pandals relative to current pin
  const pandalsWithProximity = useMemo(() => {
    return AGARTALA_MASTER_PANDALS.map(p => {
      const dist = calcHaversineMeters(coords.lat, coords.lng, p.lat, p.lng)
      return { ...p, distance: dist, distText: fmtDistanceMeters(dist) }
    }).sort((a, b) => a.distance - b.distance)
  }, [coords])

  const filteredPandals = useMemo(() => {
    const q = (pandalName || searchFilter).trim().toLowerCase()
    if (!q) return pandalsWithProximity
    return pandalsWithProximity.filter(p => p.name.toLowerCase().includes(q) || p.neighborhood.toLowerCase().includes(q))
  }, [pandalsWithProximity, pandalName, searchFilter])

  const handleSubmit = async () => {
    if (!selectedFile || !pandalName.trim()) return
    setSubmitting(true)
    const success = await onSubmit({
      selectedFile,
      pandalName: pandalName.trim(),
      neighborhood: neighborhood.trim() || 'Agartala',
      coords,
      locationSource,
      source: mediaSource,
      userName: currentUser ? currentUser.displayName : 'Guest Devotee',
      userId: currentUser ? currentUser.uid : 'guest_' + Math.random().toString(36).substring(2, 9),
      userAvatar: currentUser ? currentUser.photoURL : 'https://api.dicebear.com/7.x/bottts/svg?seed=GuestDevotee',
    })
    setSubmitting(false)
    if (success) {
      reset()
      onClose()
    }
  }

  return (
    <div
      id="upload-modal"
      className={`snap-modal-backdrop fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-xl ${
        visible ? 'active visible' : 'hidden'
      }`}
    >
      <div className="snap-modal-content w-full sm:max-w-lg mx-auto bg-[#121224] rounded-t-[32px] sm:rounded-[28px] border border-white/10 p-5 sm:p-6 flex flex-col max-h-[92vh] overflow-y-auto hide-scrollbar shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full p-0.5 bg-gradient-to-tr from-amber-400 to-puja-crimson flex items-center justify-center overflow-hidden flex-shrink-0">
              <span className="text-base">🪔</span>
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">
                {step === 'capture' ? 'Snap & Tag Pandal' : 'Pandal Photo Verification'}
              </h2>
              <p className="text-white/40 text-[11px]">Strategy 4: Hybrid EXIF + Live GPS + Map Confirmation</p>
            </div>
          </div>
          <button id="upload-back-btn" onClick={handleClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition active:scale-95">
            ✕
          </button>
        </div>

      {step === 'capture' ? (
        /* Capture step */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          <div className="w-32 h-32 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(255,107,0,0.2), rgba(192,57,43,0.2))', border: '2px dashed rgba(255,107,0,0.5)' }}>
            <span className="text-5xl">🪔</span>
          </div>
          <div className="text-center">
            <h3 className="text-white font-bold text-xl mb-1">Submit Pandal Photo</h3>
            <p className="text-white/50 text-xs leading-relaxed max-w-xs">
              Take or select a photo of the Durga Puja pandal or idol. Automatic EXIF GPS and AI moderation will screen the submission.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <label
              htmlFor="snap-camera"
              id="camera-capture-label"
              className="w-full py-3.5 rounded-2xl text-center text-white font-bold text-sm cursor-pointer transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #FF6B00, #C0392B)', boxShadow: '0 8px 32px rgba(255,107,0,0.4)' }}
            >
              📷 Open Camera
            </label>
            <input
              id="snap-camera"
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) processFileWaterfall(file, 'camera')
              }}
            />
            <label
              htmlFor="snap-gallery"
              id="gallery-pick-label"
              className="w-full py-3.5 rounded-2xl text-center font-bold text-sm cursor-pointer transition-all active:scale-95 glass-light text-white/80"
            >
              🖼️ Select from Gallery
            </label>
            <input
              id="snap-gallery"
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) processFileWaterfall(file, 'gallery')
              }}
            />
          </div>
        </div>
      ) : (
        /* Details & Pandal Tagging Confirmation */
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
          {/* Media Preview Box */}
          <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-white/15 bg-black/40">
            {preview && (
              <img src={preview} alt="preview" className="w-full h-full object-cover" />
            )}
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white/90 border border-white/20">
              📸 Photo Attached
            </div>
          </div>

          {/* Location Status Card */}
          <div className="glass-card rounded-2xl p-3 border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-white text-xs font-bold">{sourceBadge.text}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceBadge.cls}`}>
                Location Source
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-white/50">
              <span>Coordinates</span>
              <span className="font-mono text-amber-300 text-[10px]">{coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E</span>
            </div>
          </div>

          {/* Searchable Pandal Name & Dropdown */}
          <div className="relative">
            <label className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1.5 block">
              Pandal Name *
            </label>
            <div className="relative">
              <input
                id="pandal-name-input"
                type="text"
                value={pandalName}
                onFocus={() => setShowDropdown(true)}
                onChange={e => { setPandalName(e.target.value); setSearchFilter(e.target.value) }}
                placeholder="Type or select pandal..."
                className="w-full py-3 px-3.5 pr-10 rounded-xl text-white text-sm outline-none bg-white/5 border border-white/15 focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-white/10 text-white/60 flex items-center justify-center text-xs"
              >
                ▼
              </button>
            </div>

            {/* Proximity Dropdown */}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-[#16162a] border border-white/15 rounded-xl shadow-2xl max-h-48 overflow-y-auto no-scrollbar p-1.5 backdrop-blur-xl">
                {filteredPandals.map(p => (
                  <div
                    key={p.name}
                    onClick={() => {
                      setPandalName(p.name)
                      setNeighborhood(p.neighborhood)
                      setCoords({ lat: p.lat, lng: p.lng })
                      setLocationSource('custom')
                      setSourceBadge({ text: '🏛️ Pandal Coordinates', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' })
                      setShowDropdown(false)
                    }}
                    className="p-2 hover:bg-white/10 rounded-lg cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{p.emoji}</span>
                      <div className="min-w-0">
                        <span className="text-white text-xs font-bold block truncate">{p.name}</span>
                        <span className="text-white/40 text-[10px] block truncate">{p.neighborhood}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">
                      {p.distText}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Neighborhood / Locality */}
          <div>
            <label className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-1.5 block">
              Neighborhood / Area *
            </label>
            <input
              id="neighborhood-input"
              type="text"
              value={neighborhood}
              onChange={e => setNeighborhood(e.target.value)}
              placeholder="e.g. Usha Bazar, Banamalipur..."
              className="w-full py-3 px-3.5 rounded-xl text-white text-sm outline-none bg-white/5 border border-white/15 focus:border-amber-400"
            />
          </div>

          {/* Interactive Mini-Map Preview Card (Confirmation) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-white/50 text-xs font-semibold uppercase tracking-widest block">
                Confirm Location Pin
              </label>
              <span className="text-[10px] text-amber-300">Tap to fine-tune coords</span>
            </div>
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const relX = (e.clientX - rect.left) / rect.width - 0.5
                const relY = (e.clientY - rect.top) / rect.height - 0.5
                const newCoords = {
                  lat: coords.lat - relY * 0.008,
                  lng: coords.lng + relX * 0.008
                }
                setCoords(newCoords)
                setLocationSource('custom')
                setSourceBadge({ text: '🎯 Custom Pinned', cls: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' })
              }}
              className="relative w-full h-36 rounded-2xl overflow-hidden border border-white/15 bg-[#0d0d1a] cursor-crosshair flex flex-col items-center justify-center text-center p-3"
            >
              <div className="w-9 h-9 rounded-full bg-saffron/20 border border-saffron flex items-center justify-center text-base mb-1 animate-bounce">
                📍
              </div>
              <span className="text-white text-xs font-bold">{pandalName || 'Selected Location'}</span>
              <span className="font-mono text-amber-300 text-[10px] mt-0.5">{coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E</span>
              <span className="text-white/40 text-[9px] mt-1">Tap box to micro-adjust pin position</span>
            </div>
          </div>

          {/* User ID card / Guest */}
          <div className="glass-card rounded-xl p-2.5 flex items-center justify-between border border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              {currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt={currentUser.displayName} className="w-7 h-7 rounded-full border border-saffron object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 via-amber-300 to-amber-100 p-[1px] flex items-center justify-center flex-shrink-0">
                  <div className="w-full h-full rounded-full bg-[#1c0a2b] flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-300" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[9px] text-white/50 uppercase tracking-wider block">Posting as</span>
                <span className="text-white text-xs font-bold block truncate">{currentUser?.displayName || 'Guest Devotee'}</span>
              </div>
            </div>
            <span className="text-[9px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
              {currentUser ? 'Devotee' : 'Guest'}
            </span>
          </div>

          {/* Submit button & Moderation info */}
          <div className="pt-2 pb-6 space-y-2">
            <button
              id="submit-snap-btn"
              onClick={handleSubmit}
              disabled={!pandalName.trim() || !selectedFile || submitting}
              className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: (!pandalName.trim() || !selectedFile || submitting) ? 'rgba(255,107,0,0.3)' : 'linear-gradient(135deg, #FF6B00, #C0392B)',
                boxShadow: (!pandalName.trim() || !selectedFile || submitting) ? 'none' : '0 8px 32px rgba(255,107,0,0.4)',
              }}
            >
              {submitting ? 'Submitting to AI Moderation...' : '🪔 Submit Snap for Moderation'}
            </button>
            <p className="text-white/40 text-[11px] text-center leading-relaxed">
              🛡️ Submissions are screened by Gemini AI &amp; verified before publishing live to the public map.
            </p>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Feed Card
   ───────────────────────────────────────────────────────────────────────── */
function FeedCard({ post, onClick }: { post: SnapPost; onClick: () => void }) {
  const displayMedia = post.mediaUrl || post.imageUrl || '/logo.png'
  const displayAvatar = post.userAvatar || post.avatar || '/logo.png'
  const displayName = post.userName || post.uploader || 'Devotee'
  const pandalTitle = post.pandalName || post.pandal || 'Durga Pandal'
  const likes = post.likesCount ?? post.likes ?? 0
  const views = post.viewsCount ?? post.views ?? 0

  return (
    <button
      id={`feed-card-${post.id}`}
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl feed-card text-left"
      style={{ background: 'rgba(255,255,255,0.05)' }}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0">
        <div className="w-14 h-14 rounded-2xl overflow-hidden" style={{ border: '2px solid rgba(255,107,0,0.5)' }}>
          <img src={displayMedia} alt={pandalTitle} className="w-full h-full object-cover" />
        </div>
        <img src={displayAvatar} alt={displayName}
          className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full border-2"
          style={{ borderColor: '#0a0a0f' }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm truncate">{post.emoji || '🪔'} {pandalTitle}</p>
        <p className="text-white/50 text-xs truncate">
          {post.neighborhood ? `${post.neighborhood} · ` : ''}{post.timestamp ? timeAgo(post.timestamp) : 'Just now'}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-white/40 text-xs">❤️ {likes}</span>
          <span className="text-white/40 text-xs">👁 {views.toLocaleString()}</span>
        </div>
      </div>

      {/* Arrow */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill="rgba(255,255,255,0.3)" />
      </svg>
    </button>
  )
}

function mapSupabaseRowToSnapPost(row: SupabaseSubmissionRow): SnapPost {
  const meta = row.metadata || {}
  const pandalName = row.pandal_name || meta.pandalName || meta.pandal || 'Durga Pandal'
  const neighborhood = row.neighborhood_col || meta.neighborhood || 'Agartala'
  const lat = typeof row.lat === 'number' ? row.lat : Number(meta.lat ?? AGARTALA_CENTER.lat)
  const lng = typeof row.lng === 'number' ? row.lng : Number(meta.lng ?? AGARTALA_CENTER.lng)
  const mediaUrl = row.image_url || row.image_path || meta.mediaUrl || meta.imageUrl || '/logo.png'
  const userName = row.user_name || meta.userName || meta.uploader || 'Devotee'
  const userAvatar = meta.userAvatar || meta.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(userName)}&backgroundColor=ffdfbf`

  return {
    id: String(row.id),
    userId: meta.userId || 'devotee',
    userName,
    uploader: userName,
    userAvatar,
    avatar: userAvatar,
    mediaUrl,
    imageUrl: mediaUrl,
    mediaType: 'image',
    pandalName,
    pandal: pandalName,
    neighborhood,
    lat,
    lng,
    viewsCount: Number(meta.viewsCount || 0),
    likesCount: Number(meta.likesCount || 0),
    views: Number(meta.viewsCount || 0),
    likes: Number(meta.likesCount || 0),
    createdAt: row.published_at || row.created_at || new Date(),
    timestamp: row.published_at ? new Date(row.published_at) : new Date(),
    emoji: meta.emoji || '🪔',
    locationSource: meta.locationSource || 'auto',
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Main App
   ───────────────────────────────────────────────────────────────────────── */
export default function App() {
  const mapRef = useRef<HTMLDivElement>(null)
  const googleMapRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())

  const [posts, setPosts] = useState<SnapPost[]>(SEED_POSTS)
  const [selectedPost, setSelectedPost] = useState<SnapPost | null>(null)
  const [currentUserCoords, setCurrentUserCoords] = useState<{ lat: number; lng: number }>(AGARTALA_CENTER)
  const [uploadVisible, setUploadVisible] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false })
  const [liveCount, setLiveCount] = useState(23)

  const [showSplash, setShowSplash] = useState(() => {
    return sessionStorage.getItem('visited') !== 'true'
  })
  const [splashExiting, setSplashExiting] = useState(false)
  const [cameraFlashing, setCameraFlashing] = useState(false)
  const [screenWhiteout, setScreenWhiteout] = useState(false)

  const [user, setUser] = useState<AuthUser | null>(() => {
    const cached = localStorage.getItem('puja_parikrama_user')
    if (cached) {
      try { return JSON.parse(cached) } catch { return null }
    }
    return null
  })
  const [authModalVisible, setAuthModalVisible] = useState(false)
  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState(false)
  const [topSearchQuery, setTopSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [activeFilter, setActiveFilter] = useState<'recent' | 'trending' | 'nearby' | null>('recent')

  // Spotify Style Player State (matching user's screenshot & header aesthetic)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [spotifyEmbedVisible, setSpotifyEmbedVisible] = useState(false)
  const [spotifyEmbedHeight, setSpotifyEmbedHeight] = useState<152 | 352>(352)
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [currentTimeSec, setCurrentTimeSec] = useState(45) // 0:45 as in reference photo!
  const [isShuffle, setIsShuffle] = useState(false)
  const [isRepeat, setIsRepeat] = useState(false)
  const dhakEngineRef = useRef<DhakAudioEngine | null>(null)

  const currentTrack = SPOTIFY_DURGA_TRACKS[currentTrackIndex] || SPOTIFY_DURGA_TRACKS[0]

  // Initialize Dhak Audio Engine
  useEffect(() => {
    dhakEngineRef.current = new DhakAudioEngine()
    return () => {
      dhakEngineRef.current?.stop()
    }
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted(m => {
      const next = !m
      dhakEngineRef.current?.setMuted(next)
      return next
    })
  }, [])

  // Playback timer ticker
  useEffect(() => {
    let timer: any = null
    if (isPlaying) {
      dhakEngineRef.current?.play()
      timer = setInterval(() => {
        setCurrentTimeSec(prev => {
          if (prev >= currentTrack.durationSec) {
            if (isRepeat) {
              return 0
            } else {
              setCurrentTrackIndex(idx => (idx + 1) % SPOTIFY_DURGA_TRACKS.length)
              return 0
            }
          }
          return prev + 1
        })
      }, 1000)
    } else {
      dhakEngineRef.current?.stop()
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isPlaying, currentTrack.durationSec, isRepeat])

  const togglePlayPause = useCallback(() => {
    setIsPlaying(p => !p)
  }, [])

  const handleNextTrack = useCallback(() => {
    setCurrentTrackIndex(idx => {
      if (isShuffle) {
        return Math.floor(Math.random() * SPOTIFY_DURGA_TRACKS.length)
      }
      return (idx + 1) % SPOTIFY_DURGA_TRACKS.length
    })
    setCurrentTimeSec(0)
  }, [isShuffle])

  const handlePrevTrack = useCallback(() => {
    setCurrentTrackIndex(idx => (idx - 1 + SPOTIFY_DURGA_TRACKS.length) % SPOTIFY_DURGA_TRACKS.length)
    setCurrentTimeSec(0)
  }, [])

  const handleScrubberClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const fraction = Math.max(0, Math.min(1, clickX / rect.width))
    setCurrentTimeSec(Math.round(fraction * currentTrack.durationSec))
  }, [currentTrack.durationSec])

  const topSearchResults = useMemo(() => {
    if (!topSearchQuery.trim()) return []
    const q = topSearchQuery.toLowerCase()
    return AGARTALA_MASTER_PANDALS.filter(p =>
      p.name.toLowerCase().includes(q) || p.neighborhood.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [topSearchQuery])

  const showToast = useCallback((_msg: string) => {
    // All toast prompts disabled per user request
  }, [])

  const triggerCameraFlashAndEnter = useCallback(() => {
    if (splashExiting) return

    // 1. Ignite the man's camera lens flash at the phone
    setCameraFlashing(true)
    if (navigator.vibrate) {
      try { navigator.vibrate([35, 25, 45]) } catch {}
    }

    // 2. The flash burst turns the entire page blinding white (after 100ms)
    setTimeout(() => {
      setScreenWhiteout(true)
    }, 100)

    // 3. While the screen is pure white, exit splash and pan map
    setTimeout(() => {
      setSplashExiting(true)
      if (googleMapRef.current) {
        googleMapRef.current.panTo(currentUserCoords || AGARTALA_CENTER)
        googleMapRef.current.setZoom(15)
      }
    }, 280)

    // 4. White flash dissipates, revealing the live landing map page
    setTimeout(() => {
      setShowSplash(false)
    }, 750)
  }, [splashExiting, currentUserCoords])

  // ── Parikrama Splash Screen Controller: auto-flash after 1.5 seconds ──
  useEffect(() => {
    if (!showSplash) return
    sessionStorage.setItem('visited', 'true')
    const timer = setTimeout(() => {
      triggerCameraFlashAndEnter()
    }, 1500)
    return () => {
      clearTimeout(timer)
    }
  }, [showSplash, triggerCameraFlashAndEnter])

  const handleGoogleSignIn = () => {
    const simulatedNames = ['Shatadru Sarkar', 'Ananya Roy', 'Priya Saha', 'Saptarshi Sen']
    const chosenName = simulatedNames[Math.floor(Math.random() * simulatedNames.length)]
    const newUser: AuthUser = {
      uid: 'google-uid-' + Math.random().toString(36).substring(2, 10),
      displayName: chosenName,
      email: `${chosenName.toLowerCase().replace(' ', '.')}@gmail.com`,
      photoURL: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(chosenName)}&backgroundColor=ffdfbf`
    }
    localStorage.setItem('puja_parikrama_user', JSON.stringify(newUser))
    setUser(newUser)
    setAuthModalVisible(false)
    showToast(`✅ Signed in as ${newUser.displayName}`)
  }

  const handleSignOut = () => {
    localStorage.removeItem('puja_parikrama_user')
    setUser(null)
    showToast('👋 Signed out from Google')
  }

  // ── increment live viewer count randomly ──
  useEffect(() => {
    const iv = setInterval(() => {
      setLiveCount(c => c + Math.floor(Math.random() * 3))
    }, 7000)
    return () => clearInterval(iv)
  }, [])

  // ── Load Google Maps JS API ──
  useEffect(() => {
    if (window.google?.maps) { initMap(); return }
    window.initMap = initMap
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&callback=initMap&libraries=marker`
    script.async = true
    script.defer = true
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
      delete window.initMap
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function initMap() {
    if (!mapRef.current) return
    const map = new window.google.maps.Map(mapRef.current, {
      center: AGARTALA_CENTER,
      zoom: 14,
      styles: DARK_MAP_STYLE,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      backgroundColor: '#0a0a0f',
      mapTypeId: 'roadmap',
      clickableIcons: false,
      mapId: 'durga-puja-snap',
    })
    googleMapRef.current = map
    setMapReady(true)

    // Auto-detect location & zoom on startup
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setCurrentUserCoords(coords)
          try {
            localStorage.setItem('parikrama_user_location', JSON.stringify(coords))
          } catch {}
          map.setCenter(coords)
          map.setZoom(16)
        },
        () => {
          try {
            const saved = localStorage.getItem('parikrama_user_location')
            if (saved) {
              const coords = JSON.parse(saved)
              setCurrentUserCoords(coords)
              map.setCenter(coords)
              map.setZoom(16)
              return
            }
          } catch {}
          map.setCenter(AGARTALA_CENTER)
          map.setZoom(14)
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      )
    }
  }

  // ── Add / update map markers whenever posts or map changes ──
  useEffect(() => {
    const map = googleMapRef.current
    if (!map || !mapReady) return

    posts.forEach(post => {
      if (markersRef.current.has(post.id)) return

      // Build custom HTML marker element
      const el = document.createElement('div')
      el.className = 'snap-pin'
      el.setAttribute('data-post-id', post.id)
      el.innerHTML = `
        <div class="avatar-ring">
          <img src="${post.imageUrl}" alt="${post.pandal}" loading="lazy" />
        </div>
        <div class="pin-tail"></div>
      `

      let marker: any

      // Use AdvancedMarkerElement if available
      if (window.google.maps.marker?.AdvancedMarkerElement) {
        marker = new window.google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: post.lat, lng: post.lng },
          content: el,
          title: post.pandal,
        })
        marker.addListener('click', () => {
          setSelectedPost(post)
          googleMapRef.current?.panTo({ lat: post.lat, lng: post.lng })
        })
      } else {
        // Fallback to legacy Marker with custom overlay
        marker = new window.google.maps.Marker({
          map,
          position: { lat: post.lat, lng: post.lng },
          title: post.pandal,
          icon: {
            url: post.imageUrl,
            scaledSize: new window.google.maps.Size(56, 56),
            anchor: new window.google.maps.Point(28, 56),
          },
        })
        marker.addListener('click', () => {
          setSelectedPost(post)
          googleMapRef.current?.panTo({ lat: post.lat, lng: post.lng })
        })
      }

      markersRef.current.set(post.id, marker)
    })
  }, [posts, mapReady])

  // ── Fetch approved submissions from Supabase ──
  useEffect(() => {
    let mounted = true
    const loadApprovedSnaps = async () => {
      try {
        const rows = await fetchApprovedSubmissions()
        if (mounted && rows && rows.length > 0) {
          const mapped = rows.map(mapSupabaseRowToSnapPost)
          setPosts(mapped)
          console.log(`🗺️ Updated live map with ${mapped.length} approved pandal posts from Supabase.`)
        }
      } catch (err) {
        console.warn('Could not load approved submissions from Supabase:', err)
      }
    }

    loadApprovedSnaps()
    const interval = setInterval(loadApprovedSnaps, 25000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // ── Handle photo submission for Gemini AI & Gmail HITL moderation ──
  const handlePhotoSubmission = useCallback(async (payload: SubmissionPayload): Promise<boolean> => {
    showToast('📤 Submitting photo to moderation pipeline...')
    try {
      console.log('📡 Submitting photo for moderation:', payload.pandalName)
      const res = await submitPhotoToN8n(payload)
      if (res.ok) {
        showToast('⏳ Photo submitted! Under review and will appear on the map once approved.')
        return true
      } else {
        showToast(`⚠️ Upload queued (status ${res.status}). Pending moderation approval.`)
        return true
      }
    } catch (err) {
      console.error('Submission failed:', err)
      showToast('❌ Submission failed. Please check network connection.')
      return false
    }
  }, [showToast])

  const handleLocateMe = () => {
    // Determine the user's location immediately
    let target = currentUserCoords
    if (!target || target.lat === AGARTALA_CENTER.lat) {
      try {
        const saved = localStorage.getItem('parikrama_user_location')
        if (saved) target = JSON.parse(saved)
      } catch {}
    }
    if (!target) target = AGARTALA_CENTER

    // Pan & zoom immediately to initial zoom level 16
    if (googleMapRef.current) {
      googleMapRef.current.panTo(target)
      googleMapRef.current.setZoom(16)
    }

    // Refresh live GPS in background without blocking
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const freshCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setCurrentUserCoords(freshCoords)
          try {
            localStorage.setItem('parikrama_user_location', JSON.stringify(freshCoords))
          } catch {}
          if (googleMapRef.current) {
            googleMapRef.current.panTo(freshCoords)
            googleMapRef.current.setZoom(16)
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
      )
    }
  }

  const handleToggleFilter = (filter: 'recent' | 'trending' | 'nearby') => {
    setActiveFilter(prev => {
      const next = prev === filter ? null : filter
      if (next === 'recent') {
        if (posts.length > 0) {
          const sorted = [...posts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          if (sorted[0]) googleMapRef.current?.panTo({ lat: sorted[0].lat, lng: sorted[0].lng })
        }
      } else if (next === 'trending') {
        if (posts.length > 0) {
          const sorted = [...posts].sort((a, b) => ((b.likesCount || 0) * 4 + (b.viewsCount || 0)) - ((a.likesCount || 0) * 4 + (a.viewsCount || 0)))
          if (sorted[0]) googleMapRef.current?.panTo({ lat: sorted[0].lat, lng: sorted[0].lng })
        }
      } else if (next === 'nearby') {
        handleLocateMe()
      }
      return next
    })
  }

  return (
    <div className="relative w-full overflow-hidden font-inter" style={{ height: '100dvh', background: '#0a0a0f' }}>

      {/* ── MAP CANVAS ── */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── MAP LOADING SCREEN ── */}
      {!mapReady && (
        <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center" style={{ background: '#0a0a0f' }}>
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(255,107,0,0.2), rgba(192,57,43,0.15))', border: '1.5px solid rgba(255,107,0,0.3)' }}>
              <span className="text-4xl">🪔</span>
            </div>
            <div className="absolute inset-0 rounded-full animate-ping"
              style={{ background: 'rgba(255,107,0,0.12)', animationDuration: '2s' }} />
          </div>
          <h1 className="text-white font-bold text-2xl mb-1">Puja Parikrama</h1>
          <p className="text-white/40 text-sm mb-8">Loading live festival map…</p>
          <div className="flex gap-1.5">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full" style={{
                background: '#FF6B00', animation: `livePulse 1.2s ease-in-out ${i * 0.2}s infinite`
              }} />
            ))}
          </div>
        </div>
      )}

      {/* ── 0. INTRO SPLASH SCREEN ("PUJA PARIKRAMA") ── */}
      {showSplash && (
        <div
          id="splash-screen"
          className={`fixed inset-0 z-[9999] bg-[#0a0a14] select-none pointer-events-auto cursor-default overflow-hidden transition-all duration-500 ease-out ${
            splashExiting ? 'scale-[1.05] opacity-0 pointer-events-none' : 'scale-100 opacity-100'
          }`}
        >
          {/* Responsive Platform Splash Background: Mobile vs Laptop/Desktop (shifted 10px up on laptop) */}
          <div className="absolute inset-0 w-full h-full pointer-events-none select-none md:-top-[10px] md:h-[calc(100%+20px)]">
            <picture className="w-full h-full">
              {/* Desktop / Laptop platforms (wide screens or landscape) */}
              <source media="(min-width: 1024px)" srcSet="/splash-desktop.jpg" />
              <source media="(min-width: 768px) and (orientation: landscape)" srcSet="/splash-desktop.jpg" />
              {/* Mobile / Portrait platforms */}
              <img
                src="/splash-mobile.jpg"
                alt="Puja Parikrama"
                className="w-full h-full object-cover object-center md:object-top"
              />
            </picture>

            {/* Man's Camera Lens Flash Strobe & Flare (ignites at the phone: 71.7%/75.5% on mobile, 66.7%/81.4% on desktop) */}
            {cameraFlashing && (
              <div className="absolute left-[71.7%] top-[75.5%] md:left-[66.7%] md:top-[81.4%] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-40">
                {/* Intense central white strobe */}
                <div className="w-8 h-8 rounded-full bg-white shadow-[0_0_60px_35px_rgba(255,255,255,1),0_0_140px_70px_rgba(255,245,200,0.95)] animate-ping" />
                {/* Horizontal anamorphic lens flare streak */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[600px] h-[3px] bg-gradient-to-r from-transparent via-white to-transparent blur-[1px]" />
                {/* Vertical sparkle streak */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[180px] sm:h-[300px] w-[2px] bg-gradient-to-b from-transparent via-white to-transparent blur-[1px]" />
              </div>
            )}
          </div>

          {/* Full Screen Whiteout Flash: turns the entire page blinding white */}
          <div
            className={`fixed inset-0 pointer-events-none bg-white transition-opacity duration-300 z-50 ${
              screenWhiteout ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* ── 2. NEW FLOATING BRANDING BAR & EMBEDDED SEARCH ("PUJA PARIKRAMA") ── */}
      {mapReady && (
        <header className="fixed top-3 left-0 right-0 z-50 px-3 sm:px-6 pointer-events-none flex flex-col items-center w-full">
          {/* Main Pill Bar */}
          <div className="relative overflow-visible backdrop-blur-[3px] bg-gradient-to-r from-[#210c32]/35 via-[#2d1142]/30 to-[#1c082b]/35 border-[1.5px] border-[#d4af37]/60 rounded-full px-3 sm:px-4 py-1 h-10 sm:h-11 flex items-center justify-between w-full pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.3),0_0_12px_rgba(212,175,55,0.15)] transition-all">

            {/* Left Section: Transparent Glowing Durga Emblem & Bengali Typography */}
            <div className="relative flex items-center gap-1.5 sm:gap-2 min-w-0 z-10 flex-shrink-0 pr-1 sm:pr-2">
              <img
                src="/durga-emblem.png"
                alt="Maa Durga"
                className="h-6 sm:h-7 w-auto object-contain flex-shrink-0 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]"
              />
              <img
                src="/puja-text.png"
                alt="পূজা পরিক্রমা"
                className="h-6 sm:h-[29px] w-auto object-contain flex-shrink-0 drop-shadow-[0_0_6px_rgba(251,191,36,0.65)]"
              />
            </div>

            {/* Middle Section: Integrated Search Bar in the Header */}
            <div className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-2 sm:mx-3 z-10">
              <div className="relative flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={topSearchQuery}
                  onChange={e => setTopSearchQuery(e.target.value)}
                  placeholder="Search Pandals..."
                  className="w-full bg-[#1b1328]/75 hover:bg-[#1b1328]/90 focus:bg-[#1b1328]/95 border border-amber-400/35 hover:border-amber-400/60 focus:border-amber-400 rounded-full pl-3 sm:pl-3.5 pr-8 py-1 h-7 sm:h-7.5 text-[11px] sm:text-xs text-white placeholder-amber-200/50 backdrop-blur-md shadow-inner outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="absolute right-2.5 text-amber-300 hover:text-amber-200"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>

              {/* Search Autocomplete Dropdown */}
              {topSearchResults.length > 0 && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-[#160c23]/95 border border-amber-400/30 rounded-2xl p-2 shadow-2xl backdrop-blur-xl z-50 max-h-60 overflow-y-auto space-y-1">
                  {topSearchResults.map(pandal => (
                    <div
                      key={pandal.name}
                      onClick={() => {
                        googleMapRef.current?.panTo({ lat: pandal.lat, lng: pandal.lng })
                        googleMapRef.current?.setZoom(16)
                        setTopSearchQuery('')
                        showToast(`📍 Showing ${pandal.name}`)
                      }}
                      className="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 cursor-pointer transition text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">{pandal.emoji}</span>
                        <div className="truncate">
                          <p className="text-xs font-bold text-white truncate">{pandal.name}</p>
                          <p className="text-[10px] text-amber-200/70 truncate">{pandal.neighborhood}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-amber-300 font-mono flex-shrink-0">
                        {formatDistance(calcHaversineMeters(currentUserCoords.lat, currentUserCoords.lng, pandal.lat, pandal.lng) / 1000)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Section: Leaderboard CTA & Profile Button (Rounded Rectangular: Name followed by Icon) */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 z-10 pl-1 sm:pl-2">
              {/* Leaderboard Button */}
              <button
                id="btn-leaderboard"
                type="button"
                onClick={() => setLeaderboardModalVisible(true)}
                title="Pandal Devotee Leaderboard"
                className="h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-300 to-amber-100 flex items-center gap-1.5 text-[#180924] font-bold text-[11px] sm:text-xs border border-[#180924]/40 shadow-[0_0_12px_rgba(251,191,36,0.6)] hover:shadow-[0_0_18px_rgba(251,191,36,0.9)] hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
              >
                <span>Leaderboard</span>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1c0a2b] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1c1.8-.46 3.17-1.87 3.61-3.66C19.08 11.63 21 9.55 21 7V5c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
                </svg>
              </button>

              {/* Profile Button */}
              <button
                id="guest-avatar-chip"
                type="button"
                onClick={() => setAuthModalVisible(true)}
                title="Guest Devotee Profile"
                className="h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-xl bg-[#1c0a2b]/90 border border-amber-400/50 hover:border-amber-300 flex items-center gap-1.5 text-amber-200 hover:text-white font-semibold text-[11px] sm:text-xs shadow-[0_0_8px_rgba(251,191,36,0.25)] hover:shadow-[0_0_14px_rgba(251,191,36,0.45)] hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
              >
                <span>Profile</span>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── 1. SPOTIFY MUSIC PLAYER (Elongated Single Row Layout matching Snap CTA diameter) ── */}
      {mapReady && (
        <div className="fixed left-[calc(25%-14px)] -translate-x-1/2 bottom-4 sm:bottom-5 z-30 w-[calc(50%-24px)] max-w-[560px] min-w-[320px] pointer-events-auto select-none flex flex-col gap-2">
          {/* Spotify Official Interactive Playlist Embed Popup */}
          {spotifyEmbedVisible && (
            <div className="w-full bg-[#12071f]/95 border-[1.5px] border-[#d4af37]/70 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between pb-1.5 px-1 border-b border-white/10 mb-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-[#1db954] fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  <span className="text-xs font-bold text-white">Durga Puja Songs</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSpotifyEmbedHeight(h => (h === 352 ? 152 : 352))}
                    className="text-[10px] text-amber-300/80 hover:text-amber-200 bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-full transition border border-amber-300/30"
                  >
                    {spotifyEmbedHeight === 352 ? 'Compact' : 'Playlist'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpotifyEmbedVisible(false)}
                    className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white text-xs transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <iframe
                data-testid="embed-iframe"
                style={{ borderRadius: '12px' }}
                src="https://open.spotify.com/embed/playlist/2cjLMgWAt3S6YNCEKFtVtk?utm_source=generator&theme=0"
                width="100%"
                height={spotifyEmbedHeight}
                frameBorder="0"
                allowFullScreen
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                title="Spotify Playlist Embed"
              />
            </div>
          )}

          {/* Main Custom Styled Music Player Pill Bar - SINGLE ROW LAYOUT MATCHING SNAP CTA DIAMETER */}
          <div
            id="spotify-music-player-bar"
            className="w-full h-13 sm:h-14 overflow-hidden backdrop-blur-[3px] bg-gradient-to-r from-[#210c32]/50 via-[#2d1142]/45 to-[#1c082b]/50 border-[1.5px] border-[#d4af37]/70 rounded-full px-2.5 sm:px-3.5 flex items-center justify-between gap-2 sm:gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.35),0_0_12px_rgba(212,175,55,0.2)] transition-all"
          >
            {/* Left: Album Cover + Title + Artist (Clean cover without badge, full un-truncated title) */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-shrink-0">
              <button
                type="button"
                onClick={() => setSpotifyEmbedVisible(v => !v)}
                title={spotifyEmbedVisible ? "Hide Spotify Playlist" : "Open Spotify Playlist Embed"}
                className="relative group flex-shrink-0 cursor-pointer"
              >
                <img
                  src={currentTrack.cover}
                  alt={currentTrack.title}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-[8px] object-cover border border-white/10 shadow group-hover:scale-105 transition-transform"
                />
              </button>

              <div className="flex flex-col min-w-0 pr-0.5">
                <button
                  type="button"
                  onClick={() => setSpotifyEmbedVisible(v => !v)}
                  title="Toggle Spotify Playlist Embed"
                  className="text-left text-xs sm:text-[13px] font-bold text-white hover:text-amber-200 whitespace-nowrap leading-tight transition cursor-pointer"
                >
                  {currentTrack.title}
                </button>
                <span className="text-[10px] sm:text-[11px] text-white/50 whitespace-nowrap leading-tight mt-0.5">
                  {currentTrack.artist}
                </span>
              </div>
            </div>

            {/* Middle: Scrubber Track with Left & Right Timestamps */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-[50px] text-[9px] sm:text-[10px] font-mono text-white/50">
              <span className="text-left flex-shrink-0">{formatSongTime(currentTimeSec)}</span>
              <div
                onClick={handleScrubberClick}
                className="relative flex-1 h-[2.5px] bg-white/20 hover:h-1 rounded-full overflow-hidden cursor-pointer group transition-all"
              >
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all"
                  style={{ width: `${Math.min(100, (currentTimeSec / currentTrack.durationSec) * 100)}%` }}
                />
              </div>
              <span className="text-right flex-shrink-0">{formatSongTime(currentTrack.durationSec)}</span>
            </div>

            {/* Right: Playback Controls Row (Prev, Play, Next, Mute in White / Crossed) */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={handlePrevTrack}
                title="Previous Track"
                className="text-white/70 hover:text-white transition p-0.5"
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 16 16">
                  <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.576a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z"/>
                </svg>
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                title={isPlaying ? "Pause" : "Play"}
                className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full bg-white text-black hover:scale-105 active:scale-95 flex items-center justify-center transition shadow-md flex-shrink-0"
              >
                {isPlaying ? (
                  <svg className="w-2.5 h-2.5 fill-black" viewBox="0 0 16 16">
                    <path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"/>
                  </svg>
                ) : (
                  <svg className="w-2.5 h-2.5 ml-0.5 fill-black" viewBox="0 0 16 16">
                    <path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"/>
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={handleNextTrack}
                title="Next Track"
                className="text-white/70 hover:text-white transition p-0.5"
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 16 16">
                  <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05.106A.7.7 0 0 0 1 .712v12.576a.7.7 0 0 0 1.05.607L12 8.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z"/>
                </svg>
              </button>

              {/* Mute / Unmute Button: Pure WHITE (not yellow) when active, CROSSED when muted */}
              <button
                type="button"
                onClick={toggleMute}
                title={isMuted ? "Unmute" : "Mute"}
                className={`transition p-0.5 ${isMuted ? 'text-white/45 hover:text-white/70' : 'text-white hover:text-white/80'}`}
              >
                {isMuted ? (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. SNAP PANDAL CTA (Central Aligned to Screen, Parallel with Music Player) ── */}
      {mapReady && (
        <button
          id="camera-btn"
          onClick={() => setUploadVisible(true)}
          title="Snap Pandal"
          className="fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-amber-500 via-amber-300 to-amber-100 flex items-center justify-center border-2 sm:border-[3px] border-[#180924] shadow-[0_0_22px_rgba(251,191,36,0.52),0_0_9px_rgba(212,175,55,0.34)] hover:shadow-[0_0_30px_rgba(251,191,36,0.68)] active:scale-95 transition-all pointer-events-auto flex-shrink-0"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#1c0a2b]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
            <circle cx="12" cy="13" r="3" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* ── 3. PANDAL FILTERS (Right Hand Side of CTA: Recent / Trending / Nearby, Matching Music Player Length) ── */}
      {mapReady && (
        <div
          id="pandal-filter-group"
          className="fixed left-[calc(75%+14px)] -translate-x-1/2 bottom-4 sm:bottom-5 z-30 w-[calc(50%-24px)] max-w-[560px] min-w-[320px] pointer-events-auto select-none flex items-center justify-between gap-1.5 sm:gap-2.5 h-13 sm:h-14"
        >
          {/* Recent Filter */}
          <button
            type="button"
            id="filter-btn-recent"
            onClick={() => handleToggleFilter('recent')}
            title="Filter by Recent Pandals"
            className={`flex-1 h-full rounded-2xl flex flex-col items-center justify-center py-1 sm:py-1.5 transition-all cursor-pointer active:scale-95 ${
              activeFilter === 'recent'
                ? 'bg-gradient-to-b from-[#2e1245] via-[#240e34] to-[#1c0a2b] border-[1.5px] border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
                : 'bg-[#1c0a2b]/90 hover:bg-[#250d38] border border-amber-400/50 hover:border-amber-300 text-amber-200/80 hover:text-white shadow-[0_0_8px_rgba(251,191,36,0.2)] hover:shadow-[0_0_14px_rgba(251,191,36,0.35)]'
            }`}
          >
            <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5 sm:mb-1 transition-colors ${activeFilter === 'recent' ? 'text-amber-300' : 'text-amber-300/80'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className={`text-[10px] sm:text-xs leading-tight tracking-wide ${activeFilter === 'recent' ? 'text-amber-300 font-bold' : 'text-amber-200 font-semibold'}`}>Recent</span>
          </button>

          {/* Trending Filter */}
          <button
            type="button"
            id="filter-btn-trending"
            onClick={() => handleToggleFilter('trending')}
            title="Filter by Trending Pandals"
            className={`flex-1 h-full rounded-2xl flex flex-col items-center justify-center py-1 sm:py-1.5 transition-all cursor-pointer active:scale-95 ${
              activeFilter === 'trending'
                ? 'bg-gradient-to-b from-[#2e1245] via-[#240e34] to-[#1c0a2b] border-[1.5px] border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
                : 'bg-[#1c0a2b]/90 hover:bg-[#250d38] border border-amber-400/50 hover:border-amber-300 text-amber-200/80 hover:text-white shadow-[0_0_8px_rgba(251,191,36,0.2)] hover:shadow-[0_0_14px_rgba(251,191,36,0.35)]'
            }`}
          >
            <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5 sm:mb-1 transition-colors ${activeFilter === 'trending' ? 'text-amber-300' : 'text-amber-300/80'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            <span className={`text-[10px] sm:text-xs leading-tight tracking-wide ${activeFilter === 'trending' ? 'text-amber-300 font-bold' : 'text-amber-200 font-semibold'}`}>Trending</span>
          </button>

          {/* Nearby Filter */}
          <button
            type="button"
            id="filter-btn-nearby"
            onClick={() => handleToggleFilter('nearby')}
            title="Filter by Nearby Pandals"
            className={`flex-1 h-full rounded-2xl flex flex-col items-center justify-center py-1 sm:py-1.5 transition-all cursor-pointer active:scale-95 ${
              activeFilter === 'nearby'
                ? 'bg-gradient-to-b from-[#2e1245] via-[#240e34] to-[#1c0a2b] border-[1.5px] border-amber-400 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
                : 'bg-[#1c0a2b]/90 hover:bg-[#250d38] border border-amber-400/50 hover:border-amber-300 text-amber-200/80 hover:text-white shadow-[0_0_8px_rgba(251,191,36,0.2)] hover:shadow-[0_0_14px_rgba(251,191,36,0.35)]'
            }`}
          >
            <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5 sm:mb-1 transition-colors ${activeFilter === 'nearby' ? 'text-amber-300' : 'text-amber-300/80'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className={`text-[10px] sm:text-xs leading-tight tracking-wide ${activeFilter === 'nearby' ? 'text-amber-300 font-bold' : 'text-amber-200 font-semibold'}`}>Nearby</span>
          </button>
        </div>
      )}

      {/* ── 4. RECENTER / LOCATE ME BUTTON (Parallel on Right) ── */}
      {mapReady && (
        <button
          id="btn-recenter"
          onClick={handleLocateMe}
          title="Locate My Position"
          className="fixed right-3 sm:right-6 bottom-4 sm:bottom-5 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#1e0f2b]/85 hover:bg-[#2e1742] border border-amber-400/40 text-amber-300 flex items-center justify-center shadow-xl backdrop-blur-md transition active:scale-90 pointer-events-auto flex-shrink-0"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </button>
      )}

      {/* ── STORY MODAL ── */}
      <StoryModal post={selectedPost} onClose={() => setSelectedPost(null)} />

      {/* ── GOOGLE AUTH MODAL ── */}
      {authModalVisible && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 text-center relative border border-white/10 shadow-2xl" style={{ background: '#121224' }}>
            <button
              onClick={() => setAuthModalVisible(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white"
            >
              ✕
            </button>
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center mb-4 shadow-xl">
              <svg className="w-9 h-9" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            </div>
            <h3 className="text-white font-extrabold text-xl mb-1.5">Sign in with Google</h3>
            <p className="text-white/60 text-xs leading-relaxed mb-6">
              Sign in to Puja Parikrama to tag your pandal stories with your profile, anchor live GPS coordinates, and broadcast to the Agartala map.
            </p>
            <button
              id="google-modal-signin-btn"
              onClick={handleGoogleSignIn}
              className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-sm flex items-center justify-center gap-3 shadow-lg transition active:scale-98"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
            <p className="text-white/40 text-[11px] mt-4">
              🔒 Powered by Firebase Auth • Popup & Session Cache
            </p>
          </div>
        </div>
      )}

      {/* ── LEADERBOARD MODAL ── */}
      {leaderboardModalVisible && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 text-center relative border border-amber-400/30 shadow-2xl overflow-hidden backdrop-blur-2xl" style={{ background: 'linear-gradient(135deg, #1b0a2a, #12061e)' }}>
            <button
              onClick={() => setLeaderboardModalVisible(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition"
            >
              ✕
            </button>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-300 to-amber-100 mx-auto flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(251,191,36,0.6)]">
              <svg className="w-8 h-8 text-[#1c0a2b]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1c1.8-.46 3.17-1.87 3.61-3.66C19.08 11.63 21 9.55 21 7V5c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
            </div>
            <h3 className="text-white font-extrabold text-xl mb-0.5">Parikrama Leaderboard</h3>
            <p className="text-amber-300/80 text-xs mb-4">Top Devotees & Pandal Explorers</p>

            <div className="space-y-2 text-left max-h-60 overflow-y-auto pr-1">
              {[
                { rank: '🥇', name: 'Debasish Roy', pandals: 18, pts: '940 pts' },
                { rank: '🥈', name: 'Ankita Saha', pandals: 15, pts: '810 pts' },
                { rank: '🥉', name: 'Suman Paul', pandals: 13, pts: '720 pts' },
                { rank: '4', name: 'Pooja Debbarma', pandals: 11, pts: '610 pts' },
                { rank: '5', name: 'Rohan Bhowmik', pandals: 9, pts: '500 pts' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-amber-400/30 transition">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm w-5 text-center text-amber-300">{item.rank}</span>
                    <div>
                      <p className="text-xs font-bold text-white">{item.name}</p>
                      <p className="text-[10px] text-white/50">{item.pandals} pandals visited</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-300">{item.pts}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setLeaderboardModalVisible(false)
                setUploadVisible(true)
              }}
              className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-300 text-black font-bold text-xs shadow-lg hover:brightness-110 active:scale-95 transition"
            >
              📸 Snap Pandal to Climb Rank
            </button>
          </div>
        </div>
      )}

      {/* ── UPLOAD MODAL ── */}
      <UploadModal
        visible={uploadVisible}
        currentUser={user}
        onRequireAuth={() => setAuthModalVisible(true)}
        onClose={() => setUploadVisible(false)}
        onSubmit={handlePhotoSubmission}
      />


      {/* ── Global animation keyframes injected via style tag ── */}
      <style>{`
        @keyframes livePulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }
        @keyframes spinLoader { to { transform: rotate(360deg); } }
        @keyframes pulseRing {
          0%  { box-shadow: 0 4px 20px rgba(255,107,0,.6), 0 0 0 0 rgba(255,107,0,.4); }
          70% { box-shadow: 0 4px 20px rgba(255,107,0,.6), 0 0 0 16px rgba(255,107,0,0); }
          100%{ box-shadow: 0 4px 20px rgba(255,107,0,.6), 0 0 0 0 rgba(255,107,0,0); }
        }
      `}</style>
    </div>
  )
}
