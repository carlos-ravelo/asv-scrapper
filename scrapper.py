import os
from io import StringIO
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

base_page_url = "https://www.asv-schaken.nl/interne-competitie/page/{}/"
results_csv = "asv_results.csv"
elo_csv = "asv_elo.csv"
max_pages = 10
max_workers = 8  # parallel HTTP requests
request_timeout = 30

# Some sites reject requests without a UA. Set a reasonable one.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; asv-scrapper/1.0; +https://github.com/)",
}

def get_processed_urls(file_path):
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return set()
    try:
        df = pd.read_csv(file_path)
    except pd.errors.EmptyDataError:
        return set()
    if 'Source_URL' not in df.columns:
        return set()
    return set(df['Source_URL'].dropna().unique())


def _date_from_wp_api(article_url):
    """Query the WordPress REST API by slug and return YYYY-MM-DD or None."""
    parsed = urlparse(article_url)
    slug = parsed.path.strip('/').split('/')[-1]
    if not slug:
        return None
    api_url = f"{parsed.scheme}://{parsed.netloc}/wp-json/wp/v2/posts"
    try:
        r = requests.get(
            api_url,
            params={'slug': slug, '_fields': 'date,date_gmt'},
            headers=HEADERS,
            timeout=request_timeout,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  [wp-api-error] {article_url}: {e}")
        return None
    if isinstance(data, list) and data:
        raw = data[0].get('date') or data[0].get('date_gmt')
        if raw:
            return raw.split('T')[0]
    return None


def extract_publish_date(article_soup, article_url):
    """Try multiple sources; return YYYY-MM-DD or None."""
    for prop in ('article:published_time', 'article:modified_time', 'og:updated_time'):
        tag = article_soup.find('meta', property=prop)
        if tag and tag.get('content'):
            return tag['content'].split('T')[0]

    for tag in article_soup.find_all('time'):
        if tag.get('datetime'):
            return tag['datetime'].split('T')[0]

    for tag in article_soup.find_all(attrs={'itemprop': ['datePublished', 'dateModified']}):
        val = tag.get('datetime') or tag.get('content') or tag.get_text(strip=True)
        if val:
            return val.split('T')[0]

    return _date_from_wp_api(article_url)


def scrape_article(article_url):
    """Return (results_df|None, elo_df|None). Never raises."""
    try:
        article_response = requests.get(article_url, headers=HEADERS, timeout=request_timeout)
        article_response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"  [fetch-error] {article_url}: {e}")
        return None, None

    article_soup = BeautifulSoup(article_response.text, 'html.parser')

    title_tag = article_soup.find('h1') or article_soup.find('title')
    post_title = title_tag.text.strip() if title_tag else 'Unknown Round'

    # Chess season starts in August/September
    publish_date_str = extract_publish_date(article_soup, article_url)

    if publish_date_str:
        try:
            date_obj = datetime.strptime(publish_date_str, '%Y-%m-%d')
            start_year = date_obj.year if date_obj.month >= 8 else date_obj.year - 1
            season = f"Season {str(start_year)[-2:]}/{str(start_year + 1)[-2:]}"
        except ValueError:
            publish_date_str = 'Unknown'
            season = 'Unknown Season'
    else:
        publish_date_str = 'Unknown'
        season = 'Unknown Season'

    try:
        tables = pd.read_html(StringIO(article_response.text))
    except ValueError:
        return None, None
    except Exception as e:
        print(f"  [parse-error] {article_url}: {e}")
        return None, None

    df_results = None
    df_elo = None
    if len(tables) >= 1:
        df_results = tables[0].copy()
        df_results['Source_URL'] = article_url
        df_results['Publish_Date'] = publish_date_str
    df_results = None
    df_elo = None

    for table in tables:
        # Convertimos los nombres de las columnas a texto limpio para evitar errores
        cols = [str(c).strip() for c in table.columns]
        table.columns = cols

        # 1. Detectar si es la tabla de Resultados (debe tener Blancas y Negras)
        if 'Witspeler' in cols and 'Zwartspeler' in cols:
            # Extraemos SOLO las columnas que nos importan
            df_results = table[['Witspeler', 'Zwartspeler', 'Uitslag']].copy()
            df_results['Source_URL'] = article_url
            df_results['Publish_Date'] = publish_date_str
            df_results['Post_Title'] = post_title
            df_results['Season'] = season

        # 2. Detectar si es la tabla de Posiciones/ELO (debe tener Nombre y alguna variante de Rating)
        elif 'Naam' in cols:
            rating_col = None
            if 'ELO' in cols: rating_col = 'ELO'
            elif 'Rating' in cols: rating_col = 'Rating'
            elif 'Rtg' in cols: rating_col = 'Rtg'

            if rating_col:
                # Extraemos SOLO el Nombre y el Rating
                df_elo = table[['Naam', rating_col]].copy()
                # Renombramos la columna de rating a 'ELO' para que todos los CSV sean idénticos
                df_elo.rename(columns={rating_col: 'ELO'}, inplace=True)
                df_elo['Source_URL'] = article_url
                df_elo['Publish_Date'] = publish_date_str
                df_elo['Season'] = season

    return df_results, df_elo

processed_results = get_processed_urls(results_csv)
processed_elo = get_processed_urls(elo_csv)

# Step 1: collect all candidate article URLs across index pages.
all_article_urls = set()
for page_num in range(1, max_pages + 1):
    print(f"Checking index page {page_num}...")
    try:
        page_response = requests.get(
            base_page_url.format(page_num), headers=HEADERS, timeout=request_timeout
        )
        page_response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching index page {page_num}: {e}")
        break

    soup = BeautifulSoup(page_response.text, 'html.parser')
    links = soup.find_all('a', href=True)
    page_urls = {
        link['href']
        for link in links
        if 'uitslagen-en-standen' in link['href'] or '-ronde-' in link['href']
    }
    print(f"  found {len(page_urls)} candidate article link(s) on page {page_num}")
    all_article_urls.update(page_urls)

# Step 2: keep only URLs missing from at least one of the CSVs.
pending_urls = [
    u for u in all_article_urls
    if u not in processed_results or u not in processed_elo
]
print(f"Total unique candidates: {len(all_article_urls)} | pending to scrape: {len(pending_urls)}")

# Step 3: scrape pending articles in parallel.
new_results = []
new_elo = []
if pending_urls:
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_url = {executor.submit(scrape_article, u): u for u in pending_urls}
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            df_results, df_elo = future.result()
            if df_results is not None and url not in processed_results:
                new_results.append(df_results)
                processed_results.add(url)
            if df_elo is not None and url not in processed_elo:
                new_elo.append(df_elo)
                processed_elo.add(url)
            print(f"  done: {url}")

# Append new data to base CSV files
if new_results:
    pd.concat(new_results, ignore_index=True).to_csv(
        results_csv,
        mode='a',
        header=not os.path.exists(results_csv) or os.path.getsize(results_csv) == 0,
        index=False,
    )
if new_elo:
    pd.concat(new_elo, ignore_index=True).to_csv(
        elo_csv,
        mode='a',
        header=not os.path.exists(elo_csv) or os.path.getsize(elo_csv) == 0,
        index=False,
    )

def csv_to_json(csv_path, json_path):
    if os.path.exists(csv_path) and os.path.getsize(csv_path) > 0:
        try:
            pd.read_csv(csv_path).to_json(json_path, orient="records", force_ascii=False)
            return
        except pd.errors.EmptyDataError:
            pass
    # Ensure the JSON file exists even when there's no data yet
    with open(json_path, 'w', encoding='utf-8') as f:
        f.write('[]')
    # Ensure the CSV file exists too, so subsequent runs don't have to special-case it
    if not os.path.exists(csv_path):
        open(csv_path, 'a').close()

csv_to_json(results_csv, "asv_results.json")
csv_to_json(elo_csv, "asv_elo.json")

print("Incremental update and JSON generation complete.")