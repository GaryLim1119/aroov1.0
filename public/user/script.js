let currentPage = 1;
let currentItemToShare = null; // Stores the object we are about to share

// --- 1. LOAD DESTINATIONS (REAL DATABASE) ---
async function loadDestinations() {
    const search = document.getElementById('searchInput').value;
    const type = document.getElementById('typeFilter').value;
    const maxPrice = document.getElementById('priceFilter').value;

    // Construct URL with query parameters for your Servlet/API
    let url = `/api/destinations?page=${currentPage}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (maxPrice) url += `&maxPrice=${maxPrice}`;

    try {
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("Failed to fetch destinations");
        
        // Expecting JSON: { "data": [...], "totalPages": 5 }
        const { data, totalPages } = await res.json();
        
        renderGrid(data);
        renderPagination(totalPages);
    } catch (err) {
        console.error("Error loading destinations:", err);
        document.getElementById('destGrid').innerHTML = `<p style="text-align:center; padding:40px; color:red;">Failed to load data from server.</p>`;
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
        // Fallback image if database image is null
        const imgUrl = item.images || 'https://via.placeholder.com/400x300?text=Aroov+Trip';
        const heartClass = item.is_liked ? 'liked' : ''; 
        
        // Safe stringify for onClick handling
        // We remove single/double quotes to prevent HTML breaking
        const itemString = JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

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
                    <button class="icon-btn" onclick='openShareModal(${itemString})'>🔗</button>
                    <button class="icon-btn heart-btn ${heartClass}" onclick="toggleFavourite(this, '${item.dest_id}')">❤️</button>
                </div>
            </div>

            <button class="btn-details" onclick='openModal(${itemString})'>
                View Details
            </button>
        </div>
    `}).join('');
}

// --- 3. SHARE FUNCTIONALITY (REAL) ---

function openShareModal(item) {
    currentItemToShare = item; 
    const modal = document.getElementById('shareModal');
    modal.classList.add('active'); 
    
    // Immediately fetch real groups from DB
    fetchUserGroupsForShare();
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
}

function actionCopyLink() {
    // Creates a link: https://yourwebsite.com/destination/123
    const shareUrl = `${window.location.origin}/destination?id=${currentItemToShare.dest_id}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = document.querySelectorAll('.btn-share-action')[0];
        const originalText = btn.innerHTML;
        btn.innerHTML = "✅ Copied!";
        // Reset text after 2 seconds
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
}

function actionEmailShare() {
    // Opens user's default email client (Outlook/Gmail/Apple Mail)
    const subject = `Trip Recommendation: ${currentItemToShare.name}`;
    const body = `Hey,\n\nI found this amazing place on Aroov Trip and thought you'd like it!\n\nDestination: ${currentItemToShare.name}\nState: ${currentItemToShare.state}\nEst. Cost: RM${currentItemToShare.price_min} - RM${currentItemToShare.price_max}\n\nCheck it out here: ${window.location.origin}/destination?id=${currentItemToShare.dest_id}`;
    
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- 4. FETCH REAL GROUPS FROM DB ---
async function fetchUserGroupsForShare() {
    const listContainer = document.getElementById('shareGroupList');
    listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">Syncing with database...</div>';

    try {
        // REAL API CALL
        // This expects your backend to return: [{"group_id": 101, "group_name": "Bali Trip", "member_count": 5}, ...]
        const res = await fetch('/api/user/groups'); 

        // If user is not logged in, redirect
        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }

        if (!res.ok) throw new Error("Failed to fetch groups");

        const groups = await res.json();

        if (groups.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; font-size:13px;">You haven\'t joined any groups yet.<br><a href="/user/groups.html" style="color:var(--primary);">Create a group</a></div>';
            return;
        }

        // Render the list
        listContainer.innerHTML = groups.map(g => `
            <div class="share-group-item">
                <div class="share-group-info">
                    <h4>${g.group_name}</h4>
                    <span>${g.member_count} Members</span>
                </div>
                <button class="btn-add-group" onclick="addToGroup(${g.group_id}, this)">
                    Add +
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error(err);
        listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:red;">Error loading groups.</div>';
    }
}

// --- 5. ADD TO GROUP (UPDATED) ---
async function addToGroup(groupId, btnElement) {
    const originalText = btnElement.innerText;
    btnElement.innerText = "...";
    btnElement.disabled = true;

    try {
        const res = await fetch(`/api/groups/${groupId}/recommend`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ destination_id: currentItemToShare.dest_id })
        });

        // 1. Get the message from the server (Success OR Error)
        const data = await res.json();

        // 2. Check if the request failed (Status 400, 500, etc.)
        if (!res.ok) {
            // Display the specific error message sent by the backend
            alert("⚠️ " + (data.error || "Failed to add to group"));
            
            // Reset the button so it looks normal again
            btnElement.innerText = originalText;
            btnElement.disabled = false;
            return; // Stop execution here
        }

        // 3. Success UI
        btnElement.innerText = "Added ✅";
        btnElement.style.background = "#2ecc71"; 
        
        // Optional: specific success message if you want
        // alert("✅ " + (data.message || "Added successfully"));

    } catch (err) {
        console.error("Network Error:", err);
        alert("❌ Network error. Please check your connection.");
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

// --- 6. FAVOURITE LOGIC (REAL) ---
async function toggleFavourite(btn, itemId) {
    const isLiked = btn.classList.contains('liked');
    // Optimistic UI update (change color immediately)
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
        // Revert color if API failed
        btn.classList.toggle('liked'); 
        alert("⚠️ Connection error. Could not update favourites.");
    }
}

// --- 7. MODAL LOGIC ---
const detailModal = document.getElementById('detailModal');
const modalContent = document.getElementById('modalContentInject');

function openModal(item) {
    // Data Preparation
    const imgUrl = item.images || 'https://via.placeholder.com/800x450';
    const heartClass = item.is_liked ? 'liked' : '';
    // Safe stringify again for the buttons inside the modal
    const itemString = JSON.stringify(item).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

    const mapQuery = encodeURIComponent(`${item.name} ${item.state} Malaysia`);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

    modalContent.innerHTML = `
        <div class="close-btn" onclick="closeDetailModal()">×</div>
        <img src="${imgUrl}" class="modal-hero-img">
        <div class="modal-body">
            <div class="modal-flex">
                <div class="modal-main">
                    <h1 class="modal-title">${item.name}</h1>
                    <div class="modal-subtitle">
                        <span>📍 ${item.state}</span>
                        <span style="margin: 0 10px;">|</span>
                        <span>🏷️ ${item.type}</span>
                    </div>
                    <p class="modal-desc">${item.description || "No description available."}</p>
                </div>
                <div class="modal-sidebar">
                    <span class="modal-label">Est Cost</span>
                    <span class="modal-price-tag">RM${item.price_min} - RM${item.price_max}</span>
                    
                    <a href="${mapUrl}" target="_blank" style="text-decoration:none;">
                        <button class="btn-map">🗺️ View on Google Maps</button>
                    </a>
                    
                    <button class="btn-modal-add" style="background:#555; margin-top:10px;" onclick='openShareModal(${itemString})'>
                        🔗 Share / Add to Group
                    </button>

                    <button class="btn-modal-add heart-btn ${heartClass}" 
                        style="margin-top:10px; background: white; color: ${item.is_liked ? 'red' : '#555'}; border: 2px solid #eee;"
                        onclick="toggleFavourite(this, '${item.dest_id}')">
                        ❤️ Add to Favourites
                    </button>
                </div>
            </div>
        </div>
    `;
    detailModal.style.display = 'flex';
}

function closeDetailModal() { detailModal.style.display = 'none'; }

// Close modals on outside click
window.onclick = function(e) { 
    if (e.target == detailModal) closeDetailModal(); 
    if (e.target == document.getElementById('shareModal')) closeShareModal();
}

// Pagination logic
function renderPagination(total) {
    const nav = document.getElementById('pagination');
    nav.innerHTML = '';
    for(let i=1; i<=total; i++) {
        nav.innerHTML += `<button class="page-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
    }
}
function changePage(p) { currentPage = p; loadDestinations(); }
function applyFilters() { currentPage = 1; loadDestinations(); }

// Initial Load
loadDestinations();