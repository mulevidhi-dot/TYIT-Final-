let currentUser = null;

// Check local storage safely on load
try {
    const storedUser = localStorage.getItem('nutri_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
    }
} catch (e) {
    localStorage.removeItem('nutri_user');
}

let isRegisterMode = false;

// 1. Authentication UI Switcher
function checkAuth() {
    const authScreen = document.getElementById('authScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');

    if (currentUser && currentUser.id) {
        if (authScreen) authScreen.style.display = 'none';
        if (dashboardScreen) dashboardScreen.style.display = 'block';
        
        const userDisplay = document.getElementById('currentUserDisplay');
        if (userDisplay) userDisplay.innerText = currentUser.username;
        
        loadData();
    } else {
        if (authScreen) authScreen.style.display = 'block';
        if (dashboardScreen) dashboardScreen.style.display = 'none';
    }
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').innerText = isRegisterMode ? 'Register New Account' : 'Login to NutriCare';
    document.getElementById('authBtn').innerText = isRegisterMode ? 'Register' : 'Login';
    document.getElementById('authToggleText').innerText = isRegisterMode ? 'Already have an account? Login' : 'Need an account? Register here';
}

// 2. Login / Register Submission
async function handleAuth() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) return alert('Please enter both username and password.');

    const endpoint = isRegisterMode ? '/api/register' : '/api/login';
    
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();
        if (res.ok) {
            currentUser = data;
            localStorage.setItem('nutri_user', JSON.stringify(data));
            checkAuth();
        } else {
            alert(data.error || 'Authentication failed');
        }
    } catch (err) {
        console.error('Auth error:', err);
        alert('Server connection error.');
    }
}

function logout() {
    localStorage.removeItem('nutri_user');
    currentUser = null;
    checkAuth();
}

// 3. Save Today's Health Data
async function saveData() {
    if (!currentUser || !currentUser.id) return alert('Please login first!');

    let water = Number(document.getElementById("water").value);
    let meals = Number(document.getElementById("meals").value);
    let exercise = Number(document.getElementById("exercise").value);
    let sleep = Number(document.getElementById("sleep").value);
    let meal = document.getElementById("meal").value.trim();
    
    if (!water || !meals || !exercise || !sleep || !meal) {
        return alert("Please fill out all fields.");
    }

    try {
        const response = await fetch('/api/health', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, water, meals, exercise, sleep, meal })
        });

        if (response.ok) {
            alert("Health data saved successfully!");
            window.location.href = "index.html";
        } else {
            alert("Failed to save health data.");
        }
    } catch (err) {
        console.error("Save error:", err);
    }
}

// 4. Load Dashboard Data
async function loadData() {
    if (!currentUser || !currentUser.id) return;

    // Load BMR & Chart alongside dashboard elements
    loadUserProfile();
    renderWeeklyChart();

    try {
        const response = await fetch(`/api/health/today/${currentUser.id}`);
        const data = await response.json();
        
        const water = (data && data.water) ? Number(data.water) : 0;
        const meals = (data && data.meals) ? Number(data.meals) : 0;
        const exercise = (data && data.exercise) ? Number(data.exercise) : 0;
        const sleep = (data && data.sleep) ? Number(data.sleep) : 0;
        const meal = (data && data.meal) ? data.meal : "No meal logged";

        if (document.getElementById("waterValue")) document.getElementById("waterValue").textContent = water + " / 8 glasses";
        if (document.getElementById("mealsValue")) document.getElementById("mealsValue").textContent = meals + " / 3 meals";
        if (document.getElementById("exerciseValue")) document.getElementById("exerciseValue").textContent = exercise + " minutes";
        if (document.getElementById("sleepValue")) document.getElementById("sleepValue").textContent = sleep + " hours";
        if (document.getElementById("mealValue")) document.getElementById("mealValue").textContent = meal;

        let waterScore = Math.min(water / 8, 1) * 25;
        let mealScore = Math.min(meals / 3, 1) * 25;
        let exerciseScore = Math.min(exercise / 30, 1) * 25;
        let sleepScore = Math.min(sleep / 8, 1) * 25;

        let totalScore = Math.round(waterScore + mealScore + exerciseScore + sleepScore);

        const scoreElement = document.getElementById("healthScore");
        if (scoreElement) {
            scoreElement.textContent = totalScore + "%";
        }

    } catch (err) {
        console.error("Error loading dashboard data:", err);
    }
}

// 5. Run on Page Load
window.onload = function() {
    checkAuth();

    let tips = [
        "Drink enough water throughout the day to stay hydrated.",
        "Include fruits and vegetables in your daily meals.",
        "Try to get around 7 to 8 hours of sleep every night.",
        "Take short breaks and stay physically active during the day.",
        "Choose healthy and balanced meals whenever possible."
    ];
    let tipElement = document.getElementById("healthTip");
    if (tipElement) {
        tipElement.textContent = tips[Math.floor(Math.random() * tips.length)];
    }
};

// 6. Load User History Logs
async function loadHistory() {
    if (!currentUser || !currentUser.id) {
        window.location.href = "index.html";
        return;
    }

    try {
        const response = await fetch(`/api/health/history/${currentUser.id}`);
        const logs = await response.json();

        const tableBody = document.getElementById("historyTableBody");
        if (!tableBody) return;

        if (logs.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No saved logs found.</td></tr>`;
            return;
        }

        tableBody.innerHTML = logs.map(log => `
            <tr>
                <td><strong>${log.date}</strong></td>
                <td>${log.water} / 8 glasses</td>
                <td>${log.meals} / 3 meals</td>
                <td>${log.exercise} mins</td>
                <td>${log.sleep} hrs</td>
                <td>${log.meal || 'No meal logged'}</td>
                <td><span class="badge-macro">${log.calories || 0} kcal (P:${log.protein || 0}g, C:${log.carbs || 0}g, F:${log.fat || 0}g)</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Error loading history:", err);
    }
}

// 7. BMR Modal Functions
function openProfileModal() {
    document.getElementById('profileModal').style.display = 'flex';
    loadUserProfile();
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

async function loadUserProfile() {
    if (!currentUser || !currentUser.id) return;

    try {
        const res = await fetch(`/api/user/profile/${currentUser.id}`);
        const data = await res.json();

        if (data) {
            if (data.age) document.getElementById('age').value = data.age;
            if (data.gender) document.getElementById('gender').value = data.gender;
            if (data.weight) document.getElementById('weight').value = data.weight;
            if (data.height) document.getElementById('height').value = data.height;
            if (data.bmr) updateBMRDisplay(data.bmr);
        }
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

async function saveProfile(event) {
    event.preventDefault();
    if (!currentUser || !currentUser.id) return;

    const profileData = {
        userId: currentUser.id,
        age: parseInt(document.getElementById('age').value),
        gender: document.getElementById('gender').value,
        weight: parseFloat(document.getElementById('weight').value),
        height: parseFloat(document.getElementById('height').value)
    };

    try {
        const res = await fetch('/api/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        const data = await res.json();

        if (res.ok) {
            updateBMRDisplay(data.bmr);
            closeProfileModal();
            alert('BMR Profile Updated!');
        } else {
            alert(data.error || 'Failed to update profile.');
        }
    } catch (err) {
        alert('Server connection error.');
    }
}

function updateBMRDisplay(bmrValue) {
    const bmrElem = document.getElementById('bmrDisplay');
    if (bmrElem) {
        bmrElem.textContent = `${bmrValue.toLocaleString()} kcal/day`;
    }
}

// 8. Weekly Chart Rendering
let healthChart = null;

async function renderWeeklyChart() {
    if (!currentUser || !currentUser.id) return;

    try {
        const res = await fetch(`/api/health/weekly/${currentUser.id}`);
        const data = await res.json();

        const labels = data.map(item => item.date);
        const waterData = data.map(item => item.water);
        const sleepData = data.map(item => item.sleep);
        const calorieData = data.map(item => item.calories);

        const chartCanvas = document.getElementById('weeklyChart');
        if (!chartCanvas) return;

        const ctx = chartCanvas.getContext('2d');

        if (healthChart) {
            healthChart.destroy();
        }

        healthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Water (Glasses)',
                        data: waterData,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Sleep (Hours)',
                        data: sleepData,
                        borderColor: '#9c27b0',
                        backgroundColor: 'rgba(156, 39, 176, 0.1)',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Calories (kcal)',
                        data: calorieData,
                        borderColor: '#4caf70',
                        backgroundColor: 'rgba(76, 175, 112, 0.1)',
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Water / Sleep' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Calories (kcal)' }
                    }
                }
            }
        });
    } catch (err) {
        console.error('Error rendering chart:', err);
    }
}