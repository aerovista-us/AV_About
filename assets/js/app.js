
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

  // Initialize AudioContext after user interaction
  let ctx, src, master, lows, comp, limit, ana;
  let audioInitialized = false;
  
  function initAudioContext() {
    if (audioInitialized) return;
    ctx = state.ctx = new (window.AudioContext||window.webkitAudioContext)();
    src = ctx.createMediaElementSource(audio);
    master = ctx.createGain();
    lows = ctx.createBiquadFilter(); lows.type='lowshelf'; lows.frequency.value=110; lows.gain.value=0;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value=-18; comp.ratio.value=6;
    limit = ctx.createDynamicsCompressor(); limit.threshold.value=-3; limit.knee.value=0; limit.ratio.value=20; limit.attack.value=0.001; limit.release.value=0.01;
    ana = ctx.createAnalyser(); ana.fftSize=2048; ana.smoothingTimeConstant=0.85;

    src.connect(lows); lows.connect(comp); comp.connect(limit); limit.connect(master); master.connect(ana); ana.connect(ctx.destination);
    state.nodes = {audio, playBtn, prevBtn, nextBtn, seek, seekFill, time, bassCtl, volCtl, master, lows, ana, viz};
    
    // Initialize aviation-themed visualizer after AudioContext is ready
    const g = viz.getContext('2d');
    const buffer = new Uint8Array(ana.frequencyBinCount);
    let flightTrails = [];
    let radarSweep = 0;
    
    // Ensure canvas has proper dimensions
    viz.width = viz.clientWidth * devicePixelRatio;
    viz.height = 200 * devicePixelRatio;
    g.scale(devicePixelRatio, devicePixelRatio);
    
    function draw(){
      requestAnimationFrame(draw);
      
      // Ensure canvas dimensions are correct
      if (viz.clientWidth === 0) return;
      
      ana.getByteFrequencyData(buffer);
      const w = viz.clientWidth;
      const h = 200;
      g.clearRect(0,0,w,h);
      
      // Aviation-themed visualizer
      const bars = 64, step = Math.floor(buffer.length/bars);
      const centerY = h / 2;
      
      // Create flight trails based on audio data
      for(let i=0;i<bars;i++){
        const v = buffer[i*step]/255;
        const x = (i/bars)*w;
        const intensity = Math.max(v * 0.8, 0.1); // Minimum intensity for visibility
        
        // Flight path visualization
        const trailY = centerY + (Math.sin(i * 0.3) * 20 * intensity);
        const trailHeight = 3 + intensity * 8;
        
        // AeroVista brand colors: gold to blue gradient
        const r = Math.floor(209 + (137-209) * intensity); // Gold to blue
        const g_val = Math.floor(168 + (200-168) * intensity);
        const b = Math.floor(90 + (255-90) * intensity);
        
        // Draw flight trail
        g.fillStyle = `rgba(${r}, ${g_val}, ${b}, ${0.6 + intensity * 0.4})`;
        g.fillRect(x, trailY - trailHeight/2, 2, trailHeight);
        
        // Add radar sweep effect
        if (i % 8 === 0) {
          g.strokeStyle = `rgba(137, 200, 255, ${0.3 + intensity * 0.4})`;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, centerY - 30);
          g.lineTo(x, centerY + 30);
          g.stroke();
        }
      }
      
      // Radar sweep animation
      radarSweep += 0.02;
      g.strokeStyle = `rgba(209, 168, 90, 0.4)`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(w/2, centerY, 30, radarSweep, radarSweep + 0.5);
      g.stroke();
      
      // Center crosshair (aviation style)
      g.strokeStyle = 'rgba(209, 168, 90, 0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(w/2 - 10, centerY);
      g.lineTo(w/2 + 10, centerY);
      g.moveTo(w/2, centerY - 10);
      g.lineTo(w/2, centerY + 10);
      g.stroke();
    }
    draw();
    
    audioInitialized = true;
  }

  function setBass(db){ if(state.nodes && state.nodes.lows) state.nodes.lows.gain.value=db >= 11 ? 12 : db; }
  function setVol(v){ if(state.nodes && state.nodes.master) state.nodes.master.gain.value = v; }

  bassCtl.oninput = e => setBass(parseFloat(e.target.value));
  volCtl.oninput = e => setVol(parseFloat(e.target.value));

  // Unified play control - handles both main play button and track selection
  async function handlePlay(trackIndex = null) {
    initAudioContext(); // Initialize AudioContext on first user interaction
    if(state.ctx && state.ctx.state==='suspended') await state.ctx.resume();
    
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
    } else { 
      audio.pause(); 
      playBtn.textContent='► Play'; 
    }
  }
  
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
