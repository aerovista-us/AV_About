
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const state = {
  tracks: [],
  idx: 0,
  ctx: null,
  nodes: {}
};

async function loadJSON(p){ const r = await fetch(p); return await r.json(); }

async function bootstrap(){
  // Load assets
  state.tracks = await loadJSON('assets/data/tracks.json');
  buildSlideshow();
  buildTrackList();
  initPlayer();
  buildStore();
  preloadAudio(); // Preload audio for better performance
  // Year
  $('#yr').textContent = new Date().getFullYear();
}

// Preload audio files for better performance
function preloadAudio() {
  const audio = $('#audio');
  const preloadPromises = state.tracks.map(track => {
    return new Promise((resolve) => {
      const testAudio = new Audio();
      testAudio.preload = 'metadata';
      testAudio.onloadedmetadata = () => resolve();
      testAudio.onerror = () => resolve(); // Continue even if some fail
      testAudio.src = track.src;
    });
  });
  
  // Preload in background
  Promise.allSettled(preloadPromises).then(() => {
    console.log('Audio preloading completed');
  });
}

// Global variables for audio context
let ctx, src, master, lows, comp, limit, ana;
let audioInitialized = false;

// Initialize AudioContext after user interaction
function initAudioContext() {
  if (audioInitialized) return;
  const audio = $('#audio');
  const viz = $('#viz');
  
  ctx = state.ctx = new (window.AudioContext||window.webkitAudioContext)();
  src = ctx.createMediaElementSource(audio);
  master = ctx.createGain();
  lows = ctx.createBiquadFilter(); lows.type='lowshelf'; lows.frequency.value=110; lows.gain.value=0;
  comp = ctx.createDynamicsCompressor(); comp.threshold.value=-18; comp.ratio.value=6;
  limit = ctx.createDynamicsCompressor(); limit.threshold.value=-3; limit.knee.value=0; limit.ratio.value=20; limit.attack.value=0.001; limit.release.value=0.01;
  ana = ctx.createAnalyser(); ana.fftSize=2048; ana.smoothingTimeConstant=0.85;

  src.connect(lows); lows.connect(comp); comp.connect(limit); limit.connect(master); master.connect(ana); ana.connect(ctx.destination);
  
  const playBtn = $('#play');
  const prevBtn = $('#prev');
  const nextBtn = $('#next');
  const seek = document.querySelector('.seek');
  const seekFill = $('#seekFill');
  const time = $('#time');
  const bassCtl = $('#bass');
  const volCtl = $('#vol');
  
  state.nodes = {audio, playBtn, prevBtn, nextBtn, seek, seekFill, time, bassCtl, volCtl, master, lows, ana, viz};

  // Initialize aviation-themed visualizer after AudioContext is ready
  const g = viz.getContext('2d');
  const buffer = new Uint8Array(ana.frequencyBinCount);
  let flightTrails = [];
  let radarSweep = 0;
  
  // Ensure canvas has proper dimensions
  function resizeCanvas() {
    const rect = viz.getBoundingClientRect();
    viz.width = rect.width * devicePixelRatio;
    viz.height = rect.height * devicePixelRatio;
    g.scale(devicePixelRatio, devicePixelRatio);
  }
  
  resizeCanvas();
  
  // Handle window resize
  window.addEventListener('resize', resizeCanvas);
  
  function draw(){
    requestAnimationFrame(draw);
    
    // Ensure canvas dimensions are correct
    if (viz.clientWidth === 0) return;
    
    ana.getByteFrequencyData(buffer);
    const w = viz.clientWidth;
    const h = viz.clientHeight;
    g.clearRect(0,0,w,h);
    
    // Enhanced aviation-themed visualizer with multiple layers
    const bars = 128, step = Math.floor(buffer.length/bars);
    const centerX = w / 2;
    const centerY = h / 2;
    
    // Calculate overall audio intensity for global effects
    const avgIntensity = buffer.reduce((sum, val) => sum + val, 0) / buffer.length / 255;
    const bassIntensity = buffer.slice(0, 8).reduce((sum, val) => sum + val, 0) / 8 / 255;
    const midIntensity = buffer.slice(8, 32).reduce((sum, val) => sum + val, 0) / 24 / 255;
    const highIntensity = buffer.slice(32, 64).reduce((sum, val) => sum + val, 0) / 32 / 255;
    
    // Background gradient that responds to music
    const bgGradient = g.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, `rgba(10, 15, 22, ${0.3 + avgIntensity * 0.2})`);
    bgGradient.addColorStop(0.5, `rgba(14, 19, 27, ${0.2 + bassIntensity * 0.3})`);
    bgGradient.addColorStop(1, `rgba(16, 23, 37, ${0.4 + highIntensity * 0.2})`);
    g.fillStyle = bgGradient;
    g.fillRect(0, 0, w, h);
    
    // Enhanced flight trails with multiple frequency bands
    for(let i=0;i<bars;i++){
      const v = buffer[i*step]/255;
      const x = (i/bars)*w;
      const intensity = Math.max(v * 0.9, 0.05);
      
      // Multiple trail layers for depth
      const trailY = centerY + (Math.sin(i * 0.2 + radarSweep) * 25 * intensity);
      const trailHeight = 2 + intensity * 12;
      const trailWidth = 1 + intensity * 3;
      
      // Dynamic color based on frequency and intensity
      const freqRatio = i / bars;
      const r = Math.floor(209 + (137-209) * freqRatio + (255-209) * intensity);
      const g_val = Math.floor(168 + (200-168) * freqRatio + (255-168) * intensity);
      const b = Math.floor(90 + (255-90) * freqRatio + (255-90) * intensity);
      
      // Main trail with glow effect
      g.fillStyle = `rgba(${r}, ${g_val}, ${b}, ${0.7 + intensity * 0.3})`;
      g.fillRect(x - trailWidth/2, trailY - trailHeight/2, trailWidth, trailHeight);
      
      // Glow effect for high intensity
      if (intensity > 0.6) {
        g.fillStyle = `rgba(${r}, ${g_val}, ${b}, ${0.3})`;
        g.fillRect(x - trailWidth, trailY - trailHeight, trailWidth * 2, trailHeight * 2);
      }
      
      // Secondary frequency trails
      if (i % 4 === 0) {
        const secondaryY = centerY + (Math.cos(i * 0.15 + radarSweep * 1.5) * 15 * intensity);
        g.fillStyle = `rgba(137, 200, 255, ${0.4 + intensity * 0.4})`;
        g.fillRect(x, secondaryY - 1, 1, 2);
      }
    }
    
    // Enhanced radar sweep with multiple rings
    radarSweep += 0.03 + avgIntensity * 0.02;
    
    // Outer radar ring
    g.strokeStyle = `rgba(209, 168, 90, ${0.3 + bassIntensity * 0.4})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(centerX, centerY, 40 + bassIntensity * 20, radarSweep, radarSweep + 0.8);
    g.stroke();
    
    // Inner radar ring
    g.strokeStyle = `rgba(137, 200, 255, ${0.4 + midIntensity * 0.3})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(centerX, centerY, 25 + midIntensity * 15, radarSweep * 1.3, radarSweep * 1.3 + 0.6);
    g.stroke();
    
    // Pulsing center crosshair
    const pulseIntensity = 0.5 + Math.sin(radarSweep * 3) * 0.3 + avgIntensity * 0.4;
    g.strokeStyle = `rgba(209, 168, 90, ${0.6 + pulseIntensity * 0.4})`;
    g.lineWidth = 1 + pulseIntensity;
    g.beginPath();
    g.moveTo(centerX - 15 * pulseIntensity, centerY);
    g.lineTo(centerX + 15 * pulseIntensity, centerY);
    g.moveTo(centerX, centerY - 15 * pulseIntensity);
    g.lineTo(centerX, centerY + 15 * pulseIntensity);
    g.stroke();
    
    // Frequency-based particle effects
    for(let i=0;i<16;i++){
      if(buffer[i*8] > 100){
        const angle = (i / 16) * Math.PI * 2 + radarSweep;
        const radius = 30 + (buffer[i*8] / 255) * 40;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        g.fillStyle = `rgba(255, 255, 255, ${0.6 + (buffer[i*8] / 255) * 0.4})`;
        g.beginPath();
        g.arc(x, y, 1 + (buffer[i*8] / 255) * 2, 0, Math.PI * 2);
        g.fill();
      }
    }
    
    // Audio waveform visualization at bottom
    const waveformHeight = 20;
    const waveformY = h - waveformHeight - 10;
    g.strokeStyle = `rgba(209, 168, 90, ${0.6 + avgIntensity * 0.4})`;
    g.lineWidth = 2;
    g.beginPath();
    
    for(let i=0;i<w;i+=2){
      const bufferIndex = Math.floor((i/w) * buffer.length);
      const amplitude = (buffer[bufferIndex] / 255) * waveformHeight;
      const y = waveformY + (waveformHeight - amplitude);
      
      if(i === 0) g.moveTo(i, y);
      else g.lineTo(i, y);
    }
    g.stroke();
  }
  draw();

  audioInitialized = true;
}

// Unified play control function - now global
async function handlePlay(trackIndex = null) {
  initAudioContext(); // Initialize AudioContext on first user interaction
  if(state.ctx && state.ctx.state==='suspended') await state.ctx.resume();

  const audio = $('#audio');
  const playBtn = $('#play');

  // If a specific track is requested, load it
  if (trackIndex !== null) {
    await playTrack(trackIndex);
    return;
  }

  // If no track is loaded, start with the first track
  if(!audio.src || audio.src === '') {
    await playTrack(0);
    return;
  }

  // Toggle play/pause for current track
  if(audio.paused){
    await audio.play();
    playBtn.textContent='❚❚ Pause';
    startAlbumArtCycle(); // Resume album art cycling
  } else {
    audio.pause();
    playBtn.textContent='► Play';
    stopAlbumArtCycle(); // Stop album art cycling when paused
  }
}

function buildSlideshow(){
  const slideWrap = $('#slideshow');
  const dots = $('#indicators');
  slideWrap.innerHTML = '';
  dots.innerHTML = '';
  state.tracks.forEach((t,i)=>{
    const d = document.createElement('div');
    d.className = 'slide' + (i===0? ' active':'');
    d.style.backgroundImage = `url(${t.cover})`;
    const b = document.createElement('div');
    b.className='badge';
    b.textContent = t.division;
    d.appendChild(b);
    slideWrap.appendChild(d);
    const dot = document.createElement('div');
    dot.className = 'indicator' + (i===0? ' active':'');
    dot.addEventListener('click', ()=> goSlide(i));
    dots.appendChild(dot);
  });
  $('#prevSlide').onclick = ()=> goSlide((state.idx-1+state.tracks.length)%state.tracks.length);
  $('#nextSlide').onclick = ()=> goSlide((state.idx+1)%state.tracks.length);
}
function goSlide(i){
  $$('.slide').forEach(s=>s.classList.remove('active'));
  $$('.indicator').forEach(s=>s.classList.remove('active'));
  $$('.slide')[i].classList.add('active');
  $$('.indicator')[i].classList.add('active');
  state.idx = i;
}

// Auto-cycle album art during playback
let albumArtCycleInterval = null;

function startAlbumArtCycle() {
  if (albumArtCycleInterval) return; // Already cycling
  
  albumArtCycleInterval = setInterval(() => {
    if (state.ctx && state.ctx.state === 'running') {
      const nextIndex = (state.idx + 1) % state.tracks.length;
      goSlide(nextIndex);
    }
  }, 3000); // Change every 3 seconds
}

function stopAlbumArtCycle() {
  if (albumArtCycleInterval) {
    clearInterval(albumArtCycleInterval);
    albumArtCycleInterval = null;
  }
}

function buildTrackList(){
  const list = $('.tracks');
  list.innerHTML='';
  state.tracks.forEach((t,i)=>{
    const row = document.createElement('div');
    row.className='track';
    row.dataset.track = i;
    row.innerHTML = `<div><strong>${t.title}</strong><small>${t.division}</small></div>
      <div class="row">
        <button data-play="${i}">▶ Play</button>
      </div>`;
    list.appendChild(row);
  });
  list.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-play]');
    if(!btn) return;
    const i = parseInt(btn.dataset.play,10);
    await handlePlay(i); // Use unified play control
  });
}

function initPlayer(){
  const audio = $('#audio');
  const playBtn = $('#play');
  const prevBtn = $('#prev');
  const nextBtn = $('#next');
  const seek = document.querySelector('.seek');
  const seekFill = $('#seekFill');
  const time = $('#time');
  const bassCtl = $('#bass');
  const volCtl = $('#vol');
  const viz = $('#viz');


  function setBass(db){ if(state.nodes && state.nodes.lows) state.nodes.lows.gain.value=db >= 11 ? 12 : db; }
  function setVol(v){ if(state.nodes && state.nodes.master) state.nodes.master.gain.value = v; }

  bassCtl.oninput = e => setBass(parseFloat(e.target.value));
  volCtl.oninput = e => setVol(parseFloat(e.target.value));

  
  playBtn.onclick = () => handlePlay();
  prevBtn.onclick = ()=> playTrack((state.idx-1+state.tracks.length)%state.tracks.length);
  nextBtn.onclick = ()=> playTrack((state.idx+1)%state.tracks.length);

  audio.addEventListener('timeupdate', ()=>{
    if(!isFinite(audio.duration)) return;
    const p = audio.currentTime / audio.duration;
    seekFill.style.inset = `0 ${Math.max(0,100 - p*100)}% 0 0`;
    time.textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
  });
  seek.addEventListener('click', e => {
    const r = seek.getBoundingClientRect();
    const p = (e.clientX - r.left) / r.width;
    if(isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(1,p)) * audio.duration;
  });

  // Visualizer will be initialized after AudioContext is created

  // Initialize volume and bass controls
  setVol(parseFloat(volCtl.value));
  setBass(parseFloat(bassCtl.value));
}

function fmt(s){ if(!isFinite(s)) return '0:00'; const m=Math.floor(s/60), sec=Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; }

async function playTrack(i){
  // Initialize AudioContext if not already done
  if (typeof initAudioContext === 'function') {
    initAudioContext();
  }

  // Wait a moment for AudioContext to be ready
  if (!state.nodes || !state.ctx) {
    console.log('AudioContext not ready yet');
    return;
  }

  state.idx = i;
  const t = state.tracks[i];
  const {audio, playBtn} = state.nodes;

  // Update UI first for better UX
  $$('.track').forEach(e=>e.classList.remove('playing'));
  const row = document.querySelector(`.track[data-track="${i}"]`);
  if(row) row.classList.add('playing');
  goSlide(i);

  // Load and play audio
  audio.src = t.src;
  audio.load(); // Force reload for better compatibility

  try {
    await state.ctx.resume();
    await audio.play();
    playBtn.textContent='❚❚ Pause';
    
    // Start auto-cycling album art
    startAlbumArtCycle();
  } catch (error) {
    console.log('Playback error:', error);
    playBtn.textContent='► Play';
  }
}

// --- Mini Store ---
async function buildStore(){
  const res = await fetch('assets/data/products.json');
  const items = await res.json();
  const row = document.querySelector('.store-row');
  row.innerHTML = '';
  items.forEach(p => {
    const el = document.createElement('div');
    el.className='store-item';
    el.innerHTML = `
      <img src="${p.images[0]||''}" alt="${p.title}" style="width:100%;height:180px;object-fit:cover;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3)">
      <h3>${p.title}</h3>
      <div class="price">$${p.price.toFixed(2)}</div>
      <button class="checkout-btn" data-id="${p.id}">Learn More</button>
    `;
    row.appendChild(el);
  });
  row.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-id]');
    if(!btn) return;
    openModal(btn.dataset.id, items);
  });
}

function openModal(id, items){
  const p = items.find(x=>x.id===id);
  if(!p) return;
  const modal = $('#productModal');
  const mImg = $('#modalImage');
  const mTitle = $('#modalTitle');
  const mPrice = $('#modalPrice');
  const mDesc = $('#modalDescription');
  const mFeat = $('#modalFeatures');
  mImg.src = p.images[0]||'';
  mTitle.textContent = p.title;
  mPrice.textContent = `$${p.price.toFixed(2)}`;
  mDesc.textContent = p.description;
  mFeat.innerHTML = '<ul>'+p.features.map(f=>`<li>${f}</li>`).join('')+'</ul>';
  modal.style.display='flex';
  requestAnimationFrame(()=> modal.style.opacity='1');
  $('#closeModal').onclick = ()=> { modal.style.opacity='0'; setTimeout(()=> modal.style.display='none', 300); };
  $('#buyNowBtn').onclick = ()=> { alert('Checkout flow coming next — connect to Printful or Stripe.'); };
}

document.addEventListener('DOMContentLoaded', bootstrap);
