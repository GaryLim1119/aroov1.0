// 1. LOAD DATA ON STARTUP
document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(); // <--- ADDED THIS
    loadFavourites();
});

// --- NEW FUNCTION: GET USER NAME & IMAGE ---
async function fetchUserProfile() {
    try {
        const res = await fetch('/api/user/me'); 
        if (res.ok) {
            const user = await res.json();
            
            // Update Name
            const nameEl = document.getElementById('navUserName');
            if (nameEl) nameEl.textContent = user.name || "Traveler"; 

            // Update Image
            const imgEl = document.getElementById('navUserImg');
            if (imgEl && user.picture) {
                imgEl.src = user.picture;
            }
        }
    } catch (err) {
        console.error("Profile load failed:", err);
    }
}

// --- EXISTING FAVOURITES LOGIC ---

async function loadFavourites() {
    const grid = document.getElementById('favGrid');
    
    try {
        const res = await fetch('/api/user/favourites');
        if (!res.ok) throw new Error('Failed to fetch favourites');

        const data = await res.json();
        renderGrid(data);

    } catch (err) {
        console.error("Error loading favourites:", err);
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#999; padding:60px;">
                            Could not load favourites. <br> Check your server connection.
                          </p>`;
    }
}

function renderGrid(data) {
    const grid = document.getElementById('favGrid');

    if (!data || data.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding:50px;">
                <h2 style="color:#ccc; margin-bottom:10px;">💔</h2>
                <h3 style="color:#555;">No favourites yet</h3>
                <p>Go back to <a href="/user" style="color:#ff5a5f; font-weight:600;">Explore</a> to save some trips!</p>
            </div>`;
        return;
    }

    grid.innerHTML = data.map(item => {
        const imgUrl = item.images || 'https://via.placeholder.com/400x300?text=Aroov+Trip';
        const destId = item.dest_id || item.id;

        return `
        <div class="card" id="card-${destId}">
            <div class="card-image-wrapper">
                <img src="${imgUrl}" class="card-img" alt="${item.name}">
                <div class="card-overlay">
                    <div class="card-title">${item.name}</div>
                    <div class="card-location"><span>📍 ${item.state} • ${item.type}</span></div>
                </div>
            </div>
            
            <div class="card-bottom">
                <div class="card-price">
                    <span class="price-label">Estimated Price</span>
                    <span class="price-value">RM${item.price_min} - ${item.price_max}</span>
                </div>
                <div class="card-icons">
                    <button class="icon-btn" onclick="shareItem('${item.name}')">🔗</button>
                    
                    <button class="icon-btn heart-btn liked" 
                            title="Remove from Favourites"
                            onclick="removeFavourite(this, '${destId}')">
                        ❤️
                    </button>
                </div>
            </div>

            <button class="btn-details" onclick='openModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'>
                View Details
            </button>
        </div>
    `}).join('');
}

async function removeFavourite(btn, itemId) {
    if(!confirm("Remove this trip from your favourites?")) return;

    try {
        const res = await fetch(`/api/user/favourites/${itemId}`, { method: 'DELETE' });
        
        if (res.ok) {
            const card = document.getElementById(`card-${itemId}`);
            if(card) {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    card.remove();
                    const grid = document.getElementById('favGrid');
                    if(grid.querySelectorAll('.card').length === 0) {
                         loadFavourites(); 
                    }
                }, 300);
            }
        } else {
            alert("⚠️ Could not remove. Please try again.");
        }
    } catch (err) {
        console.error("Remove error:", err);
    }
}

// --- MODAL LOGIC ---
const modal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContentInject');

function openModal(item) {
    const imgUrl = item.images || 'https://via.placeholder.com/800x450';
    const destId = item.dest_id || item.id;
    const mapQuery = encodeURIComponent(`${item.name} ${item.state} Malaysia`);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

    modalContent.innerHTML = `
        <div class="close-btn" onclick="closeModal()">×</div>
        <img src="${imgUrl}" class="modal-hero-img">
        
        <div class="modal-body">
            <div class="modal-flex">
                <div class="modal-main">
                    <h1 class="modal-title">${item.name}</h1>
                    <div class="modal-subtitle">
                        <span>📍 ${item.state}</span>
                        <span style="margin: 0 10px;">|</span>
                        <span>🏷️ Type: <strong>${item.type}</strong></span>
                    </div>
                    
                    <span class="modal-label">About</span>
                    <p class="modal-desc">${item.description || "No description available."}</p>
                    
                    <span class="modal-label">Activities</span>
                    <p style="color:#555; line-height: 1.6;">
                        ${item.activities || "Sightseeing, Photography, Relaxation"}
                    </p>
                </div>

                <div class="modal-sidebar">
                    <span class="modal-label">Est Cost</span>
                    <span class="modal-price-tag">RM${item.price_min} - RM${item.price_max}</span>
                    
                    <a href="${mapUrl}" target="_blank" style="text-decoration:none;">
                        <button class="btn-map">
                            🗺️ View on Google Maps
                        </button>
                    </a>

                    <button class="btn-modal-add heart-btn liked" 
                            style="margin-top:10px; background: white; color: red; border: 2px solid #eee;"
                            onclick="removeFavourite(this, '${destId}'); closeModal();">
                        💔 Remove Favourite
                    </button>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeModal() { modal.style.display = 'none'; }
window.onclick = function(e) { if (e.target == modal) closeModal(); }

function shareItem(name) { 
    navigator.clipboard.writeText(window.location.href); 
    alert(`Link for ${name} copied to clipboard!`); 
}