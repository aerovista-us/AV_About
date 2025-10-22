
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
  // Year
  $('#yr').textContent = new Date().getFullYear();
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
    await playTrack(i);
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
    audioInitialized = true;
  }

  function setBass(db){ lows.gain.value=db >= 11 ? 12 : db; }
  function setVol(v){ master.gain.value = v; }

  bassCtl.oninput = e => setBass(parseFloat(e.target.value));
  volCtl.oninput = e => setVol(parseFloat(e.target.value));

  playBtn.onclick = async ()=>{
    initAudioContext(); // Initialize AudioContext on first user interaction
    if(ctx.state==='suspended') await ctx.resume();
    if(audio.paused){ await audio.play(); playBtn.textContent='❚❚ Pause'; } else { audio.pause(); playBtn.textContent='► Play'; }
  };
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

  // Visualizer
  const g = viz.getContext('2d');
  const buffer = new Uint8Array(ana.frequencyBinCount);
  function draw(){
    requestAnimationFrame(draw);
    ana.getByteFrequencyData(buffer);
    const w = viz.width = viz.clientWidth * devicePixelRatio;
    const h = viz.height = 200 * devicePixelRatio;
    g.clearRect(0,0,w,h);
    const bars = 64, step = Math.floor(buffer.length/bars);
    for(let i=0;i<bars;i++){
      const v = buffer[i*step]/255;
      const x = (i/bars)*w;
      const bw = w/bars*0.8;
      const bh = v*h*0.8;
      g.fillStyle = `rgba(${74+v*180}, ${163-v*40}, ${255 - v*120}, ${0.8})`;
      g.fillRect(x, h-bh, bw, bh);
    }
  }
  draw();

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
  
  state.idx = i;
  const t = state.tracks[i];
  const {audio, playBtn} = state.nodes;
  audio.src = t.src;
  $$('.track').forEach(e=>e.classList.remove('playing'));
  const row = document.querySelector(`.track[data-track="${i}"]`);
  if(row) row.classList.add('playing');
  await state.ctx.resume();
  await audio.play();
  playBtn.textContent='❚❚ Pause';
  goSlide(i);
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
