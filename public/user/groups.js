let currentGroupId = null;
let currentUserRole = 'member';
let groupCalendar = null; // NEW: Store calendar instance

// ==========================================
// 0. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile(); 
    loadGroups();       
    highlightCurrentTab(); 

    // Mobile Menu Logic
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Initialize Calendar container if valid (rare case on load)
    const calendarEl = document.getElementById('full-calendar-container');
    if (calendarEl && !groupCalendar) {
        // defined later
    }
});

// --- API HELPER ---
async function fetchAPI(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
    }
    return data;
}

// --- FUNCTION TO HIGHLIGHT ACTIVE TAB ---
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

async function fetchUserProfile() {
    try {
        const res = await fetch('/api/user/me');
        if (res.ok) {
            const user = await res.json();
            document.getElementById('navUserName').textContent = user.name || "Traveler";
            if (user.picture) document.getElementById('navUserImg').src = user.picture;
        }
    } catch (e) { console.error("Profile error", e); }
}

// ==========================================
// 1. LOAD SIDEBAR (My Groups)
// ==========================================
async function loadGroups() {
    try {
        const groups = await fetchAPI('/api/user/groups');
        const list = document.getElementById('groupList');
        
        if (!groups || groups.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">No groups found.</p>';
            return;
        }

        list.innerHTML = groups.map(g => `
            <div class="group-item ${currentGroupId === g.group_id ? 'active' : ''}" onclick="selectGroup(${g.group_id}, this)">
                <h4 style="margin:0; font-size:16px;">${g.group_name}</h4>
                <span style="font-size:12px; color:#666;">${g.member_count} Member(s)</span>
            </div>
        `).join('');
    } catch (err) { console.error("Load Groups Error:", err); }
}

// ==========================================
// 2. SELECT GROUP & INIT DASHBOARD
// ==========================================
async function selectGroup(id, element) {
    currentGroupId = id;
    
    // Highlight sidebar item
    document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');

    // Show Content Panel
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('groupDetailPanel').style.display = 'block';

    // Update Header Text
    const groupName = element ? element.querySelector('h4').innerText : "Group";
    document.getElementById('groupHeaderTitle').innerText = groupName;

    // Default to first tab
    switchTab('destinations', document.querySelector('.tab-link'));
}

// ==========================================
// 3. TAB SWITCHING LOGIC (UPDATED)
// ==========================================
// UPDATE your switchTab function
function switchTab(tabName, btnElement) {
    // ... existing hide logic ...
    document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    if(btnElement) btnElement.classList.add('active');

    if (tabName === 'members') loadGroupMembers();
    if (tabName === 'destinations') loadTrips('destinationsList');
    if (tabName === 'vote') loadTrips('votingList'); 
    
    // UPDATE THIS PART
    if (tabName === 'recommend') {
        loadAIRecommendations(); // New AI Load
        loadRecommendations();   // Old Favourites Load
    }
    
    if (tabName === 'calendar') {
        setTimeout(() => loadGroupCalendar(currentGroupId), 100);
    }
}

// ==========================================
// 4. LOAD MEMBERS
// ==========================================
async function loadGroupMembers() {
    try {
        const data = await fetchAPI(`/api/groups/${currentGroupId}`);
        currentUserRole = data.currentUserRole;

        document.getElementById('groupActions').style.display = (currentUserRole === 'leader') ? 'flex' : 'none';

        const tbody = document.getElementById('memberListBody');
        if (!data.members || data.members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No members found</td></tr>';
        } else {
            tbody.innerHTML = data.members.map(m => `
                <tr>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${m.picture || 'https://via.placeholder.com/30'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
                            <span>${m.name}</span>
                        </div>
                    </td>
                    <td><span class="badge ${m.role}">${m.role}</span></td>
                    <td>${new Date(m.joined_at).toLocaleDateString()}</td>
                </tr>
            `).join('');
        }

        const pendingSection = document.getElementById('pendingSection');
        const pendingList = document.getElementById('pendingInvitesList');
        
        if (data.invites && data.invites.length > 0) {
            pendingSection.style.display = 'block';
            pendingList.innerHTML = data.invites.map(i => `
                <li style="margin-bottom:5px; color:#666;">
                    ✉️ ${i.email} <span style="font-size:12px; font-style:italic;">(Pending)</span>
                </li>
            `).join('');
        } else {
            pendingSection.style.display = 'none';
        }

    } catch (err) {
        alert("Error loading members: " + err.message);
    }
}

// ==========================================
// 5. LOAD TRIPS (Destinations & Voting)
// ==========================================
async function loadTrips(containerId) {
    try {
        const trips = await fetchAPI(`/api/groups/${currentGroupId}/trips`);
        const container = document.getElementById(containerId);

        if(!trips || trips.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:40px; color:#888;">
                    <h3>No destinations yet 🏝️</h3>
                    <p>Go to the <b>Recommend</b> tab to add places!</p>
                </div>`;
            return;
        }

        container.innerHTML = trips.map(t => `
            <div class="trip-card">
                <img src="${t.images}" class="trip-img" onerror="this.src='https://via.placeholder.com/300?text=No+Image'">
                <div class="trip-info">
                    <h4>${t.name}</h4>
                    <p>${t.state} • ${t.type}</p>
                    <div style="margin-top:5px; font-size:12px; color:#555;">
                        Shared by: <strong>${t.shared_by}</strong>
                    </div>
                </div>
                
                <div class="trip-actions" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                    
                    <button class="btn-vote ${t.user_has_voted ? 'voted' : ''}" onclick="vote(${t.trip_ref_id})">
                        ${t.user_has_voted ? '❤️' : '🤍'} ${t.vote_count} Votes
                    </button>

                    <button onclick="removeTrip(${t.trip_ref_id})" 
                            style="background:transparent; border:1px solid #ffcccc; color:red; padding:6px 10px; border-radius:15px; cursor:pointer; font-size:12px;">
                        Remove 🗑️
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function vote(tripRefId) {
    try {
        await fetchAPI('/api/groups/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tripRefId })
        });
        const activeTab = document.querySelector('.tab-link.active').innerText;
        if(activeTab.includes('Voting')) loadTrips('votingList');
        else loadTrips('destinationsList');
    } catch (err) {
        alert(err.message);
    }
}

// ==========================================
// 6. RECOMMENDATIONS
// ==========================================
async function loadRecommendations() {
    try {
        const favs = await fetchAPI('/api/user/favourites');
        const currentTrips = await fetchAPI(`/api/groups/${currentGroupId}/trips`);
        
        const existingIds = new Set(currentTrips.map(t => t.dest_id));
        const container = document.getElementById('recommendList');

        if(!favs || favs.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:30px;">
                    <p>You haven't liked any places yet.</p>
                    <a href="/user" style="color:#ff5a5f;">Go Explore</a>
                </div>`;
            return;
        }

        container.innerHTML = favs.map(f => {
            const isAdded = existingIds.has(f.dest_id);
            return `
            <div class="trip-card">
                <img src="${f.images}" class="trip-img">
                <div class="trip-info">
                    <h4>${f.name}</h4>
                    <p>${f.state}</p>
                </div>
                <div class="trip-actions">
                    ${isAdded 
                        ? `<button disabled style="background:#ddd; color:#888; cursor:not-allowed; border:none; padding:8px 16px; border-radius:6px;">Added ✅</button>`
                        : `<button class="btn-primary" onclick="addToGroup(${f.dest_id})">Add to Group ➕</button>`
                    }
                </div>
            </div>
            `;
        }).join('');
    } catch (err) { console.error(err); }
}

// FIX: Updated to use global currentGroupId
// ==========================================
// UPDATED: Add To Group
// ==========================================
async function addToGroup(destId, btnElement) {
    if(!currentGroupId) return alert("No group selected");
    
    // 1. Visually indicate loading
    const originalText = btnElement ? btnElement.innerText : '';
    if(btnElement) {
        btnElement.innerText = "Adding...";
        btnElement.disabled = true;
    }

    try {
        const response = await fetch(`/api/groups/${currentGroupId}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_id: destId })
        });

        const result = await response.json();

        if (response.ok) {
            // 2. Success: Change button permanently
            if(btnElement) {
                btnElement.innerHTML = "Added ✅";
                btnElement.style.background = "#ddd";
                btnElement.style.color = "#888";
                btnElement.style.cursor = "not-allowed";
            }
            // Optionally reload recommendations to keep everything in sync
            // loadRecommendations(); 
        } else {
            alert("⚠️ " + result.error);
            // Revert button if failed
            if(btnElement) {
                btnElement.innerText = originalText;
                btnElement.disabled = false;
            }
        }

    } catch (error) {
        console.error('Error:', error);
        alert("❌ An unexpected error occurred.");
        if(btnElement) {
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }
    }
}

// ==========================================
// 7. CALENDAR & BEST DATE LOGIC (NEW)
// ==========================================

async function loadGroupCalendar(groupId) {
    const calendarEl = document.getElementById('tab-calendar');
    
    // Clear previous but keep structure
    calendarEl.innerHTML = `
        <div id="calendar-recommendation" class="p-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg hidden" style="background:#eef6ff; border:1px solid #bddeff; padding:15px; border-radius:8px; margin-bottom:15px; display:none;">
            <h4 style="margin:0; color:#1e40af;">💡 Best Time to Travel</h4>
            <p id="recommendation-text" style="margin:5px 0 0 0; font-size:14px; color:#1e3a8a;">Analyzing...</p>
        </div>
        <div id="full-calendar-container" style="background:white; padding:15px; border-radius:10px;"></div>
    `;

    try {
        const events = await fetchAPI(`/api/groups/${groupId}/calendar`);

        // 1. Calculate Best Dates
        calculateBestDates(events);

        // 2. Render Calendar
        const calContainer = document.getElementById('full-calendar-container');
        
        const calendar = new FullCalendar.Calendar(calContainer, {
            initialView: 'dayGridMonth',
            headerToolbar: { left: 'prev,next', center: 'title', right: 'today' },
            events: events,
            height: 500,
            eventDidMount: function(info) {
                // Tooltip
                info.el.title = `${info.event.title}: ${info.event.extendedProps.note}`;
            }
        });
        
        calendar.render();

    } catch (err) {
        console.error("Calendar Error", err);
        calendarEl.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Error loading calendar data.</p>`;
    }
}

function calculateBestDates(events) {
    // Filter only "Available" events (Ignore Busy)
    const availEvents = events.filter(e => e.extendedProps.note !== 'Busy');
    
    if(availEvents.length === 0) {
        document.getElementById('calendar-recommendation').style.display = 'none';
        return;
    }

    // Map: "YYYY-MM-DD" -> Count
    const dateCounts = {};
    
    availEvents.forEach(ev => {
        let current = new Date(ev.start);
        const end = new Date(ev.end);
        
        while(current < end) {
            const dateStr = current.toISOString().split('T')[0];
            dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
            current.setDate(current.getDate() + 1);
        }
    });

    // Find Max Overlap
    let maxCount = 0;
    let bestDates = [];

    Object.entries(dateCounts).forEach(([date, count]) => {
        if (count > maxCount) {
            maxCount = count;
            bestDates = [date];
        } else if (count === maxCount) {
            bestDates.push(date);
        }
    });

    // Display Result
    const recBox = document.getElementById('calendar-recommendation');
    const recText = document.getElementById('recommendation-text');
    
    if (maxCount > 1) {
        bestDates.sort();
        const displayDates = bestDates.slice(0, 3).join(', ') + (bestDates.length > 3 ? '...' : '');
        
        recBox.style.display = 'block';
        recText.innerHTML = `We found a match! <strong>${maxCount} members</strong> are available on these dates: <br/> 📅 <strong>${displayDates}</strong>`;
    } else {
        recBox.style.display = 'none';
    }
}

// ==========================================
// 8. MODAL ACTIONS
// ==========================================
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function submitCreateGroup() {
    const name = document.getElementById('newGroupName').value;
    if(!name) return;
    try {
        await fetchAPI('/api/groups', { 
            method: 'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({name})
        });
        closeModal('modalCreate');
        document.getElementById('newGroupName').value = '';
        loadGroups();
    } catch(e) { alert(e.message); }
}

async function submitInvite() {
    const email = document.getElementById('inviteEmail').value;
    try {
        await fetchAPI(`/api/groups/${currentGroupId}/invite`, { 
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({email})
        });
        alert("Invite sent!");
        closeModal('modalInvite');
        document.getElementById('inviteEmail').value = '';
        loadGroupMembers(); 
    } catch(e) { alert(e.message); }
}

async function submitEditGroup() {
    const name = document.getElementById('editGroupName').value;
    if(!name) return;
    try {
        await fetchAPI(`/api/groups/${currentGroupId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name })
        });
        closeModal('modalEdit');
        document.getElementById('groupHeaderTitle').innerText = name; 
        loadGroups(); 
    } catch (e) { alert(e.message); }
}

async function submitDeleteGroup() {
    try {
        await fetchAPI(`/api/groups/${currentGroupId}`, { method: 'DELETE' });
        closeModal('modalDelete');
        window.location.reload(); 
    } catch (e) { alert(e.message); }
}

// ==========================================
// UPDATED: Load AI Recommendations
// ==========================================
async function loadAIRecommendations() {
    const container = document.getElementById('ai-recommend-container');
    container.innerHTML = '<p style="text-align:center; padding:20px;">🤖 AI is finding the best spots for your group...</p>';

    try {
        // 1. Fetch AI Recs AND Current Trips (to check what is added)
        const [recommendations, currentTrips] = await Promise.all([
            fetchAPI(`/api/groups/${currentGroupId}/ai-recommend`),
            fetchAPI(`/api/groups/${currentGroupId}/trips`)
        ]);

        // 2. Create a Set of existing Destination IDs for fast lookup
        const existingIds = new Set(currentTrips.map(t => t.dest_id));
        
        // 3. Pass existingIds to the render function
        renderGridInContainer(recommendations, 'ai-recommend-container', existingIds);

    } catch (err) {
        container.innerHTML = `<p style="text-align:center; color:red;">Could not load AI suggestions.</p>`;
        console.error(err);
    }
}

// ADAPTED RENDER FUNCTION (To work inside specific containers)
// Added 3rd parameter: existingIds (defaults to empty if not provided)
function renderGridInContainer(data, containerId, existingIds = new Set()) {
    const grid = document.getElementById(containerId);
    
    if (!data || data.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; color:#999; padding:20px;">
                <h4>No matches found 😕</h4>
                <p>Try updating member preferences.</p>
            </div>`;
        return;
    }

    grid.innerHTML = data.map(item => {
        const imgUrl = item.images || 'https://via.placeholder.com/400x300?text=Aroov+Trip';
        const priceDisplay = item.price_min > 0 ? `RM${item.price_min} - ${item.price_max}` : 'Free';
        
        // Prepare Full Object for the Modal
        const safeFullItem = JSON.stringify(item).replace(/"/g, '&quot;');

        const destId = item.dest_id;

        // --- CHANGE START: Determine Button State ---
        const isAdded = existingIds.has(destId);

        let buttonHtml;
        if (isAdded) {
            // Disabled "Added" Button
            buttonHtml = `<button disabled style="padding:8px 12px; font-size:12px; border:none; background:#ddd; color:#888; border-radius:20px; cursor:not-allowed;">Added ✅</button>`;
        } else {
            // Normal "Add" Button
            buttonHtml = `<button class="btn-primary" style="padding:8px 12px; font-size:12px; border:none; background:#222; color:#fff; border-radius:20px; cursor:pointer;" onclick="addToGroup('${destId}', this)">Add ➕</button>`;
        }
        // --- CHANGE END ---

        return `
        <div class="card" style="border: 2px solid #e0f2fe;"> 
            <div class="card-image-wrapper">
                <img src="${imgUrl}" class="card-img" alt="${item.name}">
                <div class="card-overlay">
                    <div class="card-title">${item.name}</div>
                    <div class="card-location"><span>📍 ${item.state} • ${item.type}</span></div>
                </div>
                <div style="position:absolute; top:10px; right:10px; background:#3b82f6; color:white; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold;">
                    ${Math.round(item.similarity * 100)}% Match
                </div>
            </div>
            
            <div class="card-bottom">
                <div class="card-price">
                    <span class="price-label">Est. Price</span>
                    <span class="price-value">${priceDisplay}</span>
                </div>
                <div class="card-icons">
                     ${buttonHtml}  </div>
            </div>

            <button class="btn-details" onclick="openModal(${safeFullItem})">
                View Details
            </button>
        </div>
    `}).join('');
}

// --- 1. OPEN MODAL FUNCTION ---
function openModal(item) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('modalContentInject');

    // Safety check: Does the modal exist in HTML?
    if (!modal || !content) {
        console.error("Error: Modal HTML element not found. Check Step 1.");
        return;
    }

    // Handle data: if it's a string (from HTML), parse it. If object, use it.
    const dest = (typeof item === 'string') ? JSON.parse(item) : item;
    
    // Fallback images/text
    const imgUrl = dest.images || 'https://via.placeholder.com/800x450';
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.name + ' ' + dest.state)}`;

    // Inject Content
    content.innerHTML = `
        <div class="close-btn" onclick="closeDetailModal()">×</div>
        <img src="${imgUrl}" class="modal-hero-img">
        
        <div class="modal-body">
            <div class="modal-flex">
                <div class="modal-main">
                    <span style="background:#eee; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold; color:#555;">${dest.type || 'Destination'}</span>
                    <span style="margin-left:5px; color:#777; font-size:14px;">📍 ${dest.state}</span>
                    
                    <h1 class="modal-title" style="margin-top:10px;">${dest.name}</h1>
                    
                    <p class="modal-desc">
                        ${dest.description || "No description available for this location."}
                    </p>

                    <div style="margin-top:20px; background:#f9f9f9; padding:15px; border-radius:8px;">
                        <h4 style="margin:0 0 5px 0;">🏃🏻‍♂️ Activities</h4>
                        <p style="margin:0; color:#555;">${dest.activities || "Sightseeing"}</p>
                    </div>
                </div>

                <div class="modal-sidebar">
                    <div style="border:1px solid #eee; padding:15px; border-radius:8px; text-align:center; background:white;">
                        <div style="font-size:12px; color:#888;">Estimated Cost</div>
                        <div style="font-weight:bold; font-size:22px; color:#2c3e50; margin:5px 0;">
                            RM${dest.price_min} - ${dest.price_max}
                        </div>
                    </div>
                    
                    <a href="${mapUrl}" target="_blank" style="text-decoration:none;">
                        <button class="btn-map">🗺️ View on Google Maps</button>
                    </a>
                </div>
            </div>
        </div>
    `;

    // Show the modal (CSS must be set to display:flex or block)
    modal.style.display = 'flex';
}

// ==========================================
// NEW: Remove Trip Function
// ==========================================
async function removeTrip(tripRefId) {
    // 1. Confirm before deleting to prevent accidents
    if (!confirm("Are you sure you want to remove this destination from the group?")) {
        return;
    }

    try {
        // 2. Call the Delete API
        // Note: You need to make sure your backend supports DELETE at this URL
        await fetchAPI(`/api/groups/${currentGroupId}/trips/${tripRefId}`, {
            method: 'DELETE'
        });

        // 3. Refresh the list to show it's gone
        const activeTab = document.querySelector('.tab-link.active').innerText;
        
        // Reload the correct list depending on which tab is open
        if(activeTab.includes('Voting')) {
             loadTrips('votingList');
        } else {
             loadTrips('destinationsList');
        }

    } catch (err) {
        console.error(err);
        alert("Unable to remove trip: " + err.message);
    }
}

// --- 2. CLOSE MODAL FUNCTION ---
function closeDetailModal() {
    const modal = document.getElementById('detailModal');
    if (modal) modal.style.display = 'none';
}

// --- 3. CLOSE ON OUTSIDE CLICK ---
window.onclick = function(event) {
    const modal = document.getElementById('detailModal');
    if (event.target === modal) {
        closeDetailModal();
    }
}