export function createEloChart(ctx, existingChart, chartData, maintainAspectRatio = true) {
    if (existingChart) {
        existingChart.destroy();
    }
    return new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: maintainAspectRatio,
            scales: {
                y: { beginAtZero: false }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            }
        }
    });
}
