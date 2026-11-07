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
  { name: 'Bharat Ratna Sangha', neighborhood: 'Usha Bazar', city: 'Agartala', lat: 23.8820, lng: 91.2785, emoji: '🪔', keywords: ['usha bazar', 'airport', 'singerbhil', 'agartala', 'tripura', 'north agartala'] },
  { name: 'Ujjayanta Palace Mandap', neighborhood: 'Palace Compound', city: 'Agartala', lat: 23.8350, lng: 91.2880, emoji: '👑', keywords: ['palace compound', 'ujjayanta palace', 'post office chowmuhani', 'agartala', 'tripura'] },
  { name: 'Banamalipur Club & Youth Union', neighborhood: 'Banamalipur', city: 'Agartala', lat: 23.8335, lng: 91.2915, emoji: '🎆', keywords: ['banamalipur', 'math chowmuhani', 'agartala', 'tripura'] },
  { name: 'Battala Durga Puja', neighborhood: 'Battala', city: 'Agartala', lat: 23.8361, lng: 91.2812, emoji: '🪔', keywords: ['battala', 'gol bazar', 'bordowali', 'bardowali', 'akhaura road', 'agartala', 'tripura'] },
  { name: 'Dhaleswar Netaji Play Center', neighborhood: 'Dhaleswar', city: 'Agartala', lat: 23.8310, lng: 91.2965, emoji: '🌟', keywords: ['dhaleswar', 'jail road', 'college tilla', 'agartala', 'tripura'] },
  { name: 'Ramnagar Road No. 2', neighborhood: 'Ramnagar', city: 'Agartala', lat: 23.8430, lng: 91.2840, emoji: '✨', keywords: ['ramnagar', 'radhanagar', 'akhaura road', 'agartala', 'tripura'] },
  { name: 'Shanti Para Youth Club', neighborhood: 'Shantipara', city: 'Agartala', lat: 23.8375, lng: 91.2905, emoji: '🎊', keywords: ['shantipara', 'santipara', 'lake chowmuhani', 'agartala', 'tripura'] },
  { name: 'Melarmath Sarbajanin Mandap', neighborhood: 'Melarmath', city: 'Agartala', lat: 23.8305, lng: 91.2855, emoji: '🕊️', keywords: ['melarmath', 'city centre', 'post office', 'agartala', 'tripura', 'central agartala'] },
  { name: 'Kali Bari Puja Samiti', neighborhood: 'Kali Bari', city: 'Agartala', lat: 23.8295, lng: 91.2940, emoji: '🌺', keywords: ['kali bari', 'central agartala', 'agartala', 'tripura'] },
  { name: 'Polestar Club', neighborhood: 'Banamalipur', city: 'Agartala', lat: 23.8368, lng: 91.2932, emoji: '⚡', keywords: ['banamalipur', 'agartala', 'tripura'] },
  { name: 'Deshabandhu Chittaranjan Club', neighborhood: 'Dhaleswar', city: 'Agartala', lat: 23.8285, lng: 91.2985, emoji: '🎺', keywords: ['dhaleswar', 'college tilla', 'agartala', 'tripura'] },
  { name: 'Aikatan Sangha', neighborhood: 'Kunjaban', city: 'Agartala', lat: 23.8480, lng: 91.2890, emoji: '🪕', keywords: ['kunjaban', 'gb bazar', 'gb hospital', 'circuit house', 'secretariat', 'agartala', 'tripura'] },
  { name: 'Badharghat Sporting Club', neighborhood: 'Badharghat', city: 'Agartala', lat: 23.8120, lng: 91.2740, emoji: '🥁', keywords: ['badharghat', 'amtali', 'railway station', 'south agartala', 'agartala', 'tripura'] },
  { name: 'Pratapgarh Youth Federation', neighborhood: 'Pratapgarh', city: 'Agartala', lat: 23.8210, lng: 91.2895, emoji: '🔥', keywords: ['pratapgarh', 'arundhutinagar', 'agartala', 'tripura'] }
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
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b16' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#525268' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#4a4a62' }] },
  { featureType: 'administrative', elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b16' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#7c7c9a' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#686884' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#38384e' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#44445c' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b16' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1f18' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#2e4a39' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212140' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#62627c' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#0b0b16' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#70708c' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e1e40' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a55' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#8080a2' }] },
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#12122a' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#565672' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060614' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#32364c' }] },
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
function StoryModal({ post, onClose, onAddPhoto }: { post: SnapPost | null; onClose: () => void; onAddPhoto?: (pandal: string) => void }) {
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

            <div className="flex items-center gap-2.5 mt-4">
              <button
                id="story-like-btn"
                onClick={handleLike}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full transition-all"
                style={{ background: liked ? 'rgba(255,107,0,0.35)' : 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? '#FF6B00' : 'white'} opacity={liked ? 1 : 0.7}>
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span className="text-white text-sm font-medium">{likes.toLocaleString()}</span>
              </button>

              {onAddPhoto && (
                <button
                  id="story-add-photo-btn"
                  onClick={() => {
                    const p = post.pandal || post.pandalName || 'Durga Pandal'
                    onClose()
                    onAddPhoto(p)
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] text-[#211329] font-black text-xs shadow-md shadow-[#E9B83E]/20 active:scale-95 cursor-pointer"
                  title="Add Photos of This Pandal"
                >
                  <span>📸</span>
                  <span>Add Photo</span>
                </button>
              )}

              <div className="flex items-center gap-1.5 px-3 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white" opacity="0.7"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
                <span className="text-white text-sm font-medium">{(post.views ?? post.viewsCount ?? 0).toLocaleString()}</span>
              </div>

              <button
                id="story-share-btn"
                className="ml-auto w-10 h-10 rounded-full flex items-center justify-center"
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
  initialPandal?: string
  onRequireAuth: () => void
  onClose: () => void
  onSubmit: (payload: SubmissionPayload) => Promise<boolean>
}

function UploadModal({ visible, currentUser, initialPandal, onRequireAuth, onClose, onSubmit }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mediaSource, setMediaSource] = useState<'camera' | 'gallery'>('gallery')
  const [preview, setPreview] = useState<string | null>(null)
  const [pandalName, setPandalName] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(AGARTALA_CENTER)
  const [locationSource, setLocationSource] = useState<'exif' | 'live_gps' | 'city_center' | 'custom'>('live_gps')

  useEffect(() => {
    if (visible && initialPandal) {
      setPandalName(initialPandal)
      const found = AGARTALA_MASTER_PANDALS.find(p => p.name.toLowerCase() === initialPandal.toLowerCase())
      if (found) {
        setNeighborhood(found.neighborhood || 'Agartala')
        setCoords({ lat: found.lat, lng: found.lng })
        setLocationSource('custom')
      }
    }
  }, [visible, initialPandal])
  const [sourceBadge, setSourceBadge] = useState({ text: '📡 Live Device GPS', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' })
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [mapSearchQuery, setMapSearchQuery] = useState('')
  const [showMapSearch, setShowMapSearch] = useState(false)
  const [step, setStep] = useState<'capture' | 'details'>('details')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setSelectedFile(null)
    setPreview(null)
    setPandalName('')
    setNeighborhood('')
    setCoords(AGARTALA_CENTER)
    setStep('details')
    setSubmitting(false)
    setShowDropdown(false)
    setSearchFilter('')
    setMapSearchQuery('')
    setShowMapSearch(false)
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
    return pandalsWithProximity.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.neighborhood && p.neighborhood.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q)) ||
      'agartala'.includes(q) || q.includes('agartala') ||
      'tripura'.includes(q) || q.includes('tripura') ||
      (p.keywords && p.keywords.some(k => k.includes(q) || q.includes(k)))
    )
  }, [pandalsWithProximity, pandalName, searchFilter])

  const filteredMapPandals = useMemo(() => {
    const q = mapSearchQuery.trim().toLowerCase()
    if (!q) return []
    return AGARTALA_MASTER_PANDALS.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.neighborhood && p.neighborhood.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q)) ||
      'agartala'.includes(q) || q.includes('agartala') ||
      'tripura'.includes(q) || q.includes('tripura') ||
      (p.keywords && p.keywords.some(k => k.includes(q) || q.includes(k)))
    ).slice(0, 5)
  }, [mapSearchQuery])

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
      className={`snap-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-4 bg-black/40 backdrop-blur-[2px] ${
        visible ? 'active visible' : 'hidden'
      }`}
    >
      <div className="snap-modal-content w-full sm:max-w-md mx-auto bg-[#211329]/50 backdrop-blur-2xl rounded-[22px] sm:rounded-[26px] border border-[#E9B83E]/40 p-3.5 sm:p-4.5 flex flex-col overflow-hidden shadow-[0_24px_60px_rgba(13,12,27,0.7),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_24px_rgba(233,184,62,0.18)]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#E9B83E]/20 mb-2.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full p-0.5 bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center overflow-hidden flex-shrink-0 aspect-square shadow-[0_0_8px_rgba(233,184,62,0.35)]">
              <img src="/durga-emblem.png?v=c2" alt="Puja Parikrama" className="w-full h-full rounded-full object-contain object-center" />
            </div>
            <div>
              <h2 className="text-[#F5E5B7] font-bold text-sm sm:text-base leading-tight">
                {pandalName.trim() ? 'Add Photos of This Pandal' : 'Add a Pandal'}
              </h2>
              <p className="text-[#E9B83E]/80 text-[10px] sm:text-[11px] font-medium leading-tight">
                {pandalName.trim() ? 'Take a new photo or select photos from your gallery' : 'Share your favourite pandal with the Puja Porikroma community'}
              </p>
            </div>
          </div>
          <button id="upload-back-btn" onClick={handleClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition active:scale-95 cursor-pointer text-xs">
            ✕
          </button>
        </div>

        {/* Hidden File Input */}
        <input
          id="snap-file-input"
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) processFileWaterfall(file, 'gallery')
          }}
        />

        {/* Main Content (Non-scrollable, compact layout) */}
        <div className="space-y-2.5 sm:space-y-3 flex flex-col">
          {/* Media Preview Box (Tap to choose or change image) */}
          <div
            onClick={() => document.getElementById('snap-file-input')?.click()}
            className="w-full h-32 sm:h-36 rounded-xl border border-dashed border-[#E9B83E]/40 hover:border-[#E9B83E] bg-[#211329]/50 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer transition-all shadow-[0_4px_16px_rgba(13,12,27,0.5)]"
          >
            {preview ? (
              <>
                <img src={preview} alt="preview" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-black/65 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] text-white/90 border border-white/20 flex items-center gap-1 shadow-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Tap to change
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-saffron to-puja-gold flex items-center justify-center mb-3 shadow-md shadow-saffron/30 group-hover:scale-105 transition-transform flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                    <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                    <circle cx="12" cy="13" r="3" fill="white"/>
                  </svg>
                </div>
                <p className="text-[#F5E5B7] font-semibold text-xs leading-tight">Add Photos of This Pandal</p>
                <p className="text-[#E9B83E]/80 text-[10px] mt-1.5 leading-tight">Take a new photo or select photos from your gallery</p>
              </div>
            )}
          </div>

          {/* Pandal Name & Dropdown (Styled like Search Bar & Landing Page Year) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] sm:text-xs font-semibold text-[#F5E5B7]">
              <span>Pandal Name</span> <span className="text-red-500 font-bold">*</span>
            </label>
            <div className="relative flex items-center rounded-full bg-[#211329]/75 hover:bg-[#211329]/85 border border-[#E9B83E]/40 hover:border-[#E9B83E] focus-within:border-[#E9B83E] shadow-[0_4px_16px_rgba(13,12,27,0.5),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_8px_rgba(233,184,62,0.15)] backdrop-blur-md transition-all">
              <svg className="w-3.5 h-3.5 text-[#E9B83E] flex-shrink-0 ml-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                id="pandal-name-input"
                type="text"
                value={pandalName}
                onFocus={() => setShowDropdown(true)}
                onChange={e => { setPandalName(e.target.value); setSearchFilter(e.target.value); setShowDropdown(true); }}
                placeholder="Select or Enter Pandal Name..."
                className="w-full bg-transparent pl-2.5 pr-9 py-2 text-[#F5E5B7] font-normal placeholder:font-normal text-xs sm:text-[13px] placeholder-[#F5E5B7]/45 focus:placeholder-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#E9B83E] hover:text-[#F5E5B7] flex items-center justify-center transition cursor-pointer"
                title="Select pandal"
              >
                <svg className={`w-3.5 h-3.5 text-[#E9B83E] transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Proximity Dropdown (Styled like Year dropdown) */}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#211329]/95 border border-[#E9B83E]/35 rounded-2xl shadow-[0_12px_32px_rgba(13,12,27,0.85),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_12px_rgba(233,184,62,0.15)] backdrop-blur-2xl max-h-48 overflow-y-auto no-scrollbar p-1.5 space-y-1">
                <div className="px-2 py-0.5 text-[9px] font-bold text-[#E9B83E] uppercase tracking-wider flex items-center justify-between border-b border-[#E9B83E]/20 mb-1">
                  <span>Known Agartala Pandals</span>
                  <span>Distance</span>
                </div>
                <div className="space-y-1">
                  {filteredPandals.map(p => {
                    const isSelected = pandalName.trim().toLowerCase() === p.name.toLowerCase();
                    return (
                      <div
                        key={p.name}
                        onClick={() => {
                          setPandalName(p.name)
                          setNeighborhood(p.neighborhood || 'Agartala')
                          setCoords({ lat: p.lat, lng: p.lng })
                          setLocationSource('custom')
                          setSourceBadge({ text: '🏛️ Pandal Coordinates', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' })
                          setShowDropdown(false)
                        }}
                        className={`px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#E9B83E]/20 text-[#E9B83E] font-bold border border-[#E9B83E]/30 shadow-sm'
                            : 'text-[#F5E5B7]/90 hover:bg-[#E9B83E]/20 hover:text-[#E9B83E] active:scale-[0.99] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base flex-shrink-0">{p.emoji || '🪔'}</span>
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate leading-tight">{p.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-[10px] font-semibold text-[#E9B83E] bg-[#E9B83E]/15 border border-[#E9B83E]/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {p.distText}
                          </span>
                          {isSelected && <span className="text-[#E9B83E] text-xs font-bold">✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Mini-Map Preview Card (Confirmation) with Floating Top Search Bar */}
          <div className="space-y-1.5">
            <label className="block text-[11px] sm:text-xs font-semibold text-[#F5E5B7]">
              <span>Confirm Pandal Location</span> <span className="text-red-500 font-bold">*</span>
            </label>
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
              className="relative w-full h-44 sm:h-52 rounded-xl overflow-hidden border border-white/15 bg-[#0a0a14] cursor-crosshair flex flex-col items-center justify-center text-center p-2 pt-9 shadow-inner group"
            >
              {/* Map Search Bar Floating Over Top of Map */}
              <div 
                className="absolute top-2 left-2 right-2 z-20 pointer-events-auto" 
                onClick={e => e.stopPropagation()}
              >
                <div className="relative flex items-center">
                  <input 
                    type="text" 
                    value={mapSearchQuery}
                    onChange={e => { setMapSearchQuery(e.target.value); setShowMapSearch(true); }}
                    onFocus={() => setShowMapSearch(true)}
                    className="w-full bg-[#121224]/85 hover:bg-[#121224]/95 focus:bg-[#121224] backdrop-blur-md border border-[#E9B83E]/45 focus:border-[#E9B83E] rounded-full pl-8.5 pr-8 py-1.5 text-[11px] text-[#F5E5B7] shadow-[0_2px_10px_rgba(0,0,0,0.6)] outline-none transition"
                  />
                  <svg className="w-3.5 h-3.5 text-[#E9B83E] absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  {mapSearchQuery && (
                    <button 
                      type="button" 
                      onClick={() => { setMapSearchQuery(''); setShowMapSearch(false); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/15 hover:bg-white/25 text-white/70 hover:text-white flex items-center justify-center text-[9px] transition cursor-pointer z-10"
                      title="Clear"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {showMapSearch && filteredMapPandals.length > 0 && (
                  <div className="mt-1 bg-[#121224]/95 backdrop-blur-xl border border-[#E9B83E]/40 rounded-xl shadow-2xl max-h-32 overflow-y-auto no-scrollbar p-1 text-left">
                    {filteredMapPandals.map(p => (
                      <div
                        key={p.name}
                        onClick={() => {
                          setPandalName(p.name);
                          setNeighborhood(p.neighborhood || 'Agartala');
                          setCoords({ lat: p.lat, lng: p.lng });
                          setLocationSource('custom');
                          setSourceBadge({ text: '🏛️ Pandal Coordinates', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' });
                          setMapSearchQuery(p.name);
                          setShowMapSearch(false);
                        }}
                        className="px-3 py-2 text-left text-xs font-semibold transition cursor-pointer text-[#F5E5B7]/90 hover:bg-[#E9B83E]/20 hover:text-[#E9B83E] border-b border-[#E9B83E]/20 last:border-b-0 first:rounded-t-lg last:rounded-b-lg"
                      >
                        <div className="truncate">
                          <span className="text-[11px] font-bold truncate block text-white">{p.name}</span>
                          <span className="text-[9px] text-[#F5E5B7]/70 truncate mt-0.5 block">{p.neighborhood || 'Agartala'}, Agartala</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Smaller Yellow Pin */}
              <div className="relative flex items-center justify-center mb-0.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
                <svg width="22" height="28" viewBox="0 0 26 32" fill="none">
                  <defs>
                    <linearGradient id="yellowPinGradReact" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FCEAB8" />
                      <stop offset="50%" stopColor="#E9B83E" />
                      <stop offset="100%" stopColor="#B8861B" />
                    </linearGradient>
                  </defs>
                  <path d="M13 1.5C6.9 1.5 2 6.4 2 12.5c0 7.8 9.9 16.7 10.4 17.1a1 1 0 0 0 1.2 0c0.5-0.4 10.4-9.3 10.4-17.1C24 6.4 19.1 1.5 13 1.5z" fill="url(#yellowPinGradReact)" stroke="#211329" strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="13" cy="12.5" r="4.5" fill="#FFFFFF" />
                  <circle cx="13" cy="12.5" r="2.5" fill="#211329" />
                </svg>
              </div>
              <span className="text-white text-xs font-bold truncate max-w-[90%]">{pandalName || 'Selected Location'}</span>
              <span className="font-mono text-amber-300 text-[9px] mt-0.5">{coords.lat.toFixed(4)}° N, {coords.lng.toFixed(4)}° E</span>
            </div>
          </div>

          {/* Submit button (Add snap yellow colors, border, text: Submit) */}
          <div className="pt-0.5">
            <button
              id="submit-snap-btn"
              onClick={handleSubmit}
              disabled={!pandalName.trim() || !selectedFile || submitting}
              className="w-full py-2.5 sm:py-3 rounded-full bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] text-[#211329] font-black text-xs sm:text-sm tracking-wider flex items-center justify-center border-2 border-[#E9B83E] shadow-[0_0_14px_rgba(233,184,62,0.30),0_4px_16px_rgba(13,12,27,0.55)] hover:shadow-[0_0_20px_rgba(233,184,62,0.50)] hover:scale-[1.01] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none transition-all flex-shrink-0 cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
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
  const userMarkerRef = useRef<any>(null)

  const [posts, setPosts] = useState<SnapPost[]>(SEED_POSTS)
  const [selectedPost, setSelectedPost] = useState<SnapPost | null>(null)
  const [uploadVisible, setUploadVisible] = useState(false)
  const [selectedPandalForUpload, setSelectedPandalForUpload] = useState('')
  const [currentUserCoords, setCurrentUserCoords] = useState<{ lat: number; lng: number }>(() => {
    try {
      const cached = localStorage.getItem('parikrama_user_location')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return parsed
        }
      }
    } catch {}
    return AGARTALA_CENTER
  })
  const [mapReady, setMapReady] = useState(false)
  const [toast, setToast] = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false })
  const [liveCount, setLiveCount] = useState(23)

  const [showSplash, setShowSplash] = useState(() => {
    try {
      sessionStorage.removeItem('visited')
      localStorage.removeItem('parikrama_splash_seen')
    } catch {}
    return true
  })
  const [cameraFlashing, setCameraFlashing] = useState(false)
  const [screenWhiteout, setScreenWhiteout] = useState(false)
  const [phonePos, setPhonePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [user, setUser] = useState<AuthUser | null>(() => {
    const cached = localStorage.getItem('puja_parikrama_user')
    if (cached) {
      try { return JSON.parse(cached) } catch { return null }
    }
    return null
  })
  const [authModalVisible, setAuthModalVisible] = useState(false)
  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState(false)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [topSearchQuery, setTopSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [activeFilter, setActiveFilter] = useState<'latest' | 'trending' | 'nearby' | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false)
  const yearDropdownRef = useRef<HTMLDivElement>(null)

  // YouTube Music Player State & Refs
  const YOUTUBE_PLAYLIST_ID = 'PLBFyKHpeq9js'
  const ytPlayerRef = useRef<any>(null)
  const ytPlayerReady = useRef(false)
  const userExplicitlyPaused = useRef(false)
  const autoPlayStarted = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const isMutedRef = useRef(false)
  const userInteracted = useRef(false)
  const [isMuted, setIsMuted] = useState(false)
  const [trackTitle, setTrackTitle] = useState('Durga Ma Asche')
  const [trackArtist, setTrackArtist] = useState('Infra')
  const [trackCover, setTrackCover] = useState('https://i.ytimg.com/vi/LLer3VPOcxg/hqdefault.jpg')
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [totalDurationSec, setTotalDurationSec] = useState(0)
  const dhakEngineRef = useRef<DhakAudioEngine | null>(null)

  const unlockAndPlayAudio = useCallback(() => {
    userInteracted.current = true
    if (userExplicitlyPaused.current) return
    if (ytPlayerRef.current && ytPlayerReady.current) {
      try {
        if (!isMutedRef.current) {
          if (typeof ytPlayerRef.current.unMute === 'function') ytPlayerRef.current.unMute()
          if (typeof ytPlayerRef.current.setVolume === 'function') ytPlayerRef.current.setVolume(100)
        } else {
          if (typeof ytPlayerRef.current.mute === 'function') ytPlayerRef.current.mute()
        }
        if (typeof ytPlayerRef.current.playVideoAt === 'function' && !autoPlayStarted.current) {
          ytPlayerRef.current.playVideoAt(0)
        } else if (typeof ytPlayerRef.current.playVideo === 'function') {
          ytPlayerRef.current.playVideo()
        }
        autoPlayStarted.current = true
      } catch (e) {}
    }
  }, [])

  // Initialize Dhak Audio Engine
  useEffect(() => {
    dhakEngineRef.current = new DhakAudioEngine()
    return () => {
      dhakEngineRef.current?.stop()
    }
  }, [])


  // Initialize YouTube IFrame API
  useEffect(() => {
    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script')
      tag.id = 'youtube-iframe-api'
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
    }

    const initPlayer = () => {
      const container = document.getElementById('react-yt-player-iframe')
      if (!container || ytPlayerRef.current || !(window as any).YT || !(window as any).YT.Player) return
      try {
        ytPlayerRef.current = new (window as any).YT.Player('react-yt-player-iframe', {
          height: '100%',
          width: '100%',
          playerVars: {
            listType: 'playlist',
            list: YOUTUBE_PLAYLIST_ID,
            autoplay: 1,
            controls: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              ytPlayerReady.current = true
              try {
                if (!isMutedRef.current) {
                  event.target.unMute()
                  event.target.setVolume(100)
                } else {
                  event.target.mute()
                }
                if (typeof event.target.playVideoAt === 'function') {
                  event.target.playVideoAt(0)
                } else if (typeof event.target.playVideo === 'function') {
                  event.target.playVideo()
                }
              } catch (e) {
                try {
                  event.target.pauseVideo()
                  event.target.seekTo(0, true)
                } catch(err) {}
                setCurrentTimeSec(0)
                setIsPlaying(false)
              }
              updateYTTrackInfo()
            },
            onAutoplayBlocked: (event: any) => {
              try {
                event.target.pauseVideo()
                event.target.seekTo(0, true)
              } catch(e) {}
              setCurrentTimeSec(0)
              setIsPlaying(false)
            },
            onStateChange: (e: any) => {
              handleYTStateChange(e.data)
            },
            onError: (err: any) => {
              console.warn('YouTube Player API message:', err)
            },
          },
        })
      } catch (e) {
        console.warn('Could not init React YouTube player:', e)
      }
    }

    const updateYTTrackInfo = () => {
      if (!ytPlayerRef.current || typeof ytPlayerRef.current.getVideoData !== 'function') return
      try {
        const data = ytPlayerRef.current.getVideoData()
        if (data && data.title) {
          let cleanTitle = data.title
          const separatorIdx = cleanTitle.search(/[|(\[\-(–—।॥•~/]|\s[Il]\s/)
          if (separatorIdx !== -1) {
            const cut = cleanTitle.slice(0, separatorIdx).trim()
            if (cut) cleanTitle = cut
          }
          setTrackTitle(cleanTitle)
          let author = data.author ? data.author.replace(/\s*-\s*Topic$/i, '').trim() : ''
          author = author.replace(/\s*·\s*YouTube(\s*Music)?/gi, '').trim()
          author = author.replace(/\s*YouTube(\s*Music)?/gi, '').trim()
          setTrackArtist(author || 'Infra')
          if (data.video_id) {
            setTrackCover(`https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`)
          }
        }
        const dur = ytPlayerRef.current.getDuration()
        if (dur && dur > 0) {
          setTotalDurationSec(Math.round(dur))
        }
      } catch (e) {}
    }

    const handleYTStateChange = (state: number) => {
      const YT = (window as any).YT
      if (YT && state === YT.PlayerState.PLAYING) {
        if (!isMutedRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.isMuted === 'function' && ytPlayerRef.current.isMuted() && !userInteracted.current) {
          try {
            ytPlayerRef.current.pauseVideo()
            ytPlayerRef.current.seekTo(0, true)
          } catch(e) {}
          setIsPlaying(false)
          setCurrentTimeSec(0)
          return
        }
        setIsPlaying(true)
        autoPlayStarted.current = true
        if (isMutedRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.mute === 'function') {
          ytPlayerRef.current.mute()
        }
        updateYTTrackInfo()
      } else if (YT && (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED)) {
        setIsPlaying(false)
      } else if (YT && (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.CUED)) {
        if (isMutedRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.mute === 'function') {
          ytPlayerRef.current.mute()
        }
        updateYTTrackInfo()
      }
    }

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer()
    } else {
      const prevOnReady = (window as any).onYouTubeIframeAPIReady
      ;(window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prevOnReady === 'function') prevOnReady()
        initPlayer()
      }
    }
  }, [])

  useEffect(() => {
    document.title = 'Puja Parikrama'
  }, [])

  // Close year dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setYearDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleMute = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = !isMutedRef.current
    isMutedRef.current = next
    setIsMuted(next)

    if (ytPlayerRef.current && ytPlayerReady.current) {
      try {
        if (next) {
          if (typeof ytPlayerRef.current.mute === 'function') ytPlayerRef.current.mute()
        } else {
          if (typeof ytPlayerRef.current.unMute === 'function') ytPlayerRef.current.unMute()
          if (typeof ytPlayerRef.current.setVolume === 'function') ytPlayerRef.current.setVolume(100)
        }
      } catch (err) {}
    }
    dhakEngineRef.current?.setMuted(next)
  }, [])

  // Playback timer ticker
  useEffect(() => {
    let timer: any = null
    if (isPlaying) {
      timer = setInterval(() => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
          try {
            const cur = ytPlayerRef.current.getCurrentTime() || 0
            const dur = ytPlayerRef.current.getDuration() || totalDurationSec
            setCurrentTimeSec(Math.round(cur))
            if (dur > 0) setTotalDurationSec(Math.round(dur))
          } catch (e) {}
        } else {
          setCurrentTimeSec(prev => (prev >= totalDurationSec ? 0 : prev + 1))
        }
      }, 500)
    }
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [isPlaying, totalDurationSec])

  const togglePlayPause = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (ytPlayerRef.current && ytPlayerReady.current && typeof ytPlayerRef.current.getPlayerState === 'function') {
      const YT = (window as any).YT
      const state = ytPlayerRef.current.getPlayerState()
      if (state === YT?.PlayerState.PLAYING) {
        userExplicitlyPaused.current = true
        ytPlayerRef.current.pauseVideo()
      } else {
        userExplicitlyPaused.current = false
        try {
          if (!isMutedRef.current) {
            ytPlayerRef.current.unMute()
            ytPlayerRef.current.setVolume(100)
          } else {
            ytPlayerRef.current.mute()
          }
        } catch(e) {}
        ytPlayerRef.current.playVideo()
      }
    } else {
      setIsPlaying(p => {
        const next = !p
        if (!next) {
          userExplicitlyPaused.current = true
          dhakEngineRef.current?.stop()
        } else {
          userExplicitlyPaused.current = false
          dhakEngineRef.current?.play()
        }
        return next
      })
    }
  }, [])

  const handleNextTrack = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (ytPlayerRef.current && ytPlayerReady.current && typeof ytPlayerRef.current.nextVideo === 'function') {
      ytPlayerRef.current.nextVideo()
      if (isMutedRef.current && typeof ytPlayerRef.current.mute === 'function') {
        ytPlayerRef.current.mute()
      }
    }
  }, [])

  const handlePrevTrack = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (ytPlayerRef.current && ytPlayerReady.current && typeof ytPlayerRef.current.previousVideo === 'function') {
      ytPlayerRef.current.previousVideo()
      if (isMutedRef.current && typeof ytPlayerRef.current.mute === 'function') {
        ytPlayerRef.current.mute()
      }
    }
  }, [])

  const handleScrubberClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const fraction = Math.max(0, Math.min(1, clickX / rect.width))
    const target = Math.round(fraction * totalDurationSec)
    if (ytPlayerRef.current && ytPlayerReady.current && typeof ytPlayerRef.current.seekTo === 'function') {
      ytPlayerRef.current.seekTo(target, true)
    }
    setCurrentTimeSec(target)
  }, [totalDurationSec])

  const topSearchResults = useMemo(() => {
    if (!topSearchQuery.trim()) return []
    const q = topSearchQuery.trim().toLowerCase()
    return AGARTALA_MASTER_PANDALS.filter(p => {
      if (p.name && p.name.toLowerCase().includes(q)) return true
      if (p.neighborhood && p.neighborhood.toLowerCase().includes(q)) return true
      if (p.city && p.city.toLowerCase().includes(q)) return true
      if ('agartala'.includes(q) || q.includes('agartala')) return true
      if ('tripura'.includes(q) || q.includes('tripura')) return true
      if (p.keywords && p.keywords.some(k => k.includes(q) || q.includes(k))) return true
      return false
    }).slice(0, 6)
  }, [topSearchQuery])

  const showToast = useCallback((_msg: string) => {
    // All toast prompts disabled per user request
  }, [])

  const computePhoneCoordinates = useCallback(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    const vw = window.innerWidth
    const vh = window.innerHeight

    const imgW = 1024
    const imgH = 576
    const targetXRatio = 0.6658
    const targetYRatio = 0.8113

    const scale = Math.max(vw / imgW, vh / imgH)
    const renderedW = imgW * scale
    const renderedH = imgH * scale
    const offsetX = (vw - renderedW) / 2
    const offsetY = -7 // Shifted up by 7px per user request

    return {
      x: Math.round(offsetX + targetXRatio * renderedW),
      y: Math.round(offsetY + targetYRatio * renderedH)
    }
  }, [])

  useEffect(() => {
    if (!showSplash) return
    const update = () => setPhonePos(computePhoneCoordinates())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showSplash, computePhoneCoordinates])

  const triggerCameraFlashAndEnter = useCallback(() => {
    // Start music on user entering from splash screen
    unlockAndPlayAudio()

    // 1. Position flash right at the guy's phone & ignite
    setPhonePos(computePhoneCoordinates())
    setCameraFlashing(true)
    if (navigator.vibrate) {
      try { navigator.vibrate([35, 25, 45]) } catch {}
    }

    // 2. The flash burst turns the entire page blinding white (after 100ms)
    setTimeout(() => {
      setScreenWhiteout(true)
    }, 100)

    // 3. While the screen is pure white, permanently dismiss splash and load landing page
    setTimeout(() => {
      setShowSplash(false)
      if (googleMapRef.current) {
        let loc = currentUserCoords
        if (!loc || (loc.lat === AGARTALA_CENTER.lat && loc.lng === AGARTALA_CENTER.lng)) {
          try {
            const saved = localStorage.getItem('parikrama_user_location')
            if (saved) loc = JSON.parse(saved)
          } catch {}
        }
        if (loc) {
          googleMapRef.current.panTo(loc)
          googleMapRef.current.setZoom(16)
        }
      }
    }, 260)

    // 4. White flash dissipates, revealing the live landing map page
    setTimeout(() => {
      setScreenWhiteout(false)
    }, 450)
  }, [currentUserCoords, computePhoneCoordinates, unlockAndPlayAudio])

  // ── Parikrama Splash Screen Controller: auto-flash after 1.5 seconds ──
  useEffect(() => {
    if (!showSplash) return
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
    let initialCenter = AGARTALA_CENTER
    let initialZoom = 14
    try {
      const cached = localStorage.getItem('parikrama_user_location')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          initialCenter = parsed
          initialZoom = 16
        }
      }
    } catch {}

    const map = new window.google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: initialZoom,
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

    const applyCoords = (coords: { lat: number; lng: number }) => {
      setCurrentUserCoords(coords)
      try {
        localStorage.setItem('parikrama_user_location', JSON.stringify(coords))
      } catch {}
      map.setCenter(coords)
      map.setZoom(16)
    }

    // Auto-detect location & zoom on startup (dual-tier GPS)
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        },
        (err) => {
          console.warn('High-accuracy geolocation failed on startup, trying standard accuracy:', err)
          navigator.geolocation.getCurrentPosition(
            (posFallback) => {
              applyCoords({ lat: posFallback.coords.latitude, lng: posFallback.coords.longitude })
            },
            (errFallback) => {
              console.warn('Standard geolocation failed on startup:', errFallback)
              if (initialCenter === AGARTALA_CENTER) {
                map.setCenter(AGARTALA_CENTER)
                map.setZoom(14)
              }
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
          )
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
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

  const currentMapFlightIdRef = useRef<number | null>(null)

  const smoothMoveMapTo = useCallback((coords: { lat: number; lng: number }, targetZoom = 16, duration = 850) => {
    if (!googleMapRef.current || !window.google?.maps) return

    if (currentMapFlightIdRef.current) {
      cancelAnimationFrame(currentMapFlightIdRef.current)
      currentMapFlightIdRef.current = null
    }

    const center = googleMapRef.current.getCenter()
    if (!center) {
      googleMapRef.current.setCenter(coords)
      googleMapRef.current.setZoom(targetZoom)
      return
    }

    const startLat = center.lat()
    const startLng = center.lng()
    const destLat = coords.lat
    const destLng = coords.lng

    const dLat = destLat - startLat
    const dLng = destLng - startLng
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)

    if (dist < 0.00005) {
      if (googleMapRef.current.getZoom() !== targetZoom) {
        googleMapRef.current.setZoom(targetZoom)
      }
      return
    }

    const easeInOutQuart = (t: number) => {
      return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
    }

    const startTime = performance.now()
    const flyDuration = dist > 0.06 ? 1150 : duration

    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(1, elapsed / flyDuration)
      const ease = easeInOutQuart(progress)

      const lat = startLat + dLat * ease
      const lng = startLng + dLng * ease

      googleMapRef.current?.setCenter(new window.google.maps.LatLng(lat, lng))

      if (progress < 1) {
        currentMapFlightIdRef.current = requestAnimationFrame(animate)
      } else {
        currentMapFlightIdRef.current = null
        googleMapRef.current?.setCenter(new window.google.maps.LatLng(destLat, destLng))
        if (googleMapRef.current && googleMapRef.current.getZoom() !== targetZoom) {
          googleMapRef.current.setZoom(targetZoom)
        }
      }
    }

    currentMapFlightIdRef.current = requestAnimationFrame(animate)
  }, [])

  const handleLocateMe = () => {
    showToast('📍 Locating position...')

    let hasAnimatedFlight = false

    const updateMapToCoords = (coords: { lat: number; lng: number }, isRefinement = false) => {
      if (!hasAnimatedFlight) {
        hasAnimatedFlight = true
        smoothMoveMapTo(coords, 16)
      } else if (isRefinement && googleMapRef.current && typeof googleMapRef.current.panTo === 'function') {
        googleMapRef.current.panTo(coords)
      }

      if (googleMapRef.current && window.google?.maps) {
        if (!userMarkerRef.current) {
          const dot = document.createElement('div')
          dot.className = 'user-gps-marker'
          dot.innerHTML = '<div class="user-gps-halo"></div><div class="user-gps-dot"></div>'
          if (window.google.maps.marker?.AdvancedMarkerElement) {
            userMarkerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
              map: googleMapRef.current,
              position: coords,
              content: dot,
              title: 'My Location'
            })
          } else {
            userMarkerRef.current = new window.google.maps.Marker({
              map: googleMapRef.current,
              position: coords,
              title: 'My Location',
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4285F4',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2.5,
              }
            })
          }
        } else {
          if (userMarkerRef.current.position) {
            userMarkerRef.current.position = coords
          } else if (typeof userMarkerRef.current.setPosition === 'function') {
            userMarkerRef.current.setPosition(coords)
          }
        }
      }
    }

    // 1. Smoothly glide immediately to known/saved location if available
    let target = currentUserCoords
    if (!target || (target.lat === AGARTALA_CENTER.lat && target.lng === AGARTALA_CENTER.lng)) {
      try {
        const saved = localStorage.getItem('parikrama_user_location')
        if (saved) target = JSON.parse(saved)
      } catch {}
    }
    if (target && (target.lat !== AGARTALA_CENTER.lat || target.lng !== AGARTALA_CENTER.lng)) {
      updateMapToCoords(target, false)
    }

    // 2. Fetch fresh live GPS: first attempt high accuracy with 60s cache allowed, fallback to standard accuracy
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const freshCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setCurrentUserCoords(freshCoords)
          try {
            localStorage.setItem('parikrama_user_location', JSON.stringify(freshCoords))
          } catch {}
          updateMapToCoords(freshCoords, true)
        },
        err => {
          console.warn('High-accuracy geolocation failed, falling back to standard accuracy:', err)
          navigator.geolocation.getCurrentPosition(
            posFallback => {
              const fallbackCoords = { lat: posFallback.coords.latitude, lng: posFallback.coords.longitude }
              setCurrentUserCoords(fallbackCoords)
              try {
                localStorage.setItem('parikrama_user_location', JSON.stringify(fallbackCoords))
              } catch {}
              updateMapToCoords(fallbackCoords, true)
            },
            errFallback => {
              console.warn('Standard geolocation failed:', errFallback)
              if (!target) {
                updateMapToCoords(AGARTALA_CENTER, false)
              }
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
          )
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      )
    } else if (target) {
      updateMapToCoords(target, false)
    }
  }

  const handleZoomIn = () => {
    if (googleMapRef.current && typeof googleMapRef.current.getZoom === 'function') {
      const currentZoom = googleMapRef.current.getZoom() || 14
      googleMapRef.current.setZoom(Math.min(currentZoom + 1, 21))
    } else if (typeof (window as any).zoomInMap === 'function') {
      ;(window as any).zoomInMap()
    }
  }

  const handleZoomOut = () => {
    if (googleMapRef.current && typeof googleMapRef.current.getZoom === 'function') {
      const currentZoom = googleMapRef.current.getZoom() || 14
      googleMapRef.current.setZoom(Math.max(currentZoom - 1, 3))
    } else if (typeof (window as any).zoomOutMap === 'function') {
      ;(window as any).zoomOutMap()
    }
  }

  const handleResetNorth = () => {
    if (googleMapRef.current) {
      if (typeof googleMapRef.current.setHeading === 'function') googleMapRef.current.setHeading(0)
      if (typeof googleMapRef.current.setTilt === 'function') googleMapRef.current.setTilt(0)
    } else if (typeof (window as any).resetMapNorth === 'function') {
      ;(window as any).resetMapNorth()
    }
    const needle = document.getElementById('compass-needle-icon')
    if (needle) needle.style.transform = 'rotate(0deg)'
  }

  const handleToggleFilter = (filter: 'latest' | 'trending' | 'nearby') => {
    setActiveFilter(prev => {
      const next = prev === filter ? null : filter
      if (next === 'latest') {
        showToast('✨ Filter: Latest Pandals Active')
        if (posts.length > 0) {
          const sorted = [...posts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          if (sorted[0]) googleMapRef.current?.panTo({ lat: sorted[0].lat, lng: sorted[0].lng })
        }
      } else if (next === 'trending') {
        showToast('🔥 Filter: Trending Pandals Active')
        if (posts.length > 0) {
          const sorted = [...posts].sort((a, b) => ((b.likesCount || 0) * 4 + (b.viewsCount || 0)) - ((a.likesCount || 0) * 4 + (a.viewsCount || 0)))
          if (sorted[0]) googleMapRef.current?.panTo({ lat: sorted[0].lat, lng: sorted[0].lng })
        }
      } else if (next === 'nearby') {
        showToast('📍 Filter: Nearby Pandals Active')
        handleLocateMe()
      } else {
        showToast('Filter cleared')
      }
      return next
    })
  }

  return (
    <div className="relative w-full overflow-hidden font-inter" style={{ height: '100dvh', background: '#0D0C1B' }}>

      {/* ── MAP CANVAS ── */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ── MAP LOADING SCREEN ── */}
      {!mapReady && (
        <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center" style={{ background: '#0D0C1B' }}>
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
          onClick={triggerCameraFlashAndEnter}
          className="fixed inset-0 z-[9999] bg-[#0a0a14] select-none pointer-events-auto cursor-pointer overflow-hidden"
        >
          {/* Splash Artwork: moved up by 7px per user request */}
          <div className="absolute -top-[7px] inset-x-0 -bottom-[7px] w-full pointer-events-none select-none">
            <img
              src="/splash.jpg"
              alt="Puja Parikrama"
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>
      )}

      {/* Man's Camera Lens Flash Strobe & Flare (Dynamically positioned right on the man's smartphone) */}
      {showSplash && cameraFlashing && (
        <div
          id="camera-lens-flash"
          style={{ left: `${phonePos.x}px`, top: `${phonePos.y}px` }}
          className="fixed -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[10001]"
        >
          {/* Central super-bright white-hot core */}
          <div className="w-10 h-10 rounded-full bg-white shadow-[0_0_80px_45px_rgba(255,255,255,1),0_0_160px_90px_rgba(255,245,210,0.95)] animate-ping" />
          {/* Anamorphic lens flare streak */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] sm:w-[700px] h-[3.5px] bg-gradient-to-r from-transparent via-white to-transparent blur-[0.5px]" />
          {/* Cross star flare streak */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[220px] sm:h-[350px] w-[2.5px] bg-gradient-to-b from-transparent via-white to-transparent blur-[0.5px]" />
          {/* Diagonal glare streak */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] sm:w-[380px] h-[2px] rotate-45 bg-gradient-to-r from-transparent via-white/80 to-transparent blur-[0.5px]" />
        </div>
      )}

      {/* Full Screen Whiteout Flash: turns the entire screen blinding white and dissolves into landing page */}
      <div
        id="splash-whiteout-flash"
        className={`fixed inset-0 pointer-events-none bg-white transition-opacity duration-300 z-[10002] ${
          screenWhiteout ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ── 2. NEW FLOATING BRANDING BAR & EMBEDDED SEARCH ("PUJA PARIKRAMA") ── */}
      {mapReady && (
        <header className="fixed top-3 left-0 right-0 z-50 px-3 sm:px-6 pointer-events-none flex flex-col items-center w-full">
          {/* Main Pill Bar */}
          <div className="relative overflow-visible backdrop-blur-lg bg-[#211329]/50 border border-[#E9B83E]/40 rounded-full px-3 sm:px-4 py-1 h-10 sm:h-11 flex items-center justify-between w-full pointer-events-auto shadow-[0_4px_24px_rgba(13,12,27,0.45),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_8px_rgba(233,184,62,0.18)] transition-all">

            {/* Left Section: Transparent Glowing Durga Emblem & Bengali Typography */}
            <div className="relative flex items-center gap-1 sm:gap-1.5 min-w-0 z-10 flex-shrink-0 pr-1 sm:pr-2">
              <img
                src="/durga-emblem.png"
                alt="Maa Durga"
                className="h-6 sm:h-7 w-auto object-contain flex-shrink-0 drop-shadow-[0_0_4px_rgba(233,184,62,0.45)]"
              />
              <img
                src="/puja-text.png"
                alt="পূজা পরিক্রমা"
                className="h-6 sm:h-[29px] w-auto object-contain flex-shrink-0 drop-shadow-[0_0_6px_rgba(233,184,62,0.55)]"
              />
            </div>

            {/* Middle Section: Integrated Search Bar Centered in Header Box */}
            <div className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-360px)] min-w-[140px] max-w-xs sm:max-w-sm md:max-w-md z-20 pointer-events-auto">
              <div className="relative flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={topSearchQuery}
                  onChange={e => setTopSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder={isSearchFocused ? '' : 'Search Pandals...'}
                  className="w-full bg-[#0D0C1B]/60 hover:bg-[#0D0C1B]/80 focus:bg-[#0D0C1B]/95 border border-[#E9B83E]/35 hover:border-[#E9B83E]/60 focus:border-[#E9B83E] rounded-full pl-3 sm:pl-3.5 pr-8 py-1 h-7 sm:h-7.5 text-[11px] sm:text-xs text-[#F5E5B7] placeholder-[#F5E5B7]/45 focus:placeholder-transparent backdrop-blur-md shadow-inner outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="absolute right-2.5 text-[#E9B83E] hover:text-[#F5E5B7]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>

              {/* Search Autocomplete Dropdown (Starts just below search bar) */}
              {topSearchResults.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 right-0 bg-[#211329]/95 border border-[#E9B83E]/35 rounded-2xl p-1 shadow-[0_12px_32px_rgba(13,12,27,0.75),inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-xl z-50 max-h-60 overflow-y-auto">
                  {topSearchResults.map(pandal => (
                    <div
                      key={pandal.name}
                      onClick={() => {
                        googleMapRef.current?.panTo({ lat: pandal.lat, lng: pandal.lng })
                        googleMapRef.current?.setZoom(16)
                        setTopSearchQuery('')
                        showToast(`📍 Showing ${pandal.name}`)
                      }}
                      className="px-3.5 py-2.5 hover:bg-[#E9B83E]/15 hover:text-[#E9B83E] text-white/90 cursor-pointer transition text-left group border-b border-[#E9B83E]/20 last:border-b-0 first:rounded-t-xl last:rounded-b-xl"
                    >
                      <div className="truncate">
                        <p className="text-xs font-semibold text-white group-hover:text-[#E9B83E] truncate leading-tight">{pandal.name}</p>
                        <p className="text-[10px] text-[#F5E5B7]/70 truncate mt-0.5 leading-tight">{pandal.neighborhood}, Agartala</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {topSearchQuery.trim() && topSearchResults.length === 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-[#211329]/95 border border-[#E9B83E]/35 rounded-2xl p-3 shadow-[0_12px_32px_rgba(13,12,27,0.75)] backdrop-blur-xl z-50 text-center text-xs text-[#F5E5B7]/60 flex items-center justify-center gap-2">
                  <span>🔍</span> No pandals or locations found
                </div>
              )}
            </div>

            {/* Right Section: Year Selector, Leaderboard CTA & Profile Button */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 z-10 pl-1 sm:pl-2 ml-auto">
              {/* Year Selector Dropdown */}
              <div className="relative flex-shrink-0" ref={yearDropdownRef}>
                <button
                  type="button"
                  id="btn-year-selector"
                  onClick={() => setYearDropdownOpen(o => !o)}
                  title="Select Puja Year"
                  className="h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-xl backdrop-blur-md bg-[#211329]/70 hover:bg-[#211329]/85 border border-[#E9B83E]/40 hover:border-[#E9B83E] flex items-center gap-1.5 text-[#F5E5B7] font-semibold text-[11px] sm:text-xs shadow-[0_0_8px_rgba(233,184,62,0.22),inset_0_1px_1px_rgba(255,255,255,0.10)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-[#F5E5B7] text-[10px] sm:text-[11px] font-bold tracking-wide mr-1">Year</span>
                  <span className="text-[#E9B83E] font-bold">{selectedYear}</span>
                  <svg className={`w-3 h-3 text-[#E9B83E] transition-transform duration-200 ${yearDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {yearDropdownOpen && (
                  <div className="absolute top-full mt-2 right-0 bg-[#211329]/75 border border-[#E9B83E]/30 rounded-2xl p-2 shadow-[0_12px_32px_rgba(13,12,27,0.65),inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-xl z-50 flex flex-col min-w-[120px] space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    {[2026, 2025].map(year => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setSelectedYear(year)
                          setYearDropdownOpen(false)
                        }}
                        className={`px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          selectedYear === year
                            ? 'bg-[#E9B83E]/20 text-[#E9B83E] font-bold border border-[#E9B83E]/30'
                            : 'text-[#F5E5B7]/80 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span>{year}</span>
                        {selectedYear === year && (
                          <span className="text-[#E9B83E] text-xs font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Leaderboard Button */}
              <button
                id="btn-leaderboard"
                type="button"
                onClick={() => setLeaderboardModalVisible(true)}
                title="Pandal Devotee Leaderboard"
                className="h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-xl bg-gradient-to-r from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center gap-1.5 text-[#211329] font-bold text-[11px] sm:text-xs border border-[#211329]/30 shadow-[0_0_8px_rgba(233,184,62,0.22)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] hover:scale-[1.02] active:scale-95 transition-all flex-shrink-0 cursor-pointer"
              >
                <span>Leaderboard</span>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#211329] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1c1.8-.46 3.17-1.87 3.61-3.66C19.08 11.63 21 9.55 21 7V5c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
                </svg>
              </button>

              {/* Profile Button */}
              <button
                id="guest-avatar-chip"
                type="button"
                onClick={() => setProfileModalVisible(true)}
                title="Guest Devotee Profile"
                className="h-7 sm:h-7.5 px-2.5 sm:px-3 rounded-xl backdrop-blur-md bg-[#211329]/70 hover:bg-[#211329]/85 border border-[#E9B83E]/40 hover:border-[#E9B83E] flex items-center gap-1.5 text-[#F5E5B7] font-semibold text-[11px] sm:text-xs shadow-[0_0_8px_rgba(233,184,62,0.22),inset_0_1px_1px_rgba(255,255,255,0.10)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] hover:scale-[1.02] active:scale-95 transition-all flex-shrink-0 cursor-pointer"
              >
                <span>Profile</span>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E9B83E] flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Persistent YouTube IFrame Container for continuous audio playback (minimum 240px dimensions required by YouTube API & browser media engine) */}
      <div style={{ position: 'fixed', right: 0, bottom: 0, width: 240, height: 240, opacity: 0.001, pointerEvents: 'none', zIndex: -999, overflow: 'hidden' }}>
        <div id="react-yt-player-iframe" />
      </div>

      {/* ── 1. YOUTUBE MUSIC PLAYER BAR ── */}
      {mapReady && (
        <div className="fixed left-[calc(25%-14px)] -translate-x-1/2 bottom-4 sm:bottom-5 z-30 w-[calc(50%-52px)] max-w-[500px] sm:max-w-[520px] md:max-w-[540px] min-w-[260px] pointer-events-auto select-none flex flex-col gap-2">
          {/* Main Custom Styled Music Player Pill Bar - SINGLE ROW LAYOUT MATCHING SNAP CTA DIAMETER */}
          <div
            id="spotify-music-player-bar"
            className="w-full h-[52px] sm:h-14 overflow-hidden backdrop-blur-lg bg-[#211329]/55 hover:bg-[#211329]/75 border border-[#E9B83E]/40 hover:border-[#E9B83E] rounded-full px-2 sm:px-3 flex items-center justify-between gap-1.5 sm:gap-2 shadow-[0_4px_24px_rgba(13,12,27,0.45),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_10px_rgba(233,184,62,0.20)] hover:shadow-[0_4px_24px_rgba(13,12,27,0.50),0_0_16px_rgba(233,184,62,0.40)] hover:scale-[1.004] duration-200 transition-all"
          >
            {/* Left: Album Cover + Title + Artist (Clean cover without badge, full un-truncated title) */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink-0">
              <div className="relative flex-shrink-0">
                <img
                  src={trackCover}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/dugga-ma-asche.png' }}
                  alt={trackTitle}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-[8px] object-cover border border-[#E9B83E]/20 shadow"
                />
              </div>

              <div className="flex flex-col min-w-0 pr-1 flex-shrink-0">
                <span
                  id="player-track-title"
                  className="text-left text-xs sm:text-[13px] font-bold text-[#F5E5B7] whitespace-nowrap leading-tight"
                >
                  {trackTitle}
                </span>
                <span
                  id="player-track-artist"
                  className="text-[10px] sm:text-[11px] text-[#F5E5B7]/60 whitespace-nowrap leading-tight mt-0.5"
                >
                  {trackArtist}
                </span>
              </div>
            </div>

            {/* Middle: Dynamic Scrubber Track with Left & Right Timestamps */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-1 min-w-[36px] text-[9px] sm:text-[10px] font-mono text-[#F5E5B7]/50 px-1">
              <span className="text-left flex-shrink-0 font-mono">{formatSongTime(currentTimeSec)}</span>
              <div
                onClick={handleScrubberClick}
                className="relative flex-1 h-[2.5px] bg-[#0D0C1B]/80 hover:h-1 rounded-full overflow-hidden cursor-pointer group transition-all"
              >
                <div
                  className="h-full bg-gradient-to-r from-[#E9B83E] to-[#F5E5B7] transition-all"
                  style={{ width: `${Math.min(100, (currentTimeSec / Math.max(1, totalDurationSec)) * 100)}%` }}
                />
              </div>
              <span className="text-right flex-shrink-0 font-mono">{formatSongTime(totalDurationSec)}</span>
            </div>

            {/* Right: Playback Controls Row (Prev, Play, Next, Mute in White / Crossed) */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={handlePrevTrack}
                title="Previous Track"
                className="text-white/70 hover:text-white transition p-0.5 cursor-pointer"
              >
                <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current" viewBox="0 0 16 16">
                  <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.576a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z"/>
                </svg>
              </button>

              <button
                type="button"
                onClick={togglePlayPause}
                title={isPlaying ? "Pause" : "Play"}
                className="w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full bg-white text-black hover:scale-105 active:scale-95 flex items-center justify-center transition shadow-md flex-shrink-0 cursor-pointer"
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
                className="text-white/70 hover:text-white transition p-0.5 cursor-pointer"
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
                className={`transition p-0.5 cursor-pointer ${isMuted ? 'text-white/45 hover:text-white/70' : 'text-white hover:text-white/80'}`}
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
          className="fixed bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center border-2 sm:border-[2.5px] border-[#211329] shadow-[0_0_14px_rgba(233,184,62,0.30),0_4px_16px_rgba(13,12,27,0.55)] hover:shadow-[0_0_20px_rgba(233,184,62,0.50),0_4px_18px_rgba(13,12,27,0.60)] hover:scale-[1.02] active:scale-95 duration-200 transition-all pointer-events-auto flex-shrink-0 cursor-pointer"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#211329]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
            <circle cx="12" cy="13" r="3" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* ── 3. PANDAL FILTERS (Right Hand Side of CTA: Latest / Trending / Nearby, Sleek & Compact) ── */}
      {mapReady && (
        <div
          id="pandal-filter-group"
          className="fixed left-[calc(75%+14px)] -translate-x-1/2 bottom-4 sm:bottom-5 z-30 w-[calc(50%-52px)] max-w-[500px] sm:max-w-[520px] md:max-w-[540px] min-w-[260px] pointer-events-auto select-none flex items-center justify-between gap-1.5 sm:gap-2 h-[52px] sm:h-14"
        >
          {/* Latest Filter */}
          <button
            type="button"
            id="filter-btn-latest"
            onClick={() => handleToggleFilter('latest')}
            style={{ touchAction: 'manipulation' }}
            title="Filter by Latest Pandals"
            className={`flex-1 h-full rounded-full flex flex-col items-center justify-center py-1 sm:py-1.5 transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-95 ${
              activeFilter === 'latest' ? 'pandal-filter-active' : 'pandal-filter-inactive'
            }`}
          >
            <svg className="pointer-events-none w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5 sm:mb-1 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="pointer-events-none text-[10px] sm:text-xs leading-tight tracking-wide">Latest</span>
          </button>

          {/* Trending Filter */}
          <button
            type="button"
            id="filter-btn-trending"
            onClick={() => handleToggleFilter('trending')}
            style={{ touchAction: 'manipulation' }}
            title="Filter by Trending Pandals"
            className={`flex-1 h-full rounded-full flex flex-col items-center justify-center py-1 sm:py-1.5 transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-95 ${
              activeFilter === 'trending' ? 'pandal-filter-active' : 'pandal-filter-inactive'
            }`}
          >
            <svg className="pointer-events-none w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5 sm:mb-1 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            <span className="pointer-events-none text-[10px] sm:text-xs leading-tight tracking-wide">Trending</span>
          </button>

          {/* Nearby Filter */}
          <button
            type="button"
            id="filter-btn-nearby"
            onClick={() => handleToggleFilter('nearby')}
            style={{ touchAction: 'manipulation' }}
            title="Filter by Nearby Pandals"
            className={`flex-1 h-full rounded-full flex flex-col items-center justify-center py-1 sm:py-1.5 transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-95 ${
              activeFilter === 'nearby' ? 'pandal-filter-active' : 'pandal-filter-inactive'
            }`}
          >
            <svg className="pointer-events-none w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5 sm:mb-1 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className="pointer-events-none text-[10px] sm:text-xs leading-tight tracking-wide">Nearby</span>
          </button>
        </div>
      )}

      {/* ── 4. MAP FLOATING CONTROLS (Combined Zoom Capsule + Focus Button, Compass on Mobile Only) ── */}
      {mapReady && (
        <div
          id="map-floating-controls"
          className="fixed right-3.5 sm:right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center gap-2.5 sm:gap-3 pointer-events-auto select-none"
        >
          {/* 1. Compass Button (North Arrow + 'N' - Mobile only, hidden on laptop) */}
          <button
            id="btn-compass"
            onClick={handleResetNorth}
            title="Reset Bearing to North"
            aria-label="Compass"
            style={{ touchAction: 'manipulation' }}
            className="flex md:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#211329]/75 hover:bg-[#211329]/90 border border-[#E9B83E]/40 hover:border-[#E9B83E] text-[#E9B83E] hover:text-[#F5E5B7] flex-col items-center justify-center shadow-[0_4px_16px_rgba(13,12,27,0.5),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_8px_rgba(233,184,62,0.22)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] backdrop-blur-md transition-all active:scale-90 hover:scale-[1.05] pointer-events-auto flex-shrink-0 cursor-pointer"
          >
            <div id="compass-needle-icon" className="flex flex-col items-center transition-transform duration-300 pointer-events-none">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E9B83E]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3.5L5 16.5l7-2.5 7 2.5L12 3.5z"/>
              </svg>
              <span className="font-black text-[9px] sm:text-[10px] text-[#E9B83E] leading-none -mt-0.5 tracking-wider">N</span>
            </div>
          </button>

          {/* 2. Combined Zoom Controls Capsule (+ and − in one shared vertical container) */}
          <div
            id="zoom-controls-capsule"
            className="w-9 sm:w-10 h-[76px] sm:h-[84px] rounded-full bg-[#211329]/75 hover:bg-[#211329]/90 border border-[#E9B83E]/40 hover:border-[#E9B83E] shadow-[0_4px_16px_rgba(13,12,27,0.5),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_8px_rgba(233,184,62,0.22)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] backdrop-blur-md flex flex-col items-center justify-between overflow-hidden flex-shrink-0 transition-all hover:scale-[1.02]"
          >
            {/* Magnify Map (+) Button */}
            <button
              id="btn-zoom-in"
              onClick={handleZoomIn}
              title="Magnify Map (Zoom In)"
              aria-label="Magnify Map"
              style={{ touchAction: 'manipulation' }}
              className="w-full h-[37px] sm:h-[41px] flex items-center justify-center text-[#E9B83E] hover:text-[#F5E5B7] active:scale-90 transition-all cursor-pointer group/in"
            >
              <svg className="pointer-events-none w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover/in:scale-110 group-hover/in:text-[#F5E5B7] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            {/* Thin Golden Divider Line */}
            <div className="w-4 sm:w-5 h-[1px] bg-[#E9B83E]/30 pointer-events-none flex-shrink-0"></div>

            {/* Demagnify Map (−) Button */}
            <button
              id="btn-zoom-out"
              onClick={handleZoomOut}
              title="Demagnify Map (Zoom Out)"
              aria-label="Demagnify Map"
              style={{ touchAction: 'manipulation' }}
              className="w-full h-[37px] sm:h-[41px] flex items-center justify-center text-[#E9B83E] hover:text-[#F5E5B7] active:scale-90 transition-all cursor-pointer group/out"
            >
              <svg className="pointer-events-none w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover/out:scale-110 group-hover/out:text-[#F5E5B7] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          {/* 3. Focus / Locate Button (Crosshair Target) */}
          <button
            id="btn-recenter"
            onClick={handleLocateMe}
            title="Locate My Position"
            aria-label="Locate My Position"
            style={{ touchAction: 'manipulation' }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#211329]/75 hover:bg-[#211329]/90 border border-[#E9B83E]/40 hover:border-[#E9B83E] text-[#E9B83E] hover:text-[#F5E5B7] flex items-center justify-center shadow-[0_4px_16px_rgba(13,12,27,0.5),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_8px_rgba(233,184,62,0.22)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] backdrop-blur-md transition-all active:scale-90 hover:scale-[1.05] pointer-events-auto flex-shrink-0 cursor-pointer"
          >
            <svg className="pointer-events-none w-4.5 h-4.5 sm:w-5 sm:h-5 text-[#E9B83E] hover:text-[#F5E5B7] transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── STORY MODAL ── */}
      <StoryModal
        post={selectedPost}
        onClose={() => setSelectedPost(null)}
        onAddPhoto={(pandal) => {
          setSelectedPandalForUpload(pandal)
          setUploadVisible(true)
        }}
      />

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

      {/* ── LEADERBOARD MODAL (Translucent floating layer above landing map) ── */}
      {leaderboardModalVisible && (
        <div
          id="leaderboard-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeaderboardModalVisible(false)
          }}
          className="snap-modal-backdrop active fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
        >
          <div className="snap-modal-content w-full sm:max-w-md mx-auto bg-[#121224]/95 backdrop-blur-xl rounded-[24px] sm:rounded-[28px] border border-[#E9B83E]/30 p-5 sm:p-6 flex flex-col max-h-[90vh] overflow-y-auto hide-scrollbar shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_24px_rgba(233,184,62,0.15)] relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[#E9B83E]/20 mb-4 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full p-0.5 bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center overflow-hidden flex-shrink-0 shadow-[0_0_12px_rgba(233,184,62,0.4)]">
                  <svg className="w-4 h-4 text-[#211329]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1c1.8-.46 3.17-1.87 3.61-3.66C19.08 11.63 21 9.55 21 7V5c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-base leading-tight">Parikrama Leaderboard</h2>
                  <p className="text-[#E9B83E] text-[11px] font-medium">Top Devotees &amp; Pandal Explorers</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeaderboardModalVisible(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Top 3 Podium Highlights */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center text-center">
                <span className="text-xl mb-0.5">🥈</span>
                <span className="text-xs font-bold text-white truncate max-w-full">Ankita S.</span>
                <span className="text-[10px] text-white/50">15 Pandals</span>
                <span className="text-[11px] font-mono font-bold text-[#E9B83E] mt-1">810 pts</span>
              </div>
              <div className="p-2.5 rounded-2xl bg-gradient-to-b from-[#E9B83E]/20 to-[#211329]/80 border border-[#E9B83E]/50 flex flex-col items-center text-center shadow-[0_0_16px_rgba(233,184,62,0.2)]">
                <span className="text-2xl mb-0.5">👑</span>
                <span className="text-xs font-black text-[#F5E5B7] truncate max-w-full">Debasish R.</span>
                <span className="text-[10px] text-white/60">18 Pandals</span>
                <span className="text-xs font-mono font-black text-[#E9B83E] mt-1">940 pts</span>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center text-center">
                <span className="text-xl mb-0.5">🥉</span>
                <span className="text-xs font-bold text-white truncate max-w-full">Suman P.</span>
                <span className="text-[10px] text-white/50">13 Pandals</span>
                <span className="text-[11px] font-mono font-bold text-[#E9B83E] mt-1">720 pts</span>
              </div>
            </div>

            {/* Ranked List */}
            <div className="space-y-2 text-left max-h-56 overflow-y-auto pr-1">
              {[
                { rank: '4', name: 'Pooja Debbarma', area: 'College Tilla', pandals: 11, pts: '610 pts' },
                { rank: '5', name: 'Rohan Bhowmik', area: 'Banamalipur', pandals: 9, pts: '500 pts' },
                { rank: '6', name: 'Shreya Chakraborty', area: 'Ramnagar', pandals: 8, pts: '460 pts' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-[#E9B83E]/30 transition">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-white/10 text-white/70 font-bold text-xs flex items-center justify-center">{item.rank}</span>
                    <div>
                      <p className="text-xs font-bold text-white">{item.name}</p>
                      <p className="text-[10px] text-white/50">{item.pandals} pandals visited • {item.area}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#E9B83E]">{item.pts}</span>
                </div>
              ))}
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={() => {
                setLeaderboardModalVisible(false)
                setUploadVisible(true)
              }}
              className="mt-4 w-full py-3 rounded-2xl bg-gradient-to-r from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] text-[#211329] font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#E9B83E]/20 hover:scale-[1.01] active:scale-98 transition cursor-pointer"
            >
              <span>📸</span> Snap Pandal to Climb Rank
            </button>
          </div>
        </div>
      )}

      {/* ── DEVOTEE PROFILE MODAL (Translucent floating layer above landing map) ── */}
      {profileModalVisible && (
        <div
          id="profile-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileModalVisible(false)
          }}
          className="snap-modal-backdrop active fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
        >
          <div className="snap-modal-content w-full sm:max-w-md mx-auto bg-[#121224]/95 backdrop-blur-xl rounded-[24px] sm:rounded-[28px] border border-[#E9B83E]/30 p-5 sm:p-6 flex flex-col max-h-[90vh] overflow-y-auto hide-scrollbar shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_24px_rgba(233,184,62,0.15)] relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-[#E9B83E]/20 mb-4 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full p-0.5 bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center overflow-hidden flex-shrink-0 shadow-[0_0_12px_rgba(233,184,62,0.4)]">
                  <img src="/durga-emblem.png" alt="Devotee" className="w-full h-full rounded-full object-cover" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-base leading-tight">Devotee Profile</h2>
                  <p className="text-[#E9B83E] text-[11px] font-medium">Puja Journey &amp; Contributions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalVisible(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Devotee Identity Card */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0">
                  <img
                    src={user?.photoURL || '/durga-emblem.png'}
                    alt="Profile Avatar"
                    className="w-12 h-12 rounded-full border-2 border-[#E9B83E] object-cover shadow-md"
                  />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#121224] flex items-center justify-center text-[8px] text-white">✓</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-bold text-sm truncate">{user?.displayName || 'Guest Devotee'}</h3>
                  <p className="text-white/50 text-[11px] truncate">{user?.email || 'Signed In Explorer'}</p>
                  <span className="inline-flex items-center gap-1 text-[9px] text-[#E9B83E] bg-[#E9B83E]/10 border border-[#E9B83E]/30 px-2 py-0.5 rounded-full mt-1">
                    ✨ Agartala Puja Parikrama 2026
                  </span>
                </div>
              </div>
            </div>

            {/* Stats Grid (3 Tiles) */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center flex flex-col items-center">
                <span className="text-lg mb-1">🪔</span>
                <span className="text-xs font-semibold text-white/60">Pandals</span>
                <span className="text-base font-mono font-bold text-[#F5E5B7]">12</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center flex flex-col items-center">
                <span className="text-lg mb-1">📸</span>
                <span className="text-xs font-semibold text-white/60">Snaps</span>
                <span className="text-base font-mono font-bold text-[#E9B83E]">5</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center flex flex-col items-center">
                <span className="text-lg mb-1">🏆</span>
                <span className="text-xs font-semibold text-white/60">Rank</span>
                <span className="text-base font-mono font-bold text-amber-300">#7</span>
              </div>
            </div>

            {/* Puja Passport Badges */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 mb-4">
              <span className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-2">Puja Badges Unlocked</span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-xl bg-[#E9B83E]/15 border border-[#E9B83E]/30 text-[#F5E5B7] text-xs font-medium flex items-center gap-1">
                  🪔 Pandal Hopper
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-1">
                  📍 GPS Explorer
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-medium flex items-center gap-1">
                  🥁 Dhak Fan
                </span>
              </div>
            </div>

            {/* Auth Actions */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setProfileModalVisible(false)
                  setAuthModalVisible(true)
                }}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs flex items-center justify-center gap-2.5 shadow transition active:scale-98 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{user ? 'Manage Google Account' : 'Connect with Google'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href)
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 font-semibold text-xs flex items-center justify-center gap-2 border border-white/10 transition active:scale-98 cursor-pointer"
              >
                <span>🔗</span> Share Devotee Passport
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPLOAD MODAL ── */}
      <UploadModal
        visible={uploadVisible}
        currentUser={user}
        initialPandal={selectedPandalForUpload}
        onRequireAuth={() => setAuthModalVisible(true)}
        onClose={() => {
          setUploadVisible(false)
          setSelectedPandalForUpload('')
        }}
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
        .pandal-filter-active {
          background: linear-gradient(to right, #E9B83E, #f3cb69, #F5E5B7) !important;
          color: #211329 !important;
          border: 1px solid rgba(33, 19, 41, 0.3) !important;
          box-shadow: 0 0 16px rgba(233, 184, 62, 0.50), 0 2px 12px rgba(13, 12, 27, 0.45) !important;
        }
        .pandal-filter-active:hover {
          box-shadow: 0 0 20px rgba(233, 184, 62, 0.60) !important;
        }
        .pandal-filter-active span {
          color: #211329 !important;
          font-weight: 700 !important;
        }
        .pandal-filter-active svg {
          color: #211329 !important;
          stroke: #211329 !important;
        }
        .pandal-filter-inactive {
          background: rgba(33, 19, 41, 0.70) !important;
          border: 1px solid rgba(233, 184, 62, 0.40) !important;
          color: #F5E5B7 !important;
          box-shadow: 0 0 8px rgba(233, 184, 62, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.10) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
        }
        .pandal-filter-inactive:hover {
          background: rgba(33, 19, 41, 0.85) !important;
          border-color: #E9B83E !important;
          box-shadow: 0 0 12px rgba(233, 184, 62, 0.40) !important;
        }
        .pandal-filter-inactive span {
          color: #F5E5B7 !important;
          font-weight: 600 !important;
        }
        .pandal-filter-inactive svg {
          color: #E9B83E !important;
          stroke: #E9B83E !important;
        }
      `}</style>
    </div>
  )
}
