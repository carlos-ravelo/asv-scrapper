export function createEloChart(ctx, existingChart, chartData, maintainAspectRatio = true) {
    // 1. Destruir la instancia si la tenemos en nuestra variable
    if (existingChart) {
        existingChart.destroy();
    }
    
    // 2. FORZAR la destrucción en el registro interno de Chart.js
    // Esto mata cualquier gráfico fantasma atascado en el canvas
    const canvasChart = Chart.getChart(ctx.canvas);
    if (canvasChart) {
        canvasChart.destroy();
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