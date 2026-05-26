/** Sora Module Template
 * This template is designed to help you create a module for Sora.
 * It includes functions for searching, extracting details, episodes, and stream URLs.
 * You can modify these functions to suit your needs.
 * 
 * For more information, visit the Sora documentation at https://sora.jm26.net/docs
 */


/** searchResults
 * Searches for anime/shows/movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
    try {
        const headers = {
            'Host': 'reanime.to',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Alt-Used': 'reanime.to',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };
        const search_base = 'https://reanime.to/api/search?limit=36&q='
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`${search_base}${encodedKeyword}`, headers);
        const data = JSON.parse(responseText);

        const transformedResults = data.results.map(anime => ({
            title: anime.title.english,
            image: anime.cover_image.large,
            href: `https://reanime.to/anime/${anime.anime_id}`
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

/** extractDetails
 * Extracts details of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime details.
 */
async function extractDetails(url) {
    try {
        const headers = {
            'Host': 'reanime.to',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Alt-Used': 'reanime.to',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };
        const response = await soraFetch(url, headers);
        console.log(response)
        const html = await response.text();
        
        const descriptionRegex = /"description":"([^"]+)"/i;
        const durationRegex = /"duration":(\d+)/i;
        const synonymsRegex = /"synonyms":(\[[^\]]+\])/i;
        const formatRegex = /"format":"([^"]+)"/i

        const descriptionMatch = html.match(descriptionRegex);
        const durationMatch = html.match(durationRegex);
        const synonymsMatch = html.match(synonymsRegex);
        const formatMatch = html.match(formatRegex);

        let description = 'No description available';
        if (descriptionMatch) {
            description = descriptionMatch[1]
                .replace(/\\n/g, '\n')       // Convert literal escaped \n to real newlines
                .replace(/\\u003Cbr>/g, '')  // Strip custom Svelte HTML line break tags (<br>)
                .replace(/\\"/g, '"');       // Clean up escaped quotation marks
        }

        let durationStr = 'Duration: Unknown';
        if (durationMatch) {
            durationStr = 'Duration: ' + durationMatch[1] + ' min';
        }

        let aliasStr = 'Aliases: N/A';
        if (synonymsMatch) {
            try {
                const aliasesArray = JSON.parse(synonymsMatch[1]);
                if (aliasesArray && aliasesArray.length > 0) {
                    aliasStr = 'Also Known As: ' + aliasesArray.join(', ');
                }
            } catch (jsonErr) {
                console.log('Failed parsing synonyms array:', jsonErr);
            }
        }

        let isMovie = formatMatch && formatMatch[1].includes("ovie");

        const transformedResults = [{
            description: description,
            aliases: aliasStr,
            airdate: `${durationStr} ${isMovie ? "mins" : "eps"}`
        }];
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
        description: 'Error loading description',
        aliases: 'Duration: Unknown',
        airdate: 'Aired: Unknown'
        }]);
  }
}

/** extractEpisodes
 * Extracts episodes of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime episodes.
 */
async function extractEpisodes(url) {
    try {
        const match = url.match(/https:\/\/your-source\.com\/watch\/(.+)$/);
        const encodedID = match[1];
        const response = await soraFetch(`https://api.your-source.com/anime/${encodedID}/episodes`);
        const data = JSON.parse(response);

        const transformedResults = data.data.episodes.map(episode => ({
            href: `https://your-source.com/watch/${encodedID}?ep=${episode.episodeId.split('?ep=')[1]}`,
            number: episode.number
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Fetch error:', error);
    }    
}

/** extractStreamUrl
 * Extracts the stream URL of an anime episode from its page URL.
 * @param {string} url - The URL of the anime episode page.
 * @returns {Promise<string|null>} - The stream URL or null if not found.
 */
async function extractStreamUrl(url) {
    try {
       const match = url.match(/https:\/\/your-source\.com\/watch\/(.+)$/);
       const encodedID = match[1];
       const response = await soraFetch(`https://api.your-source.com/episode/sources?animeEpisodeId=${encodedID}&category=dub`);
       const data = JSON.parse(response);
       
       const hlsSource = data.data.sources.find(source => source.type === 'hls');
       
       return hlsSource ? hlsSource.url : null;
    } catch (error) {
       console.log('Fetch error:', error);
       return null;
    }
}


/** Fetch function that tries to use a custom fetch implementation first,
 * and falls back to the native fetch if it fails.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The options for the fetch request.
 * @returns {Promise<Response|null>} - The response object or null if an error occurs.
 * @note This function is designed to provide Node.js compatibility
 */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            await console.log('soraFetch error: ' + error.message);
            return null;
        }
    }
}