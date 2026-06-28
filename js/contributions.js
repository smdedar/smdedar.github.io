// Configuration for graph rendering
const GRAPH_CONFIG = {
    days: 365,
    levels: [
        { min: 0, max: 0, color: '#1f2937' }, // Empty (gray-800)
        { min: 1, max: 3, color: '#0e4429' }, // Low (dark green)
        { min: 4, max: 6, color: '#006d32' }, // Medium
        { min: 7, max: 10, color: '#26a641' }, // High
        { min: 11, max: 999, color: '#39d353' } // Very High (neon green)
    ],
    // GitHub Light Mode Theme Colors
    techColors: [
        { min: 0, max: 0, color: '#ebedf0' },
        { min: 1, max: 3, color: '#9be9a8' },
        { min: 4, max: 6, color: '#40c463' },
        { min: 7, max: 10, color: '#30a14e' },
        { min: 11, max: 999, color: '#216e39' }
    ]
};

async function fetchContributionData() {
    const contributionMap = new Map(); // Date -> Count

    // Helper to add contribution
    const addContr = (date, count) => {
        const current = contributionMap.get(date) || 0;
        contributionMap.set(date, current + count);
    };

    const promises = contributionSources.map(async (source) => {
        try {
            if (source.type === 'github') {
                // Use jogruber's public proxy
                const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${source.username}?y=last`);
                if (!res.ok) throw new Error('GitHub Fetch Failed');
                const data = await res.json();

                // GitHub API returns structured data "contributions"
                if (data.contributions) {
                    data.contributions.forEach(day => {
                        addContr(day.date, day.count);
                    });
                }
            } else if (source.type === 'gitlab') {
                // Try GitLab public calendar endpoint
                // Note: This might be blocked by CORS on some browsers/setups.
                // If it fails, we catch the error and count is 0.
                const res = await fetch(`https://gitlab.com/users/${source.username}/calendar.json`);
                if (!res.ok) throw new Error('GitLab Fetch Failed');
                const data = await res.json();

                // GitLab returns { "YYYY-MM-DD": count, ... }
                Object.entries(data).forEach(([date, count]) => {
                    addContr(date, count);
                });
            }
        } catch (error) {
            console.warn(`Failed to fetch contributions for ${source.type} user ${source.username}:`, error);
        }
    });

    await Promise.all(promises);
    return contributionMap;
}

function renderContributionGraph(contributionMap) {
    const container = document.getElementById('contribution-graph');
    if (!container) return; // Guard clause

    container.innerHTML = '';

    // Create Grid Container
    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'overflow-x-auto pb-2 scrollbar-hide flex justify-center';
    gridWrapper.style.scrollbarWidth = 'none'; // Firefox
    gridWrapper.style.msOverflowStyle = 'none'; // IE/Edge

    // Add internal style for hiding webkit scrollbar
    const style = document.createElement('style');
    style.textContent = `
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .graph-tooltip {
            position: absolute;
            background: #24292e;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000;
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.2s;
        }
    `;
    container.appendChild(style);

    // 0. Hero Count-Up: Total contributions over the last 12 months
    // The contributionMap holds exactly one year of data (jogruber `y=last`),
    // so the total is simply the sum of every day's count.
    let totalContributions = 0;
    contributionMap.forEach(count => {
        totalContributions += count;
    });

    const hero = document.createElement('div');
    hero.className = 'flex items-baseline justify-center gap-1.5 mb-3 select-none text-[11px] uppercase tracking-[0.2em] font-mono text-gray-500 font-bold';
    hero.innerHTML = `
        <span id="contrib-total" class="tabular-nums text-gray-900">0</span>
        <span>Commits &middot; Last 12 Months</span>
    `;
    container.appendChild(hero);

    // Animate the number from 0 -> total with an ease-out curve
    animateCountUp(hero.querySelector('#contrib-total'), totalContributions);

    const grid = document.createElement('div');
    grid.className = 'flex flex-col gap-1';

    // 1. Generate Dates
    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    // Adjust start date to be a Sunday to align weeks properly
    const dayOfWeek = oneYearAgo.getDay();
    oneYearAgo.setDate(oneYearAgo.getDate() - dayOfWeek);

    const dates = [];
    let d = new Date(oneYearAgo);

    // We want to generate full weeks until we hit today
    while (d <= today || d.getDay() !== 0) {
        dates.push(new Date(d));
        d.setDate(d.getDate() + 1);
    }

    // Group by week
    const weeks = [];
    let currentWeek = [];
    dates.forEach(date => {
        currentWeek.push(date);
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });

    // 2. Render Months Row (Top Axis)
    const monthsContainer = document.createElement('div');
    monthsContainer.className = 'flex gap-1 mb-1 text-xs text-gray-400 font-bold font-mono';

    let lastMonth = -1;
    weeks.forEach((week, index) => {
        // Space holder for the week column
        const label = document.createElement('div');
        label.className = 'w-3 text-center'; // Match width of week column (w-3)
        // Check if this week starts a new month
        const firstDay = week[0];
        const month = firstDay.getMonth();

        if (month !== lastMonth) {
            // Show month name
            const monthName = firstDay.toLocaleString('default', { month: 'short' });
            label.textContent = monthName;
            // label.style.width = 'auto'; // REMOVED to prevent grid shift
            label.className = 'w-3 text-center overflow-visible whitespace-nowrap relative z-10'; // visible overflow
            lastMonth = month;
        }
        monthsContainer.appendChild(label);
    });
    grid.appendChild(monthsContainer);

    // 3. Render Graph Grid
    const weeksContainer = document.createElement('div');
    weeksContainer.className = 'flex gap-1';

    // Tooltip Element
    const tooltip = document.createElement('div');
    tooltip.className = 'graph-tooltip';
    document.body.appendChild(tooltip);

    weeks.forEach(week => {
        const col = document.createElement('div');
        col.className = 'flex flex-col gap-1';

        week.forEach(date => {
            const cell = document.createElement('div');
            // Base style
            cell.className = 'w-3 h-3 rounded-sm transition-all duration-300';

            // Only render valid dates (should be all now with full weeks)
            const dateStr = date.toISOString().split('T')[0];
            const count = contributionMap.get(dateStr) || 0;

            // Determine color from CONFIG
            const colorObj = GRAPH_CONFIG.techColors.find(l => count >= l.min && count <= l.max) || GRAPH_CONFIG.techColors[GRAPH_CONFIG.techColors.length - 1];

            cell.style.backgroundColor = colorObj.color;

            // Hover Interaction
            cell.addEventListener('mouseenter', (e) => {
                const rect = cell.getBoundingClientRect();
                tooltip.textContent = `${count} contributions on ${dateStr}`; // Short date format on tooltips
                tooltip.style.left = `${rect.left + window.scrollX - (tooltip.offsetWidth / 2) + 6}px`;
                tooltip.style.top = `${rect.top + window.scrollY - 30}px`;
                tooltip.style.opacity = '1';

                // Highlight cell
                cell.style.border = '1px solid rgba(0,0,0,0.5)';
            });

            cell.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
                cell.style.border = 'none';
            });

            col.appendChild(cell);
        });

        weeksContainer.appendChild(col);
    });

    grid.appendChild(weeksContainer);
    gridWrapper.appendChild(grid);
    container.appendChild(gridWrapper);

    // 4. Render Compact Statistics
    const stats = calculateStats(contributionMap);
    const statsContainer = document.createElement('div');
    statsContainer.className = 'flex flex-wrap gap-x-4 gap-y-1 justify-center px-1 mt-2 text-[10px] uppercase tracking-widest font-mono text-gray-600 font-bold transition-colors';

    // Helper for shorter stats
    const createStat = (label, value) => {
        const el = document.createElement('div');
        el.innerHTML = `<span class="mr-1 font-semibold text-gray-500">${label}</span><span class="font-bold text-gray-600">${value}</span>`;
        return el;
    };

    statsContainer.appendChild(createStat('L.W.', stats.last7));
    statsContainer.appendChild(createStat('L.M.', stats.last30));
    statsContainer.appendChild(createStat('L.3M.', stats.last90));
    statsContainer.appendChild(createStat('C.S.', `${stats.currentStreak}d`));
    statsContainer.appendChild(createStat('M.S.', `${stats.maxStreak}d`));

    container.appendChild(statsContainer);
}

function animateCountUp(el, target, duration = 1400) {
    if (!el) return;
    if (target <= 0) {
        el.textContent = '0';
        return;
    }

    const start = performance.now();
    // Ease-out cubic for a snappy finish
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    const tick = now => {
        const progress = Math.min((now - start) / duration, 1);
        const value = Math.floor(easeOut(progress) * target);
        el.textContent = value.toLocaleString();
        if (progress < 1) {
            requestAnimationFrame(tick);
        } else {
            el.textContent = target.toLocaleString();
        }
    };

    requestAnimationFrame(tick);
}

function calculateStats(contributionMap) {
    const today = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    let last7 = 0;
    let last30 = 0;
    let last90 = 0;

    // Calculate totals
    contributionMap.forEach((count, dateStr) => {
        const date = new Date(dateStr);
        const diffTime = Math.abs(today - date);
        const diffDays = Math.ceil(diffTime / oneDay);

        if (diffDays <= 7) last7 += count;
        if (diffDays <= 30) last30 += count;
        if (diffDays <= 90) last90 += count;
    });

    // Calculate Streaks
    // We need dates sorted
    const sortedDates = Array.from(contributionMap.keys()).sort();

    // Convert to set for O(1) lookups
    const activeDates = new Set(sortedDates.filter(d => contributionMap.get(d) > 0));

    // Max Streak
    let maxStreak = 0;
    let currentTempStreak = 0;

    // Sort logic requires real dates for accurate consecutive check
    // But since we built the map using "all dates" in fetchContributionData? 
    // Wait, fetchContributionData only adds existing contributions. 
    // We need to iterate "all possible days in range" to be 100% strict about gaps,
    // OR we just sort the active dates and check if difference is 1 day.

    // Better Approach: Iterate backwards from today for Current Streak
    let currentStreak = 0;
    let d = new Date(today);
    while (true) {
        const dateStr = d.toISOString().split('T')[0];
        if (contributionMap.get(dateStr) > 0) {
            currentStreak++;
            d.setDate(d.getDate() - 1);
        } else {
            // Check if it's today and 0, maybe they haven't committed YET today, 
            // so give a grace period if the previous day was active? 
            // Standard logic: if today is 0, streak might be broke UNLESS yesterday was active.
            // If we are on "Today" and it's 0, we continue to check yesterday.
            if (dateStr === today.toISOString().split('T')[0]) {
                d.setDate(d.getDate() - 1);
                continue;
            }
            break;
        }
    }

    // Calculate Max Streak efficiently
    // We iterate through all sorted keys
    // This is "days with contributions". If we have gaps, the difference in days > 1.
    if (sortedDates.length > 0) {
        let tempStreak = 0;
        let prevDate = null;

        // We only care about dates WITH contributions
        const datesWithContr = sortedDates.filter(d => contributionMap.get(d) > 0).map(d => new Date(d));

        if (datesWithContr.length > 0) {
            tempStreak = 1;
            maxStreak = 1;

            for (let i = 1; i < datesWithContr.length; i++) {
                const prev = datesWithContr[i - 1];
                const curr = datesWithContr[i];
                const diff = (curr - prev) / oneDay;

                if (Math.round(diff) === 1) {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                }
                if (tempStreak > maxStreak) maxStreak = tempStreak;
            }
        }
    }

    return { last7, last30, last90, currentStreak, maxStreak };
}

// Initial Run
document.addEventListener('DOMContentLoaded', async () => {
    const contributionMap = await fetchContributionData();
    renderContributionGraph(contributionMap);
});
