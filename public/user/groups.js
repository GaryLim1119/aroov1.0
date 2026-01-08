let currentGroupId = null;
let currentUserRole = 'member'; 

window.onload = function() {
    loadGroups();
};

// --- API HELPER ---
async function fetchAPI(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
    }
    return data;
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
// 3. TAB SWITCHING LOGIC
// ==========================================
function switchTab(tabName, btnElement) {
    // Hide all tabs
    document.querySelectorAll('.tab-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-link').forEach(el => el.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    if(btnElement) btnElement.classList.add('active');

    // Load Data for specific tab
    if (tabName === 'members') loadGroupMembers();
    if (tabName === 'destinations') loadTrips('destinationsList');
    if (tabName === 'vote') loadTrips('votingList'); 
    if (tabName === 'recommend') loadRecommendations();
}

// ==========================================
// 4. LOAD MEMBERS (Matches fixed Backend)
// ==========================================
async function loadGroupMembers() {
    try {
        // Fetch: returns { members: [], invites: [], currentUserRole: "" }
        const data = await fetchAPI(`/api/groups/${currentGroupId}`);
        currentUserRole = data.currentUserRole;

        // Show/Hide Admin Buttons
        document.getElementById('groupActions').style.display = (currentUserRole === 'leader') ? 'flex' : 'none';

        // Render Members
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

        // Render Invites
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
        // Refresh the current list to show new count
        const activeTab = document.querySelector('.tab-link.active').innerText;
        if(activeTab.includes('Voting')) loadTrips('votingList');
        else loadTrips('destinationsList');
    } catch (err) {
        alert(err.message);
    }
}

// ==========================================
// 6. RECOMMENDATIONS (Add from Favourites)
// ==========================================
async function loadRecommendations() {
    try {
        const favs = await fetchAPI('/api/user/favourites');
        const currentTrips = await fetchAPI(`/api/groups/${currentGroupId}/trips`);
        
        // Create Set of IDs already in the group for fast lookup
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

async function addToGroup(groupId, destId) {
    try {
        const response = await fetch(`/api/groups/${groupId}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination_id: destId })
        });

        const result = await response.json();

        if (response.ok) {
            alert("✅ " + (result.message || "Shared successfully!"));
            closeModal(); // Close your popup if you have one
        } else {
            // --- THIS LINE MAKES THE MESSAGE APPEAR ---
            alert("⚠️ " + result.error); 
        }

    } catch (error) {
        console.error('Error:', error);
        alert("❌ An unexpected error occurred.");
    }
}

// ==========================================
// 7. MODAL ACTIONS
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
        document.getElementById('newGroupName').value = ''; // Reset input
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
        loadGroupMembers(); // Refresh pending list
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
        document.getElementById('groupHeaderTitle').innerText = name; // Update header immediately
        loadGroups(); // Update sidebar
    } catch (e) { alert(e.message); }
}

async function submitDeleteGroup() {
    try {
        await fetchAPI(`/api/groups/${currentGroupId}`, { method: 'DELETE' });
        closeModal('modalDelete');
        window.location.reload(); // Reload page to clear selection
    } catch (e) { alert(e.message); }
}