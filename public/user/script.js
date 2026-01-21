// /public/user/script.js

let currentPage = 1;
let currentItemToShare = null; 

// --- 1. LOAD DESTINATIONS ---
async function loadDestinations() {
    const search = document.getElementById('searchInput').value;
    const type = document.getElementById('typeFilter').value;
    const maxPrice = document.getElementById('priceFilter').value;

    let url = `/api/destinations?page=${currentPage}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (maxPrice) url += `&maxPrice=${maxPrice}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch destinations");
        
        const { data, totalPages } = await res.json();
        renderGrid(data);
        renderPagination(totalPages);
    } catch (err) {
        console.error("Error loading destinations:", err);
        const grid = document.getElementById('destGrid');
        if(grid) grid.innerHTML = `<p style="text-align:center; padding:40px; color:red;">Failed to load data.</p>`;
    }
}

// --- 2. RENDER GRID ---
function renderGrid(data) {
    const grid = document.getElementById('destGrid');
    
    if (!data || data.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#999; padding:40px;">No results found.</p>`;
        return;
    }

    grid.innerHTML = data.map(item => {
        const imgUrl = item.images || 'https://via.placeholder.com/400x300?text=Aroov+Trip';
        const heartClass = item.is_liked ? 'liked' : ''; 
        
        // SAFE STRINGIFY: Fixes the issue where buttons wouldn't click
        const safeItem = JSON.stringify(item).replace(/"/g, '&quot;');

        return `
        <div class="card">
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
                    <button class="icon-btn" onclick="openShareModal(${safeItem})">🔗</button>
                    <button class="icon-btn heart-btn ${heartClass}" onclick="toggleFavourite(this, '${item.dest_id}')">❤️</button>
                </div>
            </div>

            <button class="btn-details" onclick="openModal(${safeItem})">
                View Details
            </button>
        </div>
    `}).join('');
}

// --- 3. SHARE MODAL ---
function openShareModal(item) {
    currentItemToShare = item; 
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
    const shareUrl = `${window.location.origin}/destination?id=${currentItemToShare.dest_id}`;
    
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
    const body = `Hey,\n\nI found this amazing place on Aroov Trip!\n\nDestination: ${currentItemToShare.name}\nState: ${currentItemToShare.state}\nEst. Cost: RM${currentItemToShare.price_min} - RM${currentItemToShare.price_max}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- 4. FETCH GROUPS ---
async function fetchUserGroupsForShare() {
    const listContainer = document.getElementById('shareGroupList');
    if(!listContainer) return;
    
    listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">Syncing...</div>';

    try {
        const res = await fetch('/api/user/groups'); 
        if (res.status === 401) {
            listContainer.innerHTML = '<div style="padding:10px; text-align:center;">Please <a href="/login">login</a> to share.</div>';
            return;
        }

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

// --- 5. ADD TO GROUP ---
async function addToGroup(groupId, btnElement) {
    if(!currentItemToShare) return;
    
    const originalText = btnElement.innerText;
    btnElement.innerText = "...";
    btnElement.disabled = true;

    try {
        const res = await fetch(`/api/groups/${groupId}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_id: currentItemToShare.dest_id })
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

// --- 6. FAVOURITES ---
async function toggleFavourite(btn, itemId) {
    const isLiked = btn.classList.contains('liked');
    btn.classList.toggle('liked'); 

    try {
        const method = isLiked ? 'DELETE' : 'POST';
        const url = isLiked ? `/api/user/favourites/${itemId}` : `/api/user/favourites`;
        const body = isLiked ? null : JSON.stringify({ destinationId: itemId });

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: body
        });

        if (!res.ok) throw new Error("API Failed");
    } catch (err) {
        console.error("Fav Error:", err);
        btn.classList.toggle('liked'); 
        alert("Connection error.");
    }
}

// --- 7. DETAILS MODAL (UPDATED TO SHOW ACTIVITIES & PRICE) ---
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContentInject');

function openModal(item) {
    if(!detailModal || !modalContent) return;

    const imgUrl = item.images || 'https://via.placeholder.com/800x450';
    // Use &quot; replacement to be extra safe with passing objects
    const safeItem = JSON.stringify(item).replace(/"/g, '&quot;');
    
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ' ' + item.state + ' Malaysia')}`;

    // ✅ HERE IS THE UPDATED LAYOUT WITH ACTIVITIES, TYPE, AND PRICE
    modalContent.innerHTML = `
        <div class="close-btn" onclick="closeDetailModal()" style="position:absolute; right:20px; top:20px; cursor:pointer; font-size:24px; color:white; background:rgba(0,0,0,0.5); width:40px; height:40px; border-radius:50%; text-align:center; line-height:40px; z-index:10;">×</div>
        <img src="${imgUrl}" class="modal-hero-img" style="width:100%; height:300px; object-fit:cover;">
        
        <div class="modal-body" style="padding:25px;">
            <div class="modal-flex" style="display:flex; flex-wrap:wrap; gap:20px;">
                
                <div class="modal-main" style="flex:2; min-width:300px;">
                    <span style="background:#eee; padding:4px 8px; border-radius:4px; font-size:12px; text-transform:uppercase; font-weight:bold; color:#555;">${item.type}</span>
                    <span style="margin-left:5px; color:#777; font-size:14px;">📍 ${item.state}</span>
                    
                    <h1 class="modal-title" style="margin-top:10px; font-size:28px;">${item.name}</h1>
                    
                    <p class="modal-desc" style="margin-top:15px; line-height:1.6; color:#444;">
                        ${item.description || "No description available for this location."}
                    </p>

                    <div style="margin-top:20px; background:#f9f9f9; padding:15px; border-radius:8px;">
                        <h4 style="margin:0 0 5px 0;">🏃🏻‍♂️ Popular Activities</h4>
                        <p style="margin:0; color:#555;">${item.activities || "Sightseeing, Relaxation, Photography"}</p>
                    </div>
                </div>

                <div class="modal-sidebar" style="flex:1; min-width:200px;">
                    <div style="border:1px solid #eee; padding:15px; border-radius:8px; text-align:center; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
                        <div style="font-size:12px; color:#888; text-transform:uppercase;">Estimated Cost</div>
                        <div style="font-weight:bold; font-size:22px; color:#2c3e50; margin:5px 0;">RM${item.price_min} - ${item.price_max}</div>
                        <div style="font-size:11px; color:#999;">per person / trip</div>
                    </div>
                    
                    <div style="margin-top:15px;">
                        <a href="${mapUrl}" target="_blank" style="text-decoration:none;">
                            <button class="btn-map" style="width:100%; padding:12px; background:#3498db; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:500;">
                                🗺️ View on Google Maps
                            </button>
                        </a>
                        
                        <button class="btn-modal-add" style="width:100%; padding:12px; margin-top:10px; background:#34495e; color:white; border:none; border-radius:5px; cursor:pointer;" onclick="closeDetailModal(); openShareModal(${safeItem})">
                            🔗 Share / Add to Group
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

// Close modals on outside click
window.onclick = function(e) { 
    if (e.target == detailModal) closeDetailModal(); 
    const shareModal = document.getElementById('shareModal');
    if (e.target == shareModal) closeShareModal();
}

// --- 8. USER PROFILE & NAVBAR LOGIC ---

// Fetch User Data for Navbar
async function fetchUserProfile() {
    try {
        const res = await fetch('/api/user/me'); 
        
        if (res.ok) {
            const user = await res.json();
            
            // Debug: Check console to ensure data is arriving
            console.log("User fetched:", user);

            // 1. Update Name (using 'name' column)
            const nameEl = document.getElementById('navUserName');
            if (nameEl) {
                // Use user.name from your DB, fallback to "Traveler"
                nameEl.textContent = user.name || "Traveler"; 
            }

            // 2. Update Image (using 'picture' column)
            const imgEl = document.getElementById('navUserImg');
            if (imgEl) {
                // Use user.picture from your DB
                if (user.picture && user.picture.trim() !== "") {
                    imgEl.src = user.picture;
                }
            }
        }
    } catch (err) {
        console.error("Failed to load user profile", err);
    }
}

// Mobile Menu Toggle
const menuBtn = document.getElementById('mobile-menu-btn');
const navLinks = document.getElementById('nav-links-container');

if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        
        // Optional: Animate hamburger bars
        const bars = document.querySelectorAll('.bar');
        if (navLinks.classList.contains('active')) {
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



// Pagination logic
function renderPagination(total) {
    const nav = document.getElementById('pagination');
    if(!nav) return;
    nav.innerHTML = '';
    for(let i=1; i<=total; i++) {
        nav.innerHTML += `<button class="page-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
    }
}
function changePage(p) { currentPage = p; loadDestinations(); }
function applyFilters() { currentPage = 1; loadDestinations(); }



// Add this to your existing DOMContentLoaded event
document.addEventListener("DOMContentLoaded", () => {
    loadDestinations(); // Your existing function
    fetchUserProfile(); // New function
});