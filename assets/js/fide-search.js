// Name search only; this does not identify or verify a FIDE profile.
export function fideSearchName(name) {
    const [surname, ...rest] = name.trim().split(',');
    if (!rest.length) return surname;
    const given = rest.join(',').match(/\(([^)]+)\)/)?.[1];
    return given ? `${surname} ${given}` : surname;
}

export function createFideSearchLink(name) {
    const link = document.createElement('a');
    link.className = 'fide-search-link';
    link.href = `https://ratings.fide.com/index.phtml?search=${encodeURIComponent(fideSearchName(name))}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = `Search FIDE for ${name} (opens in a new tab)`;
    link.setAttribute('aria-label', link.title);
    const logo = document.createElement('img');
    // Official logo: https://ratings.fide.com/img/logo1.png
    logo.src = new URL('../img/fide-logo.png', import.meta.url).href;
    logo.alt = '';
    logo.width = 23;
    logo.height = 16;
    link.appendChild(logo);
    return link;
}
