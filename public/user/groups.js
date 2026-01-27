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
                <div class="trip-actions">
                    <button class="btn-vote ${t.user_has_voted ? 'voted' : ''}" onclick="vote(${t.trip_ref_id})">
                        ${t.user_has_voted ? '❤️' : '🤍'} ${t.vote_count} Votes
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
async function addToGroup(destId) {
    if(!currentGroupId) return alert("No group selected");
    
    try {
        const response = await fetch(`/api/groups/${currentGroupId}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_id: destId })
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ " + (result.message || "Shared successfully!"));
            loadRecommendations(); // Refresh list to show "Added" button
        } else {
            alert("⚠️ " + result.error); 
        }

    } catch (error) {
        console.error('Error:', error);
        alert("❌ An unexpected error occurred.");
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

// NEW FUNCTION: Load AI Recommendations
async function loadAIRecommendations() {
    const container = document.getElementById('ai-recommend-container');
    container.innerHTML = '<p style="text-align:center; padding:20px;">🤖 AI is finding the best spots for your group...</p>';

    try {
        const recommendations = await fetchAPI(`/api/groups/${currentGroupId}/ai-recommend`);
        
        // Use the Render Function you provided
        renderGridInContainer(recommendations, 'ai-recommend-container');

    } catch (err) {
        container.innerHTML = `<p style="text-align:center; color:red;">Could not load AI suggestions.</p>`;
        console.error(err);
    }
}

// ADAPTED RENDER FUNCTION (To work inside specific containers)
function renderGridInContainer(data, containerId) {
    const grid = document.getElementById(containerId);
    
    if (!data || data.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; color:#999; padding:20px;">
                <h4>No matches found 😕</h4>
                <p>Try updating member preferences.</p>
            </div>`;
        return;
    }

    // Reuse your exact card template
    grid.innerHTML = data.map(item => {
        const imgUrl = item.images || 'https://via.placeholder.com/400x300?text=Aroov+Trip';
        
        // Note: For AI recommendations, we typically want "Add to Group" not "Like"
        // But I will keep your card style. I added a specific "Add" button for this context.
        
        const priceDisplay = item.price_min > 0 ? `RM${item.price_min} - ${item.price_max}` : 'Free';
        
        // Safe quote handling
        const safeJson = JSON.stringify({destination_id: item.dest_id}).replace(/"/g, '&quot;');

        return `
        <div class="card" style="border: 2px solid #e0f2fe;"> <div class="card-image-wrapper">
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
                     <button class="btn-primary" style="padding:5px 10px; font-size:12px;" onclick="addToGroup('${item.dest_id}')">
                        Add ➕
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
}