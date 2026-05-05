import './style.css';
import exifr from 'exifr';

// Charger dynamiquement les photos : scan récursif pour trouver les catégories
const thumbModules = import.meta.glob('./photos/**/*.{jpg,jpeg,png,webp,gif}', { query: '?w=600&format=webp', import: 'default', eager: true });
const fullModules = import.meta.glob('./photos/**/*.{jpg,jpeg,png,webp,gif}', { query: '?url&rm=false', import: 'default', eager: true });

const filePaths = Object.keys(thumbModules);

// Extraction des données
const photoData = filePaths.map(path => {
  const parts = path.split('/');
  // Ex: './photos/Voitures/img.jpg' -> length = 4, index 2 = 'Voitures'
  // Ex: './photos/img.jpg' -> length = 3
  const category = parts.length > 3 ? parts[2] : 'Divers';
  
  return {
    thumbSrc: thumbModules[path],
    fullSrc: fullModules[path],
    category: category
  };
});

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.header');
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 80 && window.scrollY > lastScrollY) {
      header.classList.add('hidden');
    } else {
      header.classList.remove('hidden');
    }
    lastScrollY = window.scrollY;
  }, { passive: true });

  const mainContent = document.querySelector('.main-content');
  const galleryContainer = document.querySelector('.gallery-container');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxMeta = document.getElementById('lightbox-meta');
  const closeBtn = document.querySelector('.lightbox-close');

  // Interface de Filtrage (si on a plus que juste "Divers")
  const uniqueCategories = [...new Set(photoData.map(p => p.category))];
  let activeCategory = 'Tout';

  if (uniqueCategories.length > 0 && !(uniqueCategories.length === 1 && uniqueCategories[0] === 'Divers')) {
    const filtersContainer = document.createElement('div');
    filtersContainer.className = 'filters-container';
    
    // Le filtre "Tout" est toujours présent
    const categories = ['Tout', ...uniqueCategories];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `filter-btn ${cat === 'Tout' ? 'active' : ''}`;
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = cat;
        renderGallery();
      });
      filtersContainer.appendChild(btn);
    });

    mainContent.insertBefore(filtersContainer, galleryContainer);
  }

  // Fonction de rendu dynamique
  const renderGallery = () => {
    galleryContainer.innerHTML = '';
    
    const filteredPhotos = activeCategory === 'Tout' ? photoData : photoData.filter(p => p.category === activeCategory);

    if (filteredPhotos.length === 0) {
      galleryContainer.innerHTML = '<p style="color:var(--text-muted); grid-column: 1/-1; text-align: center;">Aucune photo trouvée.</p>';
      return;
    }

    let numCols = 4;
    if (window.innerWidth <= 768) numCols = 1;
    else if (window.innerWidth <= 1024) numCols = 2;
    else if (window.innerWidth <= 1400) numCols = 3;

    const cols = Array.from({ length: numCols }, () => {
      const col = document.createElement('div');
      col.className = 'gallery-column';
      galleryContainer.appendChild(col);
      return col;
    });

    filteredPhotos.forEach((photo, index) => {
      const { thumbSrc, fullSrc } = photo;
      const item = document.createElement('div');
      item.className = 'photo-item';
      item.style.animationDelay = `${(index % 12) * 0.05}s`; // Stagger limité pour de meilleures perfs
      
      const img = document.createElement('img');
      img.src = thumbSrc;
      img.loading = 'lazy';
      img.alt = `Photographie catégorie ${photo.category}`;
      
      const overlay = document.createElement('div');
      overlay.className = 'photo-overlay';

      item.appendChild(img);
      item.appendChild(overlay);

      item.addEventListener('click', async () => {
        lightboxImg.src = fullSrc;
        lightbox.classList.add('active');
        lightboxMeta.innerHTML = '';
        
        try {
          const metadata = await exifr.parse(fullSrc, { tiff: true, exif: true });
          if (metadata && (metadata.Make || metadata.FNumber || metadata.ExposureTime)) {
            const make = metadata.Make ? metadata.Make.trim() : '';
            const model = metadata.Model ? metadata.Model.trim() : '';
            const cameraInfo = [make, model].filter(Boolean).join(' ');
            
            const fstop = metadata.FNumber ? `f/${metadata.FNumber}` : '';
            const iso = metadata.ISO ? `ISO ${metadata.ISO}` : '';
            const exp = metadata.ExposureTime ? `1/${Math.round(1/metadata.ExposureTime)}s` : '';
            const focal = metadata.FocalLength ? `${metadata.FocalLength}mm` : '';
            
            const specs = [fstop, exp, iso, focal].filter(Boolean).join(' • ');
            
            if (cameraInfo || specs) {
              lightboxMeta.innerHTML = `
                ${cameraInfo ? `<div style="color: #fff; font-weight: 500; margin-bottom: 0.25rem;">${cameraInfo}</div>` : ''}
                ${specs ? `<div>${specs}</div>` : ''}
              `;
            }
          } else {
             lightboxMeta.innerHTML = `<span style="color:rgba(255,255,255,0.3)">Aucune métadonnée disponible.</span>`;
          }
        } catch (err) {
          console.warn('Exif erreur', err);
          lightboxMeta.innerHTML = `<span style="color:rgba(255,255,255,0.3)">Aucune métadonnée EXIF.</span>`;
        }
      });

      cols[index % numCols].appendChild(item);
    });
  };

  renderGallery();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderGallery, 300); // Debounce
  });

  const closeLightbox = () => {
    lightbox.classList.remove('active');
    setTimeout(() => { 
      if (!lightbox.classList.contains('active')) {
        lightboxImg.src = ''; 
        lightboxMeta.innerHTML = '';
      }
    }, 400);
  };

  closeBtn.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target !== lightboxImg && e.target !== lightboxMeta && !lightboxMeta.contains(e.target)) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox.classList.contains('active')) {
      closeLightbox();
    }
  });
});
