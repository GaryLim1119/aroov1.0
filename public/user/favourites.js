// /public/user/favourites.js

// 1. GLOBAL VARIABLES
let currentItemToShare = null; 
let allFavouritesData = []; 

document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(); 
    loadFavourites();   
    highlightCurrentTab(); 
});

// --- LOAD FAVOURITES ---
async function loadFavourites() {
    const grid = document.getElementById('favGrid');
    
    try {
        const res = await fetch('/api/user/favourites');
        
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (!res.ok) throw new Error('Failed to fetch favourites');

        const data = await res.json();
        
        // SAVE DATA GLOBALLY
        allFavouritesData = data;
        
        renderGrid(data);

    } catch (err) {
        console.error("Error loading favourites:", err);
        if(grid) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#ff5a5f; padding:60px;">
                                Could not load favourites. <br> Check your server connection.
                              </p>`;
        }
    }
}

// --- RENDER GRID ---
function renderGrid(data) {
    const grid = document.getElementById('favGrid');
    if(!grid) return;

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
        const priceDisplay = item.price_min > 0 ? `RM${item.price_min} - ${item.price_max}` : 'Free';

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
                    <span class="price-value">${priceDisplay}</span>
                </div>
                <div class="card-icons">
                    <button class="icon-btn" onclick="openShareModal('${destId}')">🔗</button>
                    
                    <button class="icon-btn heart-btn liked" 
                            title="Remove from Favourites"
                            onclick="removeFavourite(this, '${destId}')">
                        ❤️
                    </button>
                </div>
            </div>

            <button class="btn-details" onclick="openModal('${destId}')">
                View Details
            </button>
        </div>
    `}).join('');
}

// --- HELPERS TO FIND DATA ---
function getItemById(id) {
    // We look up the item in our global array
    return allFavouritesData.find(item => (item.dest_id || item.id) == id);
}

// --- REMOVE FAVOURITE ---
async function removeFavourite(btn, itemId) {
    if(!confirm("Remove this trip from your favourites?")) return;

    try {
        const res = await fetch(`/api/user/favourites/${itemId}`, { method: 'DELETE' });
        
        if (res.ok) {
            const card = document.getElementById(`card-${itemId}`);
            if(card) {
                card.style.transition = "all 0.3s ease";
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                
                setTimeout(() => {
                    card.remove();
                    allFavouritesData = allFavouritesData.filter(i => (i.dest_id || i.id) != itemId);
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

// --- SHARE MODAL LOGIC ---

function openShareModal(id) {
    currentItemToShare = getItemById(id);
    
    if (!currentItemToShare) {
        console.error("Item not found for share");
        return;
    }

    const modal = document.getElementById('shareModal');
    if(modal) {
        modal.classList.add('active'); 
        fetchUserGroupsForShare(); 
    }
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if(modal) modal.classList.remove('active');
}

function actionCopyLink() {
    if(!currentItemToShare) return;
    const id = currentItemToShare.dest_id || currentItemToShare.id;
    const shareUrl = `${window.location.origin}/destination?id=${id}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = document.querySelector('.btn-share-action');
        if(btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = "✅ Copied!";
            setTimeout(() => btn.innerHTML = originalText, 2000);
        }
    });
}

function actionEmailShare() {
    if(!currentItemToShare) return;
    const subject = `Trip Recommendation: ${currentItemToShare.name}`;
    const body = `Hey,\n\nI found this amazing place on Aroov Trip!\n\nDestination: ${currentItemToShare.name}\nState: ${currentItemToShare.state}\nEst. Cost: RM${currentItemToShare.price_min}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function fetchUserGroupsForShare() {
    const listContainer = document.getElementById('shareGroupList');
    if(!listContainer) return;
    
    listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">Syncing...</div>';

    try {
        const res = await fetch('/api/user/groups'); 
        if (res.status === 401) return;

        const groups = await res.json();

        if (groups.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; font-size:13px;">No groups found.<br><a href="/user/groups.html" style="color:blue;">Create a group</a></div>';
            return;
        }

        listContainer.innerHTML = groups.map(g => `
            <div class="share-group-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <div class="share-group-info">
                    <h4 style="margin:0;">${g.group_name}</h4>
                    <span style="font-size:12px; color:#777;">${g.member_count} Members</span>
                </div>
                <button class="btn-add-group" style="padding:5px 10px; cursor:pointer;" onclick="addToGroup(${g.group_id}, this)">
                    Add +
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error(err);
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:red;">Error loading groups.</div>';
    }
}

async function addToGroup(groupId, btnElement) {
    if(!currentItemToShare) return;
    
    const originalText = btnElement.innerText;
    btnElement.innerText = "...";
    btnElement.disabled = true;

    const destId = currentItemToShare.dest_id || currentItemToShare.id;

    try {
        const res = await fetch(`/api/groups/${groupId}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_id: destId })
        });

        const data = await res.json();

        if (!res.ok) {
            alert("⚠️ " + (data.error || "Failed to add"));
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        } else {
            btnElement.innerText = "Added ✅";
            btnElement.style.background = "#2ecc71"; 
            btnElement.style.color = "white";
        }
    } catch (err) {
        console.error(err);
        alert("Network Error");
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

// --- DETAILS MODAL (Updated with Activities) ---
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContentInject');

function openModal(id) {
    if(!detailModal || !modalContent) return;

    const dest = getItemById(id);
    if (!dest) return;

    const imgUrl = dest.images || 'https://via.placeholder.com/800x450';
    const mapQuery = encodeURIComponent(`${dest.name} ${dest.state} Malaysia`);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

    modalContent.innerHTML = `
        <div class="close-btn" onclick="closeDetailModal()" style="position:absolute; right:20px; top:20px; cursor:pointer; font-size:24px; color:white; background:rgba(0,0,0,0.5); width:40px; height:40px; border-radius:50%; text-align:center; line-height:40px; z-index:10;">×</div>
        <img src="${imgUrl}" class="modal-hero-img" style="width:100%; height:300px; object-fit:cover;">
        
        <div class="modal-body" style="padding:25px;">
            <div class="modal-flex" style="display:flex; flex-wrap:wrap; gap:20px;">
                <div class="modal-main" style="flex:2; min-width:300px;">
                    <span style="background:#eee; padding:4px 8px; border-radius:4px; font-size:12px; text-transform:uppercase; font-weight:bold; color:#555;">${dest.type}</span>
                    <span style="margin-left:5px; color:#777; font-size:14px;">📍 ${dest.state}</span>
                    <h1 class="modal-title" style="margin-top:10px; font-size:28px;">${dest.name}</h1>
                    
                    <h4 style="margin-top:20px; margin-bottom:5px; font-size:14px; color:#888; text-transform:uppercase;">About</h4>
                    <p class="modal-desc" style="line-height:1.6; color:#444;">${dest.description || "No description available."}</p>

                    <h4 style="margin-top:20px; margin-bottom:5px; font-size:14px; color:#888; text-transform:uppercase;">Activities</h4>
                    <p style="color:#444; line-height: 1.6;">
                        ${dest.activities || "Sightseeing, Photography, Relaxation"}
                    </p>
                </div>

                <div class="modal-sidebar" style="flex:1; min-width:200px;">
                    <div style="border:1px solid #eee; padding:15px; border-radius:8px; text-align:center; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                        <div style="font-size:12px; color:#888; text-transform:uppercase;">Estimated Cost</div>
                        <div style="font-weight:bold; font-size:22px; color:#2c3e50; margin:5px 0;">RM${dest.price_min} - ${dest.price_max}</div>
                    </div>
                    <div style="margin-top:15px;">
                        <a href="${mapUrl}" target="_blank" style="text-decoration:none;">
                            <button class="btn-map" style="width:100%; padding:12px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:500;">🗺️ Google Maps</button>
                        </a>
                        <button class="btn-modal-add" style="width:100%; padding:12px; margin-top:10px; background:#34495e; color:white; border:none; border-radius:5px; cursor:pointer;" onclick="closeDetailModal(); openShareModal('${dest.dest_id || dest.id}')">
                            🔗 Share
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    detailModal.style.display = 'flex';
}

function closeDetailModal() { 
    if(detailModal) detailModal.style.display = 'none'; 
}

// --- GLOBAL HELPERS ---

function highlightCurrentTab() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => link.classList.remove('active'));

    if (currentPath.includes('favourites.html')) {
        const favLink = document.querySelector('a[href*="favourites"]');
        if (favLink) favLink.classList.add('active');
    } else if (currentPath.includes('groups.html')) {
        const groupLink = document.querySelector('a[href*="groups"]');
        if (groupLink) groupLink.classList.add('active');
    } else {
        const exploreLink = document.querySelector('a[href="/user"]');
        if (exploreLink) exploreLink.classList.add('active');
    }
}

window.onclick = function(event) {
    const detailModal = document.getElementById('detailModal');
    const shareModal = document.getElementById('shareModal');
    
    if (event.target == detailModal) closeDetailModal();
    if (event.target == shareModal) closeShareModal();
}

// --- NAVBAR & USER ---
async function fetchUserProfile() {
    try {
        const res = await fetch('/api/user/me'); 
        if (res.ok) {
            const user = await res.json();
            const nameEl = document.getElementById('navUserName');
            if (nameEl) nameEl.textContent = user.name || "Traveler"; 
            const imgEl = document.getElementById('navUserImg');
            if (imgEl && user.picture) imgEl.src = user.picture;
        }
    } catch (err) { console.error("Profile load failed:", err); }
}

// Mobile Menu
const menuBtn = document.getElementById('mobile-menu-btn');
const navLinksContainer = document.getElementById('nav-links-container');
if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        navLinksContainer.classList.toggle('active');
        const bars = document.querySelectorAll('.bar');
        if (navLinksContainer.classList.contains('active')) {
            bars[0].style.transform = 'translateY(8px) rotate(45deg)';
            bars[1].style.opacity = '0';
            bars[2].style.transform = 'translateY(-8px) rotate(-45deg)';
        } else {
            bars[0].style.transform = 'none';
            bars[1].style.opacity = '1';
            bars[2].style.transform = 'none';
        }
    });
}