// Dynamically detect API base URL based on current host
// This works for localhost, local network IP, ngrok, or any external URL
const API_BASE = `${window.location.origin}/api`;

let fieldsConfig = [];
let currentScoutingType = null;
let currentSortColumn = 'timestamp';
let currentSortOrder = 'desc';
let isAuthenticated = false;
let currentUser = null;
let canEditData = false;
let scoutingTypesList = {};

// Build URL for View Data (for redirect after sign-in)
function getViewDataUrl() {
    const type = currentScoutingType || 'prematch';
    return `${window.location.pathname || '/'}?view=data&type=${type}`;
}

// Check auth state (for edit/delete on View Data)
async function checkAuth() {
    try {
        const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            isAuthenticated = true;
            currentUser = data.user || null;
            canEditData = data.canEdit === true;
        } else {
            isAuthenticated = false;
            currentUser = null;
            canEditData = false;
        }
    } catch (e) {
        isAuthenticated = false;
        currentUser = null;
        canEditData = false;
    }
    updateAuthUI();
    return isAuthenticated;
}

function updateAuthUI() {
    const authLink = document.getElementById('auth-link');
    const logoutBtn = document.getElementById('logout-btn');
    const authStatus = document.getElementById('auth-status');
    const authHint = document.getElementById('auth-hint');
    if (!authLink) return;
    const returnTo = document.getElementById('view-data-section') && document.getElementById('view-data-section').style.display !== 'none'
        ? getViewDataUrl()
        : (window.location.pathname || '/') + (window.location.search || '');
    authLink.href = '/auth/google?returnTo=' + encodeURIComponent(returnTo);
    if (isAuthenticated && currentUser) {
        authLink.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (authStatus) {
            authStatus.textContent = `Signed in as ${currentUser.displayName || currentUser.email || 'Google'}`;
            authStatus.style.display = 'inline';
        }
        if (authHint) authHint.style.display = canEditData ? 'none' : 'block';
    } else {
        authLink.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (authStatus) authStatus.style.display = 'none';
        if (authHint) authHint.style.display = 'block';
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
    isAuthenticated = false;
    currentUser = null;
    canEditData = false;
    updateAuthUI();
    if (document.getElementById('view-data-section').style.display !== 'none') {
        loadData();
    }
}

// Initialize app
async function init() {
    // Check if server is running
    try {
        const healthCheck = await fetch(`${API_BASE}/health`);
        if (!healthCheck.ok) {
            throw new Error('Server health check failed');
        }
        const health = await healthCheck.json();
        console.log('Server is running. Scouting types available:', health.scoutingTypes);
    } catch (error) {
        console.error('Server health check failed:', error);
        const grid = document.getElementById('scouting-types-grid');
        grid.innerHTML = `
            <div style="color: red; padding: 20px; text-align: center;">
                <p><strong>Cannot connect to server</strong></p>
                <p>Make sure the server is running:</p>
                <p><code>npm start</code></p>
                <p>Server should be at: ${API_BASE.replace('/api', '')}</p>
            </div>
        `;
        return;
    }
    
    await loadScoutingTypes();
    await checkAuth();
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'failed') {
        window.history.replaceState({}, '', window.location.pathname);
        showMessage('Google sign-in failed. Try again.', 'error');
    }
    if (params.get('view') === 'data' && params.get('type')) {
        openViewDataSection(params.get('type'));
        if (params.get('auth') === 'success') {
            window.history.replaceState({}, '', getViewDataUrl());
            await checkAuth();
        }
    } else {
        if (params.get('auth') === 'success') {
            window.history.replaceState({}, '', window.location.pathname);
            await checkAuth();
        }
        showMainMenu();
    }
}

// Load available scouting types
async function loadScoutingTypes() {
    try {
        const response = await fetch(`${API_BASE}/scouting-types`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Received scouting types:', data);
        
        if (!data.scoutingTypes || Object.keys(data.scoutingTypes).length === 0) {
            console.error('No scouting types received');
            document.getElementById('scouting-types-grid').innerHTML = 
                '<p style="color: red; padding: 20px;">No scouting types configured. Please check the server configuration.</p>';
            return;
        }
        
        scoutingTypesList = data.scoutingTypes || {};
        renderScoutingTypes(scoutingTypesList);
    } catch (error) {
        console.error('Error loading scouting types:', error);
        const grid = document.getElementById('scouting-types-grid');
        grid.innerHTML = `
            <div style="color: red; padding: 20px; text-align: center;">
                <p><strong>Error loading scouting types</strong></p>
                <p>${error.message}</p>
                <p>Make sure the server is running on ${API_BASE}</p>
            </div>
        `;
    }
}

// Render main menu: scouting type cards + View Data card
function renderScoutingTypes(types) {
    const grid = document.getElementById('scouting-types-grid');
    grid.innerHTML = '';

    Object.keys(types).forEach(typeKey => {
        const type = types[typeKey];
        const card = document.createElement('div');
        card.className = 'scouting-type-card';
        card.onclick = () => selectScoutingType(typeKey);
        card.innerHTML = `<h3>${type.name}</h3><p>${type.description}</p>`;
        grid.appendChild(card);
    });

    const viewDataCard = document.createElement('div');
    viewDataCard.className = 'scouting-type-card view-data-card';
    viewDataCard.onclick = () => openViewDataSection(Object.keys(types)[0] || 'prematch');
    viewDataCard.innerHTML = '<h3>📊 View Data</h3><p>View, edit, or remove scouting data</p>';
    grid.appendChild(viewDataCard);
}

// Select a scouting type (form only, no View Data tab)
async function selectScoutingType(type) {
    currentScoutingType = type;
    await loadFieldsConfig(type);
    renderForm();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scouting-interface').style.display = 'block';
    document.getElementById('view-data-section').style.display = 'none';
}

// Open View Data section (separate from form)
async function openViewDataSection(type) {
    currentScoutingType = type;
    await loadFieldsConfig(type);
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('scouting-interface').style.display = 'none';
    document.getElementById('view-data-section').style.display = 'block';

    const typeSelect = document.getElementById('view-data-type');
    typeSelect.innerHTML = '';
    Object.keys(scoutingTypesList).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = scoutingTypesList[key].name;
        if (key === type) opt.selected = true;
        typeSelect.appendChild(opt);
    });
    updateAuthUI();
    await checkAuth();
    loadData();
    window.history.replaceState({}, '', getViewDataUrl());
}

function onViewDataTypeChange() {
    const type = document.getElementById('view-data-type').value;
    currentScoutingType = type;
    loadFieldsConfig(type).then(() => loadData());
    window.history.replaceState({}, '', getViewDataUrl());
}

// Show main menu
function showMainMenu() {
    currentScoutingType = null;
    document.getElementById('main-menu').style.display = 'block';
    document.getElementById('scouting-interface').style.display = 'none';
    document.getElementById('view-data-section').style.display = 'none';
    window.history.replaceState({}, '', window.location.pathname || '/');
}

// Load field configuration from server
async function loadFieldsConfig(type) {
    try {
        const response = await fetch(`${API_BASE}/fields/${type}`);
        const config = await response.json();
        fieldsConfig = config.fields || [];
    } catch (error) {
        console.error('Error loading fields config:', error);
        showMessage('Error loading form configuration', 'error');
    }
}

// Render form based on field configuration
function renderForm() {
    const formFields = document.getElementById('form-fields');
    formFields.innerHTML = '';

    fieldsConfig.forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = field.label;
        if (field.required) {
            label.innerHTML += ' <span style="color: red;">*</span>';
        }
        formGroup.appendChild(label);

        let input;
        
        switch (field.type) {
            case 'file':
                input = document.createElement('input');
                input.type = 'file';
                input.id = field.id;
                input.accept = field.accept || '*/*';
                input.onchange = (e) => handleFileUpload(e, field.id);
                
                const previewContainer = document.createElement('div');
                previewContainer.id = `${field.id}-preview`;
                previewContainer.style.marginTop = '10px';
                formGroup.appendChild(input);
                formGroup.appendChild(previewContainer);
                formFields.appendChild(formGroup);
                return;
                
            case 'select':
                input = document.createElement('select');
                input.id = field.id;
                input.required = field.required || false;
                
                if (field.options) {
                    field.options.forEach(option => {
                        const optionEl = document.createElement('option');
                        optionEl.value = option;
                        optionEl.textContent = option;
                        input.appendChild(optionEl);
                    });
                }
                break;
                
            case 'textarea':
                input = document.createElement('textarea');
                input.id = field.id;
                input.required = field.required || false;
                input.placeholder = field.placeholder || '';
                break;
                
            case 'checkbox':
                const checkboxGroup = document.createElement('div');
                checkboxGroup.className = 'checkbox-group';
                input = document.createElement('input');
                input.type = 'checkbox';
                input.id = field.id;
                checkboxGroup.appendChild(input);
                const checkboxLabel = document.createElement('label');
                checkboxLabel.textContent = field.label;
                checkboxLabel.style.fontWeight = 'normal';
                checkboxLabel.style.marginBottom = '0';
                checkboxGroup.appendChild(checkboxLabel);
                formGroup.innerHTML = '';
                formGroup.appendChild(checkboxGroup);
                formFields.appendChild(formGroup);
                return;
                
            default:
                input = document.createElement('input');
                input.type = field.type || 'text';
                input.id = field.id;
                input.required = field.required || false;
                input.placeholder = field.placeholder || '';
        }

        formGroup.appendChild(input);
        formFields.appendChild(formGroup);
    });
}

// Handle file upload
async function handleFileUpload(event, fieldId) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            // Store file path in hidden input
            let hiddenInput = document.getElementById(`${fieldId}-hidden`);
            if (!hiddenInput) {
                hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.id = `${fieldId}-hidden`;
                document.getElementById(fieldId).parentElement.appendChild(hiddenInput);
            }
            hiddenInput.value = result.filePath;

            // Show preview
            const previewContainer = document.getElementById(`${fieldId}-preview`);
            if (previewContainer) {
                previewContainer.innerHTML = `
                    <img src="${result.filePath}" alt="Preview" class="image-preview">
                `;
            }
        } else {
            showMessage('Error uploading file', 'error');
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showMessage('Error uploading file', 'error');
    }
}

// Handle form submission
document.getElementById('scouting-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentScoutingType) {
        showMessage('No scouting type selected', 'error');
        return;
    }
    
    const formData = {};
    fieldsConfig.forEach(field => {
        if (field.type === 'file') {
            const hiddenInput = document.getElementById(`${field.id}-hidden`);
            if (hiddenInput) {
                formData[field.id] = hiddenInput.value;
            }
        } else {
            const input = document.getElementById(field.id);
            if (input) {
                if (field.type === 'checkbox') {
                    formData[field.id] = input.checked ? 1 : 0;
                } else {
                    formData[field.id] = input.value;
                }
            }
        }
    });

    try {
        const response = await fetch(`${API_BASE}/submit/${currentScoutingType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Scouting data saved successfully!', 'success');
            document.getElementById('scouting-form').reset();
            // Clear file previews
            fieldsConfig.forEach(field => {
                if (field.type === 'file') {
                    const previewContainer = document.getElementById(`${field.id}-preview`);
                    if (previewContainer) {
                        previewContainer.innerHTML = '';
                    }
                    const hiddenInput = document.getElementById(`${field.id}-hidden`);
                    if (hiddenInput) {
                        hiddenInput.remove();
                    }
                }
            });
            // Auto-refresh data if on view tab
            if (document.getElementById('view-tab').classList.contains('active')) {
                loadData();
            }
        } else {
            showMessage(result.error || 'Failed to save data', 'error');
            if (result.missingFields) {
                showMessage(`Missing required fields: ${result.missingFields.join(', ')}`, 'error');
            }
        }
    } catch (error) {
        console.error('Error submitting form:', error);
        showMessage('Error connecting to server. Make sure the server is running.', 'error');
    }
});

// Load and display data
async function loadData() {
    if (!currentScoutingType) return;
    
    const container = document.getElementById('data-container');
    container.innerHTML = '<p class="loading">Loading data...</p>';

    try {
        const response = await fetch(`${API_BASE}/data/${currentScoutingType}?sortBy=${currentSortColumn}&sortOrder=${currentSortOrder}`);
        const data = await response.json();

        if (data.length === 0) {
            container.innerHTML = '<p class="empty-state">No scouting data yet. Start scouting to see data here!</p>';
            return;
        }

        // Create table
        const table = document.createElement('table');
        table.className = 'data-table';

        // Create header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Add timestamp header
        const timestampHeader = document.createElement('th');
        timestampHeader.textContent = 'Timestamp';
        timestampHeader.className = 'sortable';
        timestampHeader.onclick = () => sortData('timestamp');
        if (currentSortColumn === 'timestamp') {
            timestampHeader.className += ` sort-${currentSortOrder}`;
        }
        headerRow.appendChild(timestampHeader);

        // Add field headers
        fieldsConfig.forEach(field => {
            const th = document.createElement('th');
            th.textContent = field.label;
            
            if (field.sortable) {
                th.className = 'sortable';
                th.onclick = () => sortData(field.id);
                if (currentSortColumn === field.id) {
                    th.className += ` sort-${currentSortOrder}`;
                }
            }
            
            headerRow.appendChild(th);
        });

        // Add actions header (only when allowed to edit)
        if (canEditData) {
            const actionsHeader = document.createElement('th');
            actionsHeader.textContent = 'Actions';
            headerRow.appendChild(actionsHeader);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create body
        const tbody = document.createElement('tbody');
        data.forEach(row => {
            const tr = document.createElement('tr');

            // Timestamp cell
            const timestampCell = document.createElement('td');
            const date = new Date(row.timestamp);
            timestampCell.textContent = date.toLocaleString();
            tr.appendChild(timestampCell);

            // Field cells
            fieldsConfig.forEach(field => {
                const td = document.createElement('td');
                let value = row[field.id];
                
                if (field.type === 'file' && value) {
                    td.className = 'image-cell';
                    // Ensure image path is relative to current origin
                    const imageSrc = value.startsWith('http') ? value : (value.startsWith('/') ? value : `/${value}`);
                    td.innerHTML = `<img src="${imageSrc}" alt="Robot" onerror="this.style.display='none'">`;
                } else {
                    if (value === null || value === undefined) {
                        value = '-';
                    } else if (field.type === 'checkbox') {
                        value = value ? 'Yes' : 'No';
                    }
                    td.textContent = value;
                }
                
                tr.appendChild(td);
            });

            // Actions cell (only when allowed to edit)
            if (canEditData) {
                const actionsCell = document.createElement('td');
                actionsCell.className = 'actions-cell';
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-secondary';
                editBtn.style.marginRight = '8px';
                editBtn.textContent = 'Edit';
                editBtn.onclick = () => openEditModal(row);
                actionsCell.appendChild(editBtn);
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.onclick = () => deleteEntry(row.id);
                actionsCell.appendChild(deleteBtn);
                tr.appendChild(actionsCell);
            }

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        container.innerHTML = '';
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'data-table-scroll-wrapper';
        scrollWrapper.appendChild(table);
        container.appendChild(scrollWrapper);
    } catch (error) {
        console.error('Error loading data:', error);
        container.innerHTML = '<p class="empty-state" style="color: #e74c3c;">Error loading data. Make sure the server is running.</p>';
    }
}

// Sort data
function sortData(column) {
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortOrder = 'asc';
    }
    loadData();
}

let editingRowId = null;

function openEditModal(row) {
    editingRowId = row.id;
    const container = document.getElementById('edit-form-fields');
    container.innerHTML = '';
    fieldsConfig.forEach(field => {
        if (field.type === 'file') {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = field.label;
            formGroup.appendChild(label);
            const input = document.createElement('input');
            input.type = 'file';
            input.id = 'edit-' + field.id;
            input.accept = field.accept || '*/*';
            formGroup.appendChild(input);
            const preview = document.createElement('div');
            preview.id = 'edit-' + field.id + '-preview';
            if (row[field.id]) {
                const img = document.createElement('img');
                img.src = row[field.id].startsWith('/') ? row[field.id] : '/' + row[field.id];
                img.className = 'image-preview';
                img.onerror = () => { img.style.display = 'none'; };
                preview.appendChild(img);
            }
            formGroup.appendChild(preview);
            container.appendChild(formGroup);
            return;
        }
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = field.label;
        formGroup.appendChild(label);
        let input;
        if (field.type === 'select') {
            input = document.createElement('select');
            input.id = 'edit-' + field.id;
            (field.options || []).forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                if (row[field.id] === opt) o.selected = true;
                input.appendChild(o);
            });
        } else if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.id = 'edit-' + field.id;
            input.value = row[field.id] || '';
        } else if (field.type === 'checkbox') {
            const wrap = document.createElement('div');
            wrap.className = 'checkbox-group';
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = 'edit-' + field.id;
            input.checked = !!row[field.id];
            wrap.appendChild(input);
            const lbl = document.createElement('label');
            lbl.textContent = field.label;
            lbl.style.fontWeight = 'normal';
            wrap.appendChild(lbl);
            formGroup.appendChild(wrap);
            container.appendChild(formGroup);
            return;
        } else {
            input = document.createElement('input');
            input.type = field.type || 'text';
            input.id = 'edit-' + field.id;
            input.value = row[field.id] != null ? row[field.id] : '';
        }
        formGroup.appendChild(input);
        container.appendChild(formGroup);
    });
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    editingRowId = null;
    document.getElementById('edit-modal').style.display = 'none';
}

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingRowId || !currentScoutingType) return;
    const formData = {};
    for (const field of fieldsConfig) {
        const input = document.getElementById('edit-' + field.id);
        if (!input) continue;
        if (field.type === 'file') {
            if (input.files && input.files[0]) {
                const fd = new FormData();
                fd.append('file', input.files[0]);
                const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd, credentials: 'include' });
                const data = await res.json();
                if (data.filePath) formData[field.id] = data.filePath;
            } else {
                const row = await fetch(`${API_BASE}/data/${currentScoutingType}/${editingRowId}`).then(r => r.json()).catch(() => ({}));
                formData[field.id] = row[field.id] || null;
            }
        } else {
            formData[field.id] = field.type === 'checkbox' ? (input.checked ? 1 : 0) : input.value;
        }
    }
    try {
        const res = await fetch(`${API_BASE}/data/${currentScoutingType}/${editingRowId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            credentials: 'include'
        });
        const result = await res.json();
        if (res.ok) {
            showMessage('Entry updated successfully', 'success');
            closeEditModal();
            loadData();
        } else {
            showMessage(result.error || 'Failed to update entry', 'error');
            if (res.status === 403) await checkAuth();
        }
    } catch (err) {
        showMessage('Error connecting to server', 'error');
    }
});

// Delete entry
async function deleteEntry(id) {
    if (!confirm('Are you sure you want to delete this entry?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/data/${currentScoutingType}/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('Entry deleted successfully', 'success');
            loadData();
        } else {
            showMessage(result.error || 'Failed to delete entry', 'error');
            if (response.status === 403) await checkAuth();
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
        showMessage('Error connecting to server', 'error');
    }
}

// Show message (form or view-data section)
function showMessage(message, type) {
    const messageEl = document.getElementById('data-message') || document.getElementById('form-message');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.className = type;
    messageEl.style.display = 'block';
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 5000);
}

// Initialize on page load
init();
