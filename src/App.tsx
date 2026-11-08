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

export const YOUTUBE_DURGA_TRACKS = [
  { id: 'SFJeglBF5cg', title: 'Dugga Elo', artist: 'Monali Thakur', durationSec: 146, cover: 'https://i.ytimg.com/vi/SFJeglBF5cg/hqdefault.jpg' },
  { id: 'LLer3VPOcxg', title: 'Dugga Ma Asche', artist: 'Infra', durationSec: 214, cover: 'https://i.ytimg.com/vi/LLer3VPOcxg/hqdefault.jpg' },
  { id: 'UCPKItLtvZw', title: 'Dugga Ma', artist: 'Arijit Singh', durationSec: 270, cover: 'https://i.ytimg.com/vi/UCPKItLtvZw/hqdefault.jpg' },
  { id: '3WJMdKoCp70', title: 'Ebar Jeno Onno Rokom Pujo', artist: 'SVF', durationSec: 219, cover: 'https://i.ytimg.com/vi/3WJMdKoCp70/hqdefault.jpg' },
  { id: 'XiAO-XjeHdI', title: 'Ashtami Te Tomar Paray', artist: 'Chirkut', durationSec: 234, cover: 'https://i.ytimg.com/vi/XiAO-XjeHdI/hqdefault.jpg' },
  { id: 'tRUAYLIEIbc', title: 'Dhaker Taley', artist: 'Abhijeet Bhattacharya', durationSec: 282, cover: 'https://i.ytimg.com/vi/tRUAYLIEIbc/hqdefault.jpg' },
  { id: 'p_hqO0sJh-I', title: 'Ailo Uma Barite', artist: 'Antara Nandy', durationSec: 232, cover: 'https://i.ytimg.com/vi/p_hqO0sJh-I/hqdefault.jpg' },
  { id: 'x_Nar1eYzBM', title: 'Uma Ashe Notun Saje', artist: 'Ankita Bhattacharyya', durationSec: 185, cover: 'https://i.ytimg.com/vi/x_Nar1eYzBM/hqdefault.jpg' },
  { id: '7uzjfZ423Kc', title: 'Dhak Baja Kashor Baja', artist: 'Shreya Ghoshal', durationSec: 265, cover: 'https://i.ytimg.com/vi/7uzjfZ423Kc/hqdefault.jpg' },
  { id: 'FH-p9rnBbU4', title: 'Abar Elo Maa', artist: 'Ankita Bhattacharyya', durationSec: 219, cover: 'https://i.ytimg.com/vi/FH-p9rnBbU4/hqdefault.jpg' },
  { id: 'OVIN6Iz687o', title: 'Jago Durga Dashapraharanadharinee', artist: 'Dwijen Mukherjee', durationSec: 107, cover: 'https://i.ytimg.com/vi/OVIN6Iz687o/hqdefault.jpg' },
  { id: '4ZWQYdzS_WY', title: 'Shubho Shubho', artist: 'Altamash Faridi, Amit Trivedi', durationSec: 175, cover: 'https://i.ytimg.com/vi/4ZWQYdzS_WY/hqdefault.jpg' },
  { id: 'Blh3d0RBV1M', title: 'Asadoma Sadgamayo', artist: 'Arijit Singh', durationSec: 317, cover: 'https://i.ytimg.com/vi/Blh3d0RBV1M/hqdefault.jpg' },
  { id: 'J8xdJtUK6PY', title: 'Maa Go Tumi Sarbojonin', artist: 'Shreya Ghoshal', durationSec: 207, cover: 'https://i.ytimg.com/vi/J8xdJtUK6PY/hqdefault.jpg' },
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [mediaSource, setMediaSource] = useState<'camera' | 'gallery'>('gallery')
  const [previews, setPreviews] = useState<string[]>([])
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
  const pandalContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (pandalContainerRef.current && !pandalContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const reset = () => {
    setSelectedFiles([])
    setPreviews([])
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

  const handleLocateMeInMiniMap = (e: React.MouseEvent) => {
    e.stopPropagation()
    const btn = document.getElementById('btn-mini-map-locate')
    btn?.classList.add('animate-pulse')

    const applyLoc = (loc: { lat: number; lng: number }) => {
      setCoords(loc)
      setLocationSource('live_gps')
      setSourceBadge({ text: '📡 Live Device GPS', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' })
      btn?.classList.remove('animate-pulse')
    }

    let existingLoc: { lat: number; lng: number } | null = null
    try {
      const saved = localStorage.getItem('parikrama_user_location')
      if (saved) existingLoc = JSON.parse(saved)
    } catch (err) {}

    if (existingLoc) {
      applyLoc(existingLoc)
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const freshLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          try {
            localStorage.setItem('parikrama_user_location', JSON.stringify(freshLoc))
          } catch (err) {}
          applyLoc(freshLoc)
        },
        (err) => {
          btn?.classList.remove('animate-pulse')
          console.warn('Geolocation error in mini map:', err)
        },
        { enableHighAccuracy: true, timeout: 6000 }
      )
    } else {
      btn?.classList.remove('animate-pulse')
    }
  }

  // Strategy 4 Waterfall: EXIF -> Live GPS -> City Center (Images only, Multiple Photos supported)
  const processFilesWaterfall = async (files: File[], source: 'camera' | 'gallery') => {
    const imageFiles = files.filter(f => f.type && f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      alert('⚠️ Only photos can be submitted for Durga Puja pandal moderation. Videos are not accepted by our AI review pipeline.')
      return
    }

    setSelectedFiles(imageFiles)
    setMediaSource(source)

    // Load previews for all files
    const loadedPreviews = await Promise.all(
      imageFiles.map(file => new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(file)
      }))
    )
    setPreviews(loadedPreviews)
    setStep('details')

    let detectedCoords: { lat: number; lng: number } | null = null
    let detectedSource: 'exif' | 'live_gps' | 'city_center' = 'live_gps'

    // Step 1: EXIF Metadata (try across uploaded photos)
    if (window.exifr) {
      for (const file of imageFiles) {
        try {
          const gps = await window.exifr.gps(file)
          if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number' && gps.latitude !== 0) {
            detectedCoords = { lat: gps.latitude, lng: gps.longitude }
            detectedSource = 'exif'
            break
          }
        } catch (e) {
          console.warn('EXIF extraction skipped:', e)
        }
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

  const isCustomPandal = useMemo(() => {
    const trimmed = pandalName.trim().toLowerCase()
    if (!trimmed) return false
    return !AGARTALA_MASTER_PANDALS.some(p => p.name.toLowerCase() === trimmed)
  }, [pandalName])

  const filteredPandals = useMemo(() => {
    const q = searchFilter.trim().toLowerCase()
    if (!q) return pandalsWithProximity
    return pandalsWithProximity.filter(p => 
      p.name.toLowerCase().includes(q) ||
      (p.neighborhood && p.neighborhood.toLowerCase().includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q)) ||
      'agartala'.includes(q) || q.includes('agartala') ||
      'tripura'.includes(q) || q.includes('tripura') ||
      (p.keywords && p.keywords.some(k => k.includes(q) || q.includes(k)))
    )
  }, [pandalsWithProximity, searchFilter])

  const filteredMapPandals = useMemo(() => {
    const q = mapSearchQuery.trim().toLowerCase()
    if (!q) return []
    const tokens = q.split(/\s+/).filter(Boolean)
    return AGARTALA_MASTER_PANDALS.filter(p => {
      const text = `${p.name} ${p.neighborhood || ''} ${p.city || ''} ${(p.keywords || []).join(' ')}`.toLowerCase()
      return tokens.every(t => text.includes(t))
    }).slice(0, 5)
  }, [mapSearchQuery])

  const isFormValid = useMemo(() => {
    const hasPhotos = selectedFiles.length > 0
    const hasName = pandalName.trim().length > 0
    const hasLocation = Boolean(coords && typeof coords.lat === 'number' && typeof coords.lng === 'number' && !isNaN(coords.lat) && !isNaN(coords.lng))
    return hasPhotos && hasName && hasLocation
  }, [selectedFiles, pandalName, coords])

  const handleSubmit = async () => {
    if (!isFormValid || submitting) return
    setSubmitting(true)
    const success = await onSubmit({
      selectedFile: selectedFiles[0],
      selectedFiles: selectedFiles,
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
                Share Pandal Photos
              </h2>
              <p className="text-[#E9B83E]/80 text-[10px] sm:text-[11px] font-medium leading-tight">
                Showcase your favourite pandals with the community
              </p>
            </div>
          </div>
          <button id="upload-back-btn" onClick={handleClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition active:scale-95 cursor-pointer text-xs">
            ✕
          </button>
        </div>

        {/* Hidden File Input (Multiple photos allowed) */}
        <input
          id="snap-file-input"
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            const files = Array.from(e.target.files || [])
            if (files.length > 0) processFilesWaterfall(files, 'gallery')
          }}
        />

        {/* Main Content (Non-scrollable, compact layout) */}
        <div className="space-y-2.5 sm:space-y-3 flex flex-col">
          {/* Media Preview Box (Tap to choose or change images) */}
          <div
            onClick={() => document.getElementById('snap-file-input')?.click()}
            className="w-full h-32 sm:h-36 rounded-xl border border-dashed border-[#E9B83E]/40 hover:border-[#E9B83E] bg-[#211329]/50 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer transition-all shadow-[0_4px_16px_rgba(13,12,27,0.5)]"
          >
            {previews.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center mb-3 shadow-md shadow-[#E9B83E]/30 group-hover:scale-105 transition-transform flex-shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#211329">
                    <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                    <circle cx="12" cy="13" r="3" fill="#211329"/>
                  </svg>
                </div>
                <p className="text-[#F5E5B7] font-semibold text-xs leading-tight">Upload Pandal Photos</p>
                <p className="text-[#E9B83E]/80 text-[10px] mt-1.5 leading-tight">Take a new photo or select photos from your gallery</p>
              </div>
            ) : previews.length === 1 ? (
              <img src={previews[0]} alt="preview" className="w-full h-full object-cover" />
            ) : previews.length === 2 ? (
              <div className="relative flex items-center justify-center w-full h-full p-2 overflow-hidden">
                {/* Back card */}
                <div className="absolute w-20 sm:w-24 h-26 sm:h-30 rounded-lg overflow-hidden shadow-xl border border-white/20 transform -rotate-6 -translate-x-2.5 transition-all duration-300 group-hover:-rotate-10 group-hover:-translate-x-4">
                  <img src={previews[0]} alt="pandal 1" className="w-full h-full object-cover" />
                </div>
                {/* Front card */}
                <div className="relative z-10 w-20 sm:w-24 h-26 sm:h-30 rounded-lg overflow-hidden shadow-2xl border-2 border-[#E9B83E]/70 transform rotate-3 translate-x-2.5 transition-all duration-300 group-hover:rotate-6 group-hover:translate-x-4">
                  <img src={previews[1]} alt="pandal 2" className="w-full h-full object-cover" />
                </div>
                {/* Photo count pill */}
                <div className="absolute bottom-2 right-2 bg-[#211329]/90 backdrop-blur-md border border-[#E9B83E]/50 px-2 py-0.5 rounded-full text-[9px] text-[#F5E5B7] font-bold shadow-md z-20 flex items-center gap-1">
                  <span>📸</span> 2 photos
                </div>
              </div>
            ) : (
              <div className="relative flex items-center justify-center w-full h-full p-2 overflow-hidden">
                {/* Bottom card */}
                <div className="absolute w-18 sm:w-22 h-24 sm:h-28 rounded-lg overflow-hidden shadow-lg border border-white/15 transform -rotate-10 -translate-x-4 scale-95 transition-all duration-300 group-hover:-rotate-14 group-hover:-translate-x-6">
                  <img src={previews[0]} alt="pandal 1" className="w-full h-full object-cover" />
                </div>
                {/* Middle card */}
                <div className="absolute w-19 sm:w-23 h-25 sm:h-29 rounded-lg overflow-hidden shadow-xl border border-white/25 transform rotate-6 translate-x-3 scale-[0.98] transition-all duration-300 group-hover:rotate-10 group-hover:translate-x-5">
                  <img src={previews[1]} alt="pandal 2" className="w-full h-full object-cover" />
                </div>
                {/* Top card */}
                <div className="relative z-10 w-20 sm:w-24 h-26 sm:h-30 rounded-lg overflow-hidden shadow-2xl border-2 border-[#E9B83E]/80 transform -rotate-1 transition-all duration-300 group-hover:scale-105">
                  <img src={previews[2]} alt="pandal 3" className="w-full h-full object-cover" />
                </div>
                {/* Photo count pill */}
                <div className="absolute bottom-2 right-2 bg-[#211329]/90 backdrop-blur-md border border-[#E9B83E]/50 px-2 py-0.5 rounded-full text-[9px] text-[#F5E5B7] font-bold shadow-md z-20 flex items-center gap-1">
                  <span>📸</span> {previews.length} photos
                </div>
              </div>
            )}
          </div>

          {/* Pandal Name & Dropdown (Styled like Search Bar & Landing Page Year) */}
          <div ref={pandalContainerRef} className="space-y-1.5 relative">
            <label className="block text-[11px] sm:text-xs font-semibold text-[#F5E5B7]">
              <span>Pandal Name</span>
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
                onFocus={() => {
                  setShowDropdown(true)
                  setSearchFilter('')
                }}
                onClick={() => {
                  setShowDropdown(true)
                }}
                onChange={e => {
                  setPandalName(e.target.value)
                  setSearchFilter(e.target.value)
                  setShowDropdown(true)
                }}
                placeholder="Select or enter pandal name..."
                className="w-full bg-transparent pl-2.5 pr-9 py-2 text-[#F5E5B7] font-normal placeholder:font-normal text-xs sm:text-[13px] placeholder-[#F5E5B7]/45 focus:placeholder-transparent focus:outline-none"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDropdown(!showDropdown)
                  setSearchFilter('')
                }}
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
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#211329]/95 border border-[#E9B83E]/35 rounded-2xl shadow-[0_12px_32px_rgba(13,12,27,0.85),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_12px_rgba(233,184,62,0.15)] backdrop-blur-2xl max-h-48 overflow-y-auto no-scrollbar p-1">
                <div className="px-3 py-1.5 text-[9px] font-bold text-[#E9B83E] uppercase tracking-wider flex items-center justify-between border-b border-[#E9B83E]/20 mb-0.5">
                  <span>Known Agartala Pandals</span>
                  <span>Distance</span>
                </div>
                <div>
                  {isCustomPandal && (
                    <div
                      onClick={() => {
                        setSearchFilter('')
                        setShowDropdown(false)
                        setLocationSource('custom')
                        setSourceBadge({ text: '📍 Custom Location', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' })
                      }}
                      className="px-3.5 py-2.5 text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer text-[#E9B83E] hover:bg-[#E9B83E]/20 bg-[#E9B83E]/10 border-b border-[#E9B83E]/30 first:rounded-t-xl"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold">➕</span>
                        <div className="truncate">
                          <span className="text-xs font-bold block truncate">Add "{pandalName.trim()}" as new pandal</span>
                          <span className="text-[9px] text-[#F5E5B7]/70 block">Custom puja location</span>
                        </div>
                      </div>
                      <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#E9B83E]/20 text-[#E9B83E] border border-[#E9B83E]/40">
                        New
                      </span>
                    </div>
                  )}
                  {filteredPandals.map(p => {
                    const isSelected = pandalName.trim().toLowerCase() === p.name.toLowerCase();
                    return (
                      <div
                        key={p.name}
                        onClick={() => {
                          setPandalName(p.name)
                          setSearchFilter('')
                          setNeighborhood(p.neighborhood || 'Agartala')
                          setCoords({ lat: p.lat, lng: p.lng })
                          setLocationSource('custom')
                          setSourceBadge({ text: '🏛️ Pandal Coordinates', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' })
                          setShowDropdown(false)
                        }}
                        className={`px-3.5 py-2.5 text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer border-b border-[#E9B83E]/20 last:border-b-0 first:rounded-t-xl last:rounded-b-xl ${
                          isSelected
                            ? 'bg-[#E9B83E]/20 text-[#E9B83E] font-bold'
                            : 'text-[#F5E5B7]/90 hover:bg-[#E9B83E]/15 hover:text-[#E9B83E]'
                        }`}
                      >
                        <div className="truncate min-w-0">
                          <span className="text-xs font-bold block truncate leading-tight">{p.name}</span>
                          <span className="text-[9px] text-[#F5E5B7]/70 truncate mt-0.5 block">{p.neighborhood || 'Agartala'}, Agartala</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-[10px] font-semibold text-[#E9B83E] whitespace-nowrap">
                            {p.distText}
                          </span>
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
              <span>Pandal Location</span>
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
                <div className="relative flex items-center rounded-full bg-[#121224]/85 hover:bg-[#121224]/95 focus-within:bg-[#121224] backdrop-blur-md border border-[#E9B83E]/45 focus-within:border-[#E9B83E] shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition">
                  <svg className="w-3.5 h-3.5 text-[#E9B83E] flex-shrink-0 ml-3 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <input 
                    type="text" 
                    value={mapSearchQuery}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={e => { setMapSearchQuery(e.target.value); setShowMapSearch(true); }}
                    onFocus={() => setShowMapSearch(true)}
                    placeholder="Search for a location or pandal..."
                    className="w-full bg-transparent pl-2.5 pr-8 py-1.5 text-[11px] text-[#F5E5B7] placeholder-[#F5E5B7]/40 outline-none"
                  />
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
                {showMapSearch && mapSearchQuery.trim() && filteredMapPandals.length === 0 && (
                  <div className="mt-1 bg-[#121224]/95 backdrop-blur-xl border border-[#E9B83E]/40 rounded-xl shadow-2xl p-2.5 text-center text-xs text-[#F5E5B7]/60">
                    No pandals found for "{mapSearchQuery.trim()}"
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

              {/* Locate Me Button in bottom right corner */}
              <button
                type="button"
                id="btn-mini-map-locate"
                onClick={handleLocateMeInMiniMap}
                title="Locate My Position"
                aria-label="Locate My Position"
                style={{ touchAction: 'manipulation' }}
                className="absolute bottom-2.5 right-2.5 z-20 w-8 h-8 sm:w-8.5 sm:h-8.5 rounded-full bg-[#211329]/80 hover:bg-[#211329] border border-[#E9B83E]/45 hover:border-[#E9B83E] text-[#E9B83E] hover:text-[#F5E5B7] flex items-center justify-center shadow-[0_4px_16px_rgba(13,12,27,0.5),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_8px_rgba(233,184,62,0.22)] hover:shadow-[0_0_12px_rgba(233,184,62,0.40)] backdrop-blur-md transition-all active:scale-90 hover:scale-[1.05] pointer-events-auto cursor-pointer"
              >
                <svg className="pointer-events-none w-4 h-4 text-[#E9B83E] hover:text-[#F5E5B7] transition-colors" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Submit button (Add snap yellow colors, border, text: Submit) */}
          <div className="pt-0.5">
            <button
              id="submit-snap-btn"
              onClick={handleSubmit}
              disabled={!isFormValid || submitting}
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
  const [leaderboardTab, setLeaderboardTab] = useState<'this_puja' | 'all_time' | 'friends'>('this_puja')
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [topSearchQuery, setTopSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [showTopSearchDropdown, setShowTopSearchDropdown] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const topSearchContainerRef = useRef<HTMLDivElement>(null)
  const [activeFilter, setActiveFilter] = useState<'latest' | 'trending' | 'nearby' | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false)
  const yearDropdownRef = useRef<HTMLDivElement>(null)

  // YouTube Music Player State & Refs
  const YOUTUBE_PLAYLIST_ID = 'PLBFyKHpeq9js'
  const ytPlayerRef = useRef<any>(null)
  const ytPlayerReady = useRef(false)
  const userExplicitlyPaused = useRef(false)
  const keepPausedOnTrackChange = useRef(false)
  const autoPlayStarted = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const isMutedRef = useRef(false)
  const userInteracted = useRef(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const currentTrackIndexRef = useRef(0)
  const [trackTitle, setTrackTitle] = useState(YOUTUBE_DURGA_TRACKS[0].title)
  const [trackArtist, setTrackArtist] = useState(YOUTUBE_DURGA_TRACKS[0].artist)
  const [trackCover, setTrackCover] = useState(YOUTUBE_DURGA_TRACKS[0].cover)
  const [currentTimeSec, setCurrentTimeSec] = useState(0)
  const [totalDurationSec, setTotalDurationSec] = useState(YOUTUBE_DURGA_TRACKS[0].durationSec)
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
        if (typeof ytPlayerRef.current.playVideoAt === 'function' && !autoPlayStarted.current && currentTrackIndexRef.current !== 0) {
          ytPlayerRef.current.playVideoAt(currentTrackIndexRef.current)
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

  const changeTrack = useCallback((index: number, shouldPlay: boolean) => {
    const safeIdx = ((index % YOUTUBE_DURGA_TRACKS.length) + YOUTUBE_DURGA_TRACKS.length) % YOUTUBE_DURGA_TRACKS.length
    currentTrackIndexRef.current = safeIdx
    setCurrentTrackIndex(safeIdx)

    const track = YOUTUBE_DURGA_TRACKS[safeIdx]
    setTrackTitle(track.title)
    setTrackArtist(track.artist)
    setTrackCover(track.cover)
    setTotalDurationSec(track.durationSec)
    setCurrentTimeSec(0)

    if (shouldPlay) {
      keepPausedOnTrackChange.current = false
      userExplicitlyPaused.current = false
      setIsPlaying(true)
      if (ytPlayerRef.current && ytPlayerReady.current) {
        try {
          if (!isMutedRef.current) {
            ytPlayerRef.current.unMute()
            ytPlayerRef.current.setVolume(100)
          } else {
            ytPlayerRef.current.mute()
          }
          if (typeof ytPlayerRef.current.playVideoAt === 'function') {
            ytPlayerRef.current.playVideoAt(safeIdx)
          }
        } catch (e) {}
      }
    } else {
      keepPausedOnTrackChange.current = true
      userExplicitlyPaused.current = true
      setIsPlaying(false)
      if (ytPlayerRef.current && ytPlayerReady.current) {
        try {
          ytPlayerRef.current.mute()
          if (typeof ytPlayerRef.current.playVideoAt === 'function') {
            ytPlayerRef.current.playVideoAt(safeIdx)
          }
        } catch (e) {}
      }
    }
  }, [])

  const updateYTTrackInfo = useCallback(() => {
    if (keepPausedOnTrackChange.current) return
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
                if (currentTrackIndexRef.current !== 0 && typeof event.target.playVideoAt === 'function') {
                  event.target.playVideoAt(currentTrackIndexRef.current)
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

    const handleYTStateChange = (state: number) => {
      const YT = (window as any).YT
      if (!YT) return

      if (keepPausedOnTrackChange.current) {
        if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.PLAYING || state === YT.PlayerState.CUED) {
          try {
            ytPlayerRef.current?.pauseVideo()
            ytPlayerRef.current?.seekTo(0, true)
          } catch(e) {}
          if (!isMutedRef.current && ytPlayerRef.current) {
            try {
              ytPlayerRef.current.unMute()
              ytPlayerRef.current.setVolume(100)
            } catch(e) {}
          }
          setIsPlaying(false)
          setCurrentTimeSec(0)
          if (state === YT.PlayerState.PAUSED) {
            keepPausedOnTrackChange.current = false
          }
          return
        }
        if (state === YT.PlayerState.PAUSED) {
          keepPausedOnTrackChange.current = false
          setIsPlaying(false)
          return
        }
      }

      if (state === YT.PlayerState.PLAYING) {
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
        if (typeof ytPlayerRef.current?.getPlaylistIndex === 'function') {
          const pIdx = ytPlayerRef.current.getPlaylistIndex()
          if (typeof pIdx === 'number' && pIdx >= 0 && pIdx < YOUTUBE_DURGA_TRACKS.length && pIdx !== currentTrackIndexRef.current) {
            currentTrackIndexRef.current = pIdx
            setCurrentTrackIndex(pIdx)
            const t = YOUTUBE_DURGA_TRACKS[pIdx]
            setTrackTitle(t.title)
            setTrackArtist(t.artist)
            setTrackCover(t.cover)
            setTotalDurationSec(t.durationSec)
          }
        }
        updateYTTrackInfo()
      } else if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
        setIsPlaying(false)
      } else if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.CUED) {
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
  }, [updateYTTrackInfo])

  useEffect(() => {
    document.title = 'Puja Parikrama'
  }, [])

  // Close year & search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setYearDropdownOpen(false)
      }
      if (topSearchContainerRef.current && !topSearchContainerRef.current.contains(e.target as Node)) {
        setShowTopSearchDropdown(false)
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
        keepPausedOnTrackChange.current = false
        ytPlayerRef.current.pauseVideo()
        setIsPlaying(false)
      } else {
        userExplicitlyPaused.current = false
        keepPausedOnTrackChange.current = false
        try {
          if (!isMutedRef.current) {
            ytPlayerRef.current.unMute()
            ytPlayerRef.current.setVolume(100)
          } else {
            ytPlayerRef.current.mute()
          }
        } catch(e) {}
        const pIdx = typeof ytPlayerRef.current.getPlaylistIndex === 'function' ? ytPlayerRef.current.getPlaylistIndex() : -1
        if (pIdx >= 0 && pIdx !== currentTrackIndexRef.current) {
          ytPlayerRef.current.playVideoAt(currentTrackIndexRef.current)
        } else if (pIdx === -1 && currentTrackIndexRef.current > 0) {
          ytPlayerRef.current.playVideoAt(currentTrackIndexRef.current)
        } else {
          ytPlayerRef.current.playVideo()
        }
        setIsPlaying(true)
      }
    } else {
      setIsPlaying(p => {
        const next = !p
        if (!next) {
          userExplicitlyPaused.current = true
          keepPausedOnTrackChange.current = false
          dhakEngineRef.current?.stop()
        } else {
          userExplicitlyPaused.current = false
          keepPausedOnTrackChange.current = false
          dhakEngineRef.current?.play()
        }
        return next
      })
    }
  }, [])

  const handleNextTrack = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const currentState = (ytPlayerRef.current && ytPlayerReady.current && typeof ytPlayerRef.current.getPlayerState === 'function')
      ? ytPlayerRef.current.getPlayerState()
      : -1
    const isCurrentlyPlaying = isPlaying || currentState === 1 // YT.PlayerState.PLAYING
    changeTrack(currentTrackIndexRef.current + 1, isCurrentlyPlaying)
  }, [isPlaying, changeTrack])

  const handlePrevTrack = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const currentState = (ytPlayerRef.current && ytPlayerReady.current && typeof ytPlayerRef.current.getPlayerState === 'function')
      ? ytPlayerRef.current.getPlayerState()
      : -1
    const isCurrentlyPlaying = isPlaying || currentState === 1 // YT.PlayerState.PLAYING
    changeTrack(currentTrackIndexRef.current - 1, isCurrentlyPlaying)
  }, [isPlaying, changeTrack])

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
    const tokens = q.split(/\s+/).filter(Boolean)
    return AGARTALA_MASTER_PANDALS.filter(p => {
      const text = `${p.name} ${p.neighborhood || ''} ${p.city || ''} ${(p.keywords || []).join(' ')}`.toLowerCase()
      return tokens.every(token => text.includes(token))
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
    const offsetY = -18 // Shifted up by 3px further (total -18px) per user request

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

      {/* Man's Camera Lens Flash Strobe & Flare (Dynamically positioned right on the man's smartphone, projecting purely upwards) */}
      {showSplash && cameraFlashing && (
        <div
          id="camera-lens-flash"
          style={{ left: `${phonePos.x}px`, top: `${phonePos.y}px`, width: 0, height: 0 }}
          className="fixed pointer-events-none z-[10001]"
        >
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[480px] sm:w-[720px] h-[340px] sm:h-[500px] overflow-hidden pointer-events-none flex flex-col justify-end items-center">
            {/* Upward Volumetric Light Beam Cone */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[340px] sm:w-[540px] h-[300px] sm:h-[450px]"
              style={{
                background: 'radial-gradient(ellipse at 50% 100%, rgba(255,255,255,0.95) 0%, rgba(255,248,220,0.7) 25%, rgba(255,235,170,0.3) 50%, rgba(255,255,255,0.08) 70%, transparent 85%)',
                clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
              }}
            />
            {/* Upward Vertical Flare Streak */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[260px] sm:h-[420px] w-[2.5px] sm:w-[3px] bg-gradient-to-t from-white via-white/80 to-transparent blur-[0.5px]" />
            {/* Upward Diagonal Flare Rays (Fanning up-left & up-right) */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom -rotate-[28deg] h-[220px] sm:h-[350px] w-[2px] bg-gradient-to-t from-white/90 via-white/40 to-transparent blur-[0.5px]" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom rotate-[28deg] h-[220px] sm:h-[350px] w-[2px] bg-gradient-to-t from-white/90 via-white/40 to-transparent blur-[0.5px]" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom -rotate-[54deg] h-[180px] sm:h-[280px] w-[1.5px] bg-gradient-to-t from-white/70 via-white/20 to-transparent blur-[0.5px]" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 origin-bottom rotate-[54deg] h-[180px] sm:h-[280px] w-[1.5px] bg-gradient-to-t from-white/70 via-white/20 to-transparent blur-[0.5px]" />
            {/* Horizontal Phone-Top Glint Streak */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[680px] h-[3px] bg-gradient-to-r from-transparent via-white to-transparent blur-[0.5px]" />
            {/* Central Super-Bright White-Hot Core Dome (Upward glow only) */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-7 sm:w-18 sm:h-9 bg-white"
              style={{
                borderTopLeftRadius: '9999px',
                borderTopRightRadius: '9999px',
                boxShadow: '0 -15px 45px 25px rgba(255,255,255,1), 0 -35px 90px 50px rgba(255,245,210,0.95), 0 -70px 150px 75px rgba(255,230,160,0.6)',
              }}
            />
          </div>
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
            <div
              id="btn-header-home"
              onClick={() => window.location.reload()}
              title="Reload Page"
              className="relative flex items-center gap-1 sm:gap-1.5 min-w-0 z-10 flex-shrink-0 pr-1 sm:pr-2 cursor-pointer hover:opacity-85 active:scale-95 transition-all select-none"
            >
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
            <div ref={topSearchContainerRef} className="absolute left-1/2 -translate-x-1/2 w-[calc(100%-360px)] min-w-[140px] max-w-xs sm:max-w-sm md:max-w-md z-20 pointer-events-auto">
              <div className="relative flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={topSearchQuery}
                  onChange={e => {
                    setTopSearchQuery(e.target.value)
                    setShowTopSearchDropdown(true)
                  }}
                  onFocus={() => {
                    setIsSearchFocused(true)
                    if (topSearchQuery.trim()) setShowTopSearchDropdown(true)
                  }}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder={isSearchFocused ? '' : 'Search for a location or pandal...'}
                  className="w-full bg-[#0D0C1B]/60 hover:bg-[#0D0C1B]/80 focus:bg-[#0D0C1B]/95 border border-[#E9B83E]/35 hover:border-[#E9B83E]/60 focus:border-[#E9B83E] rounded-full pl-3 sm:pl-3.5 pr-8 py-1 h-7 sm:h-7.5 text-[11px] sm:text-xs text-[#F5E5B7] placeholder-[#F5E5B7]/45 focus:placeholder-transparent backdrop-blur-md shadow-inner outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    searchInputRef.current?.focus()
                    if (topSearchQuery.trim()) setShowTopSearchDropdown(true)
                  }}
                  className="absolute right-2.5 text-[#E9B83E] hover:text-[#F5E5B7]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>

              {/* Search Autocomplete Dropdown (Starts just below search bar) */}
              {showTopSearchDropdown && topSearchResults.length > 0 && (
                <div className="absolute top-full mt-1.5 left-0 right-0 bg-[#211329]/95 border border-[#E9B83E]/35 rounded-2xl p-1 shadow-[0_12px_32px_rgba(13,12,27,0.75),inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-xl z-50 max-h-60 overflow-y-auto">
                  {topSearchResults.map(pandal => (
                    <div
                      key={pandal.name}
                      onClick={() => {
                        googleMapRef.current?.panTo({ lat: pandal.lat, lng: pandal.lng })
                        googleMapRef.current?.setZoom(16)
                        setTopSearchQuery(pandal.name)
                        setShowTopSearchDropdown(false)
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
              {showTopSearchDropdown && topSearchQuery.trim() && topSearchResults.length === 0 && (
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
                  <div className="absolute top-full mt-1.5 left-0 right-0 w-full bg-[#211329]/95 border border-[#E9B83E]/30 rounded-xl p-1 shadow-[0_12px_32px_rgba(13,12,27,0.75),inset_0_1px_1px_rgba(255,255,255,0.12)] backdrop-blur-xl z-50 flex flex-col animate-in fade-in zoom-in-95 duration-150">
                    {[2026, 2025].map(year => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setSelectedYear(year)
                          setYearDropdownOpen(false)
                        }}
                        className={`py-2 text-center justify-center text-xs font-semibold flex items-center transition cursor-pointer border-b border-[#E9B83E]/20 last:border-b-0 first:rounded-t-lg last:rounded-b-lg ${
                          selectedYear === year
                            ? 'bg-[#E9B83E]/15 text-[#E9B83E] font-bold'
                            : 'text-[#F5E5B7]/80 hover:bg-[#E9B83E]/15 hover:text-[#E9B83E]'
                        }`}
                      >
                        <span className="w-full text-center">{year}</span>
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

      {/* ── 5. FOOTER ATTRIBUTION (Extreme Right Bottom Corner) ── */}
      {mapReady && (
        <div
          id="footer-attribution"
          className="fixed bottom-1.5 right-2.5 sm:bottom-2 sm:right-3.5 z-20 pointer-events-none select-none text-[11px] sm:text-xs font-normal text-[#8D8E97] tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
        >
          Crafted with <span className="inline-block mx-0.5">❤️</span> by Gairik.
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

      {/* ── COMMUNITY LEADERBOARD MODAL ── */}
      {leaderboardModalVisible && (
        <div
          id="leaderboard-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeaderboardModalVisible(false)
          }}
          className="snap-modal-backdrop active fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-2.5 sm:p-4"
        >
          <div className="snap-modal-content w-full sm:max-w-md mx-auto bg-[#211329]/50 backdrop-blur-2xl rounded-[22px] sm:rounded-[26px] border border-[#E9B83E]/40 p-4 sm:p-5 flex flex-col shadow-[0_24px_60px_rgba(13,12,27,0.7),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_24px_rgba(233,184,62,0.18)] max-h-[90vh] overflow-y-auto hide-scrollbar relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E9B83E]/20 mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full p-0.5 bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center overflow-hidden flex-shrink-0 aspect-square shadow-[0_0_8px_rgba(233,184,62,0.35)]">
                  <img src="/durga-emblem.png?v=c2" alt="Puja Parikrama" className="w-full h-full rounded-full object-contain object-center" />
                </div>
                <div>
                  <h2 className="text-[#F5E5B7] font-bold text-sm sm:text-base leading-tight">
                    Community Leaderboard
                  </h2>
                  <p className="text-[#E9B83E]/80 text-[10px] sm:text-[11px] font-medium leading-tight">
                    Top contributors to Puja Porikroma
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeaderboardModalVisible(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition active:scale-95 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Top 3 Podium Area */}
            <div className="pt-2 pb-1 px-1">
              <div className="grid grid-cols-3 gap-2 items-end">
                {/* 2nd Place: Moumita D. */}
                <div className="flex flex-col items-center">
                  <div className="relative mb-1 flex flex-col items-center">
                    {/* Silver Laurel Wreath SVG */}
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
                      <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] text-slate-300/80 pointer-events-none drop-shadow" viewBox="0 0 100 100" fill="none">
                        <path d="M 28 80 C 12 58 14 34 32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 22 70 C 14 68 12 60 18 56 C 22 62 23 66 22 70 Z" fill="currentColor" />
                        <path d="M 17 56 C 9 52 10 44 17 42 C 19 48 19 52 17 56 Z" fill="currentColor" />
                        <path d="M 16 42 C 10 36 13 28 20 28 C 21 34 19 38 16 42 Z" fill="currentColor" />
                        <path d="M 22 28 C 18 20 25 14 31 16 C 30 22 27 26 22 28 Z" fill="currentColor" />
                        <path d="M 32 18 C 30 10 39 8 43 13 C 40 18 36 19 32 18 Z" fill="currentColor" />
                        <path d="M 72 80 C 88 58 86 34 68 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 78 70 C 86 68 88 60 82 56 C 78 62 77 66 78 70 Z" fill="currentColor" />
                        <path d="M 83 56 C 91 52 90 44 83 42 C 81 48 81 52 83 56 Z" fill="currentColor" />
                        <path d="M 84 42 C 90 36 87 28 80 28 C 79 34 81 38 84 42 Z" fill="currentColor" />
                        <path d="M 78 28 C 82 20 75 14 69 16 C 70 22 73 26 78 28 Z" fill="currentColor" />
                        <path d="M 68 18 C 70 10 61 8 57 13 C 60 18 64 19 68 18 Z" fill="currentColor" />
                      </svg>
                      <img
                        src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
                        alt="Moumita D."
                        className="w-12 h-12 sm:w-13 sm:h-13 rounded-full object-cover border-2 border-slate-300 shadow-[0_0_12px_rgba(200,215,240,0.4)]"
                      />
                    </div>
                    {/* Rank Badge */}
                    <div className="w-5 h-5 rounded-full bg-[#3d384d] border border-slate-300 text-slate-100 font-bold text-[10px] flex items-center justify-center -mt-2.5 z-10 shadow">
                      2
                    </div>
                  </div>
                  {/* Step Pedestal */}
                  <div className="w-full bg-[#261533]/80 border-t border-x border-slate-400/40 rounded-t-xl pt-2 pb-2.5 px-1 text-center shadow-[0_0_12px_rgba(180,195,220,0.12)]">
                    <p className="text-white font-bold text-[11px] sm:text-xs truncate">Moumita D.</p>
                    <p className="text-slate-300 text-[9px] sm:text-[10px] flex items-center justify-center gap-0.5 mt-0.5">
                      <span>🖼️</span> <span>247 photos</span>
                    </p>
                  </div>
                </div>

                {/* 1st Place: Arindam S. (Taller & Glowing Gold) */}
                <div className="flex flex-col items-center">
                  <div className="relative mb-1 flex flex-col items-center">
                    {/* Golden Laurel Wreath SVG */}
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
                      <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] text-[#E9B83E] pointer-events-none drop-shadow-[0_0_10px_rgba(233,184,62,0.7)]" viewBox="0 0 100 100" fill="none">
                        <path d="M 28 80 C 12 58 14 34 32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 22 70 C 14 68 12 60 18 56 C 22 62 23 66 22 70 Z" fill="currentColor" />
                        <path d="M 17 56 C 9 52 10 44 17 42 C 19 48 19 52 17 56 Z" fill="currentColor" />
                        <path d="M 16 42 C 10 36 13 28 20 28 C 21 34 19 38 16 42 Z" fill="currentColor" />
                        <path d="M 22 28 C 18 20 25 14 31 16 C 30 22 27 26 22 28 Z" fill="currentColor" />
                        <path d="M 32 18 C 30 10 39 8 43 13 C 40 18 36 19 32 18 Z" fill="currentColor" />
                        <path d="M 72 80 C 88 58 86 34 68 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 78 70 C 86 68 88 60 82 56 C 78 62 77 66 78 70 Z" fill="currentColor" />
                        <path d="M 83 56 C 91 52 90 44 83 42 C 81 48 81 52 83 56 Z" fill="currentColor" />
                        <path d="M 84 42 C 90 36 87 28 80 28 C 79 34 81 38 84 42 Z" fill="currentColor" />
                        <path d="M 78 28 C 82 20 75 14 69 16 C 70 22 73 26 78 28 Z" fill="currentColor" />
                        <path d="M 68 18 C 70 10 61 8 57 13 C 60 18 64 19 68 18 Z" fill="currentColor" />
                      </svg>
                      <img
                        src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
                        alt="Arindam S."
                        className="w-12 h-12 sm:w-13 sm:h-13 rounded-full object-cover border-2 border-[#E9B83E] shadow-[0_0_16px_rgba(233,184,62,0.7)]"
                      />
                    </div>
                    {/* Rank Badge */}
                    <div className="w-5 h-5 rounded-full bg-[#E9B83E] text-[#211329] font-black text-xs flex items-center justify-center -mt-2.5 z-10 shadow-[0_0_8px_rgba(233,184,62,0.7)]">
                      1
                    </div>
                  </div>
                  {/* Step Pedestal */}
                  <div className="w-full bg-gradient-to-b from-[#E9B83E]/30 via-[#2d1839]/95 to-[#211329] border-t-2 border-x border-[#E9B83E]/70 rounded-t-xl pt-2 pb-3 px-1 text-center shadow-[0_0_20px_rgba(233,184,62,0.25)]">
                    <p className="text-[#F5E5B7] font-black text-xs sm:text-sm truncate">Arindam S.</p>
                    <p className="text-[#E9B83E] text-[10px] sm:text-[11px] font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      <span>🖼️</span> <span>328 photos</span>
                    </p>
                  </div>
                </div>

                {/* 3rd Place: Sourav K. */}
                <div className="flex flex-col items-center">
                  <div className="relative mb-1 flex flex-col items-center">
                    {/* Bronze Laurel Wreath SVG */}
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center">
                      <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] text-amber-500/80 pointer-events-none drop-shadow" viewBox="0 0 100 100" fill="none">
                        <path d="M 28 80 C 12 58 14 34 32 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 22 70 C 14 68 12 60 18 56 C 22 62 23 66 22 70 Z" fill="currentColor" />
                        <path d="M 17 56 C 9 52 10 44 17 42 C 19 48 19 52 17 56 Z" fill="currentColor" />
                        <path d="M 16 42 C 10 36 13 28 20 28 C 21 34 19 38 16 42 Z" fill="currentColor" />
                        <path d="M 22 28 C 18 20 25 14 31 16 C 30 22 27 26 22 28 Z" fill="currentColor" />
                        <path d="M 32 18 C 30 10 39 8 43 13 C 40 18 36 19 32 18 Z" fill="currentColor" />
                        <path d="M 72 80 C 88 58 86 34 68 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        <path d="M 78 70 C 86 68 88 60 82 56 C 78 62 77 66 78 70 Z" fill="currentColor" />
                        <path d="M 83 56 C 91 52 90 44 83 42 C 81 48 81 52 83 56 Z" fill="currentColor" />
                        <path d="M 84 42 C 90 36 87 28 80 28 C 79 34 81 38 84 42 Z" fill="currentColor" />
                        <path d="M 78 28 C 82 20 75 14 69 16 C 70 22 73 26 78 28 Z" fill="currentColor" />
                        <path d="M 68 18 C 70 10 61 8 57 13 C 60 18 64 19 68 18 Z" fill="currentColor" />
                      </svg>
                      <img
                        src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
                        alt="Sourav K."
                        className="w-12 h-12 sm:w-13 sm:h-13 rounded-full object-cover border-2 border-amber-600 shadow-[0_0_12px_rgba(217,119,6,0.4)]"
                      />
                    </div>
                    {/* Rank Badge */}
                    <div className="w-5 h-5 rounded-full bg-[#3b2b24] border border-amber-600 text-amber-200 font-bold text-[10px] flex items-center justify-center -mt-2.5 z-10 shadow">
                      3
                    </div>
                  </div>
                  {/* Step Pedestal */}
                  <div className="w-full bg-[#261533]/80 border-t border-x border-amber-600/40 rounded-t-xl pt-2 pb-2 px-1 text-center shadow-[0_0_12px_rgba(217,119,6,0.12)]">
                    <p className="text-white font-bold text-[11px] sm:text-xs truncate">Sourav K.</p>
                    <p className="text-amber-200/80 text-[9px] sm:text-[10px] flex items-center justify-center gap-0.5 mt-0.5">
                      <span>🖼️</span> <span>196 photos</span>
                    </p>
                  </div>
                </div>
              </div>
              {/* Podium Base Accent */}
              <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-transparent via-[#E9B83E]/40 to-transparent shadow-[0_0_12px_rgba(233,184,62,0.3)] mb-3" />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setLeaderboardTab('this_puja')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                  leaderboardTab === 'this_puja'
                    ? 'border border-[#E9B83E] bg-[#E9B83E]/15 text-[#F5E5B7] shadow-[0_0_12px_rgba(233,184,62,0.25)]'
                    : 'text-white/60 hover:text-white border border-transparent'
                }`}
              >
                <span>🪔</span> This Puja
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab('all_time')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  leaderboardTab === 'all_time'
                    ? 'border border-[#E9B83E] bg-[#E9B83E]/15 text-[#F5E5B7] shadow-[0_0_12px_rgba(233,184,62,0.25)]'
                    : 'text-white/60 hover:text-white border border-transparent'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
                </svg>
                All Time
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab('friends')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                  leaderboardTab === 'friends'
                    ? 'border border-[#E9B83E] bg-[#E9B83E]/15 text-[#F5E5B7] shadow-[0_0_12px_rgba(233,184,62,0.25)]'
                    : 'text-white/60 hover:text-white border border-transparent'
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
                Friends
              </button>
            </div>

            {/* Ranked List (#4 to #8) */}
            <div className="bg-[#211329]/70 border border-[#E9B83E]/25 rounded-2xl p-1 sm:p-1.5 divide-y divide-[#E9B83E]/15 mb-3 shadow-inner">
              {[
                { rank: '4', name: 'Anwesha R.', photos: '182 photos', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80' },
                { rank: '5', name: 'Ritam G.', photos: '160 photos', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80' },
                { rank: '6', name: 'Debolina M.', photos: '149 photos', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80' },
                { rank: '7', name: 'Subhojit P.', photos: '141 photos', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80' },
                { rank: '8', name: 'Ishita B.', photos: '128 photos', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=120&q=80' },
              ].map((item) => (
                <div key={item.rank} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl transition">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#211329] border border-[#E9B83E]/30 text-[#F5E5B7] font-bold text-xs flex items-center justify-center flex-shrink-0">
                      {item.rank}
                    </span>
                    <img src={item.avatar} alt={item.name} className="w-8 h-8 rounded-full object-cover border border-[#E9B83E]/40 flex-shrink-0" />
                    <span className="text-white font-medium text-xs">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#F5E5B7]/80 text-xs font-medium">
                    <span>🖼️</span> <span>{item.photos}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom CTA Banner */}
            <button
              type="button"
              onClick={() => {
                setLeaderboardModalVisible(false)
                setUploadVisible(true)
              }}
              className="w-full p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] text-[#211329] flex items-center justify-between shadow-[0_4px_16px_rgba(233,184,62,0.35)] hover:shadow-[0_0_20px_rgba(233,184,62,0.5)] hover:scale-[1.01] active:scale-98 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#211329]/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#211329]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-bold text-xs sm:text-sm text-[#211329] leading-tight">Share Pandal Photos</p>
                  <p className="text-[10px] sm:text-[11px] text-[#211329]/80 font-medium leading-tight mt-0.5">Contribute photos and climb the leaderboard!</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-[#211329] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── MY PROFILE MODAL ── */}
      {profileModalVisible && (
        <div
          id="profile-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileModalVisible(false)
          }}
          className="snap-modal-backdrop active fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-2.5 sm:p-4"
        >
          <div className="snap-modal-content w-full sm:max-w-md mx-auto bg-[#211329]/50 backdrop-blur-2xl rounded-[22px] sm:rounded-[26px] border border-[#E9B83E]/40 p-4 sm:p-5 flex flex-col shadow-[0_24px_60px_rgba(13,12,27,0.7),inset_0_1px_1px_rgba(255,255,255,0.12),0_0_24px_rgba(233,184,62,0.18)] max-h-[90vh] overflow-y-auto hide-scrollbar relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#E9B83E]/20 mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full p-0.5 bg-gradient-to-tr from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] flex items-center justify-center overflow-hidden flex-shrink-0 aspect-square shadow-[0_0_8px_rgba(233,184,62,0.35)]">
                  <img src="/durga-emblem.png?v=c2" alt="Puja Parikrama" className="w-full h-full rounded-full object-contain object-center" />
                </div>
                <div>
                  <h2 className="text-[#F5E5B7] font-bold text-sm sm:text-base leading-tight">
                    My Profile
                  </h2>
                  <p className="text-[#E9B83E]/80 text-[10px] sm:text-[11px] font-medium leading-tight">
                    Your Puja Porikroma journey
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalVisible(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition active:scale-95 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            {/* Profile Identity Section with Durga Silhouette Line Art */}
            <div className="relative flex items-center justify-between pb-3 pt-1 px-1 mb-1">
              <div className="flex items-center gap-3.5 min-w-0 z-10">
                <div className="relative flex-shrink-0">
                  <img
                    src={user?.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'}
                    alt="Devotee"
                    className="w-16 h-16 sm:w-18 sm:h-18 rounded-full object-cover border-2 border-[#E9B83E] shadow-[0_0_20px_rgba(233,184,62,0.5)]"
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-white font-extrabold text-base sm:text-lg leading-tight truncate">
                    {user?.displayName || 'Moumita D.'}
                  </h3>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#E9B83E]/80 bg-[#E9B83E]/15 text-[#F5E5B7] text-[10px] sm:text-[11px] font-bold mt-1.5 shadow-[0_0_10px_rgba(233,184,62,0.25)]">
                    <span>🪔</span> Top Contributor
                  </div>
                  <p className="text-white/60 text-[10px] sm:text-[11px] font-medium mt-1 flex items-center gap-1.5">
                    <span>📅</span> Member since Sep 2024
                  </p>
                </div>
              </div>

              {/* Glowing Golden Maa Durga & Mandir Line Art SVG */}
              <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pointer-events-none opacity-85 pr-0.5">
                <svg className="w-32 h-32 sm:w-36 sm:h-36 text-[#E9B83E] drop-shadow-[0_0_14px_rgba(233,184,62,0.4)]" viewBox="0 0 160 140" fill="none" stroke="currentColor">
                  {/* Mandir Spires Silhouettes at base */}
                  <path d="M10 135 L10 115 L20 100 L20 85 L25 75 L30 85 L30 100 L40 115 L40 135" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
                  <path d="M35 135 L35 105 L45 88 L50 70 L55 88 L65 105 L65 135" strokeWidth="1.2" strokeLinejoin="round" opacity="0.7"/>
                  <path d="M95 135 L95 105 L105 88 L110 70 L115 88 L125 105 L125 135" strokeWidth="1.2" strokeLinejoin="round" opacity="0.7"/>
                  <path d="M120 135 L120 115 L130 100 L130 85 L135 75 L140 85 L140 100 L150 115 L150 135" strokeWidth="1.2" strokeLinejoin="round" opacity="0.6"/>
                  <line x1="5" y1="135" x2="155" y2="135" strokeWidth="1.5" opacity="0.8"/>
                  <line x1="15" y1="125" x2="145" y2="125" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"/>
                  <path d="M25 75 L25 68 M23 70 L27 70" strokeWidth="1.2"/>
                  <path d="M50 70 L50 62 M48 64 L52 64" strokeWidth="1.2"/>
                  <path d="M110 70 L110 62 M108 64 L112 64" strokeWidth="1.2"/>
                  <path d="M135 75 L135 68 M133 70 L137 70" strokeWidth="1.2"/>
                  {/* Base Diya Glow */}
                  <path d="M68 128 Q80 138 92 128 Q80 122 68 128 Z" fill="currentColor" fillOpacity="0.4" strokeWidth="1"/>
                  <path d="M78 123 Q80 112 82 123 Z" fill="#F5E5B7" strokeWidth="0.8"/>
                  {/* Maa Durga Mukut (Crown) */}
                  <path d="M58 45 C58 20 80 8 80 8 C80 8 102 20 102 45 Z" strokeWidth="1.4" fill="currentColor" fillOpacity="0.08"/>
                  <path d="M65 42 C65 26 80 15 80 15 C80 15 95 26 95 42" strokeWidth="1.2"/>
                  <circle cx="80" cy="22" r="2.5" fill="currentColor"/>
                  <circle cx="73" cy="28" r="1.8" fill="currentColor"/>
                  <circle cx="87" cy="28" r="1.8" fill="currentColor"/>
                  <path d="M54 48 Q46 32 58 24 Q58 36 62 44" strokeWidth="1.2"/>
                  <path d="M106 48 Q114 32 102 24 Q102 36 98 44" strokeWidth="1.2"/>
                  <path d="M50 20 Q80 0 110 20" strokeWidth="1" strokeDasharray="2 3" opacity="0.6"/>
                  {/* Face Outline & Chin */}
                  <path d="M64 45 C62 62 70 82 80 84 C90 82 98 62 96 45" strokeWidth="1.4" fill="currentColor" fillOpacity="0.05"/>
                  {/* Third Eye (Trinetra) */}
                  <path d="M80 36 C77 42 77 46 80 50 C83 46 83 42 80 36 Z" fill="currentColor" strokeWidth="0.8"/>
                  <circle cx="80" cy="43" r="1" fill="#211329"/>
                  {/* Eyebrows & Eyes */}
                  <path d="M66 52 Q72 49 76 53" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M94 52 Q88 49 84 53" strokeWidth="1.3" strokeLinecap="round"/>
                  <path d="M66 56 C69 53 74 53 77 57 C74 59 69 59 66 56 Z" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
                  <circle cx="72" cy="56" r="1.5" fill="currentColor"/>
                  <path d="M94 56 C91 53 86 53 83 57 C86 59 91 59 94 56 Z" strokeWidth="1.2" fill="currentColor" fillOpacity="0.15"/>
                  <circle cx="88" cy="56" r="1.5" fill="currentColor"/>
                  {/* Nose & Nath */}
                  <path d="M80 52 L80 64 L82 65" strokeWidth="1.1" strokeLinecap="round"/>
                  <circle cx="84" cy="65" r="3" strokeWidth="1" strokeDasharray="1 1"/>
                  <path d="M87 65 C92 65 96 61 97 58" strokeWidth="0.8" strokeDasharray="1 1.5"/>
                  {/* Lips */}
                  <path d="M75 72 Q80 75 85 72" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M76 72 Q80 70 84 72" strokeWidth="1" strokeLinecap="round"/>
                  {/* Earrings */}
                  <path d="M60 56 Q56 62 60 68 L63 68 Q61 62 60 56 Z" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
                  <path d="M100 56 Q104 62 100 68 L97 68 Q99 62 100 56 Z" strokeWidth="1" fill="currentColor" fillOpacity="0.2"/>
                </svg>
              </div>
            </div>

            {/* Stats Grid (3 Tiles in Card with Glowing Bottom Rim) */}
            <div className="relative">
              <div className="grid grid-cols-3 divide-x divide-[#E9B83E]/20 rounded-2xl bg-[#211329]/70 border border-[#E9B83E]/30 p-3 shadow-inner">
                <div className="text-center flex flex-col items-center px-1">
                  <svg className="w-5 h-5 text-[#E9B83E] mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span className="text-base sm:text-lg font-black text-white">247</span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-white/60 mt-0.5">Photos Shared</span>
                </div>
                <div className="text-center flex flex-col items-center px-1">
                  <svg className="w-5 h-5 text-[#E9B83E] mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span className="text-base sm:text-lg font-black text-white">86</span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-white/60 mt-0.5">Pandals Covered</span>
                </div>
                <div className="text-center flex flex-col items-center px-1">
                  <svg className="w-5 h-5 text-[#E9B83E] mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2"/>
                    <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2"/>
                    <path d="M4 4h16v6a8 8 0 0 1-16 0V4z"/>
                    <path d="M12 18v4"/>
                    <path d="M8 22h8"/>
                  </svg>
                  <span className="text-base sm:text-lg font-black text-[#E9B83E]">#2</span>
                  <span className="text-[10px] sm:text-[11px] font-medium text-white/60 mt-0.5">This Puja Rank</span>
                </div>
              </div>
              {/* Glowing Bottom Accent Line */}
              <div className="w-3/4 mx-auto h-[1.5px] bg-gradient-to-r from-transparent via-[#E9B83E]/80 to-transparent shadow-[0_0_12px_rgba(233,184,62,0.8)] mb-3 mt-0.5" />
            </div>

            {/* My Contributions Section */}
            <div className="rounded-2xl bg-[#211329]/60 border border-[#E9B83E]/25 p-3 mb-3 shadow-inner">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-white font-bold text-xs sm:text-sm">
                  <svg className="w-4 h-4 text-[#E9B83E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  My Contributions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileModalVisible(false)
                    setUploadVisible(true)
                  }}
                  className="text-[#E9B83E] hover:text-[#F5E5B7] text-xs font-semibold cursor-pointer transition flex items-center gap-1"
                >
                  View All →
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { img: 'https://images.unsplash.com/photo-1567157577867-05ccb1388e66?auto=format&fit=crop&w=300&q=80', title: 'Golden Temple Pandal' },
                  { img: 'https://images.unsplash.com/photo-1601055283742-8b27e81b5553?auto=format&fit=crop&w=300&q=80', title: 'Maa Durga Cyan' },
                  { img: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=300&q=80', title: 'Red Toron Arch' },
                  { img: 'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=300&q=80', title: 'White Temple Pandal' },
                ].map((item, idx) => (
                  <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-[#E9B83E]/30 hover:border-[#E9B83E] transition shadow cursor-pointer group">
                    <img src={item.img} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
                  </div>
                ))}
              </div>
            </div>

            {/* Edit Profile Action */}
            <button
              type="button"
              onClick={() => {
                setProfileModalVisible(false)
                setAuthModalVisible(true)
              }}
              className="w-full p-2.5 sm:p-3 rounded-2xl bg-[#211329]/70 border border-[#E9B83E]/25 hover:border-[#E9B83E]/45 flex items-center justify-between mb-3 transition cursor-pointer active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E9B83E]/15 border border-[#E9B83E]/30 text-[#E9B83E] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#E9B83E]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    <path d="M19.7 13c-.1 0-.2.1-.2.1l-.8.8 1.2 1.2.8-.8c.1-.1.1-.3 0-.4l-.8-.8c-.1-.1-.2-.1-.2-.1zm-1.4 1.3L15 17.6V19h1.4l3.3-3.3-1.4-1.4z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-xs sm:text-sm leading-tight">Edit Profile</p>
                  <p className="text-white/50 text-[10px] sm:text-[11px] leading-tight mt-0.5">Update your name, photo and details</p>
                </div>
              </div>
              <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Bottom CTA Banner */}
            <button
              type="button"
              onClick={() => {
                setProfileModalVisible(false)
                setUploadVisible(true)
              }}
              className="w-full p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-[#E9B83E] via-[#f3cb69] to-[#F5E5B7] text-[#211329] flex items-center justify-between shadow-[0_4px_16px_rgba(233,184,62,0.35)] hover:shadow-[0_0_20px_rgba(233,184,62,0.5)] hover:scale-[1.01] active:scale-98 transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#211329]/15 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#211329]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-bold text-xs sm:text-sm text-[#211329] leading-tight">Share Pandal Photos</p>
                  <p className="text-[10px] sm:text-[11px] text-[#211329]/80 font-medium leading-tight mt-0.5">Add more photos and keep exploring!</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-[#211329] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
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
