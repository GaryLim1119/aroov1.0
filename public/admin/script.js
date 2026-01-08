let currentPage = 1;
let selectedFile = null;
let existingImageUrl = "";
let searchTimeout;

// UI Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');

// --- 1. IMAGE UPLOAD LOGIC ---
dropZone.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFiles(e.target.files[0]);
dropZone.ondragover = (e) => e.preventDefault();
dropZone.ondrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files[0]); };

function handleFiles(file) {
    if(!file) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { preview.src = e.target.result; preview.style.display = 'block'; };
    reader.readAsDataURL(file);
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg; t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

// --- 2. SEARCH & FILTER LOGIC ---

// Wait for typing to stop before searching (Debounce)
function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        changePage(1);
    }, 400);
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterPrice').value = '';
    document.getElementById('filterIncomplete').checked = false;
    changePage(1);
}

// --- 3. LOAD DATA (THE CORE FUNCTION) ---
async function loadData() {
    // Collect all filter values
    const search = document.getElementById('searchInput').value;
    const type = document.getElementById('filterType').value;
    const maxPrice = document.getElementById('filterPrice').value;
    const incomplete = document.getElementById('filterIncomplete').checked;

    // Build URL
    let url = `/api/destinations?page=${currentPage}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;
    if (maxPrice) url += `&maxPrice=${maxPrice}`;
    if (incomplete) url += `&incomplete=true`;

    try {
        const res = await fetch(url);
        const { data, totalPages } = await res.json();

        const tbody = document.getElementById('tableBody');
        
        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color:#999;">No results found.</td></tr>`;
            renderPagination(0);
            return;
        }

        tbody.innerHTML = data.map(item => {
            // Highlight rows that have missing data
            const isBadData = (!item.description || !item.images || !item.type);
            const rowStyle = isBadData ? 'background-color: #fff0f0;' : ''; // Red tint for bad data

            return `
            <tr style="${rowStyle}">
                <td class="col-img">
                    <img src="${item.images}" class="thumb" onerror="this.src='https://via.placeholder.com/48?text=No+Img'">
                </td>
                <td class="col-info">
                    <span class="id-badge">#${item.dest_id}</span>
                    <div style="font-weight:600;">${item.name}</div>
                    <div style="font-size:11px; color:#86868b;">${item.state}</div>
                </td>
                <td class="col-meta">
                    <div style="font-size:11px; color:#666;">${item.type || '<span style="color:red; font-weight:bold;">Missing Type</span>'}</div>
                    <div style="font-size:10px; color:#999;">${item.activities || '-'}</div>
                </td>
                <td class="col-price">
                    <span class="price-tag">RM${item.price_min}-${item.price_max}</span>
                </td>
                <td class="col-map">
                    ${item.maps_place_id ? 
                    `<a href="${item.maps_place_id}" target="_blank" class="icon-btn" title="View on Map">✅</a>` 
                    : '<span style="color:#ccc; font-size:12px;">-</span>'}
                </td>
                <td class="col-act">
                    <button onclick='editItem(${JSON.stringify(item).replace(/'/g, "&apos;")})' style="border:none; background:none; cursor:pointer; margin-right:8px; font-size:16px;">✏️</button>
                    <button onclick="deleteItem(${item.dest_id})" style="border:none; background:none; cursor:pointer; font-size:16px;">🗑️</button>
                </td>
            </tr>
        `}).join('');
        
        renderPagination(totalPages);

    } catch (err) {
        console.error("Error loading data:", err);
    }
}

// --- 4. PAGINATION ---
function renderPagination(total) {
    const nav = document.getElementById('pagination');
    nav.innerHTML = '';
    
    // Prevent too many buttons if lots of pages (Simple logic: show all for now)
    for(let i=1; i<=total; i++) {
        nav.innerHTML += `<button class="page-btn ${i===currentPage?'active':''}" onclick="changePage(${i})">${i}</button>`;
    }
}
function changePage(p) { currentPage = p; loadData(); }

// --- 5. FORM SUBMISSION ---
document.getElementById('destForm').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    
    const fields = ['dest_id','name','state','description','activities','type','price_min','price_max','latitude','longtitude','maps_place_id'];
    fields.forEach(f => {
        const input = document.getElementById(f);
        if(input) formData.append(f, input.value);
    });

    formData.append('existingImage', existingImageUrl);
    if(selectedFile) formData.append('imageFile', selectedFile);

    try {
        const res = await fetch('/api/destinations', { method: 'POST', body: formData });
        if (res.ok) {
            showToast("Saved Successfully");
            resetForm(); 
            loadData();
        } else {
            const errData = await res.json();
            alert("Error saving: " + errData.error);
        }
    } catch(err) {
        alert("Network Error: " + err.message);
    }
};

// --- 6. EDIT & DELETE ACTIONS ---
function editItem(item) {
    const fields = ['dest_id','name','state','description','activities','type','price_min','price_max','latitude','longtitude','maps_place_id'];
    fields.forEach(f => {
        const el = document.getElementById(f);
        if(el) el.value = item[f] || '';
    });
    
    existingImageUrl = item.images;
    preview.src = item.images; 
    preview.style.display = 'block';
    
    document.getElementById('formTitle').innerText = "Edit Destination #" + item.dest_id;
    document.querySelector('.scroll-area').scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(id) {
    if(confirm('Are you sure you want to delete this destination?')) {
        await fetch(`/api/destinations/${id}`, { method: 'DELETE' });
        showToast("Deleted"); 
        loadData();
    }
}

function resetForm() {
    document.getElementById('destForm').reset();
    document.getElementById('dest_id').value = '';
    preview.style.display = 'none'; selectedFile = null;
    document.getElementById('formTitle').innerText = "Add New";
}

// Initial Load
loadData();